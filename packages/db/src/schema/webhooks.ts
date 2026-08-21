// Defines tenant-scoped publication events, webhook configuration, delivery leases, and attempt history.

import { relations, sql } from "drizzle-orm";
import {
  bigint,
  char,
  check,
  foreignKey,
  index,
  integer,
  pgTable,
  text,
  timestamp,
  unique,
  uniqueIndex,
  uuid,
  varchar,
  type PgTableExtraConfigValue,
} from "drizzle-orm/pg-core";

import { user } from "./auth";
import { cmsCollection, cmsEntry, outboxEvent } from "./cms";
import { projectLocale } from "./locale";
import { environment, project, workspace } from "./platform";

const webhookId = (name: string) =>
  uuid(name)
    .default(sql`uuidv7()`)
    .notNull();
const webhookTimestamp = (name: string) => timestamp(name, { withTimezone: true, mode: "date" });

const publicEventTypesSql = sql.raw(
  "('cms.schema.published', 'cms.entry.published', 'cms.entry.unpublished')",
);
const publicEventTypeArraySql = sql.raw(
  "array['cms.schema.published', 'cms.entry.published', 'cms.entry.unpublished']::varchar[]",
);
const encryptedValuePatternSql = sql.raw("'^[A-Za-z0-9_-]+$'");

export const publicationEvent = pgTable(
  "publication_event",
  {
    eventId: uuid("event_id").primaryKey(),
    workspaceId: uuid("workspace_id").notNull(),
    projectId: uuid("project_id").notNull(),
    environmentId: uuid("environment_id").notNull(),
    eventType: varchar("event_type", { length: 128 }).notNull(),
    envelopeVersion: integer("envelope_version").default(1).notNull(),
    canonicalBody: text("canonical_body").notNull(),
    bodyHash: char("body_hash", { length: 64 }).notNull(),
    bodyBytes: integer("body_bytes").notNull(),
    occurredAt: webhookTimestamp("occurred_at").notNull(),
    projectedAt: webhookTimestamp("projected_at").defaultNow().notNull(),
  },
  (table) => [
    foreignKey({
      name: "publication_event_outbox_scope_fk",
      columns: [
        table.eventId,
        table.eventType,
        table.environmentId,
        table.projectId,
        table.workspaceId,
      ],
      foreignColumns: [
        outboxEvent.id,
        outboxEvent.eventType,
        outboxEvent.environmentId,
        outboxEvent.projectId,
        outboxEvent.workspaceId,
      ],
    }).onDelete("restrict"),
    unique("publication_event_id_scope_unique").on(
      table.eventId,
      table.environmentId,
      table.projectId,
      table.workspaceId,
    ),
    check("publication_event_type_valid", sql`${table.eventType} in ${publicEventTypesSql}`),
    check("publication_event_version_valid", sql`${table.envelopeVersion} = 1`),
    check(
      "publication_event_body_valid",
      sql`octet_length(${table.canonicalBody}) between 2 and 131072 and left(${table.canonicalBody}, 1) = '{'`,
    ),
    check("publication_event_body_hash_valid", sql`${table.bodyHash} ~ '^[0-9a-f]{64}$'`),
    check(
      "publication_event_body_bytes_valid",
      sql`${table.bodyBytes} = octet_length(${table.canonicalBody}) and ${table.bodyBytes} between 2 and 131072`,
    ),
    check("publication_event_times_valid", sql`${table.projectedAt} >= ${table.occurredAt}`),
    index("publication_event_environment_occurred_id_idx").on(
      table.environmentId,
      table.occurredAt.desc(),
      table.eventId.desc(),
    ),
    index("publication_event_type_occurred_id_idx").on(
      table.eventType,
      table.occurredAt.desc(),
      table.eventId.desc(),
    ),
  ],
);

