import type { SectorConfig, CoinSnapshot, SectorSnapshot, DailySnapshot, CustomSectorConfig } from "./types";
import { calcWeightedSectorMetrics } from "./metrics";

// Gate.io ticker from /api/v4/spot/tickers
interface GateTicker {
  currency_pair: string;
  last: string;
  high_24h: string;
  low_24h: string;
  base_volume: string;
  quote_volume: string;
  change_percentage: string;
}

// CoinGecko coin ID → Gate.io currency pair (USDT)
export const CG_TO_GATE: Record<string, string | null> = {
  bitcoin: "BTC_USDT",
  // Layer 1
  ethereum: "ETH_USDT",
  solana: "SOL_USDT",
  binancecoin: "BNB_USDT",
  ripple: "XRP_USDT",
  cardano: "ADA_USDT",
  "avalanche-2": "AVAX_USDT",
  tron: "TRX_USDT",
  "the-open-network": "TON_USDT",
  polkadot: "DOT_USDT",
  sui: "SUI_USDT",
  aptos: "APT_USDT",
  near: "NEAR_USDT",
  // L2
  arbitrum: "ARB_USDT",
  optimism: "OP_USDT",
  starknet: "STRK_USDT",
  mantle: "MNT_USDT",
  "conflux-token": "CFX_USDT",
  // PoW
  litecoin: "LTC_USDT",
  "bitcoin-cash": "BCH_USDT",
  "ethereum-classic": "ETC_USDT",
  // DeFi
  aave: "AAVE_USDT",
  uniswap: "UNI_USDT",
  "compound-governance-token": "COMP_USDT",
  "curve-dao-token": "CRV_USDT",
  "lido-dao": "LDO_USDT",
  "jupiter-exchange-solana": "JUP_USDT",
  ethena: "ENA_USDT",
  maker: "MKR_USDT",
  // DEX/Perp
  hyperliquid: "HYPE_USDT",
  "dydx-chain": "DYDX_USDT",
  "aster-2": null,
  // AI
  bittensor: "TAO_USDT",
  "fetch-ai": "FET_USDT",
  "worldcoin-wld": "WLD_USDT",
  "virtual-protocol": "VIRTUAL_USDT",
  "render-token": "RENDER_USDT",
  // DePIN
  filecoin: "FIL_USDT",
  livepeer: "LPT_USDT",
  helium: "HNT_USDT",
  // Meme
  dogecoin: "DOGE_USDT",
  pepe: "PEPE_USDT",
  dogwifcoin: "WIF_USDT",
  "official-trump": "TRUMP_USDT",
  "shiba-inu": "SHIB_USDT",
  bonk: "BONK_USDT",
  floki: "FLOKI_USDT",
  // Privacy
  monero: null,
  zcash: "ZEC_USDT",
  dash: "DASH_USDT",
  // RWA
  "ondo-finance": "ONDO_USDT",
  // BTC ecosystem
  ordinals: "ORDI_USDT",
  blockstack: "STX_USDT",
  // Infra
  chainlink: "LINK_USDT",
  "ethereum-name-service": "ENS_USDT",
  // Other
  "pi-network": null,
};

// In-memory cache
let _tickerCache: { data: Map<string, GateTicker>; ts: number } | null = null;
let _klinesCache: { data: Map<string, number[]>; ts: number } | null = null;
const TICKER_CACHE_MS = 5000;
const KLINES_CACHE_MS = 300000;

