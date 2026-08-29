import { db } from "@framerfordevs/db";
import { Context, Effect, Layer } from "effect";

import { DatabaseFailure } from "../contracts/response/errors";

export class Database extends Context.Tag("Database")<
  Database,
  {
    readonly ping: Effect.Effect<void, DatabaseFailure>;
  }
>() {}

interface DatabaseClient {
  readonly query: (query: string) => Promise<unknown>;
}

export function makeDatabaseService(client: DatabaseClient) {
  return {
    ping: Effect.tryPromise({
      try: () => client.query("select 1"),
      catch: (cause) =>
        DatabaseFailure.make({
          operation: "database.ping",
          cause,
        }),
    }).pipe(Effect.asVoid),
  };
}

const databaseResource = Effect.acquireRelease(Effect.succeed(db), (database) =>
  Effect.tryPromise({
    try: () => database.$client.end(),
    catch: () => undefined,
  }).pipe(Effect.ignore),
);

export const DatabaseLive = Layer.scoped(
  Database,
  databaseResource.pipe(Effect.map((database) => makeDatabaseService(database.$client))),
);
