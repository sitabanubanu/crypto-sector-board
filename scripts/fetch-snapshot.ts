import { ProxyAgent, setGlobalDispatcher } from "undici";

const proxyUrl = process.env.HTTPS_PROXY || process.env.HTTP_PROXY || process.env.GLOBAL_AGENT_HTTP_PROXY;
if (proxyUrl) {
  setGlobalDispatcher(new ProxyAgent(proxyUrl));
  try {
    const parsedProxy = new URL(proxyUrl);
    const port = parsedProxy.port ? `:${parsedProxy.port}` : "";
    console.log(`Using proxy: ${parsedProxy.protocol}//${parsedProxy.hostname}${port}`);
  } catch {
    console.log("Using configured proxy");
  }
}

import * as fs from "fs";
import * as path from "path";
import { fetchCoinsMarkets } from "../lib/coingecko";
import { calcCoinMetricsFromMarket, calcWeightedSectorMetrics } from "../lib/metrics";
import type { CoinSnapshot, SectorSnapshot, DailySnapshot } from "../lib/types";
import { createDataQuality } from "../lib/market-data/contracts";
import { isTimestampStale } from "../lib/market-data/freshness";
import { parseDailySnapshot } from "../lib/market-data/snapshot-schema";
import {
  getActiveProviderInstrument,
  getAssetIdByProviderInstrument,
} from "../lib/market-data/registry";
import {
  getCanonicalAssetIds,
  getRuntimeSectorConfigs,
  sectorCatalog,
} from "../lib/market-data/sector-catalog";

async function main() {
  const projectRoot = path.resolve(__dirname, "..");
  const sectors = getRuntimeSectorConfigs();

  const timestamp = getTimestampUTC();
  console.log(`Fetching market data (24h snapshot as of now, labeled: ${timestamp})`);

  const snapshotsDir = path.join(projectRoot, "data", "snapshots");
  if (!fs.existsSync(snapshotsDir)) {
    fs.mkdirSync(snapshotsDir, { recursive: true });
  }

  const uniqueAssetIds = getCanonicalAssetIds();
  const coinGeckoIds = uniqueAssetIds.map((assetId) => {
    const instrumentId = getActiveProviderInstrument(assetId, "coingecko");
    if (!instrumentId) {
      throw new Error(`No active CoinGecko mapping for ${assetId}`);
    }
    return instrumentId;
  });
  console.log(`Total unique assets: ${uniqueAssetIds.length}`);

  const marketData = await fetchCoinsMarkets(coinGeckoIds);
  console.log(`Received data for ${marketData.length} coins`);

  const coinMap = new Map(
    marketData.flatMap((coin) => {
      const assetId = getAssetIdByProviderInstrument("coingecko", coin.id);
      return assetId ? [[assetId, coin] as const] : [];
    }),
  );

  const sectorSnapshots: SectorSnapshot[] = [];

  for (const sector of sectors) {
    const coinSnapshots: CoinSnapshot[] = [];

    for (const coinId of sector.coins) {
      const coin = coinMap.get(coinId);
      if (!coin) {
        console.warn(`  ⚠ ${coinId}: not found in CoinGecko response`);
        continue;
      }

      const metrics = calcCoinMetricsFromMarket(coin);
      const isMainstream =
        coin.market_cap != null &&
        coin.market_cap >= sectorCatalog.mainStreamThreshold;

      coinSnapshots.push({
        id: coinId,
        symbol: coin.symbol.toUpperCase(),
        name: coin.name,
        marketCap: coin.market_cap,
        ...metrics,
        isMainstream,
        source: "coingecko",
        fallbackUsed: false,
      });
    }

    const knownMarketCaps = coinSnapshots
      .map((coin) => coin.marketCap)
      .filter((value): value is number => value != null);
    const totalMarketCap =
      knownMarketCaps.length > 0
        ? knownMarketCaps.reduce((sum, value) => sum + value, 0)
        : null;
    const knownVolumes = coinSnapshots
      .map((coin) => coin.volume24h)
      .filter((value): value is number => value != null);
    const weighted = calcWeightedSectorMetrics(coinSnapshots);

    sectorSnapshots.push({
      id: sector.id,
      name: sector.name,
      totalMarketCap,
      totalVolume24h:
        knownVolumes.length > 0
          ? knownVolumes.reduce((sum, value) => sum + value, 0)
          : null,
      ...weighted,
      coins: coinSnapshots,
    });
  }

  const generatedAt = new Date().toISOString();
  const usableIds = new Set(
    marketData
      .filter(
        (coin) =>
          coin.current_price != null &&
          coin.market_cap != null &&
          coin.price_change_percentage_24h != null,
      )
      .flatMap((coin) => {
        const assetId = getAssetIdByProviderInstrument("coingecko", coin.id);
        return assetId ? [assetId] : [];
      }),
  );
  const missingAssets = uniqueAssetIds.filter(
    (assetId) => !usableIds.has(assetId),
  );
  const observedTimes = marketData
    .map((coin) => Date.parse(coin.last_updated))
    .filter(Number.isFinite);
  const asOf =
    observedTimes.length > 0
      ? new Date(Math.min(...observedTimes)).toISOString()
      : generatedAt;
  const staleAfterSeconds = 14_400;
  const snapshot: DailySnapshot = parseDailySnapshot({
    date: timestamp,
    generatedAt,
    source: "coingecko",
    dataQuality: createDataQuality({
      asOf,
      generatedAt,
      sources: ["coingecko"],
      fallbackAssets: [],
      missingAssets,
      coverageRatio:
        uniqueAssetIds.length > 0
          ? usableIds.size / uniqueAssetIds.length
          : 0,
      isStale: isTimestampStale(
        asOf,
        staleAfterSeconds,
        Date.parse(generatedAt),
      ),
      staleAfterSeconds,
      sourceAsOf: { coingecko: asOf },
      staleSources: isTimestampStale(
        asOf,
        staleAfterSeconds,
        Date.parse(generatedAt),
      )
        ? ["coingecko"]
        : [],
    }),
    sectors: sectorSnapshots,
  });

  const outPath = path.join(snapshotsDir, `${timestamp}.json`);
  fs.writeFileSync(outPath, JSON.stringify(snapshot, null, 2), "utf-8");
  console.log(`\n✅ Snapshot saved to: ${outPath}`);

  printSummary(snapshot);
}

