import { PGlite } from "@electric-sql/pglite";
import { and, count, eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/pglite";
import { migrate } from "drizzle-orm/pglite/migrator";
import { promises as fs } from "node:fs";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { seedReferenceData } from "../lib/db/seed";
import {
  assets,
  ingestionRuns,
  marketCandles,
  marketQuotesLatest,
  providerInstruments,
  sectorMemberships,
  sectors,
} from "../lib/db/schema";
import * as schema from "../lib/db/schema";

describe.sequential("P2 PostgreSQL migration", () => {
  const client = new PGlite();
  const database = drizzle(client, { schema });

  beforeAll(async () => {
    await migrate(database, { migrationsFolder: "drizzle" });
  }, 30_000);

  afterAll(async () => {
    await client.close();
  });

  it("applies migrations and seeds all reference data idempotently", async () => {
    const first = await seedReferenceData(database);
    const second = await seedReferenceData(database);

    expect(first).toEqual(second);
    expect(first.assets).toBe(56);
    expect(first.providerInstruments).toBe(168);
    expect(first.sectors).toBe(14);
    expect(first.sectorMemberships).toBe(56);

    const [assetCount] = await database
      .select({ value: count() })
      .from(assets);
    const [mappingCount] = await database
      .select({ value: count() })
      .from(providerInstruments);
    const [sectorCount] = await database
      .select({ value: count() })
      .from(sectors);
    const [membershipCount] = await database
      .select({ value: count() })
      .from(sectorMemberships);

    expect(assetCount.value).toBe(56);
    expect(mappingCount.value).toBe(168);
    expect(sectorCount.value).toBe(14);
    expect(membershipCount.value).toBe(56);
  }, 30_000);

  it("enforces ingestion dedupe keys", async () => {
    const row = {
      dedupeKey: "test:gate:1h:2026-07-30T00:00:00Z",
      task: "test",
      provider: "gate" as const,
      timeframe: "1h" as const,
      requestedCount: 1,
      acceptedCount: 1,
      rejectedCount: 0,
      coverageRatio: 1,
    };
    await database.insert(ingestionRuns).values(row);
    await expect(database.insert(ingestionRuns).values(row)).rejects.toThrow();
  });

  it("repairs legacy OKX quote-volume placement idempotently", async () => {
    await database.insert(marketQuotesLatest).values({
      assetId: "bitcoin",
      provider: "okx",
      instrumentId: "BTC-USDT",
      last: 64_000,
      volumeBase24h: 80_032_000,
      volumeQuote24h: null,
      observedAt: new Date("2026-07-30T12:00:00.000Z"),
      fetchedAt: new Date("2026-07-30T12:01:00.000Z"),
    });
    const repairSql = await fs.readFile(
      "drizzle/0002_p3_quote_volume_semantics.sql",
      "utf8",
    );
    await client.exec(repairSql);
    await client.exec(repairSql);

    const [quote] = await database
      .select()
      .from(marketQuotesLatest)
      .where(
        and(
          eq(marketQuotesLatest.assetId, "bitcoin"),
          eq(marketQuotesLatest.provider, "okx"),
        ),
      );
    expect(quote.volumeBase24h).toBeNull();
    expect(quote.volumeQuote24h).toBe(80_032_000);
  });

  it("enforces candle uniqueness, foreign keys and OHLC bounds", async () => {
    const validCandle = {
      assetId: "bitcoin",
      provider: "gate" as const,
      timeframe: "1h" as const,
      openTime: new Date("2026-07-30T00:00:00.000Z"),
      closeTime: new Date("2026-07-30T01:00:00.000Z"),
      open: 100,
      high: 110,
      low: 90,
      close: 105,
      volumeBase: 10,
      volumeQuote: 1_000,
    };

    await database.insert(marketCandles).values(validCandle);
    await expect(
      database.insert(marketCandles).values(validCandle),
    ).rejects.toThrow();

    await expect(
      database.insert(marketCandles).values({
        ...validCandle,
        openTime: new Date("2026-07-30T01:00:00.000Z"),
        closeTime: new Date("2026-07-30T02:00:00.000Z"),
        high: 80,
      }),
    ).rejects.toThrow();

    await expect(
      database.insert(marketCandles).values({
        ...validCandle,
        assetId: "unknown-asset",
        openTime: new Date("2026-07-30T02:00:00.000Z"),
        closeTime: new Date("2026-07-30T03:00:00.000Z"),
      }),
    ).rejects.toThrow();
  });
});