export const webhookEndpoint = pgTable(
  "webhook_endpoint",
  {
    id: webhookId("id").primaryKey(),
    workspaceId: uuid("workspace_id").notNull(),
    projectId: uuid("project_id").notNull(),
    environmentId: uuid("environment_id").notNull(),
    name: varchar("name", { length: 100 }).notNull(),
    state: varchar("state", { length: 16 }).default("disabled").notNull(),
    version: integer("version").default(1).notNull(),
    currentDestinationId: uuid("current_destination_id"),
    enabledAt: webhookTimestamp("enabled_at"),
    disabledAt: webhookTimestamp("disabled_at"),
    createdByUserId: text("created_by_user_id")
      .notNull()
      .references(() => user.id, { onDelete: "restrict" }),
    changedByUserId: text("changed_by_user_id")
      .notNull()
      .references(() => user.id, { onDelete: "restrict" }),
    leaseToken: uuid("lease_token"),
    leaseExpiresAt: webhookTimestamp("lease_expires_at"),
    createdAt: webhookTimestamp("created_at").defaultNow().notNull(),
    updatedAt: webhookTimestamp("updated_at").defaultNow().notNull(),
  },
  (table): PgTableExtraConfigValue[] => [
    foreignKey({
      name: "webhook_endpoint_environment_tenant_fk",
      columns: [table.environmentId, table.projectId, table.workspaceId],
      foreignColumns: [environment.id, environment.projectId, environment.workspaceId],
    }).onDelete("restrict"),
    foreignKey({
      name: "webhook_endpoint_current_destination_scope_fk",
      columns: [
        table.currentDestinationId,
        table.id,
        table.environmentId,
        table.projectId,
        table.workspaceId,
      ],
      foreignColumns: [
        webhookEndpointDestination.id,
        webhookEndpointDestination.endpointId,
        webhookEndpointDestination.environmentId,
        webhookEndpointDestination.projectId,
        webhookEndpointDestination.workspaceId,
      ],
    }).onDelete("restrict"),
    unique("webhook_endpoint_id_scope_unique").on(
      table.id,
      table.environmentId,
      table.projectId,
      table.workspaceId,
    ),
    check(
      "webhook_endpoint_name_valid",
      sql`char_length(${table.name}) between 1 and 100 and ${table.name} = btrim(${table.name}) and ${table.name} !~ '[[:cntrl:]]'`,
    ),
    check("webhook_endpoint_state_valid", sql`${table.state} in ('enabled', 'disabled')`),
    check("webhook_endpoint_version_positive", sql`${table.version} > 0`),
    check(
      "webhook_endpoint_lifecycle_valid",
      sql`(${table.state} = 'enabled' and ${table.currentDestinationId} is not null and ${table.enabledAt} is not null and ${table.disabledAt} is null) or (${table.state} = 'disabled' and (${table.enabledAt} is null or ${table.disabledAt} is not null))`,
    ),
    check(
      "webhook_endpoint_lease_paired",
      sql`(${table.leaseToken} is null and ${table.leaseExpiresAt} is null) or (${table.leaseToken} is not null and ${table.leaseExpiresAt} is not null)`,
    ),
    check("webhook_endpoint_timestamps_valid", sql`${table.updatedAt} >= ${table.createdAt}`),
    uniqueIndex("webhook_endpoint_environment_active_name_unique")
      .on(table.environmentId, table.name)
      .where(sql`${table.state} = 'enabled'`),
    index("webhook_endpoint_environment_state_created_id_idx").on(
      table.environmentId,
      table.state,
      table.createdAt.desc(),
      table.id.desc(),
    ),
    index("webhook_endpoint_expired_lease_idx")
      .on(table.leaseExpiresAt, table.id)
      .where(sql`${table.leaseExpiresAt} is not null`),
    index("webhook_endpoint_created_by_idx").on(table.createdByUserId),
    index("webhook_endpoint_changed_by_idx").on(table.changedByUserId),
  ],
);

export const webhookEndpointDestination = pgTable(
  "webhook_endpoint_destination",
  {
    id: webhookId("id").primaryKey(),
    endpointId: uuid("endpoint_id").notNull(),
    workspaceId: uuid("workspace_id").notNull(),
    projectId: uuid("project_id").notNull(),
    environmentId: uuid("environment_id").notNull(),
    sequence: integer("sequence").notNull(),
    displayOrigin: varchar("display_origin", { length: 255 }).notNull(),
    encryptionKeyId: varchar("encryption_key_id", { length: 64 }).notNull(),
    nonce: varchar("nonce", { length: 32 }).notNull(),
    ciphertext: text("ciphertext").notNull(),
    keyedFingerprint: char("keyed_fingerprint", { length: 64 }).notNull(),
    createdByUserId: text("created_by_user_id")
      .notNull()
      .references(() => user.id, { onDelete: "restrict" }),
    createdAt: webhookTimestamp("created_at").defaultNow().notNull(),
  },
  (table): PgTableExtraConfigValue[] => [
    foreignKey({
      name: "webhook_destination_endpoint_scope_fk",
      columns: [table.endpointId, table.environmentId, table.projectId, table.workspaceId],
      foreignColumns: [
        webhookEndpoint.id,
        webhookEndpoint.environmentId,
        webhookEndpoint.projectId,
        webhookEndpoint.workspaceId,
      ],
    }).onDelete("restrict"),
    unique("webhook_destination_id_scope_unique").on(
      table.id,
      table.endpointId,
      table.environmentId,
      table.projectId,
      table.workspaceId,
    ),
    unique("webhook_destination_endpoint_sequence_unique").on(table.endpointId, table.sequence),
    check("webhook_destination_sequence_positive", sql`${table.sequence} > 0`),
    check(
      "webhook_destination_origin_valid",
      sql`char_length(${table.displayOrigin}) between 9 and 255 and ${table.displayOrigin} = btrim(${table.displayOrigin}) and ${table.displayOrigin} ~ '^https://[^/?#[:space:]]+$'`,
    ),
    check(
      "webhook_destination_key_id_valid",
      sql`${table.encryptionKeyId} ~ '^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$'`,
    ),
    check(
      "webhook_destination_nonce_valid",
      sql`char_length(${table.nonce}) between 16 and 32 and ${table.nonce} ~ ${encryptedValuePatternSql}`,
    ),
    check(
      "webhook_destination_ciphertext_valid",
      sql`char_length(${table.ciphertext}) between 22 and 4096 and ${table.ciphertext} ~ ${encryptedValuePatternSql}`,
    ),
    check(
      "webhook_destination_fingerprint_valid",
      sql`${table.keyedFingerprint} ~ '^[0-9a-f]{64}$'`,
    ),
    index("webhook_destination_endpoint_sequence_idx").on(table.endpointId, table.sequence.desc()),
    index("webhook_destination_created_by_idx").on(table.createdByUserId),
  ],
);

