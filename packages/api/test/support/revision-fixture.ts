import { randomUUID } from "node:crypto";

import { db } from "@framerfordevs/db";
import { projectMembership } from "@framerfordevs/db/schema/access";
import { user } from "@framerfordevs/db/schema/auth";
import { workspaceMembership } from "@framerfordevs/db/schema/platform";
import { Effect, Schema } from "effect";

import {
  CreateEntryInput,
  GetEntryDraftInput,
  SaveEntryDraftInput,
} from "../../src/contracts/entry";
import { CreateProjectLocaleInput } from "../../src/contracts/locale";
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
  GetCollectionDraftInput,
  PublishCollectionSchemaInput,
  RemoveCollectionFieldInput,
  ValidateCollectionSchemaInput,
  type CollectionDraftSchema,
} from "../../src/contracts/schema";
import { makeEntryRepository } from "../../src/services/entry/repository";
import { makeLocaleRepository } from "../../src/services/locale/repository";
import { makePlatformRepository } from "../../src/services/platform-repository";
import { makeSchemaRepository } from "../../src/services/schema/repository";

export interface RevisionFixture {
  readonly suffix: string;
  readonly ownerId: AuthUserId;
  readonly editorId: AuthUserId;
  readonly reviewerId: AuthUserId;
  readonly workspaceId: string;
  readonly projectId: string;
  readonly environmentId: string;
  readonly collectionId: string;
  readonly schemaRevisionId: string;
  readonly contractHash: string;
  readonly fields: {
    readonly title: string;
    readonly note: string;
    readonly secret: string;
    readonly legacy: string;
  };
}

export interface DraftValues {
  readonly shared?: Readonly<Record<string, unknown>>;
  readonly localized?: Readonly<Record<string, unknown>>;
}

const platform = makePlatformRepository();
const schemas = makeSchemaRepository();
const locales = makeLocaleRepository();
const entries = makeEntryRepository();

const restrictedEditor = {
  ...defaultFieldEditorMetadata,
  visibleToRoles: ["owner", "developer", "content_admin"],
  editableByRoles: ["owner", "developer", "content_admin"],
};

function decodeUser(id: string): AuthUserId {
  return Schema.decodeUnknownSync(AuthUserId, { onExcessProperty: "error" })(id);
}

async function insertUser(id: string, label: string, suffix: string) {
  await db.insert(user).values({
    id,
    name: label,
    email: `${id}-${suffix.slice(0, 8)}@example.test`,
    emailVerified: true,
  });
}

async function addField(
  owner: AuthUserId,
  scope: {
    readonly projectId: string;
    readonly environmentId: string;
    readonly collectionId: string;
  },
  draftVersion: number,
  field: {
    readonly apiKey: string;
    readonly localization: "shared" | "localized";
    readonly required: boolean;
    readonly hidden: boolean;
  },
  suffix: string,
): Promise<CollectionDraftSchema> {
  return Effect.runPromise(
    schemas.createField(
      owner,
      Schema.decodeUnknownSync(CreateCollectionFieldInput, { onExcessProperty: "error" })({
        ...scope,
        draftVersion,
        parentFieldId: null,
        field: {
          apiKey: field.apiKey,
          displayLabel: field.apiKey,
          kind: "short_text",
          required: field.required,
          localization: field.localization,
          deprecated: false,
          editor: field.hidden ? restrictedEditor : defaultFieldEditorMetadata,
          configuration: {},
        },
      }),
      new Date("2026-11-01T10:01:00.000Z"),
      `${field.apiKey}-${suffix}`,
    ),
  );
}

async function publishDraft(
  owner: AuthUserId,
  scope: {
    readonly projectId: string;
    readonly environmentId: string;
    readonly collectionId: string;
  },
  draftVersion: number,
  expectedPublishedRevisionId: string | null,
  requestId: string,
) {
  const validation = await Effect.runPromise(
    schemas.validateSchema(
      owner,
      Schema.decodeUnknownSync(ValidateCollectionSchemaInput, { onExcessProperty: "error" })(scope),
    ),
  );
  return Effect.runPromise(
    schemas.publishSchema(
      owner,
      Schema.decodeUnknownSync(PublishCollectionSchemaInput, { onExcessProperty: "error" })({
        ...scope,
        draftVersion,
        expectedPublishedRevisionId,
        commandId: randomUUID(),
        acknowledgedChangeIds: validation.changes.items
          .filter((change) => change.classification !== "non_breaking")
          .map((change) => change.changeId),
      }),
      new Date("2026-11-01T10:02:00.000Z"),
      requestId,
    ),
  );
}

