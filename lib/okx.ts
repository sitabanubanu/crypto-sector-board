import type { SectorConfig, CoinSnapshot, SectorSnapshot, DailySnapshot, OkxTicker, CustomSectorConfig } from "./types";
import { calcWeightedSectorMetrics } from "./metrics";

// CoinGecko coin ID → OKX spot instrument ID (USDT pairs)
export const CG_TO_OKX: Record<string, string | null> = {
  // BTC
  bitcoin: "BTC-USDT",
  // Layer 1
  ethereum: "ETH-USDT",
  solana: "SOL-USDT",
  binancecoin: "BNB-USDT",
  ripple: "XRP-USDT",
  cardano: "ADA-USDT",
  "avalanche-2": "AVAX-USDT",
  tron: "TRX-USDT",
  "the-open-network": "TON-USDT",
  polkadot: "DOT-USDT",
  sui: "SUI-USDT",
  aptos: "APT-USDT",
  near: "NEAR-USDT",
  // L2
  arbitrum: "ARB-USDT",
  optimism: "OP-USDT",
  starknet: "STRK-USDT",
  mantle: "MNT-USDT",
  "conflux-token": "CFX-USDT",
  // PoW
  litecoin: "LTC-USDT",
  "bitcoin-cash": "BCH-USDT",
  "ethereum-classic": "ETC-USDT",
  // DeFi
  aave: "AAVE-USDT",
  uniswap: "UNI-USDT",
  "compound-governance-token": "COMP-USDT",
  "curve-dao-token": "CRV-USDT",
  "lido-dao": "LDO-USDT",
  "jupiter-exchange-solana": "JUP-USDT",
  ethena: "ENA-USDT",
  maker: "MKR-USDT",
  // DEX/Perp
  hyperliquid: "HYPE-USDT",
  "dydx-chain": "DYDX-USDT",
  "aster-2": null, // not on OKX
  // AI
  bittensor: "TAO-USDT",
  "fetch-ai": "FET-USDT",
  "worldcoin-wld": "WLD-USDT",
  "virtual-protocol": "VIRTUAL-USDT",
  "render-token": "RENDER-USDT",
  // DePIN
  filecoin: "FIL-USDT",
  livepeer: "LPT-USDT",
  helium: "HNT-USDT",
  // Meme
  dogecoin: "DOGE-USDT",
  pepe: "PEPE-USDT",
  dogwifcoin: "WIF-USDT",
  "official-trump": "TRUMP-USDT",
  "shiba-inu": "SHIB-USDT",
  bonk: "BONK-USDT",
  floki: "FLOKI-USDT",
  // Privacy
  monero: null, // delisted from most exchanges
  zcash: "ZEC-USDT",
  dash: "DASH-USDT",
  // RWA
  "ondo-finance": "ONDO-USDT",
  // BTC ecosystem
  ordinals: "ORDI-USDT",
  blockstack: "STX-USDT",
  // Infra
  chainlink: "LINK-USDT",
  "ethereum-name-service": "ENS-USDT",
  // Other
  "pi-network": null, // not listed on major exchanges
};

// In-memory cache for tickers (5s TTL)
let _tickerCache: { data: Map<string, OkxTicker>; ts: number } | null = null;

export async function fetchOkxSpotTickers(): Promise<Map<string, OkxTicker>> {
  const now = Date.now();
  if (_tickerCache && now - _tickerCache.ts < 5000) {
    return _tickerCache.data;
  }

  const url = "/api/okx/market/tickers?instType=SPOT";
  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`OKX API returned ${res.status}`);
  }
  const json = (await res.json()) as { code: string; data: OkxTicker[] };
  if (json.code !== "0") {
    throw new Error(`OKX API error code: ${json.code}`);
  }

  const map = new Map<string, OkxTicker>();
  for (const t of json.data) {
    map.set(t.instId, {
      instId: t.instId,
      last: t.last,
      open24h: t.open24h,
      high24h: t.high24h,
      low24h: t.low24h,
      volCcy24h: t.volCcy24h ?? "0",
    });
  }
  _tickerCache = { data: map, ts: now };
  return map;
}

// --- Klines (daily candles) for 3d/7d/30d calculation ---

let _klinesCache: { data: Map<string, number[]>; ts: number } | null = null;
const KLINES_CACHE_MS = 300000; // 5 minutes