export const webhookEndpointSubscription = pgTable(
  "webhook_endpoint_subscription",
  {
    id: webhookId("id").primaryKey(),
    endpointId: uuid("endpoint_id").notNull(),
    workspaceId: uuid("workspace_id").notNull(),
    projectId: uuid("project_id").notNull(),
    environmentId: uuid("environment_id").notNull(),
    eventType: varchar("event_type", { length: 128 }).notNull(),
    activeFrom: webhookTimestamp("active_from").notNull(),
    activeUntil: webhookTimestamp("active_until"),
    createdByUserId: text("created_by_user_id")
      .notNull()
      .references(() => user.id, { onDelete: "restrict" }),
    closedByUserId: text("closed_by_user_id").references(() => user.id, {
      onDelete: "restrict",
    }),
    createdAt: webhookTimestamp("created_at").defaultNow().notNull(),
  },
  (table) => [
    foreignKey({
      name: "webhook_subscription_endpoint_scope_fk",
      columns: [table.endpointId, table.environmentId, table.projectId, table.workspaceId],
      foreignColumns: [
        webhookEndpoint.id,
        webhookEndpoint.environmentId,
        webhookEndpoint.projectId,
        webhookEndpoint.workspaceId,
      ],
    }).onDelete("restrict"),
    unique("webhook_subscription_id_scope_unique").on(
      table.id,
      table.endpointId,
      table.environmentId,
      table.projectId,
      table.workspaceId,
    ),
    uniqueIndex("webhook_subscription_endpoint_type_active_unique")
      .on(table.endpointId, table.eventType)
      .where(sql`${table.activeUntil} is null`),
    check("webhook_subscription_type_valid", sql`${table.eventType} in ${publicEventTypesSql}`),
    check(
      "webhook_subscription_lifecycle_valid",
      sql`(${table.activeUntil} is null and ${table.closedByUserId} is null) or (${table.activeUntil} is not null and ${table.closedByUserId} is not null and ${table.activeUntil} >= ${table.activeFrom})`,
    ),
    index("webhook_subscription_dispatch_idx").on(
      table.environmentId,
      table.eventType,
      table.activeFrom,
      table.endpointId,
    ),
    index("webhook_subscription_endpoint_history_idx").on(
      table.endpointId,
      table.eventType,
      table.activeFrom.desc(),
      table.id.desc(),
    ),
    index("webhook_subscription_created_by_idx").on(table.createdByUserId),
    index("webhook_subscription_closed_by_idx")
      .on(table.closedByUserId)
      .where(sql`${table.closedByUserId} is not null`),
  ],
);

export const webhookEndpointSecret = pgTable(
  "webhook_endpoint_secret",
  {
    id: webhookId("id").primaryKey(),
    endpointId: uuid("endpoint_id").notNull(),
    workspaceId: uuid("workspace_id").notNull(),
    projectId: uuid("project_id").notNull(),
    environmentId: uuid("environment_id").notNull(),
    sequence: integer("sequence").notNull(),
    state: varchar("state", { length: 16 }).notNull(),
    encryptionKeyId: varchar("encryption_key_id", { length: 64 }).notNull(),
    nonce: varchar("nonce", { length: 32 }),
    ciphertext: text("ciphertext"),
    fingerprint: char("fingerprint", { length: 16 }).notNull(),
    activatedAt: webhookTimestamp("activated_at"),
    retireAt: webhookTimestamp("retire_at"),
    retiredAt: webhookTimestamp("retired_at"),
    createdByUserId: text("created_by_user_id")
      .notNull()
      .references(() => user.id, { onDelete: "restrict" }),
    changedByUserId: text("changed_by_user_id")
      .notNull()
      .references(() => user.id, { onDelete: "restrict" }),
    createdAt: webhookTimestamp("created_at").defaultNow().notNull(),
    updatedAt: webhookTimestamp("updated_at").defaultNow().notNull(),
  },
  (table) => [
    foreignKey({
      name: "webhook_secret_endpoint_scope_fk",
      columns: [table.endpointId, table.environmentId, table.projectId, table.workspaceId],
      foreignColumns: [
        webhookEndpoint.id,
        webhookEndpoint.environmentId,
        webhookEndpoint.projectId,
        webhookEndpoint.workspaceId,
      ],
    }).onDelete("restrict"),
    unique("webhook_secret_id_scope_unique").on(
      table.id,
      table.endpointId,
      table.environmentId,
      table.projectId,
      table.workspaceId,
    ),
    unique("webhook_secret_endpoint_sequence_unique").on(table.endpointId, table.sequence),
    uniqueIndex("webhook_secret_endpoint_pending_unique")
      .on(table.endpointId)
      .where(sql`${table.state} = 'pending'`),
    uniqueIndex("webhook_secret_endpoint_active_unique")
      .on(table.endpointId)
      .where(sql`${table.state} = 'active'`),
    uniqueIndex("webhook_secret_endpoint_retiring_unique")
      .on(table.endpointId)
      .where(sql`${table.state} = 'retiring'`),
    check("webhook_secret_sequence_positive", sql`${table.sequence} > 0`),
    check(
      "webhook_secret_state_valid",
      sql`${table.state} in ('pending', 'active', 'retiring', 'retired', 'canceled')`,
    ),
    check(
      "webhook_secret_key_id_valid",
      sql`${table.encryptionKeyId} ~ '^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$'`,
    ),
    check(
      "webhook_secret_material_valid",
      sql`(${table.state} in ('pending', 'active', 'retiring') and ${table.nonce} is not null and char_length(${table.nonce}) between 16 and 32 and ${table.nonce} ~ ${encryptedValuePatternSql} and ${table.ciphertext} is not null and char_length(${table.ciphertext}) between 22 and 256 and ${table.ciphertext} ~ ${encryptedValuePatternSql}) or (${table.state} in ('retired', 'canceled') and ${table.nonce} is null and ${table.ciphertext} is null)`,
    ),
    check("webhook_secret_fingerprint_valid", sql`${table.fingerprint} ~ '^[0-9a-f]{16}$'`),
    check(
      "webhook_secret_lifecycle_valid",
      sql`(${table.state} = 'pending' and ${table.activatedAt} is null and ${table.retireAt} is null and ${table.retiredAt} is null) or (${table.state} = 'active' and ${table.activatedAt} is not null and ${table.retireAt} is null and ${table.retiredAt} is null) or (${table.state} = 'retiring' and ${table.activatedAt} is not null and ${table.retireAt} is not null and ${table.retiredAt} is null and ${table.retireAt} > ${table.activatedAt}) or (${table.state} in ('retired', 'canceled') and ${table.retiredAt} is not null)`,
    ),
    check("webhook_secret_timestamps_valid", sql`${table.updatedAt} >= ${table.createdAt}`),
    index("webhook_secret_endpoint_sequence_idx").on(table.endpointId, table.sequence.desc()),
    index("webhook_secret_retiring_due_idx")
      .on(table.retireAt, table.id)
      .where(sql`${table.state} = 'retiring'`),
    index("webhook_secret_created_by_idx").on(table.createdByUserId),
    index("webhook_secret_changed_by_idx").on(table.changedByUserId),
  ],
);

