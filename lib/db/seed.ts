import { sql } from "drizzle-orm";
import type {
  PgDatabase,
  PgQueryResultHKT,
} from "drizzle-orm/pg-core";
import {
  assetAliases,
  assets,
  providerInstruments,
  sectorMemberships,
  sectors,
} from "./schema";
import {
  buildAssetAliasRows,
  buildAssetRows,
  buildProviderInstrumentRows,
} from "@/lib/market-data/registry";
import {
  getSectorMembershipSeedRows,
  getSectorSeedRows,
} from "@/lib/market-data/sector-catalog";
import * as schema from "./schema";

export interface ReferenceSeedSummary {
  assets: number;
  aliases: number;
  providerInstruments: number;
  sectors: number;
  sectorMemberships: number;
}

export async function seedReferenceData<
  TResult extends PgQueryResultHKT,
>(
  database: PgDatabase<TResult, typeof schema>,
): Promise<ReferenceSeedSummary> {
  const assetRows = buildAssetRows();
  const aliasRows = buildAssetAliasRows();
  const providerRows = buildProviderInstrumentRows();
  const sectorRows = getSectorSeedRows();
  const membershipRows = getSectorMembershipSeedRows();

  await database.transaction(async (transaction) => {
    await transaction
      .insert(assets)
      .values(assetRows)
      .onConflictDoUpdate({
        target: assets.assetId,
        set: {
          symbol: sql`excluded.symbol`,
          name: sql`excluded.name`,
          status: sql`excluded.status`,
          primaryProvider: sql`excluded.primary_provider`,
          mappingNote: sql`excluded.mapping_note`,
          updatedAt: sql`excluded.updated_at`,
        },
      });

    if (aliasRows.length > 0) {
      await transaction
        .insert(assetAliases)
        .values(aliasRows)
        .onConflictDoUpdate({
          target: assetAliases.alias,
          set: {
            assetId: sql`excluded.asset_id`,
            aliasType: sql`excluded.alias_type`,
            note: sql`excluded.note`,
          },
        });
    }

    await transaction
      .insert(providerInstruments)
      .values(providerRows)
      .onConflictDoUpdate({
        target: providerInstruments.mappingId,
        set: {
          assetId: sql`excluded.asset_id`,
          provider: sql`excluded.provider`,
          role: sql`excluded.role`,
          instrumentId: sql`excluded.instrument_id`,
          baseSymbol: sql`excluded.base_symbol`,
          quoteSymbol: sql`excluded.quote_symbol`,
          status: sql`excluded.status`,
          priority: sql`excluded.priority`,
          supportsQuotes: sql`excluded.supports_quotes`,
          supportsCandles: sql`excluded.supports_candles`,
          supportsMarketCap: sql`excluded.supports_market_cap`,
          firstSeenAt: sql`excluded.first_seen_at`,
          lastVerifiedAt: sql`excluded.last_verified_at`,
          delistedAt: sql`excluded.delisted_at`,
          mappingNote: sql`excluded.mapping_note`,
          updatedAt: sql`excluded.updated_at`,
        },
      });

    await transaction
      .insert(sectors)
      .values(sectorRows)
      .onConflictDoUpdate({
        target: sectors.sectorId,
        set: {
          name: sql`excluded.name`,
          sortOrder: sql`excluded.sort_order`,
          isActive: sql`excluded.is_active`,
          updatedAt: sql`now()`,
        },
      });

    await transaction
      .insert(sectorMemberships)
      .values(membershipRows)
      .onConflictDoUpdate({
        target: [
          sectorMemberships.sectorId,
          sectorMemberships.assetId,
          sectorMemberships.effectiveFrom,
        ],
        set: {
          effectiveTo: sql`excluded.effective_to`,
          sortOrder: sql`excluded.sort_order`,
        },
      });
  });

  return {
    assets: assetRows.length,
    aliases: aliasRows.length,
    providerInstruments: providerRows.length,
    sectors: sectorRows.length,
    sectorMemberships: membershipRows.length,
  };
}
