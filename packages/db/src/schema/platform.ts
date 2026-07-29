import { relations, sql } from "drizzle-orm";
import {
  boolean,
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
} from "drizzle-orm/pg-core";

import { user } from "./auth";

const platformId = (name: string) =>
  uuid(name)
    .default(sql`uuidv7()`)
    .notNull();
const platformTimestamp = (name: string) => timestamp(name, { withTimezone: true, mode: "date" });

export const workspace = pgTable(
  "workspace",
  {
    id: platformId("id").primaryKey(),
    name: varchar("name", { length: 100 }).notNull(),
    version: integer("version").default(1).notNull(),
    createdByUserId: text("created_by_user_id")
      .notNull()
      .references(() => user.id, { onDelete: "restrict" }),
    createdAt: platformTimestamp("created_at").defaultNow().notNull(),
    updatedAt: platformTimestamp("updated_at").defaultNow().notNull(),
  },
  (table) => [
    check(
      "workspace_name_valid",
      sql`char_length(${table.name}) between 1 and 100 and ${table.name} = btrim(${table.name}) and ${table.name} !~ '[[:cntrl:]]'`,
    ),
    check("workspace_version_positive", sql`${table.version} > 0`),
    index("workspace_created_by_user_idx").on(table.createdByUserId),
  ],
);

export const workspaceMembership = pgTable(
  "workspace_membership",
  {
    id: platformId("id").primaryKey(),
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspace.id, { onDelete: "restrict" }),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "restrict" }),
    role: varchar("role", { length: 32 }).default("owner").notNull(),
    createdAt: platformTimestamp("created_at").defaultNow().notNull(),
  },
  (table) => [
    unique("workspace_membership_workspace_user_unique").on(table.workspaceId, table.userId),
    check("workspace_membership_role_valid", sql`${table.role} = 'owner'`),
    index("workspace_membership_user_created_id_idx").on(
      table.userId,
      table.createdAt.desc(),
      table.id.desc(),
    ),
  ],
);

export const project = pgTable(
  "project",
  {
    id: platformId("id").primaryKey(),
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspace.id, { onDelete: "restrict" }),
    name: varchar("name", { length: 100 }).notNull(),
    key: varchar("key", { length: 63 }).notNull(),
    description: varchar("description", { length: 500 }),
    version: integer("version").default(1).notNull(),
    createdByUserId: text("created_by_user_id")
      .notNull()
      .references(() => user.id, { onDelete: "restrict" }),
    archivedAt: platformTimestamp("archived_at"),
    archivedByUserId: text("archived_by_user_id").references(() => user.id, {
      onDelete: "restrict",
    }),
    createdAt: platformTimestamp("created_at").defaultNow().notNull(),
    updatedAt: platformTimestamp("updated_at").defaultNow().notNull(),
  },
  (table) => [
    unique("project_workspace_key_unique").on(table.workspaceId, table.key),
    unique("project_id_workspace_unique").on(table.id, table.workspaceId),
    check(
      "project_name_valid",
      sql`char_length(${table.name}) between 1 and 100 and ${table.name} = btrim(${table.name}) and ${table.name} !~ '[[:cntrl:]]'`,
    ),
    check(
      "project_key_valid",
      sql`${table.key} ~ '^[a-z][a-z0-9-]{0,62}$' and ${table.key} !~ '--' and right(${table.key}, 1) <> '-'`,
    ),
    check(
      "project_description_trimmed",
      sql`${table.description} is null or ${table.description} = btrim(${table.description})`,
    ),
    check("project_version_positive", sql`${table.version} > 0`),
    check(
      "project_archive_fields_consistent",
      sql`(${table.archivedAt} is null and ${table.archivedByUserId} is null) or (${table.archivedAt} is not null and ${table.archivedByUserId} is not null)`,
    ),
    index("project_workspace_active_created_id_idx")
      .on(table.workspaceId, table.createdAt.desc(), table.id.desc())
      .where(sql`${table.archivedAt} is null`),
    index("project_workspace_archived_at_id_idx")
      .on(table.workspaceId, table.archivedAt.desc(), table.id.desc())
      .where(sql`${table.archivedAt} is not null`),
    index("project_created_by_user_idx").on(table.createdByUserId),
    index("project_archived_by_user_idx")
      .on(table.archivedByUserId)
      .where(sql`${table.archivedByUserId} is not null`),
  ],
);

