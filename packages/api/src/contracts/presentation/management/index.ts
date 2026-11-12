import { Schema } from "effect";

import { ApiSuccessSchema } from "../../response/api";
import {
  AuthoringCollectionPresentation,
  AuthoringPresentationSnapshot,
  AuthoringPublishPresentationResult,
} from "../../authoring/presentation";
import { EnvironmentId, ProjectId } from "../../platform";
import {
  CollectionId,
  SchemaPublicationCommandId,
  SchemaRevisionId,
  SchemaRevisionSequence,
} from "../../schema";

export class GetCollectionPresentationInput extends Schema.Class<GetCollectionPresentationInput>(
  "GetCollectionPresentationInput",
)({
  projectId: ProjectId,
  environmentId: EnvironmentId,
  collectionId: CollectionId,
}) {}

export class PublishCollectionPresentationInput extends Schema.Class<PublishCollectionPresentationInput>(
  "PublishCollectionPresentationInput",
)({
  projectId: ProjectId,
  environmentId: EnvironmentId,
  collectionId: CollectionId,
  commandId: SchemaPublicationCommandId,
  expectedRevisionId: SchemaRevisionId,
  expectedSequence: SchemaRevisionSequence,
  presentation: AuthoringCollectionPresentation,
}) {}

export const CollectionPresentationOutputSchema = Schema.toStandardSchemaV1(
  ApiSuccessSchema(AuthoringPresentationSnapshot),
);
export const PublishCollectionPresentationOutputSchema = Schema.toStandardSchemaV1(
  ApiSuccessSchema(AuthoringPublishPresentationResult),
);
export const GetCollectionPresentationInputSchema = Schema.toStandardSchemaV1(
  GetCollectionPresentationInput,
  { parseOptions: { onExcessProperty: "error" } },
);
export const PublishCollectionPresentationInputSchema = Schema.toStandardSchemaV1(
  PublishCollectionPresentationInput,
  { parseOptions: { onExcessProperty: "error" } },
);
