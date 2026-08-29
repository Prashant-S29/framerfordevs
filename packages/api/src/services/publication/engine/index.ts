// Exposes deterministic M8 publication compilation through a replaceable Effect service.

import { Context, Effect, Layer } from "effect";

import {
  changedPublicationFieldIds,
  compilePublicationSnapshot,
  type CompilePublicationSnapshotInput,
} from "../../../lib/publication/snapshot";
import type { CollectionFieldDefinition } from "../../../contracts/schema";

export function makePublicationEngine() {
  return {
    compileSync: compilePublicationSnapshot,
    compile: Effect.fn("PublicationEngine.compile")((input: CompilePublicationSnapshotInput) =>
      Effect.sync(() => compilePublicationSnapshot(input)),
    ),
    changedFieldIds: Effect.fn("PublicationEngine.changedFieldIds")(
      (
        fields: ReadonlyArray<CollectionFieldDefinition>,
        previousData: Readonly<Record<string, unknown>> | null,
        nextData: Readonly<Record<string, unknown>>,
      ) => Effect.sync(() => changedPublicationFieldIds(fields, previousData, nextData)),
    ),
  };
}

export class PublicationEngine extends Context.Tag("PublicationEngine")<
  PublicationEngine,
  ReturnType<typeof makePublicationEngine>
>() {}

export const PublicationEngineLive = Layer.succeed(PublicationEngine, makePublicationEngine());
