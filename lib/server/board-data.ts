import "server-only";

import { unstable_cache } from "next/cache";
import { getDatabase } from "@/lib/db/client";
import { queryDatabaseBoardInput } from "@/lib/db/queries/market-board";
import {
  BoardResponseSchema,
  type BoardResponse,
  type DataBackend,
  type PublicAsset,
} from "@/lib/market-data/bff-contracts";
import { buildDatabaseBoardSnapshot } from "@/lib/market-data/board-aggregate";
import { compareBoardSnapshots } from "@/lib/market-data/board-comparison";
import { createDataQuality, type DataQuality } from "@/lib/market-data/contracts";
import { assetRegistry } from "@/lib/market-data/registry";
import { sectorCatalog } from "@/lib/market-data/sector-catalog";
import { loadLatestSnapshot } from "@/lib/snapshot";
import type { DailySnapshot } from "@/lib/types";
import { resolveDataBackend, resolveDualRead } from "./data-backend";

const BOARD_STALE_AFTER_SECONDS = 2 * 60 * 60;

interface BoardPayload {
  snapshot: DailySnapshot;
  assets: PublicAsset[];
  holdings: string[];
}

function publicAssets(): PublicAsset[] {
  return assetRegistry.assets
    .filter((asset) => asset.status !== "inactive")
    .map((asset) => ({
      assetId: asset.assetId,
      symbol: asset.symbol,
      name: asset.name,
    }))
    .sort((left, right) => left.symbol.localeCompare(right.symbol));
}

function snapshotQuality(snapshot: DailySnapshot): DataQuality {
  if (snapshot.dataQuality) return snapshot.dataQuality;

  const tracked = new Set(
    snapshot.sectors.flatMap((sector) =>
      sector.coins.map((coin) => coin.id),
    ),
  );
  const expected = publicAssets().map((asset) => asset.assetId);
  const missingAssets = expected.filter((assetId) => !tracked.has(assetId));
  const asOf = snapshot.generatedAt;
  const isStale =
    Date.now() - Date.parse(asOf) > BOARD_STALE_AFTER_SECONDS * 1_000;

  return createDataQuality({
    asOf,
    generatedAt: snapshot.generatedAt,
    sources: ["snapshot"],
    fallbackAssets: [],
    missingAssets,
    coverageRatio:
      expected.length === 0
        ? 0
        : (expected.length - missingAssets.length) / expected.length,
    isStale,
    staleAfterSeconds: BOARD_STALE_AFTER_SECONDS,
    sourceAsOf: { snapshot: asOf },
    staleSources: isStale ? ["snapshot"] : [],
  });
}

async function loadDatabaseBoardPayload(): Promise<BoardPayload> {
  const now = new Date();
  const rows = await queryDatabaseBoardInput(getDatabase(), now);
  const snapshot = buildDatabaseBoardSnapshot({
    ...rows,
    now,
    mainStreamThreshold: sectorCatalog.mainStreamThreshold,
    staleAfterSeconds: BOARD_STALE_AFTER_SECONDS,
  });
  return {
    snapshot,
    assets: rows.assets
      .map((asset) => ({
        assetId: asset.assetId,
        symbol: asset.symbol,
        name: asset.name,
      }))
      .sort((left, right) => left.symbol.localeCompare(right.symbol)),
    holdings: [...(sectorCatalog.holdings ?? [])],
  };
}

const getCachedDatabaseBoardPayload = unstable_cache(
  loadDatabaseBoardPayload,
  ["p4-database-board-v1"],
  {
    revalidate: 30,
    tags: ["market-board"],
  },
);

function loadJsonBoardPayload(): BoardPayload {
  const snapshot = loadLatestSnapshot();
  if (!snapshot) {
    throw new Error("No valid JSON snapshot is available.");
  }
  return {
    snapshot,
    assets: publicAssets(),
    holdings: [...(sectorCatalog.holdings ?? [])],
  };
}

function responseFromPayload(
  payload: BoardPayload,
  backend: DataBackend,
  dualRead: boolean,
  comparison?: BoardResponse["meta"]["comparison"],
): BoardResponse {
  const quality = snapshotQuality(payload.snapshot);
  return BoardResponseSchema.parse({
    data: payload,
    meta: {
      ...quality,
      backend,
      dualRead,
      ...(comparison ? { comparison } : {}),
    },
  });
}

export async function getBoardResponse(): Promise<BoardResponse> {
  const backend = resolveDataBackend();
  if (backend === "json") {
    return responseFromPayload(loadJsonBoardPayload(), "json", false);
  }

  const databasePayload = await getCachedDatabaseBoardPayload();
  if (!resolveDualRead(backend)) {
    return responseFromPayload(databasePayload, "database", false);
  }

  let jsonPayload: BoardPayload;
  try {
    jsonPayload = loadJsonBoardPayload();
  } catch (error) {
    console.warn(
      "JSON comparison snapshot is unavailable:",
      error instanceof Error ? error.message : "unknown error",
    );
    return responseFromPayload(databasePayload, "database", false);
  }
  const comparison = compareBoardSnapshots(
    databasePayload.snapshot,
    jsonPayload.snapshot,
  );
  return responseFromPayload(
    databasePayload,
    "database",
    true,
    comparison,
  );
}
