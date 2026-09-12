import { relations, sql } from "drizzle-orm";
import {
  char,
  check,
  foreignKey,
  index,
  integer,
  pgTable,
  text,
  timestamp,
  unique,
  uuid,
  varchar,
} from "drizzle-orm/pg-core";

import { apiCredential } from "../access";
import { user } from "../auth";
import { environment, project, workspace } from "../platform";

const controlPlaneId = (name: string) =>
  uuid(name)
    .default(sql`uuidv7()`)
    .notNull();
const controlPlaneTimestamp = (name: string) =>
  timestamp(name, { withTimezone: true, mode: "date" });

export const controlPlaneCommandReceipt = pgTable(
  "control_plane_command_receipt",
  {
    commandId: uuid("command_id").primaryKey(),
    operation: varchar("operation", { length: 64 }).notNull(),
    actorType: varchar("actor_type", { length: 16 }).notNull(),
    actorId: text("actor_id").notNull(),
    fingerprint: char("fingerprint", { length: 64 }).notNull(),
    workspaceId: uuid("workspace_id").notNull(),
    projectId: uuid("project_id"),
    environmentId: uuid("environment_id"),
    resultResourceType: varchar("result_resource_type", { length: 64 }).notNull(),
    resultResourceId: uuid("result_resource_id").notNull(),
    resultDisposition: varchar("result_disposition", { length: 16 }).notNull(),
    createdAt: controlPlaneTimestamp("created_at").defaultNow().notNull(),
  },
  (table) => [
    foreignKey({
      name: "control_plane_command_receipt_workspace_fk",
      columns: [table.workspaceId],
      foreignColumns: [workspace.id],
    }).onDelete("restrict"),
    foreignKey({
      name: "control_plane_command_receipt_project_workspace_fk",
      columns: [table.projectId, table.workspaceId],
      foreignColumns: [project.id, project.workspaceId],
    }).onDelete("restrict"),
    foreignKey({
      name: "control_plane_command_receipt_environment_tenant_fk",
      columns: [table.environmentId, table.projectId, table.workspaceId],
      foreignColumns: [environment.id, environment.projectId, environment.workspaceId],
    }).onDelete("restrict"),
    check(
      "control_plane_command_receipt_operation_valid",
      sql`${table.operation} in ('workspace.create', 'project.create', 'project.capability.enable', 'studio_registration.put')`,
    ),
    check(
      "control_plane_command_receipt_actor_valid",
      sql`(${table.actorType} = 'user' and char_length(${table.actorId}) between 1 and 255 and ${table.actorId} !~ '[[:cntrl:]]') or (${table.actorType} = 'credential' and ${table.actorId} ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$')`,
    ),
    check(
      "control_plane_command_receipt_fingerprint_valid",
      sql`${table.fingerprint} ~ '^[0-9a-f]{64}$'`,
    ),
    check(
      "control_plane_command_receipt_result_type_valid",
      sql`${table.resultResourceType} in ('workspace', 'project', 'project_capability', 'studio_registration')`,
    ),
    check(
      "control_plane_command_receipt_disposition_valid",
      sql`${table.resultDisposition} in ('created', 'updated', 'no_op')`,
    ),
    check(
      "control_plane_command_receipt_scope_result_valid",
      sql`(${table.operation} = 'workspace.create' and ${table.actorType} = 'user' and ${table.projectId} is null and ${table.environmentId} is null and ${table.resultResourceType} = 'workspace' and ${table.resultResourceId} = ${table.workspaceId} and ${table.resultDisposition} = 'created') or (${table.operation} = 'project.create' and ${table.actorType} = 'user' and ${table.projectId} is not null and ${table.environmentId} is null and ${table.resultResourceType} = 'project' and ${table.resultResourceId} = ${table.projectId} and ${table.resultDisposition} = 'created') or (${table.operation} = 'project.capability.enable' and ${table.projectId} is not null and ${table.environmentId} is not null and ${table.resultResourceType} = 'project_capability' and ${table.resultDisposition} = 'created') or (${table.operation} = 'studio_registration.put' and ${table.projectId} is not null and ${table.environmentId} is not null and ${table.resultResourceType} = 'studio_registration')`,
    ),
    index("control_plane_command_receipt_actor_operation_created_idx").on(
      table.actorType,
      table.actorId,
      table.operation,
      table.createdAt.desc(),
    ),
    index("control_plane_command_receipt_tenant_result_idx").on(
      table.workspaceId,
      table.projectId,
      table.environmentId,
      table.resultResourceType,
      table.resultResourceId,
    ),
    index("control_plane_command_receipt_created_at_idx").on(table.createdAt),
  ],
);

