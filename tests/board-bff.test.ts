import { describe, expect, test } from "vitest";
import {
  buildDatabaseBoardSnapshot,
  type BoardAggregateInput,
  type BoardCandleRow,
} from "../lib/market-data/board-aggregate";
import { compareBoardSnapshots } from "../lib/market-data/board-comparison";
import {
  BoardQuerySchema,
  BoardResponseSchema,
  CandlesQuerySchema,
  HistoryQuerySchema,
} from "../lib/market-data/bff-contracts";
import { buildCustomSectorSnapshots } from "../lib/market-data/custom-sectors";

const NOW = new Date("2026-07-30T12:00:00.000Z");

function candle(
  assetId: string,
  provider: "gate" | "okx",
  hoursAgo: number,
  close: number,
): BoardCandleRow {
  return {
    assetId,
    provider,
    openTime: new Date(NOW.getTime() - hoursAgo * 60 * 60 * 1_000),
    close,
  };
}

function aggregateInput(): BoardAggregateInput {
  return {
    now: NOW,
    staleAfterSeconds: 2 * 60 * 60,
    mainStreamThreshold: 0,
    assets: [
      { assetId: "bitcoin", symbol: "BTC", name: "Bitcoin" },
      { assetId: "ethereum", symbol: "ETH", name: "Ethereum" },
    ],
    sectors: [
      { sectorId: "majors", name: "Majors", sortOrder: 0 },
    ],
    memberships: [
      { sectorId: "majors", assetId: "bitcoin", sortOrder: 0 },
      { sectorId: "majors", assetId: "ethereum", sortOrder: 1 },
    ],
    mappings: [
      {
        assetId: "bitcoin",
        provider: "gate",
        priority: 10,
        supportsCandles: true,
      },
      {
        assetId: "bitcoin",
        provider: "okx",
        priority: 20,
        supportsCandles: true,
      },
      {
        assetId: "bitcoin",
        provider: "coingecko",
        priority: 30,
        supportsCandles: false,
      },
      {
        assetId: "ethereum",
        provider: "gate",
        priority: 10,
        supportsCandles: true,
      },
      {
        assetId: "ethereum",
        provider: "coingecko",
        priority: 30,
        supportsCandles: false,
      },
    ],
    quotes: [
      {
        assetId: "bitcoin",
        provider: "gate",
        last: 100,
        open24h: 90,
        high24h: 105,
        low24h: 88,
        volumeQuote24h: 1_000,
        observedAt: new Date("2026-07-30T08:00:00.000Z"),
        fallbackUsed: false,
        quality: {},
      },
      {
        assetId: "bitcoin",
        provider: "okx",
        last: 110,
        open24h: 100,
        high24h: 115,
        low24h: 95,
        volumeQuote24h: 1_200,
        observedAt: new Date("2026-07-30T11:30:00.000Z"),
        fallbackUsed: false,
        quality: {},
      },
      {
        assetId: "ethereum",
        provider: "gate",
        last: 220,
        open24h: 200,
        high24h: 225,
        low24h: 195,
        volumeQuote24h: 900,
        observedAt: new Date("2026-07-30T11:40:00.000Z"),
        fallbackUsed: false,
        quality: {},
      },
    ],
    marketCaps: [
      {
        assetId: "bitcoin",
        provider: "coingecko",
        marketCapUsd: 1_000,
        observedAt: new Date("2026-07-30T11:35:00.000Z"),
      },
      {
        assetId: "ethereum",
        provider: "coingecko",
        marketCapUsd: 500,
        observedAt: new Date("2026-07-30T11:35:00.000Z"),
      },
    ],
    recentCandles: [
      candle("bitcoin", "okx", 1, 109),
      candle("bitcoin", "okx", 2, 107),
      candle("bitcoin", "okx", 3, 105),
      candle("ethereum", "gate", 1, 219),
      candle("ethereum", "gate", 2, 215),
      candle("ethereum", "gate", 3, 210),
    ],
    referenceCandles: {
      "3d": [
        candle("bitcoin", "okx", 72, 100),
        candle("ethereum", "gate", 72, 200),
      ],
      "7d": [
        candle("bitcoin", "okx", 168, 90),
        candle("ethereum", "gate", 168, 180),
      ],
      "30d": [
        candle("bitcoin", "okx", 720, 80),
        candle("ethereum", "gate", 720, 160),
      ],
    },
  };
}