async function fetchOneKlines(instId: string): Promise<{ instId: string; closes: number[] }> {
  const url = `/api/okx/market/candles?instId=${instId}&bar=1D&limit=31`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`${instId} ${res.status}`);
  const json = await res.json();
  if (json.code !== "0" || !Array.isArray(json.data)) {
    throw new Error(`${instId} code ${json.code}`);
  }
  return { instId, closes: json.data.map((c: string[]) => parseFloat(c[4])) };
}

async function fetchWithRetry(instId: string, retries = 2): Promise<{ instId: string; closes: number[] }> {
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      return await fetchOneKlines(instId);
    } catch (e) {
      if (attempt === retries) throw e;
      await new Promise((r) => setTimeout(r, 500 * (attempt + 1)));
    }
  }
  throw new Error("unreachable");
}

export async function fetchOkxKlines(instIds: string[]): Promise<Map<string, number[]>> {
  const now = Date.now();
  if (_klinesCache && now - _klinesCache.ts < KLINES_CACHE_MS) {
    return _klinesCache.data;
  }

  const result = new Map<string, number[]>();
  const unique = [...new Set(instIds)];
  const BATCH = 4;
  const BATCH_DELAY = 100;

  for (let i = 0; i < unique.length; i += BATCH) {
    const batch = unique.slice(i, i + BATCH);
    const responses = await Promise.allSettled(
      batch.map((instId) => fetchWithRetry(instId)),
    );

    for (const r of responses) {
      if (r.status === "fulfilled") {
        result.set(r.value.instId, r.value.closes);
      }
    }

    if (i + BATCH < unique.length) {
      await new Promise((r) => setTimeout(r, BATCH_DELAY));
    }
  }

  _klinesCache = { data: result, ts: now };
  return result;
}

export function buildSnapshotFromOkx(
  sectorsConfig: SectorConfig[],
  okxData: Map<string, OkxTicker>,
  fallbackSnapshot: DailySnapshot,
  klinesData?: Map<string, number[]>,
): DailySnapshot {
  // Build a lookup from the fallback snapshot for fast access
  const fallbackCoinMap = new Map<string, CoinSnapshot>();
  for (const sector of fallbackSnapshot.sectors) {
    for (const coin of sector.coins) {
      fallbackCoinMap.set(coin.id, coin);
    }
  }

  const sectorSnapshots: SectorSnapshot[] = [];

  for (const sectorCfg of sectorsConfig) {
    const coinSnapshots: CoinSnapshot[] = [];

    for (const coinId of sectorCfg.coins) {
      const fallback = fallbackCoinMap.get(coinId);
      const okxSymbol = CG_TO_OKX[coinId];

      if (okxSymbol) {
        const ticker = okxData.get(okxSymbol);
        if (ticker) {
          const last = parseFloat(ticker.last);
          const open24h = parseFloat(ticker.open24h);
          const high24h = parseFloat(ticker.high24h);
          const low24h = parseFloat(ticker.low24h);
          const volume24h = parseFloat(ticker.volCcy24h) || undefined;

          const returnPct = open24h > 0 ? (last - open24h) / open24h : 0;
          const amplitude = low24h > 0 ? high24h / low24h - 1 : 0;
          const volatility = amplitude / 2;

          // Klines-based 3d/7d/30d (prefer over fallback)
          const closes = klinesData?.get(okxSymbol);
          const returnPct3d = closes && closes.length > 3 && closes[3] > 0
            ? (last - closes[3]) / closes[3]
            : fallback?.returnPct3d;
          const returnPct7d = closes && closes.length > 7 && closes[7] > 0
            ? (last - closes[7]) / closes[7]
            : fallback?.returnPct7d;
          const returnPct30d = closes && closes.length > 29 && closes[29] > 0
            ? (last - closes[29]) / closes[29]
            : fallback?.returnPct30d;

          coinSnapshots.push({
            id: coinId,
            symbol: fallback?.symbol ?? coinId.toUpperCase(),
            name: fallback?.name ?? coinId,
            marketCap: fallback?.marketCap ?? 0,
            open: open24h,
            high: high24h,
            low: low24h,
            close: last,
            returnPct,
            amplitude,
            volatility,
            returnPct3d,
            returnPct7d,
            returnPct30d,
            volume24h,
            isMainstream: fallback?.isMainstream ?? false,
          });
          continue;
        }
      }

      // Fallback: use snapshot data entirely
      if (fallback) {
        coinSnapshots.push(fallback);
      } else {
        console.warn(`Coin ${coinId} not found in OKX or fallback snapshot`);
      }
    }

    const totalMarketCap = coinSnapshots.reduce((sum, c) => sum + c.marketCap, 0);
    const totalVolume24h = coinSnapshots.reduce((sum, c) => sum + (c.volume24h ?? 0), 0);
    const weighted = calcWeightedSectorMetrics(coinSnapshots);

    sectorSnapshots.push({
      id: sectorCfg.id,
      name: sectorCfg.name,
      totalMarketCap,
      totalVolume24h: totalVolume24h > 0 ? totalVolume24h : undefined,
      ...weighted,
      coins: coinSnapshots,
    });
  }

  return {
    date: fallbackSnapshot.date, // keep snapshot date for 7d/30d alignment
    generatedAt: new Date().toISOString(),
    source: "okx",
    sectors: sectorSnapshots,
  };
}

