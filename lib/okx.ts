import type {
  CoinSnapshot,
  CustomSectorConfig,
  DailySnapshot,
  SectorConfig,
  SectorSnapshot,
} from "./types";
import {
  calcAmplitude,
  calcLogReturnVolatility,
  calcLookbackReturn,
  calcWeightedSectorMetrics,
} from "./metrics";
import {
  normalizeOkxTicker,
  parseOkxCandlesPayload,
  parseOkxTickersPayload,
  type OkxTickerPayload,
} from "./market-data/provider-normalizers";
import {
  createDataQuality,
  type MarketDataProvider,
} from "./market-data/contracts";
import {
  isTimestampStale,
  LIVE_DATA_STALE_AFTER_SECONDS,
  SNAPSHOT_FALLBACK_STALE_AFTER_SECONDS,
} from "./market-data/freshness";
import type { CoinFallbackField } from "./types";
import { createProviderInstrumentMap } from "./market-data/registry";

// Canonical asset ID → active OKX spot instrument.
// Non-active mappings remain explicit in data/assets.json and surface as null.
export const CG_TO_OKX: Record<string, string | null> =
  createProviderInstrumentMap("okx");

let tickerCache: { data: Map<string, OkxTickerPayload>; ts: number } | null = null;
const klinesCache = new Map<string, { data: number[]; ts: number }>();
const klinesInFlight = new Map<
  string,
  Promise<{ instId: string; closes: number[] }>
>();
const TICKER_CACHE_MS = 5_000;
const KLINES_CACHE_MS = 300_000;

export async function fetchOkxSpotTickers(): Promise<Map<string, OkxTickerPayload>> {
  const now = Date.now();
  if (tickerCache && now - tickerCache.ts < TICKER_CACHE_MS) {
    return tickerCache.data;
  }

  const response = await fetch("/api/okx/market/tickers?instType=SPOT");
  if (!response.ok) throw new Error(`OKX API returned ${response.status}`);
  const parsed = parseOkxTickersPayload(
    await response.json(),
    new Date(now).toISOString(),
  );
  if (parsed.status === "failed") {
    throw new Error(
      `OKX tickers failed schema validation: ${parsed.errors[0]?.message ?? "unknown error"}`,
    );
  }

  const map = new Map(parsed.data.map((ticker) => [ticker.instId, ticker]));
  tickerCache = { data: map, ts: now };
  return map;
}

async function fetchOneKlines(
  instrumentId: string,
): Promise<{ instId: string; closes: number[] }> {
  const response = await fetch(
    `/api/okx/market/candles?instId=${instrumentId}&bar=1D&limit=31`,
  );
  if (!response.ok) throw new Error(`${instrumentId} ${response.status}`);
  const parsed = parseOkxCandlesPayload(
    await response.json(),
    instrumentId,
    instrumentId,
  );
  if (parsed.status === "failed" || parsed.data.some((candle) => candle.close == null)) {
    throw new Error(
      `${instrumentId} candle schema failed: ${parsed.errors[0]?.message ?? "missing close"}`,
    );
  }
  return {
    instId: instrumentId,
    closes: parsed.data.map((candle) => candle.close!),
  };
}

async function fetchWithRetry(
  instrumentId: string,
  retries = 2,
): Promise<{ instId: string; closes: number[] }> {
  for (let attempt = 0; attempt <= retries; attempt += 1) {
    try {
      return await fetchOneKlines(instrumentId);
    } catch (error) {
      if (attempt === retries) throw error;
      await new Promise((resolve) => setTimeout(resolve, 500 * (attempt + 1)));
    }
  }
  throw new Error("unreachable");
}

function requestOkxKlines(
  instrumentId: string,
): Promise<{ instId: string; closes: number[] }> {
  const inFlight = klinesInFlight.get(instrumentId);
  if (inFlight) return inFlight;

  const request = fetchWithRetry(instrumentId);
  klinesInFlight.set(instrumentId, request);
  const clearInFlight = () => {
    if (klinesInFlight.get(instrumentId) === request) {
      klinesInFlight.delete(instrumentId);
    }
  };
  void request.then(clearInFlight, clearInFlight);
  return request;
}

