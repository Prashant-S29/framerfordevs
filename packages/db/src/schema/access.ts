import { relations, sql } from "drizzle-orm";
import {
  char,
  check,
  foreignKey,
  index,
  integer,
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

const accessId = (name: string) =>
  uuid(name)
    .default(sql`uuidv7()`)
    .notNull();
const accessTimestamp = (name: string) => timestamp(name, { withTimezone: true, mode: "date" });

const projectRoleSql = sql.raw(
  "('owner', 'developer', 'content_admin', 'editor', 'reviewer', 'client_editor', 'read_only')",
);
const credentialScopeSql = sql.raw(
  "('project.read', 'project.update', 'project.capability.manage', 'locale.read', 'locale.manage', 'schema.read', 'schema.write', 'schema.publish', 'content.read', 'content.write', 'content.review', 'content.publish', 'webhook.read', 'webhook.manage', 'delivery.read', 'preview.read')",
);

export const projectMembership = pgTable(
  "project_membership",
  {
    id: accessId("id").primaryKey(),
    workspaceId: uuid("workspace_id").notNull(),
    projectId: uuid("project_id").notNull(),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "restrict" }),
    role: varchar("role", { length: 32 }).notNull(),
    localeAccessMode: varchar("locale_access_mode", { length: 16 }).default("all").notNull(),
    version: integer("version").default(1).notNull(),
    createdByUserId: text("created_by_user_id")
      .notNull()
      .references(() => user.id, { onDelete: "restrict" }),
    removedAt: accessTimestamp("removed_at"),
    removedByUserId: text("removed_by_user_id").references(() => user.id, {
      onDelete: "restrict",
    }),
    createdAt: accessTimestamp("created_at").defaultNow().notNull(),
    updatedAt: accessTimestamp("updated_at").defaultNow().notNull(),
  },
  (table) => [
    foreignKey({
      name: "project_membership_project_workspace_fk",
      columns: [table.projectId, table.workspaceId],
      foreignColumns: [project.id, project.workspaceId],
    }).onDelete("restrict"),
    unique("project_membership_project_user_unique").on(table.projectId, table.userId),
    unique("project_membership_id_project_workspace_unique").on(
      table.id,
      table.projectId,
      table.workspaceId,
    ),
    check("project_membership_role_valid", sql`${table.role} in ${projectRoleSql}`),
    check(
      "project_membership_locale_access_mode_valid",
      sql`${table.localeAccessMode} in ('all', 'selected', 'none')`,
    ),
    check(
      "project_membership_owner_locale_access_all",
      sql`${table.role} <> 'owner' or ${table.localeAccessMode} = 'all'`,
    ),
    check("project_membership_version_positive", sql`${table.version} > 0`),
    check(
      "project_membership_removal_consistent",
      sql`(${table.removedAt} is null and ${table.removedByUserId} is null) or (${table.removedAt} is not null and ${table.removedByUserId} is not null)`,
    ),
    index("project_membership_user_active_created_id_idx")
      .on(table.userId, table.createdAt.desc(), table.id.desc())
      .where(sql`${table.removedAt} is null`),
    index("project_membership_workspace_active_created_id_idx")
      .on(table.workspaceId, table.createdAt.desc(), table.id.desc())
      .where(sql`${table.removedAt} is null`),
    index("project_membership_project_active_created_id_idx")
      .on(table.projectId, table.createdAt.desc(), table.id.desc())
      .where(sql`${table.removedAt} is null`),
    index("project_membership_project_active_owner_idx")
      .on(table.projectId)
      .where(sql`${table.removedAt} is null and ${table.role} = 'owner'`),
    index("project_membership_created_by_user_idx").on(table.createdByUserId),
    index("project_membership_removed_by_user_idx")
      .on(table.removedByUserId)
      .where(sql`${table.removedByUserId} is not null`),
  ],
);

