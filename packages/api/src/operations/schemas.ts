import { Clock, Effect, Exit, Schema } from "effect";

import { UnauthorizedFailure } from "../contracts/errors";
import type {
  CreateCollectionFieldInput,
  CreateCollectionInput,
  GetCollectionDraftInput,
  GetCollectionInput,
  GetDraftGeneratedFormInput,
  GetLatestPublishedSchemaInput,
  GetPublishedGeneratedFormInput,
  GetPublishedSchemaRevisionInput,
  ListCollectionsInput,
  PublishCollectionSchemaInput,
  RemoveCollectionFieldInput,
  ReplaceCollectionDraftFieldsInput,
  ReorderCollectionFieldsInput,
  UpdateCollectionFieldInput,
  UpdateCollectionInput,
  UpdateEditorLayoutInput,
  ValidateCollectionSchemaInput,
} from "../contracts/schemas";
import { AuthUserId } from "../contracts/platform";
import { Telemetry } from "../observability/telemetry";
import { SchemaRepository } from "../services/schema-repository";

const decodeActorId = (actorId: string) =>
  Schema.decodeUnknown(AuthUserId)(actorId).pipe(Effect.mapError(() => UnauthorizedFailure.make()));

const currentDate = Effect.map(Clock.currentTimeMillis, (millis) => new Date(millis));

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

