import "../envConfig";
import { closeDatabase, getDatabase } from "../lib/db/connection";
import {
  createDefaultCandleAdapters,
  createDefaultQuoteAdapters,
} from "../lib/ingestion/provider-adapters";
import { resolveMarketIngestionOptions } from "../lib/ingestion/options";
import { runMarketIngestion } from "../lib/ingestion/service";

async function main() {
  const database = getDatabase();
  const results = await runMarketIngestion(
    database,
    {
      candles: createDefaultCandleAdapters(),
      quotes: createDefaultQuoteAdapters(),
    },
    resolveMarketIngestionOptions(),
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
