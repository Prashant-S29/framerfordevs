CREATE TABLE "control_plane_command_receipt" (
	"command_id" uuid PRIMARY KEY NOT NULL,
	"operation" varchar(64) NOT NULL,
	"actor_type" varchar(16) NOT NULL,
	"actor_id" text NOT NULL,
	"fingerprint" char(64) NOT NULL,
	"workspace_id" uuid NOT NULL,
	"project_id" uuid,
	"environment_id" uuid,
	"result_resource_type" varchar(64) NOT NULL,
	"result_resource_id" uuid NOT NULL,
	"result_disposition" varchar(16) NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "control_plane_command_receipt_operation_valid" CHECK ("control_plane_command_receipt"."operation" in ('workspace.create', 'project.create', 'project.capability.enable', 'studio_registration.put')),
	CONSTRAINT "control_plane_command_receipt_actor_valid" CHECK (("control_plane_command_receipt"."actor_type" = 'user' and char_length("control_plane_command_receipt"."actor_id") between 1 and 255 and "control_plane_command_receipt"."actor_id" !~ '[[:cntrl:]]') or ("control_plane_command_receipt"."actor_type" = 'credential' and "control_plane_command_receipt"."actor_id" ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$')),
	CONSTRAINT "control_plane_command_receipt_fingerprint_valid" CHECK ("control_plane_command_receipt"."fingerprint" ~ '^[0-9a-f]{64}$'),
	CONSTRAINT "control_plane_command_receipt_result_type_valid" CHECK ("control_plane_command_receipt"."result_resource_type" in ('workspace', 'project', 'project_capability', 'studio_registration')),
	CONSTRAINT "control_plane_command_receipt_disposition_valid" CHECK ("control_plane_command_receipt"."result_disposition" in ('created', 'updated', 'no_op')),
	CONSTRAINT "control_plane_command_receipt_scope_result_valid" CHECK (("control_plane_command_receipt"."operation" = 'workspace.create' and "control_plane_command_receipt"."actor_type" = 'user' and "control_plane_command_receipt"."project_id" is null and "control_plane_command_receipt"."environment_id" is null and "control_plane_command_receipt"."result_resource_type" = 'workspace' and "control_plane_command_receipt"."result_resource_id" = "control_plane_command_receipt"."workspace_id" and "control_plane_command_receipt"."result_disposition" = 'created') or ("control_plane_command_receipt"."operation" = 'project.create' and "control_plane_command_receipt"."actor_type" = 'user' and "control_plane_command_receipt"."project_id" is not null and "control_plane_command_receipt"."environment_id" is null and "control_plane_command_receipt"."result_resource_type" = 'project' and "control_plane_command_receipt"."result_resource_id" = "control_plane_command_receipt"."project_id" and "control_plane_command_receipt"."result_disposition" = 'created') or ("control_plane_command_receipt"."operation" = 'project.capability.enable' and "control_plane_command_receipt"."project_id" is not null and "control_plane_command_receipt"."environment_id" is not null and "control_plane_command_receipt"."result_resource_type" = 'project_capability' and "control_plane_command_receipt"."result_disposition" = 'created') or ("control_plane_command_receipt"."operation" = 'studio_registration.put' and "control_plane_command_receipt"."project_id" is not null and "control_plane_command_receipt"."environment_id" is not null and "control_plane_command_receipt"."result_resource_type" = 'studio_registration'))
);
--> statement-breakpoint
CREATE TABLE "studio_registration" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"project_id" uuid NOT NULL,
	"environment_id" uuid NOT NULL,
	"application_origin" varchar(2048) NOT NULL,
	"mount_path" varchar(240) NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"created_by_user_id" text,
	"created_by_credential_id" uuid,
	"changed_by_user_id" text,
	"changed_by_credential_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "studio_registration_environment_unique" UNIQUE("environment_id"),
	CONSTRAINT "studio_registration_id_tenant_unique" UNIQUE("id","workspace_id","project_id","environment_id"),
	CONSTRAINT "studio_registration_created_actor_exactly_one" CHECK (num_nonnulls("studio_registration"."created_by_user_id", "studio_registration"."created_by_credential_id") = 1),
	CONSTRAINT "studio_registration_changed_actor_exactly_one" CHECK (num_nonnulls("studio_registration"."changed_by_user_id", "studio_registration"."changed_by_credential_id") = 1),
	CONSTRAINT "studio_registration_application_origin_valid" CHECK (octet_length("studio_registration"."application_origin") between 1 and 2048 and "studio_registration"."application_origin" = btrim("studio_registration"."application_origin") and "studio_registration"."application_origin" !~ '[[:cntrl:]]' and position(chr(92) in "studio_registration"."application_origin") = 0 and ("studio_registration"."application_origin" ~ '^https://[^/?#@[:space:]]+$' or "studio_registration"."application_origin" ~ '^http://(localhost|127[.]0[.]0[.]1)(:[0-9]{1,5})?$' or "studio_registration"."application_origin" = 'http://[::1]' or (left("studio_registration"."application_origin", 13) = 'http://[::1]:' and substring("studio_registration"."application_origin" from 14) ~ '^[0-9]{1,5}$'))),
	CONSTRAINT "studio_registration_mount_path_valid" CHECK (octet_length("studio_registration"."mount_path") between 1 and 240 and "studio_registration"."mount_path" = btrim("studio_registration"."mount_path") and left("studio_registration"."mount_path", 1) = '/' and "studio_registration"."mount_path" <> '/' and right("studio_registration"."mount_path", 1) <> '/' and "studio_registration"."mount_path" !~ '[[:cntrl:][:space:]?#%]' and position(chr(92) in "studio_registration"."mount_path") = 0 and position('//' in "studio_registration"."mount_path") = 0 and "studio_registration"."mount_path" !~ '(^|/)[.]{1,2}(/|$)'),
	CONSTRAINT "studio_registration_version_positive" CHECK ("studio_registration"."version" > 0)
);
--> statement-breakpoint
DROP INDEX "project_capability_changed_by_user_idx";--> statement-breakpoint
ALTER TABLE "project_capability" ALTER COLUMN "changed_by_user_id" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "project_capability" ADD COLUMN "changed_by_credential_id" uuid;--> statement-breakpoint
ALTER TABLE "project_capability" ADD COLUMN "changed_by_credential_environment_id" uuid;--> statement-breakpoint
ALTER TABLE "control_plane_command_receipt" ADD CONSTRAINT "control_plane_command_receipt_workspace_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspace"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "control_plane_command_receipt" ADD CONSTRAINT "control_plane_command_receipt_project_workspace_fk" FOREIGN KEY ("project_id","workspace_id") REFERENCES "public"."project"("id","workspace_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "control_plane_command_receipt" ADD CONSTRAINT "control_plane_command_receipt_environment_tenant_fk" FOREIGN KEY ("environment_id","project_id","workspace_id") REFERENCES "public"."environment"("id","project_id","workspace_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "studio_registration" ADD CONSTRAINT "studio_registration_created_by_user_id_user_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."user"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "studio_registration" ADD CONSTRAINT "studio_registration_changed_by_user_id_user_id_fk" FOREIGN KEY ("changed_by_user_id") REFERENCES "public"."user"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "studio_registration" ADD CONSTRAINT "studio_registration_environment_tenant_fk" FOREIGN KEY ("environment_id","project_id","workspace_id") REFERENCES "public"."environment"("id","project_id","workspace_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "studio_registration" ADD CONSTRAINT "studio_registration_created_credential_tenant_fk" FOREIGN KEY ("created_by_credential_id","workspace_id","project_id","environment_id") REFERENCES "public"."api_credential"("id","workspace_id","project_id","environment_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "studio_registration" ADD CONSTRAINT "studio_registration_changed_credential_tenant_fk" FOREIGN KEY ("changed_by_credential_id","workspace_id","project_id","environment_id") REFERENCES "public"."api_credential"("id","workspace_id","project_id","environment_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "control_plane_command_receipt_actor_operation_created_idx" ON "control_plane_command_receipt" USING btree ("actor_type","actor_id","operation","created_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "control_plane_command_receipt_tenant_result_idx" ON "control_plane_command_receipt" USING btree ("workspace_id","project_id","environment_id","result_resource_type","result_resource_id");--> statement-breakpoint
CREATE INDEX "control_plane_command_receipt_created_at_idx" ON "control_plane_command_receipt" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "studio_registration_created_by_user_idx" ON "studio_registration" USING btree ("created_by_user_id") WHERE "studio_registration"."created_by_user_id" is not null;--> statement-breakpoint
CREATE INDEX "studio_registration_changed_by_user_idx" ON "studio_registration" USING btree ("changed_by_user_id") WHERE "studio_registration"."changed_by_user_id" is not null;--> statement-breakpoint
CREATE INDEX "studio_registration_created_by_credential_idx" ON "studio_registration" USING btree ("created_by_credential_id") WHERE "studio_registration"."created_by_credential_id" is not null;--> statement-breakpoint
CREATE INDEX "studio_registration_changed_by_credential_idx" ON "studio_registration" USING btree ("changed_by_credential_id") WHERE "studio_registration"."changed_by_credential_id" is not null;--> statement-breakpoint
ALTER TABLE "project_capability" ADD CONSTRAINT "project_capability_changed_credential_tenant_fk" FOREIGN KEY ("changed_by_credential_id","workspace_id","project_id","changed_by_credential_environment_id") REFERENCES "public"."api_credential"("id","workspace_id","project_id","environment_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "project_capability_changed_by_credential_idx" ON "project_capability" USING btree ("changed_by_credential_id","changed_by_credential_environment_id") WHERE "project_capability"."changed_by_credential_id" is not null;--> statement-breakpoint
CREATE INDEX "project_capability_changed_by_user_idx" ON "project_capability" USING btree ("changed_by_user_id") WHERE "project_capability"."changed_by_user_id" is not null;--> statement-breakpoint
ALTER TABLE "project_capability" ADD CONSTRAINT "project_capability_changed_actor_exactly_one" CHECK (("project_capability"."changed_by_user_id" is not null and "project_capability"."changed_by_credential_id" is null and "project_capability"."changed_by_credential_environment_id" is null) or ("project_capability"."changed_by_user_id" is null and "project_capability"."changed_by_credential_id" is not null and "project_capability"."changed_by_credential_environment_id" is not null));