export const projectInvitation = pgTable(
  "project_invitation",
  {
    id: accessId("id").primaryKey(),
    workspaceId: uuid("workspace_id").notNull(),
    projectId: uuid("project_id").notNull(),
    email: varchar("email", { length: 320 }).notNull(),
    role: varchar("role", { length: 32 }).notNull(),
    tokenDigest: char("token_digest", { length: 64 }).notNull(),
    status: varchar("status", { length: 16 }).default("pending").notNull(),
    version: integer("version").default(1).notNull(),
    invitedByUserId: text("invited_by_user_id")
      .notNull()
      .references(() => user.id, { onDelete: "restrict" }),
    acceptedByUserId: text("accepted_by_user_id").references(() => user.id, {
      onDelete: "restrict",
    }),
    revokedByUserId: text("revoked_by_user_id").references(() => user.id, {
      onDelete: "restrict",
    }),
    expiresAt: accessTimestamp("expires_at").notNull(),
    acceptedAt: accessTimestamp("accepted_at"),
    revokedAt: accessTimestamp("revoked_at"),
    createdAt: accessTimestamp("created_at").defaultNow().notNull(),
    updatedAt: accessTimestamp("updated_at").defaultNow().notNull(),
  },
  (table) => [
    foreignKey({
      name: "project_invitation_project_workspace_fk",
      columns: [table.projectId, table.workspaceId],
      foreignColumns: [project.id, project.workspaceId],
    }).onDelete("restrict"),
    unique("project_invitation_token_digest_unique").on(table.tokenDigest),
    uniqueIndex("project_invitation_project_pending_email_unique")
      .on(table.projectId, table.email)
      .where(sql`${table.status} = 'pending'`),
    check(
      "project_invitation_email_canonical",
      sql`char_length(${table.email}) between 3 and 320 and ${table.email} = lower(btrim(${table.email})) and ${table.email} !~ '[[:cntrl:]]'`,
    ),
    check("project_invitation_role_valid", sql`${table.role} in ${projectRoleSql}`),
    check("project_invitation_token_digest_valid", sql`${table.tokenDigest} ~ '^[0-9a-f]{64}$'`),
    check(
      "project_invitation_status_valid",
      sql`${table.status} in ('pending', 'accepted', 'revoked', 'expired')`,
    ),
    check("project_invitation_version_positive", sql`${table.version} > 0`),
    check("project_invitation_expiry_valid", sql`${table.expiresAt} > ${table.createdAt}`),
    check(
      "project_invitation_lifecycle_consistent",
      sql`(${table.status} in ('pending', 'expired') and ${table.acceptedAt} is null and ${table.acceptedByUserId} is null and ${table.revokedAt} is null and ${table.revokedByUserId} is null) or (${table.status} = 'accepted' and ${table.acceptedAt} is not null and ${table.acceptedByUserId} is not null and ${table.revokedAt} is null and ${table.revokedByUserId} is null) or (${table.status} = 'revoked' and ${table.acceptedAt} is null and ${table.acceptedByUserId} is null and ${table.revokedAt} is not null and ${table.revokedByUserId} is not null)`,
    ),
    index("project_invitation_project_status_created_id_idx").on(
      table.projectId,
      table.status,
      table.createdAt.desc(),
      table.id.desc(),
    ),
    index("project_invitation_invited_by_user_idx").on(table.invitedByUserId),
    index("project_invitation_accepted_by_user_idx")
      .on(table.acceptedByUserId)
      .where(sql`${table.acceptedByUserId} is not null`),
    index("project_invitation_revoked_by_user_idx")
      .on(table.revokedByUserId)
      .where(sql`${table.revokedByUserId} is not null`),
  ],
);

