import { promises as fs } from "node:fs";
import path from "node:path";
import { and, eq, lt, or, sql } from "drizzle-orm";
import type {
  PgDatabase,
  PgQueryResultHKT,
} from "drizzle-orm/pg-core";
import {
  ingestionRuns,
  marketCandles,
  marketCaps,
  marketQuotesLatest,
} from "@/lib/db/schema";
import * as schema from "@/lib/db/schema";
import { resolveAssetId } from "@/lib/market-data/registry";
import { parseDailySnapshot } from "@/lib/market-data/snapshot-schema";
import type { CoinSnapshot, DailySnapshot } from "@/lib/types";

type ImportDatabase<TResult extends PgQueryResultHKT> = PgDatabase<
  TResult,
  typeof schema
>;

export interface LegacyImportFileResult {
  file: string;
  status: "success" | "partial" | "failed" | "skipped_duplicate";
  requestedCount: number;
  acceptedCount: number;
  rejectedCount: number;
  errors: Array<Record<string, unknown>>;
}

export interface LegacyImportSummary {
  files: LegacyImportFileResult[];
  importedFiles: number;
  skippedFiles: number;
  failedFiles: number;
  acceptedAssets: number;
  rejectedAssets: number;
}

interface LegacyAssetRow {
  assetId: string;
  coin: CoinSnapshot;
}

const STALE_IMPORT_AFTER_MS = 30 * 60 * 1_000;

function safeMessage(error: unknown): string {
  return (error instanceof Error ? error.message : "Unknown import error").slice(
    0,
    500,
  );
}

function uniqueAssets(snapshot: DailySnapshot): {
  rows: LegacyAssetRow[];
  errors: Array<Record<string, unknown>>;
  requestedCount: number;
} {
  const byAssetId = new Map<string, LegacyAssetRow>();
  const seenItems = new Set<string>();
  const errors: Array<Record<string, unknown>> = [];
  let requestedCount = 0;

  for (const sector of snapshot.sectors) {
    for (const coin of sector.coins) {
      const assetId = resolveAssetId(coin.id);
      const itemKey = assetId
        ? `asset:${assetId}`
        : `unknown:${coin.id.trim().toLowerCase()}`;
      if (seenItems.has(itemKey)) continue;
      seenItems.add(itemKey);
      requestedCount += 1;
      if (!assetId) {
        errors.push({
          code: "unknown_legacy_asset",
          item: coin.id,
          message: "Legacy snapshot asset is not present in the registry.",
        });
        continue;
      }
      if (!byAssetId.has(assetId)) {
        byAssetId.set(assetId, { assetId, coin });
      }
    }
  }

  return {
    rows: [...byAssetId.values()],
    errors,
    requestedCount,
  };
}

function hasValidOhlc(coin: CoinSnapshot): coin is CoinSnapshot & {
  open: number;
  high: number;
  low: number;
  close: number;
} {
  const values = [coin.open, coin.high, coin.low, coin.close];
  return (
    values.every(
      (value) => value != null && Number.isFinite(value) && value > 0,
    ) &&
    coin.high! >= Math.max(coin.open!, coin.close!, coin.low!) &&
    coin.low! <= Math.min(coin.open!, coin.close!, coin.high!)
  );
}

