import { relations, sql } from "drizzle-orm";
import {
  boolean,
  char,
  check,
  foreignKey,
  index,
  integer,
  jsonb,
  pgTable,
  primaryKey,
  text,
  timestamp,
  unique,
  uniqueIndex,
  uuid,
  varchar,
} from "drizzle-orm/pg-core";

import { user } from "./auth";
import { environment, project, workspace } from "./platform";

const cmsId = (name: string) =>
  uuid(name)
    .default(sql`uuidv7()`)
    .notNull();
const cmsTimestamp = (name: string) => timestamp(name, { withTimezone: true, mode: "date" });

const persistedFieldKindSql = sql.raw(
  "('short_text', 'long_text', 'rich_text', 'number', 'boolean', 'date', 'date_time', 'enum', 'url', 'email', 'slug', 'json', 'object', 'list', 'reference', 'external_asset')",
);

export const cmsCollection = pgTable(
  "cms_collection",
  {
    id: cmsId("id").primaryKey(),
    workspaceId: uuid("workspace_id").notNull(),
    projectId: uuid("project_id").notNull(),
    environmentId: uuid("environment_id").notNull(),
    apiKey: varchar("api_key", { length: 63 }).notNull(),
    displayName: varchar("display_name", { length: 100 }).notNull(),
    description: varchar("description", { length: 500 }),
    version: integer("version").default(1).notNull(),
    createdByUserId: text("created_by_user_id")
      .notNull()
      .references(() => user.id, { onDelete: "restrict" }),
    changedByUserId: text("changed_by_user_id")
      .notNull()
      .references(() => user.id, { onDelete: "restrict" }),
    createdAt: cmsTimestamp("created_at").defaultNow().notNull(),
    updatedAt: cmsTimestamp("updated_at").defaultNow().notNull(),
  },
  (table) => [
    foreignKey({
      name: "cms_collection_environment_tenant_fk",
      columns: [table.environmentId, table.projectId, table.workspaceId],
      foreignColumns: [environment.id, environment.projectId, environment.workspaceId],
    }).onDelete("restrict"),
    unique("cms_collection_environment_key_unique").on(table.environmentId, table.apiKey),
    unique("cms_collection_id_tenant_unique").on(
      table.id,
      table.environmentId,
      table.projectId,
      table.workspaceId,
    ),
    check(
      "cms_collection_api_key_valid",
      sql`${table.apiKey} ~ '^[a-z][a-z0-9_]{0,62}$' and ${table.apiKey} !~ '__' and right(${table.apiKey}, 1) <> '_'`,
    ),
    check(
      "cms_collection_display_name_valid",
      sql`char_length(${table.displayName}) between 1 and 100 and ${table.displayName} = btrim(${table.displayName}) and ${table.displayName} !~ '[[:cntrl:]]'`,
    ),
    check(
      "cms_collection_description_valid",
      sql`${table.description} is null or (char_length(${table.description}) <= 500 and ${table.description} = btrim(${table.description}) and ${table.description} !~ '[[:cntrl:]]')`,
    ),
    check("cms_collection_version_positive", sql`${table.version} > 0`),
    index("cms_collection_environment_created_id_idx").on(
      table.environmentId,
      table.createdAt.desc(),
      table.id.desc(),
    ),
    index("cms_collection_created_by_user_idx").on(table.createdByUserId),
    index("cms_collection_changed_by_user_idx").on(table.changedByUserId),
  ],
);

