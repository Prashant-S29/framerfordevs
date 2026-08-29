import { getTableConfig, type PgTable } from "drizzle-orm/pg-core";
import { describe, expect, it } from "vitest";

import {
  cmsCollection,
  cmsCollectionDeliveryConfig,
  cmsCollectionField,
  cmsCollectionSchemaHead,
  cmsEntry,
  cmsEntryDraftCommand,
  cmsEntryLocaleDraft,
  cmsEntryLocalePublication,
  cmsEntryLocalePublicationHead,
  cmsEntryLocaleRevision,
  cmsEntryPublicationCommand,
  cmsEntrySharedDraft,
  cmsEntrySharedRevision,
  cmsEnumOptionSourceIdentity,
  cmsProjectSchemaApplyCommand,
  cmsProjectSchemaApplyRevision,
  cmsSchemaRevision,
} from "./cms";

const config = (table: PgTable) => getTableConfig(table);
const names = (values: ReadonlyArray<{ name?: string }>) => values.map(({ name }) => name);
const foreignKeyNames = (table: PgTable) => config(table).foreignKeys.map((key) => key.getName());
const indexNames = (table: PgTable) => config(table).indexes.map((value) => value.config.name);

const actorTables = [
  ["collection", cmsCollection, ["created", "changed"]],
  ["field", cmsCollectionField, ["created", "changed"]],
  ["delivery config", cmsCollectionDeliveryConfig, ["actor"]],
  ["schema revision", cmsSchemaRevision, ["published"]],
  ["schema head", cmsCollectionSchemaHead, ["changed"]],
  ["entry", cmsEntry, ["created", "changed"]],
  ["shared revision", cmsEntrySharedRevision, ["author"]],
  ["locale revision", cmsEntryLocaleRevision, ["author"]],
  ["shared draft", cmsEntrySharedDraft, ["actor"]],
  ["locale draft", cmsEntryLocaleDraft, ["actor"]],
  ["draft command", cmsEntryDraftCommand, ["actor"]],
  ["publication", cmsEntryLocalePublication, ["actor"]],
  ["publication head", cmsEntryLocalePublicationHead, ["actor"]],
  ["publication command", cmsEntryPublicationCommand, ["actor"]],
] as const;

describe("M13 CMS persistence authority", () => {
  it("persists non-null source keys and immutable per-revision structure authority", () => {
    expect(cmsCollection.sourceKey.notNull).toBe(true);
    expect(cmsCollectionField.sourceKey.notNull).toBe(true);
    expect(cmsSchemaRevision.structureHash.notNull).toBe(true);
    expect(cmsCollectionSchemaHead.currentPublishedStructureHash.notNull).toBe(false);

    expect(names(config(cmsCollection).uniqueConstraints)).toContain(
      "cms_collection_environment_source_key_unique",
    );
    expect(names(config(cmsCollectionField).uniqueConstraints)).toContain(
      "cms_field_collection_source_key_unique",
    );
    expect(names(config(cmsSchemaRevision).uniqueConstraints)).toContain(
      "cms_revision_id_scope_structure_unique",
    );
  });

  it("retains enum option source identities after retirement", () => {
    const table = config(cmsEnumOptionSourceIdentity);
    expect(cmsEnumOptionSourceIdentity.sourceKey.notNull).toBe(true);
    expect(cmsEnumOptionSourceIdentity.retiredAt.notNull).toBe(false);
    expect(names(table.uniqueConstraints)).toContain("cms_enum_option_field_source_key_unique");
    expect(names(table.checks)).toEqual(
      expect.arrayContaining([
        "cms_enum_option_source_key_valid",
        "cms_enum_option_created_actor_exactly_one",
        "cms_enum_option_retirement_consistent",
      ]),
    );
  });

  it("stores one project receipt and tenant-qualified revision results", () => {
    expect(names(config(cmsProjectSchemaApplyCommand).primaryKeys)).toContain(
      "cms_project_schema_apply_command_pk",
    );
    expect(names(config(cmsProjectSchemaApplyRevision).primaryKeys)).toContain(
      "cms_project_schema_apply_revision_pk",
    );
    expect(names(config(cmsProjectSchemaApplyCommand).checks)).toEqual(
      expect.arrayContaining([
        "cms_project_schema_apply_fingerprint_valid",
        "cms_project_schema_apply_hashes_valid",
        "cms_project_schema_apply_result_valid",
        "cms_project_schema_apply_actor_exactly_one",
      ]),
    );
    expect(foreignKeyNames(cmsProjectSchemaApplyCommand)).toEqual(
      expect.arrayContaining([
        "cms_project_schema_apply_user_fk",
        "cms_project_schema_apply_credential_tenant_fk",
      ]),
    );
    expect(foreignKeyNames(cmsProjectSchemaApplyRevision)).toEqual(
      expect.arrayContaining([
        "cms_project_schema_apply_revision_command_fk",
        "cms_project_schema_apply_revision_tenant_fk",
      ]),
    );
  });

  it.each(actorTables)(
    "enforces credential-aware actor checks on %s",
    (_name, table, fragments) => {
      const tableConfig = config(table);
      const checkNames = names(tableConfig.checks).join(" ");
      const tableForeignKeyNames = foreignKeyNames(table).join(" ");
      const tableIndexNames = indexNames(table).join(" ");

      for (const fragment of fragments) {
        expect(checkNames).toContain(fragment);
      }
      expect(tableForeignKeyNames).toContain("credential_tenant_fk");
      expect(
        foreignKeyNames(table)
          .filter((name) => name.includes("credential"))
          .every((name) => name.endsWith("credential_tenant_fk")),
      ).toBe(true);
      expect(tableIndexNames).toContain("credential");
    },
  );
});
