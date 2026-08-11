CREATE TABLE "cms_collection_delivery_config" (
	"collection_id" uuid PRIMARY KEY NOT NULL,
	"workspace_id" uuid NOT NULL,
	"project_id" uuid NOT NULL,
	"environment_id" uuid NOT NULL,
	"access" varchar(16) DEFAULT 'protected' NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"changed_by_user_id" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "cms_collection_delivery_config_scope_unique" UNIQUE("collection_id","environment_id","project_id","workspace_id"),
	CONSTRAINT "cms_collection_delivery_config_access_valid" CHECK ("cms_collection_delivery_config"."access" in ('protected', 'public')),
	CONSTRAINT "cms_collection_delivery_config_version_positive" CHECK ("cms_collection_delivery_config"."version" > 0)
);
--> statement-breakpoint
INSERT INTO "cms_collection_delivery_config" (
     "collection_id",
     "workspace_id",
     "project_id",
     "environment_id",
     "access",
     "version",
     "changed_by_user_id",
     "created_at",
     "updated_at"
)
SELECT
     "id",
     "workspace_id",
     "project_id",
     "environment_id",
     'protected',
     1,
     "changed_by_user_id",
     "created_at",
     "updated_at"
FROM "cms_collection"
ON CONFLICT ("collection_id") DO NOTHING;
--> statement-breakpoint
CREATE TABLE "cms_collection_delivery_field" (
	"collection_id" uuid NOT NULL,
	"field_id" uuid NOT NULL,
	"workspace_id" uuid NOT NULL,
	"project_id" uuid NOT NULL,
	"environment_id" uuid NOT NULL,
	"filterable" boolean DEFAULT false NOT NULL,
	"sortable" boolean DEFAULT false NOT NULL,
	"unique_lookup" boolean DEFAULT false NOT NULL,
	CONSTRAINT "cms_collection_delivery_field_pk" PRIMARY KEY("collection_id","field_id"),
	CONSTRAINT "cms_collection_delivery_field_enabled" CHECK ("cms_collection_delivery_field"."filterable" or "cms_collection_delivery_field"."sortable" or "cms_collection_delivery_field"."unique_lookup"),
	CONSTRAINT "cms_collection_delivery_field_unique_filterable" CHECK (not "cms_collection_delivery_field"."unique_lookup" or "cms_collection_delivery_field"."filterable")
);
--> statement-breakpoint
CREATE TABLE "cms_collection_locale_delivery_state" (
	"collection_id" uuid NOT NULL,
	"locale_id" uuid NOT NULL,
	"workspace_id" uuid NOT NULL,
	"project_id" uuid NOT NULL,
	"environment_id" uuid NOT NULL,
	"generation" bigint NOT NULL,
	"last_changed_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "cms_collection_locale_delivery_state_pk" PRIMARY KEY("collection_id","locale_id"),
	CONSTRAINT "cms_collection_locale_delivery_state_generation_positive" CHECK ("cms_collection_locale_delivery_state"."generation" > 0)
);
--> statement-breakpoint
CREATE TABLE "cms_entry_locale_delivery_current_value" (
	"entry_id" uuid NOT NULL,
	"locale_id" uuid NOT NULL,
	"field_id" uuid NOT NULL,
	"publication_id" uuid NOT NULL,
	"workspace_id" uuid NOT NULL,
	"project_id" uuid NOT NULL,
	"environment_id" uuid NOT NULL,
	"collection_id" uuid NOT NULL,
	"value_kind" varchar(16) NOT NULL,
	"text_value" text,
	"number_value" double precision,
	"decimal_value" numeric,
	"boolean_value" boolean,
	"date_value" date,
	"date_time_value" timestamp with time zone,
	"reference_value" uuid,
	"unique_lookup" boolean DEFAULT false NOT NULL,
	CONSTRAINT "cms_entry_locale_delivery_current_value_pk" PRIMARY KEY("entry_id","locale_id","field_id"),
	CONSTRAINT "cms_entry_locale_delivery_value_kind_valid" CHECK ("cms_entry_locale_delivery_current_value"."value_kind" in ('short_text', 'slug', 'email', 'enum', 'number', 'decimal', 'boolean', 'date', 'date_time', 'reference')),
	CONSTRAINT "cms_entry_locale_delivery_value_typed_valid" CHECK (("cms_entry_locale_delivery_current_value"."value_kind" in ('short_text', 'slug', 'email', 'enum') and "cms_entry_locale_delivery_current_value"."text_value" is not null and "cms_entry_locale_delivery_current_value"."number_value" is null and "cms_entry_locale_delivery_current_value"."decimal_value" is null and "cms_entry_locale_delivery_current_value"."boolean_value" is null and "cms_entry_locale_delivery_current_value"."date_value" is null and "cms_entry_locale_delivery_current_value"."date_time_value" is null and "cms_entry_locale_delivery_current_value"."reference_value" is null) or ("cms_entry_locale_delivery_current_value"."value_kind" = 'number' and "cms_entry_locale_delivery_current_value"."text_value" is null and "cms_entry_locale_delivery_current_value"."number_value" is not null and "cms_entry_locale_delivery_current_value"."number_value" > '-Infinity'::double precision and "cms_entry_locale_delivery_current_value"."number_value" < 'Infinity'::double precision and "cms_entry_locale_delivery_current_value"."decimal_value" is null and "cms_entry_locale_delivery_current_value"."boolean_value" is null and "cms_entry_locale_delivery_current_value"."date_value" is null and "cms_entry_locale_delivery_current_value"."date_time_value" is null and "cms_entry_locale_delivery_current_value"."reference_value" is null) or ("cms_entry_locale_delivery_current_value"."value_kind" = 'decimal' and "cms_entry_locale_delivery_current_value"."text_value" is null and "cms_entry_locale_delivery_current_value"."number_value" is null and "cms_entry_locale_delivery_current_value"."decimal_value" is not null and "cms_entry_locale_delivery_current_value"."decimal_value" > '-Infinity'::numeric and "cms_entry_locale_delivery_current_value"."decimal_value" < 'Infinity'::numeric and "cms_entry_locale_delivery_current_value"."boolean_value" is null and "cms_entry_locale_delivery_current_value"."date_value" is null and "cms_entry_locale_delivery_current_value"."date_time_value" is null and "cms_entry_locale_delivery_current_value"."reference_value" is null) or ("cms_entry_locale_delivery_current_value"."value_kind" = 'boolean' and "cms_entry_locale_delivery_current_value"."text_value" is null and "cms_entry_locale_delivery_current_value"."number_value" is null and "cms_entry_locale_delivery_current_value"."decimal_value" is null and "cms_entry_locale_delivery_current_value"."boolean_value" is not null and "cms_entry_locale_delivery_current_value"."date_value" is null and "cms_entry_locale_delivery_current_value"."date_time_value" is null and "cms_entry_locale_delivery_current_value"."reference_value" is null) or ("cms_entry_locale_delivery_current_value"."value_kind" = 'date' and "cms_entry_locale_delivery_current_value"."text_value" is null and "cms_entry_locale_delivery_current_value"."number_value" is null and "cms_entry_locale_delivery_current_value"."decimal_value" is null and "cms_entry_locale_delivery_current_value"."boolean_value" is null and "cms_entry_locale_delivery_current_value"."date_value" is not null and "cms_entry_locale_delivery_current_value"."date_time_value" is null and "cms_entry_locale_delivery_current_value"."reference_value" is null) or ("cms_entry_locale_delivery_current_value"."value_kind" = 'date_time' and "cms_entry_locale_delivery_current_value"."text_value" is null and "cms_entry_locale_delivery_current_value"."number_value" is null and "cms_entry_locale_delivery_current_value"."decimal_value" is null and "cms_entry_locale_delivery_current_value"."boolean_value" is null and "cms_entry_locale_delivery_current_value"."date_value" is null and "cms_entry_locale_delivery_current_value"."date_time_value" is not null and "cms_entry_locale_delivery_current_value"."reference_value" is null) or ("cms_entry_locale_delivery_current_value"."value_kind" = 'reference' and "cms_entry_locale_delivery_current_value"."text_value" is null and "cms_entry_locale_delivery_current_value"."number_value" is null and "cms_entry_locale_delivery_current_value"."decimal_value" is null and "cms_entry_locale_delivery_current_value"."boolean_value" is null and "cms_entry_locale_delivery_current_value"."date_value" is null and "cms_entry_locale_delivery_current_value"."date_time_value" is null and "cms_entry_locale_delivery_current_value"."reference_value" is not null)),
	CONSTRAINT "cms_entry_locale_delivery_value_text_bounded" CHECK ("cms_entry_locale_delivery_current_value"."text_value" is null or octet_length("cms_entry_locale_delivery_current_value"."text_value") <= 2048),
	CONSTRAINT "cms_entry_locale_delivery_value_unique_kind_valid" CHECK (not "cms_entry_locale_delivery_current_value"."unique_lookup" or "cms_entry_locale_delivery_current_value"."value_kind" <> 'boolean')
);
--> statement-breakpoint
ALTER TABLE "cms_collection_delivery_config" ADD CONSTRAINT "cms_collection_delivery_config_changed_by_user_id_user_id_fk" FOREIGN KEY ("changed_by_user_id") REFERENCES "public"."user"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cms_collection_delivery_config" ADD CONSTRAINT "cms_collection_delivery_config_tenant_fk" FOREIGN KEY ("collection_id","environment_id","project_id","workspace_id") REFERENCES "public"."cms_collection"("id","environment_id","project_id","workspace_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cms_collection_delivery_field" ADD CONSTRAINT "cms_collection_delivery_field_config_fk" FOREIGN KEY ("collection_id","environment_id","project_id","workspace_id") REFERENCES "public"."cms_collection_delivery_config"("collection_id","environment_id","project_id","workspace_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cms_collection_delivery_field" ADD CONSTRAINT "cms_collection_delivery_field_tenant_fk" FOREIGN KEY ("field_id","collection_id","environment_id","project_id","workspace_id") REFERENCES "public"."cms_collection_field"("id","collection_id","environment_id","project_id","workspace_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cms_collection_locale_delivery_state" ADD CONSTRAINT "cms_collection_locale_delivery_state_collection_fk" FOREIGN KEY ("collection_id","environment_id","project_id","workspace_id") REFERENCES "public"."cms_collection"("id","environment_id","project_id","workspace_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cms_collection_locale_delivery_state" ADD CONSTRAINT "cms_collection_locale_delivery_state_locale_fk" FOREIGN KEY ("locale_id","project_id","workspace_id") REFERENCES "public"."project_locale"("id","project_id","workspace_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cms_entry_locale_delivery_current_value" ADD CONSTRAINT "cms_entry_locale_delivery_value_field_fk" FOREIGN KEY ("field_id","collection_id","environment_id","project_id","workspace_id") REFERENCES "public"."cms_collection_field"("id","collection_id","environment_id","project_id","workspace_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cms_entry_locale_delivery_current_value" ADD CONSTRAINT "cms_entry_locale_delivery_value_publication_fk" FOREIGN KEY ("publication_id","entry_id","locale_id","collection_id","environment_id","project_id","workspace_id") REFERENCES "public"."cms_entry_locale_publication"("id","entry_id","locale_id","collection_id","environment_id","project_id","workspace_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cms_entry_locale_publication_head" ADD CONSTRAINT "cms_entry_pub_head_current_scope_unique" UNIQUE("current_publication_id","entry_id","locale_id","collection_id","environment_id","project_id","workspace_id");--> statement-breakpoint
ALTER TABLE "cms_entry_locale_delivery_current_value" ADD CONSTRAINT "cms_entry_locale_delivery_value_current_head_fk" FOREIGN KEY ("publication_id","entry_id","locale_id","collection_id","environment_id","project_id","workspace_id") REFERENCES "public"."cms_entry_locale_publication_head"("current_publication_id","entry_id","locale_id","collection_id","environment_id","project_id","workspace_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "cms_collection_delivery_config_environment_idx" ON "cms_collection_delivery_config" USING btree ("environment_id","collection_id");--> statement-breakpoint
CREATE INDEX "cms_collection_delivery_config_changed_by_user_idx" ON "cms_collection_delivery_config" USING btree ("changed_by_user_id");--> statement-breakpoint
CREATE INDEX "cms_collection_delivery_field_field_idx" ON "cms_collection_delivery_field" USING btree ("field_id");--> statement-breakpoint
CREATE INDEX "cms_collection_locale_delivery_state_locale_idx" ON "cms_collection_locale_delivery_state" USING btree ("locale_id","collection_id");--> statement-breakpoint
CREATE INDEX "cms_entry_locale_delivery_value_text_idx" ON "cms_entry_locale_delivery_current_value" USING btree ("locale_id","collection_id","field_id","text_value" collate "C","entry_id") WHERE "cms_entry_locale_delivery_current_value"."text_value" is not null;--> statement-breakpoint
CREATE INDEX "cms_entry_locale_delivery_value_number_idx" ON "cms_entry_locale_delivery_current_value" USING btree ("locale_id","collection_id","field_id","number_value","entry_id") WHERE "cms_entry_locale_delivery_current_value"."number_value" is not null;--> statement-breakpoint
CREATE INDEX "cms_entry_locale_delivery_value_decimal_idx" ON "cms_entry_locale_delivery_current_value" USING btree ("locale_id","collection_id","field_id","decimal_value","entry_id") WHERE "cms_entry_locale_delivery_current_value"."decimal_value" is not null;--> statement-breakpoint
CREATE INDEX "cms_entry_locale_delivery_value_boolean_idx" ON "cms_entry_locale_delivery_current_value" USING btree ("locale_id","collection_id","field_id","boolean_value","entry_id") WHERE "cms_entry_locale_delivery_current_value"."boolean_value" is not null;--> statement-breakpoint
CREATE INDEX "cms_entry_locale_delivery_value_date_idx" ON "cms_entry_locale_delivery_current_value" USING btree ("locale_id","collection_id","field_id","date_value","entry_id") WHERE "cms_entry_locale_delivery_current_value"."date_value" is not null;--> statement-breakpoint
CREATE INDEX "cms_entry_locale_delivery_value_date_time_idx" ON "cms_entry_locale_delivery_current_value" USING btree ("locale_id","collection_id","field_id","date_time_value","entry_id") WHERE "cms_entry_locale_delivery_current_value"."date_time_value" is not null;--> statement-breakpoint
CREATE INDEX "cms_entry_locale_delivery_value_reference_idx" ON "cms_entry_locale_delivery_current_value" USING btree ("locale_id","collection_id","field_id","reference_value","entry_id") WHERE "cms_entry_locale_delivery_current_value"."reference_value" is not null;--> statement-breakpoint
CREATE UNIQUE INDEX "cms_entry_locale_delivery_value_text_unique" ON "cms_entry_locale_delivery_current_value" USING btree ("locale_id","collection_id","field_id","text_value" collate "C") WHERE "cms_entry_locale_delivery_current_value"."unique_lookup" and "cms_entry_locale_delivery_current_value"."text_value" is not null;--> statement-breakpoint
CREATE UNIQUE INDEX "cms_entry_locale_delivery_value_number_unique" ON "cms_entry_locale_delivery_current_value" USING btree ("locale_id","collection_id","field_id","number_value") WHERE "cms_entry_locale_delivery_current_value"."unique_lookup" and "cms_entry_locale_delivery_current_value"."number_value" is not null;--> statement-breakpoint
CREATE UNIQUE INDEX "cms_entry_locale_delivery_value_decimal_unique" ON "cms_entry_locale_delivery_current_value" USING btree ("locale_id","collection_id","field_id","decimal_value") WHERE "cms_entry_locale_delivery_current_value"."unique_lookup" and "cms_entry_locale_delivery_current_value"."decimal_value" is not null;--> statement-breakpoint
CREATE UNIQUE INDEX "cms_entry_locale_delivery_value_date_unique" ON "cms_entry_locale_delivery_current_value" USING btree ("locale_id","collection_id","field_id","date_value") WHERE "cms_entry_locale_delivery_current_value"."unique_lookup" and "cms_entry_locale_delivery_current_value"."date_value" is not null;--> statement-breakpoint
CREATE UNIQUE INDEX "cms_entry_locale_delivery_value_date_time_unique" ON "cms_entry_locale_delivery_current_value" USING btree ("locale_id","collection_id","field_id","date_time_value") WHERE "cms_entry_locale_delivery_current_value"."unique_lookup" and "cms_entry_locale_delivery_current_value"."date_time_value" is not null;--> statement-breakpoint
CREATE UNIQUE INDEX "cms_entry_locale_delivery_value_reference_unique" ON "cms_entry_locale_delivery_current_value" USING btree ("locale_id","collection_id","field_id","reference_value") WHERE "cms_entry_locale_delivery_current_value"."unique_lookup" and "cms_entry_locale_delivery_current_value"."reference_value" is not null;--> statement-breakpoint
CREATE INDEX "cms_entry_locale_delivery_value_publication_idx" ON "cms_entry_locale_delivery_current_value" USING btree ("publication_id");--> statement-breakpoint
