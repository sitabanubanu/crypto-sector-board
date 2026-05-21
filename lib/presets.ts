import type { WatchlistConfig } from "./types";

export interface Preset {
  id: string;
  name: string;
  description: string;
  sectorIds: string[];
}

export const PRESETS: Preset[] = [
  {
    id: "all",
    name: "全板块",
    description: "所有 14 个板块",
    sectorIds: [],
  },
  {
    id: "l1l2",
    name: "主流链",
    description: "L1 / L2 / BTC 生态",
    sectorIds: ["btc", "l1", "l2", "btc-eco"],
  },
  {
    id: "aggressive",
    name: "激进",
    description: "DeFi / 衍生品 / AI / Meme",
    sectorIds: ["defi", "dex-perp", "ai", "meme"],
  },
  {
    id: "defensive",
    name: "防御",
    description: "BTC / PoW / RWA / 隐私",
    sectorIds: ["btc", "pow", "rwa", "privacy"],
  },
  {
    id: "infra",
    name: "基建",
    description: "基础设施 / DePIN / AI",
    sectorIds: ["infra", "depin", "ai", "l2"],
  },
];

export function applyPreset(
  config: WatchlistConfig,
  preset: Preset,
  allSectorIds: string[],
): WatchlistConfig {
  if (preset.id === "all") {
    // Enable all built-in sectors
    const sectors: Record<string, { enabled: boolean }> = {};
    for (const id of allSectorIds) {
      sectors[id] = { enabled: true };
    }
    return { ...config, sectors };
  }

  const sectors: Record<string, { enabled: boolean }> = {};
  for (const id of allSectorIds) {
    sectors[id] = { enabled: preset.sectorIds.includes(id) };
  }
  return { ...config, sectors };
}
