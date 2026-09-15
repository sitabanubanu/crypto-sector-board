CREATE TYPE "public"."mapping_check_status" AS ENUM('success', 'failed');--> statement-breakpoint
CREATE TABLE "provider_mapping_checks" (
	"provider" "market_data_provider" PRIMARY KEY NOT NULL,
	"checked_at" timestamp with time zone NOT NULL,
	"status" "mapping_check_status" NOT NULL,
	"inventory_hash" text NOT NULL,
	"checked_mappings" integer DEFAULT 0 NOT NULL,
	"inventory_items" integer DEFAULT 0 NOT NULL,
	"error_count" integer DEFAULT 0 NOT NULL,
	"warning_count" integer DEFAULT 0 NOT NULL,
	"errors" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"warnings" jsonb DEFAULT '[]'::jsonb NOT NULL,
	CONSTRAINT "provider_mapping_checks_hash_nonempty" CHECK ("provider_mapping_checks"."inventory_hash" <> ''),
	CONSTRAINT "provider_mapping_checks_counts_nonnegative" CHECK ("provider_mapping_checks"."checked_mappings" >= 0 and "provider_mapping_checks"."inventory_items" >= 0 and "provider_mapping_checks"."error_count" >= 0 and "provider_mapping_checks"."warning_count" >= 0)
);
