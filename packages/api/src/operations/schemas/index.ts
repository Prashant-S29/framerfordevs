import { Effect, Schema } from "effect";

import { UnauthorizedFailure } from "../../contracts/response/errors";
import type {
  GetCollectionDraftInput,
  GetLatestPublishedSchemaInput,
  GetPublishedSchemaRevisionInput,
  ListCollectionsInput,
} from "../../contracts/schema";
import { AuthUserId } from "../../contracts/platform";
import { SchemaRepository } from "../../services/schema/repository";

const decodeActorId = (actorId: string) =>
  Schema.decodeUnknownEffect(AuthUserId, { onExcessProperty: "error" })(actorId).pipe(
    Effect.mapError(() => UnauthorizedFailure.make()),
  );

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
