import { Schema } from "effect";

import { ExperimentalSchemaBuildErrorCode } from "../../errors";
import { JsonValue } from "../../schema";

export const ExperimentalSchemaBuildWorkerInput = Schema.Struct({
  projectRoot: Schema.String.check(Schema.isMinLength(1), Schema.isMaxLength(4_096)),
  entry: Schema.String.check(Schema.isMinLength(1), Schema.isMaxLength(240)),
  experimental: Schema.Boolean,
});

export const ExperimentalSchemaBuildWorkerSuccess = Schema.Struct({
  ok: Schema.Literal(true),
  project: JsonValue,
  canonicalJson: Schema.String.check(Schema.isMaxLength(1_048_576)),
  tierOneSource: Schema.String.check(Schema.isMaxLength(1_050_000)),
  sha256: Schema.String.check(Schema.isBetweenLength(64, 64), Schema.isPattern(/^[0-9a-f]{64}$/u)),
  files: Schema.Array(Schema.String.check(Schema.isMinLength(1), Schema.isMaxLength(240))).check(
    Schema.isMaxLength(32),
  ),
  inputs: Schema.Array(
    Schema.Struct({
      path: Schema.String.check(Schema.isMinLength(1), Schema.isMaxLength(240)),
      sha256: Schema.String.check(
        Schema.isBetweenLength(64, 64),
        Schema.isPattern(/^[0-9a-f]{64}$/u),
      ),
    }),
  ).check(Schema.isMaxLength(32)),
  runtime: Schema.Literal("quickjs-emscripten-0.32.0-experimental"),
  memoryLimitHard: Schema.Literal(false),
});

export const ExperimentalSchemaBuildWorkerFailure = Schema.Struct({
  ok: Schema.Literal(false),
  code: ExperimentalSchemaBuildErrorCode,
  relativePath: Schema.NullOr(Schema.String.check(Schema.isMaxLength(240))),
});

export const ExperimentalSchemaBuildWorkerResponse = Schema.Union([
  ExperimentalSchemaBuildWorkerSuccess,
  ExperimentalSchemaBuildWorkerFailure,
]);
export type ExperimentalSchemaBuildWorkerResponse =
  typeof ExperimentalSchemaBuildWorkerResponse.Type;
