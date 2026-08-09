CREATE TABLE "cms_entry" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"project_id" uuid NOT NULL,
	"environment_id" uuid NOT NULL,
	"collection_id" uuid NOT NULL,
	"create_command_id" uuid NOT NULL,
	"create_command_fingerprint" char(64) NOT NULL,
	"created_by_user_id" text NOT NULL,
	"changed_by_user_id" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "cms_entry_id_collection_tenant_unique" UNIQUE("id","collection_id","environment_id","project_id","workspace_id"),
	CONSTRAINT "cms_entry_collection_create_command_unique" UNIQUE("collection_id","create_command_id"),
	CONSTRAINT "cms_entry_create_fingerprint_valid" CHECK ("cms_entry"."create_command_fingerprint" ~ '^[0-9a-f]{64}$'),
	CONSTRAINT "cms_entry_timestamps_valid" CHECK ("cms_entry"."updated_at" >= "cms_entry"."created_at")
);
--> statement-breakpoint
CREATE TABLE "cms_entry_draft_command" (
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
	"result_shared_version" integer NOT NULL,
	"result_shared_revision_id" uuid,
	"result_locale_version" integer NOT NULL,
	"result_locale_revision_id" uuid,
	"completed_by_user_id" text NOT NULL,
	"completed_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "cms_entry_draft_command_entry_command_pk" PRIMARY KEY("entry_id","command_id"),
	CONSTRAINT "cms_entry_draft_command_operation_valid" CHECK ("cms_entry_draft_command"."operation" in ('save', 'restore')),
	CONSTRAINT "cms_entry_draft_command_fingerprint_valid" CHECK ("cms_entry_draft_command"."command_fingerprint" ~ '^[0-9a-f]{64}$'),
	CONSTRAINT "cms_entry_draft_command_result_kind_valid" CHECK ("cms_entry_draft_command"."result_kind" in ('changed', 'no_op')),
	CONSTRAINT "cms_entry_draft_command_shared_result_valid" CHECK (("cms_entry_draft_command"."result_shared_version" = 0 and "cms_entry_draft_command"."result_shared_revision_id" is null) or ("cms_entry_draft_command"."result_shared_version" > 0 and "cms_entry_draft_command"."result_shared_revision_id" is not null)),
	CONSTRAINT "cms_entry_draft_command_locale_result_valid" CHECK (("cms_entry_draft_command"."result_locale_version" = 0 and "cms_entry_draft_command"."result_locale_revision_id" is null) or ("cms_entry_draft_command"."result_locale_version" > 0 and "cms_entry_draft_command"."result_locale_revision_id" is not null))
);
--> statement-breakpoint
CREATE TABLE "cms_entry_locale_draft" (
	"entry_id" uuid NOT NULL,
	"locale_id" uuid NOT NULL,
	"workspace_id" uuid NOT NULL,
	"project_id" uuid NOT NULL,
	"environment_id" uuid NOT NULL,
	"collection_id" uuid NOT NULL,
	"version" integer NOT NULL,
	"current_revision_id" uuid NOT NULL,
	"changed_by_user_id" text NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "cms_entry_locale_draft_entry_locale_pk" PRIMARY KEY("entry_id","locale_id"),
	CONSTRAINT "cms_entry_locale_draft_version_positive" CHECK ("cms_entry_locale_draft"."version" > 0)
);
--> statement-breakpoint
CREATE TABLE "cms_entry_locale_revision" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"project_id" uuid NOT NULL,
	"environment_id" uuid NOT NULL,
	"collection_id" uuid NOT NULL,
	"entry_id" uuid NOT NULL,
	"locale_id" uuid NOT NULL,
	"sequence" integer NOT NULL,
	"previous_revision_id" uuid,
	"schema_revision_id" uuid NOT NULL,
	"contract_hash" char(64) NOT NULL,
	"values" jsonb NOT NULL,
	"values_hash" char(64) NOT NULL,
	"changed_field_ids" uuid[] NOT NULL,
	"command_id" uuid NOT NULL,
	"command_fingerprint" char(64) NOT NULL,
	"restored_from_revision_id" uuid,
	"authored_by_user_id" text NOT NULL,
	"authored_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "cms_entry_locale_revision_entry_locale_sequence_unique" UNIQUE("entry_id","locale_id","sequence"),
	CONSTRAINT "cms_entry_locale_revision_entry_locale_command_unique" UNIQUE("entry_id","locale_id","command_id"),
	CONSTRAINT "cms_entry_locale_revision_id_entry_scope_unique" UNIQUE("id","entry_id","locale_id","collection_id","environment_id","project_id","workspace_id"),
	CONSTRAINT "cms_entry_locale_revision_id_entry_sequence_unique" UNIQUE("id","entry_id","locale_id","collection_id","environment_id","project_id","workspace_id","sequence"),
	CONSTRAINT "cms_entry_locale_revision_sequence_positive" CHECK ("cms_entry_locale_revision"."sequence" > 0),
	CONSTRAINT "cms_entry_locale_revision_previous_consistent" CHECK (("cms_entry_locale_revision"."sequence" = 1 and "cms_entry_locale_revision"."previous_revision_id" is null) or ("cms_entry_locale_revision"."sequence" > 1 and "cms_entry_locale_revision"."previous_revision_id" is not null)),
	CONSTRAINT "cms_entry_locale_revision_restore_not_self" CHECK ("cms_entry_locale_revision"."restored_from_revision_id" is null or "cms_entry_locale_revision"."restored_from_revision_id" <> "cms_entry_locale_revision"."id"),
	CONSTRAINT "cms_entry_locale_revision_contract_hash_valid" CHECK ("cms_entry_locale_revision"."contract_hash" ~ '^[0-9a-f]{64}$'),
	CONSTRAINT "cms_entry_locale_revision_values_valid" CHECK (jsonb_typeof("cms_entry_locale_revision"."values") = 'object' and octet_length("cms_entry_locale_revision"."values"::text) <= 1048576),
	CONSTRAINT "cms_entry_locale_revision_values_hash_valid" CHECK ("cms_entry_locale_revision"."values_hash" ~ '^[0-9a-f]{64}$'),
	CONSTRAINT "cms_entry_locale_revision_changed_fields_valid" CHECK (array_ndims("cms_entry_locale_revision"."changed_field_ids") = 1 and cardinality("cms_entry_locale_revision"."changed_field_ids") between 1 and 100 and array_position("cms_entry_locale_revision"."changed_field_ids", null) is null),
	CONSTRAINT "cms_entry_locale_revision_command_fingerprint_valid" CHECK ("cms_entry_locale_revision"."command_fingerprint" ~ '^[0-9a-f]{64}$')
);
--> statement-breakpoint
CREATE TABLE "cms_entry_shared_draft" (
	"entry_id" uuid PRIMARY KEY NOT NULL,
	"workspace_id" uuid NOT NULL,
	"project_id" uuid NOT NULL,
	"environment_id" uuid NOT NULL,
	"collection_id" uuid NOT NULL,
	"version" integer NOT NULL,
	"current_revision_id" uuid NOT NULL,
	"changed_by_user_id" text NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "cms_entry_shared_draft_version_positive" CHECK ("cms_entry_shared_draft"."version" > 0)
);
--> statement-breakpoint
CREATE TABLE "cms_entry_shared_revision" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"project_id" uuid NOT NULL,
	"environment_id" uuid NOT NULL,
	"collection_id" uuid NOT NULL,
	"entry_id" uuid NOT NULL,
	"sequence" integer NOT NULL,
	"previous_revision_id" uuid,
	"schema_revision_id" uuid NOT NULL,
	"contract_hash" char(64) NOT NULL,
	"values" jsonb NOT NULL,
	"values_hash" char(64) NOT NULL,
	"changed_field_ids" uuid[] NOT NULL,
	"command_id" uuid NOT NULL,
	"command_fingerprint" char(64) NOT NULL,
	"restored_from_revision_id" uuid,
	"authored_by_user_id" text NOT NULL,
	"authored_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "cms_entry_shared_revision_entry_sequence_unique" UNIQUE("entry_id","sequence"),
	CONSTRAINT "cms_entry_shared_revision_entry_command_unique" UNIQUE("entry_id","command_id"),
	CONSTRAINT "cms_entry_shared_revision_id_entry_scope_unique" UNIQUE("id","entry_id","collection_id","environment_id","project_id","workspace_id"),
	CONSTRAINT "cms_entry_shared_revision_id_entry_sequence_unique" UNIQUE("id","entry_id","collection_id","environment_id","project_id","workspace_id","sequence"),
	CONSTRAINT "cms_entry_shared_revision_sequence_positive" CHECK ("cms_entry_shared_revision"."sequence" > 0),
	CONSTRAINT "cms_entry_shared_revision_previous_consistent" CHECK (("cms_entry_shared_revision"."sequence" = 1 and "cms_entry_shared_revision"."previous_revision_id" is null) or ("cms_entry_shared_revision"."sequence" > 1 and "cms_entry_shared_revision"."previous_revision_id" is not null)),
	CONSTRAINT "cms_entry_shared_revision_restore_not_self" CHECK ("cms_entry_shared_revision"."restored_from_revision_id" is null or "cms_entry_shared_revision"."restored_from_revision_id" <> "cms_entry_shared_revision"."id"),
	CONSTRAINT "cms_entry_shared_revision_contract_hash_valid" CHECK ("cms_entry_shared_revision"."contract_hash" ~ '^[0-9a-f]{64}$'),
	CONSTRAINT "cms_entry_shared_revision_values_valid" CHECK (jsonb_typeof("cms_entry_shared_revision"."values") = 'object' and octet_length("cms_entry_shared_revision"."values"::text) <= 1048576),
	CONSTRAINT "cms_entry_shared_revision_values_hash_valid" CHECK ("cms_entry_shared_revision"."values_hash" ~ '^[0-9a-f]{64}$'),
	CONSTRAINT "cms_entry_shared_revision_changed_fields_valid" CHECK (array_ndims("cms_entry_shared_revision"."changed_field_ids") = 1 and cardinality("cms_entry_shared_revision"."changed_field_ids") between 1 and 100 and array_position("cms_entry_shared_revision"."changed_field_ids", null) is null),
	CONSTRAINT "cms_entry_shared_revision_command_fingerprint_valid" CHECK ("cms_entry_shared_revision"."command_fingerprint" ~ '^[0-9a-f]{64}$')
);
--> statement-breakpoint
ALTER TABLE "cms_entry" ADD CONSTRAINT "cms_entry_created_by_user_id_user_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."user"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cms_entry" ADD CONSTRAINT "cms_entry_changed_by_user_id_user_id_fk" FOREIGN KEY ("changed_by_user_id") REFERENCES "public"."user"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cms_entry" ADD CONSTRAINT "cms_entry_collection_tenant_fk" FOREIGN KEY ("collection_id","environment_id","project_id","workspace_id") REFERENCES "public"."cms_collection"("id","environment_id","project_id","workspace_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cms_entry_draft_command" ADD CONSTRAINT "cms_entry_draft_command_completed_by_user_id_user_id_fk" FOREIGN KEY ("completed_by_user_id") REFERENCES "public"."user"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cms_entry_draft_command" ADD CONSTRAINT "cms_entry_draft_command_entry_tenant_fk" FOREIGN KEY ("entry_id","collection_id","environment_id","project_id","workspace_id") REFERENCES "public"."cms_entry"("id","collection_id","environment_id","project_id","workspace_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cms_entry_draft_command" ADD CONSTRAINT "cms_entry_draft_command_locale_tenant_fk" FOREIGN KEY ("locale_id","project_id","workspace_id") REFERENCES "public"."project_locale"("id","project_id","workspace_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cms_entry_draft_command" ADD CONSTRAINT "cms_entry_draft_command_shared_revision_fk" FOREIGN KEY ("result_shared_revision_id","entry_id","collection_id","environment_id","project_id","workspace_id") REFERENCES "public"."cms_entry_shared_revision"("id","entry_id","collection_id","environment_id","project_id","workspace_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cms_entry_draft_command" ADD CONSTRAINT "cms_entry_draft_command_locale_revision_fk" FOREIGN KEY ("result_locale_revision_id","entry_id","locale_id","collection_id","environment_id","project_id","workspace_id") REFERENCES "public"."cms_entry_locale_revision"("id","entry_id","locale_id","collection_id","environment_id","project_id","workspace_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cms_entry_locale_draft" ADD CONSTRAINT "cms_entry_locale_draft_changed_by_user_id_user_id_fk" FOREIGN KEY ("changed_by_user_id") REFERENCES "public"."user"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cms_entry_locale_draft" ADD CONSTRAINT "cms_entry_locale_draft_entry_tenant_fk" FOREIGN KEY ("entry_id","collection_id","environment_id","project_id","workspace_id") REFERENCES "public"."cms_entry"("id","collection_id","environment_id","project_id","workspace_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cms_entry_locale_draft" ADD CONSTRAINT "cms_entry_locale_draft_locale_tenant_fk" FOREIGN KEY ("locale_id","project_id","workspace_id") REFERENCES "public"."project_locale"("id","project_id","workspace_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cms_entry_locale_draft" ADD CONSTRAINT "cms_entry_locale_draft_current_revision_fk" FOREIGN KEY ("current_revision_id","entry_id","locale_id","collection_id","environment_id","project_id","workspace_id","version") REFERENCES "public"."cms_entry_locale_revision"("id","entry_id","locale_id","collection_id","environment_id","project_id","workspace_id","sequence") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cms_entry_locale_revision" ADD CONSTRAINT "cms_entry_locale_revision_authored_by_user_id_user_id_fk" FOREIGN KEY ("authored_by_user_id") REFERENCES "public"."user"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cms_entry_locale_revision" ADD CONSTRAINT "cms_entry_locale_revision_entry_tenant_fk" FOREIGN KEY ("entry_id","collection_id","environment_id","project_id","workspace_id") REFERENCES "public"."cms_entry"("id","collection_id","environment_id","project_id","workspace_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cms_entry_locale_revision" ADD CONSTRAINT "cms_entry_locale_revision_locale_tenant_fk" FOREIGN KEY ("locale_id","project_id","workspace_id") REFERENCES "public"."project_locale"("id","project_id","workspace_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cms_entry_locale_revision" ADD CONSTRAINT "cms_entry_locale_revision_schema_tenant_fk" FOREIGN KEY ("schema_revision_id","collection_id","environment_id","project_id","workspace_id") REFERENCES "public"."cms_schema_revision"("id","collection_id","environment_id","project_id","workspace_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cms_entry_locale_revision" ADD CONSTRAINT "cms_entry_locale_revision_previous_tenant_fk" FOREIGN KEY ("previous_revision_id","entry_id","locale_id","collection_id","environment_id","project_id","workspace_id") REFERENCES "public"."cms_entry_locale_revision"("id","entry_id","locale_id","collection_id","environment_id","project_id","workspace_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cms_entry_locale_revision" ADD CONSTRAINT "cms_entry_locale_revision_restore_tenant_fk" FOREIGN KEY ("restored_from_revision_id","entry_id","locale_id","collection_id","environment_id","project_id","workspace_id") REFERENCES "public"."cms_entry_locale_revision"("id","entry_id","locale_id","collection_id","environment_id","project_id","workspace_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cms_entry_shared_draft" ADD CONSTRAINT "cms_entry_shared_draft_changed_by_user_id_user_id_fk" FOREIGN KEY ("changed_by_user_id") REFERENCES "public"."user"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cms_entry_shared_draft" ADD CONSTRAINT "cms_entry_shared_draft_entry_tenant_fk" FOREIGN KEY ("entry_id","collection_id","environment_id","project_id","workspace_id") REFERENCES "public"."cms_entry"("id","collection_id","environment_id","project_id","workspace_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cms_entry_shared_draft" ADD CONSTRAINT "cms_entry_shared_draft_current_revision_fk" FOREIGN KEY ("current_revision_id","entry_id","collection_id","environment_id","project_id","workspace_id","version") REFERENCES "public"."cms_entry_shared_revision"("id","entry_id","collection_id","environment_id","project_id","workspace_id","sequence") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cms_entry_shared_revision" ADD CONSTRAINT "cms_entry_shared_revision_authored_by_user_id_user_id_fk" FOREIGN KEY ("authored_by_user_id") REFERENCES "public"."user"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cms_entry_shared_revision" ADD CONSTRAINT "cms_entry_shared_revision_entry_tenant_fk" FOREIGN KEY ("entry_id","collection_id","environment_id","project_id","workspace_id") REFERENCES "public"."cms_entry"("id","collection_id","environment_id","project_id","workspace_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cms_entry_shared_revision" ADD CONSTRAINT "cms_entry_shared_revision_schema_tenant_fk" FOREIGN KEY ("schema_revision_id","collection_id","environment_id","project_id","workspace_id") REFERENCES "public"."cms_schema_revision"("id","collection_id","environment_id","project_id","workspace_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cms_entry_shared_revision" ADD CONSTRAINT "cms_entry_shared_revision_previous_tenant_fk" FOREIGN KEY ("previous_revision_id","entry_id","collection_id","environment_id","project_id","workspace_id") REFERENCES "public"."cms_entry_shared_revision"("id","entry_id","collection_id","environment_id","project_id","workspace_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cms_entry_shared_revision" ADD CONSTRAINT "cms_entry_shared_revision_restore_tenant_fk" FOREIGN KEY ("restored_from_revision_id","entry_id","collection_id","environment_id","project_id","workspace_id") REFERENCES "public"."cms_entry_shared_revision"("id","entry_id","collection_id","environment_id","project_id","workspace_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "cms_entry_collection_created_id_idx" ON "cms_entry" USING btree ("collection_id","created_at" DESC NULLS LAST,"id" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "cms_entry_created_by_user_idx" ON "cms_entry" USING btree ("created_by_user_id");--> statement-breakpoint
CREATE INDEX "cms_entry_changed_by_user_idx" ON "cms_entry" USING btree ("changed_by_user_id");--> statement-breakpoint
CREATE INDEX "cms_entry_draft_command_entry_completed_idx" ON "cms_entry_draft_command" USING btree ("entry_id","completed_at" DESC NULLS LAST,"command_id" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "cms_entry_draft_command_locale_idx" ON "cms_entry_draft_command" USING btree ("locale_id");--> statement-breakpoint
CREATE INDEX "cms_entry_draft_command_completed_by_user_idx" ON "cms_entry_draft_command" USING btree ("completed_by_user_id");--> statement-breakpoint
CREATE INDEX "cms_entry_locale_draft_locale_entry_idx" ON "cms_entry_locale_draft" USING btree ("locale_id","entry_id");--> statement-breakpoint
CREATE INDEX "cms_entry_locale_draft_current_revision_idx" ON "cms_entry_locale_draft" USING btree ("current_revision_id");--> statement-breakpoint
CREATE INDEX "cms_entry_locale_draft_changed_by_user_idx" ON "cms_entry_locale_draft" USING btree ("changed_by_user_id");--> statement-breakpoint
CREATE INDEX "cms_entry_locale_revision_entry_locale_sequence_idx" ON "cms_entry_locale_revision" USING btree ("entry_id","locale_id","sequence" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "cms_entry_locale_revision_locale_idx" ON "cms_entry_locale_revision" USING btree ("locale_id");--> statement-breakpoint
CREATE INDEX "cms_entry_locale_revision_schema_idx" ON "cms_entry_locale_revision" USING btree ("schema_revision_id");--> statement-breakpoint
CREATE INDEX "cms_entry_locale_revision_previous_idx" ON "cms_entry_locale_revision" USING btree ("previous_revision_id") WHERE "cms_entry_locale_revision"."previous_revision_id" is not null;--> statement-breakpoint
CREATE INDEX "cms_entry_locale_revision_restored_from_idx" ON "cms_entry_locale_revision" USING btree ("restored_from_revision_id") WHERE "cms_entry_locale_revision"."restored_from_revision_id" is not null;--> statement-breakpoint
CREATE INDEX "cms_entry_locale_revision_author_idx" ON "cms_entry_locale_revision" USING btree ("authored_by_user_id");--> statement-breakpoint
CREATE INDEX "cms_entry_shared_draft_current_revision_idx" ON "cms_entry_shared_draft" USING btree ("current_revision_id");--> statement-breakpoint
CREATE INDEX "cms_entry_shared_draft_changed_by_user_idx" ON "cms_entry_shared_draft" USING btree ("changed_by_user_id");--> statement-breakpoint
CREATE INDEX "cms_entry_shared_revision_entry_sequence_idx" ON "cms_entry_shared_revision" USING btree ("entry_id","sequence" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "cms_entry_shared_revision_schema_idx" ON "cms_entry_shared_revision" USING btree ("schema_revision_id");--> statement-breakpoint
CREATE INDEX "cms_entry_shared_revision_previous_idx" ON "cms_entry_shared_revision" USING btree ("previous_revision_id") WHERE "cms_entry_shared_revision"."previous_revision_id" is not null;--> statement-breakpoint
CREATE INDEX "cms_entry_shared_revision_restored_from_idx" ON "cms_entry_shared_revision" USING btree ("restored_from_revision_id") WHERE "cms_entry_shared_revision"."restored_from_revision_id" is not null;--> statement-breakpoint
CREATE INDEX "cms_entry_shared_revision_author_idx" ON "cms_entry_shared_revision" USING btree ("authored_by_user_id");