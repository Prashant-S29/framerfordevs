// Orchestrates public Delivery scope, explicit credentials, central quotas, and immutable read adapters.

import { Effect, Schema } from "effect";

import { ApiErrorDetail } from "../../contracts/response/api";
import { DeliveryAccessPrincipal } from "../../contracts/delivery";
import {
  CredentialInvalidFailure,
  DeliveryQueryInvalidFailure,
  UnauthorizedFailure,
  ValidationFailure,
} from "../../contracts/response/errors";
import { EntryId } from "../../contracts/entry";
import { canonicalizeLocaleTag } from "../../contracts/locale/tag";
import { ProjectId } from "../../contracts/platform";
import { EntryPublicationId } from "../../contracts/publication";
import { CollectionApiKey } from "../../contracts/schema";
import { decodeDeliveryExpand } from "../../lib/delivery/query";
import { CredentialAuthenticator } from "../../services/credential/authenticator";
import {
  DeliveryReadRepository,
  type DeliveryRouteScopeInput,
  type ResolvedDeliveryScope,
} from "../../services/delivery/read-repository";
import { RateLimitManager } from "../../services/rate-limit/manager";

const bearerPattern = /^Bearer ([^\s,]+)$/u;
const DeliveryEnvironmentKey = Schema.String.pipe(
  Schema.minLength(1),
  Schema.maxLength(63),
  Schema.pattern(/^[a-z][a-z0-9-]{0,62}$/u),
  Schema.filter((value) => !value.includes("--") && !value.endsWith("-")),
);

function lookupExpansion(
  rawQuery: string,
  allowValue: boolean,
): Effect.Effect<ReadonlyArray<string>, DeliveryQueryInvalidFailure> {
  const parameters = new URLSearchParams(rawQuery);
  const unknown = [...parameters.keys()].find(
    (key) => key !== "locale" && key !== "expand" && (!allowValue || key !== "value"),
  );
  if (unknown !== undefined || parameters.getAll("expand").length > 1) {
    return Effect.fail(
      DeliveryQueryInvalidFailure.make({
        details: [
          ApiErrorDetail.make({
            path: unknown ?? "expand",
            code: unknown === undefined ? "duplicate_parameter" : "query_parameter_unknown",
            message:
              unknown === undefined
                ? "Expand may appear at most once."
                : "This query parameter is not supported.",
          }),
        ],
      }),
    );
  }
  const decoded = decodeDeliveryExpand(parameters.get("expand"));
  return decoded.ok
    ? Effect.succeed(decoded.value)
    : Effect.fail(DeliveryQueryInvalidFailure.make({ details: [...decoded.issues] }));
}

/** Canonicalizes the mandatory locale before persistence without consulting request headers. */
export function makeDeliveryRouteScope(input: {
  readonly projectId: string;
  readonly environmentKey: string;
  readonly collectionKey: string;
  readonly localeValues: ReadonlyArray<string>;
}): Effect.Effect<DeliveryRouteScopeInput, ValidationFailure> {
  return Effect.gen(function* () {
    const fail = (path: string, code: string, message: string) =>
      ValidationFailure.make({ details: [ApiErrorDetail.make({ path, code, message })] });
    if (input.localeValues.length === 0) {
      return yield* fail("locale", "locale_required", "The locale query parameter is required.");
    }
    if (input.localeValues.length !== 1) {
      return yield* fail("locale", "duplicate_parameter", "Locale must appear exactly once.");
    }
    const localeInput = input.localeValues[0] ?? "";
    const locale = canonicalizeLocaleTag(localeInput);
    if (locale === undefined) {
      return yield* fail("locale", "locale_invalid", "Use a supported canonical locale tag.");
    }
    const projectId = yield* Schema.decodeUnknown(ProjectId)(input.projectId).pipe(
      Effect.mapError(() => fail("projectId", "project_id_invalid", "Use a valid project ID.")),
    );
    const environmentKey = yield* Schema.decodeUnknown(DeliveryEnvironmentKey)(
      input.environmentKey,
    ).pipe(
      Effect.mapError(() =>
        fail("environmentKey", "environment_key_invalid", "Use a valid environment key."),
      ),
    );
    const collectionKey = yield* Schema.decodeUnknown(CollectionApiKey)(input.collectionKey).pipe(
      Effect.mapError(() =>
        fail("collectionKey", "collection_key_invalid", "Use a valid collection key."),
      ),
    );
    return { projectId, environmentKey, collectionKey, locale };
  });
}

export const resolveDeliveryScope = Effect.fn("delivery.public.scope.resolve")(function* (
  input: DeliveryRouteScopeInput,
) {
  yield* Effect.annotateCurrentSpan({
    projectId: input.projectId,
    environmentKey: input.environmentKey,
    collectionKey: input.collectionKey,
    locale: input.locale,
  });
  return yield* (yield* DeliveryReadRepository).resolve(input);
});

