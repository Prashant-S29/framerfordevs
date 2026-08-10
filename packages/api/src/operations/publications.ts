// Defines named M8 exact-locale publication workflows at the Effect boundary.

import { Cause, Clock, Effect, Exit, Option, Schema } from "effect";

import { UnauthorizedFailure } from "../contracts/errors";
import type {
  GetEntryPublicationStatusInput,
  ListEntryPublicationsInput,
  PublishEntryInput,
  UnpublishEntryInput,
  ValidateEntryPublicationInput,
} from "../contracts/publications";
import { AuthUserId } from "../contracts/platform";
import { Telemetry, type EntryPublicationValidationCategory } from "../observability/telemetry";
import { PublicationRepository } from "../services/publication-repository";

const decodeActorId = (actorId: string) =>
  Schema.decodeUnknown(AuthUserId)(actorId).pipe(Effect.mapError(() => UnauthorizedFailure.make()));

function validationCategory(
  code: string,
  fieldId: string | null,
): EntryPublicationValidationCategory {
  if (code === "reference_target_locale_unpublished") return "reference_target_locale_unpublished";
  if (code === "publication_snapshot_too_large") return "snapshot_size_exceeded";
  if (code === "hidden_field_blocks_publication") return "hidden_field";
  return fieldId === null ? "other" : "field_invalid";
}

function failureOutcome(exit: Exit.Exit<unknown, unknown>): "invalid" | "conflict" | "failure" {
  if (Exit.isSuccess(exit)) return "failure";
  const failure = Option.getOrUndefined(Cause.failureOption(exit.cause));
  if (typeof failure !== "object" || failure === null || !("_tag" in failure)) return "failure";
  if (failure._tag === "EntryPublicationInvalidFailure") return "invalid";
  if (failure._tag === "EntryPublicationConflictFailure") return "conflict";
  return "failure";
}

function annotateScope(input: GetEntryPublicationStatusInput) {
  return Effect.annotateCurrentSpan({
    projectId: input.projectId,
    environmentId: input.environmentId,
    collectionId: input.collectionId,
    entryId: input.entryId,
    locale: input.locale,
  });
}

export const getEntryPublicationStatus = Effect.fn("entry.publication.status")(function* (
  actorUserId: string,
  input: GetEntryPublicationStatusInput,
) {
  const actorId = yield* decodeActorId(actorUserId);
  yield* annotateScope(input);
  return yield* (yield* PublicationRepository).getStatus(actorId, input);
});

export const validateEntryPublication = Effect.fn("entry.publication.validate")(function* (
  actorUserId: string,
  input: ValidateEntryPublicationInput,
) {
  const actorId = yield* decodeActorId(actorUserId);
  yield* annotateScope(input);
  const repository = yield* PublicationRepository;
  const telemetry = yield* Telemetry;
  const startedAt = yield* Clock.currentTimeMillis;
  return yield* repository.validate(actorId, input, new Date(startedAt)).pipe(
    Effect.onExit((exit) =>
      Clock.currentTimeMillis.pipe(
        Effect.flatMap((completedAt) => {
          const sizeBucket = Exit.isSuccess(exit) ? (exit.value.size?.bucket ?? "none") : "none";
          const outcome = Exit.isSuccess(exit)
            ? exit.value.valid
              ? "success"
              : "invalid"
            : failureOutcome(exit);
          const categories = Exit.isSuccess(exit)
            ? [
                ...new Set(
                  exit.value.issues.map((issue) => validationCategory(issue.code, issue.fieldId)),
                ),
              ]
            : [];
          return Effect.all([
            telemetry.recordEntryPublication({
              operation: "validate",
              outcome,
              sizeBucket,
              durationMs: Math.max(0, completedAt - startedAt),
            }),
            ...categories.map((category) =>
              telemetry.recordEntryPublicationValidationFailure(category),
            ),
          ]).pipe(Effect.asVoid);
        }),
      ),
    ),
  );
});

export const publishEntryLocale = Effect.fn("entry.publication.publish")(function* (
  actorUserId: string,
  input: PublishEntryInput,
  requestId: string,
) {
  const actorId = yield* decodeActorId(actorUserId);
  yield* annotateScope(input);
  const repository = yield* PublicationRepository;
  const telemetry = yield* Telemetry;
  const startedAt = yield* Clock.currentTimeMillis;
  return yield* repository.publish(actorId, input, new Date(startedAt), requestId).pipe(
    Effect.onExit((exit) =>
      Clock.currentTimeMillis.pipe(
        Effect.flatMap((completedAt) =>
          telemetry.recordEntryPublication({
            operation: "publish",
            outcome: Exit.isSuccess(exit) ? "success" : failureOutcome(exit),
            sizeBucket: Exit.isSuccess(exit) ? exit.value.publication.size.bucket : "none",
            durationMs: Math.max(0, completedAt - startedAt),
          }),
        ),
      ),
    ),
  );
});

export const unpublishEntryLocale = Effect.fn("entry.publication.unpublish")(function* (
  actorUserId: string,
  input: UnpublishEntryInput,
  requestId: string,
) {
  const actorId = yield* decodeActorId(actorUserId);
  yield* annotateScope(input);
  const repository = yield* PublicationRepository;
  const telemetry = yield* Telemetry;
  const startedAt = yield* Clock.currentTimeMillis;
  return yield* repository.unpublish(actorId, input, new Date(startedAt), requestId).pipe(
    Effect.onExit((exit) =>
      Clock.currentTimeMillis.pipe(
        Effect.flatMap((completedAt) =>
          telemetry.recordEntryPublication({
            operation: "unpublish",
            outcome: Exit.isSuccess(exit) ? "success" : failureOutcome(exit),
            sizeBucket: "none",
            durationMs: Math.max(0, completedAt - startedAt),
          }),
        ),
      ),
    ),
  );
});

export const listEntryPublications = Effect.fn("entry.publication.list")(function* (
  actorUserId: string,
  input: ListEntryPublicationsInput,
) {
  const actorId = yield* decodeActorId(actorUserId);
  yield* annotateScope(input);
  return yield* (yield* PublicationRepository).list(actorId, input);
});