export const createCollection = Effect.fn("schema.collection.create")(function* (
  actorUserId: string,
  input: CreateCollectionInput,
  requestId: string,
) {
  const actorId = yield* decodeActorId(actorUserId);
  yield* Effect.annotateCurrentSpan({
    projectId: input.projectId,
    environmentId: input.environmentId,
  });
  const repository = yield* SchemaRepository;
  const telemetry = yield* Telemetry;
  return yield* repository.createCollection(actorId, input, yield* currentDate, requestId).pipe(
    Effect.onExit((exit) =>
      telemetry.recordSchemaMutation({
        action: "collection_create",
        outcome: Exit.isSuccess(exit) ? "success" : "failure",
      }),
    ),
  );
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

export const createCollectionField = Effect.fn("schema.field.create")(function* (
  actorUserId: string,
  input: CreateCollectionFieldInput,
  requestId: string,
) {
  const actorId = yield* decodeActorId(actorUserId);
  yield* Effect.annotateCurrentSpan({
    projectId: input.projectId,
    environmentId: input.environmentId,
    collectionId: input.collectionId,
  });
  const repository = yield* SchemaRepository;
  const telemetry = yield* Telemetry;
  return yield* repository.createField(actorId, input, yield* currentDate, requestId).pipe(
    Effect.onExit((exit) =>
      telemetry.recordSchemaMutation({
        action: "field_create",
        outcome: Exit.isSuccess(exit) ? "success" : "failure",
      }),
    ),
  );
});

export const updateCollectionField = Effect.fn("schema.field.update")(function* (
  actorUserId: string,
  input: UpdateCollectionFieldInput,
  requestId: string,
) {
  const actorId = yield* decodeActorId(actorUserId);
  yield* Effect.annotateCurrentSpan({
    projectId: input.projectId,
    environmentId: input.environmentId,
    collectionId: input.collectionId,
    fieldId: input.fieldId,
  });
  const repository = yield* SchemaRepository;
  const telemetry = yield* Telemetry;
  return yield* repository.updateField(actorId, input, yield* currentDate, requestId).pipe(
    Effect.onExit((exit) =>
      telemetry.recordSchemaMutation({
        action: "field_update",
        outcome: Exit.isSuccess(exit) ? "success" : "failure",
      }),
    ),
  );
});

export const replaceCollectionDraftFields = Effect.fn("schema.field.replace")(function* (
  actorUserId: string,
  input: ReplaceCollectionDraftFieldsInput,
  requestId: string,
) {
  const actorId = yield* decodeActorId(actorUserId);
  yield* Effect.annotateCurrentSpan({
    projectId: input.projectId,
    environmentId: input.environmentId,
    collectionId: input.collectionId,
    fieldCount: input.fields.length,
  });
  const repository = yield* SchemaRepository;
  const telemetry = yield* Telemetry;
  return yield* repository.replaceFields(actorId, input, yield* currentDate, requestId).pipe(
    Effect.onExit((exit) =>
      telemetry.recordSchemaMutation({
        action: "field_replace",
        outcome: Exit.isSuccess(exit) ? "success" : "failure",
      }),
    ),
  );
});

export const removeCollectionField = Effect.fn("schema.field.remove")(function* (
  actorUserId: string,
  input: RemoveCollectionFieldInput,
  requestId: string,
) {
  const actorId = yield* decodeActorId(actorUserId);
  yield* Effect.annotateCurrentSpan({
    projectId: input.projectId,
    environmentId: input.environmentId,
    collectionId: input.collectionId,
    fieldId: input.fieldId,
  });
  const repository = yield* SchemaRepository;
  const telemetry = yield* Telemetry;
  return yield* repository.removeField(actorId, input, yield* currentDate, requestId).pipe(
    Effect.onExit((exit) =>
      telemetry.recordSchemaMutation({
        action: "field_remove",
        outcome: Exit.isSuccess(exit) ? "success" : "failure",
      }),
    ),
  );
});

export const reorderCollectionFields = Effect.fn("schema.field.reorder")(function* (
  actorUserId: string,
  input: ReorderCollectionFieldsInput,
  requestId: string,
) {
  const actorId = yield* decodeActorId(actorUserId);
  yield* Effect.annotateCurrentSpan({
    projectId: input.projectId,
    environmentId: input.environmentId,
    collectionId: input.collectionId,
    fieldCount: input.fieldIds.length,
  });
  const repository = yield* SchemaRepository;
  const telemetry = yield* Telemetry;
  return yield* repository.reorderFields(actorId, input, yield* currentDate, requestId).pipe(
    Effect.onExit((exit) =>
      telemetry.recordSchemaMutation({
        action: "field_reorder",
        outcome: Exit.isSuccess(exit) ? "success" : "failure",
      }),
    ),
  );
});

export const updateEditorLayout = Effect.fn("schema.layout.update")(function* (
  actorUserId: string,
  input: UpdateEditorLayoutInput,
  requestId: string,
) {
  const actorId = yield* decodeActorId(actorUserId);
  yield* Effect.annotateCurrentSpan({
    projectId: input.projectId,
    environmentId: input.environmentId,
    collectionId: input.collectionId,
  });
  const repository = yield* SchemaRepository;
  const telemetry = yield* Telemetry;
  return yield* repository.updateEditorLayout(actorId, input, yield* currentDate, requestId).pipe(
    Effect.onExit((exit) =>
      telemetry.recordSchemaMutation({
        action: "layout_update",
        outcome: Exit.isSuccess(exit) ? "success" : "failure",
      }),
    ),
  );
});

export const validateCollectionSchema = Effect.fn("schema.validate")(function* (
  actorUserId: string,
  input: ValidateCollectionSchemaInput,
) {
  const actorId = yield* decodeActorId(actorUserId);
  yield* Effect.annotateCurrentSpan({
    projectId: input.projectId,
    environmentId: input.environmentId,
    collectionId: input.collectionId,
  });
  const repository = yield* SchemaRepository;
  const telemetry = yield* Telemetry;
  return yield* repository.validateSchema(actorId, input).pipe(
    Effect.onExit((exit) =>
      telemetry.recordSchemaValidation({
        outcome: Exit.isSuccess(exit) ? (exit.value.valid ? "valid" : "invalid") : "failure",
      }),
    ),
  );
});

export const publishCollectionSchema = Effect.fn("schema.publish")(function* (
  actorUserId: string,
  input: PublishCollectionSchemaInput,
  requestId: string,
) {
  const actorId = yield* decodeActorId(actorUserId);
  yield* Effect.annotateCurrentSpan({
    projectId: input.projectId,
    environmentId: input.environmentId,
    collectionId: input.collectionId,
  });
  const repository = yield* SchemaRepository;
  const telemetry = yield* Telemetry;
  const startedAt = yield* Clock.currentTimeMillis;
  return yield* repository.publishSchema(actorId, input, new Date(startedAt), requestId).pipe(
    Effect.onExit((exit) =>
      Clock.currentTimeMillis.pipe(
        Effect.flatMap((completedAt) => {
          if (Exit.isFailure(exit)) {
            return telemetry.recordSchemaPublication({
              outcome: "failure",
              severity: "none",
              fieldCountBucket: "1-10",
              durationMs: Math.max(0, completedAt - startedAt),
            });
          }
          const revision = exit.value;
          const severity =
            revision.breakingChangeCount > 0
              ? "breaking"
              : revision.potentiallyBreakingChangeCount > 0
                ? "potentially_breaking"
                : revision.nonBreakingChangeCount > 0
                  ? "non_breaking"
                  : "none";
          return telemetry.recordSchemaPublication({
            outcome: "success",
            severity,
            fieldCountBucket: fieldCountBucket(revision.fields.length),
            durationMs: Math.max(0, completedAt - startedAt),
          });
        }),
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

export const updateCollection = Effect.fn("schema.collection.update")(function* (
  actorUserId: string,
  input: UpdateCollectionInput,
  requestId: string,
) {
  const actorId = yield* decodeActorId(actorUserId);
  yield* Effect.annotateCurrentSpan({
    projectId: input.projectId,
    environmentId: input.environmentId,
    collectionId: input.collectionId,
  });
  const repository = yield* SchemaRepository;
  const telemetry = yield* Telemetry;
  return yield* repository.updateCollection(actorId, input, yield* currentDate, requestId).pipe(
    Effect.onExit((exit) =>
      telemetry.recordSchemaMutation({
        action: "collection_update",
        outcome: Exit.isSuccess(exit) ? "success" : "failure",
      }),
    ),
  );
});
