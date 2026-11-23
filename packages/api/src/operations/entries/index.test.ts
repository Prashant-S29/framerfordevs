import { assert, describe, layer } from "@effect/vitest";
import { Effect, Exit, Layer, Schema } from "effect";

import { CmsEntryPage, ListEntriesInput } from "../../contracts/entry";
import { EntryRepository, makeEntryRepository } from "../../services/entry/repository";
import { listEntries } from "./index";

const scope = {
  projectId: "019fae8b-1234-7000-8000-000000000001",
  environmentId: "019fae8b-1234-7000-8000-000000000002",
  collectionId: "019fae8b-1234-7000-8000-000000000003",
  locale: "en",
};
const page = CmsEntryPage.make({ items: [], nextCursor: null });
const calls: Array<string> = [];
const RepositoryTest = Layer.succeed(EntryRepository, {
  ...makeEntryRepository(),
  listEntries: () => Effect.sync(() => (calls.push("list"), page)),
});

describe("entry operations", () => {
  layer(RepositoryTest)((it) => {
    it.effect("forwards the entry list through one replaceable service", () =>
      Effect.gen(function* () {
        calls.length = 0;
        const input = yield* Schema.decodeUnknownEffect(ListEntriesInput, {
          onExcessProperty: "error",
        })({ ...scope, cursor: null, limit: 25 });
        const result = yield* listEntries("user-1", input);
        assert.deepEqual({ ...result }, { ...page });
        assert.deepEqual(calls, ["list"]);
      }),
    );

    it.effect("rejects malformed actors before repository access", () =>
      Effect.gen(function* () {
        calls.length = 0;
        const input = yield* Schema.decodeUnknownEffect(ListEntriesInput, {
          onExcessProperty: "error",
        })({ ...scope, cursor: null, limit: 25 });
        const exit = yield* Effect.exit(listEntries("", input));
        assert.isTrue(Exit.isFailure(exit));
        assert.deepEqual(calls, []);
      }),
    );
  });
});