export const environment = pgTable(
  "environment",
  {
    id: platformId("id").primaryKey(),
    workspaceId: uuid("workspace_id").notNull(),
    projectId: uuid("project_id").notNull(),
    key: varchar("key", { length: 63 }).notNull(),
    name: varchar("name", { length: 100 }).notNull(),
    isPrimary: boolean("is_primary").default(false).notNull(),
    createdByUserId: text("created_by_user_id")
      .notNull()
      .references(() => user.id, { onDelete: "restrict" }),
    createdAt: platformTimestamp("created_at").defaultNow().notNull(),
  },
  (table) => [
    foreignKey({
      name: "environment_project_workspace_fk",
      columns: [table.projectId, table.workspaceId],
      foreignColumns: [project.id, project.workspaceId],
    }).onDelete("restrict"),
    unique("environment_project_key_unique").on(table.projectId, table.key),
    unique("environment_id_project_workspace_unique").on(
      table.id,
      table.projectId,
      table.workspaceId,
    ),
    uniqueIndex("environment_project_primary_unique")
      .on(table.projectId)
      .where(sql`${table.isPrimary}`),
    check(
      "environment_key_valid",
      sql`${table.key} ~ '^[a-z][a-z0-9-]{0,62}$' and ${table.key} !~ '--' and right(${table.key}, 1) <> '-'`,
    ),
    check(
      "environment_name_valid",
      sql`char_length(${table.name}) between 1 and 100 and ${table.name} = btrim(${table.name}) and ${table.name} !~ '[[:cntrl:]]'`,
    ),
    check("environment_primary_is_main", sql`not ${table.isPrimary} or ${table.key} = 'main'`),
    index("environment_created_by_user_idx").on(table.createdByUserId),
  ],
);

export const projectCapability = pgTable(
  "project_capability",
  {
    id: platformId("id").primaryKey(),
    workspaceId: uuid("workspace_id").notNull(),
    projectId: uuid("project_id").notNull(),
    key: varchar("key", { length: 63 }).notNull(),
    status: varchar("status", { length: 16 }).notNull(),
    version: integer("version").default(1).notNull(),
    changedByUserId: text("changed_by_user_id")
      .notNull()
      .references(() => user.id, { onDelete: "restrict" }),
    createdAt: platformTimestamp("created_at").defaultNow().notNull(),
    updatedAt: platformTimestamp("updated_at").defaultNow().notNull(),
  },
  (table) => [
    foreignKey({
      name: "project_capability_project_workspace_fk",
      columns: [table.projectId, table.workspaceId],
      foreignColumns: [project.id, project.workspaceId],
    }).onDelete("restrict"),
    unique("project_capability_project_key_unique").on(table.projectId, table.key),
    check("project_capability_key_valid", sql`${table.key} ~ '^[a-z][a-z0-9_]{0,62}$'`),
    check("project_capability_status_valid", sql`${table.status} in ('enabled', 'disabled')`),
    check("project_capability_version_positive", sql`${table.version} > 0`),
    index("project_capability_changed_by_user_idx").on(table.changedByUserId),
  ],
);