export const cmsCollectionField = pgTable(
  "cms_collection_field",
  {
    id: cmsId("id").primaryKey(),
    workspaceId: uuid("workspace_id").notNull(),
    projectId: uuid("project_id").notNull(),
    environmentId: uuid("environment_id").notNull(),
    collectionId: uuid("collection_id").notNull(),
    apiKey: varchar("api_key", { length: 63 }).notNull(),
    displayLabel: varchar("display_label", { length: 100 }).notNull(),
    kind: varchar("kind", { length: 32 }).notNull(),
    required: boolean("required").default(false).notNull(),
    localization: varchar("localization", { length: 16 }).notNull(),
    deprecated: boolean("deprecated").default(false).notNull(),
    position: integer("position"),
    configuration: jsonb("configuration")
      .$type<Readonly<Record<string, unknown>>>()
      .default(sql`'{}'::jsonb`)
      .notNull(),
    createdByUserId: text("created_by_user_id")
      .notNull()
      .references(() => user.id, { onDelete: "restrict" }),
    changedByUserId: text("changed_by_user_id")
      .notNull()
      .references(() => user.id, { onDelete: "restrict" }),
    removedAt: cmsTimestamp("removed_at"),
    removedByUserId: text("removed_by_user_id").references(() => user.id, {
      onDelete: "restrict",
    }),
    createdAt: cmsTimestamp("created_at").defaultNow().notNull(),
    updatedAt: cmsTimestamp("updated_at").defaultNow().notNull(),
  },
  (table) => [
    foreignKey({
      name: "cms_field_collection_tenant_fk",
      columns: [table.collectionId, table.environmentId, table.projectId, table.workspaceId],
      foreignColumns: [
        cmsCollection.id,
        cmsCollection.environmentId,
        cmsCollection.projectId,
        cmsCollection.workspaceId,
      ],
    }).onDelete("restrict"),
    unique("cms_field_id_collection_tenant_unique").on(
      table.id,
      table.collectionId,
      table.environmentId,
      table.projectId,
      table.workspaceId,
    ),
    uniqueIndex("cms_field_collection_active_key_unique")
      .on(table.collectionId, table.apiKey)
      .where(sql`${table.removedAt} is null`),
    uniqueIndex("cms_field_collection_active_position_unique")
      .on(table.collectionId, table.position)
      .where(sql`${table.removedAt} is null`),
    check(
      "cms_field_api_key_valid",
      sql`${table.apiKey} ~ '^[a-z][a-z0-9_]{0,62}$' and ${table.apiKey} !~ '__' and right(${table.apiKey}, 1) <> '_'`,
    ),
    check(
      "cms_field_display_label_valid",
      sql`char_length(${table.displayLabel}) between 1 and 100 and ${table.displayLabel} = btrim(${table.displayLabel}) and ${table.displayLabel} !~ '[[:cntrl:]]'`,
    ),
    check("cms_field_kind_valid", sql`${table.kind} in ${persistedFieldKindSql}`),
    check("cms_field_localization_valid", sql`${table.localization} in ('localized', 'shared')`),
    check(
      "cms_field_configuration_valid",
      sql`jsonb_typeof(${table.configuration}) = 'object' and octet_length(${table.configuration}::text) <= 8192`,
    ),
    check(
      "cms_field_lifecycle_consistent",
      sql`(${table.removedAt} is null and ${table.removedByUserId} is null and ${table.position} between 0 and 99) or (${table.removedAt} is not null and ${table.removedByUserId} is not null and ${table.position} is null)`,
    ),
    index("cms_field_collection_active_position_id_idx")
      .on(table.collectionId, table.position, table.id)
      .where(sql`${table.removedAt} is null`),
    index("cms_field_collection_idx").on(table.collectionId),
    index("cms_field_created_by_user_idx").on(table.createdByUserId),
    index("cms_field_changed_by_user_idx").on(table.changedByUserId),
    index("cms_field_removed_by_user_idx")
      .on(table.removedByUserId)
      .where(sql`${table.removedByUserId} is not null`),
  ],
);

