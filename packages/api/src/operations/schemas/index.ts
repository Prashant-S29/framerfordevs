import { Clock, Effect, Exit, Schema } from "effect";

import { AuthoringPublishPresentationRequest } from "../../contracts/authoring/presentation";
import { UnauthorizedFailure } from "../../contracts/response/errors";
import type {
  GetCollectionPresentationInput,
  PublishCollectionPresentationInput,
} from "../../contracts/presentation/management";
import type {
  GetCollectionDraftInput,
  GetCollectionInput,
  GetDraftGeneratedFormInput,
  GetLatestPublishedSchemaInput,
  GetPublishedGeneratedFormInput,
  GetPublishedSchemaRevisionInput,
  ListCollectionsInput,
} from "../../contracts/schema";
import { AuthUserId } from "../../contracts/platform";
import { Telemetry } from "../../observability/telemetry";
import { AuthoringPresentationRepository } from "../../services/authoring/presentation-repository";
import { SchemaRepository } from "../../services/schema/repository";

const decodeActorId = (actorId: string) =>
  Schema.decodeUnknown(AuthUserId)(actorId).pipe(Effect.mapError(() => UnauthorizedFailure.make()));

function fieldCountBucket(count: number): "1-10" | "11-50" | "51-100" {
  if (count <= 10) return "1-10";
  if (count <= 50) return "11-50";
  return "51-100";
}

export const listCollections = Effect.fn("schema.collection.list")(function* (
  actorUserId: string,
  input: ListCollectionsInput,
) {
  const actorId = yield* decodeActorId(actorUserId);
  yield* Effect.annotateCurrentSpan({
    projectId: input.projectId,
    environmentId: input.environmentId,
  });
  const repository = yield* SchemaRepository;
  return yield* repository.listCollections(actorId, input);
});

export const getCollection = Effect.fn("schema.collection.get")(function* (
  actorUserId: string,
  input: GetCollectionInput,
) {
  const actorId = yield* decodeActorId(actorUserId);
  yield* Effect.annotateCurrentSpan({
    projectId: input.projectId,
    environmentId: input.environmentId,
    collectionId: input.collectionId,
  });
  const repository = yield* SchemaRepository;
  return yield* repository.getCollection(actorId, input);
});

export const getCollectionDraft = Effect.fn("schema.draft.get")(function* (
  actorUserId: string,
  input: GetCollectionDraftInput,
) {
  const actorId = yield* decodeActorId(actorUserId);
  yield* Effect.annotateCurrentSpan({
    projectId: input.projectId,
    environmentId: input.environmentId,
    collectionId: input.collectionId,
  });
  return yield* (yield* SchemaRepository).getDraft(actorId, input);
});

export const getCollectionPresentation = Effect.fn("schema.presentation.get")(function* (
  actorUserId: string,
  input: GetCollectionPresentationInput,
) {
  const actorId = yield* decodeActorId(actorUserId);
  yield* Effect.annotateCurrentSpan({
    projectId: input.projectId,
    environmentId: input.environmentId,
    collectionId: input.collectionId,
  });
  const collection = yield* (yield* SchemaRepository).getCollection(actorId, input);
  return yield* (yield* AuthoringPresentationRepository).get(
    { kind: "user", id: actorId },
    { projectId: input.projectId, environmentId: input.environmentId },
    collection.apiKey,
  );
});

export const publishCollectionPresentation = Effect.fn("schema.presentation.publish")(function* (
  actorUserId: string,
  input: PublishCollectionPresentationInput,
  requestId: string,
) {
  const actorId = yield* decodeActorId(actorUserId);
  yield* Effect.annotateCurrentSpan({
    projectId: input.projectId,
    environmentId: input.environmentId,
    collectionId: input.collectionId,
  });
  const collection = yield* (yield* SchemaRepository).getCollection(actorId, input);
  const repository = yield* AuthoringPresentationRepository;
  const telemetry = yield* Telemetry;
  const startedAt = yield* Clock.currentTimeMillis;
  return yield* repository
    .publish(
      { kind: "user", id: actorId },
      { projectId: input.projectId, environmentId: input.environmentId },
      collection.apiKey,
      AuthoringPublishPresentationRequest.make({
        commandId: input.commandId,
        expectedRevisionId: input.expectedRevisionId,
        expectedSequence: input.expectedSequence,
        presentation: input.presentation,
      }),
      new Date(startedAt),
      requestId,
    )
    .pipe(
      Effect.onExit((exit) =>
        Clock.currentTimeMillis.pipe(
          Effect.flatMap((completedAt) =>
            telemetry.recordSchemaPublication({
              outcome: Exit.isSuccess(exit) ? "success" : "failure",
              severity: Exit.isSuccess(exit) && !exit.value.noOp ? "non_breaking" : "none",
              fieldCountBucket: fieldCountBucket(input.presentation.fields.length),
              durationMs: Math.max(0, completedAt - startedAt),
            }),
          ),
        ),
      ),
    );
});

export const getLatestPublishedSchema = Effect.fn("schema.published.get_latest")(function* (
  actorUserId: string,
  input: GetLatestPublishedSchemaInput,
) {
  const actorId = yield* decodeActorId(actorUserId);
  yield* Effect.annotateCurrentSpan({
    projectId: input.projectId,
    environmentId: input.environmentId,
    collectionId: input.collectionId,
  });
  return yield* (yield* SchemaRepository).getLatestPublished(actorId, input);
});

export const getPublishedSchemaRevision = Effect.fn("schema.published.get_revision")(function* (
  actorUserId: string,
  input: GetPublishedSchemaRevisionInput,
) {
  const actorId = yield* decodeActorId(actorUserId);
  yield* Effect.annotateCurrentSpan({
    projectId: input.projectId,
    environmentId: input.environmentId,
    collectionId: input.collectionId,
    revisionId: input.revisionId,
  });
  return yield* (yield* SchemaRepository).getPublishedRevision(actorId, input);
});

export const getDraftGeneratedForm = Effect.fn("schema.form.get_draft")(function* (
  actorUserId: string,
  input: GetDraftGeneratedFormInput,
) {
  const actorId = yield* decodeActorId(actorUserId);
  yield* Effect.annotateCurrentSpan({
    projectId: input.projectId,
    environmentId: input.environmentId,
    collectionId: input.collectionId,
  });
  return yield* (yield* SchemaRepository).getDraftForm(actorId, input);
});

export const getPublishedGeneratedForm = Effect.fn("schema.form.get_published")(function* (
  actorUserId: string,
  input: GetPublishedGeneratedFormInput,
) {
  const actorId = yield* decodeActorId(actorUserId);
  yield* Effect.annotateCurrentSpan({
    projectId: input.projectId,
    environmentId: input.environmentId,
    collectionId: input.collectionId,
    revisionId: input.revisionId ?? "latest",
  });
  return yield* (yield* SchemaRepository).getPublishedForm(actorId, input);
});
