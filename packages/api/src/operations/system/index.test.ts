import { assert, describe, layer } from "@effect/vitest";
import { Cause, Effect, Exit, Layer, Option } from "effect";

import { AuthSessionService, type AuthSession } from "../../services/auth-session";
import { Database } from "../../services/database";
import {
  getCurrentSession,
  healthCheck,
  loadPrivateData,
  readinessCheck,
  requireSession,
} from "./index";

const now = new Date("2026-01-01T00:00:00.000Z");
const authenticatedSession: NonNullable<AuthSession> = {
  session: {
    id: "session-1",
    createdAt: now,
    updatedAt: now,
    userId: "user-1",
    expiresAt: new Date("2026-01-08T00:00:00.000Z"),
    token: "session-token",
    ipAddress: null,
    userAgent: null,
  },
  user: {
    id: "user-1",
    createdAt: now,
    updatedAt: now,
    email: "user@example.test",
    emailVerified: true,
    name: "Test User",
    image: null,
  },
};

const DatabaseTest = Layer.succeed(Database, { ping: Effect.void });
const AnonymousAuthTest = Layer.succeed(AuthSessionService, {
  getSession: () => Effect.succeed(null),
});
const AuthenticatedAuthTest = Layer.succeed(AuthSessionService, {
  getSession: () => Effect.succeed(authenticatedSession),
});

describe("system operations", () => {
  layer(Layer.mergeAll(DatabaseTest, AnonymousAuthTest))((it) => {
    it.effect("reports liveness without querying dependencies", () =>
      Effect.gen(function* () {
        const result = yield* healthCheck();
        assert.deepEqual(result, { status: "ok" });
      }),
    );

    it.effect("reports readiness after the database responds", () =>
      Effect.gen(function* () {
        const result = yield* readinessCheck();
        assert.deepEqual(result, { status: "ready" });
      }),
    );

    it.effect("preserves an anonymous session and rejects protected access", () =>
      Effect.gen(function* () {
        const session = yield* getCurrentSession(new Headers());
        const required = yield* Effect.exit(requireSession(new Headers()));

        assert.isNull(session);
        assert.isTrue(Exit.isFailure(required));
        if (Exit.isFailure(required)) {
          const failure = Option.getOrUndefined(Cause.failureOption(required.cause));
          assert.strictEqual(failure?._tag, "UnauthorizedFailure");
        }
      }),
    );
  });

  layer(Layer.mergeAll(DatabaseTest, AuthenticatedAuthTest))((it) => {
    it.effect("loads authenticated private data", () =>
      Effect.gen(function* () {
        const session = yield* requireSession(new Headers());
        const result = yield* loadPrivateData(session);

        assert.strictEqual(result.user.id, "user-1");
        assert.strictEqual(result.message, "This is private");
      }),
    );
  });
});
