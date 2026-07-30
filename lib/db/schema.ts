import { sql } from "drizzle-orm";
import {
  boolean,
  check,
  doublePrecision,
  index,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";

export const assetStatusEnum = pgEnum("asset_status", [
  "active",
  "migrating",
  "inactive",
]);

export const providerEnum = pgEnum("market_data_provider", [
  "coingecko",
  "gate",
  "okx",
  "legacy_snapshot",
]);

export const instrumentStatusEnum = pgEnum("instrument_status", [
  "active",
  "unavailable",
  "delisted",
  "migrating",
  "ambiguous",
]);

export const timeframeEnum = pgEnum("market_timeframe", ["1h", "1d"]);

export const ingestionStatusEnum = pgEnum("ingestion_status", [
  "running",
  "success",
  "partial",
  "failed",
  "skipped_duplicate",
]);

export const assets = pgTable(
  "assets",
  {
    assetId: text("asset_id").primaryKey(),
    symbol: text("symbol").notNull(),
    name: text("name").notNull(),
    status: assetStatusEnum("status").notNull().default("active"),
    primaryProvider: providerEnum("primary_provider").notNull(),
    mappingNote: text("mapping_note"),
    createdAt: timestamp("created_at", {
      withTimezone: true,
      mode: "date",
    })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp("updated_at", {
      withTimezone: true,
      mode: "date",
    })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    check(
      "assets_asset_id_format",
      sql`${table.assetId} ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$'`,
    ),
    check("assets_symbol_format", sql`${table.symbol} ~ '^[A-Z0-9.]+$'`),
  ],
);

export const assetAliases = pgTable(
  "asset_aliases",
  {
    alias: text("alias").primaryKey(),
    assetId: text("asset_id")
      .notNull()
      .references(() => assets.assetId, {
        onDelete: "cascade",
        onUpdate: "cascade",
      }),
    aliasType: text("alias_type").notNull(),
    note: text("note"),
    createdAt: timestamp("created_at", {
      withTimezone: true,
      mode: "date",
    })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    index("asset_aliases_asset_id_idx").on(table.assetId),
    check(
      "asset_aliases_alias_format",
      sql`${table.alias} ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$'`,
    ),
    check(
      "asset_aliases_type_check",
      sql`${table.aliasType} in ('legacy_asset_id', 'provider_slug', 'former_name')`,
    ),
  ],
);

export const providerInstruments = pgTable(
  "provider_instruments",
  {
    mappingId: text("mapping_id").primaryKey(),
    assetId: text("asset_id")
      .notNull()
      .references(() => assets.assetId, {
        onDelete: "cascade",
        onUpdate: "cascade",
      }),
    provider: providerEnum("provider").notNull(),
    role: text("role").notNull().default("spot"),
    instrumentId: text("instrument_id"),
    baseSymbol: text("base_symbol").notNull(),
    quoteSymbol: text("quote_symbol"),
    status: instrumentStatusEnum("status").notNull(),
    priority: integer("priority").notNull().default(100),
    supportsQuotes: boolean("supports_quotes").notNull().default(false),
    supportsCandles: boolean("supports_candles").notNull().default(false),
    supportsMarketCap: boolean("supports_market_cap")
      .notNull()
      .default(false),
    firstSeenAt: timestamp("first_seen_at", {
      withTimezone: true,
      mode: "date",
    }).notNull(),
    lastVerifiedAt: timestamp("last_verified_at", {
      withTimezone: true,
      mode: "date",
    }),
    delistedAt: timestamp("delisted_at", {
      withTimezone: true,
      mode: "date",
    }),
    mappingNote: text("mapping_note"),
    createdAt: timestamp("created_at", {
      withTimezone: true,
      mode: "date",
    })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp("updated_at", {
      withTimezone: true,
      mode: "date",
    })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    uniqueIndex("provider_instruments_asset_provider_role_uq").on(
      table.assetId,
      table.provider,
      table.role,
    ),
    uniqueIndex("provider_instruments_provider_instrument_uq")
      .on(table.provider, table.instrumentId)
      .where(sql`${table.instrumentId} is not null`),
    index("provider_instruments_status_idx").on(
      table.provider,
      table.status,
    ),
    check(
      "provider_instruments_mapping_id_format",
      sql`${table.mappingId} ~ '^[a-z0-9-]+:[a-z_]+:[a-z0-9-]+$'`,
    ),
    check(
      "provider_instruments_role_format",
      sql`${table.role} ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$'`,
    ),
    check(
      "provider_instruments_symbol_format",
      sql`${table.baseSymbol} ~ '^[A-Z0-9.]+$' and (${table.quoteSymbol} is null or ${table.quoteSymbol} ~ '^[A-Z0-9.]+$')`,
    ),
    check(
      "provider_instruments_priority_positive",
      sql`${table.priority} > 0`,
    ),
    check(
      "provider_instruments_active_has_id",
      sql`${table.status} <> 'active' or ${table.instrumentId} is not null`,
    ),
    check(
      "provider_instruments_unavailable_has_no_id",
      sql`${table.status} <> 'unavailable' or ${table.instrumentId} is null`,
    ),
    check(
      "provider_instruments_delisted_timestamp",
      sql`${table.status} <> 'delisted' or ${table.delistedAt} is not null`,
    ),
  ],
);

export const marketQuotesLatest = pgTable(
  "market_quotes_latest",
  {
    assetId: text("asset_id")
      .notNull()
      .references(() => assets.assetId, {
        onDelete: "cascade",
        onUpdate: "cascade",
      }),
    provider: providerEnum("provider").notNull(),
    instrumentId: text("instrument_id").notNull(),
    last: doublePrecision("last").notNull(),
    open24h: doublePrecision("open_24h"),
    high24h: doublePrecision("high_24h"),
    low24h: doublePrecision("low_24h"),
    volumeBase24h: doublePrecision("volume_base_24h"),
    volumeQuote24h: doublePrecision("volume_quote_24h"),
    observedAt: timestamp("observed_at", {
      withTimezone: true,
      mode: "date",
    }).notNull(),
    fetchedAt: timestamp("fetched_at", {
      withTimezone: true,
      mode: "date",
    })
      .defaultNow()
      .notNull(),
    fallbackUsed: boolean("fallback_used").notNull().default(false),
    quality: jsonb("quality")
      .$type<Record<string, unknown>>()
      .notNull()
      .default(sql`'{}'::jsonb`),
  },
  (table) => [
    primaryKey({
      name: "market_quotes_latest_pk",
      columns: [table.assetId, table.provider],
    }),
    index("market_quotes_latest_observed_at_idx").on(table.observedAt),
    check("market_quotes_latest_last_positive", sql`${table.last} > 0`),
    check(
      "market_quotes_latest_high_low",
      sql`${table.high24h} is null or ${table.low24h} is null or ${table.high24h} >= ${table.low24h}`,
    ),
    check(
      "market_quotes_latest_volume_nonnegative",
      sql`(${table.volumeBase24h} is null or ${table.volumeBase24h} >= 0) and (${table.volumeQuote24h} is null or ${table.volumeQuote24h} >= 0)`,
    ),
  ],
);

export const marketCandles = pgTable(
  "market_candles",
  {
    assetId: text("asset_id")
      .notNull()
      .references(() => assets.assetId, {
        onDelete: "cascade",
        onUpdate: "cascade",
      }),
    provider: providerEnum("provider").notNull(),
    timeframe: timeframeEnum("timeframe").notNull(),
    openTime: timestamp("open_time", {
      withTimezone: true,
      mode: "date",
    }).notNull(),
    closeTime: timestamp("close_time", {
      withTimezone: true,
      mode: "date",
    }).notNull(),
    open: doublePrecision("open").notNull(),
    high: doublePrecision("high").notNull(),
    low: doublePrecision("low").notNull(),
    close: doublePrecision("close").notNull(),
    volumeBase: doublePrecision("volume_base"),
    volumeQuote: doublePrecision("volume_quote"),
    isComplete: boolean("is_complete").notNull().default(true),
    fetchedAt: timestamp("fetched_at", {
      withTimezone: true,
      mode: "date",
    })
      .defaultNow()
      .notNull(),
    quality: jsonb("quality")
      .$type<Record<string, unknown>>()
      .notNull()
      .default(sql`'{}'::jsonb`),
  },
  (table) => [
    primaryKey({
      name: "market_candles_pk",
      columns: [
        table.assetId,
        table.provider,
        table.timeframe,
        table.openTime,
      ],
    }),
    index("market_candles_time_idx").on(table.timeframe, table.openTime),
    index("market_candles_cursor_idx").on(
      table.provider,
      table.timeframe,
      table.assetId,
      table.openTime,
    ),
    check(
      "market_candles_time_order",
      sql`${table.closeTime} > ${table.openTime}`,
    ),
    check(
      "market_candles_prices_positive",
      sql`${table.open} > 0 and ${table.high} > 0 and ${table.low} > 0 and ${table.close} > 0`,
    ),
    check(
      "market_candles_ohlc_bounds",
      sql`${table.high} >= greatest(${table.open}, ${table.close}, ${table.low}) and ${table.low} <= least(${table.open}, ${table.close}, ${table.high})`,
    ),
    check(
      "market_candles_volume_nonnegative",
      sql`(${table.volumeBase} is null or ${table.volumeBase} >= 0) and (${table.volumeQuote} is null or ${table.volumeQuote} >= 0)`,
    ),
  ],
);

export const marketCaps = pgTable(
  "market_caps",
  {
    assetId: text("asset_id")
      .notNull()
      .references(() => assets.assetId, {
        onDelete: "cascade",
        onUpdate: "cascade",
      }),
    provider: providerEnum("provider").notNull(),
    observedAt: timestamp("observed_at", {
      withTimezone: true,
      mode: "date",
    }).notNull(),
    marketCapUsd: doublePrecision("market_cap_usd").notNull(),
    circulatingSupply: doublePrecision("circulating_supply"),
    totalSupply: doublePrecision("total_supply"),
    fetchedAt: timestamp("fetched_at", {
      withTimezone: true,
      mode: "date",
    })
      .defaultNow()
      .notNull(),
    quality: jsonb("quality")
      .$type<Record<string, unknown>>()
      .notNull()
      .default(sql`'{}'::jsonb`),
  },
  (table) => [
    primaryKey({
      name: "market_caps_pk",
      columns: [table.assetId, table.provider, table.observedAt],
    }),
    index("market_caps_observed_at_idx").on(table.observedAt),
    check(
      "market_caps_values_nonnegative",
      sql`${table.marketCapUsd} >= 0 and (${table.circulatingSupply} is null or ${table.circulatingSupply} >= 0) and (${table.totalSupply} is null or ${table.totalSupply} >= 0)`,
    ),
  ],
);

export const ingestionRuns = pgTable(
  "ingestion_runs",
  {
    runId: uuid("run_id").defaultRandom().primaryKey(),
    dedupeKey: text("dedupe_key").notNull(),
    task: text("task").notNull(),
    provider: providerEnum("provider"),
    timeframe: timeframeEnum("timeframe"),
    status: ingestionStatusEnum("status").notNull().default("running"),
    cursorFrom: timestamp("cursor_from", {
      withTimezone: true,
      mode: "date",
    }),
    cursorTo: timestamp("cursor_to", {
      withTimezone: true,
      mode: "date",
    }),
    requestedCount: integer("requested_count").notNull().default(0),
    acceptedCount: integer("accepted_count").notNull().default(0),
    rejectedCount: integer("rejected_count").notNull().default(0),
    coverageRatio: doublePrecision("coverage_ratio"),
    errorSummary: jsonb("error_summary")
      .$type<Array<Record<string, unknown>>>()
      .notNull()
      .default(sql`'[]'::jsonb`),
    startedAt: timestamp("started_at", {
      withTimezone: true,
      mode: "date",
    })
      .defaultNow()
      .notNull(),
    finishedAt: timestamp("finished_at", {
      withTimezone: true,
      mode: "date",
    }),
    createdAt: timestamp("created_at", {
      withTimezone: true,
      mode: "date",
    })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    uniqueIndex("ingestion_runs_dedupe_key_uq").on(table.dedupeKey),
    index("ingestion_runs_status_started_idx").on(
      table.status,
      table.startedAt,
    ),
    index("ingestion_runs_provider_finished_idx").on(
      table.provider,
      table.finishedAt,
    ),
    check(
      "ingestion_runs_counts_nonnegative",
      sql`${table.requestedCount} >= 0 and ${table.acceptedCount} >= 0 and ${table.rejectedCount} >= 0`,
    ),
    check(
      "ingestion_runs_counts_consistent",
      sql`${table.acceptedCount} + ${table.rejectedCount} <= ${table.requestedCount}`,
    ),
    check(
      "ingestion_runs_coverage_range",
      sql`${table.coverageRatio} is null or (${table.coverageRatio} >= 0 and ${table.coverageRatio} <= 1)`,
    ),
    check(
      "ingestion_runs_cursor_order",
      sql`${table.cursorFrom} is null or ${table.cursorTo} is null or ${table.cursorTo} >= ${table.cursorFrom}`,
    ),
    check(
      "ingestion_runs_finish_order",
      sql`${table.finishedAt} is null or ${table.finishedAt} >= ${table.startedAt}`,
    ),
  ],
);

export const sectors = pgTable(
  "sectors",
  {
    sectorId: text("sector_id").primaryKey(),
    name: text("name").notNull(),
    sortOrder: integer("sort_order").notNull(),
    isActive: boolean("is_active").notNull().default(true),
    createdAt: timestamp("created_at", {
      withTimezone: true,
      mode: "date",
    })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp("updated_at", {
      withTimezone: true,
      mode: "date",
    })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    uniqueIndex("sectors_sort_order_uq").on(table.sortOrder),
    check(
      "sectors_sector_id_format",
      sql`${table.sectorId} ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$'`,
    ),
    check("sectors_sort_order_nonnegative", sql`${table.sortOrder} >= 0`),
  ],
);

export const sectorMemberships = pgTable(
  "sector_memberships",
  {
    sectorId: text("sector_id")
      .notNull()
      .references(() => sectors.sectorId, {
        onDelete: "cascade",
        onUpdate: "cascade",
      }),
    assetId: text("asset_id")
      .notNull()
      .references(() => assets.assetId, {
        onDelete: "restrict",
        onUpdate: "cascade",
      }),
    effectiveFrom: timestamp("effective_from", {
      withTimezone: true,
      mode: "date",
    }).notNull(),
    effectiveTo: timestamp("effective_to", {
      withTimezone: true,
      mode: "date",
    }),
    sortOrder: integer("sort_order").notNull(),
    createdAt: timestamp("created_at", {
      withTimezone: true,
      mode: "date",
    })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    primaryKey({
      name: "sector_memberships_pk",
      columns: [table.sectorId, table.assetId, table.effectiveFrom],
    }),
    index("sector_memberships_asset_idx").on(table.assetId),
    index("sector_memberships_current_idx")
      .on(table.sectorId, table.sortOrder)
      .where(sql`${table.effectiveTo} is null`),
    check(
      "sector_memberships_effective_order",
      sql`${table.effectiveTo} is null or ${table.effectiveTo} > ${table.effectiveFrom}`,
    ),
    check(
      "sector_memberships_sort_order_nonnegative",
      sql`${table.sortOrder} >= 0`,
    ),
  ],
);

export type AssetRow = typeof assets.$inferSelect;
export type NewAssetRow = typeof assets.$inferInsert;
export type ProviderInstrumentRow = typeof providerInstruments.$inferSelect;
export type NewProviderInstrumentRow =
  typeof providerInstruments.$inferInsert;
export type MarketCandleRow = typeof marketCandles.$inferSelect;
export type NewMarketCandleRow = typeof marketCandles.$inferInsert;
export type MarketCapRow = typeof marketCaps.$inferSelect;
export type NewMarketCapRow = typeof marketCaps.$inferInsert;
export type IngestionRunRow = typeof ingestionRuns.$inferSelect;
export type NewIngestionRunRow = typeof ingestionRuns.$inferInsert;
