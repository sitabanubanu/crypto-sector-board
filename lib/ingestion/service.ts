import {
  and,
  eq,
  gte,
  inArray,
  lt,
  or,
  sql,
} from "drizzle-orm";
import type {
  PgDatabase,
  PgQueryResultHKT,
} from "drizzle-orm/pg-core";
import {
  ingestionRuns,
  marketCandles,
  marketCaps,
  marketQuotesLatest,
  providerInstruments,
} from "@/lib/db/schema";
import * as schema from "@/lib/db/schema";
import type { MarketQuote } from "@/lib/market-data/contracts";
import {
  HOUR_MS,
  type ActiveInstrument,
  type IngestionRunResult,
  type ProviderCandleAdapter,
  type ProviderQuoteAdapter,
} from "./types";

type IngestionDatabase<TResult extends PgQueryResultHKT> = PgDatabase<
  TResult,
  typeof schema
>;

const STALE_RUN_AFTER_MS = 30 * 60 * 1_000;

interface CommonIngestionOptions {
  assetIds?: string[];
  now?: Date;
}

export interface CandleIngestionOptions extends CommonIngestionOptions {
  historyBackfillHours?: number;
  initialBackfillHours?: number;
  maxBackfillHours?: number;
  repairLookbackHours?: number;
  sleep?: (milliseconds: number) => Promise<void>;
}

export type QuoteIngestionOptions = CommonIngestionOptions;

function floorToHour(date: Date): Date {
  return new Date(Math.floor(date.getTime() / HOUR_MS) * HOUR_MS);
}

