import { assert, describe, it } from "@effect/vitest";
import { Cause, Effect, Exit, Option } from "effect";

import { makeAuthSessionService } from "./auth-session";
import { makeDatabaseService } from "./database";

describe("typed third-party adapters", () => {
  it.effect("translates database promise rejection into DatabaseFailure", () =>
    Effect.gen(function* () {
      const database = makeDatabaseService({
        query: () => Promise.reject(new Error("connection rejected")),
      });
      const result = yield* Effect.exit(database.ping);

      assert.isTrue(Exit.isFailure(result));
      if (Exit.isFailure(result)) {
        const error = Option.getOrUndefined(Cause.failureOption(result.cause));
        assert.strictEqual(error?._tag, "DatabaseFailure");
      }
    }),
  );

  it.effect("translates Better Auth promise rejection into AuthSessionFailure", () =>
    Effect.gen(function* () {
      const sessions = makeAuthSessionService(() => Promise.reject(new Error("auth rejected")));
      const result = yield* Effect.exit(sessions.getSession(new Headers()));

      assert.isTrue(Exit.isFailure(result));
      if (Exit.isFailure(result)) {
        const error = Option.getOrUndefined(Cause.failureOption(result.cause));
        assert.strictEqual(error?._tag, "AuthSessionFailure");
      }
    }),
  );

  it.effect("preserves an anonymous Better Auth session as null", () =>
    Effect.gen(function* () {
      const sessions = makeAuthSessionService(() => Promise.resolve(null));
      const result = yield* sessions.getSession(new Headers());

      assert.isNull(result);
    }),
  );
});