function getTimestampUTC(): string {
  const d = new Date();
  return d.toISOString().split("T")[0] + "T" + d.toISOString().split("T")[1].slice(0, 2);
}

function printSummary(snapshot: DailySnapshot) {
  console.log(`\n========== 板块强弱排名 (${snapshot.date}) ==========`);
  const sorted = [...snapshot.sectors].sort(
    (a, b) =>
      (b.weightedReturnPct ?? Number.NEGATIVE_INFINITY) -
      (a.weightedReturnPct ?? Number.NEGATIVE_INFINITY),
  );
  for (const s of sorted) {
    const arrow = s.weightedReturnPct == null ? "·" : s.weightedReturnPct >= 0 ? "▲" : "▼";
    const coins = s.coins.length;
    console.log(
      `  ${arrow} ${s.name.padEnd(12)} return: ${formatMetric(s.weightedReturnPct)}  amp: ${formatMetric(s.weightedAmplitude)}  coins: ${coins}`
    );
  }

  console.log(`\n--- 单币 Top 10 涨幅 ---`);
  const allCoins = snapshot.sectors.flatMap((s) => s.coins);
  const topCoins = [...allCoins]
    .filter((coin) => coin.returnPct != null)
    .sort((a, b) => b.returnPct! - a.returnPct!)
    .slice(0, 10);
  for (const c of topCoins) {
    const marketCap = c.marketCap == null ? "N/A" : `$${(c.marketCap / 1e9).toFixed(2)}B`;
    console.log(`  ${c.symbol.padEnd(8)} ${formatMetric(c.returnPct)}  mcap: ${marketCap}`);
  }
}

function formatMetric(value: number | null | undefined): string {
  return value == null
    ? "    N/A"
    : `${(value * 100).toFixed(2).padStart(7)}%`;
}

main().catch((err) => {
  console.error("Fatal error:", err);
  process.exit(1);
});
