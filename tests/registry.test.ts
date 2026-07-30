import { describe, expect, it } from "vitest";
import {
  assetRegistry,
  buildAssetAliasRows,
  buildProviderInstrumentRows,
  createProviderInstrumentMap,
  getActiveProviderInstrument,
  getAssetIdByProviderInstrument,
  resolveAssetId,
} from "../lib/market-data/registry";
import {
  assertCompleteSectorCoverage,
  getCanonicalAssetIds,
  sectorCatalog,
} from "../lib/market-data/sector-catalog";
import { auditProviderMappings } from "../lib/market-data/mapping-audit";

describe("canonical asset registry", () => {
  it("covers all 56 configured assets with three explicit provider states", () => {
    assertCompleteSectorCoverage(56);
    expect(assetRegistry.assets).toHaveLength(56);
    expect(getCanonicalAssetIds()).toHaveLength(56);
    expect(buildProviderInstrumentRows()).toHaveLength(168);
    expect(sectorCatalog.sectors).toHaveLength(14);

    for (const asset of assetRegistry.assets) {
      expect(Object.keys(asset.providers).sort()).toEqual([
        "coingecko",
        "gate",
        "okx",
      ]);
      expect(asset.providers[asset.primaryProvider].status).toBe("active");
    }
  });

  it("keeps aliases unique and resolves them to canonical IDs", () => {
    const aliases = buildAssetAliasRows();
    expect(new Set(aliases.map((alias) => alias.alias)).size).toBe(
      aliases.length,
    );
    expect(resolveAssetId(" TONCOIN ")).toBe("the-open-network");
    expect(resolveAssetId("aster")).toBe("aster-2");
    expect(resolveAssetId("pi")).toBe("pi-network");
    expect(resolveAssetId("bitcoin")).toBe("bitcoin");
    expect(resolveAssetId("not-registered")).toBeNull();
  });

  it("makes TON/GRAM, MKR/SKY, ASTER and PI decisions explicit", () => {
    expect(
      getActiveProviderInstrument("the-open-network", "gate"),
    ).toBe("GRAM_USDT");
    expect(
      getActiveProviderInstrument("the-open-network", "okx"),
    ).toBe("GRAM-USDT");
    expect(getActiveProviderInstrument("maker", "gate")).toBeNull();
    expect(getActiveProviderInstrument("maker", "okx")).toBeNull();
    expect(getActiveProviderInstrument("aster-2", "gate")).toBe(
      "ASTER_USDT",
    );
    expect(getActiveProviderInstrument("pi-network", "okx")).toBe(
      "PI-USDT",
    );

    for (const assetId of [
      "the-open-network",
      "maker",
      "aster-2",
      "pi-network",
    ]) {
      expect(
        assetRegistry.assets.find((asset) => asset.assetId === assetId)
          ?.mappingNote,
      ).toBeTruthy();
    }
  });

  it("replaces the duplicated exchange maps without changing active behavior", () => {
    const gate = createProviderInstrumentMap("gate");
    const okx = createProviderInstrumentMap("okx");
    expect(Object.keys(gate)).toHaveLength(56);
    expect(gate.bitcoin).toBe("BTC_USDT");
    expect(okx.bitcoin).toBe("BTC-USDT");
    expect(gate.maker).toBeNull();
    expect(okx.monero).toBeNull();
    expect(okx.mantle).toBeNull();
    expect(okx.helium).toBeNull();
    expect(getAssetIdByProviderInstrument("gate", "BTC_USDT")).toBe(
      "bitcoin",
    );
  });

  it("flags a missing active mapping and suggests a symbol-matched rename", () => {
    const report = auditProviderMappings(
      [
        {
          provider: "gate",
          instrumentId: "BTC_NEW_USDT",
          baseSymbol: "BTC",
          quoteSymbol: "USDT",
          status: "active",
        },
      ],
      ["gate"],
    );
    expect(
      report.errors.some(
        (issue) =>
          issue.code === "ACTIVE_INSTRUMENT_MISSING" &&
          issue.assetId === "bitcoin",
      ),
    ).toBe(true);
    expect(
      report.warnings.some(
        (issue) =>
          issue.code === "POSSIBLE_NEW_INSTRUMENT" &&
          issue.assetId === "bitcoin",
      ),
    ).toBe(true);
  });
});
