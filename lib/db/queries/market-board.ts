import "server-only";

import {
  and,
  asc,
  desc,
  eq,
  gt,
  gte,
  inArray,
  isNull,
  lte,
  or,
  sql,
} from "drizzle-orm";
import type { Database } from "@/lib/db/client";
import {
  assets,
  marketCandles,
  marketCaps,
  marketQuotesLatest,
  providerInstruments,
  sectorMemberships,
  sectors,
} from "@/lib/db/schema";
import type {
  BoardAggregateInput,
  BoardCandleRow,
  BoardMappingRow,
  BoardReferencePeriod,
} from "@/lib/market-data/board-aggregate";

const HOUR_MS = 60 * 60 * 1_000;
const REFERENCE_TOLERANCE_MS = 3 * HOUR_MS;

function liveCandleRows(
  rows: Array<{
    assetId: string;
    provider: "coingecko" | "gate" | "okx" | "legacy_snapshot";
    openTime: Date;
    close: number;
  }>,
): BoardCandleRow[] {
  return rows.flatMap((row) =>
    row.provider === "gate" || row.provider === "okx"
      ? [
          {
            assetId: row.assetId,
            provider: row.provider,
            openTime: row.openTime,
            close: row.close,
          },
        ]
      : [],
  );
}

async function referenceCandles(
  database: Database,
  assetIds: string[],
  target: Date,
): Promise<BoardCandleRow[]> {
  const rows = await database
    .selectDistinctOn(
      [marketCandles.assetId, marketCandles.provider],
      {
        assetId: marketCandles.assetId,
        provider: marketCandles.provider,
        openTime: marketCandles.openTime,
        close: marketCandles.close,
      },
    )
    .from(marketCandles)
    .where(
      and(
        inArray(marketCandles.assetId, assetIds),
        inArray(marketCandles.provider, ["gate", "okx"]),
        eq(marketCandles.timeframe, "1h"),
        eq(marketCandles.isComplete, true),
        gte(
          marketCandles.openTime,
          new Date(target.getTime() - REFERENCE_TOLERANCE_MS),
        ),
        lte(marketCandles.openTime, target),
      ),
    )
    .orderBy(
      marketCandles.assetId,
      marketCandles.provider,
      desc(marketCandles.openTime),
    );
  return liveCandleRows(rows);
}

export async function queryDatabaseBoardInput(
  database: Database,
  now: Date,
): Promise<
  Omit<
    BoardAggregateInput,
    "now" | "mainStreamThreshold" | "staleAfterSeconds"
  >
> {
  const assetRows = await database
    .select({
      assetId: assets.assetId,
      symbol: assets.symbol,
      name: assets.name,
    })
    .from(assets)
    .where(inArray(assets.status, ["active", "migrating"]))
    .orderBy(assets.assetId);
  const assetIds = assetRows.map((asset) => asset.assetId);

  if (assetIds.length === 0) {
    throw new Error("The asset registry has not been seeded.");
  }

  const [
    sectorRows,
    membershipRows,
    rawMappingRows,
    quoteRows,
    capRows,
  ] = await Promise.all([
    database
      .select({
        sectorId: sectors.sectorId,
        name: sectors.name,
        sortOrder: sectors.sortOrder,
      })
      .from(sectors)
      .where(eq(sectors.isActive, true))
      .orderBy(sectors.sortOrder),
    database
      .select({
        sectorId: sectorMemberships.sectorId,
        assetId: sectorMemberships.assetId,
        sortOrder: sectorMemberships.sortOrder,
      })
      .from(sectorMemberships)
      .where(
        and(
          inArray(sectorMemberships.assetId, assetIds),
          lte(sectorMemberships.effectiveFrom, now),
          or(
            isNull(sectorMemberships.effectiveTo),
            gt(sectorMemberships.effectiveTo, now),
          ),
        ),
      )
      .orderBy(sectorMemberships.sectorId, sectorMemberships.sortOrder),
    database
      .select({
        assetId: providerInstruments.assetId,
        provider: providerInstruments.provider,
        priority: providerInstruments.priority,
        supportsCandles: providerInstruments.supportsCandles,
      })
      .from(providerInstruments)
      .where(
        and(
          inArray(providerInstruments.assetId, assetIds),
          inArray(providerInstruments.provider, [
            "coingecko",
            "gate",
            "okx",
          ]),
          eq(providerInstruments.status, "active"),
          eq(providerInstruments.supportsQuotes, true),
        ),
      ),
    database
      .select({
        assetId: marketQuotesLatest.assetId,
        provider: marketQuotesLatest.provider,
        last: marketQuotesLatest.last,
        open24h: marketQuotesLatest.open24h,
        high24h: marketQuotesLatest.high24h,
        low24h: marketQuotesLatest.low24h,
        volumeQuote24h: marketQuotesLatest.volumeQuote24h,
        observedAt: marketQuotesLatest.observedAt,
        fallbackUsed: marketQuotesLatest.fallbackUsed,
        quality: marketQuotesLatest.quality,
      })
      .from(marketQuotesLatest)
      .where(inArray(marketQuotesLatest.assetId, assetIds)),
    database
      .selectDistinctOn(
        [marketCaps.assetId, marketCaps.provider],
        {
          assetId: marketCaps.assetId,
          provider: marketCaps.provider,
          marketCapUsd: marketCaps.marketCapUsd,
          observedAt: marketCaps.observedAt,
        },
      )
      .from(marketCaps)
      .where(inArray(marketCaps.assetId, assetIds))
      .orderBy(
        marketCaps.assetId,
        marketCaps.provider,
        desc(marketCaps.observedAt),
      ),
  ]);

  const mappingRows: BoardMappingRow[] = rawMappingRows.flatMap((row) =>
    row.provider === "coingecko" ||
    row.provider === "gate" ||
    row.provider === "okx"
      ? [
          {
            assetId: row.assetId,
            provider: row.provider,
            priority: row.priority,
            supportsCandles: row.supportsCandles,
          },
        ]
      : [],
  );
  const validQuoteTimes = quoteRows
    .map((quote) => quote.observedAt.getTime())
    .filter((timestamp) => Number.isFinite(timestamp) && timestamp <= now.getTime());
  const asOf = new Date(
    validQuoteTimes.length > 0 ? Math.max(...validQuoteTimes) : now.getTime(),
  );
  const recentFrom = new Date(asOf.getTime() - 25 * HOUR_MS);

  const [rawRecentCandles, reference3d, reference7d, reference30d] =
    await Promise.all([
      database
        .select({
          assetId: marketCandles.assetId,
          provider: marketCandles.provider,
          openTime: marketCandles.openTime,
          close: marketCandles.close,
        })
        .from(marketCandles)
        .where(
          and(
            inArray(marketCandles.assetId, assetIds),
            inArray(marketCandles.provider, ["gate", "okx"]),
            eq(marketCandles.timeframe, "1h"),
            eq(marketCandles.isComplete, true),
            gte(marketCandles.openTime, recentFrom),
            lte(marketCandles.openTime, asOf),
          ),
        )
        .orderBy(
          marketCandles.assetId,
          marketCandles.provider,
          desc(marketCandles.openTime),
        ),
      referenceCandles(
        database,
        assetIds,
        new Date(asOf.getTime() - 3 * 24 * HOUR_MS),
      ),
      referenceCandles(
        database,
        assetIds,
        new Date(asOf.getTime() - 7 * 24 * HOUR_MS),
      ),
      referenceCandles(
        database,
        assetIds,
        new Date(asOf.getTime() - 30 * 24 * HOUR_MS),
      ),
    ]);

  const referenceCandlesByPeriod: Record<
    BoardReferencePeriod,
    BoardCandleRow[]
  > = {
    "3d": reference3d,
    "7d": reference7d,
    "30d": reference30d,
  };

  return {
    assets: assetRows,
    sectors: sectorRows,
    memberships: membershipRows,
    mappings: mappingRows,
    quotes: quoteRows,
    marketCaps: capRows,
    recentCandles: liveCandleRows(rawRecentCandles),
    referenceCandles: referenceCandlesByPeriod,
  };
}