export const studioRegistration = pgTable(
  "studio_registration",
  {
    id: controlPlaneId("id").primaryKey(),
    workspaceId: uuid("workspace_id").notNull(),
    projectId: uuid("project_id").notNull(),
    environmentId: uuid("environment_id").notNull(),
    applicationOrigin: varchar("application_origin", { length: 2048 }).notNull(),
    mountPath: varchar("mount_path", { length: 240 }).notNull(),
    version: integer("version").default(1).notNull(),
    createdByUserId: text("created_by_user_id").references(() => user.id, {
      onDelete: "restrict",
    }),
    createdByCredentialId: uuid("created_by_credential_id"),
    changedByUserId: text("changed_by_user_id").references(() => user.id, {
      onDelete: "restrict",
    }),
    changedByCredentialId: uuid("changed_by_credential_id"),
    createdAt: controlPlaneTimestamp("created_at").defaultNow().notNull(),
    updatedAt: controlPlaneTimestamp("updated_at").defaultNow().notNull(),
  },
  (table) => [
    foreignKey({
      name: "studio_registration_environment_tenant_fk",
      columns: [table.environmentId, table.projectId, table.workspaceId],
      foreignColumns: [environment.id, environment.projectId, environment.workspaceId],
    }).onDelete("restrict"),
    foreignKey({
      name: "studio_registration_created_credential_tenant_fk",
      columns: [
        table.createdByCredentialId,
        table.workspaceId,
        table.projectId,
        table.environmentId,
      ],
      foreignColumns: [
        apiCredential.id,
        apiCredential.workspaceId,
        apiCredential.projectId,
        apiCredential.environmentId,
      ],
    }).onDelete("restrict"),
    foreignKey({
      name: "studio_registration_changed_credential_tenant_fk",
      columns: [
        table.changedByCredentialId,
        table.workspaceId,
        table.projectId,
        table.environmentId,
      ],
      foreignColumns: [
        apiCredential.id,
        apiCredential.workspaceId,
        apiCredential.projectId,
        apiCredential.environmentId,
      ],
    }).onDelete("restrict"),
    unique("studio_registration_environment_unique").on(table.environmentId),
    unique("studio_registration_id_tenant_unique").on(
      table.id,
      table.workspaceId,
      table.projectId,
      table.environmentId,
    ),
    check(
      "studio_registration_created_actor_exactly_one",
      sql`num_nonnulls(${table.createdByUserId}, ${table.createdByCredentialId}) = 1`,
    ),
    check(
      "studio_registration_changed_actor_exactly_one",
      sql`num_nonnulls(${table.changedByUserId}, ${table.changedByCredentialId}) = 1`,
    ),
    check(
      "studio_registration_application_origin_valid",
      sql`octet_length(${table.applicationOrigin}) between 1 and 2048 and ${table.applicationOrigin} = btrim(${table.applicationOrigin}) and ${table.applicationOrigin} !~ '[[:cntrl:]]' and position(chr(92) in ${table.applicationOrigin}) = 0 and (${table.applicationOrigin} ~ '^https://[^/?#@[:space:]]+$' or ${table.applicationOrigin} ~ '^http://(localhost|127[.]0[.]0[.]1)(:[0-9]{1,5})?$' or ${table.applicationOrigin} = 'http://[::1]' or (left(${table.applicationOrigin}, 13) = 'http://[::1]:' and substring(${table.applicationOrigin} from 14) ~ '^[0-9]{1,5}$'))`,
    ),
    check(
      "studio_registration_mount_path_valid",
      sql`octet_length(${table.mountPath}) between 1 and 240 and ${table.mountPath} = btrim(${table.mountPath}) and left(${table.mountPath}, 1) = '/' and ${table.mountPath} <> '/' and right(${table.mountPath}, 1) <> '/' and ${table.mountPath} !~ '[[:cntrl:][:space:]?#%]' and position(chr(92) in ${table.mountPath}) = 0 and position('//' in ${table.mountPath}) = 0 and ${table.mountPath} !~ '(^|/)[.]{1,2}(/|$)'`,
    ),
    check("studio_registration_version_positive", sql`${table.version} > 0`),
    index("studio_registration_created_by_user_idx")
      .on(table.createdByUserId)
      .where(sql`${table.createdByUserId} is not null`),
    index("studio_registration_changed_by_user_idx")
      .on(table.changedByUserId)
      .where(sql`${table.changedByUserId} is not null`),
    index("studio_registration_created_by_credential_idx")
      .on(table.createdByCredentialId)
      .where(sql`${table.createdByCredentialId} is not null`),
    index("studio_registration_changed_by_credential_idx")
      .on(table.changedByCredentialId)
      .where(sql`${table.changedByCredentialId} is not null`),
  ],
);

