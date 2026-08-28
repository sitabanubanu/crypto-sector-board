import type { CoinSnapshot, SectorSnapshot } from "@/lib/types";

export type DetailSelection =
  | { kind: "sector"; sectorId: string }
  | { kind: "coin"; sectorId: string; coinId: string }
  | null;

export type ResolvedDetailSelection =
  | { kind: "sector"; sector: SectorSnapshot }
  | { kind: "coin"; sector: SectorSnapshot; coin: CoinSnapshot }
  | null;

/** Resolve a lightweight selection against the newest board snapshot. */
export function resolveDetailSelection(
  selection: DetailSelection,
  sectors: SectorSnapshot[],
): ResolvedDetailSelection {
  if (!selection) return null;

  const sector = sectors.find(
    (candidate) => candidate.id === selection.sectorId,
  );
  if (!sector) return null;

  if (selection.kind === "sector") {
    return { kind: "sector", sector };
  }

  const coin = sector.coins.find(
    (candidate) => candidate.id === selection.coinId,
  );
  return coin ? { kind: "coin", sector, coin } : null;
}