export async function fetchGateSpotTickers(): Promise<Map<string, GateTicker>> {
  const now = Date.now();
  if (_tickerCache && now - _tickerCache.ts < TICKER_CACHE_MS) {
    return _tickerCache.data;
  }

  const url = "/api/gate/spot/tickers";
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Gate.io tickers returned ${res.status}`);
  const json = (await res.json()) as GateTicker[];
  if (!Array.isArray(json)) throw new Error("Gate.io tickers unexpected format");

  const map = new Map<string, GateTicker>();
  for (const t of json) {
    if (t.currency_pair.endsWith("_USDT")) {
      map.set(t.currency_pair, t);
    }
  }
  _tickerCache = { data: map, ts: now };
  return map;
}

// --- Klines ---

async function fetchOneKlines(instId: string): Promise<{ instId: string; closes: number[] }> {
  const url = `/api/gate/spot/candlesticks?currency_pair=${instId}&interval=1d&limit=31`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`${instId} ${res.status}`);
  const json = await res.json();
  if (!Array.isArray(json)) throw new Error(`${instId} unexpected format`);
  // Gate.io candle: [ts, volume, close, high, low, open, quote_volume]
  // Return closes in descending time order (most recent first) — API returns ascending
  const closes = json.map((c: string[]) => parseFloat(c[2])).reverse();
  return { instId, closes };
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

export async function fetchGateKlines(instIds: string[]): Promise<Map<string, number[]>> {
  const now = Date.now();
  if (_klinesCache && now - _klinesCache.ts < KLINES_CACHE_MS) {
    return _klinesCache.data;
  }

  const result = new Map<string, number[]>();
  const unique = [...new Set(instIds)];
  const BATCH = 3; // conservative to avoid rate limits
  const BATCH_DELAY = 200;

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

// --- Build snapshot ---

export function buildSnapshotFromGate(
  sectorsConfig: SectorConfig[],
  gateData: Map<string, GateTicker>,
  fallbackSnapshot: DailySnapshot,
  klinesData?: Map<string, number[]>,
): DailySnapshot {
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
      const gateSymbol = CG_TO_GATE[coinId];

      if (gateSymbol) {
        const ticker = gateData.get(gateSymbol);
        if (ticker) {
          const last = parseFloat(ticker.last);
          const open24h = parseFloat(ticker.change_percentage)
            ? last / (1 + parseFloat(ticker.change_percentage) / 100)
            : parseFloat(ticker.high_24h) * 0.99;
          const high24h = parseFloat(ticker.high_24h);
          const low24h = parseFloat(ticker.low_24h);
          const volume24h = parseFloat(ticker.quote_volume) || undefined;

          const returnPct = open24h > 0 ? (last - open24h) / open24h : 0;
          const amplitude = low24h > 0 ? high24h / low24h - 1 : 0;
          const volatility = amplitude / 2;

          // Klines-based 3d/7d/30d
          const closes = klinesData?.get(gateSymbol);
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
        console.warn(`Coin ${coinId} not found in Gate.io or fallback snapshot`);
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
    date: fallbackSnapshot.date,
    generatedAt: new Date().toISOString(),
    source: "gate",
    sectors: sectorSnapshots,
  };
}

export function buildCustomSectorsFromGate(
  customSectors: CustomSectorConfig[],
  gateData: Map<string, GateTicker>,
  fallbackSnapshot: DailySnapshot,
  klinesData?: Map<string, number[]>,
): SectorSnapshot[] {
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
      const ticker = gateData.get(instId);
      if (!ticker) {
        console.warn(`Custom sector coin ${instId} not found in Gate.io data`);
        continue;
      }

      const last = parseFloat(ticker.last);
      const open24h = parseFloat(ticker.change_percentage)
        ? last / (1 + parseFloat(ticker.change_percentage) / 100)
        : parseFloat(ticker.high_24h) * 0.99;
      const high24h = parseFloat(ticker.high_24h);
      const low24h = parseFloat(ticker.low_24h);
      const volume24h = parseFloat(ticker.quote_volume) || undefined;

      const returnPct = open24h > 0 ? (last - open24h) / open24h : 0;
      const amplitude = low24h > 0 ? high24h / low24h - 1 : 0;
      const volatility = amplitude / 2;

      const symbol = instId.replace(/_USDT$/i, "");
      const fallback = fallbackBySymbol.get(symbol.toUpperCase());

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

    if (coinSnapshots.length === 0) continue;

    const totalMarketCap = coinSnapshots.reduce((sum, c) => sum + c.marketCap, 0);
    const totalVolume24hSector = coinSnapshots.reduce((sum, c) => sum + (c.volume24h ?? 0), 0);
    const weighted = calcWeightedSectorMetrics(coinSnapshots);

    result.push({
      id: cs.id,
      name: cs.name,
      totalMarketCap,
      totalVolume24h: totalVolume24hSector > 0 ? totalVolume24hSector : undefined,
      ...weighted,
      coins: coinSnapshots,
    });
  }

  return result;
}

export function getGateUsdtSpotIds(gateData: Map<string, GateTicker>): string[] {
  const ids: string[] = [];
  for (const instId of gateData.keys()) {
    if (instId.endsWith("_USDT")) {
      ids.push(instId);
    }
  }
  ids.sort();
  return ids;
}