/** Public requests remain anonymous only when no Authorization header was supplied. */
export const authenticateDeliveryRequest = Effect.fn("delivery.public.authenticate")(function* (
  scope: ResolvedDeliveryScope,
  authorization: string | null,
  source: string,
) {
  if (authorization === null) {
    if (scope.access === "protected") return yield* UnauthorizedFailure.make();
    return yield* Schema.decodeUnknown(DeliveryAccessPrincipal)({
      kind: "anonymous",
      credentialId: null,
    }).pipe(Effect.mapError(() => CredentialInvalidFailure.make()));
  }
  const match = bearerPattern.exec(authorization);
  const key = match?.[1];
  if (key === undefined) return yield* CredentialInvalidFailure.make();
  const principal = yield* (yield* CredentialAuthenticator).authenticate({
    key,
    expectedFamily: "delivery",
    requiredScope: "delivery.read",
    workspaceId: scope.workspaceId,
    projectId: scope.projectId,
    environmentId: scope.environmentId,
    source,
  });
  return yield* Schema.decodeUnknown(DeliveryAccessPrincipal)({
    kind: "credential",
    credentialId: principal.credentialId,
  }).pipe(Effect.mapError(() => CredentialInvalidFailure.make()));
});

/** Applies the high-ceiling installation budget before tenant or credential database work. */
export const evaluateDeliveryGlobalRateLimit = Effect.fn("delivery.public.rate_limit.global")(
  function* (cost: number) {
    return yield* (yield* RateLimitManager).evaluate({
      policy: "delivery.global",
      identity: "installation",
      cost,
    });
  },
);

/** Applies only the anonymous source or authenticated credential identity budget. */
export const evaluateDeliveryIdentityRateLimit = Effect.fn("delivery.public.rate_limit.identity")(
  function* (principal: DeliveryAccessPrincipal, source: string, cost: number) {
    return yield* (yield* RateLimitManager).evaluate({
      policy: principal.kind === "anonymous" ? "delivery.anonymous" : "delivery.credential",
      identity: principal.kind === "credential" ? principal.credentialId : source,
      cost,
    });
  },
);

export const listDeliveryEntries = Effect.fn("delivery.public.entries.list")(function* (
  input: DeliveryRouteScopeInput,
  rawQuery: string,
  principal: DeliveryAccessPrincipal,
) {
  return yield* (yield* DeliveryReadRepository).list(
    input,
    rawQuery,
    principal.kind === "credential",
  );
});

export const getCurrentDeliveryEntry = Effect.fn("delivery.public.entry.current")(function* (
  input: DeliveryRouteScopeInput,
  rawEntryId: string,
  rawQuery: string,
  principal: DeliveryAccessPrincipal,
) {
  const requestedPaths = yield* lookupExpansion(rawQuery, false);
  const entryId = yield* Schema.decodeUnknown(EntryId)(rawEntryId).pipe(
    Effect.mapError(() =>
      DeliveryQueryInvalidFailure.make({
        details: [
          ApiErrorDetail.make({
            path: "entryId",
            code: "entry_id_invalid",
            message: "Use a valid entry ID.",
          }),
        ],
      }),
    ),
  );
  return yield* (yield* DeliveryReadRepository).getCurrentById(
    input,
    entryId,
    principal.kind === "credential",
    requestedPaths,
  );
});

export const getUniqueDeliveryEntry = Effect.fn("delivery.public.entry.unique")(function* (
  input: DeliveryRouteScopeInput,
  rawFieldKey: string,
  rawQuery: string,
  principal: DeliveryAccessPrincipal,
) {
  const requestedPaths = yield* lookupExpansion(rawQuery, true);
  const parameters = new URLSearchParams(rawQuery);
  const values = parameters.getAll("value");
  if (values.length !== 1 || (values[0]?.length ?? 0) > 2_048) {
    return yield* DeliveryQueryInvalidFailure.make({
      details: [
        ApiErrorDetail.make({
          path: "value",
          code: "unique_value_invalid",
          message: "Supply exactly one bounded unique lookup value.",
        }),
      ],
    });
  }
  const fieldKey = yield* Schema.decodeUnknown(CollectionApiKey)(rawFieldKey).pipe(
    Effect.mapError(() =>
      DeliveryQueryInvalidFailure.make({
        details: [
          ApiErrorDetail.make({
            path: "fieldKey",
            code: "field_key_invalid",
            message: "Use a valid configured field key.",
          }),
        ],
      }),
    ),
  );
  return yield* (yield* DeliveryReadRepository).getByUnique(
    input,
    fieldKey,
    values[0] ?? "",
    principal.kind === "credential",
    requestedPaths,
  );
});

export const getImmutableDeliveryEntry = Effect.fn("delivery.public.entry.immutable")(function* (
  input: DeliveryRouteScopeInput,
  rawEntryId: string,
  rawPublicationId: string,
  rawQuery: string,
  principal: DeliveryAccessPrincipal,
) {
  const requestedPaths = yield* lookupExpansion(rawQuery, false);
  const [entryId, publicationId] = yield* Effect.all([
    Schema.decodeUnknown(EntryId)(rawEntryId),
    Schema.decodeUnknown(EntryPublicationId)(rawPublicationId),
  ]).pipe(
    Effect.mapError(() =>
      DeliveryQueryInvalidFailure.make({
        details: [
          ApiErrorDetail.make({
            path: "path",
            code: "resource_id_invalid",
            message: "Use valid entry and publication IDs.",
          }),
        ],
      }),
    ),
  );
  return yield* (yield* DeliveryReadRepository).getImmutable(
    input,
    entryId,
    publicationId,
    principal.kind === "credential",
    requestedPaths,
  );
});
