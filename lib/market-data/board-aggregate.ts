import {
  createDataQuality,
  type MarketDataProvider,
} from "./contracts";
import { parseDailySnapshot } from "./snapshot-schema";
import {
  calcAmplitude,
  calcLogReturnVolatility,
  calcReturn,
  calcWeightedSectorMetrics,
} from "@/lib/metrics";
import type {
  CoinFallbackField,
  CoinSnapshot,
  DailySnapshot,
  SectorSnapshot,
} from "@/lib/types";

export type DatabaseMarketProvider =
  | "coingecko"
  | "gate"
  | "okx"
  | "legacy_snapshot";

export interface BoardAssetRow {
  assetId: string;
  symbol: string;
  name: string;
}

export interface BoardSectorRow {
  sectorId: string;
  name: string;
  sortOrder: number;
}

export interface BoardMembershipRow {
  sectorId: string;
  assetId: string;
  sortOrder: number;
}

export interface BoardMappingRow {
  assetId: string;
  provider: "coingecko" | "gate" | "okx";
  priority: number;
  supportsCandles: boolean;
}

export interface BoardQuoteRow {
  assetId: string;
  provider: DatabaseMarketProvider;
  last: number;
  open24h: number | null;
  high24h: number | null;
  low24h: number | null;
  volumeQuote24h: number | null;
  observedAt: Date;
  fallbackUsed: boolean;
  quality: Record<string, unknown>;
}

export interface BoardMarketCapRow {
  assetId: string;
  provider: DatabaseMarketProvider;
  marketCapUsd: number;
  observedAt: Date;
}

export interface BoardCandleRow {
  assetId: string;
  provider: "gate" | "okx";
  openTime: Date;
  close: number;
}

export type BoardReferencePeriod = "3d" | "7d" | "30d";

export interface BoardAggregateInput {
  now: Date;
  assets: BoardAssetRow[];
  sectors: BoardSectorRow[];
  memberships: BoardMembershipRow[];
  mappings: BoardMappingRow[];
  quotes: BoardQuoteRow[];
  marketCaps: BoardMarketCapRow[];
  recentCandles: BoardCandleRow[];
  referenceCandles: Record<BoardReferencePeriod, BoardCandleRow[]>;
  mainStreamThreshold: number;
  staleAfterSeconds: number;
}

interface SelectedValue<T> {
  row: T;
  priority: number;
}

const PROVIDER_ORDER: MarketDataProvider[] = [
  "gate",
  "okx",
  "coingecko",
  "snapshot",
];

function publicProvider(
  provider: DatabaseMarketProvider,
): MarketDataProvider {
  return provider === "legacy_snapshot" ? "snapshot" : provider;
}

function validTimestampAtOrBefore(date: Date, nowMs: number): boolean {
  const value = date.getTime();
  return Number.isFinite(value) && value <= nowMs;
}

function isStaleTimestamp(
  date: Date,
  nowMs: number,
  staleAfterSeconds: number,
): boolean {
  return nowMs - date.getTime() > staleAfterSeconds * 1_000;
}

