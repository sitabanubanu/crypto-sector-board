import type {
  CustomSectorConfig,
  DailySnapshot,
  WatchlistConfig,
} from "./types";
import {
  getAssetIdByProviderInstrument,
  resolveAssetId,
} from "./market-data/registry";

export const WATCHLIST_STORAGE_KEY = "crypto-watchlist";
export const WATCHLIST_SCHEMA_VERSION = 3;
const SUPPORTED_LEGACY_VERSIONS = new Set([1, 2]);

function isClient(): boolean {
  return typeof window !== "undefined";
}

function defaultWatchlist(sectorIds: string[]): WatchlistConfig {
  return {
    version: WATCHLIST_SCHEMA_VERSION,
    sectors: Object.fromEntries(
      sectorIds.map((id) => [id, { enabled: true }]),
    ),
    customSectors: [],
  };
}

function normalizeCustomSectors(value: unknown): CustomSectorConfig[] {
  if (!Array.isArray(value)) return [];
  const result: CustomSectorConfig[] = [];
  const seenIds = new Set<string>();

  for (const candidate of value) {
    if (
      typeof candidate !== "object" ||
      candidate == null ||
      !("id" in candidate) ||
      !("name" in candidate) ||
      !("coins" in candidate) ||
      typeof candidate.id !== "string" ||
      typeof candidate.name !== "string" ||
      !Array.isArray(candidate.coins) ||
      candidate.coins.some((coin: unknown) => typeof coin !== "string")
    ) {
      continue;
    }

    const rawCoins = candidate.coins as unknown[];
    const id = candidate.id.trim();
    const name = candidate.name.trim();
    const coins = [...new Set(
      rawCoins.flatMap((coin) => {
        if (typeof coin !== "string") return [];
        const normalized = coin.trim();
        const direct = resolveAssetId(normalized);
        if (direct) return [direct];

        const upper = normalized.toUpperCase();
        const gateAsset = getAssetIdByProviderInstrument(
          "gate",
          upper.replace(/-/g, "_"),
        );
        if (gateAsset) return [gateAsset];
        const okxAsset = getAssetIdByProviderInstrument(
          "okx",
          upper.replace(/_/g, "-"),
        );
        return okxAsset ? [okxAsset] : [];
      }),
    )];
    if (!id.startsWith("custom-") || !name || coins.length === 0 || seenIds.has(id)) {
      continue;
    }
    seenIds.add(id);
    result.push({ id, name, coins });
  }
  return result;
}

export function parseWatchlistConfig(
  input: unknown,
  sectorIds: string[],
): WatchlistConfig {
  const fallback = defaultWatchlist(sectorIds);
  if (typeof input !== "object" || input == null) return fallback;

  const record = input as {
    version?: unknown;
    sectors?: unknown;
    customSectors?: unknown;
  };
  if (
    record.version !== undefined &&
    record.version !== WATCHLIST_SCHEMA_VERSION &&
    !(
      typeof record.version === "number" &&
      SUPPORTED_LEGACY_VERSIONS.has(record.version)
    )
  ) {
    return fallback;
  }
  const storedSectors =
    typeof record.sectors === "object" && record.sectors != null
      ? (record.sectors as Record<string, unknown>)
      : {};
  const customSectors = normalizeCustomSectors(record.customSectors);
  const sectors: WatchlistConfig["sectors"] = {};

  for (const id of sectorIds) {
    const stored = storedSectors[id];
    sectors[id] = {
      enabled:
        typeof stored === "object" &&
        stored != null &&
        "enabled" in stored &&
        typeof stored.enabled === "boolean"
          ? stored.enabled
          : true,
    };
  }

  for (const customSector of customSectors) {
    const stored = storedSectors[customSector.id];
    sectors[customSector.id] = {
      enabled:
        typeof stored === "object" &&
        stored != null &&
        "enabled" in stored &&
        typeof stored.enabled === "boolean"
          ? stored.enabled
          : true,
    };
  }

  return {
    version: WATCHLIST_SCHEMA_VERSION,
    sectors,
    customSectors,
  };
}

