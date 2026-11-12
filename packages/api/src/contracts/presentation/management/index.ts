// Defines dashboard-session inputs for the shared immutable presentation publication kernel.

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

import * as SchemaStrict from "../../../lib/schema-strict";
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

export const CollectionPresentationOutputSchema = SchemaStrict.toStandardSchemaV1(
  ApiSuccessSchema(AuthoringPresentationSnapshot),
);
export const PublishCollectionPresentationOutputSchema = SchemaStrict.toStandardSchemaV1(
  ApiSuccessSchema(AuthoringPublishPresentationResult),
);
export const GetCollectionPresentationInputSchema = SchemaStrict.toStandardSchemaV1(
  GetCollectionPresentationInput,
);
export const PublishCollectionPresentationInputSchema = SchemaStrict.toStandardSchemaV1(
  PublishCollectionPresentationInput,
);