describe("database board aggregation", () => {
  test("selects a fresh fallback quote and exposes real provenance", () => {
    const snapshot = buildDatabaseBoardSnapshot(aggregateInput());
    const bitcoin = snapshot.sectors[0].coins[0];

    expect(bitcoin.source).toBe("okx");
    expect(bitcoin.fallbackUsed).toBe(true);
    expect(bitcoin.observedAt).toBe("2026-07-30T11:30:00.000Z");
    expect(bitcoin.returnPct).toBeCloseTo(0.1);
    expect(bitcoin.returnPct3d).toBeCloseTo(0.1);
    expect(snapshot.dataQuality).toMatchObject({
      coverageRatio: 1,
      isStale: false,
      fallbackAssets: ["bitcoin"],
      missingAssets: [],
    });
    expect(snapshot.dataQuality?.sources).toEqual([
      "gate",
      "okx",
      "coingecko",
    ]);
    expect(snapshot.sectors[0].coverageByPeriod?.["30d"]).toBe(1);
  });

  test("missing quotes reduce coverage instead of becoming zero-valued data", () => {
    const input = aggregateInput();
    input.quotes = input.quotes.filter(
      (quote) => quote.assetId !== "ethereum",
    );
    const snapshot = buildDatabaseBoardSnapshot(input);
    const ethereum = snapshot.sectors[0].coins[1];

    expect(ethereum.close).toBeNull();
    expect(ethereum.returnPct).toBeNull();
    expect(snapshot.dataQuality?.coverageRatio).toBe(0.5);
    expect(snapshot.dataQuality?.missingAssets).toEqual(["ethereum"]);
    expect(snapshot.dataQuality?.isStale).toBe(true);
  });
});

describe("BFF contracts and dual-read comparison", () => {
  test("query contracts reject unknown fields and incomplete date ranges", () => {
    expect(BoardQuerySchema.safeParse({ period: "24h" }).success).toBe(true);
    expect(
      BoardQuerySchema.safeParse({ period: "24h", proxy: "gate" }).success,
    ).toBe(false);
    expect(
      CandlesQuerySchema.safeParse({
        assetId: "bitcoin",
        from: "2026-07-29T00:00:00.000Z",
      }).success,
    ).toBe(false);
    expect(
      CandlesQuerySchema.safeParse({
        assetId: "../../bitcoin",
      }).success,
    ).toBe(false);
    expect(
      HistoryQuerySchema.safeParse({ assetIds: "bitcoin", days: "31" })
        .success,
    ).toBe(true);
  });

  test("comparison reports overlap and relative differences", () => {
    const database = buildDatabaseBoardSnapshot(aggregateInput());
    const json = structuredClone(database);
    json.generatedAt = "2026-07-30T11:00:00.000Z";
    json.sectors[0].coins[0].close = 100;
    const comparison = compareBoardSnapshots(database, json, NOW);

    expect(comparison.commonAssets).toBe(2);
    expect(comparison.generatedAtDeltaSeconds).toBe(3_600);
    expect(comparison.price.sampleSize).toBe(2);
    expect(comparison.price.maxRelativeDifference).toBeCloseTo(0.1);
  });

  test("board response contract accepts the public DTO only", () => {
    const snapshot = buildDatabaseBoardSnapshot(aggregateInput());
    const parsed = BoardResponseSchema.parse({
      data: {
        snapshot,
        assets: [
          { assetId: "bitcoin", symbol: "BTC", name: "Bitcoin" },
          { assetId: "ethereum", symbol: "ETH", name: "Ethereum" },
        ],
        focusAssets: ["bitcoin"],
      },
      meta: {
        ...snapshot.dataQuality,
        backend: "database",
        dualRead: false,
      },
    });
    expect(parsed.meta.backend).toBe("database");
  });
});

describe("custom sectors", () => {
  test("build from canonical asset IDs without an exchange request", () => {
    const snapshot = buildDatabaseBoardSnapshot(aggregateInput());
    const custom = buildCustomSectorSnapshots(
      [
        {
          id: "custom-majors",
          name: "My majors",
          coins: ["bitcoin", "ethereum"],
        },
      ],
      snapshot,
    );

    expect(custom).toHaveLength(1);
    expect(custom[0].coins.map((coin) => coin.id)).toEqual([
      "bitcoin",
      "ethereum",
    ]);
    expect(custom[0].weightedReturnPct).not.toBeNull();
  });
});