export const cmsSchemaRevision = pgTable(
  "cms_schema_revision",
  {
    id: cmsId("id").primaryKey(),
    workspaceId: uuid("workspace_id").notNull(),
    projectId: uuid("project_id").notNull(),
    environmentId: uuid("environment_id").notNull(),
    collectionId: uuid("collection_id").notNull(),
    sequence: integer("sequence").notNull(),
    previousRevisionId: uuid("previous_revision_id"),
    collectionApiKey: varchar("collection_api_key", { length: 63 }).notNull(),
    collectionDisplayName: varchar("collection_display_name", { length: 100 }).notNull(),
    collectionDescription: varchar("collection_description", { length: 500 }),
    schemaHash: char("schema_hash", { length: 64 }).notNull(),
    commandId: uuid("command_id").notNull(),
    commandFingerprint: char("command_fingerprint", { length: 64 }).notNull(),
    nonBreakingChangeCount: integer("non_breaking_change_count").default(0).notNull(),
    potentiallyBreakingChangeCount: integer("potentially_breaking_change_count")
      .default(0)
      .notNull(),
    breakingChangeCount: integer("breaking_change_count").default(0).notNull(),
    publishedByUserId: text("published_by_user_id")
      .notNull()
      .references(() => user.id, { onDelete: "restrict" }),
    publishedAt: cmsTimestamp("published_at").defaultNow().notNull(),
  },
  (table) => [
    foreignKey({
      name: "cms_revision_collection_tenant_fk",
      columns: [table.collectionId, table.environmentId, table.projectId, table.workspaceId],
      foreignColumns: [
        cmsCollection.id,
        cmsCollection.environmentId,
        cmsCollection.projectId,
        cmsCollection.workspaceId,
      ],
    }).onDelete("restrict"),
    foreignKey({
      name: "cms_revision_previous_tenant_fk",
      columns: [
        table.previousRevisionId,
        table.collectionId,
        table.environmentId,
        table.projectId,
        table.workspaceId,
      ],
      foreignColumns: [
        table.id,
        table.collectionId,
        table.environmentId,
        table.projectId,
        table.workspaceId,
      ],
    }).onDelete("restrict"),
    unique("cms_revision_collection_sequence_unique").on(table.collectionId, table.sequence),
    unique("cms_revision_collection_command_unique").on(table.collectionId, table.commandId),
    unique("cms_revision_id_collection_tenant_unique").on(
      table.id,
      table.collectionId,
      table.environmentId,
      table.projectId,
      table.workspaceId,
    ),
    unique("cms_revision_id_tenant_unique").on(
      table.id,
      table.environmentId,
      table.projectId,
      table.workspaceId,
    ),
    unique("cms_revision_id_scope_sequence_unique").on(
      table.id,
      table.collectionId,
      table.environmentId,
      table.projectId,
      table.workspaceId,
      table.sequence,
    ),
    check("cms_revision_sequence_positive", sql`${table.sequence} > 0`),
    check(
      "cms_revision_previous_consistent",
      sql`(${table.sequence} = 1 and ${table.previousRevisionId} is null) or (${table.sequence} > 1 and ${table.previousRevisionId} is not null)`,
    ),
    check(
      "cms_revision_collection_key_valid",
      sql`${table.collectionApiKey} ~ '^[a-z][a-z0-9_]{0,62}$' and ${table.collectionApiKey} !~ '__' and right(${table.collectionApiKey}, 1) <> '_'`,
    ),
    check(
      "cms_revision_collection_name_valid",
      sql`char_length(${table.collectionDisplayName}) between 1 and 100 and ${table.collectionDisplayName} = btrim(${table.collectionDisplayName}) and ${table.collectionDisplayName} !~ '[[:cntrl:]]'`,
    ),
    check(
      "cms_revision_collection_description_valid",
      sql`${table.collectionDescription} is null or (char_length(${table.collectionDescription}) <= 500 and ${table.collectionDescription} = btrim(${table.collectionDescription}) and ${table.collectionDescription} !~ '[[:cntrl:]]')`,
    ),
    check("cms_revision_schema_hash_valid", sql`${table.schemaHash} ~ '^[0-9a-f]{64}$'`),
    check(
      "cms_revision_command_fingerprint_valid",
      sql`${table.commandFingerprint} ~ '^[0-9a-f]{64}$'`,
    ),
    check(
      "cms_revision_change_counts_valid",
      sql`${table.nonBreakingChangeCount} >= 0 and ${table.potentiallyBreakingChangeCount} >= 0 and ${table.breakingChangeCount} >= 0`,
    ),
    index("cms_revision_collection_sequence_desc_idx").on(
      table.collectionId,
      table.sequence.desc(),
    ),
    index("cms_revision_previous_revision_idx")
      .on(table.previousRevisionId)
      .where(sql`${table.previousRevisionId} is not null`),
    index("cms_revision_published_by_user_idx").on(table.publishedByUserId),
  ],
);

