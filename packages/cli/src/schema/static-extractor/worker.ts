import { parentPort, workerData } from "node:worker_threads";

import { Effect, Schema } from "effect";

import { StaticSchemaExtractionError } from "../../errors";
import { runStaticSchemaExtractorInWorker } from "./index";
import { StaticSchemaWorkerInput, type StaticSchemaWorkerResponse } from "./protocol";

const protocolFailure = StaticSchemaExtractionError.make({
  code: "worker_protocol_invalid",
  relativePath: null,
  line: null,
  column: null,
});

const program = Effect.suspend(() =>
  Object.keys(process.env).length === 0 ? Effect.void : Effect.fail(protocolFailure),
).pipe(
  Effect.andThen(Schema.decodeUnknown(StaticSchemaWorkerInput)(workerData)),
  Effect.mapError(() => protocolFailure),
  Effect.flatMap(runStaticSchemaExtractorInWorker),
  Effect.match({
    onFailure: (error): StaticSchemaWorkerResponse => ({
      ok: false,
      code: error.code,
      relativePath: error.relativePath,
      line: error.line,
      column: error.column,
    }),
    onSuccess: (result): StaticSchemaWorkerResponse => ({
      ok: true,
      project: result.project,
      canonicalJson: result.canonicalJson,
      sha256: result.sha256,
      files: result.files,
    }),
  }),
);

if (parentPort === null) {
  throw new Error("Static schema extractor worker requires a parent port.");
}

parentPort.postMessage(await Effect.runPromise(program));
