import { describe, expect, test, vi } from "vitest";
import type { DataHealthReport } from "../lib/ingestion/data-health";
import { resolveMarketIngestionOptions } from "../lib/ingestion/options";
import { runMarketDataRecovery } from "../lib/ingestion/recovery";
import type { IngestionRunResult } from "../lib/ingestion/types";
import { createMarketDataCronHandler } from "../lib/server/market-data-cron";

function healthReport(
  status: DataHealthReport["status"],
): DataHealthReport {
  return {
    generatedAt: "2026-08-28T06:11:00.000Z",
    status,
    coverageAsOf: "2026-08-28T05:00:00.000Z",
    latestCandleAt: "2026-08-28T04:00:00.000Z",
    candleLagHours: 1,
    latestQuoteAt: "2026-08-28T06:10:00.000Z",
    quoteLagMinutes: 1,
    missingBucketCount: status === "healthy" ? 0 : 1,
    providers: [],
    candleCoverage: {
      last24h: {
        expected: 24,
        present: status === "healthy" ? 24 : 23,
        missing: status === "healthy" ? 0 : 1,
        coverageRatio: status === "healthy" ? 1 : 23 / 24,
      },
      last7d: {
        expected: 168,
        present: status === "healthy" ? 168 : 167,
        missing: status === "healthy" ? 0 : 1,
        coverageRatio: status === "healthy" ? 1 : 167 / 168,
      },
    },
    staleAssets: [],
    failedAssets: [],
    quotes: {
      expected: 1,
      present: 1,
      fresh: status === "critical" ? 0 : 1,
      missing: 0,
      coverageRatio: 1,
      freshnessRatio: status === "critical" ? 0 : 1,
      total: 1,
      fallback: 0,
      stale: status === "critical" ? 1 : 0,
    },
    stuckRuns: [],
    recentRuns: [],
  };
}

function ingestionRun(
  status: IngestionRunResult["status"] = "success",
): IngestionRunResult {
  return {
    task: "quotes",
    provider: "gate",
    timeframe: null,
    bucket: "2026-08-28T06:00:00.000Z",
    status,
    requestedCount: 1,
    acceptedCount: status === "success" ? 1 : 0,
    rejectedCount: status === "success" ? 0 : 1,
    coverageRatio: status === "success" ? 1 : 0,
    errors: status === "success" ? [] : [{ code: "test_failure" }],
  };
}

describe("market data recovery", () => {
  test("shares validated ingestion windows across CLI and Cron callers", () => {
    expect(resolveMarketIngestionOptions({})).toEqual({
      candles: {
        historyBackfillHours: undefined,
        initialBackfillHours: 24,
        repairLookbackHours: 24,
        maxBackfillHours: 168,
      },
    });
    expect(
      resolveMarketIngestionOptions({
        INGEST_INITIAL_BACKFILL_HOURS: "48",
        INGEST_REPAIR_LOOKBACK_HOURS: "36",
        INGEST_MAX_BACKFILL_HOURS: "240",
      }),
    ).toMatchObject({
      candles: {
        initialBackfillHours: 48,
        repairLookbackHours: 36,
        maxBackfillHours: 240,
      },
    });
    expect(() =>
      resolveMarketIngestionOptions({
        INGEST_MAX_BACKFILL_HOURS: "not-a-number",
      }),
    ).toThrow("INGEST_MAX_BACKFILL_HOURS must be a positive integer.");
  });

  test("does not ingest when data is already healthy", async () => {
    const ingest = vi.fn(async () => [ingestionRun()]);
    const result = await runMarketDataRecovery({
      checkHealth: async () => healthReport("healthy"),
      ingest,
    });

    expect(result).toMatchObject({ action: "none", healthy: true });
    expect(ingest).not.toHaveBeenCalled();
  });

  test("ingests immediately and passes only after health recovers", async () => {
    const reports = [healthReport("critical"), healthReport("healthy")];
    const result = await runMarketDataRecovery({
      checkHealth: async () => reports.shift()!,
      ingest: async () => [ingestionRun()],
    });

    expect(result).toMatchObject({
      action: "ingested",
      healthy: true,
      healthBefore: { status: "critical" },
      healthAfter: { status: "healthy" },
    });
  });

  test("keeps the repair failed when ingestion or the recheck is unhealthy", async () => {
    const failedRun = await runMarketDataRecovery({
      checkHealth: vi
        .fn()
        .mockResolvedValueOnce(healthReport("critical"))
        .mockResolvedValueOnce(healthReport("healthy")),
      ingest: async () => [ingestionRun("failed")],
    });
    const failedRecheck = await runMarketDataRecovery({
      checkHealth: vi
        .fn()
        .mockResolvedValueOnce(healthReport("critical"))
        .mockResolvedValueOnce(healthReport("degraded")),
      ingest: async () => [ingestionRun()],
    });

    expect(failedRun.healthy).toBe(false);
    expect(failedRecheck.healthy).toBe(false);
  });
});