export const cmsInvalidationRouteMapping = pgTable(
  "cms_invalidation_route_mapping",
  {
    id: webhookId("id").primaryKey(),
    workspaceId: uuid("workspace_id").notNull(),
    projectId: uuid("project_id").notNull(),
    environmentId: uuid("environment_id").notNull(),
    collectionId: uuid("collection_id").notNull(),
    entryId: uuid("entry_id"),
    localeId: uuid("locale_id"),
    name: varchar("name", { length: 100 }).notNull(),
    eventTypes: varchar("event_types", { length: 128 }).array().notNull(),
    routePath: varchar("route_path", { length: 512 }).notNull(),
    semanticTags: varchar("semantic_tags", { length: 64 })
      .array()
      .default(sql`'{}'`)
      .notNull(),
    state: varchar("state", { length: 16 }).default("enabled").notNull(),
    version: integer("version").default(1).notNull(),
    createdByUserId: text("created_by_user_id")
      .notNull()
      .references(() => user.id, { onDelete: "restrict" }),
    changedByUserId: text("changed_by_user_id")
      .notNull()
      .references(() => user.id, { onDelete: "restrict" }),
    disabledAt: webhookTimestamp("disabled_at"),
    createdAt: webhookTimestamp("created_at").defaultNow().notNull(),
    updatedAt: webhookTimestamp("updated_at").defaultNow().notNull(),
  },
  (table) => [
    foreignKey({
      name: "cms_invalidation_mapping_collection_scope_fk",
      columns: [table.collectionId, table.environmentId, table.projectId, table.workspaceId],
      foreignColumns: [
        cmsCollection.id,
        cmsCollection.environmentId,
        cmsCollection.projectId,
        cmsCollection.workspaceId,
      ],
    }).onDelete("restrict"),
    foreignKey({
      name: "cms_invalidation_mapping_entry_scope_fk",
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
      name: "cms_invalidation_mapping_locale_scope_fk",
      columns: [table.localeId, table.projectId, table.workspaceId],
      foreignColumns: [projectLocale.id, projectLocale.projectId, projectLocale.workspaceId],
    }).onDelete("restrict"),
    unique("cms_invalidation_mapping_id_scope_unique").on(
      table.id,
      table.environmentId,
      table.projectId,
      table.workspaceId,
    ),
    check(
      "cms_invalidation_mapping_name_valid",
      sql`char_length(${table.name}) between 1 and 100 and ${table.name} = btrim(${table.name}) and ${table.name} !~ '[[:cntrl:]]'`,
    ),
    check(
      "cms_invalidation_mapping_event_types_valid",
      sql`array_ndims(${table.eventTypes}) = 1 and cardinality(${table.eventTypes}) between 1 and 3 and ${table.eventTypes} <@ ${publicEventTypeArraySql} and (cardinality(${table.eventTypes}) = 1 or (cardinality(${table.eventTypes}) = 2 and ${table.eventTypes}[1] <> ${table.eventTypes}[2]) or (cardinality(${table.eventTypes}) = 3 and ${table.eventTypes}[1] <> ${table.eventTypes}[2] and ${table.eventTypes}[1] <> ${table.eventTypes}[3] and ${table.eventTypes}[2] <> ${table.eventTypes}[3]))`,
    ),
    check(
      "cms_invalidation_mapping_scope_valid",
      sql`not ('cms.schema.published' = any(${table.eventTypes}) and (${table.entryId} is not null or ${table.localeId} is not null))`,
    ),
    check(
      "cms_invalidation_mapping_route_valid",
      sql`octet_length(${table.routePath}) between 1 and 512 and left(${table.routePath}, 1) = '/' and ${table.routePath} !~ '[[:cntrl:]#?]' and position(chr(92) in ${table.routePath}) = 0 and ${table.routePath} !~ '(^|/)\\.\\.?(/|$)' and lower(${table.routePath}) !~ '%(2e|2f|5c|3f|23)' and ${table.routePath} !~ '^//'`,
    ),
    check(
      "cms_invalidation_mapping_semantic_tags_valid",
      sql`coalesce(array_ndims(${table.semanticTags}), 1) = 1 and cardinality(${table.semanticTags}) between 0 and 10 and array_position(${table.semanticTags}, null) is null and (cardinality(${table.semanticTags}) = 0 or array_to_string(${table.semanticTags}, ',') ~ '^[a-z][a-z0-9_-]{0,31}:[a-z0-9][a-z0-9._/-]{0,31}(,[a-z][a-z0-9_-]{0,31}:[a-z0-9][a-z0-9._/-]{0,31})*$') and array_to_string(${table.semanticTags}, ',') !~ '(^|,)(project|environment|collection|entry|locale|field):'`,
    ),
    check("cms_invalidation_mapping_state_valid", sql`${table.state} in ('enabled', 'disabled')`),
    check("cms_invalidation_mapping_version_positive", sql`${table.version} > 0`),
    check(
      "cms_invalidation_mapping_lifecycle_valid",
      sql`(${table.state} = 'enabled' and ${table.disabledAt} is null) or (${table.state} = 'disabled' and ${table.disabledAt} is not null)`,
    ),
    check(
      "cms_invalidation_mapping_timestamps_valid",
      sql`${table.updatedAt} >= ${table.createdAt}`,
    ),
    index("cms_invalidation_mapping_match_idx").on(
      table.environmentId,
      table.collectionId,
      table.state,
      table.id,
    ),
    index("cms_invalidation_mapping_entry_idx")
      .on(table.entryId, table.localeId)
      .where(sql`${table.entryId} is not null or ${table.localeId} is not null`),
    index("cms_invalidation_mapping_created_by_idx").on(table.createdByUserId),
    index("cms_invalidation_mapping_changed_by_idx").on(table.changedByUserId),
  ],
);

