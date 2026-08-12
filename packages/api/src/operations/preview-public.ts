// Orchestrates strict public Preview authority, bearer verification, quotas, and audited reads.

import { Clock, Effect, Schema } from "effect";

import type { CredentialPrincipal } from "../contracts/access";
import { ApiErrorDetail } from "../contracts/api-response";
import {
  CredentialInvalidFailure,
  PreviewQueryInvalidFailure,
  UnauthorizedFailure,
  ValidationFailure,
} from "../contracts/errors";
import { GetRevisionCredentialPreviewInput, PreviewRouteScope } from "../contracts/preview";
import {
  parseCurrentPreviewQuery,
  parseRevisionPreviewQuery,
  type PreviewQueryIssue,
} from "../lib/preview-query";
import { CredentialAuthenticator } from "../services/credential-authenticator";
import { PreviewRepository } from "../services/preview-repository";
import { RateLimitManager } from "../services/rate-limit-manager";
import { observePreviewRead } from "./preview-observation";

const bearerPattern = /^Bearer ([^\s,]+)$/u;
const currentDate = Effect.map(Clock.currentTimeMillis, (millis) => new Date(millis));

function validationFailure(path: string, code: string, message: string) {
  return ValidationFailure.make({
    details: [ApiErrorDetail.make({ path, code, message })],
  });
}

function queryFailure(issues: ReadonlyArray<PreviewQueryIssue>) {
  return PreviewQueryInvalidFailure.make({
    details: issues.map((issue) => ApiErrorDetail.make(issue)),
  });
}

export function makeCurrentPreviewRouteScope(input: {
  readonly projectId: string;
  readonly environmentKey: string;
  readonly collectionKey: string;
  readonly entryId: string;
  readonly rawQuery: string;
}) {
  return Effect.gen(function* () {
    const parsed = parseCurrentPreviewQuery(input.rawQuery);
    if (!parsed.ok) return yield* queryFailure(parsed.issues);
    return yield* Schema.decodeUnknown(PreviewRouteScope)({
      ...input,
      locale: parsed.value.locale,
    }).pipe(
      Effect.mapError(() =>
        validationFailure(
          "path",
          "preview_scope_invalid",
          "Use valid Preview resource IDs and keys.",
        ),
      ),
    );
  });
}

export function makeRevisionPreviewRouteScope(input: {
  readonly projectId: string;
  readonly environmentKey: string;
  readonly collectionKey: string;
  readonly entryId: string;
  readonly schemaRevisionId: string;
  readonly rawQuery: string;
}) {
  return Effect.gen(function* () {
    const parsed = parseRevisionPreviewQuery(input.rawQuery);
    if (!parsed.ok) return yield* queryFailure(parsed.issues);
    return yield* Schema.decodeUnknown(GetRevisionCredentialPreviewInput)({
      ...input,
      locale: parsed.value.locale,
      sharedRevisionId: parsed.value.sharedRevision === "none" ? null : parsed.value.sharedRevision,
      localizedRevisionId:
        parsed.value.localizedRevision === "none" ? null : parsed.value.localizedRevision,
    }).pipe(
      Effect.mapError(() =>
        validationFailure(
          "path",
          "preview_scope_invalid",
          "Use valid Preview resource IDs and keys.",
        ),
      ),
    );
  });
}

export const authenticatePreviewRequest = Effect.fn("preview.public.authenticate")(function* (
  authorization: string | null,
  source: string,
) {
  if (authorization === null) return yield* UnauthorizedFailure.make();
  const key = bearerPattern.exec(authorization)?.[1];
  if (key === undefined) return yield* CredentialInvalidFailure.make();
  return yield* (yield* CredentialAuthenticator).verify({
    key,
    expectedFamily: "preview",
    requiredScope: "preview.read",
    source,
  });
});

export const evaluatePreviewGlobalRateLimit = Effect.fn("preview.public.rate_limit.global")(
  function* () {
    return yield* (yield* RateLimitManager).evaluate({
      policy: "preview.global",
      identity: "installation",
      cost: 1,
    });
  },
);

export const evaluatePreviewCredentialRateLimit = Effect.fn("preview.public.rate_limit.credential")(
  function* (credentialId: string) {
    return yield* (yield* RateLimitManager).evaluate({
      policy: "preview.credential",
      identity: credentialId,
      cost: 1,
    });
  },
);

export const getCredentialCurrentPreview = Effect.fn("preview.public.current.get")(function* (
  principal: CredentialPrincipal,
  input: PreviewRouteScope,
  requestId: string,
) {
  yield* Effect.annotateCurrentSpan({
    projectId: input.projectId,
    environmentKey: input.environmentKey,
    collectionKey: input.collectionKey,
    entryId: input.entryId,
    locale: input.locale,
    source: "current",
    subject: "credential",
  });
  return yield* observePreviewRead(
    (yield* PreviewRepository).getCredentialCurrent(
      principal,
      input,
      yield* currentDate,
      requestId,
    ),
    "current",
    "credential",
  );
});

export const getCredentialRevisionPreview = Effect.fn("preview.public.revision.get")(function* (
  principal: CredentialPrincipal,
  input: GetRevisionCredentialPreviewInput,
  requestId: string,
) {
  yield* Effect.annotateCurrentSpan({
    projectId: input.projectId,
    environmentKey: input.environmentKey,
    collectionKey: input.collectionKey,
    entryId: input.entryId,
    locale: input.locale,
    schemaRevisionId: input.schemaRevisionId,
    source: "revision",
    subject: "credential",
  });
  return yield* observePreviewRead(
    (yield* PreviewRepository).getCredentialRevision(
      principal,
      input,
      yield* currentDate,
      requestId,
    ),
    "revision",
    "credential",
  );
});
