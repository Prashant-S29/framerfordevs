import { getTableConfig, PgDialect, type PgTable } from "drizzle-orm/pg-core";
import { describe, expect, it } from "vitest";

import { projectInvitation } from "../access";
import { projectInvitationLocaleAccess, projectLocale } from "../locale";

const config = (table: PgTable) => getTableConfig(table);
const names = (values: ReadonlyArray<{ name?: string }>) => values.map(({ name }) => name);
const columnNames = (table: PgTable) => config(table).columns.map((column) => column.name);
const foreignKeyNames = (table: PgTable) => config(table).foreignKeys.map((key) => key.getName());
const indexNames = (table: PgTable) => config(table).indexes.map((value) => value.config.name);
const checkSql = (table: PgTable, name: string) => {
  const constraint = config(table).checks.find((value) => value.name === name);
  if (constraint === undefined) throw new Error(`Missing check constraint: ${name}`);
  return new PgDialect().sqlToQuery(constraint.value).sql;
};

describe("M15 governance persistence authority", () => {
  it("stores bounded locale access on the tenant-qualified invitation identity", () => {
    expect(projectInvitation.localeAccessMode.notNull).toBe(true);
    expect(projectInvitation.localeAccessMode.hasDefault).toBe(true);
    expect(columnNames(projectInvitation)).toContain("locale_access_mode");

    expect(names(config(projectInvitation).uniqueConstraints)).toEqual(
      expect.arrayContaining([
        "project_invitation_token_digest_unique",
        "project_invitation_id_project_workspace_unique",
      ]),
    );
    expect(names(config(projectInvitation).checks)).toEqual(
      expect.arrayContaining([
        "project_invitation_locale_access_mode_valid",
        "project_invitation_owner_locale_access_all",
      ]),
    );
    expect(checkSql(projectInvitation, "project_invitation_locale_access_mode_valid")).toContain(
      "'all', 'selected', 'none'",
    );
    expect(checkSql(projectInvitation, "project_invitation_owner_locale_access_all")).toContain(
      `<> 'owner'`,
    );
  });

  it("normalizes locale creation and change attribution to one user or credential actor", () => {
    expect(projectLocale.createdByUserId.notNull).toBe(false);
    expect(projectLocale.createdByCredentialId.notNull).toBe(false);
    expect(projectLocale.createdByCredentialEnvironmentId.notNull).toBe(false);
    expect(projectLocale.changedByUserId.notNull).toBe(false);
    expect(projectLocale.changedByCredentialId.notNull).toBe(false);
    expect(projectLocale.changedByCredentialEnvironmentId.notNull).toBe(false);

    expect(columnNames(projectLocale)).toEqual([
      "id",
      "workspace_id",
      "project_id",
      "tag",
      "display_name",
      "status",
      "position",
      "version",
      "created_by_user_id",
      "created_by_credential_id",
      "created_by_credential_environment_id",
      "changed_by_user_id",
      "changed_by_credential_id",
      "changed_by_credential_environment_id",
      "created_at",
      "updated_at",
    ]);
    expect(foreignKeyNames(projectLocale)).toEqual(
      expect.arrayContaining([
        "project_locale_project_workspace_fk",
        "project_locale_created_credential_tenant_fk",
        "project_locale_changed_credential_tenant_fk",
      ]),
    );
    expect(names(config(projectLocale).checks)).toEqual(
      expect.arrayContaining([
        "project_locale_created_actor_exactly_one",
        "project_locale_changed_actor_exactly_one",
      ]),
    );
    expect(indexNames(projectLocale)).toEqual(
      expect.arrayContaining([
        "project_locale_created_by_user_idx",
        "project_locale_changed_by_user_idx",
        "project_locale_created_by_credential_idx",
        "project_locale_changed_by_credential_idx",
      ]),
    );
  });

  it("stores invitation selected-locale grants under composite tenant authority", () => {
    expect(columnNames(projectInvitationLocaleAccess)).toEqual([
      "invitation_id",
      "workspace_id",
      "project_id",
      "locale_id",
      "created_at",
    ]);
    expect(names(config(projectInvitationLocaleAccess).primaryKeys)).toContain(
      "project_invitation_locale_access_invitation_locale_pk",
    );
    expect(foreignKeyNames(projectInvitationLocaleAccess)).toEqual(
      expect.arrayContaining([
        "project_invitation_locale_access_invitation_tenant_fk",
        "project_invitation_locale_access_locale_tenant_fk",
      ]),
    );
    expect(indexNames(projectInvitationLocaleAccess)).toContain(
      "project_invitation_locale_access_locale_idx",
    );
  });
});