export const webhookDelivery = pgTable(
  "webhook_delivery",
  {
    id: webhookId("id").primaryKey(),
    eventId: uuid("event_id").notNull(),
    endpointId: uuid("endpoint_id").notNull(),
    destinationId: uuid("destination_id").notNull(),
    workspaceId: uuid("workspace_id").notNull(),
    projectId: uuid("project_id").notNull(),
    environmentId: uuid("environment_id").notNull(),
    kind: varchar("kind", { length: 16 }).notNull(),
    sourceDeliveryId: uuid("source_delivery_id"),
    replayCommandId: uuid("replay_command_id"),
    replayCommandFingerprint: char("replay_command_fingerprint", { length: 64 }),
    replayedByUserId: text("replayed_by_user_id").references(() => user.id, {
      onDelete: "restrict",
    }),
    status: varchar("status", { length: 24 }).default("queued").notNull(),
    attemptCount: integer("attempt_count").default(0).notNull(),
    nextAttemptAt: webhookTimestamp("next_attempt_at"),
    leaseToken: uuid("lease_token"),
    leaseExpiresAt: webhookTimestamp("lease_expires_at"),
    completedAt: webhookTimestamp("completed_at"),
    lastOutcome: varchar("last_outcome", { length: 64 }),
    createdAt: webhookTimestamp("created_at").defaultNow().notNull(),
    updatedAt: webhookTimestamp("updated_at").defaultNow().notNull(),
  },
  (table): PgTableExtraConfigValue[] => [
    foreignKey({
      name: "webhook_delivery_event_scope_fk",
      columns: [table.eventId, table.environmentId, table.projectId, table.workspaceId],
      foreignColumns: [
        publicationEvent.eventId,
        publicationEvent.environmentId,
        publicationEvent.projectId,
        publicationEvent.workspaceId,
      ],
    }).onDelete("restrict"),
    foreignKey({
      name: "webhook_delivery_endpoint_scope_fk",
      columns: [table.endpointId, table.environmentId, table.projectId, table.workspaceId],
      foreignColumns: [
        webhookEndpoint.id,
        webhookEndpoint.environmentId,
        webhookEndpoint.projectId,
        webhookEndpoint.workspaceId,
      ],
    }).onDelete("restrict"),
    foreignKey({
      name: "webhook_delivery_destination_scope_fk",
      columns: [
        table.destinationId,
        table.endpointId,
        table.environmentId,
        table.projectId,
        table.workspaceId,
      ],
      foreignColumns: [
        webhookEndpointDestination.id,
        webhookEndpointDestination.endpointId,
        webhookEndpointDestination.environmentId,
        webhookEndpointDestination.projectId,
        webhookEndpointDestination.workspaceId,
      ],
    }).onDelete("restrict"),
    foreignKey({
      name: "webhook_delivery_source_scope_fk",
      columns: [
        table.sourceDeliveryId,
        table.eventId,
        table.endpointId,
        table.environmentId,
        table.projectId,
        table.workspaceId,
      ],
      foreignColumns: [
        table.id,
        table.eventId,
        table.endpointId,
        table.environmentId,
        table.projectId,
        table.workspaceId,
      ],
    }).onDelete("restrict"),
    unique("webhook_delivery_id_scope_unique").on(
      table.id,
      table.eventId,
      table.endpointId,
      table.environmentId,
      table.projectId,
      table.workspaceId,
    ),
    uniqueIndex("webhook_delivery_initial_event_endpoint_unique")
      .on(table.eventId, table.endpointId)
      .where(sql`${table.kind} = 'initial'`),
    uniqueIndex("webhook_delivery_replay_command_unique")
      .on(table.endpointId, table.replayCommandId)
      .where(sql`${table.kind} = 'replay'`),
    check("webhook_delivery_kind_valid", sql`${table.kind} in ('initial', 'replay')`),
    check(
      "webhook_delivery_replay_authority_valid",
      sql`(${table.kind} = 'initial' and ${table.sourceDeliveryId} is null and ${table.replayCommandId} is null and ${table.replayCommandFingerprint} is null and ${table.replayedByUserId} is null) or (${table.kind} = 'replay' and ${table.replayCommandId} is not null and ${table.replayCommandFingerprint} ~ '^[0-9a-f]{64}$' and ${table.replayedByUserId} is not null)`,
    ),
    check(
      "webhook_delivery_status_valid",
      sql`${table.status} in ('queued', 'delivering', 'retry_scheduled', 'succeeded', 'dead_letter', 'canceled')`,
    ),
    check("webhook_delivery_attempt_count_valid", sql`${table.attemptCount} between 0 and 12`),
    check(
      "webhook_delivery_lease_valid",
      sql`(${table.status} = 'delivering' and ${table.leaseToken} is not null and ${table.leaseExpiresAt} is not null and ${table.completedAt} is null) or (${table.status} <> 'delivering' and ${table.leaseToken} is null and ${table.leaseExpiresAt} is null)`,
    ),
    check(
      "webhook_delivery_schedule_valid",
      sql`(${table.status} in ('queued', 'retry_scheduled') and ${table.nextAttemptAt} is not null and ${table.completedAt} is null) or (${table.status} = 'delivering' and ${table.nextAttemptAt} is null and ${table.completedAt} is null) or (${table.status} in ('succeeded', 'dead_letter', 'canceled') and ${table.nextAttemptAt} is null and ${table.completedAt} is not null)`,
    ),
    check(
      "webhook_delivery_outcome_valid",
      sql`(${table.attemptCount} = 0 and ${table.lastOutcome} is null) or (${table.attemptCount} > 0 and ${table.lastOutcome} is not null and ${table.lastOutcome} ~ '^[a-z][a-z0-9_]{0,63}$')`,
    ),
    check("webhook_delivery_timestamps_valid", sql`${table.updatedAt} >= ${table.createdAt}`),
    index("webhook_delivery_ready_idx")
      .on(table.nextAttemptAt, table.id)
      .where(sql`${table.status} in ('queued', 'retry_scheduled')`),
    index("webhook_delivery_expired_lease_idx")
      .on(table.leaseExpiresAt, table.id)
      .where(sql`${table.status} = 'delivering'`),
    index("webhook_delivery_endpoint_history_idx").on(
      table.endpointId,
      table.createdAt.desc(),
      table.id.desc(),
    ),
    index("webhook_delivery_event_history_idx").on(table.eventId, table.createdAt, table.id),
    index("webhook_delivery_status_history_idx").on(
      table.environmentId,
      table.status,
      table.createdAt.desc(),
      table.id.desc(),
    ),
    index("webhook_delivery_replayed_by_idx")
      .on(table.replayedByUserId)
      .where(sql`${table.replayedByUserId} is not null`),
  ],
);

