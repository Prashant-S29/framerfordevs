CREATE TABLE "audit_event" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"project_id" uuid,
	"environment_id" uuid,
	"actor_type" varchar(32) NOT NULL,
	"actor_id" text NOT NULL,
	"action" varchar(128) NOT NULL,
	"resource_type" varchar(64) NOT NULL,
	"resource_id" uuid NOT NULL,
	"request_id" varchar(128) NOT NULL,
	"occurred_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "audit_event_actor_type_valid" CHECK ("audit_event"."actor_type" = 'user'),
	CONSTRAINT "audit_event_actor_id_nonempty" CHECK (char_length("audit_event"."actor_id") between 1 and 255),
	CONSTRAINT "audit_event_action_valid" CHECK ("audit_event"."action" ~ '^[a-z][a-z0-9_.-]{0,127}$'),
	CONSTRAINT "audit_event_resource_type_valid" CHECK ("audit_event"."resource_type" ~ '^[a-z][a-z0-9_.-]{0,63}$'),
	CONSTRAINT "audit_event_request_id_valid" CHECK (char_length("audit_event"."request_id") between 1 and 128 and "audit_event"."request_id" ~ '^[A-Za-z0-9._:-]+$'),
	CONSTRAINT "audit_event_environment_scope_complete" CHECK ("audit_event"."environment_id" is null or "audit_event"."project_id" is not null)
);
--> statement-breakpoint
CREATE TABLE "environment" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"project_id" uuid NOT NULL,
	"key" varchar(63) NOT NULL,
	"name" varchar(100) NOT NULL,
	"is_primary" boolean DEFAULT false NOT NULL,
	"created_by_user_id" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "environment_project_key_unique" UNIQUE("project_id","key"),
	CONSTRAINT "environment_id_project_workspace_unique" UNIQUE("id","project_id","workspace_id"),
	CONSTRAINT "environment_key_valid" CHECK ("environment"."key" ~ '^[a-z][a-z0-9-]{0,62}$' and "environment"."key" !~ '--' and right("environment"."key", 1) <> '-'),
	CONSTRAINT "environment_name_valid" CHECK (char_length("environment"."name") between 1 and 100 and "environment"."name" = btrim("environment"."name") and "environment"."name" !~ '[[:cntrl:]]'),
	CONSTRAINT "environment_primary_is_main" CHECK (not "environment"."is_primary" or "environment"."key" = 'main')
);
--> statement-breakpoint
CREATE TABLE "project" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"name" varchar(100) NOT NULL,
	"key" varchar(63) NOT NULL,
	"description" varchar(500),
	"version" integer DEFAULT 1 NOT NULL,
	"created_by_user_id" text NOT NULL,
	"archived_at" timestamp with time zone,
	"archived_by_user_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "project_workspace_key_unique" UNIQUE("workspace_id","key"),
	CONSTRAINT "project_id_workspace_unique" UNIQUE("id","workspace_id"),
	CONSTRAINT "project_name_valid" CHECK (char_length("project"."name") between 1 and 100 and "project"."name" = btrim("project"."name") and "project"."name" !~ '[[:cntrl:]]'),
	CONSTRAINT "project_key_valid" CHECK ("project"."key" ~ '^[a-z][a-z0-9-]{0,62}$' and "project"."key" !~ '--' and right("project"."key", 1) <> '-'),
	CONSTRAINT "project_description_trimmed" CHECK ("project"."description" is null or "project"."description" = btrim("project"."description")),
	CONSTRAINT "project_version_positive" CHECK ("project"."version" > 0),
	CONSTRAINT "project_archive_fields_consistent" CHECK (("project"."archived_at" is null and "project"."archived_by_user_id" is null) or ("project"."archived_at" is not null and "project"."archived_by_user_id" is not null))
);
--> statement-breakpoint
CREATE TABLE "project_capability" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"project_id" uuid NOT NULL,
	"key" varchar(63) NOT NULL,
	"status" varchar(16) NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"changed_by_user_id" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "project_capability_project_key_unique" UNIQUE("project_id","key"),
	CONSTRAINT "project_capability_key_valid" CHECK ("project_capability"."key" ~ '^[a-z][a-z0-9_]{0,62}$'),
	CONSTRAINT "project_capability_status_valid" CHECK ("project_capability"."status" in ('enabled', 'disabled')),
	CONSTRAINT "project_capability_version_positive" CHECK ("project_capability"."version" > 0)
);
--> statement-breakpoint
CREATE TABLE "workspace" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"name" varchar(100) NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"created_by_user_id" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "workspace_name_valid" CHECK (char_length("workspace"."name") between 1 and 100 and "workspace"."name" = btrim("workspace"."name") and "workspace"."name" !~ '[[:cntrl:]]'),
	CONSTRAINT "workspace_version_positive" CHECK ("workspace"."version" > 0)
);
--> statement-breakpoint
CREATE TABLE "workspace_membership" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"user_id" text NOT NULL,
	"role" varchar(32) DEFAULT 'owner' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "workspace_membership_workspace_user_unique" UNIQUE("workspace_id","user_id"),
	CONSTRAINT "workspace_membership_role_valid" CHECK ("workspace_membership"."role" = 'owner')
);
--> statement-breakpoint
ALTER TABLE "audit_event" ADD CONSTRAINT "audit_event_workspace_id_workspace_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspace"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "audit_event" ADD CONSTRAINT "audit_event_project_workspace_fk" FOREIGN KEY ("project_id","workspace_id") REFERENCES "public"."project"("id","workspace_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "audit_event" ADD CONSTRAINT "audit_event_environment_project_workspace_fk" FOREIGN KEY ("environment_id","project_id","workspace_id") REFERENCES "public"."environment"("id","project_id","workspace_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "environment" ADD CONSTRAINT "environment_created_by_user_id_user_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."user"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "environment" ADD CONSTRAINT "environment_project_workspace_fk" FOREIGN KEY ("project_id","workspace_id") REFERENCES "public"."project"("id","workspace_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project" ADD CONSTRAINT "project_workspace_id_workspace_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspace"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project" ADD CONSTRAINT "project_created_by_user_id_user_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."user"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project" ADD CONSTRAINT "project_archived_by_user_id_user_id_fk" FOREIGN KEY ("archived_by_user_id") REFERENCES "public"."user"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project_capability" ADD CONSTRAINT "project_capability_changed_by_user_id_user_id_fk" FOREIGN KEY ("changed_by_user_id") REFERENCES "public"."user"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project_capability" ADD CONSTRAINT "project_capability_project_workspace_fk" FOREIGN KEY ("project_id","workspace_id") REFERENCES "public"."project"("id","workspace_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workspace" ADD CONSTRAINT "workspace_created_by_user_id_user_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."user"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workspace_membership" ADD CONSTRAINT "workspace_membership_workspace_id_workspace_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspace"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workspace_membership" ADD CONSTRAINT "workspace_membership_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "audit_event_workspace_occurred_id_idx" ON "audit_event" USING btree ("workspace_id","occurred_at" DESC NULLS LAST,"id" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "audit_event_project_occurred_id_idx" ON "audit_event" USING btree ("project_id","occurred_at" DESC NULLS LAST,"id" DESC NULLS LAST) WHERE "audit_event"."project_id" is not null;--> statement-breakpoint
CREATE INDEX "audit_event_environment_idx" ON "audit_event" USING btree ("environment_id") WHERE "audit_event"."environment_id" is not null;--> statement-breakpoint
CREATE UNIQUE INDEX "environment_project_primary_unique" ON "environment" USING btree ("project_id") WHERE "environment"."is_primary";--> statement-breakpoint
CREATE INDEX "environment_created_by_user_idx" ON "environment" USING btree ("created_by_user_id");--> statement-breakpoint
CREATE INDEX "project_workspace_active_created_id_idx" ON "project" USING btree ("workspace_id","created_at" DESC NULLS LAST,"id" DESC NULLS LAST) WHERE "project"."archived_at" is null;--> statement-breakpoint
CREATE INDEX "project_workspace_archived_at_id_idx" ON "project" USING btree ("workspace_id","archived_at" DESC NULLS LAST,"id" DESC NULLS LAST) WHERE "project"."archived_at" is not null;--> statement-breakpoint
CREATE INDEX "project_created_by_user_idx" ON "project" USING btree ("created_by_user_id");--> statement-breakpoint
CREATE INDEX "project_archived_by_user_idx" ON "project" USING btree ("archived_by_user_id") WHERE "project"."archived_by_user_id" is not null;--> statement-breakpoint
CREATE INDEX "project_capability_changed_by_user_idx" ON "project_capability" USING btree ("changed_by_user_id");--> statement-breakpoint
CREATE INDEX "workspace_created_by_user_idx" ON "workspace" USING btree ("created_by_user_id");--> statement-breakpoint
CREATE INDEX "workspace_membership_user_created_id_idx" ON "workspace_membership" USING btree ("user_id","created_at" DESC NULLS LAST,"id" DESC NULLS LAST);