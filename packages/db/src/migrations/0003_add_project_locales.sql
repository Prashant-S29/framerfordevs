CREATE TABLE "project_locale" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"project_id" uuid NOT NULL,
	"tag" varchar(64) NOT NULL,
	"display_name" varchar(100) NOT NULL,
	"status" varchar(16) DEFAULT 'enabled' NOT NULL,
	"position" integer,
	"version" integer DEFAULT 1 NOT NULL,
	"created_by_user_id" text NOT NULL,
	"changed_by_user_id" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "project_locale_id_project_workspace_unique" UNIQUE("id","project_id","workspace_id"),
	CONSTRAINT "project_locale_tag_valid" CHECK (char_length("project_locale"."tag") between 1 and 64 and "project_locale"."tag" = btrim("project_locale"."tag") and "project_locale"."tag" ~ '^[A-Za-z0-9]+(-[A-Za-z0-9]+)*$'),
	CONSTRAINT "project_locale_display_name_valid" CHECK (char_length("project_locale"."display_name") between 1 and 100 and "project_locale"."display_name" = btrim("project_locale"."display_name") and "project_locale"."display_name" !~ '[[:cntrl:]]'),
	CONSTRAINT "project_locale_status_valid" CHECK ("project_locale"."status" in ('enabled', 'disabled', 'removed')),
	CONSTRAINT "project_locale_position_consistent" CHECK (("project_locale"."status" = 'removed' and "project_locale"."position" is null) or ("project_locale"."status" in ('enabled', 'disabled') and "project_locale"."position" >= 0)),
	CONSTRAINT "project_locale_version_positive" CHECK ("project_locale"."version" > 0),
	CONSTRAINT "project_locale_english_enabled" CHECK (lower("project_locale"."tag") <> 'en' or "project_locale"."status" = 'enabled')
);
--> statement-breakpoint
CREATE TABLE "project_membership_locale_access" (
	"membership_id" uuid NOT NULL,
	"workspace_id" uuid NOT NULL,
	"project_id" uuid NOT NULL,
	"locale_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "project_membership_locale_access_membership_locale_pk" PRIMARY KEY("membership_id","locale_id")
);
--> statement-breakpoint
ALTER TABLE "project_membership" ADD COLUMN "locale_access_mode" varchar(16) DEFAULT 'all' NOT NULL;--> statement-breakpoint
ALTER TABLE "project_locale" ADD CONSTRAINT "project_locale_created_by_user_id_user_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."user"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project_locale" ADD CONSTRAINT "project_locale_changed_by_user_id_user_id_fk" FOREIGN KEY ("changed_by_user_id") REFERENCES "public"."user"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project_locale" ADD CONSTRAINT "project_locale_project_workspace_fk" FOREIGN KEY ("project_id","workspace_id") REFERENCES "public"."project"("id","workspace_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
INSERT INTO "project_locale" (
	"workspace_id",
	"project_id",
	"tag",
	"display_name",
	"status",
	"position",
	"version",
	"created_by_user_id",
	"changed_by_user_id",
	"created_at",
	"updated_at"
)
SELECT
	"existing_project"."workspace_id",
	"existing_project"."id",
	'en',
	'English',
	'enabled',
	0,
	1,
	"existing_project"."created_by_user_id",
	"existing_project"."created_by_user_id",
	"existing_project"."created_at",
	"existing_project"."updated_at"
FROM "project" AS "existing_project";--> statement-breakpoint
ALTER TABLE "project_membership_locale_access" ADD CONSTRAINT "project_membership_locale_access_membership_tenant_fk" FOREIGN KEY ("membership_id","project_id","workspace_id") REFERENCES "public"."project_membership"("id","project_id","workspace_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project_membership_locale_access" ADD CONSTRAINT "project_membership_locale_access_locale_tenant_fk" FOREIGN KEY ("locale_id","project_id","workspace_id") REFERENCES "public"."project_locale"("id","project_id","workspace_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "project_locale_project_tag_ci_unique" ON "project_locale" USING btree ("project_id",lower("tag"));--> statement-breakpoint
CREATE UNIQUE INDEX "project_locale_project_position_unique" ON "project_locale" USING btree ("project_id","position") WHERE "project_locale"."position" is not null;--> statement-breakpoint
CREATE INDEX "project_locale_project_active_position_id_idx" ON "project_locale" USING btree ("project_id","position","id") WHERE "project_locale"."status" <> 'removed';--> statement-breakpoint
CREATE INDEX "project_locale_created_by_user_idx" ON "project_locale" USING btree ("created_by_user_id");--> statement-breakpoint
CREATE INDEX "project_locale_changed_by_user_idx" ON "project_locale" USING btree ("changed_by_user_id");--> statement-breakpoint
CREATE INDEX "project_membership_locale_access_locale_idx" ON "project_membership_locale_access" USING btree ("locale_id");--> statement-breakpoint
ALTER TABLE "project_membership" ADD CONSTRAINT "project_membership_locale_access_mode_valid" CHECK ("project_membership"."locale_access_mode" in ('all', 'selected', 'none'));--> statement-breakpoint
ALTER TABLE "project_membership" ADD CONSTRAINT "project_membership_owner_locale_access_all" CHECK ("project_membership"."role" <> 'owner' or "project_membership"."locale_access_mode" = 'all');