import { PGlite } from "@electric-sql/pglite";
import { and, count, eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/pglite";
import { migrate } from "drizzle-orm/pglite/migrator";
import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, test } from "vitest";
import { seedReferenceData } from "../lib/db/seed";
import * as schema from "../lib/db/schema";
import {
  ingestionRuns,
  marketCandles,
  marketQuotesLatest,
  providerInstruments,
} from "../lib/db/schema";
import { importLegacySnapshots } from "../lib/ingestion/legacy-import";
import { fetchJsonWithRetry } from "../lib/ingestion/http";
import { getDataHealthReport } from "../lib/ingestion/data-health";
import { createGateQuoteAdapter } from "../lib/ingestion/provider-adapters";
import {
  runCandleIngestion,
  runMarketIngestion,
  runQuoteIngestion,
} from "../lib/ingestion/service";
import type {
  Candle,
  MarketQuote,
} from "../lib/market-data/contracts";
import type {
  IngestionProvider,
  ProviderCandleAdapter,
  ProviderQuoteAdapter,
} from "../lib/ingestion/types";

const client = new PGlite();
const database = drizzle(client, { schema });
const assetIds = ["bitcoin", "ethereum"];

function candleFor(
  assetId: string,
  instrumentId: string,
  openTime: Date,
  provider: "gate" | "okx",
): Candle {
  return {
    assetId,
    provider,
    instrumentId,
    timeframe: "1h",
    openTime: openTime.toISOString(),
    closeTime: new Date(openTime.getTime() + 3_600_000).toISOString(),
    fetchedAt: new Date().toISOString(),
    isComplete: true,
    open: 100,
    high: 110,
    low: 90,
    close: 105,
    volume: 1,
    quoteVolume: 100,
  };
}

function fakeAdapter(
  provider: "gate" | "okx",
  failAssetId?: string,
): ProviderCandleAdapter {
  return {
    provider,
    minimumDelayMs: 0,
    async fetchCandles(request) {
      if (request.assetId === failAssetId) {
        throw new Error("simulated provider failure");
      }
      const candles: Candle[] = [];
      for (
        let time = request.from.getTime();
        time < request.toExclusive.getTime();
        time += 3_600_000
      ) {
        candles.push(
          candleFor(
            request.assetId,
            request.instrumentId,
            new Date(time),
            provider,
          ),
        );
      }
      return { candles, issues: [] };
    },
  };
}

function fakeQuoteAdapter(
  provider: IngestionProvider,
  values: {
    observedAt: string;
    price: number;
    volume24h: number;
  },
): ProviderQuoteAdapter {
  return {
    provider,
    async fetchQuotes(instruments) {
      const quotes: MarketQuote[] = instruments.map((instrument) => ({
        assetId: instrument.assetId,
        provider,
        instrumentId: instrument.instrumentId,
        observedAt: values.observedAt,
        fetchedAt: new Date().toISOString(),
        price: values.price,
        open24h: values.price,
        high24h: values.price,
        low24h: values.price,
        volume24h: values.volume24h,
        marketCapUsd: null,
        change24h: 0,
        fallbackUsed: false,
      }));
      return { quotes, issues: [] };
    },
  };
}