export const cmsSchemaRevisionField = pgTable(
  "cms_schema_revision_field",
  {
    revisionId: uuid("revision_id").notNull(),
    fieldId: uuid("field_id").notNull(),
    workspaceId: uuid("workspace_id").notNull(),
    projectId: uuid("project_id").notNull(),
    environmentId: uuid("environment_id").notNull(),
    collectionId: uuid("collection_id").notNull(),
    apiKey: varchar("api_key", { length: 63 }).notNull(),
    displayLabel: varchar("display_label", { length: 100 }).notNull(),
    kind: varchar("kind", { length: 32 }).notNull(),
    required: boolean("required").notNull(),
    localization: varchar("localization", { length: 16 }).notNull(),
    deprecated: boolean("deprecated").notNull(),
    position: integer("position").notNull(),
    configuration: jsonb("configuration").$type<Readonly<Record<string, unknown>>>().notNull(),
  },
  (table) => [
    primaryKey({
      name: "cms_revision_field_revision_field_pk",
      columns: [table.revisionId, table.fieldId],
    }),
    foreignKey({
      name: "cms_revision_field_revision_tenant_fk",
      columns: [
        table.revisionId,
        table.collectionId,
        table.environmentId,
        table.projectId,
        table.workspaceId,
      ],
      foreignColumns: [
        cmsSchemaRevision.id,
        cmsSchemaRevision.collectionId,
        cmsSchemaRevision.environmentId,
        cmsSchemaRevision.projectId,
        cmsSchemaRevision.workspaceId,
      ],
    }).onDelete("restrict"),
    foreignKey({
      name: "cms_revision_field_stable_field_tenant_fk",
      columns: [
        table.fieldId,
        table.collectionId,
        table.environmentId,
        table.projectId,
        table.workspaceId,
      ],
      foreignColumns: [
        cmsCollectionField.id,
        cmsCollectionField.collectionId,
        cmsCollectionField.environmentId,
        cmsCollectionField.projectId,
        cmsCollectionField.workspaceId,
      ],
    }).onDelete("restrict"),
    unique("cms_revision_field_revision_key_unique").on(table.revisionId, table.apiKey),
    unique("cms_revision_field_revision_position_unique").on(table.revisionId, table.position),
    check(
      "cms_revision_field_api_key_valid",
      sql`${table.apiKey} ~ '^[a-z][a-z0-9_]{0,62}$' and ${table.apiKey} !~ '__' and right(${table.apiKey}, 1) <> '_'`,
    ),
    check(
      "cms_revision_field_label_valid",
      sql`char_length(${table.displayLabel}) between 1 and 100 and ${table.displayLabel} = btrim(${table.displayLabel}) and ${table.displayLabel} !~ '[[:cntrl:]]'`,
    ),
    check("cms_revision_field_kind_valid", sql`${table.kind} in ${persistedFieldKindSql}`),
    check(
      "cms_revision_field_localization_valid",
      sql`${table.localization} in ('localized', 'shared')`,
    ),
    check("cms_revision_field_position_valid", sql`${table.position} between 0 and 99`),
    check(
      "cms_revision_field_configuration_valid",
      sql`jsonb_typeof(${table.configuration}) = 'object' and octet_length(${table.configuration}::text) <= 8192`,
    ),
    index("cms_revision_field_revision_position_idx").on(
      table.revisionId,
      table.position,
      table.fieldId,
    ),
    index("cms_revision_field_stable_field_idx").on(table.fieldId),
  ],
);

