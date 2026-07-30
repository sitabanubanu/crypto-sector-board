const RATE_LIMIT_MS = 8000;
const PERIOD_PRICE_CACHE_MS = 300_000;
const periodPriceCache = new Map<
  string,
  { data: PeriodReferencePrices | null; fetchedAt: number }
>();

import {
  extractCoinGeckoPeriodPrices,
  parseCoinGeckoMarketsPayload,
  type CoinMarketItem,
} from "./market-data/provider-normalizers";
import type { PeriodReferencePrices } from "./market-data/contracts";

export type { CoinMarketItem } from "./market-data/provider-normalizers";

function getBaseUrl(): string {
  return process.env.COINGECKO_API_KEY
    ? "https://pro-api.coingecko.com/api/v3"
    : "https://api.coingecko.com/api/v3";
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function fetchWithRetry(url: string, retries = 3): Promise<Response> {
  const headers: Record<string, string> = {};
  if (process.env.COINGECKO_API_KEY) {
    headers["x-cg-pro-api-key"] = process.env.COINGECKO_API_KEY;
  }

  for (let attempt = 0; attempt < retries; attempt++) {
    const res = await fetch(url, { headers });
    if (res.ok) return res;
    if (res.status === 429) {
      const wait = Math.pow(2, attempt + 1) * 2000;
      console.warn(`Rate limited, waiting ${wait}ms before retry...`);
      await sleep(wait);
      continue;
    }
    if (attempt === retries - 1) {
      throw new Error(`Failed to fetch ${url}: ${res.status} ${res.statusText}`);
    }
    await sleep(3000);
  }
  throw new Error(`Exhausted retries for ${url}`);
}

// CoinGecko market_chart is used only for explicit lookback reference prices.
// It must not be exposed as a fake sequence of daily closes.
export async function fetchCgPeriodPrices(
  coinIds: string[],
): Promise<Map<string, PeriodReferencePrices>> {
  const result = new Map<string, PeriodReferencePrices>();
  const unique = [...new Set(coinIds)];

  // CoinGecko free API is very rate-limited — fetch sequentially with delay
  for (let i = 0; i < unique.length; i++) {
    const coinId = unique[i];
    const cached = periodPriceCache.get(coinId);
    if (cached && Date.now() - cached.fetchedAt < PERIOD_PRICE_CACHE_MS) {
      if (cached.data) result.set(coinId, cached.data);
      continue;
    }

    try {
      const url = `/api/cg/coins/${coinId}/market_chart?vs_currency=usd&days=31`;
      const res = await fetch(url);
      if (!res.ok) {
        console.warn(`CG lookbacks ${coinId}: HTTP ${res.status}`);
        periodPriceCache.set(coinId, { data: null, fetchedAt: Date.now() });
        if (i < unique.length - 1) await sleep(3000);
        continue;
      }
      const json = await res.json();
      const referencePrices = extractCoinGeckoPeriodPrices(json);
      if (referencePrices.current == null) {
        console.warn(`CG lookbacks ${coinId}: no current price`);
        periodPriceCache.set(coinId, { data: null, fetchedAt: Date.now() });
        if (i < unique.length - 1) await sleep(3000);
        continue;
      }
      result.set(coinId, referencePrices);
      periodPriceCache.set(coinId, {
        data: referencePrices,
        fetchedAt: Date.now(),
      });
    } catch (e) {
      console.warn(`CG lookbacks ${coinId}: fetch or schema error`, e);
      periodPriceCache.set(coinId, { data: null, fetchedAt: Date.now() });
    }

    // Rate-limit: CoinGecko free allows ~10-30 req/min. 3s between calls is safe.
    if (i < unique.length - 1) {
      await sleep(3000);
    }
  }

  return result;
}

export async function fetchCoinsMarkets(coinIds: string[]): Promise<CoinMarketItem[]> {
  const batchSize = 50;
  const results: CoinMarketItem[] = [];

  for (let i = 0; i < coinIds.length; i += batchSize) {
    const batch = coinIds.slice(i, i + batchSize);
    const ids = batch.join(",");
    const url = `${getBaseUrl()}/coins/markets?vs_currency=usd&ids=${ids}&order=market_cap_desc&per_page=${batchSize}&page=1&sparkline=false&price_change_percentage=24h,7d,30d`;
    if (i > 0) await sleep(RATE_LIMIT_MS);
    console.log(`  Fetching batch ${Math.floor(i / batchSize) + 1} (${batch.length} coins)...`);
    const res = await fetchWithRetry(url);
    const parsed = parseCoinGeckoMarketsPayload(
      await res.json(),
      new Date().toISOString(),
    );
    if (parsed.status === "failed") {
      throw new Error(`CoinGecko response failed schema validation: ${parsed.errors[0]?.message ?? "unknown error"}`);
    }
    if (parsed.status === "partial") {
      console.warn(
        `  CoinGecko batch accepted ${parsed.data.length}/${batch.length} records`,
      );
    }
    results.push(...parsed.data);
  }

  return results;
}