describe.sequential("P3 ingestion service", () => {
  beforeAll(async () => {
    await migrate(database, { migrationsFolder: "drizzle" });
    await seedReferenceData(database);
  }, 30_000);

  afterAll(async () => {
    await client.close();
  });

  test("fills a ten-hour cursor gap and rerunning the same bucket is idempotent", async () => {
    const bucket = new Date("2026-07-30T12:00:00.000Z");
    for (const assetId of assetIds) {
      const instrumentId = assetId === "bitcoin" ? "BTC_USDT" : "ETH_USDT";
      await database.insert(marketCandles).values({
        assetId,
        provider: "okx",
        timeframe: "1h",
        openTime: new Date(bucket.getTime() - 11 * 3_600_000),
        closeTime: new Date(bucket.getTime() - 10 * 3_600_000),
        open: 100,
        high: 110,
        low: 90,
        close: 105,
        isComplete: true,
      });
      void instrumentId;
    }

    const adapter = fakeAdapter("okx");
    const first = await runCandleIngestion(database, adapter, {
      assetIds,
      now: new Date("2026-07-30T12:34:00.000Z"),
      initialBackfillHours: 24,
      repairLookbackHours: 24,
      maxBackfillHours: 48,
    });
    expect(first.status).toBe("success");
    expect(first.requestedCount).toBe(20);
    expect(first.acceptedCount).toBe(20);

    const second = await runCandleIngestion(database, adapter, {
      assetIds,
      now: new Date("2026-07-30T12:34:00.000Z"),
      initialBackfillHours: 24,
      repairLookbackHours: 24,
      maxBackfillHours: 48,
    });
    expect(second.status).toBe("skipped_duplicate");

    const [rows] = await database
      .select({ value: count() })
      .from(marketCandles)
      .where(
        and(
          eq(marketCandles.provider, "okx"),
          eq(marketCandles.timeframe, "1h"),
          eq(marketCandles.assetId, "bitcoin"),
        ),
      );
    expect(rows.value).toBe(11);
  });

  test("keeps successful assets when one provider request fails", async () => {
    const result = await runCandleIngestion(
      database,
      fakeAdapter("gate", "ethereum"),
      {
        assetIds,
        now: new Date("2026-07-30T13:34:00.000Z"),
        initialBackfillHours: 24,
        repairLookbackHours: 2,
        maxBackfillHours: 48,
      },
    );
    expect(result.status).toBe("partial");
    expect(result.acceptedCount).toBeGreaterThan(0);
    expect(result.rejectedCount).toBeGreaterThan(0);

    const [run] = await database
      .select()
      .from(ingestionRuns)
      .where(eq(ingestionRuns.dedupeKey, "market-candles:gate:1h:2026-07-30T13:00:00.000Z"));
    expect(run.status).toBe("partial");
  });

  test("allows a fully failed bucket to be claimed once for recovery", async () => {
    const options = {
      assetIds: ["bitcoin"],
      now: new Date("2026-07-30T14:34:00.000Z"),
      initialBackfillHours: 24,
      repairLookbackHours: 2,
      maxBackfillHours: 48,
    };
    const failed = await runCandleIngestion(
      database,
      fakeAdapter("gate", "bitcoin"),
      options,
    );
    expect(failed.status).toBe("failed");

    const recovered = await runCandleIngestion(
      database,
      fakeAdapter("gate"),
      options,
    );
    expect(recovered.status).toBe("success");
    expect(recovered.acceptedCount).toBeGreaterThan(0);

    const duplicate = await runCandleIngestion(
      database,
      fakeAdapter("gate"),
      options,
    );
    expect(duplicate.status).toBe("skipped_duplicate");
  });

  test("can explicitly extend history without deleting existing candles", async () => {
    const result = await runCandleIngestion(
      database,
      fakeAdapter("okx"),
      {
        assetIds,
        now: new Date("2026-07-30T15:34:00.000Z"),
        historyBackfillHours: 48,
        initialBackfillHours: 24,
        repairLookbackHours: 2,
        maxBackfillHours: 48,
      },
    );

    expect(result.status).toBe("success");
    expect(result.requestedCount).toBe(96);
    expect(result.acceptedCount).toBe(96);
    const [run] = await database
      .select({ task: ingestionRuns.task })
      .from(ingestionRuns)
      .where(
        eq(
          ingestionRuns.dedupeKey,
          "market-candles:okx:1h:history-48:2026-07-30T15:00:00.000Z",
        ),
      );
    expect(run.task).toBe("market-candles-history");

    const [rows] = await database
      .select({ value: count() })
      .from(marketCandles)
      .where(
        and(
          eq(marketCandles.provider, "okx"),
          eq(marketCandles.timeframe, "1h"),
          eq(marketCandles.assetId, "bitcoin"),
        ),
      );
    expect(rows.value).toBeGreaterThanOrEqual(48);
  });

  test("stores OKX quote volume in quote currency and never regresses latest data", async () => {
    const first = await runQuoteIngestion(
      database,
      fakeQuoteAdapter("okx", {
        observedAt: "2026-07-30T15:30:00.000Z",
        price: 200,
        volume24h: 10_000,
      }),
      {
        assetIds: ["bitcoin"],
        now: new Date("2026-07-30T15:34:00.000Z"),
      },
    );
    expect(first.status).toBe("success");

    const olderResponse = await runQuoteIngestion(
      database,
      fakeQuoteAdapter("okx", {
        observedAt: "2026-07-30T15:00:00.000Z",
        price: 100,
        volume24h: 5_000,
      }),
      {
        assetIds: ["bitcoin"],
        now: new Date("2026-07-30T16:34:00.000Z"),
      },
    );
    expect(olderResponse.status).toBe("success");

    const [latest] = await database
      .select()
      .from(marketQuotesLatest)
      .where(
        and(
          eq(marketQuotesLatest.provider, "okx"),
          eq(marketQuotesLatest.assetId, "bitcoin"),
        ),
      );
    expect(latest).toMatchObject({
      last: 200,
      volumeBase24h: null,
      volumeQuote24h: 10_000,
    });
    expect(latest.observedAt.toISOString()).toBe(
      "2026-07-30T15:30:00.000Z",
    );
  });

  test("reclaims an abandoned quote run after the workflow timeout", async () => {
    const bucket = new Date("2026-07-30T17:00:00.000Z");
    const dedupeKey = `market-quotes:coingecko:${bucket.toISOString()}`;
    await database.insert(ingestionRuns).values({
      dedupeKey,
      task: "market-quotes",
      provider: "coingecko",
      timeframe: null,
      cursorTo: bucket,
      status: "running",
      startedAt: new Date("2020-01-01T00:00:00.000Z"),
    });

    const recovered = await runQuoteIngestion(
      database,
      fakeQuoteAdapter("coingecko", {
        observedAt: "2026-07-30T17:10:00.000Z",
        price: 300,
        volume24h: 20_000,
      }),
      {
        assetIds: ["bitcoin"],
        now: new Date("2026-07-30T17:34:00.000Z"),
      },
    );
    expect(recovered.status).toBe("success");

    const [run] = await database
      .select()
      .from(ingestionRuns)
      .where(eq(ingestionRuns.dedupeKey, dedupeKey));
    expect(run.status).toBe("success");
    expect(run.finishedAt).not.toBeNull();
  });

  test(
    "finalizes a quote run when mapping lookup fails",
    async () => {
      const isolatedClient = new PGlite();
      const isolatedDatabase = drizzle(isolatedClient, { schema });
      try {
        await migrate(isolatedDatabase, { migrationsFolder: "drizzle" });
        await isolatedClient.exec("drop table provider_instruments cascade");
        const result = await runQuoteIngestion(
          isolatedDatabase,
          fakeQuoteAdapter("gate", {
            observedAt: "2026-07-30T18:10:00.000Z",
            price: 1,
            volume24h: 1,
          }),
          { now: new Date("2026-07-30T18:34:00.000Z") },
        );
        expect(result.status).toBe("failed");

        const [run] = await isolatedDatabase.select().from(ingestionRuns);
        expect(run.status).toBe("failed");
        expect(run.finishedAt).not.toBeNull();
      } finally {
        await isolatedClient.close();
      }
    },
    30_000,
  );

  test("imports legacy snapshots with explicit non-backtest quality and dedupes", async () => {
    const directory = await fs.mkdtemp(
      path.join(os.tmpdir(), "crypto-sector-board-legacy-"),
    );
    const snapshot = {
      date: "2026-07-01",
      generatedAt: "2026-07-01T12:00:00.000Z",
      source: "coingecko",
      sectors: [
        {
          id: "btc",
          name: "BTC",
          totalMarketCap: 1_000_000,
          weightedReturnPct: 0,
          weightedAmplitude: 0.1,
          weightedVolatility: 0.01,
          coins: [
            {
              id: "bitcoin",
              symbol: "BTC",
              name: "Bitcoin",
              marketCap: 1_000_000,
              open: 99,
              high: 110,
              low: 90,
              close: 105,
              returnPct: 0,
              amplitude: 0.1,
              volatility: 0.01,
              volume24h: 1_000,
              isMainstream: true,
            },
          ],
        },
        {
          id: "duplicate-membership",
          name: "Duplicate membership",
          totalMarketCap: 1_000_000,
          weightedReturnPct: 0,
          weightedAmplitude: 0.1,
          weightedVolatility: 0.01,
          coins: [
            {
              id: "bitcoin",
              symbol: "BTC",
              name: "Bitcoin",
              marketCap: 1_000_000,
              open: 99,
              high: 110,
              low: 90,
              close: 105,
              returnPct: 0,
              amplitude: 0.1,
              volatility: 0.01,
              volume24h: 1_000,
              isMainstream: true,
            },
          ],
        },
      ],
    };
    await fs.writeFile(
      path.join(directory, "2026-07-01.json"),
      JSON.stringify(snapshot),
      "utf8",
    );

    const first = await importLegacySnapshots(database, directory);
    const second = await importLegacySnapshots(database, directory);
    expect(first.importedFiles).toBe(1);
    expect(first.acceptedAssets).toBe(1);
    expect(first.rejectedAssets).toBe(0);
    expect(second.skippedFiles).toBe(1);

    const dedupeKey =
      "legacy-snapshot:2026-07-01:2026-07-01T12:00:00.000Z";
    await database
      .update(ingestionRuns)
      .set({ status: "failed", finishedAt: new Date() })
      .where(eq(ingestionRuns.dedupeKey, dedupeKey));
    const recovered = await importLegacySnapshots(database, directory);
    const duplicateAfterRecovery = await importLegacySnapshots(
      database,
      directory,
    );
    expect(recovered.importedFiles).toBe(1);
    expect(duplicateAfterRecovery.skippedFiles).toBe(1);

    const [legacy] = await database
      .select()
      .from(marketCandles)
      .where(
        and(
          eq(marketCandles.provider, "legacy_snapshot"),
          eq(marketCandles.assetId, "bitcoin"),
        ),
      );
    expect(legacy.quality).toMatchObject({
      quality: "legacy_snapshot",
      notForBacktest: true,
    });
    await fs.rm(directory, { recursive: true, force: true });
  });

  test("produces a safe health report", async () => {
    const report = await getDataHealthReport(
      database,
      new Date("2026-07-30T13:34:00.000Z"),
    );
    expect(report.generatedAt).toBe("2026-07-30T13:34:00.000Z");
    expect(report.providers.map((provider) => provider.provider)).toEqual([
      "coingecko",
      "gate",
      "okx",
    ]);
    expect(report.recentRuns.every((run) => !("errorSummary" in run))).toBe(
      true,
    );
  });

  test(
    "allows the latest closed candle bucket to settle before reporting a gap",
    async () => {
      const isolatedClient = new PGlite();
      const isolatedDatabase = drizzle(isolatedClient, { schema });
      const ingestionNow = new Date("2026-07-31T03:34:00.000Z");
      const healthNow = new Date("2026-07-31T04:34:00.000Z");
      try {
        await migrate(isolatedDatabase, { migrationsFolder: "drizzle" });
        await seedReferenceData(isolatedDatabase);

        const results = await runMarketIngestion(
          isolatedDatabase,
          {
            quotes: [
              fakeQuoteAdapter("coingecko", {
                observedAt: ingestionNow.toISOString(),
                price: 100,
                volume24h: 1,
              }),
              fakeQuoteAdapter("gate", {
                observedAt: ingestionNow.toISOString(),
                price: 100,
                volume24h: 1,
              }),
              fakeQuoteAdapter("okx", {
                observedAt: ingestionNow.toISOString(),
                price: 100,
                volume24h: 1,
              }),
            ],
            candles: [fakeAdapter("gate"), fakeAdapter("okx")],
          },
          {
            quotes: { now: ingestionNow },
            candles: {
              now: ingestionNow,
              initialBackfillHours: 24,
              repairLookbackHours: 24,
              maxBackfillHours: 48,
            },
          },
        );

        expect(results.every((result) => result.status === "success")).toBe(
          true,
        );

        const report = await getDataHealthReport(
          isolatedDatabase,
          healthNow,
        );
        expect(report.status).toBe("healthy");
        expect(report.candleCoverage.last24h.coverageRatio).toBe(1);
        expect(report.staleAssets).toEqual([]);
        expect(report.coverageAsOf).toBe("2026-07-31T03:00:00.000Z");
        expect(report.latestCandleAt).toBe("2026-07-31T02:00:00.000Z");
        expect(report.candleLagHours).toBe(1);
        expect(report.quoteLagMinutes).toBe(60);
      } finally {
        await isolatedClient.close();
      }
    },
    30_000,
  );

  test(
    "health excludes inactive/future rows and exposes stale quotes and stuck runs",
    async () => {
      const isolatedClient = new PGlite();
      const isolatedDatabase = drizzle(isolatedClient, { schema });
      const now = new Date("2026-07-30T20:34:00.000Z");
      try {
        await migrate(isolatedDatabase, { migrationsFolder: "drizzle" });
        await seedReferenceData(isolatedDatabase);
        await isolatedDatabase.insert(marketCandles).values([
        {
          assetId: "bitcoin",
          provider: "gate",
          timeframe: "1h",
          openTime: new Date("2026-07-30T19:00:00.000Z"),
          closeTime: new Date("2026-07-30T20:00:00.000Z"),
          open: 1,
          high: 1,
          low: 1,
          close: 1,
          isComplete: true,
        },
        {
          assetId: "ethereum",
          provider: "gate",
          timeframe: "1h",
          openTime: new Date("2026-07-30T21:00:00.000Z"),
          closeTime: new Date("2026-07-30T22:00:00.000Z"),
          open: 1,
          high: 1,
          low: 1,
          close: 1,
          isComplete: true,
        },
        ]);
        await isolatedDatabase
          .update(providerInstruments)
          .set({ status: "unavailable", instrumentId: null })
          .where(
            and(
              eq(providerInstruments.provider, "gate"),
              eq(providerInstruments.assetId, "bitcoin"),
            ),
          );
        await isolatedDatabase.insert(marketQuotesLatest).values({
          assetId: "bitcoin",
          provider: "gate",
          instrumentId: "BTC_USDT",
          last: 1,
          observedAt: now,
          fetchedAt: now,
        });
        await isolatedDatabase.insert(ingestionRuns).values({
          dedupeKey: "test-stuck-run",
          task: "market-quotes",
          provider: "okx",
          timeframe: null,
          cursorTo: new Date("2026-07-30T16:00:00.000Z"),
          status: "running",
          startedAt: new Date("2026-07-30T16:00:00.000Z"),
        });

        const report = await getDataHealthReport(isolatedDatabase, now);
        expect(report.status).toBe("critical");
        expect(report.candleCoverage.last24h.present).toBe(0);
        expect(report.quotes.present).toBe(0);
        expect(report.quotes.missing).toBe(report.quotes.expected);
        expect(report.stuckRuns).toEqual([
          expect.objectContaining({
            provider: "okx",
            task: "market-quotes",
          }),
        ]);
        expect(
          report.providers.find((provider) => provider.provider === "okx"),
        ).toMatchObject({
          successStale: true,
          stuckRuns: 1,
        });
      } finally {
        await isolatedClient.close();
      }
    },
    30_000,
  );

  test("reports a returned quote with zero price as an asset-level issue", async () => {
    const adapter = createGateQuoteAdapter({
      retries: 0,
      fetcher: async () =>
        new Response(
          JSON.stringify([
            {
              currency_pair: "BTC_USDT",
              last: "0",
              change_percentage: "0",
              base_volume: "0",
              quote_volume: "0",
              high_24h: "0",
              low_24h: "0",
            },
          ]),
          { status: 200 },
        ),
    });
    const result = await adapter.fetchQuotes([
      { assetId: "bitcoin", instrumentId: "BTC_USDT" },
    ]);
    expect(result.quotes).toEqual([]);
    expect(result.issues).toContainEqual(
      expect.objectContaining({
        assetId: "bitcoin",
        code: "unusable_provider_record",
      }),
    );
  });
});