export const webhookDeliveryAttempt = pgTable(
  "webhook_delivery_attempt",
  {
    id: webhookId("id").primaryKey(),
    deliveryId: uuid("delivery_id").notNull(),
    eventId: uuid("event_id").notNull(),
    endpointId: uuid("endpoint_id").notNull(),
    workspaceId: uuid("workspace_id").notNull(),
    projectId: uuid("project_id").notNull(),
    environmentId: uuid("environment_id").notNull(),
    attemptNumber: integer("attempt_number").notNull(),
    state: varchar("state", { length: 24 }).default("started").notNull(),
    signingSecretIds: uuid("signing_secret_ids").array().notNull(),
    requestTimestamp: bigint("request_timestamp", { mode: "number" }).notNull(),
    startedAt: webhookTimestamp("started_at").defaultNow().notNull(),
    completedAt: webhookTimestamp("completed_at"),
    durationMs: integer("duration_ms"),
    httpStatus: integer("http_status"),
    statusFamily: varchar("status_family", { length: 8 }),
    outcome: varchar("outcome", { length: 64 }),
    retryAfterSeconds: integer("retry_after_seconds"),
    nextAttemptAt: webhookTimestamp("next_attempt_at"),
  },
  (table) => [
    foreignKey({
      name: "webhook_attempt_delivery_scope_fk",
      columns: [
        table.deliveryId,
        table.eventId,
        table.endpointId,
        table.environmentId,
        table.projectId,
        table.workspaceId,
      ],
      foreignColumns: [
        webhookDelivery.id,
        webhookDelivery.eventId,
        webhookDelivery.endpointId,
        webhookDelivery.environmentId,
        webhookDelivery.projectId,
        webhookDelivery.workspaceId,
      ],
    }).onDelete("restrict"),
    foreignKey({
      name: "webhook_attempt_event_scope_fk",
      columns: [table.eventId, table.environmentId, table.projectId, table.workspaceId],
      foreignColumns: [
        publicationEvent.eventId,
        publicationEvent.environmentId,
        publicationEvent.projectId,
        publicationEvent.workspaceId,
      ],
    }).onDelete("restrict"),
    unique("webhook_attempt_id_scope_unique").on(
      table.id,
      table.deliveryId,
      table.endpointId,
      table.environmentId,
      table.projectId,
      table.workspaceId,
    ),
    unique("webhook_attempt_delivery_number_unique").on(table.deliveryId, table.attemptNumber),
    check("webhook_attempt_number_valid", sql`${table.attemptNumber} between 1 and 12`),
    check(
      "webhook_attempt_state_valid",
      sql`${table.state} in ('started', 'succeeded', 'retry_scheduled', 'dead_letter', 'abandoned', 'canceled')`,
    ),
    check(
      "webhook_attempt_signing_secrets_valid",
      sql`array_ndims(${table.signingSecretIds}) = 1 and cardinality(${table.signingSecretIds}) between 1 and 2 and array_position(${table.signingSecretIds}, null) is null and (cardinality(${table.signingSecretIds}) = 1 or ${table.signingSecretIds}[1] <> ${table.signingSecretIds}[2])`,
    ),
    check("webhook_attempt_request_timestamp_valid", sql`${table.requestTimestamp} > 0`),
    check(
      "webhook_attempt_terminal_valid",
      sql`(${table.state} = 'started' and ${table.completedAt} is null and ${table.durationMs} is null and ${table.outcome} is null) or (${table.state} <> 'started' and ${table.completedAt} is not null and ${table.durationMs} >= 0 and ${table.outcome} ~ '^[a-z][a-z0-9_]{0,63}$')`,
    ),
    check(
      "webhook_attempt_http_valid",
      sql`(${table.httpStatus} is null and ${table.statusFamily} is null) or (${table.httpStatus} between 100 and 599 and ${table.statusFamily} in ('1xx', '2xx', '3xx', '4xx', '5xx'))`,
    ),
    check(
      "webhook_attempt_retry_valid",
      sql`(${table.state} = 'retry_scheduled' and ${table.nextAttemptAt} is not null) or (${table.state} <> 'retry_scheduled' and ${table.nextAttemptAt} is null)`,
    ),
    check(
      "webhook_attempt_retry_after_valid",
      sql`${table.retryAfterSeconds} is null or ${table.retryAfterSeconds} between 0 and 86400`,
    ),
    index("webhook_attempt_delivery_number_idx").on(table.deliveryId, table.attemptNumber.desc()),
    index("webhook_attempt_endpoint_started_id_idx").on(
      table.endpointId,
      table.startedAt.desc(),
      table.id.desc(),
    ),
    index("webhook_attempt_event_idx").on(table.eventId, table.startedAt, table.id),
  ],
);

