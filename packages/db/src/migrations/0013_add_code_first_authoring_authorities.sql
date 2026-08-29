CREATE TABLE "cms_enum_option_source_identity" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"project_id" uuid NOT NULL,
	"environment_id" uuid NOT NULL,
	"collection_id" uuid NOT NULL,
	"field_id" uuid NOT NULL,
	"source_key" varchar(63) NOT NULL,
	"created_by_user_id" text,
	"created_by_credential_id" uuid,
	"retired_at" timestamp with time zone,
	"retired_by_user_id" text,
	"retired_by_credential_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "cms_enum_option_field_source_key_unique" UNIQUE("field_id","source_key"),
	CONSTRAINT "cms_enum_option_id_field_tenant_unique" UNIQUE("id","field_id","collection_id","environment_id","project_id","workspace_id"),
	CONSTRAINT "cms_enum_option_source_key_valid" CHECK ("cms_enum_option_source_identity"."source_key" ~ '^[a-z][a-z0-9_-]{0,62}$' and "cms_enum_option_source_identity"."source_key" !~ '--|__' and right("cms_enum_option_source_identity"."source_key", 1) not in ('-', '_') and "cms_enum_option_source_identity"."source_key" not in ('id', 'entry_id', 'collection_id', 'locale', 'schema_revision', 'publication_id', 'publication_sequence', 'created_at', 'updated_at', 'published_at', '_meta', '__proto__', 'prototype', 'constructor')),
	CONSTRAINT "cms_enum_option_created_actor_exactly_one" CHECK (num_nonnulls("cms_enum_option_source_identity"."created_by_user_id", "cms_enum_option_source_identity"."created_by_credential_id") = 1),
	CONSTRAINT "cms_enum_option_retirement_consistent" CHECK (("cms_enum_option_source_identity"."retired_at" is null and num_nonnulls("cms_enum_option_source_identity"."retired_by_user_id", "cms_enum_option_source_identity"."retired_by_credential_id") = 0) or ("cms_enum_option_source_identity"."retired_at" is not null and num_nonnulls("cms_enum_option_source_identity"."retired_by_user_id", "cms_enum_option_source_identity"."retired_by_credential_id") = 1))
);
--> statement-breakpoint
CREATE TABLE "cms_project_schema_apply_command" (
	"command_id" uuid NOT NULL,
	"workspace_id" uuid NOT NULL,
	"project_id" uuid NOT NULL,
	"environment_id" uuid NOT NULL,
	"command_fingerprint" char(64) NOT NULL,
	"expected_manifest_hash" char(64) NOT NULL,
	"plan_hash" char(64) NOT NULL,
	"result_manifest_hash" char(64) NOT NULL,
	"no_op" boolean NOT NULL,
	"result" jsonb NOT NULL,
	"completed_by_user_id" text,
	"completed_by_credential_id" uuid,
	"completed_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "cms_project_schema_apply_command_pk" PRIMARY KEY("environment_id","command_id"),
	CONSTRAINT "cms_project_schema_apply_fingerprint_valid" CHECK ("cms_project_schema_apply_command"."command_fingerprint" ~ '^[0-9a-f]{64}$'),
	CONSTRAINT "cms_project_schema_apply_hashes_valid" CHECK ("cms_project_schema_apply_command"."expected_manifest_hash" ~ '^[0-9a-f]{64}$' and "cms_project_schema_apply_command"."plan_hash" ~ '^[0-9a-f]{64}$' and "cms_project_schema_apply_command"."result_manifest_hash" ~ '^[0-9a-f]{64}$'),
	CONSTRAINT "cms_project_schema_apply_result_valid" CHECK (jsonb_typeof("cms_project_schema_apply_command"."result") = 'object' and octet_length("cms_project_schema_apply_command"."result"::text) <= 1048576),
	CONSTRAINT "cms_project_schema_apply_actor_exactly_one" CHECK (num_nonnulls("cms_project_schema_apply_command"."completed_by_user_id", "cms_project_schema_apply_command"."completed_by_credential_id") = 1)
);
--> statement-breakpoint
CREATE TABLE "cms_project_schema_apply_revision" (
	"environment_id" uuid NOT NULL,
	"command_id" uuid NOT NULL,
	"workspace_id" uuid NOT NULL,
	"project_id" uuid NOT NULL,
	"collection_id" uuid NOT NULL,
	"revision_id" uuid NOT NULL,
	"structure_hash" char(64) NOT NULL,
	"contract_hash" char(64) NOT NULL,
	"changed" boolean NOT NULL,
	CONSTRAINT "cms_project_schema_apply_revision_pk" PRIMARY KEY("environment_id","command_id","collection_id"),
	CONSTRAINT "cms_project_schema_apply_revision_hashes_valid" CHECK ("cms_project_schema_apply_revision"."structure_hash" ~ '^[0-9a-f]{64}$' and "cms_project_schema_apply_revision"."contract_hash" ~ '^[0-9a-f]{64}$')
);
--> statement-breakpoint
ALTER TABLE "cms_collection_field" DROP CONSTRAINT "cms_field_lifecycle_consistent";--> statement-breakpoint
ALTER TABLE "cms_collection_schema_head" DROP CONSTRAINT "cms_head_publication_consistent";--> statement-breakpoint
ALTER TABLE "cms_collection" ALTER COLUMN "created_by_user_id" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "cms_collection" ALTER COLUMN "changed_by_user_id" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "cms_collection_delivery_config" ALTER COLUMN "changed_by_user_id" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "cms_collection_field" ALTER COLUMN "created_by_user_id" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "cms_collection_field" ALTER COLUMN "changed_by_user_id" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "cms_collection_schema_head" ALTER COLUMN "changed_by_user_id" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "cms_entry" ALTER COLUMN "created_by_user_id" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "cms_entry" ALTER COLUMN "changed_by_user_id" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "cms_entry_draft_command" ALTER COLUMN "completed_by_user_id" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "cms_entry_locale_draft" ALTER COLUMN "changed_by_user_id" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "cms_entry_locale_publication" ALTER COLUMN "published_by_user_id" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "cms_entry_locale_publication_head" ALTER COLUMN "changed_by_user_id" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "cms_entry_locale_revision" ALTER COLUMN "authored_by_user_id" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "cms_entry_publication_command" ALTER COLUMN "completed_by_user_id" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "cms_entry_shared_draft" ALTER COLUMN "changed_by_user_id" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "cms_entry_shared_revision" ALTER COLUMN "authored_by_user_id" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "cms_schema_revision" ALTER COLUMN "published_by_user_id" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "cms_collection" ADD COLUMN "source_key" varchar(63);--> statement-breakpoint
ALTER TABLE "cms_collection" ADD COLUMN "created_by_credential_id" uuid;--> statement-breakpoint
ALTER TABLE "cms_collection" ADD COLUMN "changed_by_credential_id" uuid;--> statement-breakpoint
ALTER TABLE "cms_collection_delivery_config" ADD COLUMN "changed_by_credential_id" uuid;--> statement-breakpoint
ALTER TABLE "cms_collection_field" ADD COLUMN "source_key" varchar(63);--> statement-breakpoint
ALTER TABLE "cms_collection_field" ADD COLUMN "created_by_credential_id" uuid;--> statement-breakpoint
ALTER TABLE "cms_collection_field" ADD COLUMN "changed_by_credential_id" uuid;--> statement-breakpoint
ALTER TABLE "cms_collection_field" ADD COLUMN "removed_by_credential_id" uuid;--> statement-breakpoint
ALTER TABLE "cms_collection_schema_head" ADD COLUMN "current_published_structure_hash" char(64);--> statement-breakpoint
ALTER TABLE "cms_collection_schema_head" ADD COLUMN "changed_by_credential_id" uuid;--> statement-breakpoint
ALTER TABLE "cms_entry" ADD COLUMN "created_by_credential_id" uuid;--> statement-breakpoint
ALTER TABLE "cms_entry" ADD COLUMN "changed_by_credential_id" uuid;--> statement-breakpoint
ALTER TABLE "cms_entry_draft_command" ADD COLUMN "completed_by_credential_id" uuid;--> statement-breakpoint
ALTER TABLE "cms_entry_locale_draft" ADD COLUMN "changed_by_credential_id" uuid;--> statement-breakpoint
ALTER TABLE "cms_entry_locale_publication" ADD COLUMN "published_by_credential_id" uuid;--> statement-breakpoint
ALTER TABLE "cms_entry_locale_publication_head" ADD COLUMN "changed_by_credential_id" uuid;--> statement-breakpoint
ALTER TABLE "cms_entry_locale_revision" ADD COLUMN "authored_by_credential_id" uuid;--> statement-breakpoint
ALTER TABLE "cms_entry_publication_command" ADD COLUMN "completed_by_credential_id" uuid;--> statement-breakpoint
ALTER TABLE "cms_entry_shared_draft" ADD COLUMN "changed_by_credential_id" uuid;--> statement-breakpoint
ALTER TABLE "cms_entry_shared_revision" ADD COLUMN "authored_by_credential_id" uuid;--> statement-breakpoint
ALTER TABLE "cms_schema_revision" ADD COLUMN "structure_hash" char(64);--> statement-breakpoint
ALTER TABLE "cms_schema_revision" ADD COLUMN "published_by_credential_id" uuid;--> statement-breakpoint
-- Deterministically materialize legacy source identities before enforcing non-null authority.
CREATE FUNCTION pg_temp.m13_source_key(readable text, stable_id uuid)
RETURNS text
LANGUAGE sql
IMMUTABLE
STRICT
AS $$
  SELECT coalesce(nullif(regexp_replace(left(readable, 50), '[-_]$', ''), ''), 'item')
    || '-'
    || right(replace(stable_id::text, '-', ''), 12)
