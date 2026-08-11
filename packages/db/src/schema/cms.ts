// Defines tenant-scoped CMS schemas, immutable schema/content history, draft heads, and outbox persistence.

import { relations, sql } from "drizzle-orm";
import {
  bigint,
  boolean,
  char,
  check,
  date,
  doublePrecision,
  foreignKey,
  index,
  integer,
  jsonb,
  numeric,
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
import { projectLocale } from "./locale";
import { environment, project, workspace } from "./platform";

const cmsId = (name: string) =>
  uuid(name)
    .default(sql`uuidv7()`)
    .notNull();
const cmsTimestamp = (name: string) => timestamp(name, { withTimezone: true, mode: "date" });

const persistedFieldKindSql = sql.raw(
  "('short_text', 'long_text', 'rich_text', 'number', 'decimal', 'money', 'boolean', 'date', 'date_time', 'enum', 'url', 'email', 'slug', 'json', 'object', 'list', 'reference', 'external_asset')",
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
    parentFieldId: uuid("parent_field_id"),
    nodeRole: varchar("node_role", { length: 32 }).default("root").notNull(),
    referenceCollectionId: uuid("reference_collection_id"),
    apiKey: varchar("api_key", { length: 63 }),
    displayLabel: varchar("display_label", { length: 100 }),
    kind: varchar("kind", { length: 32 }).notNull(),
    required: boolean("required").default(false),
    localization: varchar("localization", { length: 16 }),
    deprecated: boolean("deprecated").default(false).notNull(),
    position: integer("position"),
    editorMetadata: jsonb("editor_metadata")
      .$type<Readonly<Record<string, unknown>>>()
      .default(sql`'{}'::jsonb`)
      .notNull(),
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
    foreignKey({
      name: "cms_field_parent_tenant_fk",
      columns: [
        table.parentFieldId,
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
    foreignKey({
      name: "cms_field_reference_collection_tenant_fk",
      columns: [
        table.referenceCollectionId,
        table.environmentId,
        table.projectId,
        table.workspaceId,
      ],
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
    uniqueIndex("cms_field_collection_active_root_key_unique")
      .on(table.collectionId, table.apiKey)
      .where(sql`${table.removedAt} is null and ${table.nodeRole} = 'root'`),
    uniqueIndex("cms_field_collection_active_child_key_unique")
      .on(table.collectionId, table.parentFieldId, table.apiKey)
      .where(sql`${table.removedAt} is null and ${table.nodeRole} = 'object_property'`),
    uniqueIndex("cms_field_collection_active_root_position_unique")
      .on(table.collectionId, table.position)
      .where(sql`${table.removedAt} is null and ${table.nodeRole} = 'root'`),
    uniqueIndex("cms_field_collection_active_child_position_unique")
      .on(table.collectionId, table.parentFieldId, table.position)
      .where(sql`${table.removedAt} is null and ${table.nodeRole} = 'object_property'`),
    uniqueIndex("cms_field_collection_active_list_item_unique")
      .on(table.collectionId, table.parentFieldId)
      .where(sql`${table.removedAt} is null and ${table.nodeRole} = 'list_item'`),
    check(
      "cms_field_node_role_valid",
      sql`${table.nodeRole} in ('root', 'object_property', 'list_item') and ((${table.nodeRole} = 'root' and ${table.parentFieldId} is null) or (${table.nodeRole} <> 'root' and ${table.parentFieldId} is not null))`,
    ),
    check(
      "cms_field_not_self_parented",
      sql`${table.parentFieldId} is null or ${table.parentFieldId} <> ${table.id}`,
    ),
    check(
      "cms_field_api_key_valid",
      sql`(${table.nodeRole} = 'list_item' and ${table.apiKey} is null) or (${table.nodeRole} <> 'list_item' and ${table.apiKey} ~ '^[a-z][a-z0-9_]{0,62}$' and ${table.apiKey} !~ '__' and right(${table.apiKey}, 1) <> '_')`,
    ),
    check(
      "cms_field_display_label_valid",
      sql`(${table.nodeRole} = 'list_item' and ${table.displayLabel} is null) or (${table.nodeRole} <> 'list_item' and char_length(${table.displayLabel}) between 1 and 100 and ${table.displayLabel} = btrim(${table.displayLabel}) and ${table.displayLabel} !~ '[[:cntrl:]]')`,
    ),
    check("cms_field_kind_valid", sql`${table.kind} in ${persistedFieldKindSql}`),
    check(
      "cms_field_localization_valid",
      sql`(${table.nodeRole} = 'root' and ${table.localization} in ('localized', 'shared', 'mixed')) or (${table.nodeRole} = 'object_property' and (${table.localization} is null or ${table.localization} in ('localized', 'shared', 'mixed'))) or (${table.nodeRole} = 'list_item' and ${table.localization} is null)`,
    ),
    check(
      "cms_field_mixed_object_valid",
      sql`${table.localization} is distinct from 'mixed' or (${table.kind} = 'object' and ${table.required} is null and not (${table.configuration} ? 'default'))`,
    ),
    check(
      "cms_field_required_valid",
      sql`(${table.nodeRole} = 'list_item' and ${table.required} is null) or (${table.nodeRole} <> 'list_item' and ((${table.localization} = 'mixed' and ${table.required} is null) or (${table.localization} is distinct from 'mixed' and ${table.required} is not null)))`,
    ),
    check(
      "cms_field_reference_target_valid",
      sql`(${table.kind} = 'reference' and ${table.referenceCollectionId} is not null) or (${table.kind} <> 'reference' and ${table.referenceCollectionId} is null)`,
    ),
    check(
      "cms_field_editor_metadata_valid",
      sql`jsonb_typeof(${table.editorMetadata}) = 'object' and octet_length(${table.editorMetadata}::text) <= 8192`,
    ),
    check(
      "cms_field_configuration_valid",
      sql`jsonb_typeof(${table.configuration}) = 'object' and octet_length(${table.configuration}::text) <= 327680`,
    ),
    check(
      "cms_field_lifecycle_consistent",
      sql`(${table.removedAt} is null and ${table.removedByUserId} is null and ((${table.nodeRole} = 'list_item' and ${table.position} = 0) or (${table.nodeRole} <> 'list_item' and ${table.position} between 0 and 99))) or (${table.removedAt} is not null and ${table.removedByUserId} is not null and ${table.position} is null)`,
    ),
    index("cms_field_collection_parent_position_id_idx")
      .on(table.collectionId, table.parentFieldId, table.position, table.id)
      .where(sql`${table.removedAt} is null`),
    index("cms_field_parent_idx")
      .on(table.parentFieldId)
      .where(sql`${table.parentFieldId} is not null`),
    index("cms_field_reference_collection_idx")
      .on(table.referenceCollectionId)
      .where(sql`${table.referenceCollectionId} is not null`),
    index("cms_field_collection_idx").on(table.collectionId),
    index("cms_field_created_by_user_idx").on(table.createdByUserId),
    index("cms_field_changed_by_user_idx").on(table.changedByUserId),
    index("cms_field_removed_by_user_idx")
      .on(table.removedByUserId)
      .where(sql`${table.removedByUserId} is not null`),
  ],
);

export const cmsCollectionDeliveryConfig = pgTable(
  "cms_collection_delivery_config",
  {
    collectionId: uuid("collection_id").primaryKey(),
    workspaceId: uuid("workspace_id").notNull(),
    projectId: uuid("project_id").notNull(),
    environmentId: uuid("environment_id").notNull(),
    access: varchar("access", { length: 16 }).default("protected").notNull(),
    version: integer("version").default(1).notNull(),
    changedByUserId: text("changed_by_user_id")
      .notNull()
      .references(() => user.id, { onDelete: "restrict" }),
    createdAt: cmsTimestamp("created_at").defaultNow().notNull(),
    updatedAt: cmsTimestamp("updated_at").defaultNow().notNull(),
  },
  (table) => [
    foreignKey({
      name: "cms_collection_delivery_config_tenant_fk",
      columns: [table.collectionId, table.environmentId, table.projectId, table.workspaceId],
      foreignColumns: [
        cmsCollection.id,
        cmsCollection.environmentId,
        cmsCollection.projectId,
        cmsCollection.workspaceId,
      ],
    }).onDelete("restrict"),
    unique("cms_collection_delivery_config_scope_unique").on(
      table.collectionId,
      table.environmentId,
      table.projectId,
      table.workspaceId,
    ),
    check(
      "cms_collection_delivery_config_access_valid",
      sql`${table.access} in ('protected', 'public')`,
    ),
    check("cms_collection_delivery_config_version_positive", sql`${table.version} > 0`),
    index("cms_collection_delivery_config_environment_idx").on(
      table.environmentId,
      table.collectionId,
    ),
    index("cms_collection_delivery_config_changed_by_user_idx").on(table.changedByUserId),
  ],
);

export const cmsCollectionDeliveryField = pgTable(
  "cms_collection_delivery_field",
  {
    collectionId: uuid("collection_id").notNull(),
    fieldId: uuid("field_id").notNull(),
    workspaceId: uuid("workspace_id").notNull(),
    projectId: uuid("project_id").notNull(),
    environmentId: uuid("environment_id").notNull(),
    filterable: boolean("filterable").default(false).notNull(),
    sortable: boolean("sortable").default(false).notNull(),
    uniqueLookup: boolean("unique_lookup").default(false).notNull(),
  },
  (table) => [
    primaryKey({
      name: "cms_collection_delivery_field_pk",
      columns: [table.collectionId, table.fieldId],
    }),
    foreignKey({
      name: "cms_collection_delivery_field_config_fk",
      columns: [table.collectionId, table.environmentId, table.projectId, table.workspaceId],
      foreignColumns: [
        cmsCollectionDeliveryConfig.collectionId,
        cmsCollectionDeliveryConfig.environmentId,
        cmsCollectionDeliveryConfig.projectId,
        cmsCollectionDeliveryConfig.workspaceId,
      ],
    }).onDelete("restrict"),
    foreignKey({
      name: "cms_collection_delivery_field_tenant_fk",
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
    check(
      "cms_collection_delivery_field_enabled",
      sql`${table.filterable} or ${table.sortable} or ${table.uniqueLookup}`,
    ),
    check(
      "cms_collection_delivery_field_unique_filterable",
      sql`not ${table.uniqueLookup} or ${table.filterable}`,
    ),
    index("cms_collection_delivery_field_field_idx").on(table.fieldId),
  ],
);

export const cmsCollectionLocaleDeliveryState = pgTable(
  "cms_collection_locale_delivery_state",
  {
    collectionId: uuid("collection_id").notNull(),
    localeId: uuid("locale_id").notNull(),
    workspaceId: uuid("workspace_id").notNull(),
    projectId: uuid("project_id").notNull(),
    environmentId: uuid("environment_id").notNull(),
    generation: bigint("generation", { mode: "bigint" }).notNull(),
    lastChangedAt: cmsTimestamp("last_changed_at").defaultNow().notNull(),
  },
  (table) => [
    primaryKey({
      name: "cms_collection_locale_delivery_state_pk",
      columns: [table.collectionId, table.localeId],
    }),
    foreignKey({
      name: "cms_collection_locale_delivery_state_collection_fk",
      columns: [table.collectionId, table.environmentId, table.projectId, table.workspaceId],
      foreignColumns: [
        cmsCollection.id,
        cmsCollection.environmentId,
        cmsCollection.projectId,
        cmsCollection.workspaceId,
      ],
    }).onDelete("restrict"),
    foreignKey({
      name: "cms_collection_locale_delivery_state_locale_fk",
      columns: [table.localeId, table.projectId, table.workspaceId],
      foreignColumns: [projectLocale.id, projectLocale.projectId, projectLocale.workspaceId],
    }).onDelete("restrict"),
    check("cms_collection_locale_delivery_state_generation_positive", sql`${table.generation} > 0`),
    index("cms_collection_locale_delivery_state_locale_idx").on(table.localeId, table.collectionId),
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
    formatVersion: integer("format_version").default(1).notNull(),
    validationProfile: varchar("validation_profile", { length: 64 }).default("legacy-m5").notNull(),
    currencyRegistryProfile: varchar("currency_registry_profile", { length: 64 }),
    editorLayout: jsonb("editor_layout").$type<Readonly<Record<string, unknown>>>(),
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
    check("cms_revision_format_version_valid", sql`${table.formatVersion} in (1, 2)`),
    check(
      "cms_revision_validation_profile_valid",
      sql`${table.validationProfile} ~ '^[a-z0-9][a-z0-9@._-]{0,63}$'`,
    ),
    check(
      "cms_revision_currency_profile_valid",
      sql`${table.currencyRegistryProfile} is null or ${table.currencyRegistryProfile} ~ '^iso-4217@[0-9]{4}-[0-9]{2}-[0-9]{2}$'`,
    ),
    check(
      "cms_revision_editor_layout_valid",
      sql`${table.editorLayout} is null or (jsonb_typeof(${table.editorLayout}) = 'object' and octet_length(${table.editorLayout}::text) <= 32768)`,
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
    parentFieldId: uuid("parent_field_id"),
    nodeRole: varchar("node_role", { length: 32 }).default("root").notNull(),
    referenceCollectionId: uuid("reference_collection_id"),
    apiKey: varchar("api_key", { length: 63 }),
    displayLabel: varchar("display_label", { length: 100 }),
    kind: varchar("kind", { length: 32 }).notNull(),
    required: boolean("required"),
    localization: varchar("localization", { length: 16 }),
    deprecated: boolean("deprecated").notNull(),
    position: integer("position").notNull(),
    editorMetadata: jsonb("editor_metadata")
      .$type<Readonly<Record<string, unknown>>>()
      .default(sql`'{}'::jsonb`)
      .notNull(),
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
      name: "cms_revision_field_parent_fk",
      columns: [table.revisionId, table.parentFieldId],
      foreignColumns: [table.revisionId, table.fieldId],
    }).onDelete("restrict"),
    foreignKey({
      name: "cms_revision_field_reference_collection_tenant_fk",
      columns: [
        table.referenceCollectionId,
        table.environmentId,
        table.projectId,
        table.workspaceId,
      ],
      foreignColumns: [
        cmsCollection.id,
        cmsCollection.environmentId,
        cmsCollection.projectId,
        cmsCollection.workspaceId,
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
    uniqueIndex("cms_revision_field_root_key_unique")
      .on(table.revisionId, table.apiKey)
      .where(sql`${table.nodeRole} = 'root'`),
    uniqueIndex("cms_revision_field_child_key_unique")
      .on(table.revisionId, table.parentFieldId, table.apiKey)
      .where(sql`${table.nodeRole} = 'object_property'`),
    uniqueIndex("cms_revision_field_root_position_unique")
      .on(table.revisionId, table.position)
      .where(sql`${table.nodeRole} = 'root'`),
    uniqueIndex("cms_revision_field_child_position_unique")
      .on(table.revisionId, table.parentFieldId, table.position)
      .where(sql`${table.nodeRole} = 'object_property'`),
    uniqueIndex("cms_revision_field_list_item_unique")
      .on(table.revisionId, table.parentFieldId)
      .where(sql`${table.nodeRole} = 'list_item'`),
    check(
      "cms_revision_field_node_role_valid",
      sql`${table.nodeRole} in ('root', 'object_property', 'list_item') and ((${table.nodeRole} = 'root' and ${table.parentFieldId} is null) or (${table.nodeRole} <> 'root' and ${table.parentFieldId} is not null))`,
    ),
    check(
      "cms_revision_field_not_self_parented",
      sql`${table.parentFieldId} is null or ${table.parentFieldId} <> ${table.fieldId}`,
    ),
    check(
      "cms_revision_field_api_key_valid",
      sql`(${table.nodeRole} = 'list_item' and ${table.apiKey} is null) or (${table.nodeRole} <> 'list_item' and ${table.apiKey} ~ '^[a-z][a-z0-9_]{0,62}$' and ${table.apiKey} !~ '__' and right(${table.apiKey}, 1) <> '_')`,
    ),
    check(
      "cms_revision_field_label_valid",
      sql`(${table.nodeRole} = 'list_item' and ${table.displayLabel} is null) or (${table.nodeRole} <> 'list_item' and char_length(${table.displayLabel}) between 1 and 100 and ${table.displayLabel} = btrim(${table.displayLabel}) and ${table.displayLabel} !~ '[[:cntrl:]]')`,
    ),
    check("cms_revision_field_kind_valid", sql`${table.kind} in ${persistedFieldKindSql}`),
    check(
      "cms_revision_field_localization_valid",
      sql`(${table.nodeRole} = 'root' and ${table.localization} in ('localized', 'shared', 'mixed')) or (${table.nodeRole} = 'object_property' and (${table.localization} is null or ${table.localization} in ('localized', 'shared', 'mixed'))) or (${table.nodeRole} = 'list_item' and ${table.localization} is null)`,
    ),
    check(
      "cms_revision_field_mixed_object_valid",
      sql`${table.localization} is distinct from 'mixed' or (${table.kind} = 'object' and ${table.required} is null and not (${table.configuration} ? 'default'))`,
    ),
    check(
      "cms_revision_field_required_valid",
      sql`(${table.nodeRole} = 'list_item' and ${table.required} is null) or (${table.nodeRole} <> 'list_item' and ((${table.localization} = 'mixed' and ${table.required} is null) or (${table.localization} is distinct from 'mixed' and ${table.required} is not null)))`,
    ),
    check(
      "cms_revision_field_reference_target_valid",
      sql`(${table.kind} = 'reference' and ${table.referenceCollectionId} is not null) or (${table.kind} <> 'reference' and ${table.referenceCollectionId} is null)`,
    ),
    check(
      "cms_revision_field_position_valid",
      sql`(${table.nodeRole} = 'list_item' and ${table.position} = 0) or (${table.nodeRole} <> 'list_item' and ${table.position} between 0 and 99)`,
    ),
    check(
      "cms_revision_field_editor_metadata_valid",
      sql`jsonb_typeof(${table.editorMetadata}) = 'object' and octet_length(${table.editorMetadata}::text) <= 8192`,
    ),
    check(
      "cms_revision_field_configuration_valid",
      sql`jsonb_typeof(${table.configuration}) = 'object' and octet_length(${table.configuration}::text) <= 327680`,
    ),
    index("cms_revision_field_parent_position_idx").on(
      table.revisionId,
      table.parentFieldId,
      table.position,
      table.fieldId,
    ),
    index("cms_revision_field_parent_idx")
      .on(table.parentFieldId)
      .where(sql`${table.parentFieldId} is not null`),
    index("cms_revision_field_reference_collection_idx")
      .on(table.referenceCollectionId)
      .where(sql`${table.referenceCollectionId} is not null`),
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
    validationProfile: varchar("validation_profile", { length: 64 })
      .default("ffd-fields@1")
      .notNull(),
    currencyRegistryProfile: varchar("currency_registry_profile", { length: 64 }),
    editorLayout: jsonb("editor_layout").$type<Readonly<Record<string, unknown>>>(),
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
      "cms_head_validation_profile_valid",
      sql`${table.validationProfile} ~ '^[a-z0-9][a-z0-9@._-]{0,63}$'`,
    ),
    check(
      "cms_head_currency_profile_valid",
      sql`${table.currencyRegistryProfile} is null or ${table.currencyRegistryProfile} ~ '^iso-4217@[0-9]{4}-[0-9]{2}-[0-9]{2}$'`,
    ),
    check(
      "cms_head_editor_layout_valid",
      sql`${table.editorLayout} is null or (jsonb_typeof(${table.editorLayout}) = 'object' and octet_length(${table.editorLayout}::text) <= 32768)`,
    ),
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

export const cmsEntry = pgTable(
  "cms_entry",
  {
    id: cmsId("id").primaryKey(),
    workspaceId: uuid("workspace_id").notNull(),
    projectId: uuid("project_id").notNull(),
    environmentId: uuid("environment_id").notNull(),
    collectionId: uuid("collection_id").notNull(),
    displayName: varchar("display_name", { length: 100 }),
    nameVersion: integer("name_version").default(1).notNull(),
    publicationEventSequence: integer("publication_event_sequence").default(0).notNull(),
    createCommandId: uuid("create_command_id").notNull(),
    createCommandFingerprint: char("create_command_fingerprint", { length: 64 }).notNull(),
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
      name: "cms_entry_collection_tenant_fk",
      columns: [table.collectionId, table.environmentId, table.projectId, table.workspaceId],
      foreignColumns: [
        cmsCollection.id,
        cmsCollection.environmentId,
        cmsCollection.projectId,
        cmsCollection.workspaceId,
      ],
    }).onDelete("restrict"),
    unique("cms_entry_id_collection_tenant_unique").on(
      table.id,
      table.collectionId,
      table.environmentId,
      table.projectId,
      table.workspaceId,
    ),
    unique("cms_entry_collection_create_command_unique").on(
      table.collectionId,
      table.createCommandId,
    ),
    check(
      "cms_entry_display_name_valid",
      sql`${table.displayName} is null or (char_length(${table.displayName}) between 1 and 100 and ${table.displayName} = btrim(${table.displayName}) and ${table.displayName} !~ '[[:cntrl:]]')`,
    ),
    check("cms_entry_name_version_positive", sql`${table.nameVersion} > 0`),
    check(
      "cms_entry_publication_event_sequence_nonnegative",
      sql`${table.publicationEventSequence} >= 0`,
    ),
    check(
      "cms_entry_create_fingerprint_valid",
      sql`${table.createCommandFingerprint} ~ '^[0-9a-f]{64}$'`,
    ),
    check("cms_entry_timestamps_valid", sql`${table.updatedAt} >= ${table.createdAt}`),
    index("cms_entry_collection_created_id_idx").on(
      table.collectionId,
      table.createdAt.desc(),
      table.id.desc(),
    ),
    index("cms_entry_created_by_user_idx").on(table.createdByUserId),
    index("cms_entry_changed_by_user_idx").on(table.changedByUserId),
  ],
);

export const cmsEntrySharedRevision = pgTable(
  "cms_entry_shared_revision",
  {
    id: cmsId("id").primaryKey(),
    workspaceId: uuid("workspace_id").notNull(),
    projectId: uuid("project_id").notNull(),
    environmentId: uuid("environment_id").notNull(),
    collectionId: uuid("collection_id").notNull(),
    entryId: uuid("entry_id").notNull(),
    sequence: integer("sequence").notNull(),
    previousRevisionId: uuid("previous_revision_id"),
    schemaRevisionId: uuid("schema_revision_id").notNull(),
    contractHash: char("contract_hash", { length: 64 }).notNull(),
    values: jsonb("values").$type<Readonly<Record<string, unknown>>>().notNull(),
    valuesHash: char("values_hash", { length: 64 }).notNull(),
    changedFieldIds: uuid("changed_field_ids").array().notNull(),
    commandId: uuid("command_id").notNull(),
    commandFingerprint: char("command_fingerprint", { length: 64 }).notNull(),
    restoredFromRevisionId: uuid("restored_from_revision_id"),
    authoredByUserId: text("authored_by_user_id")
      .notNull()
      .references(() => user.id, { onDelete: "restrict" }),
    authoredAt: cmsTimestamp("authored_at").defaultNow().notNull(),
  },
  (table) => [
    foreignKey({
      name: "cms_entry_shared_revision_entry_tenant_fk",
      columns: [
        table.entryId,
        table.collectionId,
        table.environmentId,
        table.projectId,
        table.workspaceId,
      ],
      foreignColumns: [
        cmsEntry.id,
        cmsEntry.collectionId,
        cmsEntry.environmentId,
        cmsEntry.projectId,
        cmsEntry.workspaceId,
      ],
    }).onDelete("restrict"),
    foreignKey({
      name: "cms_entry_shared_revision_schema_tenant_fk",
      columns: [
        table.schemaRevisionId,
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
      name: "cms_entry_shared_revision_previous_tenant_fk",
      columns: [
        table.previousRevisionId,
        table.entryId,
        table.collectionId,
        table.environmentId,
        table.projectId,
        table.workspaceId,
      ],
      foreignColumns: [
        table.id,
        table.entryId,
        table.collectionId,
        table.environmentId,
        table.projectId,
        table.workspaceId,
      ],
    }).onDelete("restrict"),
    foreignKey({
      name: "cms_entry_shared_revision_restore_tenant_fk",
      columns: [
        table.restoredFromRevisionId,
        table.entryId,
        table.collectionId,
        table.environmentId,
        table.projectId,
        table.workspaceId,
      ],
      foreignColumns: [
        table.id,
        table.entryId,
        table.collectionId,
        table.environmentId,
        table.projectId,
        table.workspaceId,
      ],
    }).onDelete("restrict"),
    unique("cms_entry_shared_revision_entry_sequence_unique").on(table.entryId, table.sequence),
    unique("cms_entry_shared_revision_entry_command_unique").on(table.entryId, table.commandId),
    unique("cms_entry_shared_revision_id_entry_scope_unique").on(
      table.id,
      table.entryId,
      table.collectionId,
      table.environmentId,
      table.projectId,
      table.workspaceId,
    ),
    unique("cms_entry_shared_revision_id_entry_sequence_unique").on(
      table.id,
      table.entryId,
      table.collectionId,
      table.environmentId,
      table.projectId,
      table.workspaceId,
      table.sequence,
    ),
    check("cms_entry_shared_revision_sequence_positive", sql`${table.sequence} > 0`),
    check(
      "cms_entry_shared_revision_previous_consistent",
      sql`(${table.sequence} = 1 and ${table.previousRevisionId} is null) or (${table.sequence} > 1 and ${table.previousRevisionId} is not null)`,
    ),
    check(
      "cms_entry_shared_revision_restore_not_self",
      sql`${table.restoredFromRevisionId} is null or ${table.restoredFromRevisionId} <> ${table.id}`,
    ),
    check(
      "cms_entry_shared_revision_contract_hash_valid",
      sql`${table.contractHash} ~ '^[0-9a-f]{64}$'`,
    ),
    check(
      "cms_entry_shared_revision_values_valid",
      sql`jsonb_typeof(${table.values}) = 'object' and octet_length(${table.values}::text) <= 1048576`,
    ),
    check(
      "cms_entry_shared_revision_values_hash_valid",
      sql`${table.valuesHash} ~ '^[0-9a-f]{64}$'`,
    ),
    check(
      "cms_entry_shared_revision_changed_fields_valid",
      sql`array_ndims(${table.changedFieldIds}) = 1 and cardinality(${table.changedFieldIds}) between 1 and 100 and array_position(${table.changedFieldIds}, null) is null`,
    ),
    check(
      "cms_entry_shared_revision_command_fingerprint_valid",
      sql`${table.commandFingerprint} ~ '^[0-9a-f]{64}$'`,
    ),
    index("cms_entry_shared_revision_entry_sequence_idx").on(table.entryId, table.sequence.desc()),
    index("cms_entry_shared_revision_schema_idx").on(table.schemaRevisionId),
    index("cms_entry_shared_revision_previous_idx")
      .on(table.previousRevisionId)
      .where(sql`${table.previousRevisionId} is not null`),
    index("cms_entry_shared_revision_restored_from_idx")
      .on(table.restoredFromRevisionId)
      .where(sql`${table.restoredFromRevisionId} is not null`),
    index("cms_entry_shared_revision_author_idx").on(table.authoredByUserId),
  ],
);

export const cmsEntryLocaleRevision = pgTable(
  "cms_entry_locale_revision",
  {
    id: cmsId("id").primaryKey(),
    workspaceId: uuid("workspace_id").notNull(),
    projectId: uuid("project_id").notNull(),
    environmentId: uuid("environment_id").notNull(),
    collectionId: uuid("collection_id").notNull(),
    entryId: uuid("entry_id").notNull(),
    localeId: uuid("locale_id").notNull(),
    sequence: integer("sequence").notNull(),
    previousRevisionId: uuid("previous_revision_id"),
    schemaRevisionId: uuid("schema_revision_id").notNull(),
    contractHash: char("contract_hash", { length: 64 }).notNull(),
    values: jsonb("values").$type<Readonly<Record<string, unknown>>>().notNull(),
    valuesHash: char("values_hash", { length: 64 }).notNull(),
    changedFieldIds: uuid("changed_field_ids").array().notNull(),
    commandId: uuid("command_id").notNull(),
    commandFingerprint: char("command_fingerprint", { length: 64 }).notNull(),
    restoredFromRevisionId: uuid("restored_from_revision_id"),
    authoredByUserId: text("authored_by_user_id")
      .notNull()
      .references(() => user.id, { onDelete: "restrict" }),
    authoredAt: cmsTimestamp("authored_at").defaultNow().notNull(),
  },
  (table) => [
    foreignKey({
      name: "cms_entry_locale_revision_entry_tenant_fk",
      columns: [
        table.entryId,
        table.collectionId,
        table.environmentId,
        table.projectId,
        table.workspaceId,
      ],
      foreignColumns: [
        cmsEntry.id,
        cmsEntry.collectionId,
        cmsEntry.environmentId,
        cmsEntry.projectId,
        cmsEntry.workspaceId,
      ],
    }).onDelete("restrict"),
    foreignKey({
      name: "cms_entry_locale_revision_locale_tenant_fk",
      columns: [table.localeId, table.projectId, table.workspaceId],
      foreignColumns: [projectLocale.id, projectLocale.projectId, projectLocale.workspaceId],
    }).onDelete("restrict"),
    foreignKey({
      name: "cms_entry_locale_revision_schema_tenant_fk",
      columns: [
        table.schemaRevisionId,
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
      name: "cms_entry_locale_revision_previous_tenant_fk",
      columns: [
        table.previousRevisionId,
        table.entryId,
        table.localeId,
        table.collectionId,
        table.environmentId,
        table.projectId,
        table.workspaceId,
      ],
      foreignColumns: [
        table.id,
        table.entryId,
        table.localeId,
        table.collectionId,
        table.environmentId,
        table.projectId,
        table.workspaceId,
      ],
    }).onDelete("restrict"),
    foreignKey({
      name: "cms_entry_locale_revision_restore_tenant_fk",
      columns: [
        table.restoredFromRevisionId,
        table.entryId,
        table.localeId,
        table.collectionId,
        table.environmentId,
        table.projectId,
        table.workspaceId,
      ],
      foreignColumns: [
        table.id,
        table.entryId,
        table.localeId,
        table.collectionId,
        table.environmentId,
        table.projectId,
        table.workspaceId,
      ],
    }).onDelete("restrict"),
    unique("cms_entry_locale_revision_entry_locale_sequence_unique").on(
      table.entryId,
      table.localeId,
      table.sequence,
    ),
    unique("cms_entry_locale_revision_entry_locale_command_unique").on(
      table.entryId,
      table.localeId,
      table.commandId,
    ),
    unique("cms_entry_locale_revision_id_entry_scope_unique").on(
      table.id,
      table.entryId,
      table.localeId,
      table.collectionId,
      table.environmentId,
      table.projectId,
      table.workspaceId,
    ),
    unique("cms_entry_locale_revision_id_entry_sequence_unique").on(
      table.id,
      table.entryId,
      table.localeId,
      table.collectionId,
      table.environmentId,
      table.projectId,
      table.workspaceId,
      table.sequence,
    ),
    check("cms_entry_locale_revision_sequence_positive", sql`${table.sequence} > 0`),
    check(
      "cms_entry_locale_revision_previous_consistent",
      sql`(${table.sequence} = 1 and ${table.previousRevisionId} is null) or (${table.sequence} > 1 and ${table.previousRevisionId} is not null)`,
    ),
    check(
      "cms_entry_locale_revision_restore_not_self",
      sql`${table.restoredFromRevisionId} is null or ${table.restoredFromRevisionId} <> ${table.id}`,
    ),
    check(
      "cms_entry_locale_revision_contract_hash_valid",
      sql`${table.contractHash} ~ '^[0-9a-f]{64}$'`,
    ),
    check(
      "cms_entry_locale_revision_values_valid",
      sql`jsonb_typeof(${table.values}) = 'object' and octet_length(${table.values}::text) <= 1048576`,
    ),
    check(
      "cms_entry_locale_revision_values_hash_valid",
      sql`${table.valuesHash} ~ '^[0-9a-f]{64}$'`,
    ),
    check(
      "cms_entry_locale_revision_changed_fields_valid",
      sql`array_ndims(${table.changedFieldIds}) = 1 and cardinality(${table.changedFieldIds}) between 1 and 100 and array_position(${table.changedFieldIds}, null) is null`,
    ),
    check(
      "cms_entry_locale_revision_command_fingerprint_valid",
      sql`${table.commandFingerprint} ~ '^[0-9a-f]{64}$'`,
    ),
    index("cms_entry_locale_revision_entry_locale_sequence_idx").on(
      table.entryId,
      table.localeId,
      table.sequence.desc(),
    ),
    index("cms_entry_locale_revision_locale_idx").on(table.localeId),
    index("cms_entry_locale_revision_schema_idx").on(table.schemaRevisionId),
    index("cms_entry_locale_revision_previous_idx")
      .on(table.previousRevisionId)
      .where(sql`${table.previousRevisionId} is not null`),
    index("cms_entry_locale_revision_restored_from_idx")
      .on(table.restoredFromRevisionId)
      .where(sql`${table.restoredFromRevisionId} is not null`),
    index("cms_entry_locale_revision_author_idx").on(table.authoredByUserId),
  ],
);

export const cmsEntrySharedDraft = pgTable(
  "cms_entry_shared_draft",
  {
    entryId: uuid("entry_id").primaryKey(),
    workspaceId: uuid("workspace_id").notNull(),
    projectId: uuid("project_id").notNull(),
    environmentId: uuid("environment_id").notNull(),
    collectionId: uuid("collection_id").notNull(),
    version: integer("version").notNull(),
    currentRevisionId: uuid("current_revision_id").notNull(),
    changedByUserId: text("changed_by_user_id")
      .notNull()
      .references(() => user.id, { onDelete: "restrict" }),
    updatedAt: cmsTimestamp("updated_at").defaultNow().notNull(),
  },
  (table) => [
    foreignKey({
      name: "cms_entry_shared_draft_entry_tenant_fk",
      columns: [
        table.entryId,
        table.collectionId,
        table.environmentId,
        table.projectId,
        table.workspaceId,
      ],
      foreignColumns: [
        cmsEntry.id,
        cmsEntry.collectionId,
        cmsEntry.environmentId,
        cmsEntry.projectId,
        cmsEntry.workspaceId,
      ],
    }).onDelete("restrict"),
    foreignKey({
      name: "cms_entry_shared_draft_current_revision_fk",
      columns: [
        table.currentRevisionId,
        table.entryId,
        table.collectionId,
        table.environmentId,
        table.projectId,
        table.workspaceId,
        table.version,
      ],
      foreignColumns: [
        cmsEntrySharedRevision.id,
        cmsEntrySharedRevision.entryId,
        cmsEntrySharedRevision.collectionId,
        cmsEntrySharedRevision.environmentId,
        cmsEntrySharedRevision.projectId,
        cmsEntrySharedRevision.workspaceId,
        cmsEntrySharedRevision.sequence,
      ],
    }).onDelete("restrict"),
    check("cms_entry_shared_draft_version_positive", sql`${table.version} > 0`),
    index("cms_entry_shared_draft_current_revision_idx").on(table.currentRevisionId),
    index("cms_entry_shared_draft_changed_by_user_idx").on(table.changedByUserId),
  ],
);

export const cmsEntryLocaleDraft = pgTable(
  "cms_entry_locale_draft",
  {
    entryId: uuid("entry_id").notNull(),
    localeId: uuid("locale_id").notNull(),
    workspaceId: uuid("workspace_id").notNull(),
    projectId: uuid("project_id").notNull(),
    environmentId: uuid("environment_id").notNull(),
    collectionId: uuid("collection_id").notNull(),
    version: integer("version").notNull(),
    currentRevisionId: uuid("current_revision_id").notNull(),
    changedByUserId: text("changed_by_user_id")
      .notNull()
      .references(() => user.id, { onDelete: "restrict" }),
    updatedAt: cmsTimestamp("updated_at").defaultNow().notNull(),
  },
  (table) => [
    primaryKey({
      name: "cms_entry_locale_draft_entry_locale_pk",
      columns: [table.entryId, table.localeId],
    }),
    foreignKey({
      name: "cms_entry_locale_draft_entry_tenant_fk",
      columns: [
        table.entryId,
        table.collectionId,
        table.environmentId,
        table.projectId,
        table.workspaceId,
      ],
      foreignColumns: [
        cmsEntry.id,
        cmsEntry.collectionId,
        cmsEntry.environmentId,
        cmsEntry.projectId,
        cmsEntry.workspaceId,
      ],
    }).onDelete("restrict"),
    foreignKey({
      name: "cms_entry_locale_draft_locale_tenant_fk",
      columns: [table.localeId, table.projectId, table.workspaceId],
      foreignColumns: [projectLocale.id, projectLocale.projectId, projectLocale.workspaceId],
    }).onDelete("restrict"),
    foreignKey({
      name: "cms_entry_locale_draft_current_revision_fk",
      columns: [
        table.currentRevisionId,
        table.entryId,
        table.localeId,
        table.collectionId,
        table.environmentId,
        table.projectId,
        table.workspaceId,
        table.version,
      ],
      foreignColumns: [
        cmsEntryLocaleRevision.id,
        cmsEntryLocaleRevision.entryId,
        cmsEntryLocaleRevision.localeId,
        cmsEntryLocaleRevision.collectionId,
        cmsEntryLocaleRevision.environmentId,
        cmsEntryLocaleRevision.projectId,
        cmsEntryLocaleRevision.workspaceId,
        cmsEntryLocaleRevision.sequence,
      ],
    }).onDelete("restrict"),
    check("cms_entry_locale_draft_version_positive", sql`${table.version} > 0`),
    index("cms_entry_locale_draft_locale_entry_idx").on(table.localeId, table.entryId),
    index("cms_entry_locale_draft_current_revision_idx").on(table.currentRevisionId),
    index("cms_entry_locale_draft_changed_by_user_idx").on(table.changedByUserId),
  ],
);

export const cmsEntryDraftCommand = pgTable(
  "cms_entry_draft_command",
  {
    entryId: uuid("entry_id").notNull(),
    commandId: uuid("command_id").notNull(),
    workspaceId: uuid("workspace_id").notNull(),
    projectId: uuid("project_id").notNull(),
    environmentId: uuid("environment_id").notNull(),
    collectionId: uuid("collection_id").notNull(),
    localeId: uuid("locale_id").notNull(),
    operation: varchar("operation", { length: 16 }).notNull(),
    commandFingerprint: char("command_fingerprint", { length: 64 }).notNull(),
    resultKind: varchar("result_kind", { length: 16 }).notNull(),
    resultSharedVersion: integer("result_shared_version").notNull(),
    resultSharedRevisionId: uuid("result_shared_revision_id"),
    resultLocaleVersion: integer("result_locale_version").notNull(),
    resultLocaleRevisionId: uuid("result_locale_revision_id"),
    completedByUserId: text("completed_by_user_id")
      .notNull()
      .references(() => user.id, { onDelete: "restrict" }),
    completedAt: cmsTimestamp("completed_at").defaultNow().notNull(),
  },
  (table) => [
    primaryKey({
      name: "cms_entry_draft_command_entry_command_pk",
      columns: [table.entryId, table.commandId],
    }),
    foreignKey({
      name: "cms_entry_draft_command_entry_tenant_fk",
      columns: [
        table.entryId,
        table.collectionId,
        table.environmentId,
        table.projectId,
        table.workspaceId,
      ],
      foreignColumns: [
        cmsEntry.id,
        cmsEntry.collectionId,
        cmsEntry.environmentId,
        cmsEntry.projectId,
        cmsEntry.workspaceId,
      ],
    }).onDelete("restrict"),
    foreignKey({
      name: "cms_entry_draft_command_locale_tenant_fk",
      columns: [table.localeId, table.projectId, table.workspaceId],
      foreignColumns: [projectLocale.id, projectLocale.projectId, projectLocale.workspaceId],
    }).onDelete("restrict"),
    foreignKey({
      name: "cms_entry_draft_command_shared_revision_fk",
      columns: [
        table.resultSharedRevisionId,
        table.entryId,
        table.collectionId,
        table.environmentId,
        table.projectId,
        table.workspaceId,
      ],
      foreignColumns: [
        cmsEntrySharedRevision.id,
        cmsEntrySharedRevision.entryId,
        cmsEntrySharedRevision.collectionId,
        cmsEntrySharedRevision.environmentId,
        cmsEntrySharedRevision.projectId,
        cmsEntrySharedRevision.workspaceId,
      ],
    }).onDelete("restrict"),
    foreignKey({
      name: "cms_entry_draft_command_locale_revision_fk",
      columns: [
        table.resultLocaleRevisionId,
        table.entryId,
        table.localeId,
        table.collectionId,
        table.environmentId,
        table.projectId,
        table.workspaceId,
      ],
      foreignColumns: [
        cmsEntryLocaleRevision.id,
        cmsEntryLocaleRevision.entryId,
        cmsEntryLocaleRevision.localeId,
        cmsEntryLocaleRevision.collectionId,
        cmsEntryLocaleRevision.environmentId,
        cmsEntryLocaleRevision.projectId,
        cmsEntryLocaleRevision.workspaceId,
      ],
    }).onDelete("restrict"),
    check(
      "cms_entry_draft_command_operation_valid",
      sql`${table.operation} in ('save', 'restore')`,
    ),
    check(
      "cms_entry_draft_command_fingerprint_valid",
      sql`${table.commandFingerprint} ~ '^[0-9a-f]{64}$'`,
    ),
    check(
      "cms_entry_draft_command_result_kind_valid",
      sql`${table.resultKind} in ('changed', 'no_op')`,
    ),
    check(
      "cms_entry_draft_command_shared_result_valid",
      sql`(${table.resultSharedVersion} = 0 and ${table.resultSharedRevisionId} is null) or (${table.resultSharedVersion} > 0 and ${table.resultSharedRevisionId} is not null)`,
    ),
    check(
      "cms_entry_draft_command_locale_result_valid",
      sql`(${table.resultLocaleVersion} = 0 and ${table.resultLocaleRevisionId} is null) or (${table.resultLocaleVersion} > 0 and ${table.resultLocaleRevisionId} is not null)`,
    ),
    index("cms_entry_draft_command_entry_completed_idx").on(
      table.entryId,
      table.completedAt.desc(),
      table.commandId.desc(),
    ),
    index("cms_entry_draft_command_locale_idx").on(table.localeId),
    index("cms_entry_draft_command_completed_by_user_idx").on(table.completedByUserId),
  ],
);

export const cmsEntryLocalePublication = pgTable(
  "cms_entry_locale_publication",
  {
    id: cmsId("id").primaryKey(),
    workspaceId: uuid("workspace_id").notNull(),
    projectId: uuid("project_id").notNull(),
    environmentId: uuid("environment_id").notNull(),
    collectionId: uuid("collection_id").notNull(),
    entryId: uuid("entry_id").notNull(),
    localeId: uuid("locale_id").notNull(),
    publicationSequence: integer("publication_sequence").notNull(),
    eventSequence: integer("event_sequence").notNull(),
    previousPublicationId: uuid("previous_publication_id"),
    schemaRevisionId: uuid("schema_revision_id").notNull(),
    contractHash: char("contract_hash", { length: 64 }).notNull(),
    sharedSourceVersion: integer("shared_source_version").notNull(),
    sharedSourceRevisionId: uuid("shared_source_revision_id"),
    localeSourceVersion: integer("locale_source_version").notNull(),
    localeSourceRevisionId: uuid("locale_source_revision_id"),
    contentHash: char("content_hash", { length: 64 }).notNull(),
    authorityHash: char("authority_hash", { length: 64 }).notNull(),
    changedFieldIds: uuid("changed_field_ids").array().notNull(),
    commandId: uuid("command_id").notNull(),
    commandFingerprint: char("command_fingerprint", { length: 64 }).notNull(),
    publishedByUserId: text("published_by_user_id")
      .notNull()
      .references(() => user.id, { onDelete: "restrict" }),
    publishedAt: cmsTimestamp("published_at").defaultNow().notNull(),
  },
  (table) => [
    foreignKey({
      name: "cms_entry_pub_entry_tenant_fk",
      columns: [
        table.entryId,
        table.collectionId,
        table.environmentId,
        table.projectId,
        table.workspaceId,
      ],
      foreignColumns: [
        cmsEntry.id,
        cmsEntry.collectionId,
        cmsEntry.environmentId,
        cmsEntry.projectId,
        cmsEntry.workspaceId,
      ],
    }).onDelete("restrict"),
    foreignKey({
      name: "cms_entry_pub_locale_tenant_fk",
      columns: [table.localeId, table.projectId, table.workspaceId],
      foreignColumns: [projectLocale.id, projectLocale.projectId, projectLocale.workspaceId],
    }).onDelete("restrict"),
    foreignKey({
      name: "cms_entry_pub_schema_tenant_fk",
      columns: [
        table.schemaRevisionId,
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
      name: "cms_entry_pub_shared_source_fk",
      columns: [
        table.sharedSourceRevisionId,
        table.entryId,
        table.collectionId,
        table.environmentId,
        table.projectId,
        table.workspaceId,
        table.sharedSourceVersion,
      ],
      foreignColumns: [
        cmsEntrySharedRevision.id,
        cmsEntrySharedRevision.entryId,
        cmsEntrySharedRevision.collectionId,
        cmsEntrySharedRevision.environmentId,
        cmsEntrySharedRevision.projectId,
        cmsEntrySharedRevision.workspaceId,
        cmsEntrySharedRevision.sequence,
      ],
    }).onDelete("restrict"),
    foreignKey({
      name: "cms_entry_pub_locale_source_fk",
      columns: [
        table.localeSourceRevisionId,
        table.entryId,
        table.localeId,
        table.collectionId,
        table.environmentId,
        table.projectId,
        table.workspaceId,
        table.localeSourceVersion,
      ],
      foreignColumns: [
        cmsEntryLocaleRevision.id,
        cmsEntryLocaleRevision.entryId,
        cmsEntryLocaleRevision.localeId,
        cmsEntryLocaleRevision.collectionId,
        cmsEntryLocaleRevision.environmentId,
        cmsEntryLocaleRevision.projectId,
        cmsEntryLocaleRevision.workspaceId,
        cmsEntryLocaleRevision.sequence,
      ],
    }).onDelete("restrict"),
    foreignKey({
      name: "cms_entry_pub_previous_fk",
      columns: [
        table.previousPublicationId,
        table.entryId,
        table.localeId,
        table.collectionId,
        table.environmentId,
        table.projectId,
        table.workspaceId,
      ],
      foreignColumns: [
        table.id,
        table.entryId,
        table.localeId,
        table.collectionId,
        table.environmentId,
        table.projectId,
        table.workspaceId,
      ],
    }).onDelete("restrict"),
    unique("cms_entry_pub_entry_locale_sequence_unique").on(
      table.entryId,
      table.localeId,
      table.publicationSequence,
    ),
    unique("cms_entry_pub_entry_event_sequence_unique").on(table.entryId, table.eventSequence),
    unique("cms_entry_pub_entry_command_unique").on(table.entryId, table.commandId),
    unique("cms_entry_pub_id_scope_unique").on(
      table.id,
      table.entryId,
      table.localeId,
      table.collectionId,
      table.environmentId,
      table.projectId,
      table.workspaceId,
    ),
    unique("cms_entry_pub_id_scope_sequence_unique").on(
      table.id,
      table.entryId,
      table.localeId,
      table.collectionId,
      table.environmentId,
      table.projectId,
      table.workspaceId,
      table.publicationSequence,
    ),
    unique("cms_entry_pub_id_event_scope_unique").on(
      table.id,
      table.entryId,
      table.localeId,
      table.environmentId,
      table.projectId,
      table.workspaceId,
    ),
    check("cms_entry_pub_sequence_positive", sql`${table.publicationSequence} > 0`),
    check("cms_entry_pub_event_sequence_positive", sql`${table.eventSequence} > 0`),
    check(
      "cms_entry_pub_previous_consistent",
      sql`(${table.publicationSequence} = 1 and ${table.previousPublicationId} is null) or (${table.publicationSequence} > 1 and ${table.previousPublicationId} is not null)`,
    ),
    check(
      "cms_entry_pub_shared_source_consistent",
      sql`(${table.sharedSourceVersion} = 0 and ${table.sharedSourceRevisionId} is null) or (${table.sharedSourceVersion} > 0 and ${table.sharedSourceRevisionId} is not null)`,
    ),
    check(
      "cms_entry_pub_locale_source_consistent",
      sql`(${table.localeSourceVersion} = 0 and ${table.localeSourceRevisionId} is null) or (${table.localeSourceVersion} > 0 and ${table.localeSourceRevisionId} is not null)`,
    ),
    check("cms_entry_pub_contract_hash_valid", sql`${table.contractHash} ~ '^[0-9a-f]{64}$'`),
    check("cms_entry_pub_content_hash_valid", sql`${table.contentHash} ~ '^[0-9a-f]{64}$'`),
    check("cms_entry_pub_authority_hash_valid", sql`${table.authorityHash} ~ '^[0-9a-f]{64}$'`),
    check(
      "cms_entry_pub_changed_fields_valid",
      sql`coalesce(array_ndims(${table.changedFieldIds}), 1) = 1 and cardinality(${table.changedFieldIds}) between 0 and 100 and array_position(${table.changedFieldIds}, null) is null`,
    ),
    check(
      "cms_entry_pub_command_fingerprint_valid",
      sql`${table.commandFingerprint} ~ '^[0-9a-f]{64}$'`,
    ),
    index("cms_entry_pub_history_idx").on(
      table.entryId,
      table.localeId,
      table.publicationSequence.desc(),
      table.id.desc(),
    ),
    index("cms_entry_pub_schema_idx").on(table.schemaRevisionId),
    index("cms_entry_pub_shared_source_idx")
      .on(table.sharedSourceRevisionId)
      .where(sql`${table.sharedSourceRevisionId} is not null`),
    index("cms_entry_pub_locale_source_idx")
      .on(table.localeSourceRevisionId)
      .where(sql`${table.localeSourceRevisionId} is not null`),
    index("cms_entry_pub_previous_idx")
      .on(table.previousPublicationId)
      .where(sql`${table.previousPublicationId} is not null`),
    index("cms_entry_pub_publisher_idx").on(table.publishedByUserId),
  ],
);

export const cmsEntryLocaleDeliverySnapshot = pgTable(
  "cms_entry_locale_delivery_snapshot",
  {
    publicationId: uuid("publication_id").primaryKey(),
    workspaceId: uuid("workspace_id").notNull(),
    projectId: uuid("project_id").notNull(),
    environmentId: uuid("environment_id").notNull(),
    collectionId: uuid("collection_id").notNull(),
    entryId: uuid("entry_id").notNull(),
    localeId: uuid("locale_id").notNull(),
    formatVersion: integer("format_version").default(1).notNull(),
    document: jsonb("document").$type<Readonly<Record<string, unknown>>>().notNull(),
    documentHash: char("document_hash", { length: 64 }).notNull(),
    referenceManifest: jsonb("reference_manifest").$type<ReadonlyArray<unknown>>().notNull(),
    referenceManifestHash: char("reference_manifest_hash", { length: 64 }).notNull(),
    canonicalDocumentBytes: integer("canonical_document_bytes").notNull(),
    canonicalReferenceManifestBytes: integer("canonical_reference_manifest_bytes").notNull(),
    canonicalCombinedBytes: integer("canonical_combined_bytes").notNull(),
  },
  (table) => [
    foreignKey({
      name: "cms_entry_snapshot_publication_fk",
      columns: [
        table.publicationId,
        table.entryId,
        table.localeId,
        table.collectionId,
        table.environmentId,
        table.projectId,
        table.workspaceId,
      ],
      foreignColumns: [
        cmsEntryLocalePublication.id,
        cmsEntryLocalePublication.entryId,
        cmsEntryLocalePublication.localeId,
        cmsEntryLocalePublication.collectionId,
        cmsEntryLocalePublication.environmentId,
        cmsEntryLocalePublication.projectId,
        cmsEntryLocalePublication.workspaceId,
      ],
    }).onDelete("restrict"),
    check("cms_entry_snapshot_format_valid", sql`${table.formatVersion} = 1`),
    check(
      "cms_entry_snapshot_document_valid",
      sql`jsonb_typeof(${table.document}) = 'object' and octet_length(${table.document}::text) <= 1048576`,
    ),
    check("cms_entry_snapshot_document_hash_valid", sql`${table.documentHash} ~ '^[0-9a-f]{64}$'`),
    check(
      "cms_entry_snapshot_manifest_valid",
      sql`jsonb_typeof(${table.referenceManifest}) = 'array' and jsonb_array_length(${table.referenceManifest}) <= 20000 and octet_length(${table.referenceManifest}::text) <= 1048576`,
    ),
    check(
      "cms_entry_snapshot_manifest_hash_valid",
      sql`${table.referenceManifestHash} ~ '^[0-9a-f]{64}$'`,
    ),
    check(
      "cms_entry_snapshot_document_bytes_valid",
      sql`${table.canonicalDocumentBytes} between 2 and 1048576`,
    ),
    check(
      "cms_entry_snapshot_manifest_bytes_valid",
      sql`${table.canonicalReferenceManifestBytes} between 2 and 1048576`,
    ),
    check(
      "cms_entry_snapshot_combined_bytes_valid",
      sql`${table.canonicalCombinedBytes} = ${table.canonicalDocumentBytes} + ${table.canonicalReferenceManifestBytes} and ${table.canonicalCombinedBytes} <= 1048576`,
    ),
  ],
);

export const cmsEntryLocalePublicationReference = pgTable(
  "cms_entry_locale_publication_reference",
  {
    sourcePublicationId: uuid("source_publication_id").notNull(),
    sourceFieldId: uuid("source_field_id").notNull(),
    targetPublicationId: uuid("target_publication_id").notNull(),
    workspaceId: uuid("workspace_id").notNull(),
    projectId: uuid("project_id").notNull(),
    environmentId: uuid("environment_id").notNull(),
    sourceCollectionId: uuid("source_collection_id").notNull(),
    sourceEntryId: uuid("source_entry_id").notNull(),
    localeId: uuid("locale_id").notNull(),
    targetCollectionId: uuid("target_collection_id").notNull(),
    targetEntryId: uuid("target_entry_id").notNull(),
  },
  (table) => [
    primaryKey({
      name: "cms_entry_pub_ref_source_field_target_pk",
      columns: [table.sourcePublicationId, table.sourceFieldId, table.targetPublicationId],
    }),
    foreignKey({
      name: "cms_entry_pub_ref_source_publication_fk",
      columns: [
        table.sourcePublicationId,
        table.sourceEntryId,
        table.localeId,
        table.sourceCollectionId,
        table.environmentId,
        table.projectId,
        table.workspaceId,
      ],
      foreignColumns: [
        cmsEntryLocalePublication.id,
        cmsEntryLocalePublication.entryId,
        cmsEntryLocalePublication.localeId,
        cmsEntryLocalePublication.collectionId,
        cmsEntryLocalePublication.environmentId,
        cmsEntryLocalePublication.projectId,
        cmsEntryLocalePublication.workspaceId,
      ],
    }).onDelete("restrict"),
    foreignKey({
      name: "cms_entry_pub_ref_source_field_fk",
      columns: [
        table.sourceFieldId,
        table.sourceCollectionId,
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
    foreignKey({
      name: "cms_entry_pub_ref_target_publication_fk",
      columns: [
        table.targetPublicationId,
        table.targetEntryId,
        table.localeId,
        table.targetCollectionId,
        table.environmentId,
        table.projectId,
        table.workspaceId,
      ],
      foreignColumns: [
        cmsEntryLocalePublication.id,
        cmsEntryLocalePublication.entryId,
        cmsEntryLocalePublication.localeId,
        cmsEntryLocalePublication.collectionId,
        cmsEntryLocalePublication.environmentId,
        cmsEntryLocalePublication.projectId,
        cmsEntryLocalePublication.workspaceId,
      ],
    }).onDelete("restrict"),
    index("cms_entry_pub_ref_target_publication_idx").on(table.targetPublicationId),
    index("cms_entry_pub_ref_target_entry_locale_idx").on(table.targetEntryId, table.localeId),
  ],
);

export const cmsEntryLocalePublicationHead = pgTable(
  "cms_entry_locale_publication_head",
  {
    entryId: uuid("entry_id").notNull(),
    localeId: uuid("locale_id").notNull(),
    workspaceId: uuid("workspace_id").notNull(),
    projectId: uuid("project_id").notNull(),
    environmentId: uuid("environment_id").notNull(),
    collectionId: uuid("collection_id").notNull(),
    version: integer("version").notNull(),
    latestPublicationSequence: integer("latest_publication_sequence").notNull(),
    currentPublicationId: uuid("current_publication_id"),
    changedByUserId: text("changed_by_user_id")
      .notNull()
      .references(() => user.id, { onDelete: "restrict" }),
    updatedAt: cmsTimestamp("updated_at").defaultNow().notNull(),
  },
  (table) => [
    primaryKey({
      name: "cms_entry_pub_head_entry_locale_pk",
      columns: [table.entryId, table.localeId],
    }),
    foreignKey({
      name: "cms_entry_pub_head_entry_tenant_fk",
      columns: [
        table.entryId,
        table.collectionId,
        table.environmentId,
        table.projectId,
        table.workspaceId,
      ],
      foreignColumns: [
        cmsEntry.id,
        cmsEntry.collectionId,
        cmsEntry.environmentId,
        cmsEntry.projectId,
        cmsEntry.workspaceId,
      ],
    }).onDelete("restrict"),
    foreignKey({
      name: "cms_entry_pub_head_locale_tenant_fk",
      columns: [table.localeId, table.projectId, table.workspaceId],
      foreignColumns: [projectLocale.id, projectLocale.projectId, projectLocale.workspaceId],
    }).onDelete("restrict"),
    foreignKey({
      name: "cms_entry_pub_head_current_publication_fk",
      columns: [
        table.currentPublicationId,
        table.entryId,
        table.localeId,
        table.collectionId,
        table.environmentId,
        table.projectId,
        table.workspaceId,
        table.latestPublicationSequence,
      ],
      foreignColumns: [
        cmsEntryLocalePublication.id,
        cmsEntryLocalePublication.entryId,
        cmsEntryLocalePublication.localeId,
        cmsEntryLocalePublication.collectionId,
        cmsEntryLocalePublication.environmentId,
        cmsEntryLocalePublication.projectId,
        cmsEntryLocalePublication.workspaceId,
        cmsEntryLocalePublication.publicationSequence,
      ],
    }).onDelete("restrict"),
    unique("cms_entry_pub_head_current_scope_unique").on(
      table.currentPublicationId,
      table.entryId,
      table.localeId,
      table.collectionId,
      table.environmentId,
      table.projectId,
      table.workspaceId,
    ),
    check("cms_entry_pub_head_version_positive", sql`${table.version} > 0`),
    check("cms_entry_pub_head_sequence_positive", sql`${table.latestPublicationSequence} > 0`),
    index("cms_entry_pub_head_locale_collection_current_idx")
      .on(table.localeId, table.collectionId, table.entryId)
      .where(sql`${table.currentPublicationId} is not null`),
    index("cms_entry_pub_head_current_publication_idx")
      .on(table.currentPublicationId)
      .where(sql`${table.currentPublicationId} is not null`),
    index("cms_entry_pub_head_changed_by_user_idx").on(table.changedByUserId),
  ],
);

export const cmsEntryLocaleDeliveryCurrentValue = pgTable(
  "cms_entry_locale_delivery_current_value",
  {
    entryId: uuid("entry_id").notNull(),
    localeId: uuid("locale_id").notNull(),
    fieldId: uuid("field_id").notNull(),
    publicationId: uuid("publication_id").notNull(),
    workspaceId: uuid("workspace_id").notNull(),
    projectId: uuid("project_id").notNull(),
    environmentId: uuid("environment_id").notNull(),
    collectionId: uuid("collection_id").notNull(),
    valueKind: varchar("value_kind", { length: 16 }).notNull(),
    textValue: text("text_value"),
    numberValue: doublePrecision("number_value"),
    decimalValue: numeric("decimal_value"),
    booleanValue: boolean("boolean_value"),
    dateValue: date("date_value", { mode: "string" }),
    dateTimeValue: timestamp("date_time_value", { withTimezone: true, mode: "string" }),
    referenceValue: uuid("reference_value"),
    uniqueLookup: boolean("unique_lookup").default(false).notNull(),
  },
  (table) => [
    primaryKey({
      name: "cms_entry_locale_delivery_current_value_pk",
      columns: [table.entryId, table.localeId, table.fieldId],
    }),
    foreignKey({
      name: "cms_entry_locale_delivery_value_field_fk",
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
    foreignKey({
      name: "cms_entry_locale_delivery_value_publication_fk",
      columns: [
        table.publicationId,
        table.entryId,
        table.localeId,
        table.collectionId,
        table.environmentId,
        table.projectId,
        table.workspaceId,
      ],
      foreignColumns: [
        cmsEntryLocalePublication.id,
        cmsEntryLocalePublication.entryId,
        cmsEntryLocalePublication.localeId,
        cmsEntryLocalePublication.collectionId,
        cmsEntryLocalePublication.environmentId,
        cmsEntryLocalePublication.projectId,
        cmsEntryLocalePublication.workspaceId,
      ],
    }).onDelete("restrict"),
    foreignKey({
      name: "cms_entry_locale_delivery_value_current_head_fk",
      columns: [
        table.publicationId,
        table.entryId,
        table.localeId,
        table.collectionId,
        table.environmentId,
        table.projectId,
        table.workspaceId,
      ],
      foreignColumns: [
        cmsEntryLocalePublicationHead.currentPublicationId,
        cmsEntryLocalePublicationHead.entryId,
        cmsEntryLocalePublicationHead.localeId,
        cmsEntryLocalePublicationHead.collectionId,
        cmsEntryLocalePublicationHead.environmentId,
        cmsEntryLocalePublicationHead.projectId,
        cmsEntryLocalePublicationHead.workspaceId,
      ],
    }).onDelete("restrict"),
    check(
      "cms_entry_locale_delivery_value_kind_valid",
      sql`${table.valueKind} in ('short_text', 'slug', 'email', 'enum', 'number', 'decimal', 'boolean', 'date', 'date_time', 'reference')`,
    ),
    check(
      "cms_entry_locale_delivery_value_typed_valid",
      sql`(${table.valueKind} in ('short_text', 'slug', 'email', 'enum') and ${table.textValue} is not null and ${table.numberValue} is null and ${table.decimalValue} is null and ${table.booleanValue} is null and ${table.dateValue} is null and ${table.dateTimeValue} is null and ${table.referenceValue} is null) or (${table.valueKind} = 'number' and ${table.textValue} is null and ${table.numberValue} is not null and ${table.numberValue} > '-Infinity'::double precision and ${table.numberValue} < 'Infinity'::double precision and ${table.decimalValue} is null and ${table.booleanValue} is null and ${table.dateValue} is null and ${table.dateTimeValue} is null and ${table.referenceValue} is null) or (${table.valueKind} = 'decimal' and ${table.textValue} is null and ${table.numberValue} is null and ${table.decimalValue} is not null and ${table.decimalValue} > '-Infinity'::numeric and ${table.decimalValue} < 'Infinity'::numeric and ${table.booleanValue} is null and ${table.dateValue} is null and ${table.dateTimeValue} is null and ${table.referenceValue} is null) or (${table.valueKind} = 'boolean' and ${table.textValue} is null and ${table.numberValue} is null and ${table.decimalValue} is null and ${table.booleanValue} is not null and ${table.dateValue} is null and ${table.dateTimeValue} is null and ${table.referenceValue} is null) or (${table.valueKind} = 'date' and ${table.textValue} is null and ${table.numberValue} is null and ${table.decimalValue} is null and ${table.booleanValue} is null and ${table.dateValue} is not null and ${table.dateTimeValue} is null and ${table.referenceValue} is null) or (${table.valueKind} = 'date_time' and ${table.textValue} is null and ${table.numberValue} is null and ${table.decimalValue} is null and ${table.booleanValue} is null and ${table.dateValue} is null and ${table.dateTimeValue} is not null and ${table.referenceValue} is null) or (${table.valueKind} = 'reference' and ${table.textValue} is null and ${table.numberValue} is null and ${table.decimalValue} is null and ${table.booleanValue} is null and ${table.dateValue} is null and ${table.dateTimeValue} is null and ${table.referenceValue} is not null)`,
    ),
    index("cms_entry_locale_delivery_value_text_idx")
      .on(
        table.localeId,
        table.collectionId,
        table.fieldId,
        sql`${table.textValue} collate "C"`,
        table.entryId,
      )
      .where(sql`${table.textValue} is not null`),
    index("cms_entry_locale_delivery_value_number_idx")
      .on(table.localeId, table.collectionId, table.fieldId, table.numberValue, table.entryId)
      .where(sql`${table.numberValue} is not null`),
    index("cms_entry_locale_delivery_value_decimal_idx")
      .on(table.localeId, table.collectionId, table.fieldId, table.decimalValue, table.entryId)
      .where(sql`${table.decimalValue} is not null`),
    index("cms_entry_locale_delivery_value_boolean_idx")
      .on(table.localeId, table.collectionId, table.fieldId, table.booleanValue, table.entryId)
      .where(sql`${table.booleanValue} is not null`),
    index("cms_entry_locale_delivery_value_date_idx")
      .on(table.localeId, table.collectionId, table.fieldId, table.dateValue, table.entryId)
      .where(sql`${table.dateValue} is not null`),
    index("cms_entry_locale_delivery_value_date_time_idx")
      .on(table.localeId, table.collectionId, table.fieldId, table.dateTimeValue, table.entryId)
      .where(sql`${table.dateTimeValue} is not null`),
    index("cms_entry_locale_delivery_value_reference_idx")
      .on(table.localeId, table.collectionId, table.fieldId, table.referenceValue, table.entryId)
      .where(sql`${table.referenceValue} is not null`),
    uniqueIndex("cms_entry_locale_delivery_value_text_unique")
      .on(table.localeId, table.collectionId, table.fieldId, sql`${table.textValue} collate "C"`)
      .where(sql`${table.uniqueLookup} and ${table.textValue} is not null`),
    uniqueIndex("cms_entry_locale_delivery_value_number_unique")
      .on(table.localeId, table.collectionId, table.fieldId, table.numberValue)
      .where(sql`${table.uniqueLookup} and ${table.numberValue} is not null`),
    uniqueIndex("cms_entry_locale_delivery_value_decimal_unique")
      .on(table.localeId, table.collectionId, table.fieldId, table.decimalValue)
      .where(sql`${table.uniqueLookup} and ${table.decimalValue} is not null`),
    uniqueIndex("cms_entry_locale_delivery_value_date_unique")
      .on(table.localeId, table.collectionId, table.fieldId, table.dateValue)
      .where(sql`${table.uniqueLookup} and ${table.dateValue} is not null`),
    uniqueIndex("cms_entry_locale_delivery_value_date_time_unique")
      .on(table.localeId, table.collectionId, table.fieldId, table.dateTimeValue)
      .where(sql`${table.uniqueLookup} and ${table.dateTimeValue} is not null`),
    uniqueIndex("cms_entry_locale_delivery_value_reference_unique")
      .on(table.localeId, table.collectionId, table.fieldId, table.referenceValue)
      .where(sql`${table.uniqueLookup} and ${table.referenceValue} is not null`),
    check(
      "cms_entry_locale_delivery_value_text_bounded",
      sql`${table.textValue} is null or octet_length(${table.textValue}) <= 2048`,
    ),
    check(
      "cms_entry_locale_delivery_value_unique_kind_valid",
      sql`not ${table.uniqueLookup} or ${table.valueKind} <> 'boolean'`,
    ),
    index("cms_entry_locale_delivery_value_publication_idx").on(table.publicationId),
  ],
);

export const cmsEntryPublicationCommand = pgTable(
  "cms_entry_publication_command",
  {
    entryId: uuid("entry_id").notNull(),
    commandId: uuid("command_id").notNull(),
    workspaceId: uuid("workspace_id").notNull(),
    projectId: uuid("project_id").notNull(),
    environmentId: uuid("environment_id").notNull(),
    collectionId: uuid("collection_id").notNull(),
    localeId: uuid("locale_id").notNull(),
    operation: varchar("operation", { length: 16 }).notNull(),
    commandFingerprint: char("command_fingerprint", { length: 64 }).notNull(),
    resultKind: varchar("result_kind", { length: 16 }).notNull(),
    resultHeadVersion: integer("result_head_version").notNull(),
    resultCurrentPublicationId: uuid("result_current_publication_id"),
    resultLatestPublicationSequence: integer("result_latest_publication_sequence").notNull(),
    resultEventSequence: integer("result_event_sequence"),
    completedByUserId: text("completed_by_user_id")
      .notNull()
      .references(() => user.id, { onDelete: "restrict" }),
    completedAt: cmsTimestamp("completed_at").defaultNow().notNull(),
  },
  (table) => [
    primaryKey({
      name: "cms_entry_pub_command_entry_command_pk",
      columns: [table.entryId, table.commandId],
    }),
    foreignKey({
      name: "cms_entry_pub_command_entry_tenant_fk",
      columns: [
        table.entryId,
        table.collectionId,
        table.environmentId,
        table.projectId,
        table.workspaceId,
      ],
      foreignColumns: [
        cmsEntry.id,
        cmsEntry.collectionId,
        cmsEntry.environmentId,
        cmsEntry.projectId,
        cmsEntry.workspaceId,
      ],
    }).onDelete("restrict"),
    foreignKey({
      name: "cms_entry_pub_command_locale_tenant_fk",
      columns: [table.localeId, table.projectId, table.workspaceId],
      foreignColumns: [projectLocale.id, projectLocale.projectId, projectLocale.workspaceId],
    }).onDelete("restrict"),
    foreignKey({
      name: "cms_entry_pub_command_result_publication_fk",
      columns: [
        table.resultCurrentPublicationId,
        table.entryId,
        table.localeId,
        table.collectionId,
        table.environmentId,
        table.projectId,
        table.workspaceId,
        table.resultLatestPublicationSequence,
      ],
      foreignColumns: [
        cmsEntryLocalePublication.id,
        cmsEntryLocalePublication.entryId,
        cmsEntryLocalePublication.localeId,
        cmsEntryLocalePublication.collectionId,
        cmsEntryLocalePublication.environmentId,
        cmsEntryLocalePublication.projectId,
        cmsEntryLocalePublication.workspaceId,
        cmsEntryLocalePublication.publicationSequence,
      ],
    }).onDelete("restrict"),
    check(
      "cms_entry_pub_command_operation_valid",
      sql`${table.operation} in ('publish', 'unpublish')`,
    ),
    check(
      "cms_entry_pub_command_fingerprint_valid",
      sql`${table.commandFingerprint} ~ '^[0-9a-f]{64}$'`,
    ),
    check(
      "cms_entry_pub_command_result_kind_valid",
      sql`${table.resultKind} in ('changed', 'no_op')`,
    ),
    check(
      "cms_entry_pub_command_head_result_valid",
      sql`(${table.resultHeadVersion} = 0 and ${table.resultLatestPublicationSequence} = 0 and ${table.resultCurrentPublicationId} is null) or (${table.resultHeadVersion} > 0 and ${table.resultLatestPublicationSequence} > 0)`,
    ),
    check(
      "cms_entry_pub_command_operation_result_valid",
      sql`(${table.operation} = 'publish' and ${table.resultCurrentPublicationId} is not null) or (${table.operation} = 'unpublish' and ${table.resultCurrentPublicationId} is null)`,
    ),
    check(
      "cms_entry_pub_command_event_result_valid",
      sql`(${table.resultKind} = 'changed' and ${table.resultEventSequence} > 0) or (${table.resultKind} = 'no_op' and ${table.resultEventSequence} is null)`,
    ),
    index("cms_entry_pub_command_locale_idx").on(table.localeId),
    index("cms_entry_pub_command_completed_by_idx").on(table.completedByUserId),
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
    localeId: uuid("locale_id"),
    entryPublicationId: uuid("entry_publication_id"),
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
    foreignKey({
      name: "outbox_event_locale_tenant_fk",
      columns: [table.localeId, table.projectId, table.workspaceId],
      foreignColumns: [projectLocale.id, projectLocale.projectId, projectLocale.workspaceId],
    }).onDelete("restrict"),
    foreignKey({
      name: "outbox_event_entry_publication_scope_fk",
      columns: [
        table.entryPublicationId,
        table.subjectId,
        table.localeId,
        table.environmentId,
        table.projectId,
        table.workspaceId,
      ],
      foreignColumns: [
        cmsEntryLocalePublication.id,
        cmsEntryLocalePublication.entryId,
        cmsEntryLocalePublication.localeId,
        cmsEntryLocalePublication.environmentId,
        cmsEntryLocalePublication.projectId,
        cmsEntryLocalePublication.workspaceId,
      ],
    }).onDelete("restrict"),
    unique("outbox_event_logical_sequence_unique").on(
      table.eventType,
      table.subjectId,
      table.aggregateSequence,
    ),
    uniqueIndex("outbox_event_entry_sequence_unique")
      .on(table.subjectId, table.aggregateSequence)
      .where(sql`${table.eventType} in ('cms.entry.published', 'cms.entry.unpublished')`),
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
      "outbox_event_publication_scope_paired",
      sql`(${table.localeId} is null and ${table.entryPublicationId} is null) or (${table.localeId} is not null and ${table.entryPublicationId} is not null)`,
    ),
    check(
      "outbox_event_schema_publication_valid",
      sql`${table.eventType} <> 'cms.schema.published' or (${table.subjectType} = 'cms.collection' and ${table.schemaRevisionId} is not null and ${table.localeId} is null and ${table.entryPublicationId} is null)`,
    ),
    check(
      "outbox_event_entry_publication_valid",
      sql`${table.eventType} not in ('cms.entry.published', 'cms.entry.unpublished') or (${table.subjectType} = 'cms.entry' and ${table.schemaRevisionId} is not null and ${table.localeId} is not null and ${table.entryPublicationId} is not null)`,
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
    index("outbox_event_locale_idx")
      .on(table.localeId)
      .where(sql`${table.localeId} is not null`),
    index("outbox_event_entry_publication_idx")
      .on(table.entryPublicationId)
      .where(sql`${table.entryPublicationId} is not null`),
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
  referencingFields: many(cmsCollectionField, {
    relationName: "cmsCollectionFieldReferenceTarget",
  }),
  revisionReferencingFields: many(cmsSchemaRevisionField, {
    relationName: "cmsRevisionFieldReferenceTarget",
  }),
  revisions: many(cmsSchemaRevision),
  schemaHead: one(cmsCollectionSchemaHead),
  entries: many(cmsEntry),
  entryPublications: many(cmsEntryLocalePublication),
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
  parent: one(cmsCollectionField, {
    relationName: "cmsCollectionFieldTree",
    fields: [cmsCollectionField.parentFieldId],
    references: [cmsCollectionField.id],
  }),
  children: many(cmsCollectionField, {
    relationName: "cmsCollectionFieldTree",
  }),
  referenceCollection: one(cmsCollection, {
    relationName: "cmsCollectionFieldReferenceTarget",
    fields: [cmsCollectionField.referenceCollectionId],
    references: [cmsCollection.id],
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
  entrySharedRevisions: many(cmsEntrySharedRevision),
  entryLocaleRevisions: many(cmsEntryLocaleRevision),
  entryPublications: many(cmsEntryLocalePublication),
  outboxEvents: many(outboxEvent),
}));

export const cmsSchemaRevisionFieldRelations = relations(
  cmsSchemaRevisionField,
  ({ one, many }) => ({
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
    parent: one(cmsSchemaRevisionField, {
      relationName: "cmsSchemaRevisionFieldTree",
      fields: [cmsSchemaRevisionField.revisionId, cmsSchemaRevisionField.parentFieldId],
      references: [cmsSchemaRevisionField.revisionId, cmsSchemaRevisionField.fieldId],
    }),
    children: many(cmsSchemaRevisionField, {
      relationName: "cmsSchemaRevisionFieldTree",
    }),
    referenceCollection: one(cmsCollection, {
      relationName: "cmsRevisionFieldReferenceTarget",
      fields: [cmsSchemaRevisionField.referenceCollectionId],
      references: [cmsCollection.id],
    }),
  }),
);

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

export const cmsEntryRelations = relations(cmsEntry, ({ one, many }) => ({
  workspace: one(workspace, {
    fields: [cmsEntry.workspaceId],
    references: [workspace.id],
  }),
  project: one(project, {
    fields: [cmsEntry.projectId, cmsEntry.workspaceId],
    references: [project.id, project.workspaceId],
  }),
  environment: one(environment, {
    fields: [cmsEntry.environmentId, cmsEntry.projectId, cmsEntry.workspaceId],
    references: [environment.id, environment.projectId, environment.workspaceId],
  }),
  collection: one(cmsCollection, {
    fields: [
      cmsEntry.collectionId,
      cmsEntry.environmentId,
      cmsEntry.projectId,
      cmsEntry.workspaceId,
    ],
    references: [
      cmsCollection.id,
      cmsCollection.environmentId,
      cmsCollection.projectId,
      cmsCollection.workspaceId,
    ],
  }),
  creator: one(user, {
    relationName: "cmsEntryCreator",
    fields: [cmsEntry.createdByUserId],
    references: [user.id],
  }),
  changedBy: one(user, {
    relationName: "cmsEntryChanger",
    fields: [cmsEntry.changedByUserId],
    references: [user.id],
  }),
  sharedDraft: one(cmsEntrySharedDraft),
  localeDrafts: many(cmsEntryLocaleDraft),
  sharedRevisions: many(cmsEntrySharedRevision),
  localeRevisions: many(cmsEntryLocaleRevision),
  commands: many(cmsEntryDraftCommand),
  publications: many(cmsEntryLocalePublication),
  publicationHeads: many(cmsEntryLocalePublicationHead),
  publicationCommands: many(cmsEntryPublicationCommand),
}));

export const cmsEntrySharedRevisionRelations = relations(
  cmsEntrySharedRevision,
  ({ one, many }) => ({
    entry: one(cmsEntry, {
      fields: [
        cmsEntrySharedRevision.entryId,
        cmsEntrySharedRevision.collectionId,
        cmsEntrySharedRevision.environmentId,
        cmsEntrySharedRevision.projectId,
        cmsEntrySharedRevision.workspaceId,
      ],
      references: [
        cmsEntry.id,
        cmsEntry.collectionId,
        cmsEntry.environmentId,
        cmsEntry.projectId,
        cmsEntry.workspaceId,
      ],
    }),
    schemaRevision: one(cmsSchemaRevision, {
      fields: [
        cmsEntrySharedRevision.schemaRevisionId,
        cmsEntrySharedRevision.collectionId,
        cmsEntrySharedRevision.environmentId,
        cmsEntrySharedRevision.projectId,
        cmsEntrySharedRevision.workspaceId,
      ],
      references: [
        cmsSchemaRevision.id,
        cmsSchemaRevision.collectionId,
        cmsSchemaRevision.environmentId,
        cmsSchemaRevision.projectId,
        cmsSchemaRevision.workspaceId,
      ],
    }),
    previousRevision: one(cmsEntrySharedRevision, {
      relationName: "cmsEntrySharedRevisionLineage",
      fields: [
        cmsEntrySharedRevision.previousRevisionId,
        cmsEntrySharedRevision.entryId,
        cmsEntrySharedRevision.collectionId,
        cmsEntrySharedRevision.environmentId,
        cmsEntrySharedRevision.projectId,
        cmsEntrySharedRevision.workspaceId,
      ],
      references: [
        cmsEntrySharedRevision.id,
        cmsEntrySharedRevision.entryId,
        cmsEntrySharedRevision.collectionId,
        cmsEntrySharedRevision.environmentId,
        cmsEntrySharedRevision.projectId,
        cmsEntrySharedRevision.workspaceId,
      ],
    }),
    nextRevisions: many(cmsEntrySharedRevision, {
      relationName: "cmsEntrySharedRevisionLineage",
    }),
    restoredFromRevision: one(cmsEntrySharedRevision, {
      relationName: "cmsEntrySharedRevisionRestore",
      fields: [
        cmsEntrySharedRevision.restoredFromRevisionId,
        cmsEntrySharedRevision.entryId,
        cmsEntrySharedRevision.collectionId,
        cmsEntrySharedRevision.environmentId,
        cmsEntrySharedRevision.projectId,
        cmsEntrySharedRevision.workspaceId,
      ],
      references: [
        cmsEntrySharedRevision.id,
        cmsEntrySharedRevision.entryId,
        cmsEntrySharedRevision.collectionId,
        cmsEntrySharedRevision.environmentId,
        cmsEntrySharedRevision.projectId,
        cmsEntrySharedRevision.workspaceId,
      ],
    }),
    restoreRevisions: many(cmsEntrySharedRevision, {
      relationName: "cmsEntrySharedRevisionRestore",
    }),
    author: one(user, {
      relationName: "cmsEntrySharedRevisionAuthor",
      fields: [cmsEntrySharedRevision.authoredByUserId],
      references: [user.id],
    }),
    publications: many(cmsEntryLocalePublication),
  }),
);

export const cmsEntryLocaleRevisionRelations = relations(
  cmsEntryLocaleRevision,
  ({ one, many }) => ({
    entry: one(cmsEntry, {
      fields: [
        cmsEntryLocaleRevision.entryId,
        cmsEntryLocaleRevision.collectionId,
        cmsEntryLocaleRevision.environmentId,
        cmsEntryLocaleRevision.projectId,
        cmsEntryLocaleRevision.workspaceId,
      ],
      references: [
        cmsEntry.id,
        cmsEntry.collectionId,
        cmsEntry.environmentId,
        cmsEntry.projectId,
        cmsEntry.workspaceId,
      ],
    }),
    locale: one(projectLocale, {
      fields: [
        cmsEntryLocaleRevision.localeId,
        cmsEntryLocaleRevision.projectId,
        cmsEntryLocaleRevision.workspaceId,
      ],
      references: [projectLocale.id, projectLocale.projectId, projectLocale.workspaceId],
    }),
    schemaRevision: one(cmsSchemaRevision, {
      fields: [
        cmsEntryLocaleRevision.schemaRevisionId,
        cmsEntryLocaleRevision.collectionId,
        cmsEntryLocaleRevision.environmentId,
        cmsEntryLocaleRevision.projectId,
        cmsEntryLocaleRevision.workspaceId,
      ],
      references: [
        cmsSchemaRevision.id,
        cmsSchemaRevision.collectionId,
        cmsSchemaRevision.environmentId,
        cmsSchemaRevision.projectId,
        cmsSchemaRevision.workspaceId,
      ],
    }),
    previousRevision: one(cmsEntryLocaleRevision, {
      relationName: "cmsEntryLocaleRevisionLineage",
      fields: [
        cmsEntryLocaleRevision.previousRevisionId,
        cmsEntryLocaleRevision.entryId,
        cmsEntryLocaleRevision.localeId,
        cmsEntryLocaleRevision.collectionId,
        cmsEntryLocaleRevision.environmentId,
        cmsEntryLocaleRevision.projectId,
        cmsEntryLocaleRevision.workspaceId,
      ],
      references: [
        cmsEntryLocaleRevision.id,
        cmsEntryLocaleRevision.entryId,
        cmsEntryLocaleRevision.localeId,
        cmsEntryLocaleRevision.collectionId,
        cmsEntryLocaleRevision.environmentId,
        cmsEntryLocaleRevision.projectId,
        cmsEntryLocaleRevision.workspaceId,
      ],
    }),
    nextRevisions: many(cmsEntryLocaleRevision, {
      relationName: "cmsEntryLocaleRevisionLineage",
    }),
    restoredFromRevision: one(cmsEntryLocaleRevision, {
      relationName: "cmsEntryLocaleRevisionRestore",
      fields: [
        cmsEntryLocaleRevision.restoredFromRevisionId,
        cmsEntryLocaleRevision.entryId,
        cmsEntryLocaleRevision.localeId,
        cmsEntryLocaleRevision.collectionId,
        cmsEntryLocaleRevision.environmentId,
        cmsEntryLocaleRevision.projectId,
        cmsEntryLocaleRevision.workspaceId,
      ],
      references: [
        cmsEntryLocaleRevision.id,
        cmsEntryLocaleRevision.entryId,
        cmsEntryLocaleRevision.localeId,
        cmsEntryLocaleRevision.collectionId,
        cmsEntryLocaleRevision.environmentId,
        cmsEntryLocaleRevision.projectId,
        cmsEntryLocaleRevision.workspaceId,
      ],
    }),
    restoreRevisions: many(cmsEntryLocaleRevision, {
      relationName: "cmsEntryLocaleRevisionRestore",
    }),
    author: one(user, {
      relationName: "cmsEntryLocaleRevisionAuthor",
      fields: [cmsEntryLocaleRevision.authoredByUserId],
      references: [user.id],
    }),
    publications: many(cmsEntryLocalePublication),
  }),
);

export const cmsEntrySharedDraftRelations = relations(cmsEntrySharedDraft, ({ one }) => ({
  entry: one(cmsEntry, {
    fields: [
      cmsEntrySharedDraft.entryId,
      cmsEntrySharedDraft.collectionId,
      cmsEntrySharedDraft.environmentId,
      cmsEntrySharedDraft.projectId,
      cmsEntrySharedDraft.workspaceId,
    ],
    references: [
      cmsEntry.id,
      cmsEntry.collectionId,
      cmsEntry.environmentId,
      cmsEntry.projectId,
      cmsEntry.workspaceId,
    ],
  }),
  currentRevision: one(cmsEntrySharedRevision, {
    fields: [
      cmsEntrySharedDraft.currentRevisionId,
      cmsEntrySharedDraft.entryId,
      cmsEntrySharedDraft.collectionId,
      cmsEntrySharedDraft.environmentId,
      cmsEntrySharedDraft.projectId,
      cmsEntrySharedDraft.workspaceId,
      cmsEntrySharedDraft.version,
    ],
    references: [
      cmsEntrySharedRevision.id,
      cmsEntrySharedRevision.entryId,
      cmsEntrySharedRevision.collectionId,
      cmsEntrySharedRevision.environmentId,
      cmsEntrySharedRevision.projectId,
      cmsEntrySharedRevision.workspaceId,
      cmsEntrySharedRevision.sequence,
    ],
  }),
  changedBy: one(user, {
    relationName: "cmsEntrySharedDraftChanger",
    fields: [cmsEntrySharedDraft.changedByUserId],
    references: [user.id],
  }),
}));

export const cmsEntryLocaleDraftRelations = relations(cmsEntryLocaleDraft, ({ one }) => ({
  entry: one(cmsEntry, {
    fields: [
      cmsEntryLocaleDraft.entryId,
      cmsEntryLocaleDraft.collectionId,
      cmsEntryLocaleDraft.environmentId,
      cmsEntryLocaleDraft.projectId,
      cmsEntryLocaleDraft.workspaceId,
    ],
    references: [
      cmsEntry.id,
      cmsEntry.collectionId,
      cmsEntry.environmentId,
      cmsEntry.projectId,
      cmsEntry.workspaceId,
    ],
  }),
  locale: one(projectLocale, {
    fields: [
      cmsEntryLocaleDraft.localeId,
      cmsEntryLocaleDraft.projectId,
      cmsEntryLocaleDraft.workspaceId,
    ],
    references: [projectLocale.id, projectLocale.projectId, projectLocale.workspaceId],
  }),
  currentRevision: one(cmsEntryLocaleRevision, {
    fields: [
      cmsEntryLocaleDraft.currentRevisionId,
      cmsEntryLocaleDraft.entryId,
      cmsEntryLocaleDraft.localeId,
      cmsEntryLocaleDraft.collectionId,
      cmsEntryLocaleDraft.environmentId,
      cmsEntryLocaleDraft.projectId,
      cmsEntryLocaleDraft.workspaceId,
      cmsEntryLocaleDraft.version,
    ],
    references: [
      cmsEntryLocaleRevision.id,
      cmsEntryLocaleRevision.entryId,
      cmsEntryLocaleRevision.localeId,
      cmsEntryLocaleRevision.collectionId,
      cmsEntryLocaleRevision.environmentId,
      cmsEntryLocaleRevision.projectId,
      cmsEntryLocaleRevision.workspaceId,
      cmsEntryLocaleRevision.sequence,
    ],
  }),
  changedBy: one(user, {
    relationName: "cmsEntryLocaleDraftChanger",
    fields: [cmsEntryLocaleDraft.changedByUserId],
    references: [user.id],
  }),
}));

export const cmsEntryDraftCommandRelations = relations(cmsEntryDraftCommand, ({ one }) => ({
  entry: one(cmsEntry, {
    fields: [
      cmsEntryDraftCommand.entryId,
      cmsEntryDraftCommand.collectionId,
      cmsEntryDraftCommand.environmentId,
      cmsEntryDraftCommand.projectId,
      cmsEntryDraftCommand.workspaceId,
    ],
    references: [
      cmsEntry.id,
      cmsEntry.collectionId,
      cmsEntry.environmentId,
      cmsEntry.projectId,
      cmsEntry.workspaceId,
    ],
  }),
  locale: one(projectLocale, {
    fields: [
      cmsEntryDraftCommand.localeId,
      cmsEntryDraftCommand.projectId,
      cmsEntryDraftCommand.workspaceId,
    ],
    references: [projectLocale.id, projectLocale.projectId, projectLocale.workspaceId],
  }),
  resultSharedRevision: one(cmsEntrySharedRevision, {
    fields: [
      cmsEntryDraftCommand.resultSharedRevisionId,
      cmsEntryDraftCommand.entryId,
      cmsEntryDraftCommand.collectionId,
      cmsEntryDraftCommand.environmentId,
      cmsEntryDraftCommand.projectId,
      cmsEntryDraftCommand.workspaceId,
    ],
    references: [
      cmsEntrySharedRevision.id,
      cmsEntrySharedRevision.entryId,
      cmsEntrySharedRevision.collectionId,
      cmsEntrySharedRevision.environmentId,
      cmsEntrySharedRevision.projectId,
      cmsEntrySharedRevision.workspaceId,
    ],
  }),
  resultLocaleRevision: one(cmsEntryLocaleRevision, {
    fields: [
      cmsEntryDraftCommand.resultLocaleRevisionId,
      cmsEntryDraftCommand.entryId,
      cmsEntryDraftCommand.localeId,
      cmsEntryDraftCommand.collectionId,
      cmsEntryDraftCommand.environmentId,
      cmsEntryDraftCommand.projectId,
      cmsEntryDraftCommand.workspaceId,
    ],
    references: [
      cmsEntryLocaleRevision.id,
      cmsEntryLocaleRevision.entryId,
      cmsEntryLocaleRevision.localeId,
      cmsEntryLocaleRevision.collectionId,
      cmsEntryLocaleRevision.environmentId,
      cmsEntryLocaleRevision.projectId,
      cmsEntryLocaleRevision.workspaceId,
    ],
  }),
  completedBy: one(user, {
    relationName: "cmsEntryDraftCommandCompleter",
    fields: [cmsEntryDraftCommand.completedByUserId],
    references: [user.id],
  }),
}));

export const cmsEntryLocalePublicationRelations = relations(
  cmsEntryLocalePublication,
  ({ one, many }) => ({
    entry: one(cmsEntry, {
      fields: [
        cmsEntryLocalePublication.entryId,
        cmsEntryLocalePublication.collectionId,
        cmsEntryLocalePublication.environmentId,
        cmsEntryLocalePublication.projectId,
        cmsEntryLocalePublication.workspaceId,
      ],
      references: [
        cmsEntry.id,
        cmsEntry.collectionId,
        cmsEntry.environmentId,
        cmsEntry.projectId,
        cmsEntry.workspaceId,
      ],
    }),
    locale: one(projectLocale, {
      fields: [
        cmsEntryLocalePublication.localeId,
        cmsEntryLocalePublication.projectId,
        cmsEntryLocalePublication.workspaceId,
      ],
      references: [projectLocale.id, projectLocale.projectId, projectLocale.workspaceId],
    }),
    schemaRevision: one(cmsSchemaRevision, {
      fields: [
        cmsEntryLocalePublication.schemaRevisionId,
        cmsEntryLocalePublication.collectionId,
        cmsEntryLocalePublication.environmentId,
        cmsEntryLocalePublication.projectId,
        cmsEntryLocalePublication.workspaceId,
      ],
      references: [
        cmsSchemaRevision.id,
        cmsSchemaRevision.collectionId,
        cmsSchemaRevision.environmentId,
        cmsSchemaRevision.projectId,
        cmsSchemaRevision.workspaceId,
      ],
    }),
    sharedSourceRevision: one(cmsEntrySharedRevision, {
      fields: [
        cmsEntryLocalePublication.sharedSourceRevisionId,
        cmsEntryLocalePublication.entryId,
        cmsEntryLocalePublication.collectionId,
        cmsEntryLocalePublication.environmentId,
        cmsEntryLocalePublication.projectId,
        cmsEntryLocalePublication.workspaceId,
        cmsEntryLocalePublication.sharedSourceVersion,
      ],
      references: [
        cmsEntrySharedRevision.id,
        cmsEntrySharedRevision.entryId,
        cmsEntrySharedRevision.collectionId,
        cmsEntrySharedRevision.environmentId,
        cmsEntrySharedRevision.projectId,
        cmsEntrySharedRevision.workspaceId,
        cmsEntrySharedRevision.sequence,
      ],
    }),
    localeSourceRevision: one(cmsEntryLocaleRevision, {
      fields: [
        cmsEntryLocalePublication.localeSourceRevisionId,
        cmsEntryLocalePublication.entryId,
        cmsEntryLocalePublication.localeId,
        cmsEntryLocalePublication.collectionId,
        cmsEntryLocalePublication.environmentId,
        cmsEntryLocalePublication.projectId,
        cmsEntryLocalePublication.workspaceId,
        cmsEntryLocalePublication.localeSourceVersion,
      ],
      references: [
        cmsEntryLocaleRevision.id,
        cmsEntryLocaleRevision.entryId,
        cmsEntryLocaleRevision.localeId,
        cmsEntryLocaleRevision.collectionId,
        cmsEntryLocaleRevision.environmentId,
        cmsEntryLocaleRevision.projectId,
        cmsEntryLocaleRevision.workspaceId,
        cmsEntryLocaleRevision.sequence,
      ],
    }),
    previousPublication: one(cmsEntryLocalePublication, {
      relationName: "cmsEntryLocalePublicationLineage",
      fields: [
        cmsEntryLocalePublication.previousPublicationId,
        cmsEntryLocalePublication.entryId,
        cmsEntryLocalePublication.localeId,
        cmsEntryLocalePublication.collectionId,
        cmsEntryLocalePublication.environmentId,
        cmsEntryLocalePublication.projectId,
        cmsEntryLocalePublication.workspaceId,
      ],
      references: [
        cmsEntryLocalePublication.id,
        cmsEntryLocalePublication.entryId,
        cmsEntryLocalePublication.localeId,
        cmsEntryLocalePublication.collectionId,
        cmsEntryLocalePublication.environmentId,
        cmsEntryLocalePublication.projectId,
        cmsEntryLocalePublication.workspaceId,
      ],
    }),
    nextPublications: many(cmsEntryLocalePublication, {
      relationName: "cmsEntryLocalePublicationLineage",
    }),
    publisher: one(user, {
      relationName: "cmsEntryLocalePublicationPublisher",
      fields: [cmsEntryLocalePublication.publishedByUserId],
      references: [user.id],
    }),
    snapshot: one(cmsEntryLocaleDeliverySnapshot),
    sourceReferences: many(cmsEntryLocalePublicationReference, {
      relationName: "cmsEntryPublicationReferenceSource",
    }),
    targetReferences: many(cmsEntryLocalePublicationReference, {
      relationName: "cmsEntryPublicationReferenceTarget",
    }),
    currentHeads: many(cmsEntryLocalePublicationHead),
    commandResults: many(cmsEntryPublicationCommand),
    outboxEvents: many(outboxEvent),
  }),
);

export const cmsEntryLocaleDeliverySnapshotRelations = relations(
  cmsEntryLocaleDeliverySnapshot,
  ({ one }) => ({
    publication: one(cmsEntryLocalePublication, {
      fields: [
        cmsEntryLocaleDeliverySnapshot.publicationId,
        cmsEntryLocaleDeliverySnapshot.entryId,
        cmsEntryLocaleDeliverySnapshot.localeId,
        cmsEntryLocaleDeliverySnapshot.collectionId,
        cmsEntryLocaleDeliverySnapshot.environmentId,
        cmsEntryLocaleDeliverySnapshot.projectId,
        cmsEntryLocaleDeliverySnapshot.workspaceId,
      ],
      references: [
        cmsEntryLocalePublication.id,
        cmsEntryLocalePublication.entryId,
        cmsEntryLocalePublication.localeId,
        cmsEntryLocalePublication.collectionId,
        cmsEntryLocalePublication.environmentId,
        cmsEntryLocalePublication.projectId,
        cmsEntryLocalePublication.workspaceId,
      ],
    }),
  }),
);

export const cmsEntryLocalePublicationReferenceRelations = relations(
  cmsEntryLocalePublicationReference,
  ({ one }) => ({
    sourcePublication: one(cmsEntryLocalePublication, {
      relationName: "cmsEntryPublicationReferenceSource",
      fields: [
        cmsEntryLocalePublicationReference.sourcePublicationId,
        cmsEntryLocalePublicationReference.sourceEntryId,
        cmsEntryLocalePublicationReference.localeId,
        cmsEntryLocalePublicationReference.sourceCollectionId,
        cmsEntryLocalePublicationReference.environmentId,
        cmsEntryLocalePublicationReference.projectId,
        cmsEntryLocalePublicationReference.workspaceId,
      ],
      references: [
        cmsEntryLocalePublication.id,
        cmsEntryLocalePublication.entryId,
        cmsEntryLocalePublication.localeId,
        cmsEntryLocalePublication.collectionId,
        cmsEntryLocalePublication.environmentId,
        cmsEntryLocalePublication.projectId,
        cmsEntryLocalePublication.workspaceId,
      ],
    }),
    sourceField: one(cmsCollectionField, {
      fields: [
        cmsEntryLocalePublicationReference.sourceFieldId,
        cmsEntryLocalePublicationReference.sourceCollectionId,
        cmsEntryLocalePublicationReference.environmentId,
        cmsEntryLocalePublicationReference.projectId,
        cmsEntryLocalePublicationReference.workspaceId,
      ],
      references: [
        cmsCollectionField.id,
        cmsCollectionField.collectionId,
        cmsCollectionField.environmentId,
        cmsCollectionField.projectId,
        cmsCollectionField.workspaceId,
      ],
    }),
    targetPublication: one(cmsEntryLocalePublication, {
      relationName: "cmsEntryPublicationReferenceTarget",
      fields: [
        cmsEntryLocalePublicationReference.targetPublicationId,
        cmsEntryLocalePublicationReference.targetEntryId,
        cmsEntryLocalePublicationReference.localeId,
        cmsEntryLocalePublicationReference.targetCollectionId,
        cmsEntryLocalePublicationReference.environmentId,
        cmsEntryLocalePublicationReference.projectId,
        cmsEntryLocalePublicationReference.workspaceId,
      ],
      references: [
        cmsEntryLocalePublication.id,
        cmsEntryLocalePublication.entryId,
        cmsEntryLocalePublication.localeId,
        cmsEntryLocalePublication.collectionId,
        cmsEntryLocalePublication.environmentId,
        cmsEntryLocalePublication.projectId,
        cmsEntryLocalePublication.workspaceId,
      ],
    }),
  }),
);

export const cmsEntryLocalePublicationHeadRelations = relations(
  cmsEntryLocalePublicationHead,
  ({ one }) => ({
    entry: one(cmsEntry, {
      fields: [
        cmsEntryLocalePublicationHead.entryId,
        cmsEntryLocalePublicationHead.collectionId,
        cmsEntryLocalePublicationHead.environmentId,
        cmsEntryLocalePublicationHead.projectId,
        cmsEntryLocalePublicationHead.workspaceId,
      ],
      references: [
        cmsEntry.id,
        cmsEntry.collectionId,
        cmsEntry.environmentId,
        cmsEntry.projectId,
        cmsEntry.workspaceId,
      ],
    }),
    locale: one(projectLocale, {
      fields: [
        cmsEntryLocalePublicationHead.localeId,
        cmsEntryLocalePublicationHead.projectId,
        cmsEntryLocalePublicationHead.workspaceId,
      ],
      references: [projectLocale.id, projectLocale.projectId, projectLocale.workspaceId],
    }),
    currentPublication: one(cmsEntryLocalePublication, {
      fields: [
        cmsEntryLocalePublicationHead.currentPublicationId,
        cmsEntryLocalePublicationHead.entryId,
        cmsEntryLocalePublicationHead.localeId,
        cmsEntryLocalePublicationHead.collectionId,
        cmsEntryLocalePublicationHead.environmentId,
        cmsEntryLocalePublicationHead.projectId,
        cmsEntryLocalePublicationHead.workspaceId,
        cmsEntryLocalePublicationHead.latestPublicationSequence,
      ],
      references: [
        cmsEntryLocalePublication.id,
        cmsEntryLocalePublication.entryId,
        cmsEntryLocalePublication.localeId,
        cmsEntryLocalePublication.collectionId,
        cmsEntryLocalePublication.environmentId,
        cmsEntryLocalePublication.projectId,
        cmsEntryLocalePublication.workspaceId,
        cmsEntryLocalePublication.publicationSequence,
      ],
    }),
    changedBy: one(user, {
      relationName: "cmsEntryLocalePublicationHeadChanger",
      fields: [cmsEntryLocalePublicationHead.changedByUserId],
      references: [user.id],
    }),
  }),
);

export const cmsEntryPublicationCommandRelations = relations(
  cmsEntryPublicationCommand,
  ({ one }) => ({
    entry: one(cmsEntry, {
      fields: [
        cmsEntryPublicationCommand.entryId,
        cmsEntryPublicationCommand.collectionId,
        cmsEntryPublicationCommand.environmentId,
        cmsEntryPublicationCommand.projectId,
        cmsEntryPublicationCommand.workspaceId,
      ],
      references: [
        cmsEntry.id,
        cmsEntry.collectionId,
        cmsEntry.environmentId,
        cmsEntry.projectId,
        cmsEntry.workspaceId,
      ],
    }),
    locale: one(projectLocale, {
      fields: [
        cmsEntryPublicationCommand.localeId,
        cmsEntryPublicationCommand.projectId,
        cmsEntryPublicationCommand.workspaceId,
      ],
      references: [projectLocale.id, projectLocale.projectId, projectLocale.workspaceId],
    }),
    resultCurrentPublication: one(cmsEntryLocalePublication, {
      fields: [
        cmsEntryPublicationCommand.resultCurrentPublicationId,
        cmsEntryPublicationCommand.entryId,
        cmsEntryPublicationCommand.localeId,
        cmsEntryPublicationCommand.collectionId,
        cmsEntryPublicationCommand.environmentId,
        cmsEntryPublicationCommand.projectId,
        cmsEntryPublicationCommand.workspaceId,
        cmsEntryPublicationCommand.resultLatestPublicationSequence,
      ],
      references: [
        cmsEntryLocalePublication.id,
        cmsEntryLocalePublication.entryId,
        cmsEntryLocalePublication.localeId,
        cmsEntryLocalePublication.collectionId,
        cmsEntryLocalePublication.environmentId,
        cmsEntryLocalePublication.projectId,
        cmsEntryLocalePublication.workspaceId,
        cmsEntryLocalePublication.publicationSequence,
      ],
    }),
    completedBy: one(user, {
      relationName: "cmsEntryPublicationCommandCompleter",
      fields: [cmsEntryPublicationCommand.completedByUserId],
      references: [user.id],
    }),
  }),
);

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
  locale: one(projectLocale, {
    fields: [outboxEvent.localeId, outboxEvent.projectId, outboxEvent.workspaceId],
    references: [projectLocale.id, projectLocale.projectId, projectLocale.workspaceId],
  }),
  entryPublication: one(cmsEntryLocalePublication, {
    fields: [
      outboxEvent.entryPublicationId,
      outboxEvent.subjectId,
      outboxEvent.localeId,
      outboxEvent.environmentId,
      outboxEvent.projectId,
      outboxEvent.workspaceId,
    ],
    references: [
      cmsEntryLocalePublication.id,
      cmsEntryLocalePublication.entryId,
      cmsEntryLocalePublication.localeId,
      cmsEntryLocalePublication.environmentId,
      cmsEntryLocalePublication.projectId,
      cmsEntryLocalePublication.workspaceId,
    ],
  }),
}));
