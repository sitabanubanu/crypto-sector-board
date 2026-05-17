const BASE_URL = "https://api.coingecko.com/api/v3";
const RATE_LIMIT_MS = 8000;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function fetchWithRetry(url: string, retries = 3): Promise<Response> {
  for (let attempt = 0; attempt < retries; attempt++) {
    const res = await fetch(url);
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

export interface CoinMarketItem {
  id: string;
  symbol: string;
  name: string;
  market_cap: number;
  current_price: number;
  high_24h: number;
  low_24h: number;
  price_change_percentage_24h: number;
  ath: number;
  atl: number;
  price_change_percentage_7d_in_currency: number | null;
  price_change_percentage_30d_in_currency: number | null;
}

// Fetch klines-like closes from CoinGecko market_chart (hourly prices).
// Returns Map<coinId, closes[]> where closes are in descending order (index 0 = most recent).
// Used as last-resort fallback for coins not listed on Gate.io or OKX (e.g. XMR, Aster).
export async function fetchCgKlines(coinIds: string[]): Promise<Map<string, number[]>> {
  const result = new Map<string, number[]>();
  const unique = [...new Set(coinIds)];

  // CoinGecko free API is very rate-limited — fetch sequentially with delay
  for (let i = 0; i < unique.length; i++) {
    const coinId = unique[i];
    try {
      const url = `/api/cg/coins/${coinId}/market_chart?vs_currency=usd&days=31`;
      const res = await fetch(url);
      if (!res.ok) {
        console.warn(`CG klines ${coinId}: HTTP ${res.status}`);
        continue;
      }
      const json = await res.json();
      const prices: [number, number][] = json?.prices;
      if (!Array.isArray(prices) || prices.length < 72) {
        console.warn(`CG klines ${coinId}: insufficient data (${prices?.length ?? 0} points)`);
        continue;
      }

      // prices are ascending by time. Find closest price to N days ago.
      const latestTs = prices[prices.length - 1][0];
      const targets = [0, 3, 7, 30].map((d) => latestTs - d * 86400000);

      const closes: number[] = [];
      for (const target of targets) {
        let best = prices[0][1];
        let bestDist = Infinity;
        for (const [ts, price] of prices) {
          const dist = Math.abs(ts - target);
          if (dist < bestDist) {
            bestDist = dist;
            best = price;
          }
        }
        closes.push(best);
      }

      result.set(coinId, closes);
    } catch (e) {
      console.warn(`CG klines ${coinId}: fetch error`, e);
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
    const url = `${BASE_URL}/coins/markets?vs_currency=usd&ids=${ids}&order=market_cap_desc&per_page=${batchSize}&page=1&sparkline=false&price_change_percentage=24h,7d,30d`;
    if (i > 0) await sleep(RATE_LIMIT_MS);
    console.log(`  Fetching batch ${Math.floor(i / batchSize) + 1} (${batch.length} coins)...`);
    const res = await fetchWithRetry(url);
    const data = (await res.json()) as CoinMarketItem[];
    results.push(...data);
  }

  return results;
}
