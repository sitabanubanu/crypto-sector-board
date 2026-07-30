import { describe, expect, test } from "vitest";
import {
  calcAmplitude,
  calcCoinMetricsFromMarket,
  calcLogReturnVolatility,
  calcLookbackReturn,
  calcReturn,
  calcWeightedSectorMetrics,
} from "../lib/metrics";
import {
  parseCoinGeckoMarketsPayload,
} from "../lib/market-data/provider-normalizers";
import coinGeckoMarkets from "./fixtures/coingecko/markets.json";

describe("metric formulas", () => {
  test("return and amplitude use their documented formulas", () => {
    expect(calcReturn(110, 100)).toBeCloseTo(0.1);
    expect(calcAmplitude(120, 100)).toBeCloseTo(0.2);
    expect(calcReturn(0, null)).toBeNull();
    expect(calcReturn(0, 100)).toBeNull();
    expect(calcAmplitude(120, 0)).toBeNull();
    expect(calcAmplitude(90, 100)).toBeNull();
  });

  test("volatility is log-return standard deviation, not amplitude divided by two", () => {
    expect(calcLogReturnVolatility([121, 110, 100])).toBeCloseTo(0);
    const volatility = calcLogReturnVolatility([120, 100, 90]);
    expect(volatility).not.toBeNull();
    expect(volatility).not.toBeCloseTo((120 / 90 - 1) / 2);
    expect(calcLogReturnVolatility([120, null, 90])).toBeNull();
  });

  test("lookback uses the exact 3, 7 and 30 day indices", () => {
    const closes = Array.from({ length: 31 }, (_, index) => 100 - index);
    expect(calcLookbackReturn(100, closes, 3)).toBeCloseTo(100 / 97 - 1);
    expect(calcLookbackReturn(100, closes, 7)).toBeCloseTo(100 / 93 - 1);
    expect(calcLookbackReturn(100, closes, 30)).toBeCloseTo(100 / 70 - 1);
    expect(calcLookbackReturn(100, closes.slice(0, 30), 30)).toBeNull();
  });

  test("CoinGecko market metrics preserve true zero and missing periods", () => {
    const parsed = parseCoinGeckoMarketsPayload(
      coinGeckoMarkets,
      "2026-07-29T16:15:00.000Z",
    );
    const metrics = calcCoinMetricsFromMarket(parsed.data[0]);

    expect(metrics.returnPct).toBe(0);
    expect(metrics.open).toBeNull();
    expect(metrics.returnPct7d).toBeNull();
    expect(metrics.volatility).toBeNull();
  });
});

describe("sector coverage", () => {
  const base = {
    amplitude: 0.1,
    volatility: 0.02,
    returnPct3d: 0.03,
    returnPct7d: 0.07,
    returnPct30d: 0.2,
    isMainstream: true,
  };

  test("a covered real zero contributes normally", () => {
    const result = calcWeightedSectorMetrics([
      { ...base, marketCap: 90, returnPct: 0 },
      { ...base, marketCap: 10, returnPct: 0.1 },
    ]);
    expect(result.weightedReturnPct).toBeCloseTo(0.01);
    expect(result.coverageRatio).toBe(1);
  });

  test("coverage below 80% returns null instead of a false zero", () => {
    const result = calcWeightedSectorMetrics([
      { ...base, marketCap: 70, returnPct: 0.1 },
      { ...base, marketCap: 30, returnPct: null },
    ]);
    expect(result.coverageRatio).toBeCloseTo(0.7);
    expect(result.weightedReturnPct).toBeNull();
  });

  test("no eligible weight produces null metrics", () => {
    const result = calcWeightedSectorMetrics([
      { ...base, marketCap: null, returnPct: 0.1 },
    ]);
    expect(result.weightedReturnPct).toBeNull();
    expect(result.weightedAmplitude).toBeNull();
    expect(result.coverageRatio).toBe(0);
  });

  test("unknown market caps reduce weight coverage instead of reporting 100%", () => {
    const result = calcWeightedSectorMetrics([
      { ...base, marketCap: 100, returnPct: 0.1 },
      { ...base, marketCap: null, returnPct: 0.2 },
    ]);

    expect(result.weightCoverageRatio).toBe(0.5);
    expect(result.coverageRatio).toBe(0.5);
    expect(result.weightedReturnPct).toBeNull();
  });
});
