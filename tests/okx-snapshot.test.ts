import { describe, expect, test, vi } from "vitest";
import { buildSnapshotFromOkx } from "../lib/okx";
import type { OkxTickerPayload } from "../lib/market-data/provider-normalizers";
import type { DailySnapshot } from "../lib/types";

const fallback: DailySnapshot = {
  date: "2026-05-21T12",
  generatedAt: "2026-05-21T12:05:00.000Z",
  source: "coingecko",
  sectors: [
    {
      id: "test",
      name: "Test",
      totalMarketCap: 100,
      totalVolume24h: null,
      weightedReturnPct: 0.05,
      weightedAmplitude: 0.1,
      weightedVolatility: null,
      coins: [
        {
          id: "bitcoin",
          symbol: "BTC",
          name: "Bitcoin",
          marketCap: 100,
          open: null,
          high: 65_000,
          low: 63_000,
          close: 64_000,
          returnPct: 0.05,
          amplitude: 65_000 / 63_000 - 1,
          volatility: null,
          returnPct3d: 0.33,
          returnPct7d: 0.77,
          returnPct30d: 3,
          volume24h: null,
          isMainstream: true,
        },
      ],
    },
  ],
};

const ticker: OkxTickerPayload = {
  instId: "BTC-USDT",
  last: "64000",
  open24h: "64000",
  high24h: "65000",
  low24h: "63000",
  volCcy24h: "1000000",
  ts: "1785369600000",
};

describe("OKX snapshot builder", () => {
  test("missing live candles never reuse stale snapshot returns", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-07-30T01:02:03.000Z"));

    const snapshot = buildSnapshotFromOkx(
      [{ id: "test", name: "Test", coins: ["bitcoin"] }],
      new Map([["BTC-USDT", ticker]]),
      fallback,
    );
    const bitcoin = snapshot.sectors[0].coins[0];

    expect(bitcoin.returnPct).toBe(0);
    expect(bitcoin.returnPct3d).toBeNull();
    expect(bitcoin.returnPct7d).toBeNull();
    expect(bitcoin.returnPct30d).toBeNull();
    expect(bitcoin.fallbackUsed).toBe(true);
    expect(bitcoin.fallbackFields).toEqual(["marketCap", "isMainstream"]);
    expect(snapshot.dataQuality?.fallbackAssets).toEqual(["bitcoin"]);
    expect(snapshot.dataQuality?.staleSources).toEqual(["snapshot"]);
    expect(snapshot.dataQuality?.isStale).toBe(true);

    vi.useRealTimers();
  });
});
