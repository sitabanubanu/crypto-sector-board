import {
  assetRegistry,
  buildAssetAliasRows,
  buildProviderInstrumentRows,
} from "../lib/market-data/registry";
import {
  assertCompleteSectorCoverage,
  getCanonicalAssetIds,
  sectorCatalog,
} from "../lib/market-data/sector-catalog";

const EXPECTED_ASSET_COUNT = 67;
const SPECIAL_ASSET_IDS = [
  "the-open-network",
  "maker",
  "aster-2",
  "pi-network",
] as const;

assertCompleteSectorCoverage(EXPECTED_ASSET_COUNT);

if (assetRegistry.assets.length !== EXPECTED_ASSET_COUNT) {
  throw new Error(
    `Expected ${EXPECTED_ASSET_COUNT} assets, found ${assetRegistry.assets.length}.`,
  );
}

const providerRows = buildProviderInstrumentRows();
if (providerRows.length !== EXPECTED_ASSET_COUNT * 3) {
  throw new Error(
    `Expected ${EXPECTED_ASSET_COUNT * 3} provider states, found ${providerRows.length}.`,
  );
}

for (const assetId of SPECIAL_ASSET_IDS) {
  const asset = assetRegistry.assets.find(
    (candidate) => candidate.assetId === assetId,
  );
  if (!asset?.mappingNote) {
    throw new Error(`${assetId} requires an explicit mapping explanation.`);
  }
}

console.log(
  JSON.stringify(
    {
      registryVersion: assetRegistry.version,
      assets: assetRegistry.assets.length,
      aliases: buildAssetAliasRows().length,
      providerStates: providerRows.length,
      sectors: sectorCatalog.sectors.length,
      coveredAssets: getCanonicalAssetIds().length,
      verifiedAt: assetRegistry.lastVerifiedAt,
    },
    null,
    2,
  ),
);
