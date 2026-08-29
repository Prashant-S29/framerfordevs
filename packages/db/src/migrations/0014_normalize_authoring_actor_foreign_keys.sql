ALTER TABLE "cms_collection" DROP CONSTRAINT "cms_collection_created_by_credential_id_api_credential_id_fk";
--> statement-breakpoint
ALTER TABLE "cms_collection" DROP CONSTRAINT "cms_collection_changed_by_credential_id_api_credential_id_fk";
--> statement-breakpoint
ALTER TABLE "cms_collection_delivery_config" DROP CONSTRAINT "cms_collection_delivery_config_changed_by_credential_id_api_credential_id_fk";
--> statement-breakpoint
ALTER TABLE "cms_collection_field" DROP CONSTRAINT "cms_collection_field_created_by_credential_id_api_credential_id_fk";
--> statement-breakpoint
ALTER TABLE "cms_collection_field" DROP CONSTRAINT "cms_collection_field_changed_by_credential_id_api_credential_id_fk";
--> statement-breakpoint
ALTER TABLE "cms_collection_field" DROP CONSTRAINT "cms_collection_field_removed_by_credential_id_api_credential_id_fk";
--> statement-breakpoint
ALTER TABLE "cms_collection_schema_head" DROP CONSTRAINT "cms_collection_schema_head_changed_by_credential_id_api_credential_id_fk";
--> statement-breakpoint
ALTER TABLE "cms_entry" DROP CONSTRAINT "cms_entry_created_by_credential_id_api_credential_id_fk";
--> statement-breakpoint
ALTER TABLE "cms_entry" DROP CONSTRAINT "cms_entry_changed_by_credential_id_api_credential_id_fk";
--> statement-breakpoint
ALTER TABLE "cms_entry_draft_command" DROP CONSTRAINT "cms_entry_draft_command_completed_by_credential_id_api_credential_id_fk";
--> statement-breakpoint
ALTER TABLE "cms_entry_locale_draft" DROP CONSTRAINT "cms_entry_locale_draft_changed_by_credential_id_api_credential_id_fk";
--> statement-breakpoint
ALTER TABLE "cms_entry_locale_publication" DROP CONSTRAINT "cms_entry_locale_publication_published_by_credential_id_api_credential_id_fk";
--> statement-breakpoint
ALTER TABLE "cms_entry_locale_publication_head" DROP CONSTRAINT "cms_entry_locale_publication_head_changed_by_credential_id_api_credential_id_fk";
--> statement-breakpoint
ALTER TABLE "cms_entry_locale_revision" DROP CONSTRAINT "cms_entry_locale_revision_authored_by_credential_id_api_credential_id_fk";
--> statement-breakpoint
ALTER TABLE "cms_entry_publication_command" DROP CONSTRAINT "cms_entry_publication_command_completed_by_credential_id_api_credential_id_fk";
--> statement-breakpoint
ALTER TABLE "cms_entry_shared_draft" DROP CONSTRAINT "cms_entry_shared_draft_changed_by_credential_id_api_credential_id_fk";
--> statement-breakpoint
ALTER TABLE "cms_entry_shared_revision" DROP CONSTRAINT "cms_entry_shared_revision_authored_by_credential_id_api_credential_id_fk";
--> statement-breakpoint
ALTER TABLE "cms_enum_option_source_identity" DROP CONSTRAINT "cms_enum_option_source_identity_created_by_credential_id_api_credential_id_fk";
--> statement-breakpoint
ALTER TABLE "cms_enum_option_source_identity" DROP CONSTRAINT "cms_enum_option_source_identity_retired_by_credential_id_api_credential_id_fk";
--> statement-breakpoint
ALTER TABLE "cms_project_schema_apply_command" DROP CONSTRAINT "cms_project_schema_apply_command_completed_by_user_id_user_id_fk";
--> statement-breakpoint
ALTER TABLE "cms_project_schema_apply_command" DROP CONSTRAINT "cms_project_schema_apply_command_completed_by_credential_id_api_credential_id_fk";
--> statement-breakpoint
ALTER TABLE "cms_schema_revision" DROP CONSTRAINT "cms_schema_revision_published_by_credential_id_api_credential_id_fk";
--> statement-breakpoint
ALTER TABLE "cms_project_schema_apply_command" ADD CONSTRAINT "cms_project_schema_apply_user_fk" FOREIGN KEY ("completed_by_user_id") REFERENCES "public"."user"("id") ON DELETE restrict ON UPDATE no action;