$$;--> statement-breakpoint
UPDATE "cms_collection"
SET "source_key" = CASE
  WHEN "api_key" IN ('id', 'entry_id', 'collection_id', 'locale', 'schema_revision', 'publication_id', 'publication_sequence', 'created_at', 'updated_at', 'published_at', '_meta', '__proto__', 'prototype', 'constructor')
    THEN pg_temp.m13_source_key("api_key", "id")
  ELSE "api_key"
END;--> statement-breakpoint
UPDATE "cms_collection_field"
SET "source_key" = pg_temp.m13_source_key(coalesce("api_key", 'item'), "id");--> statement-breakpoint
WITH option_candidates AS (
  SELECT DISTINCT ON (candidate.option_id)
    candidate.option_id,
    candidate.workspace_id,
    candidate.project_id,
    candidate.environment_id,
    candidate.collection_id,
    candidate.field_id,
    candidate.option_value,
    candidate.created_by_user_id,
    candidate.created_at
  FROM (
    SELECT
      (option_value ->> 'id')::uuid AS option_id,
      field.workspace_id,
      field.project_id,
      field.environment_id,
      field.collection_id,
      field.field_id,
      option_value ->> 'value' AS option_value,
      stable_field.created_by_user_id,
      stable_field.created_at,
      0 AS source_rank,
      revision.sequence AS source_sequence
    FROM "cms_schema_revision_field" AS field
    INNER JOIN "cms_schema_revision" AS revision
      ON revision.id = field.revision_id
    INNER JOIN "cms_collection_field" AS stable_field
      ON stable_field.id = field.field_id
    CROSS JOIN LATERAL jsonb_array_elements(field.configuration -> 'options') AS option_value
    WHERE field.kind = 'enum'
      AND jsonb_typeof(field.configuration -> 'options') = 'array'
    UNION ALL
    SELECT
      (option_value ->> 'id')::uuid AS option_id,
      field.workspace_id,
      field.project_id,
      field.environment_id,
      field.collection_id,
      field.id AS field_id,
      option_value ->> 'value' AS option_value,
      field.created_by_user_id,
      field.created_at,
      1 AS source_rank,
      0 AS source_sequence
    FROM "cms_collection_field" AS field
    CROSS JOIN LATERAL jsonb_array_elements(field.configuration -> 'options') AS option_value
    WHERE field.kind = 'enum'
      AND jsonb_typeof(field.configuration -> 'options') = 'array'
  ) AS candidate
  ORDER BY candidate.option_id, candidate.source_rank, candidate.source_sequence, candidate.option_value
)
INSERT INTO "cms_enum_option_source_identity" (
  "id",
  "workspace_id",
  "project_id",
  "environment_id",
  "collection_id",
  "field_id",
  "source_key",
  "created_by_user_id",
  "created_at"
)
SELECT
  option_id,
  workspace_id,
  project_id,
  environment_id,
  collection_id,
  field_id,
  pg_temp.m13_source_key(option_value, option_id),
  created_by_user_id,
  created_at
