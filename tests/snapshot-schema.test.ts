import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import { afterEach, describe, expect, test, vi } from "vitest";
import { parseDailySnapshot } from "../lib/market-data/snapshot-schema";
import { loadLatestSnapshot } from "../lib/snapshot";

const temporaryDirectories: string[] = [];

function validLegacySnapshot() {
  return {
    date: "2026-05-21T12",
    generatedAt: "2026-05-21T12:05:00.000Z",
    source: "coingecko",
    sectors: [
      {
        id: "btc",
        name: "BTC",
        totalMarketCap: 100,
        weightedReturnPct: 0,
        weightedAmplitude: 0.1,
        weightedVolatility: 0.02,
        coins: [
          {
            id: "bitcoin",
            symbol: "BTC",
            name: "Bitcoin",
            marketCap: 100,
            open: 100,
            high: 110,
            low: 90,
            close: 100,
            returnPct: 0,
            amplitude: 110 / 90 - 1,
            volatility: 0.02,
            isMainstream: true,
          },
        ],
      },
    ],
  };
}

afterEach(() => {
  for (const directory of temporaryDirectories.splice(0)) {
    fs.rmSync(directory, { recursive: true, force: true });
  }
  vi.restoreAllMocks();
});

describe("snapshot runtime schema", () => {
  test("accepts the legacy snapshot shape without inventing missing fields", () => {
    const parsed = parseDailySnapshot(validLegacySnapshot());
    const dailyLegacy = validLegacySnapshot();
    dailyLegacy.date = "2026-05-21";

    expect(parsed.dataQuality).toBeUndefined();
    expect(parsed.sectors[0].coins[0].returnPct).toBe(0);
    expect(parseDailySnapshot(dailyLegacy).date).toBe("2026-05-21");
  });

  test("rejects impossible OHLC and duplicate sector IDs", () => {
    const invalid = validLegacySnapshot();
    invalid.sectors[0].coins[0].high = 80;
    invalid.sectors.push(structuredClone(invalid.sectors[0]));

    expect(() => parseDailySnapshot(invalid)).toThrow();
  });

  test("loader skips a corrupt newest file and returns the latest valid snapshot", () => {
    const directory = fs.mkdtempSync(
      path.join(os.tmpdir(), "crypto-snapshot-schema-"),
    );
    temporaryDirectories.push(directory);
    fs.writeFileSync(
      path.join(directory, "2026-05-21T12.json"),
      JSON.stringify(validLegacySnapshot()),
      "utf8",
    );
    fs.writeFileSync(
      path.join(directory, "2026-05-21T13.json"),
      "{broken",
      "utf8",
    );
    const warning = vi.spyOn(console, "warn").mockImplementation(() => {});

    const loaded = loadLatestSnapshot(directory);

    expect(loaded?.date).toBe("2026-05-21T12");
    expect(warning).toHaveBeenCalledOnce();
  });
});