export function loadWatchlist(sectorIds: string[]): WatchlistConfig {
  if (!isClient()) return defaultWatchlist(sectorIds);
  try {
    const raw = localStorage.getItem(WATCHLIST_STORAGE_KEY);
    if (!raw) return defaultWatchlist(sectorIds);
    return parseWatchlistConfig(JSON.parse(raw), sectorIds);
  } catch {
    return defaultWatchlist(sectorIds);
  }
}

export function saveWatchlist(config: WatchlistConfig): void {
  if (!isClient()) return;
  try {
    localStorage.setItem(
      WATCHLIST_STORAGE_KEY,
      JSON.stringify({ ...config, version: WATCHLIST_SCHEMA_VERSION }),
    );
  } catch {
    // Storage can be unavailable or full; the in-memory state still works.
  }
}

export function resetWatchlist(sectorIds: string[]): WatchlistConfig {
  return defaultWatchlist(sectorIds);
}

export function toggleSector(
  config: WatchlistConfig,
  sectorId: string,
): WatchlistConfig {
  if (!(sectorId in config.sectors)) return config;
  const next: WatchlistConfig = {
    ...config,
    version: WATCHLIST_SCHEMA_VERSION,
    sectors: {
      ...config.sectors,
      [sectorId]: {
        enabled: !(config.sectors[sectorId]?.enabled ?? true),
      },
    },
    customSectors: [...config.customSectors],
  };
  return next;
}

export function filterSnapshotByWatchlist(
  snapshot: DailySnapshot,
  config: WatchlistConfig,
): DailySnapshot {
  return {
    ...snapshot,
    sectors: snapshot.sectors.filter(
      (sector) => config.sectors[sector.id]?.enabled !== false,
    ),
  };
}

function createCustomSectorId(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return `custom-${crypto.randomUUID()}`;
  }
  return `custom-${Date.now()}`;
}

function normalizeCustomSectorInput(
  name: string,
  coins: string[],
): { name: string; coins: string[] } | null {
  const normalizedName = name.trim();
  const normalizedCoins = [
    ...new Set(
      coins
        .map((coin) => resolveAssetId(coin))
        .filter((coin): coin is string => coin != null),
    ),
  ];
  if (!normalizedName || normalizedCoins.length === 0) return null;
  return { name: normalizedName, coins: normalizedCoins };
}

export function addCustomSector(
  config: WatchlistConfig,
  name: string,
  coins: string[],
): WatchlistConfig {
  const normalized = normalizeCustomSectorInput(name, coins);
  if (!normalized) return config;
  const id = createCustomSectorId();
  const next: WatchlistConfig = {
    ...config,
    version: WATCHLIST_SCHEMA_VERSION,
    sectors: { ...config.sectors, [id]: { enabled: true } },
    customSectors: [
      ...config.customSectors,
      { id, ...normalized },
    ],
  };
  return next;
}

export function updateCustomSector(
  config: WatchlistConfig,
  id: string,
  name: string,
  coins: string[],
): WatchlistConfig {
  const normalized = normalizeCustomSectorInput(name, coins);
  if (
    !normalized ||
    !config.customSectors.some((sector) => sector.id === id)
  ) {
    return config;
  }
  const next: WatchlistConfig = {
    ...config,
    version: WATCHLIST_SCHEMA_VERSION,
    customSectors: config.customSectors.map((sector) =>
      sector.id === id
        ? { ...sector, ...normalized }
        : sector,
    ),
  };
  return next;
}

export function deleteCustomSector(
  config: WatchlistConfig,
  id: string,
): WatchlistConfig {
  if (!config.customSectors.some((sector) => sector.id === id)) return config;
  const sectors = { ...config.sectors };
  delete sectors[id];
  const next: WatchlistConfig = {
    ...config,
    version: WATCHLIST_SCHEMA_VERSION,
    sectors,
    customSectors: config.customSectors.filter((sector) => sector.id !== id),
  };
  return next;
}