export function getOkxUsdtSpotIds(okxData: Map<string, OkxTicker>): string[] {
  const ids: string[] = [];
  for (const instId of okxData.keys()) {
    if (instId.endsWith("-USDT")) {
      ids.push(instId);
    }
  }
  ids.sort();
  return ids;
}

export function buildCustomSectorsFromOkx(
  customSectors: CustomSectorConfig[],
  okxData: Map<string, OkxTicker>,
  fallbackSnapshot: DailySnapshot,
  klinesData?: Map<string, number[]>,
): SectorSnapshot[] {
  // Build fallback lookup by uppercase symbol
  const fallbackBySymbol = new Map<string, CoinSnapshot>();
  for (const sector of fallbackSnapshot.sectors) {
    for (const coin of sector.coins) {
      fallbackBySymbol.set(coin.symbol.toUpperCase(), coin);
    }
  }

  const result: SectorSnapshot[] = [];

  for (const cs of customSectors) {
    const coinSnapshots: CoinSnapshot[] = [];

    for (const instId of cs.coins) {
      const ticker = okxData.get(instId);
      if (!ticker) {
        console.warn(`Custom sector coin ${instId} not found in OKX data`);
        continue;
      }

      const last = parseFloat(ticker.last);
      const open24h = parseFloat(ticker.open24h);
      const high24h = parseFloat(ticker.high24h);
      const low24h = parseFloat(ticker.low24h);
      const volume24h = parseFloat(ticker.volCcy24h) || undefined;

      const returnPct = open24h > 0 ? (last - open24h) / open24h : 0;
      const amplitude = low24h > 0 ? high24h / low24h - 1 : 0;
      const volatility = amplitude / 2;

      // Extract symbol from instId: "BTC-USDT" → "BTC"
      const symbol = instId.replace(/-USDT$/i, "");

      const fallback = fallbackBySymbol.get(symbol.toUpperCase());

      // Klines-based 3d/7d/30d
      const closes = klinesData?.get(instId);
      const returnPct3d = closes && closes.length > 3 && closes[3] > 0
        ? (last - closes[3]) / closes[3]
        : fallback?.returnPct3d;
      const returnPct7d = closes && closes.length > 7 && closes[7] > 0
        ? (last - closes[7]) / closes[7]
        : fallback?.returnPct7d;
      const returnPct30d = closes && closes.length > 29 && closes[29] > 0
        ? (last - closes[29]) / closes[29]
        : fallback?.returnPct30d;

      coinSnapshots.push({
        id: `custom-${instId}`,
        symbol,
        name: fallback?.name ?? symbol,
        marketCap: fallback?.marketCap ?? 1e9,
        open: open24h,
        high: high24h,
        low: low24h,
        close: last,
        returnPct,
        amplitude,
        volatility,
        returnPct3d,
        returnPct7d,
        returnPct30d,
        volume24h,
        isMainstream: true,
      });
    }

    if (coinSnapshots.length === 0) {
      // Sector with no valid coins — skip
      continue;
    }

    const totalMarketCap = coinSnapshots.reduce((sum, c) => sum + c.marketCap, 0);
    const totalVolume24h = coinSnapshots.reduce((sum, c) => sum + (c.volume24h ?? 0), 0);
    const weighted = calcWeightedSectorMetrics(coinSnapshots);

    result.push({
      id: cs.id,
      name: cs.name,
      totalMarketCap,
      totalVolume24h: totalVolume24h > 0 ? totalVolume24h : undefined,
      ...weighted,
      coins: coinSnapshots,
    });
  }

  return result;
}
