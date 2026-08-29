import { Schema } from "effect";

import { ExperimentalSchemaBuildErrorCode } from "../../errors";
import { JsonValue } from "../../schema";

export const ExperimentalSchemaBuildWorkerInput = Schema.Struct({
  projectRoot: Schema.String.pipe(Schema.minLength(1), Schema.maxLength(4_096)),
  entry: Schema.String.pipe(Schema.minLength(1), Schema.maxLength(240)),
  experimental: Schema.Boolean,
});

export const ExperimentalSchemaBuildWorkerSuccess = Schema.Struct({
  ok: Schema.Literal(true),
  project: JsonValue,
  canonicalJson: Schema.String.pipe(Schema.maxLength(1_048_576)),
  tierOneSource: Schema.String.pipe(Schema.maxLength(1_050_000)),
  sha256: Schema.String.pipe(Schema.length(64), Schema.pattern(/^[0-9a-f]{64}$/u)),
  files: Schema.Array(Schema.String.pipe(Schema.minLength(1), Schema.maxLength(240))).pipe(
    Schema.maxItems(32),
  ),
  inputs: Schema.Array(
    Schema.Struct({
      path: Schema.String.pipe(Schema.minLength(1), Schema.maxLength(240)),
      sha256: Schema.String.pipe(Schema.length(64), Schema.pattern(/^[0-9a-f]{64}$/u)),
    }).annotations({ parseOptions: { onExcessProperty: "error" } }),
  ).pipe(Schema.maxItems(32)),
  runtime: Schema.Literal("quickjs-emscripten-0.32.0-experimental"),
  memoryLimitHard: Schema.Literal(false),
});

export const ExperimentalSchemaBuildWorkerFailure = Schema.Struct({
  ok: Schema.Literal(false),
  code: ExperimentalSchemaBuildErrorCode,
  relativePath: Schema.NullOr(Schema.String.pipe(Schema.maxLength(240))),
});

export const ExperimentalSchemaBuildWorkerResponse = Schema.Union(
  ExperimentalSchemaBuildWorkerSuccess,
  ExperimentalSchemaBuildWorkerFailure,
);
export type ExperimentalSchemaBuildWorkerResponse =
  typeof ExperimentalSchemaBuildWorkerResponse.Type;
