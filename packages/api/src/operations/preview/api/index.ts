// Defines authenticated dashboard Preview workflows at the Effect boundary.

import { Clock, Effect, Schema } from "effect";

import type {
  GetCurrentUserPreviewInput,
  GetRevisionUserPreviewInput,
} from "../../../contracts/preview";
import { RateLimitedFailure, UnauthorizedFailure } from "../../../contracts/response/errors";
import { AuthUserId } from "../../../contracts/platform";
import { PreviewRepository } from "../../../services/preview/repository";
import { RateLimitManager } from "../../../services/rate-limit/manager";
import { observePreviewRead } from "../observation";

const currentDate = Effect.map(Clock.currentTimeMillis, (millis) => new Date(millis));

const decodeActorId = (actorId: string) =>
  Schema.decodeUnknown(AuthUserId)(actorId).pipe(Effect.mapError(() => UnauthorizedFailure.make()));

export const evaluatePreviewUserRateLimit = Effect.fn("preview.user.rate_limit")(function* (
  actorUserId: string,
) {
  const actorId = yield* decodeActorId(actorUserId);
  return yield* (yield* RateLimitManager).evaluate({
    policy: "preview.user",
    identity: actorId,
    cost: 1,
  });
});

const enforcePreviewUserRateLimits = Effect.fn("preview.user.rate_limit.enforce")(function* (
  actorId: AuthUserId,
) {
  const manager = yield* RateLimitManager;
  const global = yield* manager.evaluate({
    policy: "preview.global",
    identity: "installation",
    cost: 1,
  });
  if (!global.allowed) return yield* RateLimitedFailure.make();
  const user = yield* manager.evaluate({
    policy: "preview.user",
    identity: actorId,
    cost: 1,
  });
  if (!user.allowed) return yield* RateLimitedFailure.make();
});

export const getUserCurrentPreview = Effect.fn("preview.user.current.get")(function* (
  actorUserId: string,
  input: GetCurrentUserPreviewInput,
  requestId: string,
) {
  const actorId = yield* decodeActorId(actorUserId);
  yield* enforcePreviewUserRateLimits(actorId);
  yield* Effect.annotateCurrentSpan({
    projectId: input.projectId,
    environmentId: input.environmentId,
    collectionId: input.collectionId,
    entryId: input.entryId,
    locale: input.locale,
    source: "current",
    subject: "user",
  });
  return yield* observePreviewRead(
    (yield* PreviewRepository).getUserCurrent(actorId, input, yield* currentDate, requestId),
    "current",
    "user",
  );
});

export const getUserRevisionPreview = Effect.fn("preview.user.revision.get")(function* (
  actorUserId: string,
  input: GetRevisionUserPreviewInput,
  requestId: string,
) {
  const actorId = yield* decodeActorId(actorUserId);
  yield* enforcePreviewUserRateLimits(actorId);
  yield* Effect.annotateCurrentSpan({
    projectId: input.projectId,
    environmentId: input.environmentId,
    collectionId: input.collectionId,
    entryId: input.entryId,
    locale: input.locale,
    schemaRevisionId: input.schemaRevisionId,
    source: "revision",
    subject: "user",
  });
  return yield* observePreviewRead(
    (yield* PreviewRepository).getUserRevision(actorId, input, yield* currentDate, requestId),
    "revision",
    "user",
  );
});