export const apiCredential = pgTable(
  "api_credential",
  {
    id: accessId("id").primaryKey(),
    workspaceId: uuid("workspace_id").notNull(),
    projectId: uuid("project_id").notNull(),
    environmentId: uuid("environment_id").notNull(),
    family: varchar("family", { length: 16 }).notNull(),
    name: varchar("name", { length: 100 }).notNull(),
    keyPrefix: varchar("key_prefix", { length: 64 }).notNull(),
    keyDigest: char("key_digest", { length: 64 }).notNull(),
    version: integer("version").default(1).notNull(),
    rotatedFromCredentialId: uuid("rotated_from_credential_id"),
    createdByUserId: text("created_by_user_id")
      .notNull()
      .references(() => user.id, { onDelete: "restrict" }),
    expiresAt: accessTimestamp("expires_at"),
    revokedAt: accessTimestamp("revoked_at"),
    revokedByUserId: text("revoked_by_user_id").references(() => user.id, {
      onDelete: "restrict",
    }),
    createdAt: accessTimestamp("created_at").defaultNow().notNull(),
    updatedAt: accessTimestamp("updated_at").defaultNow().notNull(),
  },
  (table) => [
    foreignKey({
      name: "api_credential_environment_project_workspace_fk",
      columns: [table.environmentId, table.projectId, table.workspaceId],
      foreignColumns: [environment.id, environment.projectId, environment.workspaceId],
    }).onDelete("restrict"),
    unique("api_credential_id_tenant_unique").on(
      table.id,
      table.workspaceId,
      table.projectId,
      table.environmentId,
    ),
    foreignKey({
      name: "api_credential_rotation_predecessor_fk",
      columns: [
        table.rotatedFromCredentialId,
        table.workspaceId,
        table.projectId,
        table.environmentId,
      ],
      foreignColumns: [table.id, table.workspaceId, table.projectId, table.environmentId],
    }).onDelete("restrict"),
    unique("api_credential_key_digest_unique").on(table.keyDigest),
    uniqueIndex("api_credential_rotated_from_unique")
      .on(table.rotatedFromCredentialId)
      .where(sql`${table.rotatedFromCredentialId} is not null`),
    check(
      "api_credential_family_valid",
      sql`${table.family} in ('management', 'delivery', 'preview')`,
    ),
    check(
      "api_credential_name_valid",
      sql`char_length(${table.name}) between 1 and 100 and ${table.name} = btrim(${table.name}) and ${table.name} !~ '[[:cntrl:]]'`,
    ),
    check(
      "api_credential_key_prefix_valid",
      sql`(${table.family} = 'management' and ${table.keyPrefix} = 'ffd_mgmt_' || ${table.id}::text) or (${table.family} = 'delivery' and ${table.keyPrefix} = 'ffd_del_' || ${table.id}::text) or (${table.family} = 'preview' and ${table.keyPrefix} = 'ffd_prev_' || ${table.id}::text)`,
    ),
    check("api_credential_key_digest_valid", sql`${table.keyDigest} ~ '^[0-9a-f]{64}$'`),
    check("api_credential_version_positive", sql`${table.version} > 0`),
    check(
      "api_credential_expiry_valid",
      sql`${table.expiresAt} is null or ${table.expiresAt} > ${table.createdAt}`,
    ),
    check(
      "api_credential_revocation_consistent",
      sql`(${table.revokedAt} is null and ${table.revokedByUserId} is null) or (${table.revokedAt} is not null and ${table.revokedByUserId} is not null)`,
    ),
    index("api_credential_project_environment_active_family_created_id_idx")
      .on(
        table.projectId,
        table.environmentId,
        table.family,
        table.createdAt.desc(),
        table.id.desc(),
      )
      .where(sql`${table.revokedAt} is null`),
    index("api_credential_environment_idx").on(table.environmentId),
    index("api_credential_created_by_user_idx").on(table.createdByUserId),
    index("api_credential_revoked_by_user_idx")
      .on(table.revokedByUserId)
      .where(sql`${table.revokedByUserId} is not null`),
  ],
);

