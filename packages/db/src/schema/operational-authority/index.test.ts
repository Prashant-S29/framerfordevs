import { getTableConfig, PgDialect, type PgTable } from "drizzle-orm/pg-core";
import { describe, expect, it } from "vitest";

import { apiCredential, apiCredentialRotation } from "../access";
import { auditEvent } from "../platform";
import {
  cmsInvalidationRouteMapping,
  webhookDelivery,
  webhookEndpoint,
  webhookEndpointDestination,
  webhookEndpointSecret,
  webhookEndpointSubscription,
} from "../webhooks";

const config = (table: PgTable) => getTableConfig(table);
const names = (values: ReadonlyArray<{ name?: string }>) => values.map(({ name }) => name);
const foreignKeyNames = (table: PgTable) => config(table).foreignKeys.map((key) => key.getName());
const indexNames = (table: PgTable) => config(table).indexes.map((value) => value.config.name);
const checkSql = (table: PgTable, name: string) => {
  const constraint = config(table).checks.find((value) => value.name === name);
  if (constraint === undefined) throw new Error(`Missing check constraint: ${name}`);
  return new PgDialect().sqlToQuery(constraint.value).sql;
};

function expectCredentialActorAuthority(
  table: PgTable,
  options: {
    readonly foreignKeys: ReadonlyArray<string>;
    readonly checks: ReadonlyArray<string>;
    readonly indexes: ReadonlyArray<string>;
  },
) {
  expect(foreignKeyNames(table)).toEqual(expect.arrayContaining([...options.foreignKeys]));
  expect(names(config(table).checks)).toEqual(expect.arrayContaining([...options.checks]));
  expect(indexNames(table)).toEqual(expect.arrayContaining([...options.indexes]));
}

describe("M16 operational persistence authority", () => {
  it("stores explicit credential lifecycle and staged rotation authority", () => {
    expect(apiCredential.status.notNull).toBe(true);
    expect(apiCredential.status.hasDefault).toBe(true);
    expect(apiCredential.activatedAt.notNull).toBe(false);
    expect(apiCredential.activatedAt.hasDefault).toBe(false);
    expect(apiCredential.retireAt.notNull).toBe(false);
    expect(names(config(apiCredential).checks)).toEqual(
      expect.arrayContaining(["api_credential_status_valid", "api_credential_lifecycle_valid"]),
    );
    expect(checkSql(apiCredential, "api_credential_lifecycle_valid")).toContain("'retiring'");
    expect(indexNames(apiCredential)).toEqual(
      expect.arrayContaining([
        "api_credential_rotation_lineage_idx",
        "api_credential_environment_status_created_id_idx",
        "api_credential_retiring_due_idx",
      ]),
    );

    expect(foreignKeyNames(apiCredentialRotation)).toEqual(
      expect.arrayContaining([
        "api_credential_rotation_predecessor_tenant_fk",
        "api_credential_rotation_successor_tenant_fk",
      ]),
    );
    expect(names(config(apiCredentialRotation).checks)).toEqual(
      expect.arrayContaining([
        "api_credential_rotation_credentials_distinct",
        "api_credential_rotation_status_valid",
        "api_credential_rotation_version_positive",
        "api_credential_rotation_lifecycle_valid",
        "api_credential_rotation_timestamps_valid",
      ]),
    );
    expect(names(config(apiCredentialRotation).uniqueConstraints)).toEqual(
      expect.arrayContaining([
        "api_credential_rotation_id_tenant_unique",
        "api_credential_rotation_successor_unique",
      ]),
    );
    expect(indexNames(apiCredentialRotation)).toEqual(
      expect.arrayContaining([
        "api_credential_rotation_predecessor_open_unique",
        "api_credential_rotation_environment_status_created_id_idx",
        "api_credential_rotation_retiring_due_idx",
      ]),
    );
  });

  it("normalizes webhook configuration and replay attribution to exact credential scope", () => {
    expectCredentialActorAuthority(webhookEndpoint, {
      foreignKeys: [
        "webhook_endpoint_created_credential_tenant_fk",
        "webhook_endpoint_changed_credential_tenant_fk",
      ],
      checks: [
        "webhook_endpoint_created_actor_exactly_one",
        "webhook_endpoint_changed_actor_exactly_one",
      ],
      indexes: [
        "webhook_endpoint_created_by_credential_idx",
        "webhook_endpoint_changed_by_credential_idx",
      ],
    });
    expectCredentialActorAuthority(webhookEndpointDestination, {
      foreignKeys: ["webhook_destination_created_credential_tenant_fk"],
      checks: ["webhook_destination_created_actor_exactly_one"],
      indexes: ["webhook_destination_created_by_credential_idx"],
    });
    expectCredentialActorAuthority(webhookEndpointSubscription, {
      foreignKeys: [
        "webhook_subscription_created_credential_tenant_fk",
        "webhook_subscription_closed_credential_tenant_fk",
      ],
      checks: [
        "webhook_subscription_created_actor_exactly_one",
        "webhook_subscription_lifecycle_valid",
      ],
      indexes: [
        "webhook_subscription_created_by_credential_idx",
        "webhook_subscription_closed_by_credential_idx",
      ],
    });
    expectCredentialActorAuthority(webhookEndpointSecret, {
      foreignKeys: [
        "webhook_secret_created_credential_tenant_fk",
        "webhook_secret_changed_credential_tenant_fk",
      ],
      checks: [
        "webhook_secret_created_actor_exactly_one",
        "webhook_secret_changed_actor_exactly_one",
      ],
      indexes: [
        "webhook_secret_created_by_credential_idx",
        "webhook_secret_changed_by_credential_idx",
      ],
    });
    expectCredentialActorAuthority(cmsInvalidationRouteMapping, {
      foreignKeys: [
        "cms_invalidation_mapping_created_credential_tenant_fk",
        "cms_invalidation_mapping_changed_credential_tenant_fk",
      ],
      checks: [
        "cms_invalidation_mapping_created_actor_exactly_one",
        "cms_invalidation_mapping_changed_actor_exactly_one",
      ],
      indexes: [
        "cms_invalidation_mapping_created_by_credential_idx",
        "cms_invalidation_mapping_changed_by_credential_idx",
      ],
    });
    expectCredentialActorAuthority(webhookDelivery, {
      foreignKeys: ["webhook_delivery_replayed_credential_tenant_fk"],
      checks: ["webhook_delivery_replay_authority_valid"],
      indexes: ["webhook_delivery_replayed_by_credential_idx"],
    });
    const outcomeAuthority = checkSql(webhookDelivery, "webhook_delivery_outcome_valid");
    expect(outcomeAuthority).toContain("project_archived");
    expect(outcomeAuthority).toContain("canceled");
  });

  it("indexes bounded project audit filters without adding mutable payload", () => {
    expect(auditEvent).not.toHaveProperty("metadata");
    expect(auditEvent).not.toHaveProperty("payload");
    expect(indexNames(auditEvent)).toEqual(
      expect.arrayContaining([
        "audit_event_project_occurred_id_idx",
        "audit_event_project_environment_occurred_id_idx",
        "audit_event_project_actor_occurred_id_idx",
        "audit_event_project_action_occurred_id_idx",
      ]),
    );
  });
});
