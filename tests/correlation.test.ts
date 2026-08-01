import { describe, expect, test } from "vitest";
import {
  buildCorrelationMatrix,
  MIN_CORRELATION_SAMPLE_SIZE,
} from "../lib/correlation";
import type { AssetHistoryMap } from "../lib/sector-history";
import type { CoinSnapshot, SectorSnapshot } from "../lib/types";

function coin(id: string): CoinSnapshot {
  return {
    id,
    symbol: id.toUpperCase(),
    name: id,
    marketCap: 100,
    open: 100,
    high: 101,
    low: 99,
    close: 100,
    returnPct: 0,
    amplitude: 0.02,
    volatility: 0.01,
    isMainstream: true,
  };
}

function sector(id: string): SectorSnapshot {
  return {
    id,
    name: id,
    totalMarketCap: 100,
    weightedReturnPct: 0,
    weightedAmplitude: 0.02,
    weightedVolatility: 0.01,
    coverageRatio: 1,
    coverageByPeriod: { "24h": 1 },
    coins: [coin(id)],
  };
}

function closes(
  id: string,
  returns: number[],
  omittedDays: number[] = [],
): [string, Array<{ time: string; close: number }>] {
  const start = Date.parse("2026-06-01T23:00:00.000Z");
  let close = 100;
  const points = [{ time: new Date(start).toISOString(), close }];
  returns.forEach((value, index) => {
    close *= 1 + value;
    const day = index + 1;
    if (!omittedDays.includes(day)) {
      points.push({
        time: new Date(start + day * 86_400_000).toISOString(),
        close,
      });
    }
  });
  return [id, points];
}

describe("timestamp-aligned sector correlation", () => {
  const returns = Array.from(
    { length: MIN_CORRELATION_SAMPLE_SIZE },
    (_, index) => (index % 5 - 2) / 100,
  );

  test("uses 30 shared non-overlapping dates and returns sample counts", () => {
    const histories: AssetHistoryMap = new Map([
      closes("alpha", returns),
      closes("beta", returns.map((value) => value * 2)),
    ]);
    const result = buildCorrelationMatrix(
      [sector("alpha"), sector("beta")],
      histories,
    )!;

    expect(result.matrix[0][1]).toBeCloseTo(1);
    expect(result.sampleCounts[0][1]).toBe(30);
    expect(result.minimumSampleSize).toBe(30);
    expect(result.weighting).toBe("current_market_cap");
  });

  test("does not turn missing samples or zero variance into false zero", () => {
    const missingHistory: AssetHistoryMap = new Map([
      closes("alpha", returns),
      closes("beta", returns, [10]),
    ]);
    const missing = buildCorrelationMatrix(
      [sector("alpha"), sector("beta")],
      missingHistory,
    )!;
    expect(missing.sampleCounts[0][1]).toBeLessThan(30);
    expect(missing.matrix[0][1]).toBeNull();

    const flatHistory: AssetHistoryMap = new Map([
      closes("alpha", returns),
      closes("beta", Array.from({ length: 30 }, () => 0)),
    ]);
    const flat = buildCorrelationMatrix(
      [sector("alpha"), sector("beta")],
      flatHistory,
    )!;
    expect(flat.sampleCounts[0][1]).toBe(30);
    expect(flat.matrix[0][1]).toBeNull();
  });
});
