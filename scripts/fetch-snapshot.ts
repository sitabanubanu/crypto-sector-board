import { ProxyAgent, setGlobalDispatcher } from "undici";

const proxyUrl = process.env.HTTPS_PROXY || process.env.HTTP_PROXY || process.env.GLOBAL_AGENT_HTTP_PROXY;
if (proxyUrl) {
  setGlobalDispatcher(new ProxyAgent(proxyUrl));
  console.log(`Using proxy: ${proxyUrl}`);
}

import * as fs from "fs";
import * as path from "path";
import { fetchCoinsMarkets } from "../lib/coingecko";
import { calcCoinMetricsFromMarket, calcWeightedSectorMetrics } from "../lib/metrics";
import type { SectorsFile, CoinSnapshot, SectorSnapshot, DailySnapshot } from "../lib/types";

async function main() {
  const projectRoot = path.resolve(__dirname, "..");
  const sectorsPath = path.join(projectRoot, "data", "sectors.json");
  const sectorsFile: SectorsFile = JSON.parse(fs.readFileSync(sectorsPath, "utf-8"));

  const today = getTodayUTC();
  console.log(`Fetching market data (24h snapshot as of now, labeled: ${today})`);

  const snapshotsDir = path.join(projectRoot, "data", "snapshots");
  if (!fs.existsSync(snapshotsDir)) {
    fs.mkdirSync(snapshotsDir, { recursive: true });
  }

  const allCoinIds = sectorsFile.sectors.flatMap((s) => s.coins);
  const uniqueIds = [...new Set(allCoinIds)];
  console.log(`Total unique coins: ${uniqueIds.length}`);

  const marketData = await fetchCoinsMarkets(uniqueIds);
  console.log(`Received data for ${marketData.length} coins`);

  const coinMap = new Map(marketData.map((c) => [c.id, c]));

  const sectorSnapshots: SectorSnapshot[] = [];

  for (const sector of sectorsFile.sectors) {
    const coinSnapshots: CoinSnapshot[] = [];

    for (const coinId of sector.coins) {
      const coin = coinMap.get(coinId);
      if (!coin) {
        console.warn(`  ⚠ ${coinId}: not found in CoinGecko response`);
        continue;
      }

      const metrics = calcCoinMetricsFromMarket(coin);
      const isMainstream = coin.market_cap >= sectorsFile.mainStreamThreshold;

      coinSnapshots.push({
        id: coin.id,
        symbol: coin.symbol.toUpperCase(),
        name: coin.name,
        marketCap: coin.market_cap,
        ...metrics,
        isMainstream,
      });
    }

    const totalMarketCap = coinSnapshots.reduce((sum, c) => sum + c.marketCap, 0);
    const weighted = calcWeightedSectorMetrics(coinSnapshots);

    sectorSnapshots.push({
      id: sector.id,
      name: sector.name,
      totalMarketCap,
      ...weighted,
      coins: coinSnapshots,
    });
  }

  const snapshot: DailySnapshot = {
    date: today,
    generatedAt: new Date().toISOString(),
    source: "coingecko",
    sectors: sectorSnapshots,
  };

  const outPath = path.join(snapshotsDir, `${today}.json`);
  fs.writeFileSync(outPath, JSON.stringify(snapshot, null, 2), "utf-8");
  console.log(`\n✅ Snapshot saved to: ${outPath}`);

  printSummary(snapshot);
}

function getTodayUTC(): string {
  return new Date().toISOString().split("T")[0];
}

function printSummary(snapshot: DailySnapshot) {
  console.log(`\n========== 板块强弱排名 (${snapshot.date}) ==========`);
  const sorted = [...snapshot.sectors].sort(
    (a, b) => b.weightedReturnPct - a.weightedReturnPct
  );
  for (const s of sorted) {
    const arrow = s.weightedReturnPct >= 0 ? "▲" : "▼";
    const coins = s.coins.length;
    console.log(
      `  ${arrow} ${s.name.padEnd(12)} return: ${(s.weightedReturnPct * 100).toFixed(2).padStart(7)}%  amp: ${(s.weightedAmplitude * 100).toFixed(2).padStart(6)}%  coins: ${coins}`
    );
  }

  console.log(`\n--- 单币 Top 10 涨幅 ---`);
  const allCoins = snapshot.sectors.flatMap((s) => s.coins);
  const topCoins = [...allCoins].sort((a, b) => b.returnPct - a.returnPct).slice(0, 10);
  for (const c of topCoins) {
    console.log(`  ${c.symbol.padEnd(8)} ${(c.returnPct * 100).toFixed(2).padStart(7)}%  mcap: $${(c.marketCap / 1e9).toFixed(2)}B`);
  }
}

main().catch((err) => {
  console.error("Fatal error:", err);
  process.exit(1);
});
