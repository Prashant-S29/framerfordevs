import { auth } from "@framerfordevs/auth";
import { Context, Effect, Layer } from "effect";

import { AuthSessionFailure } from "../contracts/errors";

export type AuthSession = Awaited<ReturnType<typeof auth.api.getSession>>;

export class AuthSessionService extends Context.Tag("AuthSessionService")<
  AuthSessionService,
  {
    readonly getSession: (headers: Headers) => Effect.Effect<AuthSession, AuthSessionFailure>;
  }
>() {}

export function makeAuthSessionService(lookup: (headers: Headers) => Promise<AuthSession>) {
  return {
    getSession: (headers: Headers) =>
      Effect.tryPromise({
        try: () => lookup(headers),
        catch: (cause) =>
          AuthSessionFailure.make({
            operation: "auth.session.get",
            cause,
          }),
      }),
  };
}

export const AuthSessionLive = Layer.succeed(
  AuthSessionService,
  makeAuthSessionService((headers) => auth.api.getSession({ headers })),
);