FROM option_candidates;--> statement-breakpoint
UPDATE "cms_enum_option_source_identity" AS identity
SET
  "retired_at" = coalesce(field.removed_at, field.updated_at),
  "retired_by_user_id" = field.changed_by_user_id
FROM "cms_collection_field" AS field
WHERE field.id = identity.field_id
  AND (
    field.removed_at IS NOT NULL
    OR NOT EXISTS (
      SELECT 1
      FROM jsonb_array_elements(field.configuration -> 'options') AS current_option
      WHERE jsonb_typeof(field.configuration -> 'options') = 'array'
        AND (current_option ->> 'id')::uuid = identity.id
    )
  );--> statement-breakpoint
-- Reproduce the application canonical JSON projection for every immutable legacy revision.
CREATE FUNCTION pg_temp.m13_canonical_jsonb(value jsonb)
RETURNS text
LANGUAGE plpgsql
IMMUTABLE
AS $$
DECLARE
  value_kind text;
  canonical text;
BEGIN
  IF value IS NULL THEN
    RETURN 'null';
  END IF;
  value_kind := jsonb_typeof(value);
  IF value_kind = 'object' THEN
    SELECT coalesce(
      '{' || string_agg(to_json(object_item.key)::text || ':' || pg_temp.m13_canonical_jsonb(object_item.value), ',' ORDER BY object_item.key COLLATE "C") || '}',
      '{}'
    )
    INTO canonical
    FROM jsonb_each(value) AS object_item;
    RETURN canonical;
  ELSIF value_kind = 'array' THEN
    SELECT coalesce(
      '[' || string_agg(pg_temp.m13_canonical_jsonb(array_item.value), ',' ORDER BY array_item.ordinality) || ']',
      '[]'
    )
    INTO canonical
    FROM jsonb_array_elements(value) WITH ORDINALITY AS array_item(value, ordinality);
    RETURN canonical;
  END IF;
  RETURN value::text;