export const controlPlaneCommandReceiptRelations = relations(
  controlPlaneCommandReceipt,
  ({ one }) => ({
    workspace: one(workspace, {
      fields: [controlPlaneCommandReceipt.workspaceId],
      references: [workspace.id],
    }),
    project: one(project, {
      fields: [controlPlaneCommandReceipt.projectId, controlPlaneCommandReceipt.workspaceId],
      references: [project.id, project.workspaceId],
    }),
    environment: one(environment, {
      fields: [
        controlPlaneCommandReceipt.environmentId,
        controlPlaneCommandReceipt.projectId,
        controlPlaneCommandReceipt.workspaceId,
      ],
      references: [environment.id, environment.projectId, environment.workspaceId],
    }),
  }),
);

export const studioRegistrationRelations = relations(studioRegistration, ({ one }) => ({
  project: one(project, {
    fields: [studioRegistration.projectId, studioRegistration.workspaceId],
    references: [project.id, project.workspaceId],
  }),
  environment: one(environment, {
    fields: [
      studioRegistration.environmentId,
      studioRegistration.projectId,
      studioRegistration.workspaceId,
    ],
    references: [environment.id, environment.projectId, environment.workspaceId],
  }),
  createdByUser: one(user, {
    relationName: "studioRegistrationUserCreator",
    fields: [studioRegistration.createdByUserId],
    references: [user.id],
  }),
  createdByCredential: one(apiCredential, {
    relationName: "studioRegistrationCredentialCreator",
    fields: [
      studioRegistration.createdByCredentialId,
      studioRegistration.workspaceId,
      studioRegistration.projectId,
      studioRegistration.environmentId,
    ],
    references: [
      apiCredential.id,
      apiCredential.workspaceId,
      apiCredential.projectId,
      apiCredential.environmentId,
    ],
  }),
  changedByUser: one(user, {
    relationName: "studioRegistrationUserChanger",
    fields: [studioRegistration.changedByUserId],
    references: [user.id],
  }),
  changedByCredential: one(apiCredential, {
    relationName: "studioRegistrationCredentialChanger",
    fields: [
      studioRegistration.changedByCredentialId,
      studioRegistration.workspaceId,
      studioRegistration.projectId,
      studioRegistration.environmentId,
    ],
    references: [
      apiCredential.id,
      apiCredential.workspaceId,
      apiCredential.projectId,
      apiCredential.environmentId,
    ],
  }),
}));
