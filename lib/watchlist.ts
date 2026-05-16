import type { DailySnapshot, WatchlistConfig } from "./types";

const STORAGE_KEY = "crypto-watchlist";

function isClient(): boolean {
  return typeof window !== "undefined";
}

export function loadWatchlist(sectorIds: string[]): WatchlistConfig {
  if (!isClient()) {
    return { sectors: Object.fromEntries(sectorIds.map((id) => [id, { enabled: true }])) };
  }
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return defaultWatchlist(sectorIds);
    const parsed = JSON.parse(raw);
    const config: WatchlistConfig = { sectors: {} };
    for (const id of sectorIds) {
      config.sectors[id] = {
        enabled: parsed.sectors?.[id]?.enabled ?? true,
      };
    }
    return config;
  } catch {
    return defaultWatchlist(sectorIds);
  }
}

export function saveWatchlist(config: WatchlistConfig): void {
  if (!isClient()) return;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(config));
  } catch { /* quota exceeded — silently ignore */ }
}

export function resetWatchlist(sectorIds: string[]): WatchlistConfig {
  const config = defaultWatchlist(sectorIds);
  saveWatchlist(config);
  return config;
}

export function toggleSector(config: WatchlistConfig, sectorId: string): WatchlistConfig {
  const next: WatchlistConfig = {
    sectors: {
      ...config.sectors,
      [sectorId]: { enabled: !config.sectors[sectorId]?.enabled },
    },
  };
  saveWatchlist(next);
  return next;
}

function defaultWatchlist(sectorIds: string[]): WatchlistConfig {
  return {
    sectors: Object.fromEntries(sectorIds.map((id) => [id, { enabled: true }])),
  };
}

export function filterSnapshotByWatchlist(
  snapshot: DailySnapshot,
  config: WatchlistConfig,
): DailySnapshot {
  return {
    ...snapshot,
    sectors: snapshot.sectors.filter((s) => config.sectors[s.id]?.enabled !== false),
  };
}
