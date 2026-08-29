import { Worker } from "node:worker_threads";

import { Effect, Either, Schema } from "effect";

import {
  ExperimentalSchemaBuildError,
  ExperimentalSchemaBuildErrorCode,
  experimentalSchemaBuildErrorCodeValues,
} from "./errors";
import {
  ExperimentalSchemaBuildWorkerInput,
  ExperimentalSchemaBuildWorkerResponse,
} from "./schema/experimental-build/protocol";
import {
  experimentalSchemaBuildLimits,
  type ExperimentalSchemaBuildInput,
  type ExperimentalSchemaBuildOutput,
} from "./schema/experimental-build/runner";

export type { ExperimentalSchemaBuildInput, ExperimentalSchemaBuildOutput };
export {
  ExperimentalSchemaBuildError,
  ExperimentalSchemaBuildErrorCode,
  experimentalSchemaBuildErrorCodeValues,
  experimentalSchemaBuildLimits,
};

const WORKER_TIMEOUT_MILLIS = 5_000;

function buildError(
  code:
    | "experimental_opt_in_required"
    | "entry_invalid"
    | "worker_failed"
    | "worker_timeout"
    | "worker_protocol_invalid",
) {
  return ExperimentalSchemaBuildError.make({ code, relativePath: null });
}

export const runExperimentalSchemaBuild = Effect.fn("cli.schema.build.experimental")(function* (
  input: ExperimentalSchemaBuildInput,
) {
  const validatedInput = yield* Schema.decodeUnknown(ExperimentalSchemaBuildWorkerInput)(
    input,
  ).pipe(Effect.mapError(() => buildError("entry_invalid")));
  if (!validatedInput.experimental)
    return yield* Effect.fail(buildError("experimental_opt_in_required"));

  return yield* Effect.async<ExperimentalSchemaBuildOutput, ExperimentalSchemaBuildError>(
    (resume) => {
      let settled = false;
      const worker = new Worker(new URL("./schema/experimental-build/worker", import.meta.url), {
        workerData: validatedInput,
        env: {},
        execArgv: [],
        resourceLimits: {
          maxOldGenerationSizeMb: 96,
          maxYoungGenerationSizeMb: 16,
          stackSizeMb: 4,
        },
        stdout: true,
        stderr: true,
      });
      worker.stdout?.resume();
      worker.stderr?.resume();

      const finish = (
        effect: Effect.Effect<ExperimentalSchemaBuildOutput, ExperimentalSchemaBuildError>,
      ) => {
        if (settled) return;
        settled = true;
        clearTimeout(timeout);
        void worker.terminate();
        resume(effect);
      };
      const timeout = setTimeout(
        () => finish(Effect.fail(buildError("worker_timeout"))),
        WORKER_TIMEOUT_MILLIS,
      );

      worker.once("message", (message: unknown) => {
        const decoded = Schema.decodeUnknownEither(ExperimentalSchemaBuildWorkerResponse)(message);
        if (Either.isLeft(decoded)) {
          finish(Effect.fail(buildError("worker_protocol_invalid")));
          return;
        }
        const response = decoded.right;
        if (!response.ok) {
          finish(
            Effect.fail(
              ExperimentalSchemaBuildError.make({
                code: response.code,
                relativePath: response.relativePath,
              }),
            ),
          );
          return;
        }
        finish(
          Effect.succeed({
            project: response.project,
            canonicalJson: response.canonicalJson,
            tierOneSource: response.tierOneSource,
            sha256: response.sha256,
            files: response.files,
            inputs: response.inputs,
            runtime: response.runtime,
            memoryLimitHard: response.memoryLimitHard,
          }),
        );
      });
      worker.once("error", () => finish(Effect.fail(buildError("worker_failed"))));
      worker.once("exit", (code) => {
        if (code !== 0) finish(Effect.fail(buildError("worker_failed")));
      });

      return Effect.sync(() => {
        if (!settled) {
          settled = true;
          clearTimeout(timeout);
          void worker.terminate();
        }
      });
    },
  );
});
