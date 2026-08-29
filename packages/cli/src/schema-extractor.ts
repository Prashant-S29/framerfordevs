import { Worker } from "node:worker_threads";

import { Effect, Either, Schema } from "effect";

import {
  StaticSchemaExtractionError,
  StaticSchemaExtractionErrorCode,
  staticSchemaExtractionErrorCodeValues,
} from "./errors";
import type {
  ExtractedStaticProjectSchema,
  StaticSchemaExtractionInput,
} from "./static-schema-extractor";
import { staticSchemaExtractorLimits } from "./static-schema-extractor";
import {
  StaticSchemaWorkerInput,
  StaticSchemaWorkerResponse,
} from "./static-schema-extractor-protocol";
export {
  validateStaticProjectSchema,
  type StaticSchemaValidationIssue,
  type StaticSchemaValidationResult,
} from "@framerfordevs/schema/validate";

export type { ExtractedStaticProjectSchema, StaticSchemaExtractionInput };
export {
  staticSchemaExtractionErrorCodeValues,
  StaticSchemaExtractionError,
  StaticSchemaExtractionErrorCode,
  staticSchemaExtractorLimits,
};

const WORKER_TIMEOUT_MILLIS = 3_000;

function extractionError(
  code: "entry_invalid" | "worker_failed" | "worker_timeout" | "worker_protocol_invalid",
) {
  return StaticSchemaExtractionError.make({
    code,
    relativePath: null,
    line: null,
    column: null,
  });
}

export const extractStaticProjectSchema = Effect.fn("cli.schema.extract.static")(function* (
  input: StaticSchemaExtractionInput,
) {
  const validatedInput = yield* Schema.decodeUnknown(StaticSchemaWorkerInput)(input).pipe(
    Effect.mapError(() => extractionError("entry_invalid")),
  );

  return yield* Effect.async<ExtractedStaticProjectSchema, StaticSchemaExtractionError>(
    (resume) => {
      let settled = false;
      const worker = new Worker(new URL("./static-schema-extractor-worker.mjs", import.meta.url), {
        workerData: validatedInput,
        env: {},
        execArgv: [],
        resourceLimits: {
          maxOldGenerationSizeMb: 64,
          maxYoungGenerationSizeMb: 16,
          stackSizeMb: 4,
        },
        stdout: true,
        stderr: true,
      });
      worker.stdout?.resume();
      worker.stderr?.resume();

      const finish = (
        effect: Effect.Effect<ExtractedStaticProjectSchema, StaticSchemaExtractionError>,
      ) => {
        if (settled) return;
        settled = true;
        clearTimeout(timeout);
        void worker.terminate();
        resume(effect);
      };

      const timeout = setTimeout(
        () => finish(Effect.fail(extractionError("worker_timeout"))),
        WORKER_TIMEOUT_MILLIS,
      );

      worker.once("message", (message: unknown) => {
        const decoded = Schema.decodeUnknownEither(StaticSchemaWorkerResponse)(message);
        if (Either.isLeft(decoded)) {
          finish(Effect.fail(extractionError("worker_protocol_invalid")));
          return;
        }
        const response = decoded.right;
        if (!response.ok) {
          finish(
            Effect.fail(
              StaticSchemaExtractionError.make({
                code: response.code,
                relativePath: response.relativePath,
                line: response.line,
                column: response.column,
              }),
            ),
          );
          return;
        }
        finish(
          Effect.succeed({
            project: response.project,
            canonicalJson: response.canonicalJson,
            sha256: response.sha256,
            files: response.files,
          }),
        );
      });
      worker.once("error", () => finish(Effect.fail(extractionError("worker_failed"))));
      worker.once("exit", (code) => {
        if (code !== 0) finish(Effect.fail(extractionError("worker_failed")));
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