export async function createRevisionFixture(label: string): Promise<RevisionFixture> {
  const suffix = randomUUID();
  const ownerId = decodeUser(`${label}-owner-${suffix}`);
  const editorId = decodeUser(`${label}-editor-${suffix}`);
  const reviewerId = decodeUser(`${label}-reviewer-${suffix}`);
  await insertUser(ownerId, `${label} owner`, suffix);
  await insertUser(editorId, `${label} editor`, suffix);
  await insertUser(reviewerId, `${label} reviewer`, suffix);
  const workspace = await Effect.runPromise(
    platform.createWorkspace(
      ownerId,
      Schema.decodeUnknownSync(CreateWorkspaceInput, { onExcessProperty: "error" })({
        name: `${label} workspace`,
      }),
      `${label}-workspace-${suffix}`,
    ),
  );
  const project = await Effect.runPromise(
    platform.createProject(
      ownerId,
      Schema.decodeUnknownSync(CreateProjectInput, { onExcessProperty: "error" })({
        workspaceId: workspace.id,
        name: `${label} project`,
        key: `rev-${suffix.slice(0, 8)}`,
        description: null,
      }),
      `${label}-project-${suffix}`,
    ),
  );
  await Effect.runPromise(
    platform.enableCapability(
      ownerId,
      Schema.decodeUnknownSync(EnableCapabilityInput, { onExcessProperty: "error" })({
        projectId: project.id,
        capability: "cms",
      }),
      `${label}-capability-${suffix}`,
    ),
  );
  await Effect.runPromise(
    locales.createLocale(
      ownerId,
      Schema.decodeUnknownSync(CreateProjectLocaleInput, { onExcessProperty: "error" })({
        projectId: project.id,
        tag: "hi",
        displayName: "Hindi",
      }),
      new Date("2026-11-01T09:59:00.000Z"),
      `${label}-hindi-${suffix}`,
    ),
  );
  for (const [memberId, role] of [
    [editorId, "editor"],
    [reviewerId, "reviewer"],
  ] as const) {
    await db.insert(workspaceMembership).values({
      workspaceId: workspace.id,
      userId: memberId,
      role: "collaborator",
    });
    await db.insert(projectMembership).values({
      workspaceId: workspace.id,
      projectId: project.id,
      userId: memberId,
      role,
      localeAccessMode: "all",
      createdByUserId: ownerId,
    });
  }
  const collection = await Effect.runPromise(
    schemas.createCollection(
      ownerId,
      Schema.decodeUnknownSync(CreateCollectionInput, { onExcessProperty: "error" })({
        projectId: project.id,
        environmentId: project.environment.id,
        apiKey: "revision_articles",
        displayName: "Revision articles",
        description: null,
      }),
      new Date("2026-11-01T10:00:00.000Z"),
      `${label}-collection-${suffix}`,
    ),
  );
  const scope = {
    projectId: project.id,
    environmentId: project.environment.id,
    collectionId: collection.id,
  };
  let draft = await addField(
    ownerId,
    scope,
    collection.draftVersion,
    { apiKey: "title", localization: "localized", required: true, hidden: false },
    suffix,
  );
  draft = await addField(
    ownerId,
    scope,
    draft.collection.draftVersion,
    { apiKey: "note", localization: "shared", required: false, hidden: false },
    suffix,
  );
  draft = await addField(
    ownerId,
    scope,
    draft.collection.draftVersion,
    { apiKey: "secret", localization: "shared", required: true, hidden: true },
    suffix,
  );
  draft = await addField(
    ownerId,
    scope,
    draft.collection.draftVersion,
    { apiKey: "legacy", localization: "shared", required: false, hidden: false },
    suffix,
  );
  const fieldId = (apiKey: string) => {
    const field = draft.fields.find((candidate) => candidate.apiKey === apiKey);
    if (!field) throw new Error(`Fixture field ${apiKey} is missing.`);
    return field.id;
  };
  const published = await publishDraft(
    ownerId,
    scope,
    draft.collection.draftVersion,
    null,
    `${label}-schema-${suffix}`,
  );
  return {
    suffix,
    ownerId,
    editorId,
    reviewerId,
    workspaceId: workspace.id,
    projectId: project.id,
    environmentId: project.environment.id,
    collectionId: collection.id,
    schemaRevisionId: published.id,
    contractHash: published.contractHash,
    fields: {
      title: fieldId("title"),
      note: fieldId("note"),
      secret: fieldId("secret"),
      legacy: fieldId("legacy"),
    },
  };
}