function asDate(value: Date | string | null | undefined): Date | null {
  if (value == null) return null;
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function countHours(from: Date, toExclusive: Date): number {
  return Math.max(
    0,
    Math.ceil((toExclusive.getTime() - from.getTime()) / HOUR_MS),
  );
}

function safeError(
  error: unknown,
  details: Record<string, unknown> = {},
): Record<string, unknown> {
  const message =
    error instanceof Error ? error.message : "Unknown ingestion error";
  return {
    ...details,
    code: "ingestion_error",
    message: message.slice(0, 500),
  };
}

function defaultSleep(milliseconds: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

function coverage(accepted: number, requested: number): number {
  return requested === 0 ? 1 : Math.min(1, accepted / requested);
}

function resultStatus(
  accepted: number,
  rejected: number,
  requested: number,
): "success" | "partial" | "failed" {
  if (requested > 0 && accepted === 0) return "failed";
  if (rejected > 0) return "partial";
  return "success";
}

async function activeInstruments<TResult extends PgQueryResultHKT>(
  database: IngestionDatabase<TResult>,
  provider: "coingecko" | "gate" | "okx",
  capability: "quotes" | "candles",
  assetIds?: string[],
): Promise<ActiveInstrument[]> {
  const capabilityFilter =
    capability === "quotes"
      ? eq(providerInstruments.supportsQuotes, true)
      : eq(providerInstruments.supportsCandles, true);
  const filters = [
    eq(providerInstruments.provider, provider),
    eq(providerInstruments.status, "active"),
    capabilityFilter,
    sql`${providerInstruments.instrumentId} is not null`,
  ];
  if (assetIds && assetIds.length > 0) {
    filters.push(inArray(providerInstruments.assetId, assetIds));
  }

  const rows = await database
    .select({
      assetId: providerInstruments.assetId,
      instrumentId: providerInstruments.instrumentId,
    })
    .from(providerInstruments)
    .where(and(...filters))
    .orderBy(providerInstruments.assetId);

  return rows.flatMap((row) =>
    row.instrumentId
      ? [{ assetId: row.assetId, instrumentId: row.instrumentId }]
      : [],
  );
}

async function startRun<TResult extends PgQueryResultHKT>(
  database: IngestionDatabase<TResult>,
  values: {
    dedupeKey: string;
    task: string;
    provider: "coingecko" | "gate" | "okx";
    timeframe: "1h" | null;
    cursorTo: Date;
  },
): Promise<string | null> {
  const [row] = await database
    .insert(ingestionRuns)
    .values({
      ...values,
      startedAt: new Date(),
      status: "running",
    })
    .onConflictDoNothing({ target: ingestionRuns.dedupeKey })
    .returning({ runId: ingestionRuns.runId });
  if (row) return row.runId;

  // A successful/currently-running bucket stays locked. Failed and partial
  // buckets, plus runs abandoned beyond the workflow timeout, can be
  // reclaimed by compare-and-set. Candle/quote upserts protect partial data
  // that was already written by an earlier attempt.
  const staleRunBefore = new Date(Date.now() - STALE_RUN_AFTER_MS);
  const [retry] = await database
    .update(ingestionRuns)
    .set({
      status: "running",
      requestedCount: 0,
      acceptedCount: 0,
      rejectedCount: 0,
      coverageRatio: null,
      errorSummary: [],
      cursorFrom: null,
      cursorTo: values.cursorTo,
      startedAt: new Date(),
      finishedAt: null,
    })
    .where(
      and(
        eq(ingestionRuns.dedupeKey, values.dedupeKey),
        or(
          eq(ingestionRuns.status, "failed"),
          eq(ingestionRuns.status, "partial"),
          and(
            eq(ingestionRuns.status, "running"),
            lt(ingestionRuns.startedAt, staleRunBefore),
          ),
        ),
      ),
    )
    .returning({ runId: ingestionRuns.runId });
  return retry?.runId ?? null;
}

async function finishRun<TResult extends PgQueryResultHKT>(
  database: IngestionDatabase<TResult>,
  runId: string,
  values: {
    acceptedCount: number;
    cursorFrom: Date | null;
    errorSummary: Array<Record<string, unknown>>;
    rejectedCount: number;
    requestedCount: number;
    status: "success" | "partial" | "failed";
  },
): Promise<void> {
  await database
    .update(ingestionRuns)
    .set({
      ...values,
      coverageRatio: coverage(values.acceptedCount, values.requestedCount),
      finishedAt: new Date(),
    })
    .where(eq(ingestionRuns.runId, runId));
}

function skippedResult(
  task: "candles" | "quotes",
  provider: "coingecko" | "gate" | "okx",
  bucket: Date,
): IngestionRunResult {
  return {
    task,
    provider,
    timeframe: task === "candles" ? "1h" : null,
    bucket: bucket.toISOString(),
    status: "skipped_duplicate",
    requestedCount: 0,
    acceptedCount: 0,
    rejectedCount: 0,
    coverageRatio: 1,
    errors: [],
  };
}

export async function runCandleIngestion<
  TResult extends PgQueryResultHKT,
>(
  database: IngestionDatabase<TResult>,
  adapter: ProviderCandleAdapter,
  {
    assetIds,
    historyBackfillHours,
    initialBackfillHours = 24,
    maxBackfillHours = 168,
    now = new Date(),
    repairLookbackHours = 24,
    sleep = defaultSleep,
  }: CandleIngestionOptions = {},
): Promise<IngestionRunResult> {
  if (
    !Number.isInteger(initialBackfillHours) ||
    !Number.isInteger(maxBackfillHours) ||
    !Number.isInteger(repairLookbackHours) ||
    (historyBackfillHours != null &&
      (!Number.isInteger(historyBackfillHours) ||
        historyBackfillHours < 1)) ||
    initialBackfillHours < 1 ||
    repairLookbackHours < 1 ||
    maxBackfillHours <
      Math.max(
        initialBackfillHours,
        repairLookbackHours,
        historyBackfillHours ?? 0,
      )
  ) {
    throw new Error(
      "Backfill windows must be positive integers and maxBackfillHours must contain the initial and repair windows.",
    );
  }

  const bucket = floorToHour(now);
  const runMode =
    historyBackfillHours == null
      ? ""
      : `:history-${historyBackfillHours}`;
  const dedupeKey = `market-candles:${adapter.provider}:1h${runMode}:${bucket.toISOString()}`;
  const runId = await startRun(database, {
    dedupeKey,
    task:
      historyBackfillHours == null
        ? "market-candles"
        : "market-candles-history",
    provider: adapter.provider,
    timeframe: "1h",
    cursorTo: bucket,
  });
  if (!runId) return skippedResult("candles", adapter.provider, bucket);

  let requestedCount = 0;
  let acceptedCount = 0;
  let rejectedCount = 0;
  let earliestCursor: Date | null = null;
  const errors: Array<Record<string, unknown>> = [];

  try {
    const instruments = await activeInstruments(
      database,
      adapter.provider,
      "candles",
      assetIds,
    );
    const instrumentAssetIds = instruments.map((item) => item.assetId);
    const latestRows =
      instrumentAssetIds.length === 0
        ? []
        : await database
            .select({
              assetId: marketCandles.assetId,
              latestOpenTime: sql<Date | null>`max(${marketCandles.openTime})`,
            })
            .from(marketCandles)
            .where(
              and(
                eq(marketCandles.provider, adapter.provider),
                eq(marketCandles.timeframe, "1h"),
                inArray(marketCandles.assetId, instrumentAssetIds),
                lt(marketCandles.openTime, bucket),
              ),
            )
            .groupBy(marketCandles.assetId);
    const latestByAsset = new Map(
      latestRows.map((row) => [
        row.assetId,
        asDate(row.latestOpenTime),
      ]),
    );

    const scanLookbackHours =
      historyBackfillHours ?? repairLookbackHours;
    const repairWindowStart = new Date(
      bucket.getTime() - scanLookbackHours * HOUR_MS,
    );
    const recentRows =
      instrumentAssetIds.length === 0
        ? []
        : await database
            .select({
              assetId: marketCandles.assetId,
              openTime: marketCandles.openTime,
            })
            .from(marketCandles)
            .where(
              and(
                eq(marketCandles.provider, adapter.provider),
                eq(marketCandles.timeframe, "1h"),
                inArray(marketCandles.assetId, instrumentAssetIds),
                gte(marketCandles.openTime, repairWindowStart),
                lt(marketCandles.openTime, bucket),
              ),
            );
    const recentByAsset = new Map<string, Set<number>>();
    for (const row of recentRows) {
      const times = recentByAsset.get(row.assetId) ?? new Set<number>();
      times.add(row.openTime.getTime());
      recentByAsset.set(row.assetId, times);
    }

    for (let index = 0; index < instruments.length; index += 1) {
      const instrument = instruments[index];
      const latest = latestByAsset.get(instrument.assetId) ?? null;
      const existing = recentByAsset.get(instrument.assetId) ?? new Set();
      let firstRepairGap: Date | null = null;
      for (
        let time = repairWindowStart.getTime();
        time < bucket.getTime();
        time += HOUR_MS
      ) {
        if (!existing.has(time)) {
          firstRepairGap = new Date(time);
          break;
        }
      }

      let from: Date;
      if (!latest) {
        from = new Date(
          bucket.getTime() -
            (historyBackfillHours ?? initialBackfillHours) * HOUR_MS,
        );
      } else if (historyBackfillHours != null) {
        const cursor = new Date(latest.getTime() + HOUR_MS);
        from = firstRepairGap ?? cursor;
      } else {
        const cursor = new Date(latest.getTime() + HOUR_MS);
        // A stale tail cursor is the authoritative backfill boundary. Only
        // scan the repair window for internal holes once the tail is current.
        from = cursor < bucket ? cursor : firstRepairGap ?? cursor;
      }
      const maxFrom = new Date(
        bucket.getTime() - maxBackfillHours * HOUR_MS,
      );
      if (from < maxFrom) from = maxFrom;
      if (from >= bucket) continue;

      earliestCursor =
        earliestCursor == null ||
        from.getTime() < earliestCursor.getTime()
          ? from
          : earliestCursor;
      const expected = countHours(from, bucket);
      requestedCount += expected;

      try {
        const result = await adapter.fetchCandles({
          ...instrument,
          from,
          toExclusive: bucket,
          timeframe: "1h",
        });
        const unique = new Map(
          result.candles.map((candle) => [candle.openTime, candle]),
        );
        const valid = [...unique.values()].filter(
          (candle) =>
            candle.open != null &&
            candle.high != null &&
            candle.low != null &&
            candle.close != null,
        );

        if (valid.length > 0) {
          await database
            .insert(marketCandles)
            .values(
              valid.map((candle) => ({
                assetId: candle.assetId,
                provider: adapter.provider,
                timeframe: "1h" as const,
                openTime: new Date(candle.openTime),
                closeTime: new Date(candle.closeTime),
                open: candle.open!,
                high: candle.high!,
                low: candle.low!,
                close: candle.close!,
                volumeBase: candle.volume,
                volumeQuote: candle.quoteVolume,
                isComplete: candle.isComplete,
                fetchedAt: new Date(candle.fetchedAt),
                quality: {
                  source: adapter.provider,
                  ingestedAt: new Date().toISOString(),
                },
              })),
            )
            .onConflictDoUpdate({
              target: [
                marketCandles.assetId,
                marketCandles.provider,
                marketCandles.timeframe,
                marketCandles.openTime,
              ],
              set: {
                closeTime: sql`excluded.close_time`,
                open: sql`excluded.open`,
                high: sql`excluded.high`,
                low: sql`excluded.low`,
                close: sql`excluded.close`,
                volumeBase: sql`excluded.volume_base`,
                volumeQuote: sql`excluded.volume_quote`,
                isComplete: sql`excluded.is_complete`,
                fetchedAt: sql`excluded.fetched_at`,
                quality: sql`excluded.quality`,
              },
            });
        }

        const accepted = Math.min(expected, valid.length);
        acceptedCount += accepted;
        rejectedCount += expected - accepted;
        errors.push(
          ...result.issues.slice(0, 10).map((issue) => ({
            assetId: instrument.assetId,
            ...issue,
          })),
        );
        if (valid.length < expected) {
          errors.push({
            assetId: instrument.assetId,
            code: "candle_gap",
            message: `Provider returned ${valid.length} of ${expected} requested closed candles.`,
          });
        }
      } catch (error) {
        rejectedCount += expected;
        errors.push(
          safeError(error, {
            assetId: instrument.assetId,
            instrumentId: instrument.instrumentId,
          }),
        );
      }

      if (
        adapter.minimumDelayMs > 0 &&
        index < instruments.length - 1
      ) {
        await sleep(adapter.minimumDelayMs);
      }
    }

    const status = resultStatus(
      acceptedCount,
      rejectedCount,
      requestedCount,
    );
    await finishRun(database, runId, {
      acceptedCount,
      cursorFrom: earliestCursor,
      errorSummary: errors.slice(0, 100),
      rejectedCount,
      requestedCount,
      status,
    });
    return {
      task: "candles",
      provider: adapter.provider,
      timeframe: "1h",
      bucket: bucket.toISOString(),
      status,
      requestedCount,
      acceptedCount,
      rejectedCount,
      coverageRatio: coverage(acceptedCount, requestedCount),
      errors: errors.slice(0, 100),
    };
  } catch (error) {
    errors.push(safeError(error));
    rejectedCount = Math.max(rejectedCount, requestedCount - acceptedCount);
    await finishRun(database, runId, {
      acceptedCount,
      cursorFrom: earliestCursor,
      errorSummary: errors.slice(0, 100),
      rejectedCount,
      requestedCount,
      status: "failed",
    });
    return {
      task: "candles",
      provider: adapter.provider,
      timeframe: "1h",
      bucket: bucket.toISOString(),
      status: "failed",
      requestedCount,
      acceptedCount,
      rejectedCount,
      coverageRatio: coverage(acceptedCount, requestedCount),
      errors: errors.slice(0, 100),
    };
  }
}

function quoteVolumeColumns(quote: MarketQuote): {
  volumeBase24h: number | null;
  volumeQuote24h: number | null;
} {
  // The shared MarketQuote contract normalizes all three providers to quote
  // currency volume: Gate quote_volume, OKX SPOT volCcy24h and CoinGecko's
  // USD total_volume.
  return { volumeBase24h: null, volumeQuote24h: quote.volume24h };
}

export async function runQuoteIngestion<
  TResult extends PgQueryResultHKT,
>(
  database: IngestionDatabase<TResult>,
  adapter: ProviderQuoteAdapter,
  { assetIds, now = new Date() }: QuoteIngestionOptions = {},
): Promise<IngestionRunResult> {
  const bucket = floorToHour(now);
  const dedupeKey = `market-quotes:${adapter.provider}:${bucket.toISOString()}`;
  const runId = await startRun(database, {
    dedupeKey,
    task: "market-quotes",
    provider: adapter.provider,
    timeframe: null,
    cursorTo: bucket,
  });
  if (!runId) return skippedResult("quotes", adapter.provider, bucket);

  let requestedCount = 0;
  let acceptedCount = 0;
  let rejectedCount = 0;
  const errors: Array<Record<string, unknown>> = [];

  try {
    const instruments = await activeInstruments(
      database,
      adapter.provider,
      "quotes",
      assetIds,
    );
    requestedCount = instruments.length;
    const result = await adapter.fetchQuotes(instruments);
    const byAsset = new Map(
      result.quotes
        .filter((quote) => quote.price != null)
        .map((quote) => [quote.assetId, quote]),
    );
    const quotes = [...byAsset.values()];
    acceptedCount = Math.min(requestedCount, quotes.length);
    rejectedCount = requestedCount - acceptedCount;
    errors.push(...result.issues.slice(0, 100));

    if (quotes.length > 0) {
      await database
        .insert(marketQuotesLatest)
        .values(
          quotes.map((quote) => ({
            assetId: quote.assetId,
            provider: adapter.provider,
            instrumentId: quote.instrumentId,
            last: quote.price!,
            open24h: quote.open24h,
            high24h: quote.high24h,
            low24h: quote.low24h,
            ...quoteVolumeColumns(quote),
            observedAt: new Date(quote.observedAt),
            fetchedAt: new Date(quote.fetchedAt),
            fallbackUsed: quote.fallbackUsed,
            quality: {
              change24h: quote.change24h,
              source: adapter.provider,
            },
          })),
        )
        .onConflictDoUpdate({
          target: [
            marketQuotesLatest.assetId,
            marketQuotesLatest.provider,
          ],
          set: {
            instrumentId: sql`excluded.instrument_id`,
            last: sql`excluded.last`,
            open24h: sql`excluded.open_24h`,
            high24h: sql`excluded.high_24h`,
            low24h: sql`excluded.low_24h`,
            volumeBase24h: sql`excluded.volume_base_24h`,
            volumeQuote24h: sql`excluded.volume_quote_24h`,
            observedAt: sql`excluded.observed_at`,
            fetchedAt: sql`excluded.fetched_at`,
            fallbackUsed: sql`excluded.fallback_used`,
            quality: sql`excluded.quality`,
          },
          setWhere: sql`${marketQuotesLatest.observedAt} <= excluded.observed_at`,
        });

      const capRows = quotes.flatMap((quote) =>
        quote.marketCapUsd == null
          ? []
          : [
              {
                assetId: quote.assetId,
                provider: adapter.provider,
                observedAt: new Date(quote.observedAt),
                marketCapUsd: quote.marketCapUsd,
                fetchedAt: new Date(quote.fetchedAt),
                quality: { source: adapter.provider },
              },
            ],
      );
      if (capRows.length > 0) {
        await database
          .insert(marketCaps)
          .values(capRows)
          .onConflictDoUpdate({
            target: [
              marketCaps.assetId,
              marketCaps.provider,
              marketCaps.observedAt,
            ],
            set: {
              marketCapUsd: sql`excluded.market_cap_usd`,
              fetchedAt: sql`excluded.fetched_at`,
              quality: sql`excluded.quality`,
            },
          });
      }
    }

    const status = resultStatus(
      acceptedCount,
      rejectedCount,
      requestedCount,
    );
    await finishRun(database, runId, {
      acceptedCount,
      cursorFrom: null,
      errorSummary: errors,
      rejectedCount,
      requestedCount,
      status,
    });
    return {
      task: "quotes",
      provider: adapter.provider,
      timeframe: null,
      bucket: bucket.toISOString(),
      status,
      requestedCount,
      acceptedCount,
      rejectedCount,
      coverageRatio: coverage(acceptedCount, requestedCount),
      errors,
    };
  } catch (error) {
    rejectedCount = requestedCount;
    errors.push(safeError(error));
    await finishRun(database, runId, {
      acceptedCount: 0,
      cursorFrom: null,
      errorSummary: errors,
      rejectedCount,
      requestedCount,
      status: "failed",
    });
    return {
      task: "quotes",
      provider: adapter.provider,
      timeframe: null,
      bucket: bucket.toISOString(),
      status: "failed",
      requestedCount,
      acceptedCount: 0,
      rejectedCount,
      coverageRatio: coverage(0, requestedCount),
      errors,
    };
  }
}

export async function runMarketIngestion<
  TResult extends PgQueryResultHKT,
>(
  database: IngestionDatabase<TResult>,
  adapters: {
    candles: ProviderCandleAdapter[];
    quotes: ProviderQuoteAdapter[];
  },
  options: {
    candles?: CandleIngestionOptions;
    quotes?: QuoteIngestionOptions;
  } = {},
): Promise<IngestionRunResult[]> {
  const results: IngestionRunResult[] = [];
  for (const adapter of adapters.quotes) {
    results.push(
      await runQuoteIngestion(database, adapter, options.quotes),
    );
  }
  for (const adapter of adapters.candles) {
    results.push(
      await runCandleIngestion(database, adapter, options.candles),
    );
  }
  return results;
}
