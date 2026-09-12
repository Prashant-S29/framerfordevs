import { getTableConfig, PgDialect, type PgTable } from "drizzle-orm/pg-core";
import { describe, expect, it } from "vitest";

import { projectCapability } from "../platform";
import { controlPlaneCommandReceipt, studioRegistration } from "./index";

const config = (table: PgTable) => getTableConfig(table);
const names = (values: ReadonlyArray<{ name?: string }>) => values.map(({ name }) => name);
const columnNames = (table: PgTable) => config(table).columns.map((column) => column.name);
const foreignKeyNames = (table: PgTable) => config(table).foreignKeys.map((key) => key.getName());
const indexNames = (table: PgTable) => config(table).indexes.map((value) => value.config.name);
const checkSql = (table: PgTable, name: string) => {
  const constraint = config(table).checks.find((value) => value.name === name);
  if (constraint === undefined) {
    throw new Error(`Missing check constraint: ${name}`);
  }
  return new PgDialect().sqlToQuery(constraint.value).sql;
};

const expectNames = (
  actual: ReadonlyArray<string | undefined>,
  expected: ReadonlyArray<string>,
) => {
  expect(actual).toEqual(expect.arrayContaining([...expected]));
};

describe("M14 Control Plane persistence authority", () => {
  it("stores bounded immutable command receipts with exact tenant scope", () => {
    expect(controlPlaneCommandReceipt.commandId.primary).toBe(true);
    expect(controlPlaneCommandReceipt.commandId.hasDefault).toBe(false);
    expect(controlPlaneCommandReceipt.projectId.notNull).toBe(false);
    expect(controlPlaneCommandReceipt.environmentId.notNull).toBe(false);
    expect(controlPlaneCommandReceipt.resultResourceId.notNull).toBe(true);
    expect(columnNames(controlPlaneCommandReceipt)).toEqual([
      "command_id",
      "operation",
      "actor_type",
      "actor_id",
      "fingerprint",
      "workspace_id",
      "project_id",
      "environment_id",
      "result_resource_type",
      "result_resource_id",
      "result_disposition",
      "created_at",
    ]);

    expectNames(foreignKeyNames(controlPlaneCommandReceipt), [
      "control_plane_command_receipt_workspace_fk",
      "control_plane_command_receipt_project_workspace_fk",
      "control_plane_command_receipt_environment_tenant_fk",
    ]);
    expectNames(names(config(controlPlaneCommandReceipt).checks), [
      "control_plane_command_receipt_operation_valid",
      "control_plane_command_receipt_actor_valid",
      "control_plane_command_receipt_fingerprint_valid",
      "control_plane_command_receipt_result_type_valid",
      "control_plane_command_receipt_disposition_valid",
      "control_plane_command_receipt_scope_result_valid",
    ]);
    expectNames(indexNames(controlPlaneCommandReceipt), [
      "control_plane_command_receipt_actor_operation_created_idx",
      "control_plane_command_receipt_tenant_result_idx",
      "control_plane_command_receipt_created_at_idx",
    ]);
  });

  it("stores one versioned metadata-only Studio registration per environment", () => {
    expect(studioRegistration.applicationOrigin.notNull).toBe(true);
    expect(studioRegistration.mountPath.notNull).toBe(true);
    expect(studioRegistration.version.notNull).toBe(true);
    expect(columnNames(studioRegistration)).toEqual([
      "id",
      "workspace_id",
      "project_id",
      "environment_id",
      "application_origin",
      "mount_path",
      "version",
      "created_by_user_id",
      "created_by_credential_id",
      "changed_by_user_id",
      "changed_by_credential_id",
      "created_at",
      "updated_at",
    ]);

    expectNames(foreignKeyNames(studioRegistration), [
      "studio_registration_environment_tenant_fk",
      "studio_registration_created_credential_tenant_fk",
      "studio_registration_changed_credential_tenant_fk",
    ]);
    expectNames(names(config(studioRegistration).uniqueConstraints), [
      "studio_registration_environment_unique",
      "studio_registration_id_tenant_unique",
    ]);
    expectNames(names(config(studioRegistration).checks), [
      "studio_registration_created_actor_exactly_one",
      "studio_registration_changed_actor_exactly_one",
      "studio_registration_application_origin_valid",
      "studio_registration_mount_path_valid",
      "studio_registration_version_positive",
    ]);
    expectNames(indexNames(studioRegistration), [
      "studio_registration_created_by_user_idx",
      "studio_registration_changed_by_user_idx",
      "studio_registration_created_by_credential_idx",
      "studio_registration_changed_by_credential_idx",
    ]);
    expect(checkSql(studioRegistration, "studio_registration_application_origin_valid")).toContain(
      `= 'http://[::1]'`,
    );
    expect(checkSql(studioRegistration, "studio_registration_application_origin_valid")).toContain(
      `= 'http://[::1]:'`,
    );
  });

  it("normalizes project capability changes to one exact user or credential actor", () => {
    expect(projectCapability.changedByUserId.notNull).toBe(false);
    expect(projectCapability.changedByCredentialId.notNull).toBe(false);
    expect(projectCapability.changedByCredentialEnvironmentId.notNull).toBe(false);

    expectNames(foreignKeyNames(projectCapability), [
      "project_capability_project_workspace_fk",
      "project_capability_changed_credential_tenant_fk",
    ]);
    expectNames(names(config(projectCapability).checks), [
      "project_capability_changed_actor_exactly_one",
    ]);
    expectNames(indexNames(projectCapability), [
      "project_capability_changed_by_user_idx",
      "project_capability_changed_by_credential_idx",
    ]);
  });
});
