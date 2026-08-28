import { getDatabase } from "@/lib/db/client";
import { getDataHealthReport } from "@/lib/ingestion/data-health";
import { resolveMarketIngestionOptions } from "@/lib/ingestion/options";
import {
  createDefaultCandleAdapters,
  createDefaultQuoteAdapters,
} from "@/lib/ingestion/provider-adapters";
import { runMarketIngestion } from "@/lib/ingestion/service";
import { createMarketDataCronHandler } from "@/lib/server/market-data-cron";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

export const GET = createMarketDataCronHandler({
  getCronSecret: () => process.env.CRON_SECRET,
  checkHealth: () => getDataHealthReport(getDatabase()),
  ingest: () =>
    runMarketIngestion(
      getDatabase(),
      {
        candles: createDefaultCandleAdapters(),
        quotes: createDefaultQuoteAdapters(),
      },
      resolveMarketIngestionOptions(),
    ),
  onError: (error) => {
    console.error(
      "Scheduled market data recovery failed:",
      error instanceof Error ? error.message : "unknown error",
    );
  },
});