export async function removeFixtureFieldAndPublish(
  fixture: RevisionFixture,
  fieldId: string,
): Promise<{ readonly schemaRevisionId: string; readonly contractHash: string }> {
  const scope = {
    projectId: fixture.projectId,
    environmentId: fixture.environmentId,
    collectionId: fixture.collectionId,
  };
  const current = await Effect.runPromise(
    schemas.getDraft(
      fixture.ownerId,
      Schema.decodeUnknownSync(GetCollectionDraftInput, { onExcessProperty: "error" })(scope),
    ),
  );
  const removed = await Effect.runPromise(
    schemas.removeField(
      fixture.ownerId,
      Schema.decodeUnknownSync(RemoveCollectionFieldInput, { onExcessProperty: "error" })({
        ...scope,
        fieldId,
        draftVersion: current.collection.draftVersion,
      }),
      new Date("2026-11-01T11:00:00.000Z"),
      `remove-${fieldId}-${fixture.suffix}`,
    ),
  );
  const published = await publishDraft(
    fixture.ownerId,
    scope,
    removed.collection.draftVersion,
    fixture.schemaRevisionId,
    `republish-${fieldId}-${fixture.suffix}`,
  );
  return { schemaRevisionId: published.id, contractHash: published.contractHash };
}

export async function createFixtureEntry(
  fixture: RevisionFixture,
  displayName: string,
  schema: { readonly schemaRevisionId: string; readonly contractHash: string } = fixture,
): Promise<string> {
  const created = await Effect.runPromise(
    entries.createEntry(
      fixture.ownerId,
      Schema.decodeUnknownSync(CreateEntryInput, { onExcessProperty: "error" })({
        projectId: fixture.projectId,
        environmentId: fixture.environmentId,
        collectionId: fixture.collectionId,
        locale: "en",
        displayName,
        schemaRevisionId: schema.schemaRevisionId,
        contractHash: schema.contractHash,
        commandId: randomUUID(),
      }),
      new Date("2026-11-01T10:03:00.000Z"),
      `entry-${randomUUID()}`,
    ),
  );
  return created.id;
}

export async function saveFixtureDraft(
  fixture: RevisionFixture,
  entryId: string,
  values: DraftValues,
  options: {
    readonly actorId?: AuthUserId;
    readonly locale?: string;
    readonly schema?: { readonly schemaRevisionId: string; readonly contractHash: string };
  } = {},
) {
  const actorId = options.actorId ?? fixture.ownerId;
  const locale = options.locale ?? "en";
  const scope = {
    projectId: fixture.projectId,
    environmentId: fixture.environmentId,
    collectionId: fixture.collectionId,
    locale,
    entryId,
  };
  const current = await Effect.runPromise(
    entries.getDraft(
      actorId,
      Schema.decodeUnknownSync(GetEntryDraftInput, { onExcessProperty: "error" })(scope),
    ),
  );
  const mutations = (record: Readonly<Record<string, unknown>> | undefined) =>
    Object.entries(record ?? {}).map(([fieldId, value]) =>
      value === undefined
        ? { operation: "unset", path: [fieldId] }
        : { operation: "set", path: [fieldId], value },
    );
  const schema = options.schema ?? fixture;
  return Effect.runPromise(
    entries.saveDraft(
      actorId,
      Schema.decodeUnknownSync(SaveEntryDraftInput, { onExcessProperty: "error" })({
        ...scope,
        schemaRevisionId: schema.schemaRevisionId,
        contractHash: schema.contractHash,
        commandId: randomUUID(),
        expectedSharedVersion: current.sharedVersion,
        expectedLocalizedVersion: current.localizedVersion,
        sharedMutations: mutations(values.shared),
        localizedMutations: mutations(values.localized),
      }),
      new Date("2026-11-01T10:04:00.000Z"),
      `save-${randomUUID()}`,
    ),
  );
}