export async function fetchOkxKlines(
  instrumentIds: string[],
): Promise<Map<string, number[]>> {
  const now = Date.now();
  const result = new Map<string, number[]>();
  const unique = [...new Set(instrumentIds)];
  const pending: string[] = [];

  for (const instrumentId of unique) {
    const cached = klinesCache.get(instrumentId);
    if (cached && now - cached.ts < KLINES_CACHE_MS) {
      result.set(instrumentId, cached.data);
    } else {
      pending.push(instrumentId);
    }
  }

  for (const [instrumentId, cached] of klinesCache) {
    if (now - cached.ts >= KLINES_CACHE_MS * 6) {
      klinesCache.delete(instrumentId);
    }
  }

  const batchSize = 4;
  for (let index = 0; index < pending.length; index += batchSize) {
    const responses = await Promise.allSettled(
      pending
        .slice(index, index + batchSize)
        .map((instrumentId) => requestOkxKlines(instrumentId)),
    );
    for (const response of responses) {
      if (response.status === "fulfilled") {
        klinesCache.set(response.value.instId, {
          data: response.value.closes,
          ts: Date.now(),
        });
        result.set(response.value.instId, response.value.closes);
      }
    }
    if (index + batchSize < pending.length) {
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
  }

  return result;
}

function sumKnown(values: Array<number | null | undefined>): number | null {
  const known = values.filter(
    (value): value is number => value != null && Number.isFinite(value),
  );
  return known.length > 0
    ? known.reduce((sum, value) => sum + value, 0)
    : null;
}

function sectorFromCoins(
  id: string,
  name: string,
  coins: CoinSnapshot[],
): SectorSnapshot {
  return {
    id,
    name,
    totalMarketCap: sumKnown(coins.map((coin) => coin.marketCap)),
    totalVolume24h: sumKnown(coins.map((coin) => coin.volume24h)),
    ...calcWeightedSectorMetrics(coins),
    coins,
  };
}

function getSnapshotFallbackFields(
  fallback: CoinSnapshot | undefined,
): CoinFallbackField[] {
  if (!fallback) return [];

  const fields: CoinFallbackField[] = ["isMainstream"];
  if (fallback.marketCap != null) fields.unshift("marketCap");
  return fields;
}

export function buildSnapshotFromOkx(
  sectorsConfig: SectorConfig[],
  okxData: Map<string, OkxTickerPayload>,
  fallbackSnapshot: DailySnapshot,
  klinesData?: Map<string, number[]>,
): DailySnapshot {
  const generatedAt = new Date().toISOString();
  const fallbackCoinMap = new Map<string, CoinSnapshot>();
  for (const sector of fallbackSnapshot.sectors) {
    for (const coin of sector.coins) fallbackCoinMap.set(coin.id, coin);
  }

  const expectedAssets = new Set(sectorsConfig.flatMap((sector) => sector.coins));
  const coveredAssets = new Set<string>();
  const fallbackAssets = new Set<string>();
  const missingAssets = new Set<string>();
  const sectors: SectorSnapshot[] = [];

  for (const sectorConfig of sectorsConfig) {
    const coins: CoinSnapshot[] = [];
    for (const coinId of sectorConfig.coins) {
      const fallback = fallbackCoinMap.get(coinId);
      const instrumentId = CG_TO_OKX[coinId];
      const ticker = instrumentId ? okxData.get(instrumentId) : undefined;

      if (ticker && instrumentId) {
        const quote = normalizeOkxTicker(ticker, coinId, generatedAt);
        if (quote.price != null) {
          const closes = klinesData?.get(instrumentId);
          const fallbackFields = getSnapshotFallbackFields(fallback);
          if (fallbackFields.length > 0) fallbackAssets.add(coinId);
          const coin: CoinSnapshot = {
            id: coinId,
            symbol: instrumentId.replace(/-USDT$/i, ""),
            name: fallback?.name ?? coinId,
            marketCap: fallback?.marketCap ?? null,
            open: quote.open24h,
            high: quote.high24h,
            low: quote.low24h,
            close: quote.price,
            returnPct: quote.change24h,
            amplitude: calcAmplitude(quote.high24h, quote.low24h),
            volatility: calcLogReturnVolatility(closes ?? []),
            returnPct3d: calcLookbackReturn(quote.price, closes, 3),
            returnPct7d: calcLookbackReturn(quote.price, closes, 7),
            returnPct30d: calcLookbackReturn(quote.price, closes, 30),
            volume24h: quote.volume24h,
            isMainstream: fallback?.isMainstream ?? false,
            source: "okx",
            fallbackUsed: fallbackFields.length > 0,
            fallbackFields,
          };
          coins.push(coin);
          if (coin.returnPct != null) coveredAssets.add(coinId);
          continue;
        }
      }

      if (fallback) {
        fallbackAssets.add(coinId);
        const coin: CoinSnapshot = {
          ...fallback,
          open: null,
          high: null,
          low: null,
          close: null,
          returnPct: null,
          amplitude: null,
          volatility: null,
          returnPct3d: null,
          returnPct7d: null,
          returnPct30d: null,
          volume24h: null,
          source: "snapshot",
          fallbackUsed: true,
          fallbackFields: getSnapshotFallbackFields(fallback),
        };
        coins.push(coin);
        if (coin.returnPct != null) coveredAssets.add(coinId);
      } else {
        missingAssets.add(coinId);
      }
    }
    sectors.push(sectorFromCoins(sectorConfig.id, sectorConfig.name, coins));
  }
  const fallbackAsOf =
    fallbackAssets.size > 0
      ? fallbackSnapshot.dataQuality?.asOf ?? fallbackSnapshot.generatedAt
      : undefined;
  const staleSources: MarketDataProvider[] =
    fallbackAsOf &&
    isTimestampStale(
      fallbackAsOf,
      SNAPSHOT_FALLBACK_STALE_AFTER_SECONDS,
      Date.parse(generatedAt),
    )
      ? ["snapshot"]
      : [];

  return {
    date: generatedAt.slice(0, 13),
    generatedAt,
    source: "okx",
    dataQuality: createDataQuality({
      asOf: generatedAt,
      generatedAt,
      sources: fallbackAssets.size > 0 ? ["okx", "snapshot"] : ["okx"],
      fallbackAssets: [...fallbackAssets],
      missingAssets: [...missingAssets],
      coverageRatio:
        expectedAssets.size > 0 ? coveredAssets.size / expectedAssets.size : 0,
      isStale: staleSources.length > 0,
      staleAfterSeconds: LIVE_DATA_STALE_AFTER_SECONDS,
      sourceAsOf: {
        okx: generatedAt,
        ...(fallbackAsOf ? { snapshot: fallbackAsOf } : {}),
      },
      staleSources,
    }),
    sectors,
  };
}

export function getOkxUsdtSpotIds(okxData: Map<string, OkxTickerPayload>): string[] {
  return [...okxData.keys()]
    .filter((instrumentId) => instrumentId.endsWith("-USDT"))
    .sort();
}

export function buildCustomSectorsFromOkx(
  customSectors: CustomSectorConfig[],
  okxData: Map<string, OkxTickerPayload>,
  fallbackSnapshot: DailySnapshot,
  klinesData?: Map<string, number[]>,
): SectorSnapshot[] {
  const generatedAt = new Date().toISOString();
  const fallbackBySymbol = new Map<string, CoinSnapshot>();
  for (const sector of fallbackSnapshot.sectors) {
    for (const coin of sector.coins) {
      fallbackBySymbol.set(coin.symbol.toUpperCase(), coin);
    }
  }

  const result: SectorSnapshot[] = [];
  for (const customSector of customSectors) {
    const coins: CoinSnapshot[] = [];
    for (const instrumentId of customSector.coins) {
      const ticker = okxData.get(instrumentId);
      if (!ticker) continue;
      const symbol = instrumentId.replace(/-USDT$/i, "");
      const fallback = fallbackBySymbol.get(symbol.toUpperCase());
      const quote = normalizeOkxTicker(
        ticker,
        `custom-${instrumentId}`,
        generatedAt,
      );
      if (quote.price == null) continue;
      const closes = klinesData?.get(instrumentId);
      const fallbackFields = getSnapshotFallbackFields(fallback).filter(
        (field) => field === "marketCap",
      );

      coins.push({
        id: `custom-${instrumentId}`,
        symbol,
        name: fallback?.name ?? symbol,
        marketCap: fallback?.marketCap ?? null,
        open: quote.open24h,
        high: quote.high24h,
        low: quote.low24h,
        close: quote.price,
        returnPct: quote.change24h,
        amplitude: calcAmplitude(quote.high24h, quote.low24h),
        volatility: calcLogReturnVolatility(closes ?? []),
        returnPct3d: calcLookbackReturn(quote.price, closes, 3),
        returnPct7d: calcLookbackReturn(quote.price, closes, 7),
        returnPct30d: calcLookbackReturn(quote.price, closes, 30),
        volume24h: quote.volume24h,
        isMainstream: true,
        source: "okx",
        fallbackUsed: fallbackFields.length > 0,
        fallbackFields,
      });
    }

    if (coins.length > 0) {
      result.push(sectorFromCoins(customSector.id, customSector.name, coins));
    }
  }
  return result;
}