export const cmsCollectionSchemaHead = pgTable(
  "cms_collection_schema_head",
  {
    collectionId: uuid("collection_id").primaryKey(),
    workspaceId: uuid("workspace_id").notNull(),
    projectId: uuid("project_id").notNull(),
    environmentId: uuid("environment_id").notNull(),
    draftVersion: integer("draft_version").default(1).notNull(),
    draftBaseRevisionId: uuid("draft_base_revision_id"),
    currentPublishedRevisionId: uuid("current_published_revision_id"),
    currentPublishedSequence: integer("current_published_sequence").default(0).notNull(),
    changedByUserId: text("changed_by_user_id")
      .notNull()
      .references(() => user.id, { onDelete: "restrict" }),
    updatedAt: cmsTimestamp("updated_at").defaultNow().notNull(),
  },
  (table) => [
    foreignKey({
      name: "cms_head_collection_tenant_fk",
      columns: [table.collectionId, table.environmentId, table.projectId, table.workspaceId],
      foreignColumns: [
        cmsCollection.id,
        cmsCollection.environmentId,
        cmsCollection.projectId,
        cmsCollection.workspaceId,
      ],
    }).onDelete("restrict"),
    foreignKey({
      name: "cms_head_draft_base_revision_fk",
      columns: [
        table.draftBaseRevisionId,
        table.collectionId,
        table.environmentId,
        table.projectId,
        table.workspaceId,
      ],
      foreignColumns: [
        cmsSchemaRevision.id,
        cmsSchemaRevision.collectionId,
        cmsSchemaRevision.environmentId,
        cmsSchemaRevision.projectId,
        cmsSchemaRevision.workspaceId,
      ],
    }).onDelete("restrict"),
    foreignKey({
      name: "cms_head_current_revision_sequence_fk",
      columns: [
        table.currentPublishedRevisionId,
        table.collectionId,
        table.environmentId,
        table.projectId,
        table.workspaceId,
        table.currentPublishedSequence,
      ],
      foreignColumns: [
        cmsSchemaRevision.id,
        cmsSchemaRevision.collectionId,
        cmsSchemaRevision.environmentId,
        cmsSchemaRevision.projectId,
        cmsSchemaRevision.workspaceId,
        cmsSchemaRevision.sequence,
      ],
    }).onDelete("restrict"),
    check("cms_head_draft_version_positive", sql`${table.draftVersion} > 0`),
    check(
      "cms_head_publication_consistent",
      sql`(${table.draftBaseRevisionId} is null and ${table.currentPublishedRevisionId} is null and ${table.currentPublishedSequence} = 0) or (${table.draftBaseRevisionId} is not null and ${table.currentPublishedRevisionId} is not null and ${table.currentPublishedSequence} > 0)`,
    ),
    index("cms_head_draft_base_revision_idx")
      .on(table.draftBaseRevisionId)
      .where(sql`${table.draftBaseRevisionId} is not null`),
    index("cms_head_current_published_revision_idx")
      .on(table.currentPublishedRevisionId)
      .where(sql`${table.currentPublishedRevisionId} is not null`),
    index("cms_head_changed_by_user_idx").on(table.changedByUserId),
  ],
);

export const outboxEvent = pgTable(
  "outbox_event",
  {
    id: cmsId("id").primaryKey(),
    workspaceId: uuid("workspace_id").notNull(),
    projectId: uuid("project_id").notNull(),
    environmentId: uuid("environment_id").notNull(),
    eventType: varchar("event_type", { length: 128 }).notNull(),
    subjectType: varchar("subject_type", { length: 64 }).notNull(),
    subjectId: uuid("subject_id").notNull(),
    schemaRevisionId: uuid("schema_revision_id"),
    aggregateSequence: integer("aggregate_sequence").notNull(),
    payload: jsonb("payload").$type<Readonly<Record<string, unknown>>>().notNull(),
    occurredAt: cmsTimestamp("occurred_at").defaultNow().notNull(),
    availableAt: cmsTimestamp("available_at").defaultNow().notNull(),
    processedAt: cmsTimestamp("processed_at"),
    attemptCount: integer("attempt_count").default(0).notNull(),
  },
  (table) => [
    foreignKey({
      name: "outbox_event_environment_tenant_fk",
      columns: [table.environmentId, table.projectId, table.workspaceId],
      foreignColumns: [environment.id, environment.projectId, environment.workspaceId],
    }).onDelete("restrict"),
    foreignKey({
      name: "outbox_event_schema_revision_tenant_fk",
      columns: [table.schemaRevisionId, table.environmentId, table.projectId, table.workspaceId],
      foreignColumns: [
        cmsSchemaRevision.id,
        cmsSchemaRevision.environmentId,
        cmsSchemaRevision.projectId,
        cmsSchemaRevision.workspaceId,
      ],
    }).onDelete("restrict"),
    unique("outbox_event_logical_sequence_unique").on(
      table.eventType,
      table.subjectId,
      table.aggregateSequence,
    ),
    check("outbox_event_type_valid", sql`${table.eventType} ~ '^[a-z][a-z0-9_.-]{0,127}$'`),
    check(
      "outbox_event_subject_type_valid",
      sql`${table.subjectType} ~ '^[a-z][a-z0-9_.-]{0,63}$'`,
    ),
    check("outbox_event_sequence_positive", sql`${table.aggregateSequence} > 0`),
    check(
      "outbox_event_payload_valid",
      sql`jsonb_typeof(${table.payload}) = 'object' and octet_length(${table.payload}::text) <= 16384`,
    ),
    check(
      "outbox_event_schema_publication_valid",
      sql`${table.eventType} <> 'cms.schema.published' or (${table.subjectType} = 'cms.collection' and ${table.schemaRevisionId} is not null)`,
    ),
    check("outbox_event_availability_valid", sql`${table.availableAt} >= ${table.occurredAt}`),
    check("outbox_event_attempt_count_valid", sql`${table.attemptCount} >= 0`),
    index("outbox_event_pending_available_id_idx")
      .on(table.availableAt, table.id)
      .where(sql`${table.processedAt} is null`),
    index("outbox_event_environment_idx").on(table.environmentId),
    index("outbox_event_schema_revision_idx")
      .on(table.schemaRevisionId)
      .where(sql`${table.schemaRevisionId} is not null`),
  ],
);