export const publicationEventRelations = relations(publicationEvent, ({ one, many }) => ({
  outbox: one(outboxEvent, {
    fields: [
      publicationEvent.eventId,
      publicationEvent.eventType,
      publicationEvent.environmentId,
      publicationEvent.projectId,
      publicationEvent.workspaceId,
    ],
    references: [
      outboxEvent.id,
      outboxEvent.eventType,
      outboxEvent.environmentId,
      outboxEvent.projectId,
      outboxEvent.workspaceId,
    ],
  }),
  workspace: one(workspace, {
    fields: [publicationEvent.workspaceId],
    references: [workspace.id],
  }),
  project: one(project, {
    fields: [publicationEvent.projectId, publicationEvent.workspaceId],
    references: [project.id, project.workspaceId],
  }),
  environment: one(environment, {
    fields: [
      publicationEvent.environmentId,
      publicationEvent.projectId,
      publicationEvent.workspaceId,
    ],
    references: [environment.id, environment.projectId, environment.workspaceId],
  }),
  deliveries: many(webhookDelivery),
  attempts: many(webhookDeliveryAttempt),
}));

export const webhookEndpointRelations = relations(webhookEndpoint, ({ one, many }) => ({
  environment: one(environment, {
    fields: [webhookEndpoint.environmentId, webhookEndpoint.projectId, webhookEndpoint.workspaceId],
    references: [environment.id, environment.projectId, environment.workspaceId],
  }),
  currentDestination: one(webhookEndpointDestination, {
    relationName: "webhookCurrentDestination",
    fields: [
      webhookEndpoint.currentDestinationId,
      webhookEndpoint.id,
      webhookEndpoint.environmentId,
      webhookEndpoint.projectId,
      webhookEndpoint.workspaceId,
    ],
    references: [
      webhookEndpointDestination.id,
      webhookEndpointDestination.endpointId,
      webhookEndpointDestination.environmentId,
      webhookEndpointDestination.projectId,
      webhookEndpointDestination.workspaceId,
    ],
  }),
  destinations: many(webhookEndpointDestination),
  subscriptions: many(webhookEndpointSubscription),
  secrets: many(webhookEndpointSecret),
  deliveries: many(webhookDelivery),
}));

export const webhookEndpointDestinationRelations = relations(
  webhookEndpointDestination,
  ({ one, many }) => ({
    endpoint: one(webhookEndpoint, {
      fields: [
        webhookEndpointDestination.endpointId,
        webhookEndpointDestination.environmentId,
        webhookEndpointDestination.projectId,
        webhookEndpointDestination.workspaceId,
      ],
      references: [
        webhookEndpoint.id,
        webhookEndpoint.environmentId,
        webhookEndpoint.projectId,
        webhookEndpoint.workspaceId,
      ],
    }),
    currentForEndpoints: many(webhookEndpoint, { relationName: "webhookCurrentDestination" }),
    deliveries: many(webhookDelivery),
  }),
);

