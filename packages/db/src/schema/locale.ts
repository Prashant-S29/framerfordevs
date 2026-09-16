import { relations, sql } from "drizzle-orm";
import {
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

import { apiCredential, projectInvitation, projectMembership } from "./access";
import { user } from "./auth";
import { project } from "./platform";

const localeId = (name: string) =>
  uuid(name)
    .default(sql`uuidv7()`)
    .notNull();
const localeTimestamp = (name: string) => timestamp(name, { withTimezone: true, mode: "date" });

export const projectLocale = pgTable(
  "project_locale",
  {
    id: localeId("id").primaryKey(),
    workspaceId: uuid("workspace_id").notNull(),
    projectId: uuid("project_id").notNull(),
    tag: varchar("tag", { length: 64 }).notNull(),
    displayName: varchar("display_name", { length: 100 }).notNull(),
    status: varchar("status", { length: 16 }).default("enabled").notNull(),
    position: integer("position"),
    version: integer("version").default(1).notNull(),
    createdByUserId: text("created_by_user_id").references(() => user.id, {
      onDelete: "restrict",
    }),
    createdByCredentialId: uuid("created_by_credential_id"),
    createdByCredentialEnvironmentId: uuid("created_by_credential_environment_id"),
    changedByUserId: text("changed_by_user_id").references(() => user.id, {
      onDelete: "restrict",
    }),
    changedByCredentialId: uuid("changed_by_credential_id"),
    changedByCredentialEnvironmentId: uuid("changed_by_credential_environment_id"),
    createdAt: localeTimestamp("created_at").defaultNow().notNull(),
    updatedAt: localeTimestamp("updated_at").defaultNow().notNull(),
  },
  (table) => [
    foreignKey({
      name: "project_locale_project_workspace_fk",
      columns: [table.projectId, table.workspaceId],
      foreignColumns: [project.id, project.workspaceId],
    }).onDelete("restrict"),
    foreignKey({
      name: "project_locale_created_credential_tenant_fk",
      columns: [
        table.createdByCredentialId,
        table.workspaceId,
        table.projectId,
        table.createdByCredentialEnvironmentId,
      ],
      foreignColumns: [
        apiCredential.id,
        apiCredential.workspaceId,
        apiCredential.projectId,
        apiCredential.environmentId,
      ],
    }).onDelete("restrict"),
    foreignKey({
      name: "project_locale_changed_credential_tenant_fk",
      columns: [
        table.changedByCredentialId,
        table.workspaceId,
        table.projectId,
        table.changedByCredentialEnvironmentId,
      ],
      foreignColumns: [
        apiCredential.id,
        apiCredential.workspaceId,
        apiCredential.projectId,
        apiCredential.environmentId,
      ],
    }).onDelete("restrict"),
    unique("project_locale_id_project_workspace_unique").on(
      table.id,
      table.projectId,
      table.workspaceId,
    ),
    uniqueIndex("project_locale_project_tag_ci_unique").on(
      table.projectId,
      sql`lower(${table.tag})`,
    ),
    uniqueIndex("project_locale_project_position_unique")
      .on(table.projectId, table.position)
      .where(sql`${table.position} is not null`),
    check(
      "project_locale_created_actor_exactly_one",
      sql`(${table.createdByUserId} is not null and ${table.createdByCredentialId} is null and ${table.createdByCredentialEnvironmentId} is null) or (${table.createdByUserId} is null and ${table.createdByCredentialId} is not null and ${table.createdByCredentialEnvironmentId} is not null)`,
    ),
    check(
      "project_locale_changed_actor_exactly_one",
      sql`(${table.changedByUserId} is not null and ${table.changedByCredentialId} is null and ${table.changedByCredentialEnvironmentId} is null) or (${table.changedByUserId} is null and ${table.changedByCredentialId} is not null and ${table.changedByCredentialEnvironmentId} is not null)`,
    ),
    check(
      "project_locale_tag_valid",
      sql`char_length(${table.tag}) between 1 and 64 and ${table.tag} = btrim(${table.tag}) and ${table.tag} ~ '^[A-Za-z0-9]+(-[A-Za-z0-9]+)*$'`,
    ),
    check(
      "project_locale_display_name_valid",
      sql`char_length(${table.displayName}) between 1 and 100 and ${table.displayName} = btrim(${table.displayName}) and ${table.displayName} !~ '[[:cntrl:]]'`,
    ),
    check(
      "project_locale_status_valid",
      sql`${table.status} in ('enabled', 'disabled', 'removed')`,
    ),
    check(
      "project_locale_position_consistent",
      sql`(${table.status} = 'removed' and ${table.position} is null) or (${table.status} in ('enabled', 'disabled') and ${table.position} >= 0)`,
    ),
    check("project_locale_version_positive", sql`${table.version} > 0`),
    check(
      "project_locale_english_enabled",
      sql`lower(${table.tag}) <> 'en' or ${table.status} = 'enabled'`,
    ),
    index("project_locale_project_active_position_id_idx")
      .on(table.projectId, table.position, table.id)
      .where(sql`${table.status} <> 'removed'`),
    index("project_locale_created_by_user_idx")
      .on(table.createdByUserId)
      .where(sql`${table.createdByUserId} is not null`),
    index("project_locale_changed_by_user_idx")
      .on(table.changedByUserId)
      .where(sql`${table.changedByUserId} is not null`),
    index("project_locale_created_by_credential_idx")
      .on(table.createdByCredentialId, table.createdByCredentialEnvironmentId)
      .where(sql`${table.createdByCredentialId} is not null`),
    index("project_locale_changed_by_credential_idx")
      .on(table.changedByCredentialId, table.changedByCredentialEnvironmentId)
      .where(sql`${table.changedByCredentialId} is not null`),
  ],
);

export const projectMembershipLocaleAccess = pgTable(
  "project_membership_locale_access",
  {
    membershipId: uuid("membership_id").notNull(),
    workspaceId: uuid("workspace_id").notNull(),
    projectId: uuid("project_id").notNull(),
    localeId: uuid("locale_id").notNull(),
    createdAt: localeTimestamp("created_at").defaultNow().notNull(),
  },
  (table) => [
    primaryKey({
      name: "project_membership_locale_access_membership_locale_pk",
      columns: [table.membershipId, table.localeId],
    }),
    foreignKey({
      name: "project_membership_locale_access_membership_tenant_fk",
      columns: [table.membershipId, table.projectId, table.workspaceId],
      foreignColumns: [
        projectMembership.id,
        projectMembership.projectId,
        projectMembership.workspaceId,
      ],
    }).onDelete("restrict"),
    foreignKey({
      name: "project_membership_locale_access_locale_tenant_fk",
      columns: [table.localeId, table.projectId, table.workspaceId],
      foreignColumns: [projectLocale.id, projectLocale.projectId, projectLocale.workspaceId],
    }).onDelete("restrict"),
    index("project_membership_locale_access_locale_idx").on(table.localeId),
  ],
);

export const projectInvitationLocaleAccess = pgTable(
  "project_invitation_locale_access",
  {
    invitationId: uuid("invitation_id").notNull(),
    workspaceId: uuid("workspace_id").notNull(),
    projectId: uuid("project_id").notNull(),
    localeId: uuid("locale_id").notNull(),
    createdAt: localeTimestamp("created_at").defaultNow().notNull(),
  },
  (table) => [
    primaryKey({
      name: "project_invitation_locale_access_invitation_locale_pk",
      columns: [table.invitationId, table.localeId],
    }),
    foreignKey({
      name: "project_invitation_locale_access_invitation_tenant_fk",
      columns: [table.invitationId, table.projectId, table.workspaceId],
      foreignColumns: [
        projectInvitation.id,
        projectInvitation.projectId,
        projectInvitation.workspaceId,
      ],
    }).onDelete("restrict"),
    foreignKey({
      name: "project_invitation_locale_access_locale_tenant_fk",
      columns: [table.localeId, table.projectId, table.workspaceId],
      foreignColumns: [projectLocale.id, projectLocale.projectId, projectLocale.workspaceId],
    }).onDelete("restrict"),
    index("project_invitation_locale_access_locale_idx").on(table.localeId),
  ],
);

export const projectLocaleRelations = relations(projectLocale, ({ one, many }) => ({
  project: one(project, {
    fields: [projectLocale.projectId, projectLocale.workspaceId],
    references: [project.id, project.workspaceId],
  }),
  createdBy: one(user, {
    relationName: "projectLocaleCreator",
    fields: [projectLocale.createdByUserId],
    references: [user.id],
  }),
  createdByCredential: one(apiCredential, {
    relationName: "projectLocaleCredentialCreator",
    fields: [
      projectLocale.createdByCredentialId,
      projectLocale.workspaceId,
      projectLocale.projectId,
      projectLocale.createdByCredentialEnvironmentId,
    ],
    references: [
      apiCredential.id,
      apiCredential.workspaceId,
      apiCredential.projectId,
      apiCredential.environmentId,
    ],
  }),
  changedBy: one(user, {
    relationName: "projectLocaleChanger",
    fields: [projectLocale.changedByUserId],
    references: [user.id],
  }),
  changedByCredential: one(apiCredential, {
    relationName: "projectLocaleCredentialChanger",
    fields: [
      projectLocale.changedByCredentialId,
      projectLocale.workspaceId,
      projectLocale.projectId,
      projectLocale.changedByCredentialEnvironmentId,
    ],
    references: [
      apiCredential.id,
      apiCredential.workspaceId,
      apiCredential.projectId,
      apiCredential.environmentId,
    ],
  }),
  membershipAccess: many(projectMembershipLocaleAccess),
  invitationAccess: many(projectInvitationLocaleAccess),
}));

export const projectMembershipLocaleAccessRelations = relations(
  projectMembershipLocaleAccess,
  ({ one }) => ({
    membership: one(projectMembership, {
      fields: [
        projectMembershipLocaleAccess.membershipId,
        projectMembershipLocaleAccess.projectId,
        projectMembershipLocaleAccess.workspaceId,
      ],
      references: [
        projectMembership.id,
        projectMembership.projectId,
        projectMembership.workspaceId,
      ],
    }),
    locale: one(projectLocale, {
      fields: [
        projectMembershipLocaleAccess.localeId,
        projectMembershipLocaleAccess.projectId,
        projectMembershipLocaleAccess.workspaceId,
      ],
      references: [projectLocale.id, projectLocale.projectId, projectLocale.workspaceId],
    }),
  }),
);

export const projectInvitationLocaleAccessRelations = relations(
  projectInvitationLocaleAccess,
  ({ one }) => ({
    invitation: one(projectInvitation, {
      fields: [
        projectInvitationLocaleAccess.invitationId,
        projectInvitationLocaleAccess.projectId,
        projectInvitationLocaleAccess.workspaceId,
      ],
      references: [
        projectInvitation.id,
        projectInvitation.projectId,
        projectInvitation.workspaceId,
      ],
    }),
    locale: one(projectLocale, {
      fields: [
        projectInvitationLocaleAccess.localeId,
        projectInvitationLocaleAccess.projectId,
        projectInvitationLocaleAccess.workspaceId,
      ],
      references: [projectLocale.id, projectLocale.projectId, projectLocale.workspaceId],
    }),
  }),
);
