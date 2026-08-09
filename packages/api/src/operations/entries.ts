// Defines named M7 entry workflows at the Effect/application boundary.

import { Clock, Effect, Schema } from "effect";

import type {
  CreateEntryInput,
  GetEntryDraftInput,
  ListEntriesInput,
  ListEntryRevisionsInput,
  RenameEntryInput,
  RestoreEntryRevisionInput,
  SaveEntryDraftInput,
} from "../contracts/entries";
import { UnauthorizedFailure } from "../contracts/errors";
import { AuthUserId } from "../contracts/platform";
import { EntryRepository } from "../services/entry-repository";

const decodeActorId = (actorId: string) =>
  Schema.decodeUnknown(AuthUserId)(actorId).pipe(Effect.mapError(() => UnauthorizedFailure.make()));

const currentDate = Effect.map(Clock.currentTimeMillis, (millis) => new Date(millis));

export const listEntries = Effect.fn("entry.list")(function* (
  actorUserId: string,
  input: ListEntriesInput,
) {
  const actorId = yield* decodeActorId(actorUserId);
  yield* Effect.annotateCurrentSpan({
    projectId: input.projectId,
    environmentId: input.environmentId,
    collectionId: input.collectionId,
  });
  return yield* (yield* EntryRepository).listEntries(actorId, input);
});

export const createEntry = Effect.fn("entry.create")(function* (
  actorUserId: string,
  input: CreateEntryInput,
  requestId: string,
) {
  const actorId = yield* decodeActorId(actorUserId);
  yield* Effect.annotateCurrentSpan({
    projectId: input.projectId,
    environmentId: input.environmentId,
    collectionId: input.collectionId,
  });
  return yield* (yield* EntryRepository).createEntry(actorId, input, yield* currentDate, requestId);
});

/** Renames one scoped CMS-only entry name through the repository boundary. */
export const renameEntry = Effect.fn("entry.rename")(function* (
  actorUserId: string,
  input: RenameEntryInput,
  requestId: string,
) {
  const actorId = yield* decodeActorId(actorUserId);
  yield* Effect.annotateCurrentSpan({
    projectId: input.projectId,
    environmentId: input.environmentId,
    collectionId: input.collectionId,
    entryId: input.entryId,
  });
  return yield* (yield* EntryRepository).renameEntry(actorId, input, yield* currentDate, requestId);
});

export const getEntryDraft = Effect.fn("entry.draft.get")(function* (
  actorUserId: string,
  input: GetEntryDraftInput,
) {
  const actorId = yield* decodeActorId(actorUserId);
  yield* Effect.annotateCurrentSpan({
    projectId: input.projectId,
    environmentId: input.environmentId,
    collectionId: input.collectionId,
    entryId: input.entryId,
  });
  return yield* (yield* EntryRepository).getDraft(actorId, input);
});

export const saveEntryDraft = Effect.fn("entry.draft.save")(function* (
  actorUserId: string,
  input: SaveEntryDraftInput,
  requestId: string,
) {
  const actorId = yield* decodeActorId(actorUserId);
  yield* Effect.annotateCurrentSpan({
    projectId: input.projectId,
    environmentId: input.environmentId,
    collectionId: input.collectionId,
    entryId: input.entryId,
    sharedTouched: input.sharedMutations.length > 0,
    localizedTouched: input.localizedMutations.length > 0,
  });
  return yield* (yield* EntryRepository).saveDraft(actorId, input, yield* currentDate, requestId);
});

export const listEntryRevisions = Effect.fn("entry.revision.list")(function* (
  actorUserId: string,
  input: ListEntryRevisionsInput,
) {
  const actorId = yield* decodeActorId(actorUserId);
  yield* Effect.annotateCurrentSpan({
    projectId: input.projectId,
    environmentId: input.environmentId,
    collectionId: input.collectionId,
    entryId: input.entryId,
    scope: input.scope,
  });
  return yield* (yield* EntryRepository).listRevisions(actorId, input);
});

export const restoreEntryRevision = Effect.fn("entry.revision.restore")(function* (
  actorUserId: string,
  input: RestoreEntryRevisionInput,
  requestId: string,
) {
  const actorId = yield* decodeActorId(actorUserId);
  yield* Effect.annotateCurrentSpan({
    projectId: input.projectId,
    environmentId: input.environmentId,
    collectionId: input.collectionId,
    entryId: input.entryId,
    scope: input.scope,
  });
  return yield* (yield* EntryRepository).restoreRevision(
    actorId,
    input,
    yield* currentDate,
    requestId,
  );
});