export const auditEvent = pgTable(
  "audit_event",
  {
    id: platformId("id").primaryKey(),
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspace.id, { onDelete: "restrict" }),
    projectId: uuid("project_id"),
    environmentId: uuid("environment_id"),
    actorType: varchar("actor_type", { length: 32 }).notNull(),
    actorId: text("actor_id").notNull(),
    action: varchar("action", { length: 128 }).notNull(),
    resourceType: varchar("resource_type", { length: 64 }).notNull(),
    resourceId: uuid("resource_id").notNull(),
    requestId: varchar("request_id", { length: 128 }).notNull(),
    occurredAt: platformTimestamp("occurred_at").defaultNow().notNull(),
  },
  (table) => [
    foreignKey({
      name: "audit_event_project_workspace_fk",
      columns: [table.projectId, table.workspaceId],
      foreignColumns: [project.id, project.workspaceId],
    }).onDelete("restrict"),
    foreignKey({
      name: "audit_event_environment_project_workspace_fk",
      columns: [table.environmentId, table.projectId, table.workspaceId],
      foreignColumns: [environment.id, environment.projectId, environment.workspaceId],
    }).onDelete("restrict"),
    check("audit_event_actor_type_valid", sql`${table.actorType} = 'user'`),
    check("audit_event_actor_id_nonempty", sql`char_length(${table.actorId}) between 1 and 255`),
    check("audit_event_action_valid", sql`${table.action} ~ '^[a-z][a-z0-9_.-]{0,127}$'`),
    check(
      "audit_event_resource_type_valid",
      sql`${table.resourceType} ~ '^[a-z][a-z0-9_.-]{0,63}$'`,
    ),
    check(
      "audit_event_request_id_valid",
      sql`char_length(${table.requestId}) between 1 and 128 and ${table.requestId} ~ '^[A-Za-z0-9._:-]+$'`,
    ),
    check(
      "audit_event_environment_scope_complete",
      sql`${table.environmentId} is null or ${table.projectId} is not null`,
    ),
    index("audit_event_workspace_occurred_id_idx").on(
      table.workspaceId,
      table.occurredAt.desc(),
      table.id.desc(),
    ),
    index("audit_event_project_occurred_id_idx")
      .on(table.projectId, table.occurredAt.desc(), table.id.desc())
      .where(sql`${table.projectId} is not null`),
    index("audit_event_environment_idx")
      .on(table.environmentId)
      .where(sql`${table.environmentId} is not null`),
  ],
);

export const workspaceRelations = relations(workspace, ({ one, many }) => ({
  creator: one(user, {
    relationName: "workspaceCreator",
    fields: [workspace.createdByUserId],
    references: [user.id],
  }),
  memberships: many(workspaceMembership),
  projects: many(project),
  auditEvents: many(auditEvent),
}));

export const workspaceMembershipRelations = relations(workspaceMembership, ({ one }) => ({
  workspace: one(workspace, {
    fields: [workspaceMembership.workspaceId],
    references: [workspace.id],
  }),
  user: one(user, {
    relationName: "workspaceMember",
    fields: [workspaceMembership.userId],
    references: [user.id],
  }),
}));

export const projectRelations = relations(project, ({ one, many }) => ({
  workspace: one(workspace, {
    fields: [project.workspaceId],
    references: [workspace.id],
  }),
  creator: one(user, {
    relationName: "projectCreator",
    fields: [project.createdByUserId],
    references: [user.id],
  }),
  archivedBy: one(user, {
    relationName: "projectArchiver",
    fields: [project.archivedByUserId],
    references: [user.id],
  }),
  environments: many(environment),
  capabilities: many(projectCapability),
  auditEvents: many(auditEvent),
}));

export const environmentRelations = relations(environment, ({ one, many }) => ({
  project: one(project, {
    fields: [environment.projectId, environment.workspaceId],
    references: [project.id, project.workspaceId],
  }),
  creator: one(user, {
    relationName: "environmentCreator",
    fields: [environment.createdByUserId],
    references: [user.id],
  }),
  auditEvents: many(auditEvent),
}));

export const projectCapabilityRelations = relations(projectCapability, ({ one }) => ({
  project: one(project, {
    fields: [projectCapability.projectId, projectCapability.workspaceId],
    references: [project.id, project.workspaceId],
  }),
  changedBy: one(user, {
    relationName: "projectCapabilityChanger",
    fields: [projectCapability.changedByUserId],
    references: [user.id],
  }),
}));

export const auditEventRelations = relations(auditEvent, ({ one }) => ({
  workspace: one(workspace, {
    fields: [auditEvent.workspaceId],
    references: [workspace.id],
  }),
  project: one(project, {
    fields: [auditEvent.projectId, auditEvent.workspaceId],
    references: [project.id, project.workspaceId],
  }),
  environment: one(environment, {
    fields: [auditEvent.environmentId, auditEvent.projectId, auditEvent.workspaceId],
    references: [environment.id, environment.projectId, environment.workspaceId],
  }),
}));
