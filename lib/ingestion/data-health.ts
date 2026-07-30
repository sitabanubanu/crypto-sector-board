import {
  and,
  desc,
  eq,
  gte,
  inArray,
  lt,
} from "drizzle-orm";
import type {
  PgDatabase,
  PgQueryResultHKT,
} from "drizzle-orm/pg-core";
import {
  ingestionRuns,
  marketCandles,
  marketQuotesLatest,
  providerInstruments,
} from "@/lib/db/schema";
import * as schema from "@/lib/db/schema";
import { HOUR_MS, type IngestionProvider } from "./types";

type HealthDatabase<TResult extends PgQueryResultHKT> = PgDatabase<
  TResult,
  typeof schema
>;

const LIVE_PROVIDERS = [
  "coingecko",
  "gate",
  "okx",
] as const satisfies readonly IngestionProvider[];
const PROVIDER_SUCCESS_STALE_MS = 3 * HOUR_MS;
const QUOTE_STALE_MS = 2 * HOUR_MS;
const STUCK_RUN_MS = 30 * 60 * 1_000;

export interface DataHealthReport {
  generatedAt: string;
  status: "healthy" | "degraded" | "critical";
  providers: Array<{
    provider: IngestionProvider;
    activeMappings: number;
    quoteMappings: number;
    candleMappings: number;
    staleMappings: number;
    lastRunAt: string | null;
    lastRunStatus: string | null;
    lastSuccessAt: string | null;
    successStale: boolean;
    stuckRuns: number;
    failures24h: number;
    rateLimits24h: number;
    serverErrors24h: number;
  }>;
  candleCoverage: {
    last24h: CoverageWindow;
    last7d: CoverageWindow;
  };
  staleAssets: Array<{
    assetId: string;
    provider: "gate" | "okx";
    lastCandleAt: string | null;
    missing24h: number;
  }>;
  failedAssets: string[];
  quotes: {
    expected: number;
    present: number;
    fresh: number;
    missing: number;
    coverageRatio: number;
    freshnessRatio: number;
    /** @deprecated Use present. Kept for API compatibility. */
    total: number;
    fallback: number;
    stale: number;
  };
  stuckRuns: Array<{
    task: string;
    provider: IngestionProvider;
    startedAt: string;
    ageMinutes: number;
  }>;
  recentRuns: Array<{
    task: string;
    provider: string | null;
    timeframe: string | null;
    status: string;
    requestedCount: number;
    acceptedCount: number;
    rejectedCount: number;
    coverageRatio: number | null;
    startedAt: string;
    finishedAt: string | null;
    errorCount: number;
  }>;
}

interface CoverageWindow {
  expected: number;
  present: number;
  missing: number;
  coverageRatio: number;
}

function iso(value: Date | null | undefined): string | null {
  return value ? value.toISOString() : null;
}

function errorText(errors: Array<Record<string, unknown>>): string {
  return errors
    .flatMap((error) =>
      Object.values(error).filter(
        (value): value is string => typeof value === "string",
      ),
    )
    .join(" ");
}

function windowCoverage(
  expectedAssets: number,
  hours: number,
  points: number,
): CoverageWindow {
  const expected = expectedAssets * hours;
  const present = Math.min(expected, points);
  return {
    expected,
    present,
    missing: Math.max(0, expected - present),
    coverageRatio: expected === 0 ? 1 : present / expected,
  };
}

export async function getDataHealthReport<
  TResult extends PgQueryResultHKT,
