import { describe, expect, test } from "vitest";
import {
  buildMarketPulse,
  searchMarket,
  type SectorPulse,
} from "../lib/market-pulse";
import {
  buildAssetDailyReturns,
  buildSectorReturnSeries,
  type AssetHistoryMap,
} from "../lib/sector-history";
import {
  detectSectorSignal,
  SIGNAL_RULE_VERSION,
} from "../lib/signals";
import type {
  CoinSnapshot,
  DailySnapshot,
  SectorSnapshot,
} from "../lib/types";

function coin(
  id: string,
  symbol: string,
  returnPct: number | null,
  marketCap = 100,
): CoinSnapshot {
  return {
    id,
    symbol,
    name: `${symbol} name`,
    marketCap,
    open: 100,
    high: 110,
    low: 90,
    close: 100,
    returnPct,
    amplitude: 0.2,
    volatility: 0.01,
    isMainstream: true,
  };
}

function sector(
  id: string,
  name: string,
  coins: CoinSnapshot[],
  weightedReturnPct: number,
): SectorSnapshot {
  return {
    id,
    name,
    totalMarketCap: coins.reduce((sum, item) => sum + (item.marketCap ?? 0), 0),
    weightedReturnPct,
    weightedAmplitude: 0.2,
    weightedVolatility: 0.01,
    coverageRatio: 1,
    coverageByPeriod: { "24h": 1 },
    weightCoverageRatio: 1,
    coins,
  };
}

function snapshot(sectors: SectorSnapshot[]): DailySnapshot {
  return {
    date: "2026-07-03T12",
    generatedAt: "2026-07-03T12:00:00.000Z",
    source: "gate",
    sectors,
  };
}

function closesForReturns(
  start: string,
  dailyReturns: number[],
): Array<{ time: string; close: number }> {
  const startMs = Date.parse(`${start}T23:00:00.000Z`);
  let close = 100;
  return [
    { time: new Date(startMs).toISOString(), close },
    ...dailyReturns.map((value, index) => {
      close *= 1 + value;
      return {
        time: new Date(startMs + (index + 1) * 86_400_000).toISOString(),
        close,
      };
    }),
  ];
}

describe("timestamped sector history", () => {
  test("does not calculate a return across a missing UTC day", () => {
    const returns = buildAssetDailyReturns([
      { time: "2026-07-01T23:00:00.000Z", close: 100 },
      { time: "2026-07-03T23:00:00.000Z", close: 110 },
      { time: "2026-07-04T23:00:00.000Z", close: 121 },
    ]);

    expect(returns.has("2026-07-03")).toBe(false);
    expect(returns.get("2026-07-04")).toBeCloseTo(0.1);
  });

  test("attributes a midnight close to the UTC session that just ended", () => {
    const returns = buildAssetDailyReturns([
      { time: "2026-07-02T00:00:00.000Z", close: 100 },
      { time: "2026-07-03T00:00:00.000Z", close: 110 },
    ]);

    expect(returns.has("2026-07-03")).toBe(false);
    expect(returns.get("2026-07-02")).toBeCloseTo(0.1);
  });

  test("uses current market-cap weights and enforces 80% coverage", () => {
    const target = sector(
      "layer-one",
      "公链",
      [coin("a", "A", 0, 80), coin("b", "B", 0, 20)],
      0,
    );
    const fullHistory: AssetHistoryMap = new Map([
      ["a", closesForReturns("2026-07-01", [0.1])],
      ["b", closesForReturns("2026-07-01", [-0.1])],
    ]);
    expect(buildSectorReturnSeries(target, fullHistory)[0].value).toBeCloseTo(0.06);

    const lowCoverage: AssetHistoryMap = new Map([
      ["a", []],
      ["b", closesForReturns("2026-07-01", [-0.1])],
    ]);
    expect(buildSectorReturnSeries(target, lowCoverage)).toEqual([]);
  });
});