END;
$$;--> statement-breakpoint
CREATE FUNCTION pg_temp.m13_project_revision_field(target_revision_id uuid, target_field_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
AS $$
DECLARE
  projected jsonb;
BEGIN
  SELECT jsonb_build_object(
    'id', revision_field.field_id,
    'sourceKey', stable_field.source_key,
    'parentFieldId', revision_field.parent_field_id,
    'nodeRole', CASE
      WHEN revision_field.node_role = 'object_property' THEN 'property'
      ELSE revision_field.node_role
    END,
    'apiKey', revision_field.api_key,
    'kind', revision_field.kind,
    'required', revision_field.required,
    'localization', revision_field.localization,
    'deprecated', revision_field.deprecated,
    'configuration', CASE
      WHEN revision_field.kind = 'enum' THEN
        jsonb_build_object(
          'options', coalesce((
            SELECT jsonb_agg(
              jsonb_build_object(
                'id', (enum_option ->> 'id')::uuid,
                'sourceKey', option_identity.source_key,
                'value', enum_option ->> 'value'
              )
              ORDER BY option_identity.source_key
            )
            FROM jsonb_array_elements(revision_field.configuration -> 'options') AS enum_option
            INNER JOIN "cms_enum_option_source_identity" AS option_identity
              ON option_identity.id = (enum_option ->> 'id')::uuid
          ), '[]'::jsonb)
        ) || CASE
          WHEN revision_field.configuration ? 'default'
            THEN jsonb_build_object('default', revision_field.configuration -> 'default')
          ELSE '{}'::jsonb
        END
      ELSE revision_field.configuration
    END,
    'children', coalesce((
      SELECT jsonb_agg(child.projected ORDER BY pg_temp.m13_canonical_jsonb(child.projected) COLLATE "C")
      FROM (
        SELECT pg_temp.m13_project_revision_field(child_field.revision_id, child_field.field_id) AS projected
        FROM "cms_schema_revision_field" AS child_field
        WHERE child_field.revision_id = revision_field.revision_id
          AND child_field.parent_field_id = revision_field.field_id
      ) AS child
    ), '[]'::jsonb)
  )
  INTO projected
  FROM "cms_schema_revision_field" AS revision_field
  INNER JOIN "cms_collection_field" AS stable_field
    ON stable_field.id = revision_field.field_id
  WHERE revision_field.revision_id = target_revision_id
    AND revision_field.field_id = target_field_id;
  RETURN projected;
END;
$$;--> statement-breakpoint
CREATE FUNCTION pg_temp.m13_revision_structure_hash(target_revision_id uuid)
RETURNS text
LANGUAGE plpgsql
STABLE
AS $$
DECLARE
  canonical text;
BEGIN
  SELECT pg_temp.m13_canonical_jsonb(
    jsonb_build_object(
      'collection', jsonb_build_object(
        'id', revision.collection_id,
        'sourceKey', collection.source_key,
        'apiKey', revision.collection_api_key,
        'fields', coalesce((
          SELECT jsonb_agg(root.projected ORDER BY pg_temp.m13_canonical_jsonb(root.projected) COLLATE "C")
          FROM (
            SELECT pg_temp.m13_project_revision_field(root_field.revision_id, root_field.field_id) AS projected
            FROM "cms_schema_revision_field" AS root_field
            WHERE root_field.revision_id = revision.id
              AND root_field.parent_field_id IS NULL
          ) AS root
        ), '[]'::jsonb)
      ),
      'version', 1
    )
  )
  INTO canonical
  FROM "cms_schema_revision" AS revision
  INNER JOIN "cms_collection" AS collection
    ON collection.id = revision.collection_id
  WHERE revision.id = target_revision_id;
  RETURN encode(sha256(convert_to(canonical, 'UTF8')), 'hex');
END;
$$;--> statement-breakpoint
UPDATE "cms_schema_revision"
SET "structure_hash" = pg_temp.m13_revision_structure_hash("id");--> statement-breakpoint
UPDATE "cms_collection_schema_head" AS head
SET "current_published_structure_hash" = revision.structure_hash
FROM "cms_schema_revision" AS revision
WHERE revision.id = head.current_published_revision_id;--> statement-breakpoint
ALTER TABLE "cms_collection" ALTER COLUMN "source_key" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "cms_collection_field" ALTER COLUMN "source_key" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "cms_schema_revision" ALTER COLUMN "structure_hash" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "cms_schema_revision" ADD CONSTRAINT "cms_revision_id_scope_structure_unique" UNIQUE("id","collection_id","environment_id","project_id","workspace_id","structure_hash");--> statement-breakpoint
DROP FUNCTION pg_temp.m13_revision_structure_hash(uuid);--> statement-breakpoint
DROP FUNCTION pg_temp.m13_project_revision_field(uuid, uuid);--> statement-breakpoint
DROP FUNCTION pg_temp.m13_canonical_jsonb(jsonb);--> statement-breakpoint
DROP FUNCTION pg_temp.m13_source_key(text, uuid);--> statement-breakpoint
ALTER TABLE "cms_enum_option_source_identity" ADD CONSTRAINT "cms_enum_option_source_identity_created_by_user_id_user_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."user"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cms_enum_option_source_identity" ADD CONSTRAINT "cms_enum_option_source_identity_created_by_credential_id_api_credential_id_fk" FOREIGN KEY ("created_by_credential_id") REFERENCES "public"."api_credential"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cms_enum_option_source_identity" ADD CONSTRAINT "cms_enum_option_source_identity_retired_by_user_id_user_id_fk" FOREIGN KEY ("retired_by_user_id") REFERENCES "public"."user"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cms_enum_option_source_identity" ADD CONSTRAINT "cms_enum_option_source_identity_retired_by_credential_id_api_credential_id_fk" FOREIGN KEY ("retired_by_credential_id") REFERENCES "public"."api_credential"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cms_enum_option_source_identity" ADD CONSTRAINT "cms_enum_option_created_credential_tenant_fk" FOREIGN KEY ("created_by_credential_id","workspace_id","project_id","environment_id") REFERENCES "public"."api_credential"("id","workspace_id","project_id","environment_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cms_enum_option_source_identity" ADD CONSTRAINT "cms_enum_option_retired_credential_tenant_fk" FOREIGN KEY ("retired_by_credential_id","workspace_id","project_id","environment_id") REFERENCES "public"."api_credential"("id","workspace_id","project_id","environment_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cms_enum_option_source_identity" ADD CONSTRAINT "cms_enum_option_field_tenant_fk" FOREIGN KEY ("field_id","collection_id","environment_id","project_id","workspace_id") REFERENCES "public"."cms_collection_field"("id","collection_id","environment_id","project_id","workspace_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cms_project_schema_apply_command" ADD CONSTRAINT "cms_project_schema_apply_command_completed_by_user_id_user_id_fk" FOREIGN KEY ("completed_by_user_id") REFERENCES "public"."user"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cms_project_schema_apply_command" ADD CONSTRAINT "cms_project_schema_apply_command_completed_by_credential_id_api_credential_id_fk" FOREIGN KEY ("completed_by_credential_id") REFERENCES "public"."api_credential"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cms_project_schema_apply_command" ADD CONSTRAINT "cms_project_schema_apply_environment_fk" FOREIGN KEY ("environment_id","project_id","workspace_id") REFERENCES "public"."environment"("id","project_id","workspace_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cms_project_schema_apply_command" ADD CONSTRAINT "cms_project_schema_apply_credential_tenant_fk" FOREIGN KEY ("completed_by_credential_id","workspace_id","project_id","environment_id") REFERENCES "public"."api_credential"("id","workspace_id","project_id","environment_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cms_project_schema_apply_revision" ADD CONSTRAINT "cms_project_schema_apply_revision_command_fk" FOREIGN KEY ("environment_id","command_id") REFERENCES "public"."cms_project_schema_apply_command"("environment_id","command_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cms_project_schema_apply_revision" ADD CONSTRAINT "cms_project_schema_apply_revision_tenant_fk" FOREIGN KEY ("revision_id","collection_id","environment_id","project_id","workspace_id","structure_hash") REFERENCES "public"."cms_schema_revision"("id","collection_id","environment_id","project_id","workspace_id","structure_hash") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "cms_enum_option_collection_field_idx" ON "cms_enum_option_source_identity" USING btree ("collection_id","field_id");--> statement-breakpoint
CREATE INDEX "cms_enum_option_created_by_credential_idx" ON "cms_enum_option_source_identity" USING btree ("created_by_credential_id") WHERE "cms_enum_option_source_identity"."created_by_credential_id" is not null;--> statement-breakpoint
CREATE INDEX "cms_enum_option_retired_by_credential_idx" ON "cms_enum_option_source_identity" USING btree ("retired_by_credential_id") WHERE "cms_enum_option_source_identity"."retired_by_credential_id" is not null;--> statement-breakpoint
CREATE INDEX "cms_project_schema_apply_completed_idx" ON "cms_project_schema_apply_command" USING btree ("environment_id","completed_at" DESC NULLS LAST,"command_id" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "cms_project_schema_apply_completed_by_credential_idx" ON "cms_project_schema_apply_command" USING btree ("completed_by_credential_id") WHERE "cms_project_schema_apply_command"."completed_by_credential_id" is not null;--> statement-breakpoint
CREATE INDEX "cms_project_schema_apply_revision_revision_idx" ON "cms_project_schema_apply_revision" USING btree ("revision_id");--> statement-breakpoint
ALTER TABLE "cms_collection" ADD CONSTRAINT "cms_collection_created_by_credential_id_api_credential_id_fk" FOREIGN KEY ("created_by_credential_id") REFERENCES "public"."api_credential"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cms_collection" ADD CONSTRAINT "cms_collection_changed_by_credential_id_api_credential_id_fk" FOREIGN KEY ("changed_by_credential_id") REFERENCES "public"."api_credential"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cms_collection" ADD CONSTRAINT "cms_collection_created_credential_tenant_fk" FOREIGN KEY ("created_by_credential_id","workspace_id","project_id","environment_id") REFERENCES "public"."api_credential"("id","workspace_id","project_id","environment_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cms_collection" ADD CONSTRAINT "cms_collection_changed_credential_tenant_fk" FOREIGN KEY ("changed_by_credential_id","workspace_id","project_id","environment_id") REFERENCES "public"."api_credential"("id","workspace_id","project_id","environment_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cms_collection_delivery_config" ADD CONSTRAINT "cms_collection_delivery_config_changed_by_credential_id_api_credential_id_fk" FOREIGN KEY ("changed_by_credential_id") REFERENCES "public"."api_credential"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cms_collection_delivery_config" ADD CONSTRAINT "cms_collection_delivery_config_changed_credential_tenant_fk" FOREIGN KEY ("changed_by_credential_id","workspace_id","project_id","environment_id") REFERENCES "public"."api_credential"("id","workspace_id","project_id","environment_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cms_collection_field" ADD CONSTRAINT "cms_collection_field_created_by_credential_id_api_credential_id_fk" FOREIGN KEY ("created_by_credential_id") REFERENCES "public"."api_credential"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cms_collection_field" ADD CONSTRAINT "cms_collection_field_changed_by_credential_id_api_credential_id_fk" FOREIGN KEY ("changed_by_credential_id") REFERENCES "public"."api_credential"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cms_collection_field" ADD CONSTRAINT "cms_collection_field_removed_by_credential_id_api_credential_id_fk" FOREIGN KEY ("removed_by_credential_id") REFERENCES "public"."api_credential"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cms_collection_field" ADD CONSTRAINT "cms_field_created_credential_tenant_fk" FOREIGN KEY ("created_by_credential_id","workspace_id","project_id","environment_id") REFERENCES "public"."api_credential"("id","workspace_id","project_id","environment_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cms_collection_field" ADD CONSTRAINT "cms_field_changed_credential_tenant_fk" FOREIGN KEY ("changed_by_credential_id","workspace_id","project_id","environment_id") REFERENCES "public"."api_credential"("id","workspace_id","project_id","environment_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cms_collection_field" ADD CONSTRAINT "cms_field_removed_credential_tenant_fk" FOREIGN KEY ("removed_by_credential_id","workspace_id","project_id","environment_id") REFERENCES "public"."api_credential"("id","workspace_id","project_id","environment_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cms_collection_schema_head" ADD CONSTRAINT "cms_collection_schema_head_changed_by_credential_id_api_credential_id_fk" FOREIGN KEY ("changed_by_credential_id") REFERENCES "public"."api_credential"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cms_collection_schema_head" ADD CONSTRAINT "cms_head_changed_credential_tenant_fk" FOREIGN KEY ("changed_by_credential_id","workspace_id","project_id","environment_id") REFERENCES "public"."api_credential"("id","workspace_id","project_id","environment_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cms_collection_schema_head" ADD CONSTRAINT "cms_head_current_revision_structure_fk" FOREIGN KEY ("current_published_revision_id","collection_id","environment_id","project_id","workspace_id","current_published_structure_hash") REFERENCES "public"."cms_schema_revision"("id","collection_id","environment_id","project_id","workspace_id","structure_hash") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cms_entry" ADD CONSTRAINT "cms_entry_created_by_credential_id_api_credential_id_fk" FOREIGN KEY ("created_by_credential_id") REFERENCES "public"."api_credential"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cms_entry" ADD CONSTRAINT "cms_entry_changed_by_credential_id_api_credential_id_fk" FOREIGN KEY ("changed_by_credential_id") REFERENCES "public"."api_credential"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cms_entry" ADD CONSTRAINT "cms_entry_created_credential_tenant_fk" FOREIGN KEY ("created_by_credential_id","workspace_id","project_id","environment_id") REFERENCES "public"."api_credential"("id","workspace_id","project_id","environment_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cms_entry" ADD CONSTRAINT "cms_entry_changed_credential_tenant_fk" FOREIGN KEY ("changed_by_credential_id","workspace_id","project_id","environment_id") REFERENCES "public"."api_credential"("id","workspace_id","project_id","environment_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cms_entry_draft_command" ADD CONSTRAINT "cms_entry_draft_command_completed_by_credential_id_api_credential_id_fk" FOREIGN KEY ("completed_by_credential_id") REFERENCES "public"."api_credential"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cms_entry_draft_command" ADD CONSTRAINT "cms_entry_draft_command_completed_credential_tenant_fk" FOREIGN KEY ("completed_by_credential_id","workspace_id","project_id","environment_id") REFERENCES "public"."api_credential"("id","workspace_id","project_id","environment_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cms_entry_locale_draft" ADD CONSTRAINT "cms_entry_locale_draft_changed_by_credential_id_api_credential_id_fk" FOREIGN KEY ("changed_by_credential_id") REFERENCES "public"."api_credential"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cms_entry_locale_draft" ADD CONSTRAINT "cms_entry_locale_draft_changed_credential_tenant_fk" FOREIGN KEY ("changed_by_credential_id","workspace_id","project_id","environment_id") REFERENCES "public"."api_credential"("id","workspace_id","project_id","environment_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cms_entry_locale_publication" ADD CONSTRAINT "cms_entry_locale_publication_published_by_credential_id_api_credential_id_fk" FOREIGN KEY ("published_by_credential_id") REFERENCES "public"."api_credential"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cms_entry_locale_publication" ADD CONSTRAINT "cms_entry_pub_published_credential_tenant_fk" FOREIGN KEY ("published_by_credential_id","workspace_id","project_id","environment_id") REFERENCES "public"."api_credential"("id","workspace_id","project_id","environment_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cms_entry_locale_publication_head" ADD CONSTRAINT "cms_entry_locale_publication_head_changed_by_credential_id_api_credential_id_fk" FOREIGN KEY ("changed_by_credential_id") REFERENCES "public"."api_credential"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cms_entry_locale_publication_head" ADD CONSTRAINT "cms_entry_pub_head_changed_credential_tenant_fk" FOREIGN KEY ("changed_by_credential_id","workspace_id","project_id","environment_id") REFERENCES "public"."api_credential"("id","workspace_id","project_id","environment_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cms_entry_locale_revision" ADD CONSTRAINT "cms_entry_locale_revision_authored_by_credential_id_api_credential_id_fk" FOREIGN KEY ("authored_by_credential_id") REFERENCES "public"."api_credential"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cms_entry_locale_revision" ADD CONSTRAINT "cms_entry_locale_revision_author_credential_tenant_fk" FOREIGN KEY ("authored_by_credential_id","workspace_id","project_id","environment_id") REFERENCES "public"."api_credential"("id","workspace_id","project_id","environment_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cms_entry_publication_command" ADD CONSTRAINT "cms_entry_publication_command_completed_by_credential_id_api_credential_id_fk" FOREIGN KEY ("completed_by_credential_id") REFERENCES "public"."api_credential"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cms_entry_publication_command" ADD CONSTRAINT "cms_entry_pub_command_completed_credential_tenant_fk" FOREIGN KEY ("completed_by_credential_id","workspace_id","project_id","environment_id") REFERENCES "public"."api_credential"("id","workspace_id","project_id","environment_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cms_entry_shared_draft" ADD CONSTRAINT "cms_entry_shared_draft_changed_by_credential_id_api_credential_id_fk" FOREIGN KEY ("changed_by_credential_id") REFERENCES "public"."api_credential"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cms_entry_shared_draft" ADD CONSTRAINT "cms_entry_shared_draft_changed_credential_tenant_fk" FOREIGN KEY ("changed_by_credential_id","workspace_id","project_id","environment_id") REFERENCES "public"."api_credential"("id","workspace_id","project_id","environment_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cms_entry_shared_revision" ADD CONSTRAINT "cms_entry_shared_revision_authored_by_credential_id_api_credential_id_fk" FOREIGN KEY ("authored_by_credential_id") REFERENCES "public"."api_credential"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cms_entry_shared_revision" ADD CONSTRAINT "cms_entry_shared_revision_author_credential_tenant_fk" FOREIGN KEY ("authored_by_credential_id","workspace_id","project_id","environment_id") REFERENCES "public"."api_credential"("id","workspace_id","project_id","environment_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cms_schema_revision" ADD CONSTRAINT "cms_schema_revision_published_by_credential_id_api_credential_id_fk" FOREIGN KEY ("published_by_credential_id") REFERENCES "public"."api_credential"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cms_schema_revision" ADD CONSTRAINT "cms_revision_published_credential_tenant_fk" FOREIGN KEY ("published_by_credential_id","workspace_id","project_id","environment_id") REFERENCES "public"."api_credential"("id","workspace_id","project_id","environment_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "cms_collection_created_by_credential_idx" ON "cms_collection" USING btree ("created_by_credential_id") WHERE "cms_collection"."created_by_credential_id" is not null;--> statement-breakpoint
CREATE INDEX "cms_collection_changed_by_credential_idx" ON "cms_collection" USING btree ("changed_by_credential_id") WHERE "cms_collection"."changed_by_credential_id" is not null;--> statement-breakpoint
CREATE INDEX "cms_collection_delivery_config_changed_by_credential_idx" ON "cms_collection_delivery_config" USING btree ("changed_by_credential_id") WHERE "cms_collection_delivery_config"."changed_by_credential_id" is not null;--> statement-breakpoint
CREATE INDEX "cms_field_created_by_credential_idx" ON "cms_collection_field" USING btree ("created_by_credential_id") WHERE "cms_collection_field"."created_by_credential_id" is not null;--> statement-breakpoint
CREATE INDEX "cms_field_changed_by_credential_idx" ON "cms_collection_field" USING btree ("changed_by_credential_id") WHERE "cms_collection_field"."changed_by_credential_id" is not null;--> statement-breakpoint
CREATE INDEX "cms_field_removed_by_credential_idx" ON "cms_collection_field" USING btree ("removed_by_credential_id") WHERE "cms_collection_field"."removed_by_credential_id" is not null;--> statement-breakpoint
CREATE INDEX "cms_head_changed_by_credential_idx" ON "cms_collection_schema_head" USING btree ("changed_by_credential_id") WHERE "cms_collection_schema_head"."changed_by_credential_id" is not null;--> statement-breakpoint
CREATE INDEX "cms_entry_created_by_credential_idx" ON "cms_entry" USING btree ("created_by_credential_id") WHERE "cms_entry"."created_by_credential_id" is not null;--> statement-breakpoint
CREATE INDEX "cms_entry_changed_by_credential_idx" ON "cms_entry" USING btree ("changed_by_credential_id") WHERE "cms_entry"."changed_by_credential_id" is not null;--> statement-breakpoint
CREATE INDEX "cms_entry_draft_command_completed_by_credential_idx" ON "cms_entry_draft_command" USING btree ("completed_by_credential_id") WHERE "cms_entry_draft_command"."completed_by_credential_id" is not null;--> statement-breakpoint
CREATE INDEX "cms_entry_locale_draft_changed_by_credential_idx" ON "cms_entry_locale_draft" USING btree ("changed_by_credential_id") WHERE "cms_entry_locale_draft"."changed_by_credential_id" is not null;--> statement-breakpoint
CREATE INDEX "cms_entry_pub_publisher_credential_idx" ON "cms_entry_locale_publication" USING btree ("published_by_credential_id") WHERE "cms_entry_locale_publication"."published_by_credential_id" is not null;--> statement-breakpoint
CREATE INDEX "cms_entry_pub_head_changed_by_credential_idx" ON "cms_entry_locale_publication_head" USING btree ("changed_by_credential_id") WHERE "cms_entry_locale_publication_head"."changed_by_credential_id" is not null;--> statement-breakpoint
CREATE INDEX "cms_entry_locale_revision_author_credential_idx" ON "cms_entry_locale_revision" USING btree ("authored_by_credential_id") WHERE "cms_entry_locale_revision"."authored_by_credential_id" is not null;--> statement-breakpoint
CREATE INDEX "cms_entry_pub_command_completed_by_credential_idx" ON "cms_entry_publication_command" USING btree ("completed_by_credential_id") WHERE "cms_entry_publication_command"."completed_by_credential_id" is not null;--> statement-breakpoint
CREATE INDEX "cms_entry_shared_draft_changed_by_credential_idx" ON "cms_entry_shared_draft" USING btree ("changed_by_credential_id") WHERE "cms_entry_shared_draft"."changed_by_credential_id" is not null;--> statement-breakpoint
CREATE INDEX "cms_entry_shared_revision_author_credential_idx" ON "cms_entry_shared_revision" USING btree ("authored_by_credential_id") WHERE "cms_entry_shared_revision"."authored_by_credential_id" is not null;--> statement-breakpoint
CREATE INDEX "cms_revision_published_by_credential_idx" ON "cms_schema_revision" USING btree ("published_by_credential_id") WHERE "cms_schema_revision"."published_by_credential_id" is not null;--> statement-breakpoint
ALTER TABLE "cms_collection" ADD CONSTRAINT "cms_collection_environment_source_key_unique" UNIQUE("environment_id","source_key");--> statement-breakpoint
ALTER TABLE "cms_collection_field" ADD CONSTRAINT "cms_field_collection_source_key_unique" UNIQUE("collection_id","source_key");--> statement-breakpoint
ALTER TABLE "cms_collection" ADD CONSTRAINT "cms_collection_created_actor_exactly_one" CHECK (num_nonnulls("cms_collection"."created_by_user_id", "cms_collection"."created_by_credential_id") = 1);--> statement-breakpoint
ALTER TABLE "cms_collection" ADD CONSTRAINT "cms_collection_changed_actor_exactly_one" CHECK (num_nonnulls("cms_collection"."changed_by_user_id", "cms_collection"."changed_by_credential_id") = 1);--> statement-breakpoint
ALTER TABLE "cms_collection" ADD CONSTRAINT "cms_collection_source_key_valid" CHECK ("cms_collection"."source_key" ~ '^[a-z][a-z0-9_-]{0,62}$' and "cms_collection"."source_key" !~ '--|__' and right("cms_collection"."source_key", 1) not in ('-', '_') and "cms_collection"."source_key" not in ('id', 'entry_id', 'collection_id', 'locale', 'schema_revision', 'publication_id', 'publication_sequence', 'created_at', 'updated_at', 'published_at', '_meta', '__proto__', 'prototype', 'constructor'));--> statement-breakpoint
ALTER TABLE "cms_collection_delivery_config" ADD CONSTRAINT "cms_collection_delivery_config_actor_exactly_one" CHECK (num_nonnulls("cms_collection_delivery_config"."changed_by_user_id", "cms_collection_delivery_config"."changed_by_credential_id") = 1);--> statement-breakpoint
ALTER TABLE "cms_collection_field" ADD CONSTRAINT "cms_field_created_actor_exactly_one" CHECK (num_nonnulls("cms_collection_field"."created_by_user_id", "cms_collection_field"."created_by_credential_id") = 1);--> statement-breakpoint
ALTER TABLE "cms_collection_field" ADD CONSTRAINT "cms_field_changed_actor_exactly_one" CHECK (num_nonnulls("cms_collection_field"."changed_by_user_id", "cms_collection_field"."changed_by_credential_id") = 1);--> statement-breakpoint
ALTER TABLE "cms_collection_field" ADD CONSTRAINT "cms_field_source_key_valid" CHECK ("cms_collection_field"."source_key" ~ '^[a-z][a-z0-9_-]{0,62}$' and "cms_collection_field"."source_key" !~ '--|__' and right("cms_collection_field"."source_key", 1) not in ('-', '_') and "cms_collection_field"."source_key" not in ('id', 'entry_id', 'collection_id', 'locale', 'schema_revision', 'publication_id', 'publication_sequence', 'created_at', 'updated_at', 'published_at', '_meta', '__proto__', 'prototype', 'constructor'));--> statement-breakpoint
ALTER TABLE "cms_collection_field" ADD CONSTRAINT "cms_field_lifecycle_consistent" CHECK (("cms_collection_field"."removed_at" is null and num_nonnulls("cms_collection_field"."removed_by_user_id", "cms_collection_field"."removed_by_credential_id") = 0 and (("cms_collection_field"."node_role" = 'list_item' and "cms_collection_field"."position" = 0) or ("cms_collection_field"."node_role" <> 'list_item' and "cms_collection_field"."position" between 0 and 99))) or ("cms_collection_field"."removed_at" is not null and num_nonnulls("cms_collection_field"."removed_by_user_id", "cms_collection_field"."removed_by_credential_id") = 1 and "cms_collection_field"."position" is null));--> statement-breakpoint
ALTER TABLE "cms_collection_schema_head" ADD CONSTRAINT "cms_head_changed_actor_exactly_one" CHECK (num_nonnulls("cms_collection_schema_head"."changed_by_user_id", "cms_collection_schema_head"."changed_by_credential_id") = 1);--> statement-breakpoint
ALTER TABLE "cms_collection_schema_head" ADD CONSTRAINT "cms_head_publication_consistent" CHECK (("cms_collection_schema_head"."draft_base_revision_id" is null and "cms_collection_schema_head"."current_published_revision_id" is null and "cms_collection_schema_head"."current_published_sequence" = 0 and "cms_collection_schema_head"."current_published_structure_hash" is null) or ("cms_collection_schema_head"."draft_base_revision_id" is not null and "cms_collection_schema_head"."current_published_revision_id" is not null and "cms_collection_schema_head"."current_published_sequence" > 0 and "cms_collection_schema_head"."current_published_structure_hash" ~ '^[0-9a-f]{64}$'));--> statement-breakpoint
ALTER TABLE "cms_entry" ADD CONSTRAINT "cms_entry_created_actor_exactly_one" CHECK (num_nonnulls("cms_entry"."created_by_user_id", "cms_entry"."created_by_credential_id") = 1);--> statement-breakpoint
ALTER TABLE "cms_entry" ADD CONSTRAINT "cms_entry_changed_actor_exactly_one" CHECK (num_nonnulls("cms_entry"."changed_by_user_id", "cms_entry"."changed_by_credential_id") = 1);--> statement-breakpoint
ALTER TABLE "cms_entry_draft_command" ADD CONSTRAINT "cms_entry_draft_command_actor_exactly_one" CHECK (num_nonnulls("cms_entry_draft_command"."completed_by_user_id", "cms_entry_draft_command"."completed_by_credential_id") = 1);--> statement-breakpoint
ALTER TABLE "cms_entry_locale_draft" ADD CONSTRAINT "cms_entry_locale_draft_actor_exactly_one" CHECK (num_nonnulls("cms_entry_locale_draft"."changed_by_user_id", "cms_entry_locale_draft"."changed_by_credential_id") = 1);--> statement-breakpoint
ALTER TABLE "cms_entry_locale_publication" ADD CONSTRAINT "cms_entry_pub_actor_exactly_one" CHECK (num_nonnulls("cms_entry_locale_publication"."published_by_user_id", "cms_entry_locale_publication"."published_by_credential_id") = 1);--> statement-breakpoint
ALTER TABLE "cms_entry_locale_publication_head" ADD CONSTRAINT "cms_entry_pub_head_actor_exactly_one" CHECK (num_nonnulls("cms_entry_locale_publication_head"."changed_by_user_id", "cms_entry_locale_publication_head"."changed_by_credential_id") = 1);--> statement-breakpoint
ALTER TABLE "cms_entry_locale_revision" ADD CONSTRAINT "cms_entry_locale_revision_author_exactly_one" CHECK (num_nonnulls("cms_entry_locale_revision"."authored_by_user_id", "cms_entry_locale_revision"."authored_by_credential_id") = 1);--> statement-breakpoint
ALTER TABLE "cms_entry_publication_command" ADD CONSTRAINT "cms_entry_pub_command_actor_exactly_one" CHECK (num_nonnulls("cms_entry_publication_command"."completed_by_user_id", "cms_entry_publication_command"."completed_by_credential_id") = 1);--> statement-breakpoint
ALTER TABLE "cms_entry_shared_draft" ADD CONSTRAINT "cms_entry_shared_draft_actor_exactly_one" CHECK (num_nonnulls("cms_entry_shared_draft"."changed_by_user_id", "cms_entry_shared_draft"."changed_by_credential_id") = 1);--> statement-breakpoint
ALTER TABLE "cms_entry_shared_revision" ADD CONSTRAINT "cms_entry_shared_revision_author_exactly_one" CHECK (num_nonnulls("cms_entry_shared_revision"."authored_by_user_id", "cms_entry_shared_revision"."authored_by_credential_id") = 1);--> statement-breakpoint
ALTER TABLE "cms_schema_revision" ADD CONSTRAINT "cms_revision_published_actor_exactly_one" CHECK (num_nonnulls("cms_schema_revision"."published_by_user_id", "cms_schema_revision"."published_by_credential_id") = 1);--> statement-breakpoint
ALTER TABLE "cms_schema_revision" ADD CONSTRAINT "cms_revision_structure_hash_valid" CHECK ("cms_schema_revision"."structure_hash" ~ '^[0-9a-f]{64}$');