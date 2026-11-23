import { Effect, Schema } from "effect";

import { GetCurrentUserPreviewInput, GetRevisionUserPreviewInput } from "../../contracts/preview";
import {
  PreviewHandoff,
  PreviewHandoffRequest,
  type PreviewHandoffIssuer,
} from "../../contracts/preview-handoff";
import { type AuthUserId, IsoDateTime } from "../../contracts/platform";
import { ApiErrorDetail } from "../../contracts/response/api";
import {
  CredentialInvalidFailure,
  UnauthorizedFailure,
  ValidationFailure,
} from "../../contracts/response/errors";
import {
  PreviewHandoffRepository,
  type PreviewHandoffScope,
} from "../../services/preview-handoff/repository";
import { PreviewHandoffSigner } from "../../services/preview-handoff/signer";
import { getUserCurrentPreview, getUserRevisionPreview } from "../preview/api";

const bearerPattern = /^Bearer ([^\s,]+)$/u;

export function decodePreviewHandoffRequest(value: unknown) {
  return Schema.decodeUnknownEffect(PreviewHandoffRequest, { onExcessProperty: "error" })(
    value,
  ).pipe(
    Effect.mapError(() =>
      ValidationFailure.make({
        details: [
          ApiErrorDetail.make({
            path: "body",
            code: "preview_handoff_invalid",
            message: "Send exactly source and revisionId.",
          }),
        ],
      }),
    ),
  );
}

export const issuePreviewHandoff = Effect.fn("preview.handoff.issue")(function* (
  actorId: AuthUserId,
  scope: PreviewHandoffScope,
  request: PreviewHandoffRequest,
  issuer: PreviewHandoffIssuer,
  requestId: string,
) {
  yield* Effect.annotateCurrentSpan({
    projectId: scope.projectId,
    environmentId: scope.environmentId,
    collectionId: scope.collectionId,
    entryId: scope.entryId,
    locale: scope.locale,
    source: request.source,
    issuer,
  });
  const prepared = yield* (yield* PreviewHandoffRepository).prepare(
    actorId,
    scope,
    request,
    issuer,
    requestId,
  );
  const signed = yield* (yield* PreviewHandoffSigner).sign(prepared.claims);
  return PreviewHandoff.make({
    token: signed.token,
    expiresAt: Schema.decodeUnknownSync(IsoDateTime)(
      new Date(signed.claims.expiresAtEpochMs).toISOString(),
    ),
    previewUrl: prepared.previewUrl,
    source: signed.claims.source,
    schemaRevisionId: signed.claims.schemaRevisionId,
    sharedRevisionId: signed.claims.sharedRevisionId,
    localizedRevisionId: signed.claims.localizedRevisionId,
  });
});

export const readPreviewHandoff = Effect.fn("preview.handoff.read")(function* (
  authorization: string | null,
  requestId: string,
) {
  if (authorization === null) return yield* UnauthorizedFailure.make();
  const token = bearerPattern.exec(authorization)?.[1];
  if (token === undefined) return yield* CredentialInvalidFailure.make();
  const claims = yield* (yield* PreviewHandoffSigner).verify(token);
  yield* (yield* PreviewHandoffRepository).assertCurrentTarget(claims);
  const scope = {
    projectId: claims.projectId,
    environmentId: claims.environmentId,
    collectionId: claims.collectionId,
    entryId: claims.entryId,
    locale: claims.locale,
  };
  if (claims.source === "current") {
    return yield* getUserCurrentPreview(
      claims.userId,
      GetCurrentUserPreviewInput.make(scope),
      requestId,
    );
  }
  if (claims.schemaRevisionId === null) return yield* CredentialInvalidFailure.make();
  return yield* getUserRevisionPreview(
    claims.userId,
    GetRevisionUserPreviewInput.make({
      ...scope,
      schemaRevisionId: claims.schemaRevisionId,
      sharedRevisionId: claims.sharedRevisionId,
      localizedRevisionId: claims.localizedRevisionId,
    }),
    requestId,
  );
});
