import { describe, expect, it } from "vitest";
import { assetRegistry } from "../lib/market-data/registry";
import { sectorCatalog } from "../lib/market-data/sector-catalog";
import {
  getAssetInsight,
  getSectorInsight,
  hasCuratedAssetInsight,
  sectorInsightsFile,
} from "../lib/market-insights";

const NEW_ASSET_IDS = [
  "internet-computer",
  "morpho",
  "polygon-ecosystem-token",
  "pancakeswap-token",
  "hedera-hashgraph",
  "cosmos",
  "injective-protocol",
  "quant-network",
  "algorand",
  "kaspa",
  "aerodrome-finance",
] as const;

describe("market insight registry", () => {
  it("covers every canonical sector and preserves the 67-asset catalog", () => {
    expect(sectorInsightsFile.sectors).toHaveLength(sectorCatalog.sectors.length);
    for (const sector of sectorCatalog.sectors) {
      const insight = getSectorInsight(sector.id);
      expect(insight.sectorId).toBe(sector.id);
      expect(insight.marketSize.sources.length).toBeGreaterThan(0);
    }
    expect(assetRegistry.assets).toHaveLength(67);
  });

  it("provides curated dossiers for all newly added priority assets", () => {
    for (const assetId of NEW_ASSET_IDS) {
      expect(hasCuratedAssetInsight(assetId)).toBe(true);
      const insight = getAssetInsight(assetId);
      expect(insight.assetId).toBe(assetId);
      expect(insight.sources.length).toBeGreaterThan(0);
      expect(insight.demandSignals.length).toBeGreaterThan(0);
    }
  });

  it("returns a safe fallback for future assets instead of throwing", () => {
    const insight = getAssetInsight("future-asset");
    expect(insight.assetId).toBe("future-asset");
    expect(insight.riskNotes.join(" ")).toContain("投资建议");
  });
});
