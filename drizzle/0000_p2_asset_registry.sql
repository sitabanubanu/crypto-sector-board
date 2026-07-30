CREATE TYPE "public"."asset_status" AS ENUM('active', 'migrating', 'inactive');--> statement-breakpoint
CREATE TYPE "public"."ingestion_status" AS ENUM('running', 'success', 'partial', 'failed');--> statement-breakpoint
CREATE TYPE "public"."instrument_status" AS ENUM('active', 'unavailable', 'delisted', 'migrating', 'ambiguous');--> statement-breakpoint
CREATE TYPE "public"."market_data_provider" AS ENUM('coingecko', 'gate', 'okx', 'legacy_snapshot');--> statement-breakpoint
CREATE TYPE "public"."market_timeframe" AS ENUM('1h', '1d');--> statement-breakpoint
CREATE TABLE "asset_aliases" (
	"alias" text PRIMARY KEY NOT NULL,
	"asset_id" text NOT NULL,
	"alias_type" text NOT NULL,
	"note" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "asset_aliases_alias_format" CHECK ("asset_aliases"."alias" ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$'),
	CONSTRAINT "asset_aliases_type_check" CHECK ("asset_aliases"."alias_type" in ('legacy_asset_id', 'provider_slug', 'former_name'))
);
--> statement-breakpoint
CREATE TABLE "assets" (
	"asset_id" text PRIMARY KEY NOT NULL,
	"symbol" text NOT NULL,
	"name" text NOT NULL,
	"status" "asset_status" DEFAULT 'active' NOT NULL,
	"primary_provider" "market_data_provider" NOT NULL,
	"mapping_note" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "assets_asset_id_format" CHECK ("assets"."asset_id" ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$'),
	CONSTRAINT "assets_symbol_format" CHECK ("assets"."symbol" ~ '^[A-Z0-9.]+$')
);
--> statement-breakpoint
CREATE TABLE "ingestion_runs" (
	"run_id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"dedupe_key" text NOT NULL,
	"task" text NOT NULL,
	"provider" "market_data_provider",
	"timeframe" "market_timeframe",
	"status" "ingestion_status" DEFAULT 'running' NOT NULL,
	"cursor_from" timestamp with time zone,
	"cursor_to" timestamp with time zone,
	"requested_count" integer DEFAULT 0 NOT NULL,
	"accepted_count" integer DEFAULT 0 NOT NULL,
	"rejected_count" integer DEFAULT 0 NOT NULL,
	"coverage_ratio" double precision,
	"error_summary" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"started_at" timestamp with time zone DEFAULT now() NOT NULL,
	"finished_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "ingestion_runs_counts_nonnegative" CHECK ("ingestion_runs"."requested_count" >= 0 and "ingestion_runs"."accepted_count" >= 0 and "ingestion_runs"."rejected_count" >= 0),
	CONSTRAINT "ingestion_runs_counts_consistent" CHECK ("ingestion_runs"."accepted_count" + "ingestion_runs"."rejected_count" <= "ingestion_runs"."requested_count"),
	CONSTRAINT "ingestion_runs_coverage_range" CHECK ("ingestion_runs"."coverage_ratio" is null or ("ingestion_runs"."coverage_ratio" >= 0 and "ingestion_runs"."coverage_ratio" <= 1)),
	CONSTRAINT "ingestion_runs_cursor_order" CHECK ("ingestion_runs"."cursor_from" is null or "ingestion_runs"."cursor_to" is null or "ingestion_runs"."cursor_to" >= "ingestion_runs"."cursor_from"),
	CONSTRAINT "ingestion_runs_finish_order" CHECK ("ingestion_runs"."finished_at" is null or "ingestion_runs"."finished_at" >= "ingestion_runs"."started_at")
);
--> statement-breakpoint
CREATE TABLE "market_candles" (
	"asset_id" text NOT NULL,
	"provider" "market_data_provider" NOT NULL,
	"timeframe" "market_timeframe" NOT NULL,
	"open_time" timestamp with time zone NOT NULL,
	"close_time" timestamp with time zone NOT NULL,
	"open" double precision NOT NULL,
	"high" double precision NOT NULL,
	"low" double precision NOT NULL,
	"close" double precision NOT NULL,
	"volume_base" double precision,
	"volume_quote" double precision,
	"is_complete" boolean DEFAULT true NOT NULL,
	"fetched_at" timestamp with time zone DEFAULT now() NOT NULL,
	"quality" jsonb DEFAULT '{}'::jsonb NOT NULL,
	CONSTRAINT "market_candles_pk" PRIMARY KEY("asset_id","provider","timeframe","open_time"),
	CONSTRAINT "market_candles_time_order" CHECK ("market_candles"."close_time" > "market_candles"."open_time"),
	CONSTRAINT "market_candles_prices_positive" CHECK ("market_candles"."open" > 0 and "market_candles"."high" > 0 and "market_candles"."low" > 0 and "market_candles"."close" > 0),
	CONSTRAINT "market_candles_ohlc_bounds" CHECK ("market_candles"."high" >= greatest("market_candles"."open", "market_candles"."close", "market_candles"."low") and "market_candles"."low" <= least("market_candles"."open", "market_candles"."close", "market_candles"."high")),
	CONSTRAINT "market_candles_volume_nonnegative" CHECK (("market_candles"."volume_base" is null or "market_candles"."volume_base" >= 0) and ("market_candles"."volume_quote" is null or "market_candles"."volume_quote" >= 0))
);
--> statement-breakpoint
CREATE TABLE "market_caps" (
	"asset_id" text NOT NULL,
	"provider" "market_data_provider" NOT NULL,
	"observed_at" timestamp with time zone NOT NULL,
	"market_cap_usd" double precision NOT NULL,
	"circulating_supply" double precision,
	"total_supply" double precision,
	"fetched_at" timestamp with time zone DEFAULT now() NOT NULL,
	"quality" jsonb DEFAULT '{}'::jsonb NOT NULL,
	CONSTRAINT "market_caps_pk" PRIMARY KEY("asset_id","provider","observed_at"),
	CONSTRAINT "market_caps_values_nonnegative" CHECK ("market_caps"."market_cap_usd" >= 0 and ("market_caps"."circulating_supply" is null or "market_caps"."circulating_supply" >= 0) and ("market_caps"."total_supply" is null or "market_caps"."total_supply" >= 0))
);
--> statement-breakpoint
CREATE TABLE "market_quotes_latest" (
	"asset_id" text NOT NULL,
	"provider" "market_data_provider" NOT NULL,
	"instrument_id" text NOT NULL,
	"last" double precision NOT NULL,
	"open_24h" double precision,
	"high_24h" double precision,
	"low_24h" double precision,
	"volume_base_24h" double precision,
	"volume_quote_24h" double precision,
	"observed_at" timestamp with time zone NOT NULL,
	"fetched_at" timestamp with time zone DEFAULT now() NOT NULL,
	"fallback_used" boolean DEFAULT false NOT NULL,
	"quality" jsonb DEFAULT '{}'::jsonb NOT NULL,
	CONSTRAINT "market_quotes_latest_pk" PRIMARY KEY("asset_id","provider"),
	CONSTRAINT "market_quotes_latest_last_positive" CHECK ("market_quotes_latest"."last" > 0),
	CONSTRAINT "market_quotes_latest_high_low" CHECK ("market_quotes_latest"."high_24h" is null or "market_quotes_latest"."low_24h" is null or "market_quotes_latest"."high_24h" >= "market_quotes_latest"."low_24h"),
	CONSTRAINT "market_quotes_latest_volume_nonnegative" CHECK (("market_quotes_latest"."volume_base_24h" is null or "market_quotes_latest"."volume_base_24h" >= 0) and ("market_quotes_latest"."volume_quote_24h" is null or "market_quotes_latest"."volume_quote_24h" >= 0))
);
--> statement-breakpoint
CREATE TABLE "provider_instruments" (
	"mapping_id" text PRIMARY KEY NOT NULL,
	"asset_id" text NOT NULL,
	"provider" "market_data_provider" NOT NULL,
	"role" text DEFAULT 'spot' NOT NULL,
	"instrument_id" text,
	"base_symbol" text NOT NULL,
	"quote_symbol" text,
	"status" "instrument_status" NOT NULL,
	"priority" integer DEFAULT 100 NOT NULL,
	"supports_quotes" boolean DEFAULT false NOT NULL,
	"supports_candles" boolean DEFAULT false NOT NULL,
	"supports_market_cap" boolean DEFAULT false NOT NULL,
	"first_seen_at" timestamp with time zone NOT NULL,
	"last_verified_at" timestamp with time zone,
	"delisted_at" timestamp with time zone,
	"mapping_note" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "provider_instruments_mapping_id_format" CHECK ("provider_instruments"."mapping_id" ~ '^[a-z0-9-]+:[a-z_]+:[a-z0-9-]+$'),
	CONSTRAINT "provider_instruments_role_format" CHECK ("provider_instruments"."role" ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$'),
	CONSTRAINT "provider_instruments_symbol_format" CHECK ("provider_instruments"."base_symbol" ~ '^[A-Z0-9.]+$' and ("provider_instruments"."quote_symbol" is null or "provider_instruments"."quote_symbol" ~ '^[A-Z0-9.]+$')),
	CONSTRAINT "provider_instruments_priority_positive" CHECK ("provider_instruments"."priority" > 0),
	CONSTRAINT "provider_instruments_active_has_id" CHECK ("provider_instruments"."status" <> 'active' or "provider_instruments"."instrument_id" is not null),
	CONSTRAINT "provider_instruments_unavailable_has_no_id" CHECK ("provider_instruments"."status" <> 'unavailable' or "provider_instruments"."instrument_id" is null),
	CONSTRAINT "provider_instruments_delisted_timestamp" CHECK ("provider_instruments"."status" <> 'delisted' or "provider_instruments"."delisted_at" is not null)
);
--> statement-breakpoint
CREATE TABLE "sector_memberships" (
	"sector_id" text NOT NULL,
	"asset_id" text NOT NULL,
	"effective_from" timestamp with time zone NOT NULL,
	"effective_to" timestamp with time zone,
	"sort_order" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "sector_memberships_pk" PRIMARY KEY("sector_id","asset_id","effective_from"),
	CONSTRAINT "sector_memberships_effective_order" CHECK ("sector_memberships"."effective_to" is null or "sector_memberships"."effective_to" > "sector_memberships"."effective_from"),
	CONSTRAINT "sector_memberships_sort_order_nonnegative" CHECK ("sector_memberships"."sort_order" >= 0)
);
--> statement-breakpoint
CREATE TABLE "sectors" (
	"sector_id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"sort_order" integer NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "sectors_sector_id_format" CHECK ("sectors"."sector_id" ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$'),
	CONSTRAINT "sectors_sort_order_nonnegative" CHECK ("sectors"."sort_order" >= 0)
);
--> statement-breakpoint
ALTER TABLE "asset_aliases" ADD CONSTRAINT "asset_aliases_asset_id_assets_asset_id_fk" FOREIGN KEY ("asset_id") REFERENCES "public"."assets"("asset_id") ON DELETE cascade ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "market_candles" ADD CONSTRAINT "market_candles_asset_id_assets_asset_id_fk" FOREIGN KEY ("asset_id") REFERENCES "public"."assets"("asset_id") ON DELETE cascade ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "market_caps" ADD CONSTRAINT "market_caps_asset_id_assets_asset_id_fk" FOREIGN KEY ("asset_id") REFERENCES "public"."assets"("asset_id") ON DELETE cascade ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "market_quotes_latest" ADD CONSTRAINT "market_quotes_latest_asset_id_assets_asset_id_fk" FOREIGN KEY ("asset_id") REFERENCES "public"."assets"("asset_id") ON DELETE cascade ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "provider_instruments" ADD CONSTRAINT "provider_instruments_asset_id_assets_asset_id_fk" FOREIGN KEY ("asset_id") REFERENCES "public"."assets"("asset_id") ON DELETE cascade ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "sector_memberships" ADD CONSTRAINT "sector_memberships_sector_id_sectors_sector_id_fk" FOREIGN KEY ("sector_id") REFERENCES "public"."sectors"("sector_id") ON DELETE cascade ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "sector_memberships" ADD CONSTRAINT "sector_memberships_asset_id_assets_asset_id_fk" FOREIGN KEY ("asset_id") REFERENCES "public"."assets"("asset_id") ON DELETE restrict ON UPDATE cascade;--> statement-breakpoint
CREATE INDEX "asset_aliases_asset_id_idx" ON "asset_aliases" USING btree ("asset_id");--> statement-breakpoint
CREATE UNIQUE INDEX "ingestion_runs_dedupe_key_uq" ON "ingestion_runs" USING btree ("dedupe_key");--> statement-breakpoint
CREATE INDEX "ingestion_runs_status_started_idx" ON "ingestion_runs" USING btree ("status","started_at");--> statement-breakpoint
CREATE INDEX "market_candles_time_idx" ON "market_candles" USING btree ("timeframe","open_time");--> statement-breakpoint
CREATE INDEX "market_caps_observed_at_idx" ON "market_caps" USING btree ("observed_at");--> statement-breakpoint
CREATE INDEX "market_quotes_latest_observed_at_idx" ON "market_quotes_latest" USING btree ("observed_at");--> statement-breakpoint
CREATE UNIQUE INDEX "provider_instruments_asset_provider_role_uq" ON "provider_instruments" USING btree ("asset_id","provider","role");--> statement-breakpoint
CREATE UNIQUE INDEX "provider_instruments_provider_instrument_uq" ON "provider_instruments" USING btree ("provider","instrument_id") WHERE "provider_instruments"."instrument_id" is not null;--> statement-breakpoint
CREATE INDEX "provider_instruments_status_idx" ON "provider_instruments" USING btree ("provider","status");--> statement-breakpoint
CREATE INDEX "sector_memberships_asset_idx" ON "sector_memberships" USING btree ("asset_id");--> statement-breakpoint
CREATE INDEX "sector_memberships_current_idx" ON "sector_memberships" USING btree ("sector_id","sort_order") WHERE "sector_memberships"."effective_to" is null;--> statement-breakpoint
CREATE UNIQUE INDEX "sectors_sort_order_uq" ON "sectors" USING btree ("sort_order");