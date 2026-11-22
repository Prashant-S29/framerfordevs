ALTER TABLE "cms_schema_revision" DROP CONSTRAINT "cms_revision_format_version_valid";--> statement-breakpoint
ALTER TABLE "cms_schema_revision" ADD CONSTRAINT "cms_revision_format_version_valid" CHECK ("cms_schema_revision"."format_version" = 1);
--> statement-breakpoint
CREATE FUNCTION "cms_reject_entry_revision_update"()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog
AS $$
BEGIN
  RAISE EXCEPTION
    'immutable CMS entry revision % cannot be changed by %',
    TG_TABLE_NAME,
    TG_OP
    USING ERRCODE = '55000';

  RETURN NULL;
END;
$$;
--> statement-breakpoint
CREATE TRIGGER "cms_entry_shared_revision_immutable"
BEFORE UPDATE ON "cms_entry_shared_revision"
FOR EACH ROW
EXECUTE FUNCTION "cms_reject_entry_revision_update"();
--> statement-breakpoint
CREATE TRIGGER "cms_entry_locale_revision_immutable"
BEFORE UPDATE ON "cms_entry_locale_revision"
FOR EACH ROW
EXECUTE FUNCTION "cms_reject_entry_revision_update"();
