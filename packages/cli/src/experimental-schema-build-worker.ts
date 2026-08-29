import { parentPort, workerData } from "node:worker_threads";

import { Effect, Schema } from "effect";

import { ExperimentalSchemaBuildError } from "./errors";
import {
  ExperimentalSchemaBuildWorkerInput,
  type ExperimentalSchemaBuildWorkerResponse,
} from "./experimental-schema-build-protocol";
import { runExperimentalSchemaBuildInWorker } from "./experimental-schema-build-runner";

const protocolFailure = ExperimentalSchemaBuildError.make({
  code: "worker_protocol_invalid",
  relativePath: null,
});

const program = Effect.suspend(() =>
  Object.keys(process.env).length === 0 ? Effect.void : Effect.fail(protocolFailure),
).pipe(
  Effect.andThen(Schema.decodeUnknown(ExperimentalSchemaBuildWorkerInput)(workerData)),
  Effect.mapError(() => protocolFailure),
  Effect.flatMap(runExperimentalSchemaBuildInWorker),
  Effect.match({
    onFailure: (error): ExperimentalSchemaBuildWorkerResponse => ({
      ok: false,
      code: error.code,
      relativePath: error.relativePath,
    }),
    onSuccess: (result): ExperimentalSchemaBuildWorkerResponse => ({
      ok: true,
      project: result.project,
      canonicalJson: result.canonicalJson,
      tierOneSource: result.tierOneSource,
      sha256: result.sha256,
      files: result.files,
      inputs: result.inputs,
      runtime: result.runtime,
      memoryLimitHard: result.memoryLimitHard,
    }),
  }),
);

if (parentPort === null)
  throw new Error("Experimental schema build worker requires a parent port.");
parentPort.postMessage(await Effect.runPromise(program));