export const webhookEndpointSubscriptionRelations = relations(
  webhookEndpointSubscription,
  ({ one }) => ({
    endpoint: one(webhookEndpoint, {
      fields: [
        webhookEndpointSubscription.endpointId,
        webhookEndpointSubscription.environmentId,
        webhookEndpointSubscription.projectId,
        webhookEndpointSubscription.workspaceId,
      ],
      references: [
        webhookEndpoint.id,
        webhookEndpoint.environmentId,
        webhookEndpoint.projectId,
        webhookEndpoint.workspaceId,
      ],
    }),
  }),
);

export const webhookEndpointSecretRelations = relations(webhookEndpointSecret, ({ one }) => ({
  endpoint: one(webhookEndpoint, {
    fields: [
      webhookEndpointSecret.endpointId,
      webhookEndpointSecret.environmentId,
      webhookEndpointSecret.projectId,
      webhookEndpointSecret.workspaceId,
    ],
    references: [
      webhookEndpoint.id,
      webhookEndpoint.environmentId,
      webhookEndpoint.projectId,
      webhookEndpoint.workspaceId,
    ],
  }),
}));

export const cmsInvalidationRouteMappingRelations = relations(
  cmsInvalidationRouteMapping,
  ({ one }) => ({
    collection: one(cmsCollection, {
      fields: [
        cmsInvalidationRouteMapping.collectionId,
        cmsInvalidationRouteMapping.environmentId,
        cmsInvalidationRouteMapping.projectId,
        cmsInvalidationRouteMapping.workspaceId,
      ],
      references: [
        cmsCollection.id,
        cmsCollection.environmentId,
        cmsCollection.projectId,
        cmsCollection.workspaceId,
      ],
    }),
    entry: one(cmsEntry, {
      fields: [
        cmsInvalidationRouteMapping.entryId,
        cmsInvalidationRouteMapping.collectionId,
        cmsInvalidationRouteMapping.environmentId,
        cmsInvalidationRouteMapping.projectId,
        cmsInvalidationRouteMapping.workspaceId,
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
        cmsInvalidationRouteMapping.localeId,
        cmsInvalidationRouteMapping.projectId,
        cmsInvalidationRouteMapping.workspaceId,
      ],
      references: [projectLocale.id, projectLocale.projectId, projectLocale.workspaceId],
    }),
  }),
);

export const webhookDeliveryRelations = relations(webhookDelivery, ({ one, many }) => ({
  event: one(publicationEvent, {
    fields: [
      webhookDelivery.eventId,
      webhookDelivery.environmentId,
      webhookDelivery.projectId,
      webhookDelivery.workspaceId,
    ],
    references: [
      publicationEvent.eventId,
      publicationEvent.environmentId,
      publicationEvent.projectId,
      publicationEvent.workspaceId,
    ],
  }),
  endpoint: one(webhookEndpoint, {
    fields: [
      webhookDelivery.endpointId,
      webhookDelivery.environmentId,
      webhookDelivery.projectId,
      webhookDelivery.workspaceId,
    ],
    references: [
      webhookEndpoint.id,
      webhookEndpoint.environmentId,
      webhookEndpoint.projectId,
      webhookEndpoint.workspaceId,
    ],
  }),
  destination: one(webhookEndpointDestination, {
    fields: [
      webhookDelivery.destinationId,
      webhookDelivery.endpointId,
      webhookDelivery.environmentId,
      webhookDelivery.projectId,
      webhookDelivery.workspaceId,
    ],
    references: [
      webhookEndpointDestination.id,
      webhookEndpointDestination.endpointId,
      webhookEndpointDestination.environmentId,
      webhookEndpointDestination.projectId,
      webhookEndpointDestination.workspaceId,
    ],
  }),
  sourceDelivery: one(webhookDelivery, {
    relationName: "webhookDeliveryReplayLineage",
    fields: [
      webhookDelivery.sourceDeliveryId,
      webhookDelivery.eventId,
      webhookDelivery.endpointId,
      webhookDelivery.environmentId,
      webhookDelivery.projectId,
      webhookDelivery.workspaceId,
    ],
    references: [
      webhookDelivery.id,
      webhookDelivery.eventId,
      webhookDelivery.endpointId,
      webhookDelivery.environmentId,
      webhookDelivery.projectId,
      webhookDelivery.workspaceId,
    ],
  }),
  replayDeliveries: many(webhookDelivery, { relationName: "webhookDeliveryReplayLineage" }),
  attempts: many(webhookDeliveryAttempt),
}));

export const webhookDeliveryAttemptRelations = relations(webhookDeliveryAttempt, ({ one }) => ({
  delivery: one(webhookDelivery, {
    fields: [
      webhookDeliveryAttempt.deliveryId,
      webhookDeliveryAttempt.eventId,
      webhookDeliveryAttempt.endpointId,
      webhookDeliveryAttempt.environmentId,
      webhookDeliveryAttempt.projectId,
      webhookDeliveryAttempt.workspaceId,
    ],
    references: [
      webhookDelivery.id,
      webhookDelivery.eventId,
      webhookDelivery.endpointId,
      webhookDelivery.environmentId,
      webhookDelivery.projectId,
      webhookDelivery.workspaceId,
    ],
  }),
  event: one(publicationEvent, {
    fields: [
      webhookDeliveryAttempt.eventId,
      webhookDeliveryAttempt.environmentId,
      webhookDeliveryAttempt.projectId,
      webhookDeliveryAttempt.workspaceId,
    ],
    references: [
      publicationEvent.eventId,
      publicationEvent.environmentId,
      publicationEvent.projectId,
      publicationEvent.workspaceId,
    ],
  }),
}));
