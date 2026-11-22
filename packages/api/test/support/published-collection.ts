import { randomUUID } from "node:crypto";

import { db } from "@framerfordevs/db";
import { eq } from "@framerfordevs/db/query";
import { projectMembership } from "@framerfordevs/db/schema/access";
import { user } from "@framerfordevs/db/schema/auth";
import {
  cmsCollection,
  cmsCollectionDeliveryConfig,
  cmsCollectionDeliveryField,
  cmsCollectionField,
  cmsCollectionLocaleDeliveryState,
  cmsCollectionSchemaHead,
  cmsSchemaRevision,
  cmsSchemaRevisionField,
  outboxEvent,
} from "@framerfordevs/db/schema/cms";
import { projectLocale } from "@framerfordevs/db/schema/locale";
import {
  auditEvent,
  environment,
  project,
  projectCapability,
  workspace,
  workspaceMembership,
} from "@framerfordevs/db/schema/platform";
import { publicationEvent } from "@framerfordevs/db/schema/webhooks";
import { Effect, Schema } from "effect";

import {
  AuthUserId,
  CreateProjectInput,
  CreateWorkspaceInput,
  EnableCapabilityInput,
} from "../../src/contracts/platform";
import {
  CreateCollectionFieldInput,
  CreateCollectionInput,
  defaultFieldEditorMetadata,
  PublishCollectionSchemaInput,
  ValidateCollectionSchemaInput,
} from "../../src/contracts/schema";
import { makePlatformRepository } from "../../src/services/platform-repository";
import { makeSchemaRepository } from "../../src/services/schema/repository";

export interface PublishedCollectionFixture {
  readonly ownerId: string;
  readonly workspaceId: string;
  readonly projectId: string;
  readonly environmentId: string;
  readonly collectionId: string;
  readonly schemaRevisionId: string;
}

export async function createPublishedCollectionFixture(
  label: string,
  publishedAt: Date,
): Promise<PublishedCollectionFixture> {
  const suffix = randomUUID();
  const ownerId = `${label}-owner-${suffix}`;
  const owner = Schema.decodeUnknownSync(AuthUserId, { onExcessProperty: "error" })(ownerId);
  const platform = makePlatformRepository();
  const schemas = makeSchemaRepository();
  await db.insert(user).values({
    id: ownerId,
    name: `${label} owner`,
    email: `${label}-${suffix}@example.test`,
    emailVerified: true,
  });
  const createdWorkspace = await Effect.runPromise(
    platform.createWorkspace(
      owner,
      Schema.decodeUnknownSync(CreateWorkspaceInput, { onExcessProperty: "error" })({
        name: `${label} workspace`,
      }),
      `${label}-workspace-${suffix}`,
    ),
  );
  const createdProject = await Effect.runPromise(
    platform.createProject(
      owner,
      Schema.decodeUnknownSync(CreateProjectInput, { onExcessProperty: "error" })({
        workspaceId: createdWorkspace.id,
        name: `${label} project`,
        key: `fixture-${suffix.slice(0, 8)}`,
        description: null,
      }),
      `${label}-project-${suffix}`,
    ),
  );
  const projectId = createdProject.id;
  const environmentId = createdProject.environment.id;
  await Effect.runPromise(
    platform.enableCapability(
      owner,
      Schema.decodeUnknownSync(EnableCapabilityInput, { onExcessProperty: "error" })({
        projectId,
        capability: "cms",
      }),
      `${label}-capability-${suffix}`,
    ),
  );
  const collection = await Effect.runPromise(
    schemas.createCollection(
      owner,
      Schema.decodeUnknownSync(CreateCollectionInput, { onExcessProperty: "error" })({
        projectId,
        environmentId,
        apiKey: "fixture_articles",
        displayName: "Fixture articles",
        description: null,
      }),
      publishedAt,
      `${label}-collection-${suffix}`,
    ),
  );
  const draft = await Effect.runPromise(
    schemas.createField(
      owner,
      Schema.decodeUnknownSync(CreateCollectionFieldInput, { onExcessProperty: "error" })({
        projectId,
        environmentId,
        collectionId: collection.id,
        draftVersion: collection.draftVersion,
        parentFieldId: null,
        field: {
          apiKey: "title",
          displayLabel: "Title",
          kind: "short_text",
          required: true,
          localization: "localized",
          deprecated: false,
          editor: defaultFieldEditorMetadata,
          configuration: {},
        },
      }),
      publishedAt,
      `${label}-field-${suffix}`,
    ),
  );
  const validation = await Effect.runPromise(
    schemas.validateSchema(
      owner,
      Schema.decodeUnknownSync(ValidateCollectionSchemaInput, { onExcessProperty: "error" })({
        projectId,
        environmentId,
        collectionId: collection.id,
      }),
    ),
  );
  const published = await Effect.runPromise(
    schemas.publishSchema(
      owner,
      Schema.decodeUnknownSync(PublishCollectionSchemaInput, { onExcessProperty: "error" })({
        projectId,
        environmentId,
        collectionId: collection.id,
        draftVersion: draft.collection.draftVersion,
        expectedPublishedRevisionId: null,
        commandId: randomUUID(),
        acknowledgedChangeIds: validation.changes.items
          .filter((change) => change.classification !== "non_breaking")
          .map((change) => change.changeId),
      }),
      publishedAt,
      `${label}-schema-publish-${suffix}`,
    ),
  );
  return {
    ownerId,
    workspaceId: createdWorkspace.id,
    projectId,
    environmentId,
    collectionId: collection.id,
    schemaRevisionId: published.id,
  };
}

export async function removePublishedCollectionFixture(
  fixture: PublishedCollectionFixture,
): Promise<void> {
  const { collectionId, environmentId, projectId, workspaceId } = fixture;
  await db.delete(publicationEvent).where(eq(publicationEvent.environmentId, environmentId));
  await db.delete(outboxEvent).where(eq(outboxEvent.environmentId, environmentId));
  await db
    .delete(cmsCollectionSchemaHead)
    .where(eq(cmsCollectionSchemaHead.collectionId, collectionId));
  await db
    .delete(cmsSchemaRevisionField)
    .where(eq(cmsSchemaRevisionField.collectionId, collectionId));
  await db.delete(cmsSchemaRevision).where(eq(cmsSchemaRevision.collectionId, collectionId));
  await db
    .delete(cmsCollectionDeliveryField)
    .where(eq(cmsCollectionDeliveryField.collectionId, collectionId));
  await db.delete(cmsCollectionField).where(eq(cmsCollectionField.collectionId, collectionId));
  await db
    .delete(cmsCollectionLocaleDeliveryState)
    .where(eq(cmsCollectionLocaleDeliveryState.collectionId, collectionId));
  await db
    .delete(cmsCollectionDeliveryConfig)
    .where(eq(cmsCollectionDeliveryConfig.collectionId, collectionId));
  await db.delete(cmsCollection).where(eq(cmsCollection.id, collectionId));
  await db.delete(auditEvent).where(eq(auditEvent.workspaceId, workspaceId));
  await db.delete(projectMembership).where(eq(projectMembership.projectId, projectId));
  await db.delete(projectCapability).where(eq(projectCapability.projectId, projectId));
  await db.delete(projectLocale).where(eq(projectLocale.projectId, projectId));
  await db.delete(environment).where(eq(environment.projectId, projectId));
  await db.delete(project).where(eq(project.id, projectId));
  await db.delete(workspaceMembership).where(eq(workspaceMembership.workspaceId, workspaceId));
  await db.delete(workspace).where(eq(workspace.id, workspaceId));
  await db.delete(user).where(eq(user.id, fixture.ownerId));
}
