import { AuthoringCollectionPresentation } from "@framerfordevs/sdk/authoring";
import { Schema } from "effect";

const Uuid = Schema.String.check(
  Schema.isPattern(/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu),
);
const ApiKey = Schema.String.check(
  Schema.isMinLength(1),
  Schema.isMaxLength(63),
  Schema.isPattern(/^[a-z][a-z0-9_]{0,62}$/u),
  Schema.makeFilter((value) => !value.includes("__") && !value.endsWith("_")),
);
const EnvironmentKey = Schema.String.check(
  Schema.isMinLength(1),
  Schema.isMaxLength(63),
  Schema.isPattern(/^[a-z][a-z0-9-]{0,62}$/u),
  Schema.makeFilter((value) => !value.includes("--") && !value.endsWith("-")),
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
    expectedSequence: Schema.Number.check(Schema.isInt(), Schema.isGreaterThanOrEqualTo(1)),
    presentation: AuthoringCollectionPresentation,
  }),
) {}