export const cmsCollectionRelations = relations(cmsCollection, ({ one, many }) => ({
  workspace: one(workspace, {
    fields: [cmsCollection.workspaceId],
    references: [workspace.id],
  }),
  project: one(project, {
    fields: [cmsCollection.projectId, cmsCollection.workspaceId],
    references: [project.id, project.workspaceId],
  }),
  environment: one(environment, {
    fields: [cmsCollection.environmentId, cmsCollection.projectId, cmsCollection.workspaceId],
    references: [environment.id, environment.projectId, environment.workspaceId],
  }),
  creator: one(user, {
    relationName: "cmsCollectionCreator",
    fields: [cmsCollection.createdByUserId],
    references: [user.id],
  }),
  changedBy: one(user, {
    relationName: "cmsCollectionChanger",
    fields: [cmsCollection.changedByUserId],
    references: [user.id],
  }),
  fields: many(cmsCollectionField),
  revisions: many(cmsSchemaRevision),
  schemaHead: one(cmsCollectionSchemaHead),
}));

export const cmsCollectionFieldRelations = relations(cmsCollectionField, ({ one, many }) => ({
  collection: one(cmsCollection, {
    fields: [
      cmsCollectionField.collectionId,
      cmsCollectionField.environmentId,
      cmsCollectionField.projectId,
      cmsCollectionField.workspaceId,
    ],
    references: [
      cmsCollection.id,
      cmsCollection.environmentId,
      cmsCollection.projectId,
      cmsCollection.workspaceId,
    ],
  }),
  creator: one(user, {
    relationName: "cmsCollectionFieldCreator",
    fields: [cmsCollectionField.createdByUserId],
    references: [user.id],
  }),
  changedBy: one(user, {
    relationName: "cmsCollectionFieldChanger",
    fields: [cmsCollectionField.changedByUserId],
    references: [user.id],
  }),
  removedBy: one(user, {
    relationName: "cmsCollectionFieldRemover",
    fields: [cmsCollectionField.removedByUserId],
    references: [user.id],
  }),
  revisionSnapshots: many(cmsSchemaRevisionField),
}));

export const cmsSchemaRevisionRelations = relations(cmsSchemaRevision, ({ one, many }) => ({
  collection: one(cmsCollection, {
    fields: [
      cmsSchemaRevision.collectionId,
      cmsSchemaRevision.environmentId,
      cmsSchemaRevision.projectId,
      cmsSchemaRevision.workspaceId,
    ],
    references: [
      cmsCollection.id,
      cmsCollection.environmentId,
      cmsCollection.projectId,
      cmsCollection.workspaceId,
    ],
  }),
  previousRevision: one(cmsSchemaRevision, {
    relationName: "cmsSchemaRevisionLineage",
    fields: [
      cmsSchemaRevision.previousRevisionId,
      cmsSchemaRevision.collectionId,
      cmsSchemaRevision.environmentId,
      cmsSchemaRevision.projectId,
      cmsSchemaRevision.workspaceId,
    ],
    references: [
      cmsSchemaRevision.id,
      cmsSchemaRevision.collectionId,
      cmsSchemaRevision.environmentId,
      cmsSchemaRevision.projectId,
      cmsSchemaRevision.workspaceId,
    ],
  }),
  nextRevisions: many(cmsSchemaRevision, {
    relationName: "cmsSchemaRevisionLineage",
  }),
  publisher: one(user, {
    relationName: "cmsSchemaRevisionPublisher",
    fields: [cmsSchemaRevision.publishedByUserId],
    references: [user.id],
  }),
  fields: many(cmsSchemaRevisionField),
  outboxEvents: many(outboxEvent),
}));

