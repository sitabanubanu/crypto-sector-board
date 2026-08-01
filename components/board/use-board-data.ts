"use client";

import { useMemo } from "react";
import useSWR from "swr";
import {
  BoardResponseSchema,
  HistoryResponseSchema,
  type BoardResponse,
  type HistoryResponse,
} from "@/lib/market-data/bff-contracts";
import type { AssetHistoryMap } from "@/lib/sector-history";

export type BoardRefreshStatus =
  | "ready"
  | "refreshing"
  | "stale"
  | "error";

async function requestJson(url: string): Promise<unknown> {
  const response = await fetch(url, {
    credentials: "same-origin",
    headers: { Accept: "application/json" },
  });
  if (!response.ok) {
    throw new Error(`Market data request returned ${response.status}.`);
  }
  return response.json();
}

async function fetchBoard(url: string): Promise<BoardResponse> {
  return BoardResponseSchema.parse(await requestJson(url));
}

async function fetchHistory(url: string): Promise<HistoryResponse> {
  return HistoryResponseSchema.parse(await requestJson(url));
}

export function useBoardData(initialBoard: BoardResponse) {
  const boardRequest = useSWR<BoardResponse>(
    "/api/v1/board",
    fetchBoard,
    {
      fallbackData: initialBoard,
      refreshInterval: 30_000,
      dedupingInterval: 10_000,
      keepPreviousData: true,
      revalidateOnFocus: true,
      revalidateOnReconnect: true,
    },
  );
  const board = boardRequest.data ?? initialBoard;
  const historyUrl = useMemo(() => {
    if (board.meta.backend !== "database") return null;
    const assetIds = board.data.assets
      .map((asset) => asset.assetId)
      .sort()
      .join(",");
    const params = new URLSearchParams({ assetIds, days: "31" });
    return `/api/v1/history?${params.toString()}`;
  }, [board]);
  const historyRequest = useSWR<HistoryResponse>(
    historyUrl,
    fetchHistory,
    {
      refreshInterval: 5 * 60_000,
      dedupingInterval: 60_000,
      keepPreviousData: true,
      revalidateOnFocus: false,
    },
  );
  const historyByAssetId = useMemo<AssetHistoryMap>(() => {
    const result = new Map<
      string,
      Array<{ time: string; close: number | null }>
    >();
    for (const asset of historyRequest.data?.data.assets ?? []) {
      result.set(asset.assetId, asset.points);
    }
    return result;
  }, [historyRequest.data]);
  const closesByAssetId = useMemo(() => {
    const result = new Map<string, number[]>();
    for (const asset of historyRequest.data?.data.assets ?? []) {
      const closes = asset.points.flatMap((point) =>
        point.close == null ? [] : [point.close],
      );
      if (closes.length > 0) {
        result.set(asset.assetId, closes.reverse());
      }
    }
    return result;
  }, [historyRequest.data]);

  let status: BoardRefreshStatus = "ready";
  if (boardRequest.error) status = "error";
  else if (board.meta.isStale) status = "stale";
  else if (boardRequest.isValidating) status = "refreshing";

  return {
    board,
    closesByAssetId,
    historyByAssetId,
    historyQuality: historyRequest.data?.meta,
    status,
  };
}
