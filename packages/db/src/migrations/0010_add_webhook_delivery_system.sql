CREATE TABLE "cms_invalidation_route_mapping" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"project_id" uuid NOT NULL,
	"environment_id" uuid NOT NULL,
	"collection_id" uuid NOT NULL,
	"entry_id" uuid,
	"locale_id" uuid,
	"name" varchar(100) NOT NULL,
	"event_types" varchar(128)[] NOT NULL,
	"route_path" varchar(512) NOT NULL,
	"semantic_tags" varchar(64)[] DEFAULT '{}' NOT NULL,
	"state" varchar(16) DEFAULT 'enabled' NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"created_by_user_id" text NOT NULL,
	"changed_by_user_id" text NOT NULL,
	"disabled_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "cms_invalidation_mapping_id_scope_unique" UNIQUE("id","environment_id","project_id","workspace_id"),
	CONSTRAINT "cms_invalidation_mapping_name_valid" CHECK (char_length("cms_invalidation_route_mapping"."name") between 1 and 100 and "cms_invalidation_route_mapping"."name" = btrim("cms_invalidation_route_mapping"."name") and "cms_invalidation_route_mapping"."name" !~ '[[:cntrl:]]'),
	CONSTRAINT "cms_invalidation_mapping_event_types_valid" CHECK (array_ndims("cms_invalidation_route_mapping"."event_types") = 1 and cardinality("cms_invalidation_route_mapping"."event_types") between 1 and 3 and "cms_invalidation_route_mapping"."event_types" <@ array['cms.schema.published', 'cms.entry.published', 'cms.entry.unpublished']::varchar[] and (cardinality("cms_invalidation_route_mapping"."event_types") = 1 or (cardinality("cms_invalidation_route_mapping"."event_types") = 2 and "cms_invalidation_route_mapping"."event_types"[1] <> "cms_invalidation_route_mapping"."event_types"[2]) or (cardinality("cms_invalidation_route_mapping"."event_types") = 3 and "cms_invalidation_route_mapping"."event_types"[1] <> "cms_invalidation_route_mapping"."event_types"[2] and "cms_invalidation_route_mapping"."event_types"[1] <> "cms_invalidation_route_mapping"."event_types"[3] and "cms_invalidation_route_mapping"."event_types"[2] <> "cms_invalidation_route_mapping"."event_types"[3]))),
	CONSTRAINT "cms_invalidation_mapping_scope_valid" CHECK (not ('cms.schema.published' = any("cms_invalidation_route_mapping"."event_types") and ("cms_invalidation_route_mapping"."entry_id" is not null or "cms_invalidation_route_mapping"."locale_id" is not null))),
	CONSTRAINT "cms_invalidation_mapping_route_valid" CHECK (octet_length("cms_invalidation_route_mapping"."route_path") between 1 and 512 and left("cms_invalidation_route_mapping"."route_path", 1) = '/' and "cms_invalidation_route_mapping"."route_path" !~ '[[:cntrl:]#?]' and position(chr(92) in "cms_invalidation_route_mapping"."route_path") = 0 and "cms_invalidation_route_mapping"."route_path" !~ '(^|/)\.\.?(/|$)' and lower("cms_invalidation_route_mapping"."route_path") !~ '%(2e|2f|5c|3f|23)' and "cms_invalidation_route_mapping"."route_path" !~ '^//'),
	CONSTRAINT "cms_invalidation_mapping_semantic_tags_valid" CHECK (coalesce(array_ndims("cms_invalidation_route_mapping"."semantic_tags"), 1) = 1 and cardinality("cms_invalidation_route_mapping"."semantic_tags") between 0 and 10 and array_position("cms_invalidation_route_mapping"."semantic_tags", null) is null and (cardinality("cms_invalidation_route_mapping"."semantic_tags") = 0 or array_to_string("cms_invalidation_route_mapping"."semantic_tags", ',') ~ '^[a-z][a-z0-9_-]{0,31}:[a-z0-9][a-z0-9._/-]{0,31}(,[a-z][a-z0-9_-]{0,31}:[a-z0-9][a-z0-9._/-]{0,31})*$') and array_to_string("cms_invalidation_route_mapping"."semantic_tags", ',') !~ '(^|,)(project|environment|collection|entry|locale|field):'),
	CONSTRAINT "cms_invalidation_mapping_state_valid" CHECK ("cms_invalidation_route_mapping"."state" in ('enabled', 'disabled')),
	CONSTRAINT "cms_invalidation_mapping_version_positive" CHECK ("cms_invalidation_route_mapping"."version" > 0),
	CONSTRAINT "cms_invalidation_mapping_lifecycle_valid" CHECK (("cms_invalidation_route_mapping"."state" = 'enabled' and "cms_invalidation_route_mapping"."disabled_at" is null) or ("cms_invalidation_route_mapping"."state" = 'disabled' and "cms_invalidation_route_mapping"."disabled_at" is not null)),
	CONSTRAINT "cms_invalidation_mapping_timestamps_valid" CHECK ("cms_invalidation_route_mapping"."updated_at" >= "cms_invalidation_route_mapping"."created_at")
);
--> statement-breakpoint
CREATE TABLE "publication_event" (
	"event_id" uuid PRIMARY KEY NOT NULL,
	"workspace_id" uuid NOT NULL,
	"project_id" uuid NOT NULL,
	"environment_id" uuid NOT NULL,
	"event_type" varchar(128) NOT NULL,
	"envelope_version" integer DEFAULT 1 NOT NULL,
	"canonical_body" text NOT NULL,
	"body_hash" char(64) NOT NULL,
	"body_bytes" integer NOT NULL,
	"occurred_at" timestamp with time zone NOT NULL,
	"projected_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "publication_event_id_scope_unique" UNIQUE("event_id","environment_id","project_id","workspace_id"),
	CONSTRAINT "publication_event_type_valid" CHECK ("publication_event"."event_type" in ('cms.schema.published', 'cms.entry.published', 'cms.entry.unpublished')),
	CONSTRAINT "publication_event_version_valid" CHECK ("publication_event"."envelope_version" = 1),
	CONSTRAINT "publication_event_body_valid" CHECK (octet_length("publication_event"."canonical_body") between 2 and 131072 and left("publication_event"."canonical_body", 1) = '{'),
	CONSTRAINT "publication_event_body_hash_valid" CHECK ("publication_event"."body_hash" ~ '^[0-9a-f]{64}$'),
	CONSTRAINT "publication_event_body_bytes_valid" CHECK ("publication_event"."body_bytes" = octet_length("publication_event"."canonical_body") and "publication_event"."body_bytes" between 2 and 131072),
	CONSTRAINT "publication_event_times_valid" CHECK ("publication_event"."projected_at" >= "publication_event"."occurred_at")
);
--> statement-breakpoint
CREATE TABLE "webhook_delivery" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"event_id" uuid NOT NULL,
	"endpoint_id" uuid NOT NULL,
	"destination_id" uuid NOT NULL,
	"workspace_id" uuid NOT NULL,
	"project_id" uuid NOT NULL,
	"environment_id" uuid NOT NULL,
	"kind" varchar(16) NOT NULL,
	"source_delivery_id" uuid,
	"replay_command_id" uuid,
	"replay_command_fingerprint" char(64),
	"replayed_by_user_id" text,
	"status" varchar(24) DEFAULT 'queued' NOT NULL,
	"attempt_count" integer DEFAULT 0 NOT NULL,
	"next_attempt_at" timestamp with time zone,
	"lease_token" uuid,
	"lease_expires_at" timestamp with time zone,
	"completed_at" timestamp with time zone,
	"last_outcome" varchar(64),
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "webhook_delivery_id_scope_unique" UNIQUE("id","event_id","endpoint_id","environment_id","project_id","workspace_id"),
	CONSTRAINT "webhook_delivery_kind_valid" CHECK ("webhook_delivery"."kind" in ('initial', 'replay')),
	CONSTRAINT "webhook_delivery_replay_authority_valid" CHECK (("webhook_delivery"."kind" = 'initial' and "webhook_delivery"."source_delivery_id" is null and "webhook_delivery"."replay_command_id" is null and "webhook_delivery"."replay_command_fingerprint" is null and "webhook_delivery"."replayed_by_user_id" is null) or ("webhook_delivery"."kind" = 'replay' and "webhook_delivery"."replay_command_id" is not null and "webhook_delivery"."replay_command_fingerprint" ~ '^[0-9a-f]{64}$' and "webhook_delivery"."replayed_by_user_id" is not null)),
	CONSTRAINT "webhook_delivery_status_valid" CHECK ("webhook_delivery"."status" in ('queued', 'delivering', 'retry_scheduled', 'succeeded', 'dead_letter', 'canceled')),
	CONSTRAINT "webhook_delivery_attempt_count_valid" CHECK ("webhook_delivery"."attempt_count" between 0 and 12),
	CONSTRAINT "webhook_delivery_lease_valid" CHECK (("webhook_delivery"."status" = 'delivering' and "webhook_delivery"."lease_token" is not null and "webhook_delivery"."lease_expires_at" is not null and "webhook_delivery"."completed_at" is null) or ("webhook_delivery"."status" <> 'delivering' and "webhook_delivery"."lease_token" is null and "webhook_delivery"."lease_expires_at" is null)),
	CONSTRAINT "webhook_delivery_schedule_valid" CHECK (("webhook_delivery"."status" in ('queued', 'retry_scheduled') and "webhook_delivery"."next_attempt_at" is not null and "webhook_delivery"."completed_at" is null) or ("webhook_delivery"."status" = 'delivering' and "webhook_delivery"."next_attempt_at" is null and "webhook_delivery"."completed_at" is null) or ("webhook_delivery"."status" in ('succeeded', 'dead_letter', 'canceled') and "webhook_delivery"."next_attempt_at" is null and "webhook_delivery"."completed_at" is not null)),
	CONSTRAINT "webhook_delivery_outcome_valid" CHECK (("webhook_delivery"."attempt_count" = 0 and "webhook_delivery"."last_outcome" is null) or ("webhook_delivery"."attempt_count" > 0 and "webhook_delivery"."last_outcome" is not null and "webhook_delivery"."last_outcome" ~ '^[a-z][a-z0-9_]{0,63}$')),
	CONSTRAINT "webhook_delivery_timestamps_valid" CHECK ("webhook_delivery"."updated_at" >= "webhook_delivery"."created_at")
);
--> statement-breakpoint
CREATE TABLE "webhook_delivery_attempt" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"delivery_id" uuid NOT NULL,
	"event_id" uuid NOT NULL,
	"endpoint_id" uuid NOT NULL,
	"workspace_id" uuid NOT NULL,
	"project_id" uuid NOT NULL,
	"environment_id" uuid NOT NULL,
	"attempt_number" integer NOT NULL,
	"state" varchar(24) DEFAULT 'started' NOT NULL,
	"signing_secret_ids" uuid[] NOT NULL,
	"request_timestamp" bigint NOT NULL,
	"started_at" timestamp with time zone DEFAULT now() NOT NULL,
	"completed_at" timestamp with time zone,
	"duration_ms" integer,
	"http_status" integer,
	"status_family" varchar(8),
	"outcome" varchar(64),
	"retry_after_seconds" integer,
	"next_attempt_at" timestamp with time zone,
	CONSTRAINT "webhook_attempt_id_scope_unique" UNIQUE("id","delivery_id","endpoint_id","environment_id","project_id","workspace_id"),
	CONSTRAINT "webhook_attempt_delivery_number_unique" UNIQUE("delivery_id","attempt_number"),
	CONSTRAINT "webhook_attempt_number_valid" CHECK ("webhook_delivery_attempt"."attempt_number" between 1 and 12),
	CONSTRAINT "webhook_attempt_state_valid" CHECK ("webhook_delivery_attempt"."state" in ('started', 'succeeded', 'retry_scheduled', 'dead_letter', 'abandoned', 'canceled')),
	CONSTRAINT "webhook_attempt_signing_secrets_valid" CHECK (array_ndims("webhook_delivery_attempt"."signing_secret_ids") = 1 and cardinality("webhook_delivery_attempt"."signing_secret_ids") between 1 and 2 and array_position("webhook_delivery_attempt"."signing_secret_ids", null) is null and (cardinality("webhook_delivery_attempt"."signing_secret_ids") = 1 or "webhook_delivery_attempt"."signing_secret_ids"[1] <> "webhook_delivery_attempt"."signing_secret_ids"[2])),
	CONSTRAINT "webhook_attempt_request_timestamp_valid" CHECK ("webhook_delivery_attempt"."request_timestamp" > 0),
	CONSTRAINT "webhook_attempt_terminal_valid" CHECK (("webhook_delivery_attempt"."state" = 'started' and "webhook_delivery_attempt"."completed_at" is null and "webhook_delivery_attempt"."duration_ms" is null and "webhook_delivery_attempt"."outcome" is null) or ("webhook_delivery_attempt"."state" <> 'started' and "webhook_delivery_attempt"."completed_at" is not null and "webhook_delivery_attempt"."duration_ms" >= 0 and "webhook_delivery_attempt"."outcome" ~ '^[a-z][a-z0-9_]{0,63}$')),
	CONSTRAINT "webhook_attempt_http_valid" CHECK (("webhook_delivery_attempt"."http_status" is null and "webhook_delivery_attempt"."status_family" is null) or ("webhook_delivery_attempt"."http_status" between 100 and 599 and "webhook_delivery_attempt"."status_family" in ('1xx', '2xx', '3xx', '4xx', '5xx'))),
	CONSTRAINT "webhook_attempt_retry_valid" CHECK (("webhook_delivery_attempt"."state" = 'retry_scheduled' and "webhook_delivery_attempt"."next_attempt_at" is not null) or ("webhook_delivery_attempt"."state" <> 'retry_scheduled' and "webhook_delivery_attempt"."next_attempt_at" is null)),
	CONSTRAINT "webhook_attempt_retry_after_valid" CHECK ("webhook_delivery_attempt"."retry_after_seconds" is null or "webhook_delivery_attempt"."retry_after_seconds" between 0 and 86400)
);
--> statement-breakpoint
CREATE TABLE "webhook_endpoint" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"project_id" uuid NOT NULL,
	"environment_id" uuid NOT NULL,
	"name" varchar(100) NOT NULL,
	"state" varchar(16) DEFAULT 'disabled' NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"current_destination_id" uuid,
	"enabled_at" timestamp with time zone,
	"disabled_at" timestamp with time zone,
	"created_by_user_id" text NOT NULL,
	"changed_by_user_id" text NOT NULL,
	"lease_token" uuid,
	"lease_expires_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "webhook_endpoint_id_scope_unique" UNIQUE("id","environment_id","project_id","workspace_id"),
	CONSTRAINT "webhook_endpoint_name_valid" CHECK (char_length("webhook_endpoint"."name") between 1 and 100 and "webhook_endpoint"."name" = btrim("webhook_endpoint"."name") and "webhook_endpoint"."name" !~ '[[:cntrl:]]'),
	CONSTRAINT "webhook_endpoint_state_valid" CHECK ("webhook_endpoint"."state" in ('enabled', 'disabled')),
	CONSTRAINT "webhook_endpoint_version_positive" CHECK ("webhook_endpoint"."version" > 0),
	CONSTRAINT "webhook_endpoint_lifecycle_valid" CHECK (("webhook_endpoint"."state" = 'enabled' and "webhook_endpoint"."current_destination_id" is not null and "webhook_endpoint"."enabled_at" is not null and "webhook_endpoint"."disabled_at" is null) or ("webhook_endpoint"."state" = 'disabled' and ("webhook_endpoint"."enabled_at" is null or "webhook_endpoint"."disabled_at" is not null))),
	CONSTRAINT "webhook_endpoint_lease_paired" CHECK (("webhook_endpoint"."lease_token" is null and "webhook_endpoint"."lease_expires_at" is null) or ("webhook_endpoint"."lease_token" is not null and "webhook_endpoint"."lease_expires_at" is not null)),
	CONSTRAINT "webhook_endpoint_timestamps_valid" CHECK ("webhook_endpoint"."updated_at" >= "webhook_endpoint"."created_at")
);
--> statement-breakpoint
CREATE TABLE "webhook_endpoint_destination" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"endpoint_id" uuid NOT NULL,
	"workspace_id" uuid NOT NULL,
	"project_id" uuid NOT NULL,
	"environment_id" uuid NOT NULL,
	"sequence" integer NOT NULL,
	"display_origin" varchar(255) NOT NULL,
	"encryption_key_id" varchar(64) NOT NULL,
	"nonce" varchar(32) NOT NULL,
	"ciphertext" text NOT NULL,
	"keyed_fingerprint" char(64) NOT NULL,
	"created_by_user_id" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "webhook_destination_id_scope_unique" UNIQUE("id","endpoint_id","environment_id","project_id","workspace_id"),
	CONSTRAINT "webhook_destination_endpoint_sequence_unique" UNIQUE("endpoint_id","sequence"),
	CONSTRAINT "webhook_destination_sequence_positive" CHECK ("webhook_endpoint_destination"."sequence" > 0),
	CONSTRAINT "webhook_destination_origin_valid" CHECK (char_length("webhook_endpoint_destination"."display_origin") between 9 and 255 and "webhook_endpoint_destination"."display_origin" = btrim("webhook_endpoint_destination"."display_origin") and "webhook_endpoint_destination"."display_origin" ~ '^https://[^/?#[:space:]]+$'),
	CONSTRAINT "webhook_destination_key_id_valid" CHECK ("webhook_endpoint_destination"."encryption_key_id" ~ '^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$'),
	CONSTRAINT "webhook_destination_nonce_valid" CHECK (char_length("webhook_endpoint_destination"."nonce") between 16 and 32 and "webhook_endpoint_destination"."nonce" ~ '^[A-Za-z0-9_-]+$'),
	CONSTRAINT "webhook_destination_ciphertext_valid" CHECK (char_length("webhook_endpoint_destination"."ciphertext") between 22 and 4096 and "webhook_endpoint_destination"."ciphertext" ~ '^[A-Za-z0-9_-]+$'),
	CONSTRAINT "webhook_destination_fingerprint_valid" CHECK ("webhook_endpoint_destination"."keyed_fingerprint" ~ '^[0-9a-f]{64}$')
);
--> statement-breakpoint
CREATE TABLE "webhook_endpoint_secret" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"endpoint_id" uuid NOT NULL,
	"workspace_id" uuid NOT NULL,
	"project_id" uuid NOT NULL,
	"environment_id" uuid NOT NULL,
	"sequence" integer NOT NULL,
	"state" varchar(16) NOT NULL,
	"encryption_key_id" varchar(64) NOT NULL,
	"nonce" varchar(32),
	"ciphertext" text,
	"fingerprint" char(16) NOT NULL,
	"activated_at" timestamp with time zone,
	"retire_at" timestamp with time zone,
	"retired_at" timestamp with time zone,
	"created_by_user_id" text NOT NULL,
	"changed_by_user_id" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "webhook_secret_id_scope_unique" UNIQUE("id","endpoint_id","environment_id","project_id","workspace_id"),
	CONSTRAINT "webhook_secret_endpoint_sequence_unique" UNIQUE("endpoint_id","sequence"),
	CONSTRAINT "webhook_secret_sequence_positive" CHECK ("webhook_endpoint_secret"."sequence" > 0),
	CONSTRAINT "webhook_secret_state_valid" CHECK ("webhook_endpoint_secret"."state" in ('pending', 'active', 'retiring', 'retired', 'canceled')),
	CONSTRAINT "webhook_secret_key_id_valid" CHECK ("webhook_endpoint_secret"."encryption_key_id" ~ '^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$'),
	CONSTRAINT "webhook_secret_material_valid" CHECK (("webhook_endpoint_secret"."state" in ('pending', 'active', 'retiring') and "webhook_endpoint_secret"."nonce" is not null and char_length("webhook_endpoint_secret"."nonce") between 16 and 32 and "webhook_endpoint_secret"."nonce" ~ '^[A-Za-z0-9_-]+$' and "webhook_endpoint_secret"."ciphertext" is not null and char_length("webhook_endpoint_secret"."ciphertext") between 22 and 256 and "webhook_endpoint_secret"."ciphertext" ~ '^[A-Za-z0-9_-]+$') or ("webhook_endpoint_secret"."state" in ('retired', 'canceled') and "webhook_endpoint_secret"."nonce" is null and "webhook_endpoint_secret"."ciphertext" is null)),
	CONSTRAINT "webhook_secret_fingerprint_valid" CHECK ("webhook_endpoint_secret"."fingerprint" ~ '^[0-9a-f]{16}$'),
	CONSTRAINT "webhook_secret_lifecycle_valid" CHECK (("webhook_endpoint_secret"."state" = 'pending' and "webhook_endpoint_secret"."activated_at" is null and "webhook_endpoint_secret"."retire_at" is null and "webhook_endpoint_secret"."retired_at" is null) or ("webhook_endpoint_secret"."state" = 'active' and "webhook_endpoint_secret"."activated_at" is not null and "webhook_endpoint_secret"."retire_at" is null and "webhook_endpoint_secret"."retired_at" is null) or ("webhook_endpoint_secret"."state" = 'retiring' and "webhook_endpoint_secret"."activated_at" is not null and "webhook_endpoint_secret"."retire_at" is not null and "webhook_endpoint_secret"."retired_at" is null and "webhook_endpoint_secret"."retire_at" > "webhook_endpoint_secret"."activated_at") or ("webhook_endpoint_secret"."state" in ('retired', 'canceled') and "webhook_endpoint_secret"."retired_at" is not null)),
	CONSTRAINT "webhook_secret_timestamps_valid" CHECK ("webhook_endpoint_secret"."updated_at" >= "webhook_endpoint_secret"."created_at")
);
--> statement-breakpoint
CREATE TABLE "webhook_endpoint_subscription" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"endpoint_id" uuid NOT NULL,
	"workspace_id" uuid NOT NULL,
	"project_id" uuid NOT NULL,
	"environment_id" uuid NOT NULL,
	"event_type" varchar(128) NOT NULL,
	"active_from" timestamp with time zone NOT NULL,
	"active_until" timestamp with time zone,
	"created_by_user_id" text NOT NULL,
	"closed_by_user_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "webhook_subscription_id_scope_unique" UNIQUE("id","endpoint_id","environment_id","project_id","workspace_id"),
	CONSTRAINT "webhook_subscription_type_valid" CHECK ("webhook_endpoint_subscription"."event_type" in ('cms.schema.published', 'cms.entry.published', 'cms.entry.unpublished')),
	CONSTRAINT "webhook_subscription_lifecycle_valid" CHECK (("webhook_endpoint_subscription"."active_until" is null and "webhook_endpoint_subscription"."closed_by_user_id" is null) or ("webhook_endpoint_subscription"."active_until" is not null and "webhook_endpoint_subscription"."closed_by_user_id" is not null and "webhook_endpoint_subscription"."active_until" >= "webhook_endpoint_subscription"."active_from"))
);
--> statement-breakpoint
ALTER TABLE "cms_invalidation_route_mapping" ADD CONSTRAINT "cms_invalidation_route_mapping_created_by_user_id_user_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."user"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cms_invalidation_route_mapping" ADD CONSTRAINT "cms_invalidation_route_mapping_changed_by_user_id_user_id_fk" FOREIGN KEY ("changed_by_user_id") REFERENCES "public"."user"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cms_invalidation_route_mapping" ADD CONSTRAINT "cms_invalidation_mapping_collection_scope_fk" FOREIGN KEY ("collection_id","environment_id","project_id","workspace_id") REFERENCES "public"."cms_collection"("id","environment_id","project_id","workspace_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cms_invalidation_route_mapping" ADD CONSTRAINT "cms_invalidation_mapping_entry_scope_fk" FOREIGN KEY ("entry_id","collection_id","environment_id","project_id","workspace_id") REFERENCES "public"."cms_entry"("id","collection_id","environment_id","project_id","workspace_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cms_invalidation_route_mapping" ADD CONSTRAINT "cms_invalidation_mapping_locale_scope_fk" FOREIGN KEY ("locale_id","project_id","workspace_id") REFERENCES "public"."project_locale"("id","project_id","workspace_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "outbox_event" ADD CONSTRAINT "outbox_event_id_scope_unique" UNIQUE("id","event_type","environment_id","project_id","workspace_id");--> statement-breakpoint
ALTER TABLE "publication_event" ADD CONSTRAINT "publication_event_outbox_scope_fk" FOREIGN KEY ("event_id","event_type","environment_id","project_id","workspace_id") REFERENCES "public"."outbox_event"("id","event_type","environment_id","project_id","workspace_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "webhook_delivery" ADD CONSTRAINT "webhook_delivery_replayed_by_user_id_user_id_fk" FOREIGN KEY ("replayed_by_user_id") REFERENCES "public"."user"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "webhook_delivery" ADD CONSTRAINT "webhook_delivery_event_scope_fk" FOREIGN KEY ("event_id","environment_id","project_id","workspace_id") REFERENCES "public"."publication_event"("event_id","environment_id","project_id","workspace_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "webhook_delivery" ADD CONSTRAINT "webhook_delivery_endpoint_scope_fk" FOREIGN KEY ("endpoint_id","environment_id","project_id","workspace_id") REFERENCES "public"."webhook_endpoint"("id","environment_id","project_id","workspace_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "webhook_delivery" ADD CONSTRAINT "webhook_delivery_destination_scope_fk" FOREIGN KEY ("destination_id","endpoint_id","environment_id","project_id","workspace_id") REFERENCES "public"."webhook_endpoint_destination"("id","endpoint_id","environment_id","project_id","workspace_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "webhook_delivery" ADD CONSTRAINT "webhook_delivery_source_scope_fk" FOREIGN KEY ("source_delivery_id","event_id","endpoint_id","environment_id","project_id","workspace_id") REFERENCES "public"."webhook_delivery"("id","event_id","endpoint_id","environment_id","project_id","workspace_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "webhook_delivery_attempt" ADD CONSTRAINT "webhook_attempt_delivery_scope_fk" FOREIGN KEY ("delivery_id","event_id","endpoint_id","environment_id","project_id","workspace_id") REFERENCES "public"."webhook_delivery"("id","event_id","endpoint_id","environment_id","project_id","workspace_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "webhook_delivery_attempt" ADD CONSTRAINT "webhook_attempt_event_scope_fk" FOREIGN KEY ("event_id","environment_id","project_id","workspace_id") REFERENCES "public"."publication_event"("event_id","environment_id","project_id","workspace_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "webhook_endpoint" ADD CONSTRAINT "webhook_endpoint_created_by_user_id_user_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."user"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "webhook_endpoint" ADD CONSTRAINT "webhook_endpoint_changed_by_user_id_user_id_fk" FOREIGN KEY ("changed_by_user_id") REFERENCES "public"."user"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "webhook_endpoint" ADD CONSTRAINT "webhook_endpoint_environment_tenant_fk" FOREIGN KEY ("environment_id","project_id","workspace_id") REFERENCES "public"."environment"("id","project_id","workspace_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "webhook_endpoint" ADD CONSTRAINT "webhook_endpoint_current_destination_scope_fk" FOREIGN KEY ("current_destination_id","id","environment_id","project_id","workspace_id") REFERENCES "public"."webhook_endpoint_destination"("id","endpoint_id","environment_id","project_id","workspace_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "webhook_endpoint_destination" ADD CONSTRAINT "webhook_endpoint_destination_created_by_user_id_user_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."user"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "webhook_endpoint_destination" ADD CONSTRAINT "webhook_destination_endpoint_scope_fk" FOREIGN KEY ("endpoint_id","environment_id","project_id","workspace_id") REFERENCES "public"."webhook_endpoint"("id","environment_id","project_id","workspace_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "webhook_endpoint_secret" ADD CONSTRAINT "webhook_endpoint_secret_created_by_user_id_user_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."user"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "webhook_endpoint_secret" ADD CONSTRAINT "webhook_endpoint_secret_changed_by_user_id_user_id_fk" FOREIGN KEY ("changed_by_user_id") REFERENCES "public"."user"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "webhook_endpoint_secret" ADD CONSTRAINT "webhook_secret_endpoint_scope_fk" FOREIGN KEY ("endpoint_id","environment_id","project_id","workspace_id") REFERENCES "public"."webhook_endpoint"("id","environment_id","project_id","workspace_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "webhook_endpoint_subscription" ADD CONSTRAINT "webhook_endpoint_subscription_created_by_user_id_user_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."user"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "webhook_endpoint_subscription" ADD CONSTRAINT "webhook_endpoint_subscription_closed_by_user_id_user_id_fk" FOREIGN KEY ("closed_by_user_id") REFERENCES "public"."user"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "webhook_endpoint_subscription" ADD CONSTRAINT "webhook_subscription_endpoint_scope_fk" FOREIGN KEY ("endpoint_id","environment_id","project_id","workspace_id") REFERENCES "public"."webhook_endpoint"("id","environment_id","project_id","workspace_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "cms_invalidation_mapping_match_idx" ON "cms_invalidation_route_mapping" USING btree ("environment_id","collection_id","state","id");--> statement-breakpoint
CREATE INDEX "cms_invalidation_mapping_entry_idx" ON "cms_invalidation_route_mapping" USING btree ("entry_id","locale_id") WHERE "cms_invalidation_route_mapping"."entry_id" is not null or "cms_invalidation_route_mapping"."locale_id" is not null;--> statement-breakpoint
CREATE INDEX "cms_invalidation_mapping_created_by_idx" ON "cms_invalidation_route_mapping" USING btree ("created_by_user_id");--> statement-breakpoint
CREATE INDEX "cms_invalidation_mapping_changed_by_idx" ON "cms_invalidation_route_mapping" USING btree ("changed_by_user_id");--> statement-breakpoint
CREATE INDEX "publication_event_environment_occurred_id_idx" ON "publication_event" USING btree ("environment_id","occurred_at" DESC NULLS LAST,"event_id" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "publication_event_type_occurred_id_idx" ON "publication_event" USING btree ("event_type","occurred_at" DESC NULLS LAST,"event_id" DESC NULLS LAST);--> statement-breakpoint
CREATE UNIQUE INDEX "webhook_delivery_initial_event_endpoint_unique" ON "webhook_delivery" USING btree ("event_id","endpoint_id") WHERE "webhook_delivery"."kind" = 'initial';--> statement-breakpoint
CREATE UNIQUE INDEX "webhook_delivery_replay_command_unique" ON "webhook_delivery" USING btree ("endpoint_id","replay_command_id") WHERE "webhook_delivery"."kind" = 'replay';--> statement-breakpoint
CREATE INDEX "webhook_delivery_ready_idx" ON "webhook_delivery" USING btree ("next_attempt_at","id") WHERE "webhook_delivery"."status" in ('queued', 'retry_scheduled');--> statement-breakpoint
CREATE INDEX "webhook_delivery_expired_lease_idx" ON "webhook_delivery" USING btree ("lease_expires_at","id") WHERE "webhook_delivery"."status" = 'delivering';--> statement-breakpoint
CREATE INDEX "webhook_delivery_endpoint_history_idx" ON "webhook_delivery" USING btree ("endpoint_id","created_at" DESC NULLS LAST,"id" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "webhook_delivery_event_history_idx" ON "webhook_delivery" USING btree ("event_id","created_at","id");--> statement-breakpoint
CREATE INDEX "webhook_delivery_status_history_idx" ON "webhook_delivery" USING btree ("environment_id","status","created_at" DESC NULLS LAST,"id" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "webhook_delivery_replayed_by_idx" ON "webhook_delivery" USING btree ("replayed_by_user_id") WHERE "webhook_delivery"."replayed_by_user_id" is not null;--> statement-breakpoint
CREATE INDEX "webhook_attempt_delivery_number_idx" ON "webhook_delivery_attempt" USING btree ("delivery_id","attempt_number" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "webhook_attempt_endpoint_started_id_idx" ON "webhook_delivery_attempt" USING btree ("endpoint_id","started_at" DESC NULLS LAST,"id" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "webhook_attempt_event_idx" ON "webhook_delivery_attempt" USING btree ("event_id","started_at","id");--> statement-breakpoint
CREATE UNIQUE INDEX "webhook_endpoint_environment_active_name_unique" ON "webhook_endpoint" USING btree ("environment_id","name") WHERE "webhook_endpoint"."state" = 'enabled';--> statement-breakpoint
CREATE INDEX "webhook_endpoint_environment_state_created_id_idx" ON "webhook_endpoint" USING btree ("environment_id","state","created_at" DESC NULLS LAST,"id" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "webhook_endpoint_expired_lease_idx" ON "webhook_endpoint" USING btree ("lease_expires_at","id") WHERE "webhook_endpoint"."lease_expires_at" is not null;--> statement-breakpoint
CREATE INDEX "webhook_endpoint_created_by_idx" ON "webhook_endpoint" USING btree ("created_by_user_id");--> statement-breakpoint
CREATE INDEX "webhook_endpoint_changed_by_idx" ON "webhook_endpoint" USING btree ("changed_by_user_id");--> statement-breakpoint
CREATE INDEX "webhook_destination_endpoint_sequence_idx" ON "webhook_endpoint_destination" USING btree ("endpoint_id","sequence" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "webhook_destination_created_by_idx" ON "webhook_endpoint_destination" USING btree ("created_by_user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "webhook_secret_endpoint_pending_unique" ON "webhook_endpoint_secret" USING btree ("endpoint_id") WHERE "webhook_endpoint_secret"."state" = 'pending';--> statement-breakpoint
CREATE UNIQUE INDEX "webhook_secret_endpoint_active_unique" ON "webhook_endpoint_secret" USING btree ("endpoint_id") WHERE "webhook_endpoint_secret"."state" = 'active';--> statement-breakpoint
CREATE UNIQUE INDEX "webhook_secret_endpoint_retiring_unique" ON "webhook_endpoint_secret" USING btree ("endpoint_id") WHERE "webhook_endpoint_secret"."state" = 'retiring';--> statement-breakpoint
CREATE INDEX "webhook_secret_endpoint_sequence_idx" ON "webhook_endpoint_secret" USING btree ("endpoint_id","sequence" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "webhook_secret_retiring_due_idx" ON "webhook_endpoint_secret" USING btree ("retire_at","id") WHERE "webhook_endpoint_secret"."state" = 'retiring';--> statement-breakpoint
CREATE INDEX "webhook_secret_created_by_idx" ON "webhook_endpoint_secret" USING btree ("created_by_user_id");--> statement-breakpoint
CREATE INDEX "webhook_secret_changed_by_idx" ON "webhook_endpoint_secret" USING btree ("changed_by_user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "webhook_subscription_endpoint_type_active_unique" ON "webhook_endpoint_subscription" USING btree ("endpoint_id","event_type") WHERE "webhook_endpoint_subscription"."active_until" is null;--> statement-breakpoint
CREATE INDEX "webhook_subscription_dispatch_idx" ON "webhook_endpoint_subscription" USING btree ("environment_id","event_type","active_from","endpoint_id");--> statement-breakpoint
CREATE INDEX "webhook_subscription_endpoint_history_idx" ON "webhook_endpoint_subscription" USING btree ("endpoint_id","event_type","active_from" DESC NULLS LAST,"id" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "webhook_subscription_created_by_idx" ON "webhook_endpoint_subscription" USING btree ("created_by_user_id");--> statement-breakpoint
CREATE INDEX "webhook_subscription_closed_by_idx" ON "webhook_endpoint_subscription" USING btree ("closed_by_user_id") WHERE "webhook_endpoint_subscription"."closed_by_user_id" is not null;--> statement-breakpoint
