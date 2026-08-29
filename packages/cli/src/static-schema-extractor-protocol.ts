import { Schema } from "effect";

import { StaticSchemaExtractionErrorCode } from "./errors";
import { JsonValue } from "./schema";

export const StaticSchemaWorkerInput = Schema.Struct({
  projectRoot: Schema.String.pipe(Schema.minLength(1), Schema.maxLength(4_096)),
  entry: Schema.String.pipe(Schema.minLength(1), Schema.maxLength(240)),
});

const StaticSchemaWorkerLocation = {
  relativePath: Schema.NullOr(Schema.String.pipe(Schema.maxLength(240))),
  line: Schema.NullOr(Schema.Number.pipe(Schema.int(), Schema.greaterThanOrEqualTo(1))),
  column: Schema.NullOr(Schema.Number.pipe(Schema.int(), Schema.greaterThanOrEqualTo(1))),
};

export const StaticSchemaWorkerSuccess = Schema.Struct({
  ok: Schema.Literal(true),
  project: JsonValue,
  canonicalJson: Schema.String.pipe(Schema.maxLength(1_048_576)),
  sha256: Schema.String.pipe(Schema.length(64), Schema.pattern(/^[0-9a-f]{64}$/u)),
  files: Schema.Array(Schema.String.pipe(Schema.minLength(1), Schema.maxLength(240))).pipe(
    Schema.maxItems(32),
  ),
});

export const StaticSchemaWorkerFailure = Schema.Struct({
  ok: Schema.Literal(false),
  code: StaticSchemaExtractionErrorCode,
  ...StaticSchemaWorkerLocation,
});

export const StaticSchemaWorkerResponse = Schema.Union(
  StaticSchemaWorkerSuccess,
  StaticSchemaWorkerFailure,
);
export type StaticSchemaWorkerResponse = typeof StaticSchemaWorkerResponse.Type;
