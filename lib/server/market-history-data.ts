import "server-only";

import { unstable_cache } from "next/cache";
import { getDatabase } from "@/lib/db/client";
import {
  queryCandleMappings,
  queryDailyHistoryCandles,
  queryLiveCandles,
} from "@/lib/db/queries/market-board";
import {
  CandlesResponseSchema,
  HistoryResponseSchema,
  type CandlesQuery,
  type CandlesResponse,
  type HistoryResponse,
} from "@/lib/market-data/bff-contracts";
import { getAssetDefinition } from "@/lib/market-data/registry";

const HOUR_MS = 60 * 60 * 1_000;
const DAY_MS = 24 * HOUR_MS;
const MAX_CANDLE_RANGE_MS = 31 * DAY_MS;
const CANDLE_STALE_AFTER_SECONDS = 2 * 60 * 60;
const HISTORY_STALE_AFTER_SECONDS = 36 * 60 * 60;

type LiveProvider = "gate" | "okx";

export class PublicDataQueryError extends Error {
  readonly code: string;

  constructor(code: string, message: string) {
    super(message);
    this.name = "PublicDataQueryError";
    this.code = code;
  }
}

function floorToHour(date: Date): Date {
  const result = new Date(date);
  result.setUTCMinutes(0, 0, 0);
  return result;
}

function floorToDay(date: Date): Date {
  const result = new Date(date);
  result.setUTCHours(0, 0, 0, 0);
  return result;
}

function isLiveProvider(value: string): value is LiveProvider {
  return value === "gate" || value === "okx";
}

function providerPriorities(
  rows: Array<{ assetId: string; provider: string; priority: number }>,
): Map<string, LiveProvider[]> {
  const result = new Map<string, LiveProvider[]>();
  for (const row of rows) {
    if (!isLiveProvider(row.provider)) continue;
    const providers = result.get(row.assetId) ?? [];
    if (!providers.includes(row.provider)) providers.push(row.provider);
    result.set(row.assetId, providers);
  }
  return result;
}

function pickProvider(
  assetId: string,
  available: Set<LiveProvider>,
  priorities: Map<string, LiveProvider[]>,
): LiveProvider | null {
  return (
    priorities
      .get(assetId)
      ?.find((provider) => available.has(provider)) ??
    [...available][0] ??
    null
  );
}

function metaTimestamp(
  dates: Date[],
  fallback: Date,
): string {
  const timestamps = dates
    .map((date) => date.getTime())
    .filter(Number.isFinite);
  return new Date(
    timestamps.length > 0 ? Math.max(...timestamps) : fallback.getTime(),
  ).toISOString();
}

async function buildCandlesResponse(
  assetId: string,
  fromIso: string,
  toIso: string,
  limit: number,
): Promise<CandlesResponse> {
  const database = getDatabase();
  const from = new Date(fromIso);
  const to = new Date(toIso);
  const [rows, mappingRows] = await Promise.all([
    queryLiveCandles(database, [assetId], from, to),
    queryCandleMappings(database, [assetId]),
  ]);
  const priorities = providerPriorities(mappingRows);
  const available = new Set<LiveProvider>(
    rows.flatMap((row) =>
      isLiveProvider(row.provider) ? [row.provider] : [],
    ),
  );
  const provider = pickProvider(assetId, available, priorities);
  const selected = rows
    .filter((row) => row.provider === provider)
    .slice(-limit);
  const generatedAt = new Date();
  const asOf = metaTimestamp(
    selected.map((row) => row.closeTime),
    from,
  );
  const expected = Math.min(
    limit,
    Math.max(1, Math.ceil((to.getTime() - from.getTime()) / HOUR_MS)),
  );
  const coverageRatio = Math.min(1, selected.length / expected);
  const firstPriority = priorities.get(assetId)?.[0] ?? null;
  const fallbackAssets =
    provider != null && firstPriority != null && provider !== firstPriority
      ? [assetId]
      : [];

  return CandlesResponseSchema.parse({
    data: {
      assetId,
      timeframe: "1h",
      provider,
      candles: selected.map((row) => ({
        openTime: row.openTime.toISOString(),
        closeTime: row.closeTime.toISOString(),
        open: row.open,
        high: row.high,
        low: row.low,
        close: row.close,
        volumeBase: row.volumeBase,
        volumeQuote: row.volumeQuote,
        isComplete: row.isComplete,
      })),
    },
    meta: {
      asOf,
      generatedAt: generatedAt.toISOString(),
      sources: provider ? [provider] : [],
      fallbackAssets,
      missingAssets: provider ? [] : [assetId],
      coverageRatio,
      isStale:
        provider == null ||
        generatedAt.getTime() - Date.parse(asOf) >
          CANDLE_STALE_AFTER_SECONDS * 1_000,
      staleAfterSeconds: CANDLE_STALE_AFTER_SECONDS,
    },
  });
}

const getCachedCandlesResponse = unstable_cache(
  buildCandlesResponse,
  ["p4-candles-v1"],
  {
    revalidate: 300,
    tags: ["market-candles"],
  },
);

