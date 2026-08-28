import type { MarketIngestionOptions } from "./service";

interface IngestionEnvironment {
  [key: string]: string | undefined;
  INGEST_HISTORY_BACKFILL_HOURS?: string;
  INGEST_INITIAL_BACKFILL_HOURS?: string;
  INGEST_MAX_BACKFILL_HOURS?: string;
  INGEST_REPAIR_LOOKBACK_HOURS?: string;
}

function positiveInteger(
  environment: IngestionEnvironment,
  name: keyof IngestionEnvironment,
  fallback: number,
): number {
  const raw = environment[name]?.trim();
  if (!raw) return fallback;
  const value = Number(raw);
  if (!Number.isInteger(value) || value < 1) {
    throw new Error(`${String(name)} must be a positive integer.`);
  }
  return value;
}

function optionalPositiveInteger(
  environment: IngestionEnvironment,
  name: keyof IngestionEnvironment,
): number | undefined {
  const raw = environment[name]?.trim();
  if (!raw) return undefined;
  const value = Number(raw);
  if (!Number.isInteger(value) || value < 1) {
    throw new Error(`${String(name)} must be a positive integer.`);
  }
  return value;
}

export function resolveMarketIngestionOptions(
  environment: IngestionEnvironment = process.env,
): MarketIngestionOptions {
  const historyBackfillHours = optionalPositiveInteger(
    environment,
    "INGEST_HISTORY_BACKFILL_HOURS",
  );
  const initialBackfillHours = positiveInteger(
    environment,
    "INGEST_INITIAL_BACKFILL_HOURS",
    24,
  );
  const repairLookbackHours = positiveInteger(
    environment,
    "INGEST_REPAIR_LOOKBACK_HOURS",
    24,
  );
  const maxBackfillHours = positiveInteger(
    environment,
    "INGEST_MAX_BACKFILL_HOURS",
    Math.max(168, historyBackfillHours ?? 0),
  );

  return {
    candles: {
      historyBackfillHours,
      initialBackfillHours,
      repairLookbackHours,
      maxBackfillHours,
    },
  };
}
