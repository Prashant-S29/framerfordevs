// Defines the credential-free editable Presentation document exchanged through CLI stdout/files.

import { AuthoringCollectionPresentation } from "@framerfordevs/sdk/authoring";
import { Schema } from "effect";

const Uuid = Schema.String.pipe(
  Schema.pattern(/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu),
);
const ApiKey = Schema.String.pipe(
  Schema.minLength(1),
  Schema.maxLength(63),
  Schema.pattern(/^[a-z][a-z0-9_]{0,62}$/u),
  Schema.filter((value) => !value.includes("__") && !value.endsWith("_")),
);
const EnvironmentKey = Schema.String.pipe(
  Schema.minLength(1),
  Schema.maxLength(63),
  Schema.pattern(/^[a-z][a-z0-9-]{0,62}$/u),
  Schema.filter((value) => !value.includes("--") && !value.endsWith("-")),
);

export class PresentationEditDocument extends Schema.Class<PresentationEditDocument>(
  "CliPresentationEditDocument",
)(
  Schema.Struct({
    documentVersion: Schema.Literal(1),
    projectId: Uuid,
    environmentId: Uuid,
    environmentKey: EnvironmentKey,
    collection: ApiKey,
    expectedRevisionId: Uuid,
    expectedSequence: Schema.Number.pipe(Schema.int(), Schema.greaterThanOrEqualTo(1)),
    presentation: AuthoringCollectionPresentation,
  }).annotations({ parseOptions: { onExcessProperty: "error" } }),
) {}
