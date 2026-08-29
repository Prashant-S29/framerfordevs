import { Effect } from "effect";

import { UnauthorizedFailure } from "../../contracts/response/errors";
import { type AuthSession, AuthSessionService } from "../../services/auth-session";
import { Database } from "../../services/database";

export const healthCheck = Effect.fn("healthCheck")(() => Effect.succeed({ status: "ok" }));

export const readinessCheck = Effect.fn("readinessCheck")(function* () {
  const database = yield* Database;
  yield* database.ping;
  return { status: "ready" };
});

export const getCurrentSession = Effect.fn("getCurrentSession")(function* (headers: Headers) {
  const authSession = yield* AuthSessionService;
  return yield* authSession.getSession(headers);
});

export const requireSession = Effect.fn("requireSession")(function* (headers: Headers) {
  const session = yield* getCurrentSession(headers);
  if (!session?.user) {
    return yield* UnauthorizedFailure.make();
  }
  return session;
});

export const loadPrivateData = Effect.fn("loadPrivateData")((session: NonNullable<AuthSession>) =>
  Effect.succeed({
    message: "This is private",
    user: session.user,
  }),
);
