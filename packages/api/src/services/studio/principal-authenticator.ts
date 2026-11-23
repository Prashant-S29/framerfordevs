import {
  STUDIO_CONTENT_SCOPE,
  verifyStudioOAuthAccessToken,
  type StudioOAuthPrincipal,
} from "@framerfordevs/auth";
import { Context, Effect, Layer } from "effect";

import { AuthSessionFailure, UnauthorizedFailure } from "../../contracts/response/errors";
import { ToolingOAuthTokenVerifier } from "../tooling/principal-authenticator";

export interface StudioEditorPrincipal {
  readonly kind: "studio_editor_user";
  readonly userId: string;
  readonly expiresAtEpochSeconds: number;
}

export type StudioRequestPrincipal = StudioOAuthPrincipal | StudioEditorPrincipal;

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

export class StudioOAuthTokenVerifier extends Context.Service<
  StudioOAuthTokenVerifier,
  ReturnType<typeof makeStudioOAuthTokenVerifier>
>()("StudioOAuthTokenVerifier") {}

export const StudioOAuthTokenVerifierLive = Layer.succeed(
  StudioOAuthTokenVerifier,
  makeStudioOAuthTokenVerifier(verifyStudioOAuthAccessToken),
);

export const authenticateStudioBearer = Effect.fn("StudioOAuthTokenVerifier.authenticate")(
  function* (token: string) {
    if (token.startsWith("ffd_")) return yield* UnauthorizedFailure.make();
    const principal = yield* (yield* StudioOAuthTokenVerifier).verify(token);
    if (principal !== null) return principal satisfies StudioRequestPrincipal;
    const editor = yield* (yield* ToolingOAuthTokenVerifier).verify(token, STUDIO_CONTENT_SCOPE);
    if (editor === null) return yield* UnauthorizedFailure.make();
    const result: StudioRequestPrincipal = {
      kind: "studio_editor_user",
      userId: editor.userId,
      expiresAtEpochSeconds: editor.expiresAtEpochSeconds,
    };
    return result;
  },
);