describe("market pulse", () => {
  test("calculates breadth, median, contribution and stable rank movement", () => {
    const sectors = [
      sector(
        "a-sector",
        "A 板块",
        [coin("a1", "A1", 0.1, 80), coin("a2", "A2", -0.1, 20)],
        0.06,
      ),
      sector("b-sector", "B 板块", [coin("b1", "B1", 0.03)], 0.03),
      sector("c-sector", "C 板块", [coin("c1", "C1", 0.02)], 0.02),
      sector("d-sector", "D 板块", [coin("d1", "D1", 0.01)], 0.01),
    ];
    const histories: AssetHistoryMap = new Map([
      ["a1", closesForReturns("2026-07-01", [0.01])],
      ["a2", closesForReturns("2026-07-01", [0.01])],
      ["b1", closesForReturns("2026-07-01", [0.02])],
      ["c1", closesForReturns("2026-07-01", [0.03])],
      ["d1", closesForReturns("2026-07-01", [0.04])],
    ]);

    const result = buildMarketPulse(snapshot(sectors), histories);
    const first = result.sectors.find((item) => item.sectorId === "a-sector")!;

    expect(first.breadthRatio).toBe(0.5);
    expect(first.medianReturn).toBe(0);
    expect(first.topContributors[0]).toMatchObject({
      assetId: "a1",
      contribution: 0.08,
    });
    expect(first.top3ConcentrationRatio).toBeCloseTo(1);
    expect(first.currentRank).toBe(1);
    expect(first.previousRank).toBe(4);
    expect(first.rankChange).toBe(3);
    expect(result.marketBreadthRatio).toBeCloseTo(4 / 5);

    const signal = detectSectorSignal(first);
    expect(signal).toMatchObject({
      type: "rotation_up",
      ruleVersion: SIGNAL_RULE_VERSION,
      sampleSize: 1,
    });
    expect(signal?.reason).toContain("从 #4 变为 #1");
  });

  test("does not emit a signal for insufficient data", () => {
    const pulse: SectorPulse = {
      sectorId: "defi",
      sectorName: "DeFi",
      currentReturn: 0.1,
      currentRank: 1,
      previousRank: 8,
      rankChange: 7,
      previousRankDate: "2026-07-01",
      breadthRatio: 1,
      breadthSampleSize: 4,
      coinCoverageRatio: 0.5,
      medianReturn: 0.1,
      topContributors: [],
      top3ConcentrationRatio: null,
      anomalyZScore: 3,
      historySampleSize: 30,
      currentCoverageRatio: 0.5,
      quality: "insufficient_data",
      asOf: "2026-07-03T12:00:00.000Z",
    };
    expect(detectSectorSignal(pulse)).toBeNull();
  });

  test("does not emit a signal when sector history misses the latest complete UTC day", () => {
    const sectors = [
      sector("a-sector", "A 板块", [coin("a1", "A1", 0.06)], 0.06),
      sector("b-sector", "B 板块", [coin("b1", "B1", 0.01)], 0.01),
      sector("c-sector", "C 板块", [coin("c1", "C1", 0.02)], 0.02),
      sector("d-sector", "D 板块", [coin("d1", "D1", 0.03)], 0.03),
    ];
    const histories: AssetHistoryMap = new Map([
      ["a1", closesForReturns("2026-07-01", [0.01])],
      ["b1", closesForReturns("2026-07-01", [0.02])],
      ["c1", closesForReturns("2026-07-01", [0.03])],
      ["d1", closesForReturns("2026-07-01", [0.04])],
    ]);
    const staleSnapshot = {
      ...snapshot(sectors),
      generatedAt: "2026-07-04T12:00:00.000Z",
    };
    const result = buildMarketPulse(staleSnapshot, histories);
    const first = result.sectors.find((item) => item.sectorId === "a-sector")!;

    expect(first.rankChange).toBe(3);
    expect(first.quality).toBe("insufficient_data");
    expect(detectSectorSignal(first)).toBeNull();
  });

  test("anomaly signal exposes its rule reason and sample count", () => {
    const pulse: SectorPulse = {
      sectorId: "ai",
      sectorName: "AI",
      currentReturn: 0.08,
      currentRank: 1,
      previousRank: 2,
      rankChange: 1,
      previousRankDate: "2026-07-01",
      breadthRatio: 0.8,
      breadthSampleSize: 5,
      coinCoverageRatio: 1,
      medianReturn: 0.04,
      topContributors: [],
      top3ConcentrationRatio: null,
      anomalyZScore: 2.4,
      historySampleSize: 24,
      currentCoverageRatio: 1,
      quality: "ok",
      asOf: "2026-07-03T12:00:00.000Z",
    };
    const signal = detectSectorSignal(pulse);
    expect(signal).toMatchObject({ type: "anomaly_up", sampleSize: 24 });
    expect(signal?.reason).toContain("z=2.40");
  });

  test("search finds symbols, names and sectors", () => {
    const board = snapshot([
      sector("ai", "人工智能", [coin("bittensor", "TAO", 0.01)], 0.01),
    ]);
    expect(searchMarket(board, "TAO")[0]).toMatchObject({
      kind: "asset",
      id: "bittensor",
    });
    expect(searchMarket(board, "TAO name")[0]).toMatchObject({
      kind: "asset",
      id: "bittensor",
    });
    expect(searchMarket(board, "人工")[0]).toMatchObject({
      kind: "sector",
      id: "ai",
    });
  });
});