function finiteNumber(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function sumKnown(values: Array<number | null | undefined>): number | null {
  const known = values.filter(
    (value): value is number => value != null && Number.isFinite(value),
  );
  return known.length > 0
    ? known.reduce((sum, value) => sum + value, 0)
    : null;
}

function groupByAsset<T extends { assetId: string }>(
  rows: T[],
): Map<string, T[]> {
  const grouped = new Map<string, T[]>();
  for (const row of rows) {
    const current = grouped.get(row.assetId);
    if (current) current.push(row);
    else grouped.set(row.assetId, [row]);
  }
  return grouped;
}

function mappingPriority(
  mappings: Map<string, Map<string, BoardMappingRow>>,
  assetId: string,
  provider: DatabaseMarketProvider,
): number {
  if (provider === "legacy_snapshot") return 10_000;
  return mappings.get(assetId)?.get(provider)?.priority ?? 5_000;
}

function selectQuote(
  rows: BoardQuoteRow[],
  mappings: Map<string, Map<string, BoardMappingRow>>,
  nowMs: number,
  staleAfterSeconds: number,
): SelectedValue<BoardQuoteRow> | null {
  const valid = rows
    .filter(
      (row) =>
        Number.isFinite(row.last) &&
        row.last > 0 &&
        validTimestampAtOrBefore(row.observedAt, nowMs),
    )
    .map((row) => ({
      row,
      priority: mappingPriority(mappings, row.assetId, row.provider),
    }));

  valid.sort((left, right) => {
    const leftStale = isStaleTimestamp(
      left.row.observedAt,
      nowMs,
      staleAfterSeconds,
    );
    const rightStale = isStaleTimestamp(
      right.row.observedAt,
      nowMs,
      staleAfterSeconds,
    );
    if (leftStale !== rightStale) return leftStale ? 1 : -1;
    if (left.priority !== right.priority) {
      return left.priority - right.priority;
    }
    return right.row.observedAt.getTime() - left.row.observedAt.getTime();
  });

  return valid[0] ?? null;
}

function selectMarketCap(
  rows: BoardMarketCapRow[],
  nowMs: number,
  staleAfterSeconds: number,
): BoardMarketCapRow | null {
  const valid = rows.filter(
    (row) =>
      Number.isFinite(row.marketCapUsd) &&
      row.marketCapUsd >= 0 &&
      validTimestampAtOrBefore(row.observedAt, nowMs),
  );
  valid.sort((left, right) => {
    const leftStale = isStaleTimestamp(
      left.observedAt,
      nowMs,
      staleAfterSeconds,
    );
    const rightStale = isStaleTimestamp(
      right.observedAt,
      nowMs,
      staleAfterSeconds,
    );
    if (leftStale !== rightStale) return leftStale ? 1 : -1;
    const leftPriority = left.provider === "coingecko" ? 0 : 1;
    const rightPriority = right.provider === "coingecko" ? 0 : 1;
    if (leftPriority !== rightPriority) return leftPriority - rightPriority;
    return right.observedAt.getTime() - left.observedAt.getTime();
  });
  return valid[0] ?? null;
}

function selectCandleProvider(
  assetId: string,
  rows: BoardCandleRow[],
  mappings: Map<string, Map<string, BoardMappingRow>>,
  preferred?: "gate" | "okx",
): "gate" | "okx" | null {
  const available = new Set(
    rows
      .filter(
        (row) =>
          row.assetId === assetId &&
          mappings.get(assetId)?.get(row.provider)?.supportsCandles === true &&
          Number.isFinite(row.close) &&
          row.close > 0,
      )
      .map((row) => row.provider),
  );
  if (preferred && available.has(preferred)) return preferred;

  const candidates = [...available].sort(
    (left, right) =>
      mappingPriority(mappings, assetId, left) -
      mappingPriority(mappings, assetId, right),
  );
  return candidates[0] ?? null;
}

function selectReferenceClose(
  assetId: string,
  rows: BoardCandleRow[],
  mappings: Map<string, Map<string, BoardMappingRow>>,
  preferred?: "gate" | "okx",
): { close: number; provider: "gate" | "okx" } | null {
  const provider = selectCandleProvider(
    assetId,
    rows,
    mappings,
    preferred,
  );
  if (!provider) return null;
  const selected = rows
    .filter(
      (row) =>
        row.assetId === assetId &&
        row.provider === provider &&
        Number.isFinite(row.close) &&
        row.close > 0,
    )
    .sort((left, right) => right.openTime.getTime() - left.openTime.getTime())[0];
  return selected ? { close: selected.close, provider } : null;
}

function dominantSource(
  counts: Map<MarketDataProvider, number>,
): MarketDataProvider {
  if (counts.size === 0) return "snapshot";
  return [...PROVIDER_ORDER].sort((left, right) => {
    const countDifference = (counts.get(right) ?? 0) - (counts.get(left) ?? 0);
    return countDifference || PROVIDER_ORDER.indexOf(left) - PROVIDER_ORDER.indexOf(right);
  })[0];
}

function setSourceAsOf(
  sourceAsOfMs: Map<MarketDataProvider, number>,
  source: MarketDataProvider,
  date: Date,
): void {
  const timestamp = date.getTime();
  if (!Number.isFinite(timestamp)) return;
  sourceAsOfMs.set(
    source,
    Math.max(sourceAsOfMs.get(source) ?? Number.NEGATIVE_INFINITY, timestamp),
  );
}

export function buildDatabaseBoardSnapshot(
  input: BoardAggregateInput,
): DailySnapshot {
  const nowMs = input.now.getTime();
  const generatedAt = input.now.toISOString();
  const mappings = new Map<string, Map<string, BoardMappingRow>>();
  for (const mapping of input.mappings) {
    const byProvider =
      mappings.get(mapping.assetId) ?? new Map<string, BoardMappingRow>();
    byProvider.set(mapping.provider, mapping);
    mappings.set(mapping.assetId, byProvider);
  }

  const quotesByAsset = groupByAsset(input.quotes);
  const capsByAsset = groupByAsset(input.marketCaps);
  const recentByAsset = groupByAsset(input.recentCandles);
  const referenceByPeriod = {
    "3d": groupByAsset(input.referenceCandles["3d"]),
    "7d": groupByAsset(input.referenceCandles["7d"]),
    "30d": groupByAsset(input.referenceCandles["30d"]),
  };

  const fallbackAssets = new Set<string>();
  const missingAssets = new Set<string>();
  const staleAssets = new Set<string>();
  const usedSources = new Set<MarketDataProvider>();
  const staleSources = new Set<MarketDataProvider>();
  const sourceAsOfMs = new Map<MarketDataProvider, number>();
  const quoteSourceCounts = new Map<MarketDataProvider, number>();
  const selectedQuoteTimes: number[] = [];
  const coinsByAsset = new Map<string, CoinSnapshot>();

  for (const asset of input.assets) {
    const selectedQuote = selectQuote(
      quotesByAsset.get(asset.assetId) ?? [],
      mappings,
      nowMs,
      input.staleAfterSeconds,
    );
    const selectedCap = selectMarketCap(
      capsByAsset.get(asset.assetId) ?? [],
      nowMs,
      input.staleAfterSeconds,
    );
    const quote = selectedQuote?.row ?? null;
    const source = quote ? publicProvider(quote.provider) : null;

    if (!quote || !source) {
      missingAssets.add(asset.assetId);
    } else {
      selectedQuoteTimes.push(quote.observedAt.getTime());
      usedSources.add(source);
      setSourceAsOf(sourceAsOfMs, source, quote.observedAt);
      quoteSourceCounts.set(source, (quoteSourceCounts.get(source) ?? 0) + 1);
      if (
        quote.fallbackUsed ||
        quote.provider === "legacy_snapshot" ||
        (selectedQuote?.priority ?? 0) >
          Math.min(
            ...[...(mappings.get(asset.assetId)?.values() ?? [])].map(
              (mapping) => mapping.priority,
            ),
          )
      ) {
        fallbackAssets.add(asset.assetId);
      }
      if (
        isStaleTimestamp(
          quote.observedAt,
          nowMs,
          input.staleAfterSeconds,
        )
      ) {
        staleAssets.add(asset.assetId);
        staleSources.add(source);
      }
    }

    const capSource = selectedCap
      ? publicProvider(selectedCap.provider)
      : null;
    if (selectedCap && capSource) {
      usedSources.add(capSource);
      setSourceAsOf(sourceAsOfMs, capSource, selectedCap.observedAt);
      if (selectedCap.provider === "legacy_snapshot") {
        fallbackAssets.add(asset.assetId);
      }
      if (
        isStaleTimestamp(
          selectedCap.observedAt,
          nowMs,
          input.staleAfterSeconds,
        )
      ) {
        staleAssets.add(asset.assetId);
        staleSources.add(capSource);
      }
    }

    const recentRows = recentByAsset.get(asset.assetId) ?? [];
    const preferredCandleProvider =
      quote?.provider === "gate" || quote?.provider === "okx"
        ? quote.provider
        : undefined;
    const candleProvider = selectCandleProvider(
      asset.assetId,
      recentRows,
      mappings,
      preferredCandleProvider,
    );
    const closes = candleProvider
      ? recentRows
          .filter((row) => row.provider === candleProvider)
          .sort(
            (left, right) =>
              right.openTime.getTime() - left.openTime.getTime(),
          )
          .map((row) => row.close)
      : [];
    if (candleProvider && recentRows.length > 0) {
      usedSources.add(candleProvider);
      const latest = recentRows
        .filter((row) => row.provider === candleProvider)
        .sort(
          (left, right) =>
            right.openTime.getTime() - left.openTime.getTime(),
        )[0];
      if (latest) setSourceAsOf(sourceAsOfMs, candleProvider, latest.openTime);
    }

    const references = Object.fromEntries(
      (["3d", "7d", "30d"] as const).map((period) => [
        period,
        selectReferenceClose(
          asset.assetId,
          referenceByPeriod[period].get(asset.assetId) ?? [],
          mappings,
          candleProvider ?? preferredCandleProvider,
        ),
      ]),
    ) as Record<
      BoardReferencePeriod,
      { close: number; provider: "gate" | "okx" } | null
    >;
    for (const reference of Object.values(references)) {
      if (reference) usedSources.add(reference.provider);
    }

    const marketCap = selectedCap?.marketCapUsd ?? null;
    const fallbackFields: CoinFallbackField[] =
      selectedCap?.provider === "legacy_snapshot" ? ["marketCap"] : [];
    const changeFromQuality = finiteNumber(quote?.quality.change24h);
    const return24h = quote
      ? calcReturn(quote.last, quote.open24h) ?? changeFromQuality
      : null;

    coinsByAsset.set(asset.assetId, {
      id: asset.assetId,
      symbol: asset.symbol,
      name: asset.name,
      marketCap,
      open: quote?.open24h ?? null,
      high: quote?.high24h ?? null,
      low: quote?.low24h ?? null,
      close: quote?.last ?? null,
      returnPct: return24h,
      amplitude: calcAmplitude(quote?.high24h, quote?.low24h),
      volatility:
        closes.length >= 3 ? calcLogReturnVolatility(closes) : null,
      returnPct3d: calcReturn(quote?.last, references["3d"]?.close),
      returnPct7d: calcReturn(quote?.last, references["7d"]?.close),
      returnPct30d: calcReturn(quote?.last, references["30d"]?.close),
      volume24h: quote?.volumeQuote24h ?? null,
      isMainstream:
        marketCap != null && marketCap >= input.mainStreamThreshold,
      source: source ?? undefined,
      observedAt: quote?.observedAt.toISOString(),
      fallbackUsed:
        fallbackAssets.has(asset.assetId) || fallbackFields.length > 0,
      fallbackFields,
    });
  }

  const membershipsBySector = new Map<string, BoardMembershipRow[]>();
  for (const membership of input.memberships) {
    const rows = membershipsBySector.get(membership.sectorId) ?? [];
    rows.push(membership);
    membershipsBySector.set(membership.sectorId, rows);
  }

  const sectorSnapshots: SectorSnapshot[] = [...input.sectors]
    .sort((left, right) => left.sortOrder - right.sortOrder)
    .map((sector) => {
      const coins = (membershipsBySector.get(sector.sectorId) ?? [])
        .sort((left, right) => left.sortOrder - right.sortOrder)
        .flatMap((membership) => {
          const coin = coinsByAsset.get(membership.assetId);
          return coin ? [coin] : [];
        });
      return {
        id: sector.sectorId,
        name: sector.name,
        totalMarketCap: sumKnown(coins.map((coin) => coin.marketCap)),
        totalVolume24h: sumKnown(coins.map((coin) => coin.volume24h)),
        ...calcWeightedSectorMetrics(coins),
        coins,
      };
    });

  const asOfMs =
    selectedQuoteTimes.length > 0
      ? Math.max(...selectedQuoteTimes)
      : nowMs - (input.staleAfterSeconds + 1) * 1_000;
  const asOf = new Date(asOfMs).toISOString();
  if (usedSources.size === 0) usedSources.add("snapshot");
  const sources = PROVIDER_ORDER.filter((source) => usedSources.has(source));
  const sourceAsOf = Object.fromEntries(
    [...sourceAsOfMs.entries()]
      .filter(([source]) => usedSources.has(source))
      .map(([source, timestamp]) => [source, new Date(timestamp).toISOString()]),
  );
  const coverageRatio =
    input.assets.length === 0
      ? 0
      : (input.assets.length - missingAssets.size) / input.assets.length;
  const isStale =
    staleAssets.size > 0 ||
    missingAssets.size > 0 ||
    nowMs - asOfMs > input.staleAfterSeconds * 1_000;
  const source = dominantSource(quoteSourceCounts);

  return parseDailySnapshot({
    date: asOf.slice(0, 13),
    generatedAt,
    source,
    dataQuality: createDataQuality({
      asOf,
      generatedAt,
      sources,
      fallbackAssets: [...fallbackAssets].sort(),
      missingAssets: [...missingAssets].sort(),
      coverageRatio,
      isStale,
      staleAfterSeconds: input.staleAfterSeconds,
      sourceAsOf,
      staleSources: PROVIDER_ORDER.filter((provider) =>
        staleSources.has(provider),
      ),
    }),
    sectors: sectorSnapshots,
  });
}
