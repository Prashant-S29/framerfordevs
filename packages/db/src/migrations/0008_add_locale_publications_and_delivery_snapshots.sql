CREATE TABLE "cms_entry_locale_delivery_snapshot" (
	"publication_id" uuid PRIMARY KEY NOT NULL,
	"workspace_id" uuid NOT NULL,
	"project_id" uuid NOT NULL,
	"environment_id" uuid NOT NULL,
	"collection_id" uuid NOT NULL,
	"entry_id" uuid NOT NULL,
	"locale_id" uuid NOT NULL,
	"format_version" integer DEFAULT 1 NOT NULL,
	"document" jsonb NOT NULL,
	"document_hash" char(64) NOT NULL,
	"reference_manifest" jsonb NOT NULL,
	"reference_manifest_hash" char(64) NOT NULL,
	"canonical_document_bytes" integer NOT NULL,
	"canonical_reference_manifest_bytes" integer NOT NULL,
	"canonical_combined_bytes" integer NOT NULL,
	CONSTRAINT "cms_entry_snapshot_format_valid" CHECK ("cms_entry_locale_delivery_snapshot"."format_version" = 1),
	CONSTRAINT "cms_entry_snapshot_document_valid" CHECK (jsonb_typeof("cms_entry_locale_delivery_snapshot"."document") = 'object' and octet_length("cms_entry_locale_delivery_snapshot"."document"::text) <= 1048576),
	CONSTRAINT "cms_entry_snapshot_document_hash_valid" CHECK ("cms_entry_locale_delivery_snapshot"."document_hash" ~ '^[0-9a-f]{64}$'),
	CONSTRAINT "cms_entry_snapshot_manifest_valid" CHECK (jsonb_typeof("cms_entry_locale_delivery_snapshot"."reference_manifest") = 'array' and jsonb_array_length("cms_entry_locale_delivery_snapshot"."reference_manifest") <= 20000 and octet_length("cms_entry_locale_delivery_snapshot"."reference_manifest"::text) <= 1048576),
	CONSTRAINT "cms_entry_snapshot_manifest_hash_valid" CHECK ("cms_entry_locale_delivery_snapshot"."reference_manifest_hash" ~ '^[0-9a-f]{64}$'),
	CONSTRAINT "cms_entry_snapshot_document_bytes_valid" CHECK ("cms_entry_locale_delivery_snapshot"."canonical_document_bytes" between 2 and 1048576),
	CONSTRAINT "cms_entry_snapshot_manifest_bytes_valid" CHECK ("cms_entry_locale_delivery_snapshot"."canonical_reference_manifest_bytes" between 2 and 1048576),
	CONSTRAINT "cms_entry_snapshot_combined_bytes_valid" CHECK ("cms_entry_locale_delivery_snapshot"."canonical_combined_bytes" = "cms_entry_locale_delivery_snapshot"."canonical_document_bytes" + "cms_entry_locale_delivery_snapshot"."canonical_reference_manifest_bytes" and "cms_entry_locale_delivery_snapshot"."canonical_combined_bytes" <= 1048576)
);
--> statement-breakpoint
CREATE TABLE "cms_entry_locale_publication" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"project_id" uuid NOT NULL,
	"environment_id" uuid NOT NULL,
	"collection_id" uuid NOT NULL,
	"entry_id" uuid NOT NULL,
	"locale_id" uuid NOT NULL,
	"publication_sequence" integer NOT NULL,
	"event_sequence" integer NOT NULL,
	"previous_publication_id" uuid,
	"schema_revision_id" uuid NOT NULL,
	"contract_hash" char(64) NOT NULL,
	"shared_source_version" integer NOT NULL,
	"shared_source_revision_id" uuid,
	"locale_source_version" integer NOT NULL,
	"locale_source_revision_id" uuid,
	"content_hash" char(64) NOT NULL,
	"authority_hash" char(64) NOT NULL,
	"changed_field_ids" uuid[] NOT NULL,
	"command_id" uuid NOT NULL,
	"command_fingerprint" char(64) NOT NULL,
	"published_by_user_id" text NOT NULL,
	"published_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "cms_entry_pub_entry_locale_sequence_unique" UNIQUE("entry_id","locale_id","publication_sequence"),
	CONSTRAINT "cms_entry_pub_entry_event_sequence_unique" UNIQUE("entry_id","event_sequence"),
	CONSTRAINT "cms_entry_pub_entry_command_unique" UNIQUE("entry_id","command_id"),
	CONSTRAINT "cms_entry_pub_id_scope_unique" UNIQUE("id","entry_id","locale_id","collection_id","environment_id","project_id","workspace_id"),
	CONSTRAINT "cms_entry_pub_id_scope_sequence_unique" UNIQUE("id","entry_id","locale_id","collection_id","environment_id","project_id","workspace_id","publication_sequence"),
	CONSTRAINT "cms_entry_pub_id_event_scope_unique" UNIQUE("id","entry_id","locale_id","environment_id","project_id","workspace_id"),
	CONSTRAINT "cms_entry_pub_sequence_positive" CHECK ("cms_entry_locale_publication"."publication_sequence" > 0),
	CONSTRAINT "cms_entry_pub_event_sequence_positive" CHECK ("cms_entry_locale_publication"."event_sequence" > 0),
	CONSTRAINT "cms_entry_pub_previous_consistent" CHECK (("cms_entry_locale_publication"."publication_sequence" = 1 and "cms_entry_locale_publication"."previous_publication_id" is null) or ("cms_entry_locale_publication"."publication_sequence" > 1 and "cms_entry_locale_publication"."previous_publication_id" is not null)),
	CONSTRAINT "cms_entry_pub_shared_source_consistent" CHECK (("cms_entry_locale_publication"."shared_source_version" = 0 and "cms_entry_locale_publication"."shared_source_revision_id" is null) or ("cms_entry_locale_publication"."shared_source_version" > 0 and "cms_entry_locale_publication"."shared_source_revision_id" is not null)),
	CONSTRAINT "cms_entry_pub_locale_source_consistent" CHECK (("cms_entry_locale_publication"."locale_source_version" = 0 and "cms_entry_locale_publication"."locale_source_revision_id" is null) or ("cms_entry_locale_publication"."locale_source_version" > 0 and "cms_entry_locale_publication"."locale_source_revision_id" is not null)),
	CONSTRAINT "cms_entry_pub_contract_hash_valid" CHECK ("cms_entry_locale_publication"."contract_hash" ~ '^[0-9a-f]{64}$'),
	CONSTRAINT "cms_entry_pub_content_hash_valid" CHECK ("cms_entry_locale_publication"."content_hash" ~ '^[0-9a-f]{64}$'),
	CONSTRAINT "cms_entry_pub_authority_hash_valid" CHECK ("cms_entry_locale_publication"."authority_hash" ~ '^[0-9a-f]{64}$'),
	CONSTRAINT "cms_entry_pub_changed_fields_valid" CHECK (coalesce(array_ndims("cms_entry_locale_publication"."changed_field_ids"), 1) = 1 and cardinality("cms_entry_locale_publication"."changed_field_ids") between 0 and 100 and array_position("cms_entry_locale_publication"."changed_field_ids", null) is null),
	CONSTRAINT "cms_entry_pub_command_fingerprint_valid" CHECK ("cms_entry_locale_publication"."command_fingerprint" ~ '^[0-9a-f]{64}$')
);
--> statement-breakpoint
CREATE TABLE "cms_entry_locale_publication_head" (
	"entry_id" uuid NOT NULL,
	"locale_id" uuid NOT NULL,
	"workspace_id" uuid NOT NULL,
	"project_id" uuid NOT NULL,
	"environment_id" uuid NOT NULL,
	"collection_id" uuid NOT NULL,
	"version" integer NOT NULL,
	"latest_publication_sequence" integer NOT NULL,
	"current_publication_id" uuid,
	"changed_by_user_id" text NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "cms_entry_pub_head_entry_locale_pk" PRIMARY KEY("entry_id","locale_id"),
	CONSTRAINT "cms_entry_pub_head_version_positive" CHECK ("cms_entry_locale_publication_head"."version" > 0),
	CONSTRAINT "cms_entry_pub_head_sequence_positive" CHECK ("cms_entry_locale_publication_head"."latest_publication_sequence" > 0)
);
--> statement-breakpoint
CREATE TABLE "cms_entry_locale_publication_reference" (
	"source_publication_id" uuid NOT NULL,
	"source_field_id" uuid NOT NULL,
	"target_publication_id" uuid NOT NULL,
	"workspace_id" uuid NOT NULL,
	"project_id" uuid NOT NULL,
	"environment_id" uuid NOT NULL,
	"source_collection_id" uuid NOT NULL,
	"source_entry_id" uuid NOT NULL,
	"locale_id" uuid NOT NULL,
	"target_collection_id" uuid NOT NULL,
	"target_entry_id" uuid NOT NULL,
	CONSTRAINT "cms_entry_pub_ref_source_field_target_pk" PRIMARY KEY("source_publication_id","source_field_id","target_publication_id")
);
--> statement-breakpoint
CREATE TABLE "cms_entry_publication_command" (
	"entry_id" uuid NOT NULL,
	"command_id" uuid NOT NULL,
	"workspace_id" uuid NOT NULL,
	"project_id" uuid NOT NULL,
	"environment_id" uuid NOT NULL,
	"collection_id" uuid NOT NULL,
	"locale_id" uuid NOT NULL,
	"operation" varchar(16) NOT NULL,
	"command_fingerprint" char(64) NOT NULL,
	"result_kind" varchar(16) NOT NULL,
	"result_head_version" integer NOT NULL,
	"result_current_publication_id" uuid,
	"result_latest_publication_sequence" integer NOT NULL,
	"result_event_sequence" integer,
	"completed_by_user_id" text NOT NULL,
	"completed_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "cms_entry_pub_command_entry_command_pk" PRIMARY KEY("entry_id","command_id"),
	CONSTRAINT "cms_entry_pub_command_operation_valid" CHECK ("cms_entry_publication_command"."operation" in ('publish', 'unpublish')),
	CONSTRAINT "cms_entry_pub_command_fingerprint_valid" CHECK ("cms_entry_publication_command"."command_fingerprint" ~ '^[0-9a-f]{64}$'),
	CONSTRAINT "cms_entry_pub_command_result_kind_valid" CHECK ("cms_entry_publication_command"."result_kind" in ('changed', 'no_op')),
	CONSTRAINT "cms_entry_pub_command_head_result_valid" CHECK (("cms_entry_publication_command"."result_head_version" = 0 and "cms_entry_publication_command"."result_latest_publication_sequence" = 0 and "cms_entry_publication_command"."result_current_publication_id" is null) or ("cms_entry_publication_command"."result_head_version" > 0 and "cms_entry_publication_command"."result_latest_publication_sequence" > 0)),
	CONSTRAINT "cms_entry_pub_command_operation_result_valid" CHECK (("cms_entry_publication_command"."operation" = 'publish' and "cms_entry_publication_command"."result_current_publication_id" is not null) or ("cms_entry_publication_command"."operation" = 'unpublish' and "cms_entry_publication_command"."result_current_publication_id" is null)),
	CONSTRAINT "cms_entry_pub_command_event_result_valid" CHECK (("cms_entry_publication_command"."result_kind" = 'changed' and "cms_entry_publication_command"."result_event_sequence" > 0) or ("cms_entry_publication_command"."result_kind" = 'no_op' and "cms_entry_publication_command"."result_event_sequence" is null))
);
--> statement-breakpoint
ALTER TABLE "outbox_event" DROP CONSTRAINT "outbox_event_schema_publication_valid";--> statement-breakpoint
ALTER TABLE "cms_entry" ADD COLUMN "publication_event_sequence" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "outbox_event" ADD COLUMN "locale_id" uuid;--> statement-breakpoint
ALTER TABLE "outbox_event" ADD COLUMN "entry_publication_id" uuid;--> statement-breakpoint
ALTER TABLE "cms_entry_locale_delivery_snapshot" ADD CONSTRAINT "cms_entry_snapshot_publication_fk" FOREIGN KEY ("publication_id","entry_id","locale_id","collection_id","environment_id","project_id","workspace_id") REFERENCES "public"."cms_entry_locale_publication"("id","entry_id","locale_id","collection_id","environment_id","project_id","workspace_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cms_entry_locale_publication" ADD CONSTRAINT "cms_entry_locale_publication_published_by_user_id_user_id_fk" FOREIGN KEY ("published_by_user_id") REFERENCES "public"."user"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cms_entry_locale_publication" ADD CONSTRAINT "cms_entry_pub_entry_tenant_fk" FOREIGN KEY ("entry_id","collection_id","environment_id","project_id","workspace_id") REFERENCES "public"."cms_entry"("id","collection_id","environment_id","project_id","workspace_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cms_entry_locale_publication" ADD CONSTRAINT "cms_entry_pub_locale_tenant_fk" FOREIGN KEY ("locale_id","project_id","workspace_id") REFERENCES "public"."project_locale"("id","project_id","workspace_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cms_entry_locale_publication" ADD CONSTRAINT "cms_entry_pub_schema_tenant_fk" FOREIGN KEY ("schema_revision_id","collection_id","environment_id","project_id","workspace_id") REFERENCES "public"."cms_schema_revision"("id","collection_id","environment_id","project_id","workspace_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cms_entry_locale_publication" ADD CONSTRAINT "cms_entry_pub_shared_source_fk" FOREIGN KEY ("shared_source_revision_id","entry_id","collection_id","environment_id","project_id","workspace_id","shared_source_version") REFERENCES "public"."cms_entry_shared_revision"("id","entry_id","collection_id","environment_id","project_id","workspace_id","sequence") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cms_entry_locale_publication" ADD CONSTRAINT "cms_entry_pub_locale_source_fk" FOREIGN KEY ("locale_source_revision_id","entry_id","locale_id","collection_id","environment_id","project_id","workspace_id","locale_source_version") REFERENCES "public"."cms_entry_locale_revision"("id","entry_id","locale_id","collection_id","environment_id","project_id","workspace_id","sequence") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cms_entry_locale_publication" ADD CONSTRAINT "cms_entry_pub_previous_fk" FOREIGN KEY ("previous_publication_id","entry_id","locale_id","collection_id","environment_id","project_id","workspace_id") REFERENCES "public"."cms_entry_locale_publication"("id","entry_id","locale_id","collection_id","environment_id","project_id","workspace_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cms_entry_locale_publication_head" ADD CONSTRAINT "cms_entry_locale_publication_head_changed_by_user_id_user_id_fk" FOREIGN KEY ("changed_by_user_id") REFERENCES "public"."user"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cms_entry_locale_publication_head" ADD CONSTRAINT "cms_entry_pub_head_entry_tenant_fk" FOREIGN KEY ("entry_id","collection_id","environment_id","project_id","workspace_id") REFERENCES "public"."cms_entry"("id","collection_id","environment_id","project_id","workspace_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cms_entry_locale_publication_head" ADD CONSTRAINT "cms_entry_pub_head_locale_tenant_fk" FOREIGN KEY ("locale_id","project_id","workspace_id") REFERENCES "public"."project_locale"("id","project_id","workspace_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cms_entry_locale_publication_head" ADD CONSTRAINT "cms_entry_pub_head_current_publication_fk" FOREIGN KEY ("current_publication_id","entry_id","locale_id","collection_id","environment_id","project_id","workspace_id","latest_publication_sequence") REFERENCES "public"."cms_entry_locale_publication"("id","entry_id","locale_id","collection_id","environment_id","project_id","workspace_id","publication_sequence") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cms_entry_locale_publication_reference" ADD CONSTRAINT "cms_entry_pub_ref_source_publication_fk" FOREIGN KEY ("source_publication_id","source_entry_id","locale_id","source_collection_id","environment_id","project_id","workspace_id") REFERENCES "public"."cms_entry_locale_publication"("id","entry_id","locale_id","collection_id","environment_id","project_id","workspace_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cms_entry_locale_publication_reference" ADD CONSTRAINT "cms_entry_pub_ref_source_field_fk" FOREIGN KEY ("source_field_id","source_collection_id","environment_id","project_id","workspace_id") REFERENCES "public"."cms_collection_field"("id","collection_id","environment_id","project_id","workspace_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cms_entry_locale_publication_reference" ADD CONSTRAINT "cms_entry_pub_ref_target_publication_fk" FOREIGN KEY ("target_publication_id","target_entry_id","locale_id","target_collection_id","environment_id","project_id","workspace_id") REFERENCES "public"."cms_entry_locale_publication"("id","entry_id","locale_id","collection_id","environment_id","project_id","workspace_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cms_entry_publication_command" ADD CONSTRAINT "cms_entry_publication_command_completed_by_user_id_user_id_fk" FOREIGN KEY ("completed_by_user_id") REFERENCES "public"."user"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cms_entry_publication_command" ADD CONSTRAINT "cms_entry_pub_command_entry_tenant_fk" FOREIGN KEY ("entry_id","collection_id","environment_id","project_id","workspace_id") REFERENCES "public"."cms_entry"("id","collection_id","environment_id","project_id","workspace_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cms_entry_publication_command" ADD CONSTRAINT "cms_entry_pub_command_locale_tenant_fk" FOREIGN KEY ("locale_id","project_id","workspace_id") REFERENCES "public"."project_locale"("id","project_id","workspace_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cms_entry_publication_command" ADD CONSTRAINT "cms_entry_pub_command_result_publication_fk" FOREIGN KEY ("result_current_publication_id","entry_id","locale_id","collection_id","environment_id","project_id","workspace_id","result_latest_publication_sequence") REFERENCES "public"."cms_entry_locale_publication"("id","entry_id","locale_id","collection_id","environment_id","project_id","workspace_id","publication_sequence") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "cms_entry_pub_history_idx" ON "cms_entry_locale_publication" USING btree ("entry_id","locale_id","publication_sequence" DESC NULLS LAST,"id" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "cms_entry_pub_schema_idx" ON "cms_entry_locale_publication" USING btree ("schema_revision_id");--> statement-breakpoint
CREATE INDEX "cms_entry_pub_shared_source_idx" ON "cms_entry_locale_publication" USING btree ("shared_source_revision_id") WHERE "cms_entry_locale_publication"."shared_source_revision_id" is not null;--> statement-breakpoint
CREATE INDEX "cms_entry_pub_locale_source_idx" ON "cms_entry_locale_publication" USING btree ("locale_source_revision_id") WHERE "cms_entry_locale_publication"."locale_source_revision_id" is not null;--> statement-breakpoint
CREATE INDEX "cms_entry_pub_previous_idx" ON "cms_entry_locale_publication" USING btree ("previous_publication_id") WHERE "cms_entry_locale_publication"."previous_publication_id" is not null;--> statement-breakpoint
CREATE INDEX "cms_entry_pub_publisher_idx" ON "cms_entry_locale_publication" USING btree ("published_by_user_id");--> statement-breakpoint
CREATE INDEX "cms_entry_pub_head_locale_collection_current_idx" ON "cms_entry_locale_publication_head" USING btree ("locale_id","collection_id","entry_id") WHERE "cms_entry_locale_publication_head"."current_publication_id" is not null;--> statement-breakpoint
CREATE INDEX "cms_entry_pub_head_current_publication_idx" ON "cms_entry_locale_publication_head" USING btree ("current_publication_id") WHERE "cms_entry_locale_publication_head"."current_publication_id" is not null;--> statement-breakpoint
CREATE INDEX "cms_entry_pub_head_changed_by_user_idx" ON "cms_entry_locale_publication_head" USING btree ("changed_by_user_id");--> statement-breakpoint
CREATE INDEX "cms_entry_pub_ref_target_publication_idx" ON "cms_entry_locale_publication_reference" USING btree ("target_publication_id");--> statement-breakpoint
CREATE INDEX "cms_entry_pub_ref_target_entry_locale_idx" ON "cms_entry_locale_publication_reference" USING btree ("target_entry_id","locale_id");--> statement-breakpoint
CREATE INDEX "cms_entry_pub_command_locale_idx" ON "cms_entry_publication_command" USING btree ("locale_id");--> statement-breakpoint
CREATE INDEX "cms_entry_pub_command_completed_by_idx" ON "cms_entry_publication_command" USING btree ("completed_by_user_id");--> statement-breakpoint
ALTER TABLE "outbox_event" ADD CONSTRAINT "outbox_event_locale_tenant_fk" FOREIGN KEY ("locale_id","project_id","workspace_id") REFERENCES "public"."project_locale"("id","project_id","workspace_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "outbox_event" ADD CONSTRAINT "outbox_event_entry_publication_scope_fk" FOREIGN KEY ("entry_publication_id","subject_id","locale_id","environment_id","project_id","workspace_id") REFERENCES "public"."cms_entry_locale_publication"("id","entry_id","locale_id","environment_id","project_id","workspace_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "outbox_event_entry_sequence_unique" ON "outbox_event" USING btree ("subject_id","aggregate_sequence") WHERE "outbox_event"."event_type" in ('cms.entry.published', 'cms.entry.unpublished');--> statement-breakpoint
CREATE INDEX "outbox_event_locale_idx" ON "outbox_event" USING btree ("locale_id") WHERE "outbox_event"."locale_id" is not null;--> statement-breakpoint
CREATE INDEX "outbox_event_entry_publication_idx" ON "outbox_event" USING btree ("entry_publication_id") WHERE "outbox_event"."entry_publication_id" is not null;--> statement-breakpoint
ALTER TABLE "cms_entry" ADD CONSTRAINT "cms_entry_publication_event_sequence_nonnegative" CHECK ("cms_entry"."publication_event_sequence" >= 0);--> statement-breakpoint
ALTER TABLE "outbox_event" ADD CONSTRAINT "outbox_event_publication_scope_paired" CHECK (("outbox_event"."locale_id" is null and "outbox_event"."entry_publication_id" is null) or ("outbox_event"."locale_id" is not null and "outbox_event"."entry_publication_id" is not null));--> statement-breakpoint
ALTER TABLE "outbox_event" ADD CONSTRAINT "outbox_event_entry_publication_valid" CHECK ("outbox_event"."event_type" not in ('cms.entry.published', 'cms.entry.unpublished') or ("outbox_event"."subject_type" = 'cms.entry' and "outbox_event"."schema_revision_id" is not null and "outbox_event"."locale_id" is not null and "outbox_event"."entry_publication_id" is not null));--> statement-breakpoint
ALTER TABLE "outbox_event" ADD CONSTRAINT "outbox_event_schema_publication_valid" CHECK ("outbox_event"."event_type" <> 'cms.schema.published' or ("outbox_event"."subject_type" = 'cms.collection' and "outbox_event"."schema_revision_id" is not null and "outbox_event"."locale_id" is null and "outbox_event"."entry_publication_id" is null));
--> statement-breakpoint
CREATE FUNCTION "cms_reject_immutable_publication_artifact_mutation"()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog
AS $$
BEGIN
  RAISE EXCEPTION
    'immutable CMS publication artifact % cannot be changed by %',
    TG_TABLE_NAME,
    TG_OP
    USING ERRCODE = '55000';

  RETURN NULL;
END;
$$;
--> statement-breakpoint
CREATE TRIGGER "cms_entry_locale_publication_immutable"
BEFORE UPDATE OR DELETE ON "cms_entry_locale_publication"
FOR EACH ROW
EXECUTE FUNCTION "cms_reject_immutable_publication_artifact_mutation"();
--> statement-breakpoint
CREATE TRIGGER "cms_entry_locale_delivery_snapshot_immutable"
BEFORE UPDATE OR DELETE ON "cms_entry_locale_delivery_snapshot"
FOR EACH ROW
EXECUTE FUNCTION "cms_reject_immutable_publication_artifact_mutation"();
--> statement-breakpoint
CREATE TRIGGER "cms_entry_locale_publication_reference_immutable"
BEFORE UPDATE OR DELETE ON "cms_entry_locale_publication_reference"
FOR EACH ROW
EXECUTE FUNCTION "cms_reject_immutable_publication_artifact_mutation"();
--> statement-breakpoint
CREATE TRIGGER "cms_entry_publication_command_immutable"
BEFORE UPDATE OR DELETE ON "cms_entry_publication_command"
FOR EACH ROW
EXECUTE FUNCTION "cms_reject_immutable_publication_artifact_mutation"();
