CREATE TABLE "api_credential" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"project_id" uuid NOT NULL,
	"environment_id" uuid NOT NULL,
	"family" varchar(16) NOT NULL,
	"name" varchar(100) NOT NULL,
	"key_prefix" varchar(64) NOT NULL,
	"key_digest" char(64) NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"rotated_from_credential_id" uuid,
	"created_by_user_id" text NOT NULL,
	"expires_at" timestamp with time zone,
	"revoked_at" timestamp with time zone,
	"revoked_by_user_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "api_credential_id_tenant_unique" UNIQUE("id","workspace_id","project_id","environment_id"),
	CONSTRAINT "api_credential_key_digest_unique" UNIQUE("key_digest"),
	CONSTRAINT "api_credential_family_valid" CHECK ("api_credential"."family" in ('management', 'delivery', 'preview')),
	CONSTRAINT "api_credential_name_valid" CHECK (char_length("api_credential"."name") between 1 and 100 and "api_credential"."name" = btrim("api_credential"."name") and "api_credential"."name" !~ '[[:cntrl:]]'),
	CONSTRAINT "api_credential_key_prefix_valid" CHECK (("api_credential"."family" = 'management' and "api_credential"."key_prefix" = 'ffd_mgmt_' || "api_credential"."id"::text) or ("api_credential"."family" = 'delivery' and "api_credential"."key_prefix" = 'ffd_del_' || "api_credential"."id"::text) or ("api_credential"."family" = 'preview' and "api_credential"."key_prefix" = 'ffd_prev_' || "api_credential"."id"::text)),
	CONSTRAINT "api_credential_key_digest_valid" CHECK ("api_credential"."key_digest" ~ '^[0-9a-f]{64}$'),
	CONSTRAINT "api_credential_version_positive" CHECK ("api_credential"."version" > 0),
	CONSTRAINT "api_credential_expiry_valid" CHECK ("api_credential"."expires_at" is null or "api_credential"."expires_at" > "api_credential"."created_at"),
	CONSTRAINT "api_credential_revocation_consistent" CHECK (("api_credential"."revoked_at" is null and "api_credential"."revoked_by_user_id" is null) or ("api_credential"."revoked_at" is not null and "api_credential"."revoked_by_user_id" is not null))
);
--> statement-breakpoint
CREATE TABLE "api_credential_scope" (
	"credential_id" uuid NOT NULL,
	"workspace_id" uuid NOT NULL,
	"project_id" uuid NOT NULL,
	"environment_id" uuid NOT NULL,
	"scope" varchar(64) NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "api_credential_scope_credential_scope_pk" PRIMARY KEY("credential_id","scope"),
	CONSTRAINT "api_credential_scope_valid" CHECK ("api_credential_scope"."scope" in ('project.read', 'project.update', 'project.capability.manage', 'locale.read', 'locale.manage', 'schema.read', 'schema.write', 'schema.publish', 'content.read', 'content.write', 'content.review', 'content.publish', 'webhook.read', 'webhook.manage', 'delivery.read', 'preview.read'))
);
--> statement-breakpoint
CREATE TABLE "project_invitation" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"project_id" uuid NOT NULL,
	"email" varchar(320) NOT NULL,
	"role" varchar(32) NOT NULL,
	"token_digest" char(64) NOT NULL,
	"status" varchar(16) DEFAULT 'pending' NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"invited_by_user_id" text NOT NULL,
	"accepted_by_user_id" text,
	"revoked_by_user_id" text,
	"expires_at" timestamp with time zone NOT NULL,
	"accepted_at" timestamp with time zone,
	"revoked_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "project_invitation_token_digest_unique" UNIQUE("token_digest"),
	CONSTRAINT "project_invitation_email_canonical" CHECK (char_length("project_invitation"."email") between 3 and 320 and "project_invitation"."email" = lower(btrim("project_invitation"."email")) and "project_invitation"."email" !~ '[[:cntrl:]]'),
	CONSTRAINT "project_invitation_role_valid" CHECK ("project_invitation"."role" in ('owner', 'developer', 'content_admin', 'editor', 'reviewer', 'client_editor', 'read_only')),
	CONSTRAINT "project_invitation_token_digest_valid" CHECK ("project_invitation"."token_digest" ~ '^[0-9a-f]{64}$'),
	CONSTRAINT "project_invitation_status_valid" CHECK ("project_invitation"."status" in ('pending', 'accepted', 'revoked', 'expired')),
	CONSTRAINT "project_invitation_version_positive" CHECK ("project_invitation"."version" > 0),
	CONSTRAINT "project_invitation_expiry_valid" CHECK ("project_invitation"."expires_at" > "project_invitation"."created_at"),
	CONSTRAINT "project_invitation_lifecycle_consistent" CHECK (("project_invitation"."status" in ('pending', 'expired') and "project_invitation"."accepted_at" is null and "project_invitation"."accepted_by_user_id" is null and "project_invitation"."revoked_at" is null and "project_invitation"."revoked_by_user_id" is null) or ("project_invitation"."status" = 'accepted' and "project_invitation"."accepted_at" is not null and "project_invitation"."accepted_by_user_id" is not null and "project_invitation"."revoked_at" is null and "project_invitation"."revoked_by_user_id" is null) or ("project_invitation"."status" = 'revoked' and "project_invitation"."accepted_at" is null and "project_invitation"."accepted_by_user_id" is null and "project_invitation"."revoked_at" is not null and "project_invitation"."revoked_by_user_id" is not null))
);
--> statement-breakpoint
CREATE TABLE "project_membership" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"project_id" uuid NOT NULL,
	"user_id" text NOT NULL,
	"role" varchar(32) NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"created_by_user_id" text NOT NULL,
	"removed_at" timestamp with time zone,
	"removed_by_user_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "project_membership_project_user_unique" UNIQUE("project_id","user_id"),
	CONSTRAINT "project_membership_id_project_workspace_unique" UNIQUE("id","project_id","workspace_id"),
	CONSTRAINT "project_membership_role_valid" CHECK ("project_membership"."role" in ('owner', 'developer', 'content_admin', 'editor', 'reviewer', 'client_editor', 'read_only')),
	CONSTRAINT "project_membership_version_positive" CHECK ("project_membership"."version" > 0),
	CONSTRAINT "project_membership_removal_consistent" CHECK (("project_membership"."removed_at" is null and "project_membership"."removed_by_user_id" is null) or ("project_membership"."removed_at" is not null and "project_membership"."removed_by_user_id" is not null))
);
--> statement-breakpoint
ALTER TABLE "audit_event" DROP CONSTRAINT "audit_event_actor_type_valid";--> statement-breakpoint
ALTER TABLE "workspace_membership" DROP CONSTRAINT "workspace_membership_role_valid";--> statement-breakpoint
DROP INDEX "workspace_membership_user_created_id_idx";--> statement-breakpoint
ALTER TABLE "workspace_membership" ADD COLUMN "version" integer DEFAULT 1 NOT NULL;--> statement-breakpoint
ALTER TABLE "workspace_membership" ADD COLUMN "revoked_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "workspace_membership" ADD COLUMN "revoked_by_user_id" text;--> statement-breakpoint
ALTER TABLE "workspace_membership" ADD COLUMN "updated_at" timestamp with time zone DEFAULT now() NOT NULL;--> statement-breakpoint
ALTER TABLE "api_credential" ADD CONSTRAINT "api_credential_created_by_user_id_user_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."user"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "api_credential" ADD CONSTRAINT "api_credential_revoked_by_user_id_user_id_fk" FOREIGN KEY ("revoked_by_user_id") REFERENCES "public"."user"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "api_credential" ADD CONSTRAINT "api_credential_environment_project_workspace_fk" FOREIGN KEY ("environment_id","project_id","workspace_id") REFERENCES "public"."environment"("id","project_id","workspace_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "api_credential" ADD CONSTRAINT "api_credential_rotation_predecessor_fk" FOREIGN KEY ("rotated_from_credential_id","workspace_id","project_id","environment_id") REFERENCES "public"."api_credential"("id","workspace_id","project_id","environment_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "api_credential_scope" ADD CONSTRAINT "api_credential_scope_credential_tenant_fk" FOREIGN KEY ("credential_id","workspace_id","project_id","environment_id") REFERENCES "public"."api_credential"("id","workspace_id","project_id","environment_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project_invitation" ADD CONSTRAINT "project_invitation_invited_by_user_id_user_id_fk" FOREIGN KEY ("invited_by_user_id") REFERENCES "public"."user"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project_invitation" ADD CONSTRAINT "project_invitation_accepted_by_user_id_user_id_fk" FOREIGN KEY ("accepted_by_user_id") REFERENCES "public"."user"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project_invitation" ADD CONSTRAINT "project_invitation_revoked_by_user_id_user_id_fk" FOREIGN KEY ("revoked_by_user_id") REFERENCES "public"."user"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project_invitation" ADD CONSTRAINT "project_invitation_project_workspace_fk" FOREIGN KEY ("project_id","workspace_id") REFERENCES "public"."project"("id","workspace_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project_membership" ADD CONSTRAINT "project_membership_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project_membership" ADD CONSTRAINT "project_membership_created_by_user_id_user_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."user"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project_membership" ADD CONSTRAINT "project_membership_removed_by_user_id_user_id_fk" FOREIGN KEY ("removed_by_user_id") REFERENCES "public"."user"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project_membership" ADD CONSTRAINT "project_membership_project_workspace_fk" FOREIGN KEY ("project_id","workspace_id") REFERENCES "public"."project"("id","workspace_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
INSERT INTO "project_membership" (
	"workspace_id",
	"project_id",
	"user_id",
	"role",
	"created_by_user_id",
	"created_at",
	"updated_at"
)
SELECT
	"existing_project"."workspace_id",
	"existing_project"."id",
	"existing_project"."created_by_user_id",
	'owner',
	"existing_project"."created_by_user_id",
	"existing_project"."created_at",
	"existing_project"."updated_at"
FROM "project" AS "existing_project";--> statement-breakpoint
CREATE UNIQUE INDEX "api_credential_rotated_from_unique" ON "api_credential" USING btree ("rotated_from_credential_id") WHERE "api_credential"."rotated_from_credential_id" is not null;--> statement-breakpoint
CREATE INDEX "api_credential_project_environment_active_family_created_id_idx" ON "api_credential" USING btree ("project_id","environment_id","family","created_at" DESC NULLS LAST,"id" DESC NULLS LAST) WHERE "api_credential"."revoked_at" is null;--> statement-breakpoint
CREATE INDEX "api_credential_environment_idx" ON "api_credential" USING btree ("environment_id");--> statement-breakpoint
CREATE INDEX "api_credential_created_by_user_idx" ON "api_credential" USING btree ("created_by_user_id");--> statement-breakpoint
CREATE INDEX "api_credential_revoked_by_user_idx" ON "api_credential" USING btree ("revoked_by_user_id") WHERE "api_credential"."revoked_by_user_id" is not null;--> statement-breakpoint
CREATE UNIQUE INDEX "project_invitation_project_pending_email_unique" ON "project_invitation" USING btree ("project_id","email") WHERE "project_invitation"."status" = 'pending';--> statement-breakpoint
CREATE INDEX "project_invitation_project_status_created_id_idx" ON "project_invitation" USING btree ("project_id","status","created_at" DESC NULLS LAST,"id" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "project_invitation_invited_by_user_idx" ON "project_invitation" USING btree ("invited_by_user_id");--> statement-breakpoint
CREATE INDEX "project_invitation_accepted_by_user_idx" ON "project_invitation" USING btree ("accepted_by_user_id") WHERE "project_invitation"."accepted_by_user_id" is not null;--> statement-breakpoint
CREATE INDEX "project_invitation_revoked_by_user_idx" ON "project_invitation" USING btree ("revoked_by_user_id") WHERE "project_invitation"."revoked_by_user_id" is not null;--> statement-breakpoint
CREATE INDEX "project_membership_user_active_created_id_idx" ON "project_membership" USING btree ("user_id","created_at" DESC NULLS LAST,"id" DESC NULLS LAST) WHERE "project_membership"."removed_at" is null;--> statement-breakpoint
CREATE INDEX "project_membership_workspace_active_created_id_idx" ON "project_membership" USING btree ("workspace_id","created_at" DESC NULLS LAST,"id" DESC NULLS LAST) WHERE "project_membership"."removed_at" is null;--> statement-breakpoint
CREATE INDEX "project_membership_project_active_created_id_idx" ON "project_membership" USING btree ("project_id","created_at" DESC NULLS LAST,"id" DESC NULLS LAST) WHERE "project_membership"."removed_at" is null;--> statement-breakpoint
CREATE INDEX "project_membership_project_active_owner_idx" ON "project_membership" USING btree ("project_id") WHERE "project_membership"."removed_at" is null and "project_membership"."role" = 'owner';--> statement-breakpoint
CREATE INDEX "project_membership_created_by_user_idx" ON "project_membership" USING btree ("created_by_user_id");--> statement-breakpoint
CREATE INDEX "project_membership_removed_by_user_idx" ON "project_membership" USING btree ("removed_by_user_id") WHERE "project_membership"."removed_by_user_id" is not null;--> statement-breakpoint
ALTER TABLE "workspace_membership" ADD CONSTRAINT "workspace_membership_revoked_by_user_id_user_id_fk" FOREIGN KEY ("revoked_by_user_id") REFERENCES "public"."user"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "workspace_membership_user_active_created_id_idx" ON "workspace_membership" USING btree ("user_id","created_at" DESC NULLS LAST,"id" DESC NULLS LAST) WHERE "workspace_membership"."revoked_at" is null;--> statement-breakpoint
CREATE INDEX "workspace_membership_revoked_by_user_idx" ON "workspace_membership" USING btree ("revoked_by_user_id") WHERE "workspace_membership"."revoked_by_user_id" is not null;--> statement-breakpoint
ALTER TABLE "audit_event" ADD CONSTRAINT "audit_event_actor_type_valid" CHECK ("audit_event"."actor_type" in ('user', 'credential'));--> statement-breakpoint
ALTER TABLE "workspace_membership" ADD CONSTRAINT "workspace_membership_version_positive" CHECK ("workspace_membership"."version" > 0);--> statement-breakpoint
ALTER TABLE "workspace_membership" ADD CONSTRAINT "workspace_membership_revocation_consistent" CHECK (("workspace_membership"."revoked_at" is null and "workspace_membership"."revoked_by_user_id" is null) or ("workspace_membership"."revoked_at" is not null and "workspace_membership"."revoked_by_user_id" is not null));--> statement-breakpoint
ALTER TABLE "workspace_membership" ADD CONSTRAINT "workspace_membership_role_valid" CHECK ("workspace_membership"."role" in ('owner', 'collaborator'));