import { Effect, Schema } from "effect";

import type { ListEntriesInput } from "../../contracts/entry";
import { UnauthorizedFailure } from "../../contracts/response/errors";
import { AuthUserId } from "../../contracts/platform";
import { EntryRepository } from "../../services/entry/repository";

const decodeActorId = (actorId: string) =>
  Schema.decodeUnknownEffect(AuthUserId, { onExcessProperty: "error" })(actorId).pipe(
    Effect.mapError(() => UnauthorizedFailure.make()),
  );

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
