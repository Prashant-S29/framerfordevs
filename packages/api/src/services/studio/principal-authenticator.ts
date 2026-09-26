// Narrows Studio bearer tokens into exact delegated user authority.

import { verifyStudioOAuthAccessToken, type StudioOAuthPrincipal } from "@framerfordevs/auth";
import { Context, Effect, Layer } from "effect";

import { AuthSessionFailure, UnauthorizedFailure } from "../../contracts/response/errors";

export function makeStudioOAuthTokenVerifier(
  verify: (token: string) => Promise<StudioOAuthPrincipal | null>,
) {
  return {
    verify: (token: string) =>
      Effect.tryPromise({
        try: () => verify(token),
        catch: (cause) => AuthSessionFailure.make({ operation: "studio.oauth.verify", cause }),
      }),
  };
}

export class StudioOAuthTokenVerifier extends Context.Tag("StudioOAuthTokenVerifier")<
  StudioOAuthTokenVerifier,
  ReturnType<typeof makeStudioOAuthTokenVerifier>
>() {}

export const StudioOAuthTokenVerifierLive = Layer.succeed(
  StudioOAuthTokenVerifier,
  makeStudioOAuthTokenVerifier(verifyStudioOAuthAccessToken),
);

export const authenticateStudioBearer = Effect.fn("StudioOAuthTokenVerifier.authenticate")(
  function* (token: string) {
    if (token.startsWith("ffd_")) return yield* UnauthorizedFailure.make();
    const principal = yield* (yield* StudioOAuthTokenVerifier).verify(token);
    if (principal === null) return yield* UnauthorizedFailure.make();
    return principal;
  },
);