async function claimImportRun<TResult extends PgQueryResultHKT>(
  database: ImportDatabase<TResult>,
  values: {
    dedupeKey: string;
    cursorFrom: Date;
    cursorTo: Date;
  },
): Promise<{ runId: string } | null> {
  const [created] = await database
    .insert(ingestionRuns)
    .values({
      ...values,
      task: "legacy-snapshot",
      provider: "legacy_snapshot",
      timeframe: "1d",
      status: "running",
    })
    .onConflictDoNothing({ target: ingestionRuns.dedupeKey })
    .returning({ runId: ingestionRuns.runId });
  if (created) return created;

  const staleBefore = new Date(Date.now() - STALE_IMPORT_AFTER_MS);
  const [reclaimed] = await database
    .update(ingestionRuns)
    .set({
      status: "running",
      requestedCount: 0,
      acceptedCount: 0,
      rejectedCount: 0,
      coverageRatio: null,
      errorSummary: [],
      cursorFrom: values.cursorFrom,
      cursorTo: values.cursorTo,
      startedAt: new Date(),
      finishedAt: null,
    })
    .where(
      and(
        eq(ingestionRuns.dedupeKey, values.dedupeKey),
        or(
          eq(ingestionRuns.status, "failed"),
          and(
            eq(ingestionRuns.status, "running"),
            lt(ingestionRuns.startedAt, staleBefore),
          ),
        ),
      ),
    )
    .returning({ runId: ingestionRuns.runId });
  return reclaimed ?? null;
}

