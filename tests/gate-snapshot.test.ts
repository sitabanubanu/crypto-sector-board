import { describe, expect, test, vi } from "vitest";
import { buildSnapshotFromGate, CG_TO_GATE } from "../lib/gate";
import {
  parseGateTickersPayload,
} from "../lib/market-data/provider-normalizers";
import type { DailySnapshot } from "../lib/types";
import gateTickers from "./fixtures/gate/tickers.json";

const fallback: DailySnapshot = {
  date: "2026-05-21T12",
  generatedAt: "2026-05-21T12:05:00.000Z",
  source: "coingecko",
  sectors: [
    {
      id: "test",
      name: "Test",
      totalMarketCap: 106,
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
          high: 65000,
          low: 63000,
          close: 64000,
          returnPct: 0.05,
          amplitude: 65000 / 63000 - 1,
          volatility: null,
          returnPct3d: null,
          returnPct7d: 0.77,
          returnPct30d: 3,
          volume24h: null,
          isMainstream: true,
        },
        {
          id: "monero",
          symbol: "XMR",
          name: "Monero",
          marketCap: 6,
          open: null,
          high: 350,
          low: 330,
          close: 340,
          returnPct: -0.01,
          amplitude: 350 / 330 - 1,
          volatility: null,
          returnPct3d: null,
          returnPct7d: null,
          returnPct30d: null,
          volume24h: null,
          isMainstream: true,
        },
      ],
    },
  ],
};

describe("Gate snapshot builder", () => {
  test("zero-percent ticker remains zero and never fabricates an open", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-07-30T01:02:03.000Z"));
    const parsed = parseGateTickersPayload(
      gateTickers,
      "2026-07-30T01:02:03.000Z",
    );
    const tickers = new Map(parsed.data.map((ticker) => [ticker.currency_pair, ticker]));

    const snapshot = buildSnapshotFromGate(
      [{ id: "test", name: "Test", coins: ["bitcoin"] }],
      tickers,
      fallback,
    );
    const bitcoin = snapshot.sectors[0].coins[0];

    expect(bitcoin.returnPct).toBe(0);
    expect(bitcoin.open).toBeNull();
    expect(bitcoin.symbol).toBe("BTC");
    expect(bitcoin.fallbackUsed).toBe(true);
    expect(bitcoin.fallbackFields).toEqual(["marketCap", "isMainstream"]);
    expect(bitcoin.returnPct7d).toBeNull();
    expect(bitcoin.returnPct30d).toBeNull();
    expect(snapshot.sectors[0].weightedReturnPct).toBe(0);
    expect(snapshot.date).toBe("2026-07-30T01");
    expect(snapshot.dataQuality?.fallbackAssets).toEqual(["bitcoin"]);
    expect(snapshot.dataQuality?.staleSources).toEqual(["snapshot"]);
    expect(snapshot.dataQuality?.isStale).toBe(true);
    expect(snapshot.dataQuality?.sourceAsOf).toEqual({
      gate: "2026-07-30T01:02:03.000Z",
      snapshot: "2026-05-21T12:05:00.000Z",
    });
    vi.useRealTimers();
  });

  test("fallback assets are explicit and use named period reference prices", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-07-30T01:02:03.000Z"));
    const snapshot = buildSnapshotFromGate(
      [{ id: "privacy", name: "Privacy", coins: ["monero"] }],
      new Map(),
      fallback,
      undefined,
      new Map([
        [
          "monero",
          {
            asOf: "2026-07-30T00:00:00.000Z",
            current: 340,
            price3d: 320,
            price7d: 300,
            price30d: 280,
          },
        ],
      ]),
    );
    const monero = snapshot.sectors[0].coins[0];

    expect(monero.fallbackUsed).toBe(true);
    expect(monero.returnPct).toBeNull();
    expect(monero.returnPct3d).toBeCloseTo(340 / 320 - 1);
    expect(snapshot.dataQuality?.fallbackAssets).toEqual(["monero"]);
    expect(snapshot.dataQuality?.sources).toEqual([
      "gate",
      "snapshot",
      "coingecko",
    ]);
    expect(snapshot.dataQuality?.coverageRatio).toBe(0);
    vi.useRealTimers();
  });

  test("a stale snapshot is metadata-only when no live fallback is available", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-07-30T01:02:03.000Z"));
    const snapshot = buildSnapshotFromGate(
      [{ id: "privacy", name: "Privacy", coins: ["monero"] }],
      new Map(),
      fallback,
    );
    const monero = snapshot.sectors[0].coins[0];

    expect(monero.close).toBeNull();
    expect(monero.returnPct).toBeNull();
    expect(monero.returnPct7d).toBeNull();
    expect(snapshot.sectors[0].weightedReturnPct).toBeNull();
    expect(snapshot.dataQuality?.coverageRatio).toBe(0);
    vi.useRealTimers();
  });

  test("verified provider renames are explicit while MKR/SKY remains gated for P2", () => {
    expect(CG_TO_GATE["the-open-network"]).toBe("GRAM_USDT");
    expect(CG_TO_GATE["aster-2"]).toBe("ASTER_USDT");
    expect(CG_TO_GATE["pi-network"]).toBe("PI_USDT");
    expect(CG_TO_GATE.maker).toBeNull();
  });
});
