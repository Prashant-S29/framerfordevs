import { Schema } from "effect";

import { StaticSchemaExtractionErrorCode } from "../../errors";
import { JsonValue } from "../../schema";

export const StaticSchemaWorkerInput = Schema.Struct({
  projectRoot: Schema.String.check(Schema.isMinLength(1), Schema.isMaxLength(4_096)),
  entry: Schema.String.check(Schema.isMinLength(1), Schema.isMaxLength(240)),
});

const StaticSchemaWorkerLocation = {
  relativePath: Schema.NullOr(Schema.String.check(Schema.isMaxLength(240))),
  line: Schema.NullOr(Schema.Number.check(Schema.isInt(), Schema.isGreaterThanOrEqualTo(1))),
  column: Schema.NullOr(Schema.Number.check(Schema.isInt(), Schema.isGreaterThanOrEqualTo(1))),
};

export const StaticSchemaWorkerSuccess = Schema.Struct({
  ok: Schema.Literal(true),
  project: JsonValue,
  canonicalJson: Schema.String.check(Schema.isMaxLength(1_048_576)),
  sha256: Schema.String.check(Schema.isBetweenLength(64, 64), Schema.isPattern(/^[0-9a-f]{64}$/u)),
  files: Schema.Array(Schema.String.check(Schema.isMinLength(1), Schema.isMaxLength(240))).check(
    Schema.isMaxLength(32),
  ),
});

export const StaticSchemaWorkerFailure = Schema.Struct({
  ok: Schema.Literal(false),
  code: StaticSchemaExtractionErrorCode,
  ...StaticSchemaWorkerLocation,
});

export const StaticSchemaWorkerResponse = Schema.Union([
  StaticSchemaWorkerSuccess,
  StaticSchemaWorkerFailure,
]);
export type StaticSchemaWorkerResponse = typeof StaticSchemaWorkerResponse.Type;
