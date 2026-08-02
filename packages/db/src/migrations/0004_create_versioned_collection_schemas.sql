CREATE TABLE "cms_collection" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"project_id" uuid NOT NULL,
	"environment_id" uuid NOT NULL,
	"api_key" varchar(63) NOT NULL,
	"display_name" varchar(100) NOT NULL,
	"description" varchar(500),
	"version" integer DEFAULT 1 NOT NULL,
	"created_by_user_id" text NOT NULL,
	"changed_by_user_id" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "cms_collection_environment_key_unique" UNIQUE("environment_id","api_key"),
	CONSTRAINT "cms_collection_id_tenant_unique" UNIQUE("id","environment_id","project_id","workspace_id"),
	CONSTRAINT "cms_collection_api_key_valid" CHECK ("cms_collection"."api_key" ~ '^[a-z][a-z0-9_]{0,62}$' and "cms_collection"."api_key" !~ '__' and right("cms_collection"."api_key", 1) <> '_'),
	CONSTRAINT "cms_collection_display_name_valid" CHECK (char_length("cms_collection"."display_name") between 1 and 100 and "cms_collection"."display_name" = btrim("cms_collection"."display_name") and "cms_collection"."display_name" !~ '[[:cntrl:]]'),
	CONSTRAINT "cms_collection_description_valid" CHECK ("cms_collection"."description" is null or (char_length("cms_collection"."description") <= 500 and "cms_collection"."description" = btrim("cms_collection"."description") and "cms_collection"."description" !~ '[[:cntrl:]]')),
	CONSTRAINT "cms_collection_version_positive" CHECK ("cms_collection"."version" > 0)
);
--> statement-breakpoint
CREATE TABLE "cms_collection_field" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"project_id" uuid NOT NULL,
	"environment_id" uuid NOT NULL,
	"collection_id" uuid NOT NULL,
	"api_key" varchar(63) NOT NULL,
	"display_label" varchar(100) NOT NULL,
	"kind" varchar(32) NOT NULL,
	"required" boolean DEFAULT false NOT NULL,
	"localization" varchar(16) NOT NULL,
	"deprecated" boolean DEFAULT false NOT NULL,
	"position" integer,
	"configuration" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_by_user_id" text NOT NULL,
	"changed_by_user_id" text NOT NULL,
	"removed_at" timestamp with time zone,
	"removed_by_user_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "cms_field_id_collection_tenant_unique" UNIQUE("id","collection_id","environment_id","project_id","workspace_id"),
	CONSTRAINT "cms_field_api_key_valid" CHECK ("cms_collection_field"."api_key" ~ '^[a-z][a-z0-9_]{0,62}$' and "cms_collection_field"."api_key" !~ '__' and right("cms_collection_field"."api_key", 1) <> '_'),
	CONSTRAINT "cms_field_display_label_valid" CHECK (char_length("cms_collection_field"."display_label") between 1 and 100 and "cms_collection_field"."display_label" = btrim("cms_collection_field"."display_label") and "cms_collection_field"."display_label" !~ '[[:cntrl:]]'),
	CONSTRAINT "cms_field_kind_valid" CHECK ("cms_collection_field"."kind" in ('short_text', 'long_text', 'rich_text', 'number', 'boolean', 'date', 'date_time', 'enum', 'url', 'email', 'slug', 'json', 'object', 'list', 'reference', 'external_asset')),
	CONSTRAINT "cms_field_localization_valid" CHECK ("cms_collection_field"."localization" in ('localized', 'shared')),
	CONSTRAINT "cms_field_configuration_valid" CHECK (jsonb_typeof("cms_collection_field"."configuration") = 'object' and octet_length("cms_collection_field"."configuration"::text) <= 8192),
	CONSTRAINT "cms_field_lifecycle_consistent" CHECK (("cms_collection_field"."removed_at" is null and "cms_collection_field"."removed_by_user_id" is null and "cms_collection_field"."position" between 0 and 99) or ("cms_collection_field"."removed_at" is not null and "cms_collection_field"."removed_by_user_id" is not null and "cms_collection_field"."position" is null))
);
--> statement-breakpoint
CREATE TABLE "cms_collection_schema_head" (
	"collection_id" uuid PRIMARY KEY NOT NULL,
	"workspace_id" uuid NOT NULL,
	"project_id" uuid NOT NULL,
	"environment_id" uuid NOT NULL,
	"draft_version" integer DEFAULT 1 NOT NULL,
	"draft_base_revision_id" uuid,
	"current_published_revision_id" uuid,
	"current_published_sequence" integer DEFAULT 0 NOT NULL,
	"changed_by_user_id" text NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "cms_head_draft_version_positive" CHECK ("cms_collection_schema_head"."draft_version" > 0),
	CONSTRAINT "cms_head_publication_consistent" CHECK (("cms_collection_schema_head"."draft_base_revision_id" is null and "cms_collection_schema_head"."current_published_revision_id" is null and "cms_collection_schema_head"."current_published_sequence" = 0) or ("cms_collection_schema_head"."draft_base_revision_id" is not null and "cms_collection_schema_head"."current_published_revision_id" is not null and "cms_collection_schema_head"."current_published_sequence" > 0))
);
--> statement-breakpoint
CREATE TABLE "cms_schema_revision" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"project_id" uuid NOT NULL,
	"environment_id" uuid NOT NULL,
	"collection_id" uuid NOT NULL,
	"sequence" integer NOT NULL,
	"previous_revision_id" uuid,
	"collection_api_key" varchar(63) NOT NULL,
	"collection_display_name" varchar(100) NOT NULL,
	"collection_description" varchar(500),
	"schema_hash" char(64) NOT NULL,
	"command_id" uuid NOT NULL,
	"command_fingerprint" char(64) NOT NULL,
	"non_breaking_change_count" integer DEFAULT 0 NOT NULL,
	"potentially_breaking_change_count" integer DEFAULT 0 NOT NULL,
	"breaking_change_count" integer DEFAULT 0 NOT NULL,
	"published_by_user_id" text NOT NULL,
	"published_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "cms_revision_collection_sequence_unique" UNIQUE("collection_id","sequence"),
	CONSTRAINT "cms_revision_collection_command_unique" UNIQUE("collection_id","command_id"),
	CONSTRAINT "cms_revision_id_collection_tenant_unique" UNIQUE("id","collection_id","environment_id","project_id","workspace_id"),
	CONSTRAINT "cms_revision_id_tenant_unique" UNIQUE("id","environment_id","project_id","workspace_id"),
	CONSTRAINT "cms_revision_id_scope_sequence_unique" UNIQUE("id","collection_id","environment_id","project_id","workspace_id","sequence"),
	CONSTRAINT "cms_revision_sequence_positive" CHECK ("cms_schema_revision"."sequence" > 0),
	CONSTRAINT "cms_revision_previous_consistent" CHECK (("cms_schema_revision"."sequence" = 1 and "cms_schema_revision"."previous_revision_id" is null) or ("cms_schema_revision"."sequence" > 1 and "cms_schema_revision"."previous_revision_id" is not null)),
	CONSTRAINT "cms_revision_collection_key_valid" CHECK ("cms_schema_revision"."collection_api_key" ~ '^[a-z][a-z0-9_]{0,62}$' and "cms_schema_revision"."collection_api_key" !~ '__' and right("cms_schema_revision"."collection_api_key", 1) <> '_'),
	CONSTRAINT "cms_revision_collection_name_valid" CHECK (char_length("cms_schema_revision"."collection_display_name") between 1 and 100 and "cms_schema_revision"."collection_display_name" = btrim("cms_schema_revision"."collection_display_name") and "cms_schema_revision"."collection_display_name" !~ '[[:cntrl:]]'),
	CONSTRAINT "cms_revision_collection_description_valid" CHECK ("cms_schema_revision"."collection_description" is null or (char_length("cms_schema_revision"."collection_description") <= 500 and "cms_schema_revision"."collection_description" = btrim("cms_schema_revision"."collection_description") and "cms_schema_revision"."collection_description" !~ '[[:cntrl:]]')),
	CONSTRAINT "cms_revision_schema_hash_valid" CHECK ("cms_schema_revision"."schema_hash" ~ '^[0-9a-f]{64}$'),
	CONSTRAINT "cms_revision_command_fingerprint_valid" CHECK ("cms_schema_revision"."command_fingerprint" ~ '^[0-9a-f]{64}$'),
	CONSTRAINT "cms_revision_change_counts_valid" CHECK ("cms_schema_revision"."non_breaking_change_count" >= 0 and "cms_schema_revision"."potentially_breaking_change_count" >= 0 and "cms_schema_revision"."breaking_change_count" >= 0)
);
--> statement-breakpoint
CREATE TABLE "cms_schema_revision_field" (
	"revision_id" uuid NOT NULL,
	"field_id" uuid NOT NULL,
	"workspace_id" uuid NOT NULL,
	"project_id" uuid NOT NULL,
	"environment_id" uuid NOT NULL,
	"collection_id" uuid NOT NULL,
	"api_key" varchar(63) NOT NULL,
	"display_label" varchar(100) NOT NULL,
	"kind" varchar(32) NOT NULL,
	"required" boolean NOT NULL,
	"localization" varchar(16) NOT NULL,
	"deprecated" boolean NOT NULL,
	"position" integer NOT NULL,
	"configuration" jsonb NOT NULL,
	CONSTRAINT "cms_revision_field_revision_field_pk" PRIMARY KEY("revision_id","field_id"),
	CONSTRAINT "cms_revision_field_revision_key_unique" UNIQUE("revision_id","api_key"),
	CONSTRAINT "cms_revision_field_revision_position_unique" UNIQUE("revision_id","position"),
	CONSTRAINT "cms_revision_field_api_key_valid" CHECK ("cms_schema_revision_field"."api_key" ~ '^[a-z][a-z0-9_]{0,62}$' and "cms_schema_revision_field"."api_key" !~ '__' and right("cms_schema_revision_field"."api_key", 1) <> '_'),
	CONSTRAINT "cms_revision_field_label_valid" CHECK (char_length("cms_schema_revision_field"."display_label") between 1 and 100 and "cms_schema_revision_field"."display_label" = btrim("cms_schema_revision_field"."display_label") and "cms_schema_revision_field"."display_label" !~ '[[:cntrl:]]'),
	CONSTRAINT "cms_revision_field_kind_valid" CHECK ("cms_schema_revision_field"."kind" in ('short_text', 'long_text', 'rich_text', 'number', 'boolean', 'date', 'date_time', 'enum', 'url', 'email', 'slug', 'json', 'object', 'list', 'reference', 'external_asset')),
	CONSTRAINT "cms_revision_field_localization_valid" CHECK ("cms_schema_revision_field"."localization" in ('localized', 'shared')),
	CONSTRAINT "cms_revision_field_position_valid" CHECK ("cms_schema_revision_field"."position" between 0 and 99),
	CONSTRAINT "cms_revision_field_configuration_valid" CHECK (jsonb_typeof("cms_schema_revision_field"."configuration") = 'object' and octet_length("cms_schema_revision_field"."configuration"::text) <= 8192)
);
--> statement-breakpoint
CREATE TABLE "outbox_event" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"project_id" uuid NOT NULL,
	"environment_id" uuid NOT NULL,
	"event_type" varchar(128) NOT NULL,
	"subject_type" varchar(64) NOT NULL,
	"subject_id" uuid NOT NULL,
	"schema_revision_id" uuid,
	"aggregate_sequence" integer NOT NULL,
	"payload" jsonb NOT NULL,
	"occurred_at" timestamp with time zone DEFAULT now() NOT NULL,
	"available_at" timestamp with time zone DEFAULT now() NOT NULL,
	"processed_at" timestamp with time zone,
	"attempt_count" integer DEFAULT 0 NOT NULL,
	CONSTRAINT "outbox_event_logical_sequence_unique" UNIQUE("event_type","subject_id","aggregate_sequence"),
	CONSTRAINT "outbox_event_type_valid" CHECK ("outbox_event"."event_type" ~ '^[a-z][a-z0-9_.-]{0,127}$'),
	CONSTRAINT "outbox_event_subject_type_valid" CHECK ("outbox_event"."subject_type" ~ '^[a-z][a-z0-9_.-]{0,63}$'),
	CONSTRAINT "outbox_event_sequence_positive" CHECK ("outbox_event"."aggregate_sequence" > 0),
	CONSTRAINT "outbox_event_payload_valid" CHECK (jsonb_typeof("outbox_event"."payload") = 'object' and octet_length("outbox_event"."payload"::text) <= 16384),
	CONSTRAINT "outbox_event_schema_publication_valid" CHECK ("outbox_event"."event_type" <> 'cms.schema.published' or ("outbox_event"."subject_type" = 'cms.collection' and "outbox_event"."schema_revision_id" is not null)),
	CONSTRAINT "outbox_event_availability_valid" CHECK ("outbox_event"."available_at" >= "outbox_event"."occurred_at"),
	CONSTRAINT "outbox_event_attempt_count_valid" CHECK ("outbox_event"."attempt_count" >= 0)
);
--> statement-breakpoint
ALTER TABLE "cms_collection" ADD CONSTRAINT "cms_collection_created_by_user_id_user_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."user"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cms_collection" ADD CONSTRAINT "cms_collection_changed_by_user_id_user_id_fk" FOREIGN KEY ("changed_by_user_id") REFERENCES "public"."user"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cms_collection" ADD CONSTRAINT "cms_collection_environment_tenant_fk" FOREIGN KEY ("environment_id","project_id","workspace_id") REFERENCES "public"."environment"("id","project_id","workspace_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cms_collection_field" ADD CONSTRAINT "cms_collection_field_created_by_user_id_user_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."user"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cms_collection_field" ADD CONSTRAINT "cms_collection_field_changed_by_user_id_user_id_fk" FOREIGN KEY ("changed_by_user_id") REFERENCES "public"."user"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cms_collection_field" ADD CONSTRAINT "cms_collection_field_removed_by_user_id_user_id_fk" FOREIGN KEY ("removed_by_user_id") REFERENCES "public"."user"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cms_collection_field" ADD CONSTRAINT "cms_field_collection_tenant_fk" FOREIGN KEY ("collection_id","environment_id","project_id","workspace_id") REFERENCES "public"."cms_collection"("id","environment_id","project_id","workspace_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cms_collection_schema_head" ADD CONSTRAINT "cms_collection_schema_head_changed_by_user_id_user_id_fk" FOREIGN KEY ("changed_by_user_id") REFERENCES "public"."user"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cms_collection_schema_head" ADD CONSTRAINT "cms_head_collection_tenant_fk" FOREIGN KEY ("collection_id","environment_id","project_id","workspace_id") REFERENCES "public"."cms_collection"("id","environment_id","project_id","workspace_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cms_collection_schema_head" ADD CONSTRAINT "cms_head_draft_base_revision_fk" FOREIGN KEY ("draft_base_revision_id","collection_id","environment_id","project_id","workspace_id") REFERENCES "public"."cms_schema_revision"("id","collection_id","environment_id","project_id","workspace_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cms_collection_schema_head" ADD CONSTRAINT "cms_head_current_revision_sequence_fk" FOREIGN KEY ("current_published_revision_id","collection_id","environment_id","project_id","workspace_id","current_published_sequence") REFERENCES "public"."cms_schema_revision"("id","collection_id","environment_id","project_id","workspace_id","sequence") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cms_schema_revision" ADD CONSTRAINT "cms_schema_revision_published_by_user_id_user_id_fk" FOREIGN KEY ("published_by_user_id") REFERENCES "public"."user"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cms_schema_revision" ADD CONSTRAINT "cms_revision_collection_tenant_fk" FOREIGN KEY ("collection_id","environment_id","project_id","workspace_id") REFERENCES "public"."cms_collection"("id","environment_id","project_id","workspace_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cms_schema_revision" ADD CONSTRAINT "cms_revision_previous_tenant_fk" FOREIGN KEY ("previous_revision_id","collection_id","environment_id","project_id","workspace_id") REFERENCES "public"."cms_schema_revision"("id","collection_id","environment_id","project_id","workspace_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cms_schema_revision_field" ADD CONSTRAINT "cms_revision_field_revision_tenant_fk" FOREIGN KEY ("revision_id","collection_id","environment_id","project_id","workspace_id") REFERENCES "public"."cms_schema_revision"("id","collection_id","environment_id","project_id","workspace_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cms_schema_revision_field" ADD CONSTRAINT "cms_revision_field_stable_field_tenant_fk" FOREIGN KEY ("field_id","collection_id","environment_id","project_id","workspace_id") REFERENCES "public"."cms_collection_field"("id","collection_id","environment_id","project_id","workspace_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "outbox_event" ADD CONSTRAINT "outbox_event_environment_tenant_fk" FOREIGN KEY ("environment_id","project_id","workspace_id") REFERENCES "public"."environment"("id","project_id","workspace_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "outbox_event" ADD CONSTRAINT "outbox_event_schema_revision_tenant_fk" FOREIGN KEY ("schema_revision_id","environment_id","project_id","workspace_id") REFERENCES "public"."cms_schema_revision"("id","environment_id","project_id","workspace_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "cms_collection_environment_created_id_idx" ON "cms_collection" USING btree ("environment_id","created_at" DESC NULLS LAST,"id" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "cms_collection_created_by_user_idx" ON "cms_collection" USING btree ("created_by_user_id");--> statement-breakpoint
CREATE INDEX "cms_collection_changed_by_user_idx" ON "cms_collection" USING btree ("changed_by_user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "cms_field_collection_active_key_unique" ON "cms_collection_field" USING btree ("collection_id","api_key") WHERE "cms_collection_field"."removed_at" is null;--> statement-breakpoint
CREATE UNIQUE INDEX "cms_field_collection_active_position_unique" ON "cms_collection_field" USING btree ("collection_id","position") WHERE "cms_collection_field"."removed_at" is null;--> statement-breakpoint
CREATE INDEX "cms_field_collection_active_position_id_idx" ON "cms_collection_field" USING btree ("collection_id","position","id") WHERE "cms_collection_field"."removed_at" is null;--> statement-breakpoint
CREATE INDEX "cms_field_collection_idx" ON "cms_collection_field" USING btree ("collection_id");--> statement-breakpoint
CREATE INDEX "cms_field_created_by_user_idx" ON "cms_collection_field" USING btree ("created_by_user_id");--> statement-breakpoint
CREATE INDEX "cms_field_changed_by_user_idx" ON "cms_collection_field" USING btree ("changed_by_user_id");--> statement-breakpoint
CREATE INDEX "cms_field_removed_by_user_idx" ON "cms_collection_field" USING btree ("removed_by_user_id") WHERE "cms_collection_field"."removed_by_user_id" is not null;--> statement-breakpoint
CREATE INDEX "cms_head_draft_base_revision_idx" ON "cms_collection_schema_head" USING btree ("draft_base_revision_id") WHERE "cms_collection_schema_head"."draft_base_revision_id" is not null;--> statement-breakpoint
CREATE INDEX "cms_head_current_published_revision_idx" ON "cms_collection_schema_head" USING btree ("current_published_revision_id") WHERE "cms_collection_schema_head"."current_published_revision_id" is not null;--> statement-breakpoint
CREATE INDEX "cms_head_changed_by_user_idx" ON "cms_collection_schema_head" USING btree ("changed_by_user_id");--> statement-breakpoint
CREATE INDEX "cms_revision_collection_sequence_desc_idx" ON "cms_schema_revision" USING btree ("collection_id","sequence" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "cms_revision_previous_revision_idx" ON "cms_schema_revision" USING btree ("previous_revision_id") WHERE "cms_schema_revision"."previous_revision_id" is not null;--> statement-breakpoint
CREATE INDEX "cms_revision_published_by_user_idx" ON "cms_schema_revision" USING btree ("published_by_user_id");--> statement-breakpoint
CREATE INDEX "cms_revision_field_revision_position_idx" ON "cms_schema_revision_field" USING btree ("revision_id","position","field_id");--> statement-breakpoint
CREATE INDEX "cms_revision_field_stable_field_idx" ON "cms_schema_revision_field" USING btree ("field_id");--> statement-breakpoint
CREATE INDEX "outbox_event_pending_available_id_idx" ON "outbox_event" USING btree ("available_at","id") WHERE "outbox_event"."processed_at" is null;--> statement-breakpoint
CREATE INDEX "outbox_event_environment_idx" ON "outbox_event" USING btree ("environment_id");--> statement-breakpoint
CREATE INDEX "outbox_event_schema_revision_idx" ON "outbox_event" USING btree ("schema_revision_id") WHERE "outbox_event"."schema_revision_id" is not null;