async function importSnapshot<TResult extends PgQueryResultHKT>(
  database: ImportDatabase<TResult>,
  file: string,
  snapshot: DailySnapshot,
): Promise<LegacyImportFileResult> {
  const generatedAt = new Date(snapshot.generatedAt);
  const dedupeKey = `legacy-snapshot:${snapshot.date}:${generatedAt.toISOString()}`;
  const { rows, errors, requestedCount } = uniqueAssets(snapshot);
  const cursorFrom = new Date(
    generatedAt.getTime() - 24 * 60 * 60 * 1_000,
  );
  const run = await claimImportRun(database, {
    dedupeKey,
    cursorFrom,
    cursorTo: generatedAt,
  });

  if (!run) {
    return {
      file,
      status: "skipped_duplicate",
      requestedCount: 0,
      acceptedCount: 0,
      rejectedCount: 0,
      errors: [],
    };
  }

  const validRows: Array<{
    assetId: string;
    coin: CoinSnapshot & {
      open: number;
      high: number;
      low: number;
      close: number;
    };
  }> = [];
  for (const { assetId, coin } of rows) {
    if (hasValidOhlc(coin)) {
      validRows.push({ assetId, coin });
    } else {
      errors.push({
        assetId,
        code: "invalid_legacy_ohlc",
        message: "Legacy row does not contain a valid positive OHLC window.",
      });
    }
  }
  const acceptedCount = validRows.length;
  const rejectedCount = Math.max(0, requestedCount - acceptedCount);

  try {
    const status =
      acceptedCount === 0 && requestedCount > 0
        ? "failed"
        : rejectedCount > 0
          ? "partial"
          : "success";
    await database.transaction(async (transaction) => {
      if (validRows.length > 0) {
        await transaction
          .insert(marketCandles)
          .values(
            validRows.map(({ assetId, coin }) => ({
              assetId,
              provider: "legacy_snapshot" as const,
              timeframe: "1d" as const,
              openTime: cursorFrom,
              closeTime: generatedAt,
              open: coin.open,
              high: coin.high,
              low: coin.low,
              close: coin.close,
              volumeQuote: coin.volume24h ?? null,
              isComplete: false,
              fetchedAt: generatedAt,
              quality: {
                quality: "legacy_snapshot",
                sourceSnapshot: file,
                window: "rolling_24h",
                notForBacktest: true,
              },
            })),
          )
          .onConflictDoNothing();

        await transaction
          .insert(marketQuotesLatest)
          .values(
            validRows.map(({ assetId, coin }) => ({
              assetId,
              provider: "legacy_snapshot" as const,
              instrumentId: assetId,
              last: coin.close,
              open24h: coin.open,
              high24h: coin.high,
              low24h: coin.low,
              volumeQuote24h: coin.volume24h ?? null,
              observedAt: generatedAt,
              fetchedAt: generatedAt,
              fallbackUsed: true,
              quality: {
                quality: "legacy_snapshot",
                sourceSnapshot: file,
                notForBacktest: true,
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
              volumeQuote24h: sql`excluded.volume_quote_24h`,
              observedAt: sql`excluded.observed_at`,
              fetchedAt: sql`excluded.fetched_at`,
              fallbackUsed: sql`excluded.fallback_used`,
              quality: sql`excluded.quality`,
            },
            setWhere: sql`${marketQuotesLatest.observedAt} <= excluded.observed_at`,
          });

        const capRows = validRows.flatMap(({ assetId, coin }) =>
          coin.marketCap != null &&
          Number.isFinite(coin.marketCap) &&
          coin.marketCap >= 0
            ? [
                {
                  assetId,
                  provider: "legacy_snapshot" as const,
                  observedAt: generatedAt,
                  marketCapUsd: coin.marketCap,
                  fetchedAt: generatedAt,
                  quality: {
                    quality: "legacy_snapshot",
                    sourceSnapshot: file,
                  },
                },
              ]
            : [],
        );
        if (capRows.length > 0) {
          await transaction
            .insert(marketCaps)
            .values(capRows)
            .onConflictDoNothing();
        }
      }

      await transaction
        .update(ingestionRuns)
        .set({
          status,
          requestedCount,
          acceptedCount,
          rejectedCount,
          coverageRatio:
            requestedCount === 0 ? 1 : acceptedCount / requestedCount,
          errorSummary: errors.slice(0, 100),
          finishedAt: new Date(),
        })
        .where(eq(ingestionRuns.runId, run.runId));
    });
    return {
      file,
      status,
      requestedCount,
      acceptedCount,
      rejectedCount,
      errors: errors.slice(0, 100),
    };
  } catch (error) {
    errors.push({
      code: "legacy_import_error",
      message: safeMessage(error),
    });
    await database
      .update(ingestionRuns)
      .set({
        status: "failed",
        requestedCount,
        acceptedCount: 0,
        rejectedCount: requestedCount,
        coverageRatio: 0,
        errorSummary: errors.slice(0, 100),
        finishedAt: new Date(),
      })
      .where(eq(ingestionRuns.runId, run.runId));
    return {
      file,
      status: "failed",
      requestedCount,
      acceptedCount: 0,
      rejectedCount: requestedCount,
      errors: errors.slice(0, 100),
    };
  }
}

export async function importLegacySnapshots<
  TResult extends PgQueryResultHKT,
>(
  database: ImportDatabase<TResult>,
  snapshotsDirectory = path.join(process.cwd(), "data", "snapshots"),
): Promise<LegacyImportSummary> {
  const names = (await fs.readdir(snapshotsDirectory))
    .filter((name) => name.endsWith(".json"))
    .sort();
  const parsed: Array<{ file: string; snapshot: DailySnapshot }> = [];
  const results: LegacyImportFileResult[] = [];

  for (const name of names) {
    try {
      const content = await fs.readFile(
        path.join(snapshotsDirectory, name),
        "utf8",
      );
      parsed.push({
        file: name,
        snapshot: parseDailySnapshot(JSON.parse(content) as unknown),
      });
    } catch (error) {
      results.push({
        file: name,
        status: "failed",
        requestedCount: 0,
        acceptedCount: 0,
        rejectedCount: 0,
        errors: [
          {
            code: "invalid_legacy_snapshot",
            message: safeMessage(error),
          },
        ],
      });
    }
  }

  parsed.sort(
    (left, right) =>
      Date.parse(left.snapshot.generatedAt) -
      Date.parse(right.snapshot.generatedAt),
  );
  for (const item of parsed) {
    results.push(
      await importSnapshot(database, item.file, item.snapshot),
    );
  }

  return {
    files: results,
    importedFiles: results.filter(
      (result) =>
        result.status === "success" || result.status === "partial",
    ).length,
    skippedFiles: results.filter(
      (result) => result.status === "skipped_duplicate",
    ).length,
    failedFiles: results.filter((result) => result.status === "failed").length,
    acceptedAssets: results.reduce(
      (sum, result) => sum + result.acceptedCount,
      0,
    ),
    rejectedAssets: results.reduce(
      (sum, result) => sum + result.rejectedCount,
      0,
    ),
  };
}