export async function queryLiveCandles(
  database: Database,
  assetIds: string[],
  from: Date,
  to: Date,
) {
  return database
    .select({
      assetId: marketCandles.assetId,
      provider: marketCandles.provider,
      openTime: marketCandles.openTime,
      closeTime: marketCandles.closeTime,
      open: marketCandles.open,
      high: marketCandles.high,
      low: marketCandles.low,
      close: marketCandles.close,
      volumeBase: marketCandles.volumeBase,
      volumeQuote: marketCandles.volumeQuote,
      isComplete: marketCandles.isComplete,
    })
    .from(marketCandles)
    .where(
      and(
        inArray(marketCandles.assetId, assetIds),
        inArray(marketCandles.provider, ["gate", "okx"]),
        eq(marketCandles.timeframe, "1h"),
        gte(marketCandles.openTime, from),
        lte(marketCandles.openTime, to),
      ),
    )
    .orderBy(
      marketCandles.assetId,
      marketCandles.provider,
      asc(marketCandles.openTime),
    );
}

export async function queryDailyHistoryCandles(
  database: Database,
  assetIds: string[],
  from: Date,
  to: Date,
) {
  const utcDay = sql<string>`date_trunc('day', ${marketCandles.openTime} at time zone 'UTC')`;
  return database
    .selectDistinctOn(
      [marketCandles.assetId, marketCandles.provider, utcDay],
      {
        assetId: marketCandles.assetId,
        provider: marketCandles.provider,
        openTime: marketCandles.openTime,
        closeTime: marketCandles.closeTime,
        close: marketCandles.close,
        isComplete: marketCandles.isComplete,
      },
    )
    .from(marketCandles)
    .where(
      and(
        inArray(marketCandles.assetId, assetIds),
        inArray(marketCandles.provider, ["gate", "okx"]),
        eq(marketCandles.timeframe, "1h"),
        eq(marketCandles.isComplete, true),
        gte(marketCandles.openTime, from),
        lte(marketCandles.openTime, to),
      ),
    )
    .orderBy(
      marketCandles.assetId,
      marketCandles.provider,
      utcDay,
      desc(marketCandles.openTime),
    );
}

export async function queryCandleMappings(
  database: Database,
  assetIds: string[],
) {
  return database
    .select({
      assetId: providerInstruments.assetId,
      provider: providerInstruments.provider,
      priority: providerInstruments.priority,
    })
    .from(providerInstruments)
    .where(
      and(
        inArray(providerInstruments.assetId, assetIds),
        inArray(providerInstruments.provider, ["gate", "okx"]),
        eq(providerInstruments.status, "active"),
        eq(providerInstruments.supportsCandles, true),
      ),
    )
    .orderBy(providerInstruments.assetId, providerInstruments.priority);
}
