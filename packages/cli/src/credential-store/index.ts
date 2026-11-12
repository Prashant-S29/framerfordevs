import { createHash } from "node:crypto";

import { AsyncEntry } from "@napi-rs/keyring";
import { Context, Effect, Layer, Schema } from "effect";

import { CredentialStoreUnavailableError, StoredCredentialInvalidError } from "../errors";

const serviceName = "framerfordevs-cli";
const maximumCredentialBytes = 32 * 1_024;

export class StoredOAuthAuthority extends Schema.Class<StoredOAuthAuthority>(
  "StoredOAuthAuthority",
)(
  Schema.Struct({
    version: Schema.Literal(1),
    accessToken: Schema.String.check(Schema.isMinLength(1), Schema.isMaxLength(16_384)),
    refreshToken: Schema.String.check(Schema.isMinLength(1), Schema.isMaxLength(16_384)),
    accessExpiresAtEpochSeconds: Schema.Number.check(
      Schema.isInt(),
      Schema.isGreaterThanOrEqualTo(0),
    ),
  }),
) {}

interface NativeEntry {
  readonly setPassword: (password: string) => Promise<void>;
  readonly getPassword: () => Promise<string | undefined>;
  readonly deletePassword: () => Promise<unknown>;
}

export interface CredentialStoreService {
  readonly save: (
    apiOrigin: string,
    authority: StoredOAuthAuthority,
  ) => Effect.Effect<void, CredentialStoreUnavailableError>;
  readonly load: (
    apiOrigin: string,
  ) => Effect.Effect<
    StoredOAuthAuthority | null,
    CredentialStoreUnavailableError | StoredCredentialInvalidError
  >;
  readonly remove: (apiOrigin: string) => Effect.Effect<void, CredentialStoreUnavailableError>;
}

function accountForOrigin(apiOrigin: string): string {
  const origin = new URL(apiOrigin).origin;
  return `origin-${createHash("sha256").update(origin, "utf8").digest("hex")}`;
}

export function makeCredentialStore(
  entryFactory: (service: string, account: string) => NativeEntry,
): CredentialStoreService {
  const entry = (apiOrigin: string) => entryFactory(serviceName, accountForOrigin(apiOrigin));
  return {
    save: (apiOrigin, authority) =>
      Effect.tryPromise({
        try: () => entry(apiOrigin).setPassword(JSON.stringify(authority)),
        catch: () => CredentialStoreUnavailableError.make(),
      }),
    load: (apiOrigin) =>
      Effect.gen(function* () {
        const value = yield* Effect.tryPromise({
          try: () => entry(apiOrigin).getPassword(),
          catch: () => CredentialStoreUnavailableError.make(),
        });
        if (value === undefined) return null;
        if (Buffer.byteLength(value, "utf8") > maximumCredentialBytes) {
          return yield* StoredCredentialInvalidError.make();
        }
        const parsed = yield* Effect.try({
          try: (): unknown => JSON.parse(value),
          catch: () => StoredCredentialInvalidError.make(),
        });
        return yield* Schema.decodeUnknownEffect(StoredOAuthAuthority, {
          onExcessProperty: "error",
        })(parsed).pipe(Effect.mapError(() => StoredCredentialInvalidError.make()));
      }),
    remove: (apiOrigin) =>
      Effect.tryPromise({
        try: async () => {
          const nativeEntry = entry(apiOrigin);
          if ((await nativeEntry.getPassword()) === undefined) return;
          await nativeEntry.deletePassword();
        },
        catch: () => CredentialStoreUnavailableError.make(),
      }),
  };
}

export class CredentialStore extends Context.Service<CredentialStore, CredentialStoreService>()(
  "CredentialStore",
) {}

export const CredentialStoreLive = Layer.succeed(
  CredentialStore,
  makeCredentialStore((service, account) => new AsyncEntry(service, account)),
);