>(
  database: HealthDatabase<TResult>,
  now = new Date(),
): Promise<DataHealthReport> {
  const hourEnd = new Date(Math.floor(now.getTime() / HOUR_MS) * HOUR_MS);
  const start24h = new Date(hourEnd.getTime() - 24 * HOUR_MS);
  const start7d = new Date(hourEnd.getTime() - 7 * 24 * HOUR_MS);
  const mappingStaleBefore = new Date(now.getTime() - 30 * 24 * HOUR_MS);
  const quoteStaleBefore = new Date(now.getTime() - QUOTE_STALE_MS);
  const providerSuccessStaleBefore = new Date(
    now.getTime() - PROVIDER_SUCCESS_STALE_MS,
  );
  const stuckRunBefore = new Date(now.getTime() - STUCK_RUN_MS);

  const [mappings, candleRows, quoteRows, runs, stuckRunRows] =
    await Promise.all([
    database
      .select({
        assetId: providerInstruments.assetId,
        provider: providerInstruments.provider,
        supportsQuotes: providerInstruments.supportsQuotes,
        supportsCandles: providerInstruments.supportsCandles,
        lastVerifiedAt: providerInstruments.lastVerifiedAt,
      })
      .from(providerInstruments)
      .where(
        and(
          eq(providerInstruments.status, "active"),
          inArray(providerInstruments.provider, LIVE_PROVIDERS),
        ),
      ),
    database
      .select({
        assetId: marketCandles.assetId,
        provider: marketCandles.provider,
        openTime: marketCandles.openTime,
      })
      .from(marketCandles)
      .where(
        and(
          eq(marketCandles.timeframe, "1h"),
          inArray(marketCandles.provider, ["gate", "okx"]),
          gte(marketCandles.openTime, start7d),
          lt(marketCandles.openTime, hourEnd),
        ),
      ),
    database
      .select({
        assetId: marketQuotesLatest.assetId,
        fallbackUsed: marketQuotesLatest.fallbackUsed,
        observedAt: marketQuotesLatest.observedAt,
        provider: marketQuotesLatest.provider,
      })
      .from(marketQuotesLatest)
      .where(
        inArray(marketQuotesLatest.provider, LIVE_PROVIDERS),
      ),
    database
      .select()
      .from(ingestionRuns)
      .where(gte(ingestionRuns.startedAt, start7d))
      .orderBy(desc(ingestionRuns.startedAt))
      .limit(500),
    database
      .select({
        task: ingestionRuns.task,
        provider: ingestionRuns.provider,
        startedAt: ingestionRuns.startedAt,
      })
      .from(ingestionRuns)
      .where(
        and(
          eq(ingestionRuns.status, "running"),
          lt(ingestionRuns.startedAt, stuckRunBefore),
          inArray(ingestionRuns.provider, LIVE_PROVIDERS),
        ),
      )
      .orderBy(ingestionRuns.startedAt)
      .limit(100),
  ]);

  const candleMappings = mappings.filter(
    (mapping) =>
      mapping.supportsCandles &&
      (mapping.provider === "gate" || mapping.provider === "okx"),
  );
  const candleMappingKeys = new Set(
    candleMappings.map(
      (mapping) => `${mapping.provider}:${mapping.assetId}`,
    ),
  );
  const relevantCandleRows = candleRows.filter((row) =>
    candleMappingKeys.has(`${row.provider}:${row.assetId}`),
  );
  const candleKeys = new Set(
    relevantCandleRows.map(
      (row) =>
        `${row.provider}:${row.assetId}:${row.openTime.toISOString()}`,
    ),
  );
  const lastByAsset = new Map<string, Date>();
  for (const row of relevantCandleRows) {
    const key = `${row.provider}:${row.assetId}`;
    const previous = lastByAsset.get(key);
    if (!previous || row.openTime > previous) {
      lastByAsset.set(key, row.openTime);
    }
  }

  const points7d = relevantCandleRows.length;
  const points24h = relevantCandleRows.filter(
    (row) => row.openTime >= start24h && row.openTime < hourEnd,
  ).length;
  const last24h = windowCoverage(candleMappings.length, 24, points24h);
  const last7d = windowCoverage(candleMappings.length, 7 * 24, points7d);

  const staleAssets = candleMappings
    .map((mapping) => {
      let missing24h = 0;
      for (
        let time = start24h.getTime();
        time < hourEnd.getTime();
        time += HOUR_MS
      ) {
        if (
          !candleKeys.has(
            `${mapping.provider}:${mapping.assetId}:${new Date(time).toISOString()}`,
          )
        ) {
          missing24h += 1;
        }
      }
      return {
        assetId: mapping.assetId,
        provider: mapping.provider as "gate" | "okx",
        lastCandleAt:
          iso(lastByAsset.get(`${mapping.provider}:${mapping.assetId}`)) ??
          null,
        missing24h,
      };
    })
    .filter((asset) => asset.missing24h > 0)
    .sort(
      (left, right) =>
        right.missing24h - left.missing24h ||
        left.assetId.localeCompare(right.assetId),
    );

  // A one-off deep history backfill is reported in recentRuns, but an
  // unavailable old secondary-provider candle must not make the live
  // ingestion SLO unhealthy when current 24h/7d coverage is complete.
  const operationalRuns = runs.filter(
    (run) => run.task !== "market-candles-history",
  );
  const failedAssets = [
    ...new Set(
      operationalRuns
        .filter(
          (run) =>
            run.provider != null &&
            LIVE_PROVIDERS.includes(
              run.provider as IngestionProvider,
            ),
        )
        .flatMap((run) =>
          run.errorSummary.flatMap((error) =>
            typeof error.assetId === "string" ? [error.assetId] : [],
          ),
        ),
    ),
  ].sort();

  const quoteMappings = mappings.filter((mapping) => mapping.supportsQuotes);
  const quoteMappingKeys = new Set(
    quoteMappings.map(
      (mapping) => `${mapping.provider}:${mapping.assetId}`,
    ),
  );
  const relevantQuoteRows = quoteRows.filter((row) =>
    quoteMappingKeys.has(`${row.provider}:${row.assetId}`),
  );
  const freshQuoteRows = relevantQuoteRows.filter(
    (quote) =>
      quote.observedAt >= quoteStaleBefore && quote.observedAt <= now,
  );
  const quoteExpected = quoteMappings.length;
  const quotePresent = relevantQuoteRows.length;
  const quoteFresh = freshQuoteRows.length;
  const quoteCoverageRatio =
    quoteExpected === 0 ? 1 : Math.min(1, quotePresent / quoteExpected);
  const quoteFreshnessRatio =
    quoteExpected === 0 ? 1 : Math.min(1, quoteFresh / quoteExpected);

  const providerReports = LIVE_PROVIDERS.map((provider) => {
    const providerRuns = operationalRuns.filter(
      (run) => run.provider === provider,
    );
    const activeMappings = mappings.filter(
      (mapping) => mapping.provider === provider,
    );
    const failures24h = providerRuns.filter(
      (run) =>
        run.startedAt >= start24h &&
        (run.status === "failed" || run.status === "partial"),
    ).length;
    const errors24h = providerRuns
      .filter((run) => run.startedAt >= start24h)
      .map((run) => errorText(run.errorSummary))
      .join(" ");
    const lastSuccess = providerRuns.find(
      (run) => run.status === "success",
    );
    const lastRun = providerRuns[0];
    const lastSuccessAt =
      lastSuccess?.finishedAt ?? lastSuccess?.startedAt ?? null;
    return {
      provider,
      activeMappings: activeMappings.length,
      quoteMappings: activeMappings.filter(
        (mapping) => mapping.supportsQuotes,
      ).length,
      candleMappings: activeMappings.filter(
        (mapping) => mapping.supportsCandles,
      ).length,
      staleMappings: activeMappings.filter(
        (mapping) =>
          (!mapping.lastVerifiedAt ||
            mapping.lastVerifiedAt < mappingStaleBefore),
      ).length,
      lastRunAt: iso(lastRun?.startedAt),
      lastRunStatus: lastRun?.status ?? null,
      lastSuccessAt: iso(lastSuccessAt),
      successStale:
        activeMappings.length > 0 &&
        (!lastSuccessAt || lastSuccessAt < providerSuccessStaleBefore),
      stuckRuns: stuckRunRows.filter(
        (run) => run.provider === provider,
      ).length,
      failures24h,
      rateLimits24h: (errors24h.match(/HTTP 429/g) ?? []).length,
      serverErrors24h: (errors24h.match(/HTTP 5\d\d/g) ?? []).length,
    };
  });

  const hasRecentFailure = providerReports.some(
    (provider) => provider.failures24h > 0,
  );
  const hasStaleProvider = providerReports.some(
    (provider) => provider.successStale,
  );
  const hasStaleMapping = providerReports.some(
    (provider) => provider.staleMappings > 0,
  );
  const hasStuckRun = stuckRunRows.length > 0;
  const fallbackQuoteCount = relevantQuoteRows.filter(
    (quote) => quote.fallbackUsed,
  ).length;
  const status =
    last24h.coverageRatio < 0.5 || quoteFreshnessRatio < 0.5
      ? "critical"
      : last24h.coverageRatio < 0.95 ||
          quoteFreshnessRatio < 0.95 ||
          fallbackQuoteCount > 0 ||
          hasRecentFailure ||
          hasStaleProvider ||
          hasStaleMapping ||
          hasStuckRun ||
          staleAssets.length > 0
        ? "degraded"
        : "healthy";

  return {
    generatedAt: now.toISOString(),
    status,
    providers: providerReports,
    candleCoverage: { last24h, last7d },
    staleAssets: staleAssets.slice(0, 200),
    failedAssets,
    quotes: {
      expected: quoteExpected,
      present: quotePresent,
      fresh: quoteFresh,
      missing: Math.max(0, quoteExpected - quotePresent),
      coverageRatio: quoteCoverageRatio,
      freshnessRatio: quoteFreshnessRatio,
      total: quotePresent,
      fallback: fallbackQuoteCount,
      stale: Math.max(0, quotePresent - quoteFresh),
    },
    stuckRuns: stuckRunRows.flatMap((run) =>
      run.provider &&
      LIVE_PROVIDERS.includes(run.provider as IngestionProvider)
        ? [
            {
              task: run.task,
              provider: run.provider as IngestionProvider,
              startedAt: run.startedAt.toISOString(),
              ageMinutes: Math.max(
                0,
                Math.floor(
                  (now.getTime() - run.startedAt.getTime()) / 60_000,
                ),
              ),
            },
          ]
        : [],
    ),
    recentRuns: runs.slice(0, 50).map((run) => ({
      task: run.task,
      provider: run.provider,
      timeframe: run.timeframe,
      status: run.status,
      requestedCount: run.requestedCount,
      acceptedCount: run.acceptedCount,
      rejectedCount: run.rejectedCount,
      coverageRatio: run.coverageRatio,
      startedAt: run.startedAt.toISOString(),
      finishedAt: iso(run.finishedAt),
      errorCount: run.errorSummary.length,
    })),
  };
}