export async function getCandlesResponse(
  query: CandlesQuery,
): Promise<CandlesResponse> {
  if (!getAssetDefinition(query.assetId)) {
    throw new PublicDataQueryError(
      "UNKNOWN_ASSET",
      "The requested asset is not tracked.",
    );
  }

  const to = query.to ? new Date(query.to) : floorToHour(new Date());
  const from = query.from
    ? new Date(query.from)
    : new Date(to.getTime() - Math.min(query.limit, 744) * HOUR_MS);
  if (to.getTime() - from.getTime() > MAX_CANDLE_RANGE_MS) {
    throw new PublicDataQueryError(
      "RANGE_TOO_LARGE",
      "The candle range cannot exceed 31 days.",
    );
  }

  return getCachedCandlesResponse(
    query.assetId,
    from.toISOString(),
    to.toISOString(),
    query.limit,
  );
}

async function buildHistoryResponse(
  assetIdsKey: string,
  days: number,
  fromIso: string,
  toIso: string,
): Promise<HistoryResponse> {
  const assetIds = assetIdsKey.split(",");
  const from = new Date(fromIso);
  const to = new Date(toIso);
  const database = getDatabase();
  const [rows, mappingRows] = await Promise.all([
    queryDailyHistoryCandles(database, assetIds, from, to),
    queryCandleMappings(database, assetIds),
  ]);
  const priorities = providerPriorities(mappingRows);
  const missingAssets: string[] = [];
  const fallbackAssets: string[] = [];
  const sources = new Set<LiveProvider>();
  const allDates: Date[] = [];
  let totalPoints = 0;
  const rowsByAsset = new Map<string, typeof rows>();
  for (const row of rows) {
    const current = rowsByAsset.get(row.assetId) ?? [];
    current.push(row);
    rowsByAsset.set(row.assetId, current);
  }

  const assets = assetIds.map((assetId) => {
    const assetRows = rowsByAsset.get(assetId) ?? [];
    const available = new Set<LiveProvider>(
      assetRows.flatMap((row) =>
        row.isComplete && isLiveProvider(row.provider)
          ? [row.provider]
          : [],
      ),
    );
    const provider = pickProvider(assetId, available, priorities);
    if (!provider) missingAssets.push(assetId);
    else {
      sources.add(provider);
      if (provider !== priorities.get(assetId)?.[0]) {
        fallbackAssets.push(assetId);
      }
    }

    const byDay = new Map<
      string,
      { time: Date; close: number }
    >();
    for (const row of assetRows) {
      if (row.provider !== provider || !row.isComplete) continue;
      const day = row.openTime.toISOString().slice(0, 10);
      const existing = byDay.get(day);
      if (!existing || row.openTime > existing.time) {
        byDay.set(day, { time: row.closeTime, close: row.close });
      }
    }
    const points = [...byDay.values()]
      .sort((left, right) => left.time.getTime() - right.time.getTime())
      .map((point) => {
        allDates.push(point.time);
        return {
          time: point.time.toISOString(),
          close: point.close,
        };
      });
    totalPoints += points.length;
    return {
      assetId,
      provider,
      coverageRatio: Math.min(1, points.length / days),
      points,
    };
  });

  const generatedAt = new Date();
  const asOf = metaTimestamp(allDates, from);
  const coverageRatio =
    assetIds.length === 0
      ? 0
      : Math.min(1, totalPoints / (assetIds.length * days));

  return HistoryResponseSchema.parse({
    data: {
      timeframe: "1d",
      days,
      assets,
    },
    meta: {
      asOf,
      generatedAt: generatedAt.toISOString(),
      sources: [...sources],
      fallbackAssets: [...new Set(fallbackAssets)].sort(),
      missingAssets: missingAssets.sort(),
      coverageRatio,
      isStale:
        missingAssets.length > 0 ||
        generatedAt.getTime() - Date.parse(asOf) >
          HISTORY_STALE_AFTER_SECONDS * 1_000,
      staleAfterSeconds: HISTORY_STALE_AFTER_SECONDS,
    },
  });
}

const getCachedHistoryResponse = unstable_cache(
  buildHistoryResponse,
  ["p4-history-v1"],
  {
    revalidate: 300,
    tags: ["market-history"],
  },
);

export async function getHistoryResponse(
  requestedAssetIds: string[],
  days: number,
): Promise<HistoryResponse> {
  const assetIds = [...new Set(requestedAssetIds)].sort();
  if (assetIds.length === 0 || assetIds.length > 56) {
    throw new PublicDataQueryError(
      "INVALID_ASSET_COUNT",
      "Request between 1 and 56 unique assets.",
    );
  }
  const unknown = assetIds.filter((assetId) => !getAssetDefinition(assetId));
  if (unknown.length > 0) {
    throw new PublicDataQueryError(
      "UNKNOWN_ASSET",
      "One or more requested assets are not tracked.",
    );
  }

  const dayStart = floorToDay(new Date());
  const from = new Date(dayStart.getTime() - days * DAY_MS);
  const to = new Date(dayStart.getTime() - 1);
  return getCachedHistoryResponse(
    assetIds.join(","),
    days,
    from.toISOString(),
    to.toISOString(),
  );
}