export const apiCredentialScope = pgTable(
  "api_credential_scope",
  {
    credentialId: uuid("credential_id").notNull(),
    workspaceId: uuid("workspace_id").notNull(),
    projectId: uuid("project_id").notNull(),
    environmentId: uuid("environment_id").notNull(),
    scope: varchar("scope", { length: 64 }).notNull(),
    createdAt: accessTimestamp("created_at").defaultNow().notNull(),
  },
  (table) => [
    primaryKey({
      name: "api_credential_scope_credential_scope_pk",
      columns: [table.credentialId, table.scope],
    }),
    foreignKey({
      name: "api_credential_scope_credential_tenant_fk",
      columns: [table.credentialId, table.workspaceId, table.projectId, table.environmentId],
      foreignColumns: [
        apiCredential.id,
        apiCredential.workspaceId,
        apiCredential.projectId,
        apiCredential.environmentId,
      ],
    }).onDelete("restrict"),
    check("api_credential_scope_valid", sql`${table.scope} in ${credentialScopeSql}`),
  ],
);

export const projectMembershipRelations = relations(projectMembership, ({ one }) => ({
  workspace: one(workspace, {
    fields: [projectMembership.workspaceId],
    references: [workspace.id],
  }),
  project: one(project, {
    fields: [projectMembership.projectId, projectMembership.workspaceId],
    references: [project.id, project.workspaceId],
  }),
  user: one(user, {
    relationName: "projectMember",
    fields: [projectMembership.userId],
    references: [user.id],
  }),
  createdBy: one(user, {
    relationName: "projectMembershipCreator",
    fields: [projectMembership.createdByUserId],
    references: [user.id],
  }),
  removedBy: one(user, {
    relationName: "projectMembershipRemover",
    fields: [projectMembership.removedByUserId],
    references: [user.id],
  }),
}));

export const projectInvitationRelations = relations(projectInvitation, ({ one }) => ({
  workspace: one(workspace, {
    fields: [projectInvitation.workspaceId],
    references: [workspace.id],
  }),
  project: one(project, {
    fields: [projectInvitation.projectId, projectInvitation.workspaceId],
    references: [project.id, project.workspaceId],
  }),
  invitedBy: one(user, {
    relationName: "projectInvitationInviter",
    fields: [projectInvitation.invitedByUserId],
    references: [user.id],
  }),
  acceptedBy: one(user, {
    relationName: "projectInvitationAccepter",
    fields: [projectInvitation.acceptedByUserId],
    references: [user.id],
  }),
  revokedBy: one(user, {
    relationName: "projectInvitationRevoker",
    fields: [projectInvitation.revokedByUserId],
    references: [user.id],
  }),
}));

export const apiCredentialRelations = relations(apiCredential, ({ one, many }) => ({
  workspace: one(workspace, {
    fields: [apiCredential.workspaceId],
    references: [workspace.id],
  }),
  project: one(project, {
    fields: [apiCredential.projectId, apiCredential.workspaceId],
    references: [project.id, project.workspaceId],
  }),
  environment: one(environment, {
    fields: [apiCredential.environmentId, apiCredential.projectId, apiCredential.workspaceId],
    references: [environment.id, environment.projectId, environment.workspaceId],
  }),
  createdBy: one(user, {
    relationName: "apiCredentialCreator",
    fields: [apiCredential.createdByUserId],
    references: [user.id],
  }),
  revokedBy: one(user, {
    relationName: "apiCredentialRevoker",
    fields: [apiCredential.revokedByUserId],
    references: [user.id],
  }),
  scopes: many(apiCredentialScope),
}));

export const apiCredentialScopeRelations = relations(apiCredentialScope, ({ one }) => ({
  credential: one(apiCredential, {
    fields: [
      apiCredentialScope.credentialId,
      apiCredentialScope.workspaceId,
      apiCredentialScope.projectId,
      apiCredentialScope.environmentId,
    ],
    references: [
      apiCredential.id,
      apiCredential.workspaceId,
      apiCredential.projectId,
      apiCredential.environmentId,
    ],
  }),
}));