describe("P3 provider HTTP policy", () => {
  test("retries 429 with Retry-After without leaking the query string", async () => {
    let attempts = 0;
    let canceled = false;
    const sleeps: number[] = [];
    const result = await fetchJsonWithRetry(
      "https://example.test/private?token=should-not-appear",
      {
        retries: 1,
        sleep: async (milliseconds) => {
          sleeps.push(milliseconds);
        },
        fetcher: async () => {
          attempts += 1;
          if (attempts === 1) {
            return new Response(
              new ReadableStream({
                cancel() {
                  canceled = true;
                },
              }),
              {
              status: 429,
              headers: { "retry-after": "0" },
              },
            );
          }
          return new Response(JSON.stringify({ ok: true }), {
            status: 200,
            headers: { "content-type": "application/json" },
          });
        },
      },
    );
    expect(result).toEqual({ ok: true });
    expect(attempts).toBe(2);
    expect(sleeps).toEqual([0]);
    expect(canceled).toBe(true);
  });

  test("cancels a declared oversized response before rejecting it", async () => {
    let canceled = false;
    await expect(
      fetchJsonWithRetry("https://example.test/oversized", {
        maxBytes: 10,
        retries: 0,
        fetcher: async () =>
          new Response(
            new ReadableStream({
              cancel() {
                canceled = true;
              },
            }),
            {
              status: 200,
              headers: { "content-length": "11" },
            },
          ),
      }),
    ).rejects.toThrow("exceeded 10 bytes");
    expect(canceled).toBe(true);
  });
});
