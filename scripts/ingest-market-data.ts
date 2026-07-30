import "../envConfig";
import { closeDatabase, getDatabase } from "../lib/db/connection";
import {
  createDefaultCandleAdapters,
  createDefaultQuoteAdapters,
} from "../lib/ingestion/provider-adapters";
import { runMarketIngestion } from "../lib/ingestion/service";

function positiveInteger(name: string, fallback: number): number {
  const raw = process.env[name]?.trim();
  if (!raw) return fallback;
  const value = Number(raw);
  if (!Number.isInteger(value) || value < 1) {
    throw new Error(`${name} must be a positive integer.`);
  }
  return value;
}

function optionalPositiveInteger(name: string): number | undefined {
  const raw = process.env[name]?.trim();
  if (!raw) return undefined;
  const value = Number(raw);
  if (!Number.isInteger(value) || value < 1) {
    throw new Error(`${name} must be a positive integer.`);
  }
  return value;
}

async function main() {
  const database = getDatabase();
  const historyBackfillHours = optionalPositiveInteger(
    "INGEST_HISTORY_BACKFILL_HOURS",
  );
  const initialBackfillHours = positiveInteger(
    "INGEST_INITIAL_BACKFILL_HOURS",
    24,
  );
  const repairLookbackHours = positiveInteger(
    "INGEST_REPAIR_LOOKBACK_HOURS",
    24,
  );
  const maxBackfillHours = positiveInteger(
    "INGEST_MAX_BACKFILL_HOURS",
    Math.max(168, historyBackfillHours ?? 0),
  );

  const results = await runMarketIngestion(
    database,
    {
      candles: createDefaultCandleAdapters(),
      quotes: createDefaultQuoteAdapters(),
    },
    {
      candles: {
        historyBackfillHours,
        initialBackfillHours,
        repairLookbackHours,
        maxBackfillHours,
      },
    },
  );
  const summary = {
    generatedAt: new Date().toISOString(),
    status: results.some((result) => result.status === "failed")
      ? "failed"
      : results.some((result) => result.status === "partial")
        ? "partial"
        : "success",
    runs: results.map((result) => ({
      task: result.task,
      provider: result.provider,
      timeframe: result.timeframe,
      status: result.status,
      requestedCount: result.requestedCount,
      acceptedCount: result.acceptedCount,
      rejectedCount: result.rejectedCount,
      coverageRatio: result.coverageRatio,
      errorCount: result.errors.length,
    })),
  };
  console.log(JSON.stringify(summary, null, 2));

  if (
    results.some(
      (result) =>
        result.status === "failed" || result.status === "partial",
    )
  ) {
    process.exitCode = 1;
  }
}

main()
  .catch((error) => {
    console.error(
      "Market ingestion failed:",
      error instanceof Error ? error.message : "unknown error",
    );
    process.exitCode = 1;
  })
  .finally(async () => {
    await closeDatabase();
  });