export const cmsSchemaRevisionFieldRelations = relations(cmsSchemaRevisionField, ({ one }) => ({
  revision: one(cmsSchemaRevision, {
    fields: [
      cmsSchemaRevisionField.revisionId,
      cmsSchemaRevisionField.collectionId,
      cmsSchemaRevisionField.environmentId,
      cmsSchemaRevisionField.projectId,
      cmsSchemaRevisionField.workspaceId,
    ],
    references: [
      cmsSchemaRevision.id,
      cmsSchemaRevision.collectionId,
      cmsSchemaRevision.environmentId,
      cmsSchemaRevision.projectId,
      cmsSchemaRevision.workspaceId,
    ],
  }),
  stableField: one(cmsCollectionField, {
    fields: [
      cmsSchemaRevisionField.fieldId,
      cmsSchemaRevisionField.collectionId,
      cmsSchemaRevisionField.environmentId,
      cmsSchemaRevisionField.projectId,
      cmsSchemaRevisionField.workspaceId,
    ],
    references: [
      cmsCollectionField.id,
      cmsCollectionField.collectionId,
      cmsCollectionField.environmentId,
      cmsCollectionField.projectId,
      cmsCollectionField.workspaceId,
    ],
  }),
}));

export const cmsCollectionSchemaHeadRelations = relations(cmsCollectionSchemaHead, ({ one }) => ({
  collection: one(cmsCollection, {
    fields: [
      cmsCollectionSchemaHead.collectionId,
      cmsCollectionSchemaHead.environmentId,
      cmsCollectionSchemaHead.projectId,
      cmsCollectionSchemaHead.workspaceId,
    ],
    references: [
      cmsCollection.id,
      cmsCollection.environmentId,
      cmsCollection.projectId,
      cmsCollection.workspaceId,
    ],
  }),
  draftBaseRevision: one(cmsSchemaRevision, {
    relationName: "cmsSchemaHeadDraftBase",
    fields: [
      cmsCollectionSchemaHead.draftBaseRevisionId,
      cmsCollectionSchemaHead.collectionId,
      cmsCollectionSchemaHead.environmentId,
      cmsCollectionSchemaHead.projectId,
      cmsCollectionSchemaHead.workspaceId,
    ],
    references: [
      cmsSchemaRevision.id,
      cmsSchemaRevision.collectionId,
      cmsSchemaRevision.environmentId,
      cmsSchemaRevision.projectId,
      cmsSchemaRevision.workspaceId,
    ],
  }),
  currentPublishedRevision: one(cmsSchemaRevision, {
    relationName: "cmsSchemaHeadCurrentPublished",
    fields: [
      cmsCollectionSchemaHead.currentPublishedRevisionId,
      cmsCollectionSchemaHead.collectionId,
      cmsCollectionSchemaHead.environmentId,
      cmsCollectionSchemaHead.projectId,
      cmsCollectionSchemaHead.workspaceId,
      cmsCollectionSchemaHead.currentPublishedSequence,
    ],
    references: [
      cmsSchemaRevision.id,
      cmsSchemaRevision.collectionId,
      cmsSchemaRevision.environmentId,
      cmsSchemaRevision.projectId,
      cmsSchemaRevision.workspaceId,
      cmsSchemaRevision.sequence,
    ],
  }),
  changedBy: one(user, {
    relationName: "cmsSchemaHeadChanger",
    fields: [cmsCollectionSchemaHead.changedByUserId],
    references: [user.id],
  }),
}));

export const outboxEventRelations = relations(outboxEvent, ({ one }) => ({
  workspace: one(workspace, {
    fields: [outboxEvent.workspaceId],
    references: [workspace.id],
  }),
  project: one(project, {
    fields: [outboxEvent.projectId, outboxEvent.workspaceId],
    references: [project.id, project.workspaceId],
  }),
  environment: one(environment, {
    fields: [outboxEvent.environmentId, outboxEvent.projectId, outboxEvent.workspaceId],
    references: [environment.id, environment.projectId, environment.workspaceId],
  }),
  schemaRevision: one(cmsSchemaRevision, {
    fields: [
      outboxEvent.schemaRevisionId,
      outboxEvent.environmentId,
      outboxEvent.projectId,
      outboxEvent.workspaceId,
    ],
    references: [
      cmsSchemaRevision.id,
      cmsSchemaRevision.environmentId,
      cmsSchemaRevision.projectId,
      cmsSchemaRevision.workspaceId,
    ],
  }),
}));