describe("market data cron handler", () => {
  test("rejects missing or invalid authorization before touching data", async () => {
    const checkHealth = vi.fn(async () => healthReport("healthy"));
    const handler = createMarketDataCronHandler({
      getCronSecret: () => "test-secret",
      checkHealth,
      ingest: async () => [ingestionRun()],
    });

    const missing = await handler(
      new Request("https://example.test/api/cron/market-data"),
    );
    const invalid = await handler(
      new Request("https://example.test/api/cron/market-data", {
        headers: { Authorization: "Bearer wrong-secret" },
      }),
    );

    expect(missing.status).toBe(401);
    expect(invalid.status).toBe(401);
    expect(checkHealth).not.toHaveBeenCalled();
  });

  test("fails closed when CRON_SECRET is not configured", async () => {
    const checkHealth = vi.fn(async () => healthReport("healthy"));
    const handler = createMarketDataCronHandler({
      getCronSecret: () => undefined,
      checkHealth,
      ingest: async () => [ingestionRun()],
    });

    const response = await handler(
      new Request("https://example.test/api/cron/market-data", {
        headers: { Authorization: "Bearer any-value" },
      }),
    );

    expect(response.status).toBe(401);
    expect(checkHealth).not.toHaveBeenCalled();
  });

  test("runs an authorized repair and reports post-repair health", async () => {
    const ingest = vi.fn(async () => [ingestionRun()]);
    const checkHealth = vi
      .fn()
      .mockResolvedValueOnce(healthReport("critical"))
      .mockResolvedValueOnce(healthReport("healthy"));
    const handler = createMarketDataCronHandler({
      getCronSecret: () => "test-secret",
      checkHealth,
      ingest,
    });

    const response = await handler(
      new Request("https://example.test/api/cron/market-data", {
        headers: { Authorization: "Bearer test-secret" },
      }),
    );

    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({
      ok: true,
      action: "ingested",
      statusBefore: "critical",
      statusAfter: "healthy",
    });
    expect(ingest).toHaveBeenCalledOnce();
    expect(checkHealth).toHaveBeenCalledTimes(2);
  });

  test("returns a failure when recovery throws or remains unhealthy", async () => {
    const onError = vi.fn();
    const throwingHandler = createMarketDataCronHandler({
      getCronSecret: () => "test-secret",
      checkHealth: async () => healthReport("critical"),
      ingest: async () => {
        throw new Error("provider unavailable");
      },
      onError,
    });
    const unhealthyHandler = createMarketDataCronHandler({
      getCronSecret: () => "test-secret",
      checkHealth: vi
        .fn()
        .mockResolvedValueOnce(healthReport("critical"))
        .mockResolvedValueOnce(healthReport("degraded")),
      ingest: async () => [ingestionRun()],
    });
    const request = () =>
      new Request("https://example.test/api/cron/market-data", {
        headers: { Authorization: "Bearer test-secret" },
      });

    const thrown = await throwingHandler(request());
    const unhealthy = await unhealthyHandler(request());

    expect(thrown.status).toBe(503);
    expect(unhealthy.status).toBe(503);
    expect(onError).toHaveBeenCalledOnce();
  });
});
