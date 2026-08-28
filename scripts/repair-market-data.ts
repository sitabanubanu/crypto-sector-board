import "../envConfig";
import {
  closeDatabase,
  getDatabase,
} from "../lib/db/connection";
import { getDataHealthReport } from "../lib/ingestion/data-health";
import { resolveMarketIngestionOptions } from "../lib/ingestion/options";
import {
  createDefaultCandleAdapters,
  createDefaultQuoteAdapters,
} from "../lib/ingestion/provider-adapters";
import { runMarketDataRecovery } from "../lib/ingestion/recovery";
import { runMarketIngestion } from "../lib/ingestion/service";

async function main() {
  const database = getDatabase();
  const result = await runMarketDataRecovery({
    checkHealth: () => getDataHealthReport(database),
    ingest: () =>
      runMarketIngestion(
        database,
        {
          candles: createDefaultCandleAdapters(),
          quotes: createDefaultQuoteAdapters(),
        },
        resolveMarketIngestionOptions(),
      ),
  });

  console.log(
    JSON.stringify(
      {
        generatedAt: result.healthAfter.generatedAt,
        action: result.action,
        healthy: result.healthy,
        statusBefore: result.healthBefore.status,
        statusAfter: result.healthAfter.status,
        latestCandleAt: result.healthAfter.latestCandleAt,
        latestQuoteAt: result.healthAfter.latestQuoteAt,
        missingBucketCount: result.healthAfter.missingBucketCount,
        candleCoverage: result.healthAfter.candleCoverage,
        quotes: result.healthAfter.quotes,
        failedAssets: result.healthAfter.failedAssets,
        staleAssetCount: result.healthAfter.staleAssets.length,
        providers: result.healthAfter.providers.map((provider) => ({
          provider: provider.provider,
          lastRunStatus: provider.lastRunStatus,
          lastSuccessAt: provider.lastSuccessAt,
          successStale: provider.successStale,
          unresolvedFailures: provider.unresolvedFailures,
          stuckRuns: provider.stuckRuns,
          rateLimits24h: provider.rateLimits24h,
          serverErrors24h: provider.serverErrors24h,
        })),
        runs: result.runs.map((run) => ({
          task: run.task,
          provider: run.provider,
          status: run.status,
          requestedCount: run.requestedCount,
          acceptedCount: run.acceptedCount,
          rejectedCount: run.rejectedCount,
          errorCount: run.errors.length,
        })),
      },
      null,
      2,
    ),
  );

  if (!result.healthy) process.exitCode = 1;
}

main()
  .catch((error) => {
    console.error(
      "Market data repair failed:",
      error instanceof Error ? error.message : "unknown error",
    );
    process.exitCode = 1;
  })
  .finally(async () => {
    await closeDatabase();
  });
