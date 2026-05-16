import type { DailySnapshot, WatchlistConfig, CustomSectorConfig } from "./types";

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
    // Restore custom sectors
    if (Array.isArray(parsed.customSectors)) {
      config.customSectors = parsed.customSectors;
      // Also restore toggle states for custom sector IDs
      for (const cs of config.customSectors!) {
        if (!config.sectors[cs.id]) {
          config.sectors[cs.id] = {
            enabled: parsed.sectors?.[cs.id]?.enabled ?? true,
          };
        }
      }
    } else {
      config.customSectors = [];
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
  config.customSectors = [];
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

// --- Custom sector CRUD ---

export function addCustomSector(
  config: WatchlistConfig,
  name: string,
  coins: string[],
): WatchlistConfig {
  const id = `custom-${Date.now()}`;
  const next: WatchlistConfig = {
    sectors: { ...config.sectors, [id]: { enabled: true } },
    customSectors: [...(config.customSectors ?? []), { id, name, coins }],
  };
  saveWatchlist(next);
  return next;
}

export function updateCustomSector(
  config: WatchlistConfig,
  id: string,
  name: string,
  coins: string[],
): WatchlistConfig {
  const next: WatchlistConfig = {
    ...config,
    customSectors: (config.customSectors ?? []).map((cs) =>
      cs.id === id ? { ...cs, name, coins } : cs,
    ),
  };
  saveWatchlist(next);
  return next;
}

export function deleteCustomSector(config: WatchlistConfig, id: string): WatchlistConfig {
  const nextSectors = { ...config.sectors };
  delete nextSectors[id];
  const next: WatchlistConfig = {
    sectors: nextSectors,
    customSectors: (config.customSectors ?? []).filter((cs) => cs.id !== id),
  };
  saveWatchlist(next);
  return next;
}
