import { z } from "zod";
import sectorsData from "@/data/sectors.json";
import { assetRegistry, getAssetDefinition } from "./registry";

const SectorIdSchema = z
  .string()
  .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/);
const AssetIdSchema = z
  .string()
  .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/);

export const CanonicalSectorSchema = z
  .object({
    id: SectorIdSchema,
    name: z.string().min(1),
    assetIds: z.array(AssetIdSchema).min(1),
  })
  .strict();

export const SectorCatalogSchema = z
  .object({
    version: z.literal(2),
    registryVersion: z.literal(1),
    lastUpdated: z.string().date(),
    effectiveFrom: z.string().date(),
    mainStreamThreshold: z.number().finite().nonnegative(),
    holdings: z.array(AssetIdSchema).optional(),
    sectors: z.array(CanonicalSectorSchema).min(1),
  })
  .strict()
  .superRefine((catalog, context) => {
    if (catalog.effectiveFrom > catalog.lastUpdated) {
      context.addIssue({
        code: "custom",
        path: ["effectiveFrom"],
        message: "effectiveFrom cannot be later than lastUpdated",
      });
    }

    const sectorIds = new Set<string>();
    catalog.sectors.forEach((sector, sectorIndex) => {
      if (sectorIds.has(sector.id)) {
        context.addIssue({
          code: "custom",
          path: ["sectors", sectorIndex, "id"],
          message: `Duplicate sector ID: ${sector.id}`,
        });
      }
      sectorIds.add(sector.id);

      const memberIds = new Set<string>();
      sector.assetIds.forEach((assetId, assetIndex) => {
        if (!getAssetDefinition(assetId)) {
          context.addIssue({
            code: "custom",
            path: ["sectors", sectorIndex, "assetIds", assetIndex],
            message: `Unknown canonical asset ID: ${assetId}`,
          });
        }
        if (memberIds.has(assetId)) {
          context.addIssue({
            code: "custom",
            path: ["sectors", sectorIndex, "assetIds", assetIndex],
            message: `Duplicate asset in sector: ${assetId}`,
          });
        }
        memberIds.add(assetId);
      });
    });

    catalog.holdings?.forEach((assetId, holdingIndex) => {
      if (!getAssetDefinition(assetId)) {
        context.addIssue({
          code: "custom",
          path: ["holdings", holdingIndex],
          message: `Unknown holding asset ID: ${assetId}`,
        });
      }
    });
  });

export type CanonicalSector = z.infer<typeof CanonicalSectorSchema>;
export type SectorCatalog = z.infer<typeof SectorCatalogSchema>;

export const sectorCatalog = SectorCatalogSchema.parse(sectorsData);

export function getCanonicalAssetIds(): string[] {
  return [...new Set(sectorCatalog.sectors.flatMap((sector) => sector.assetIds))];
}

export function getRuntimeSectorConfigs() {
  return sectorCatalog.sectors.map((sector) => ({
    id: sector.id,
    name: sector.name,
    coins: [...sector.assetIds],
  }));
}

export function getSectorSeedRows() {
  return sectorCatalog.sectors.map((sector, index) => ({
    sectorId: sector.id,
    name: sector.name,
    sortOrder: index,
    isActive: true,
  }));
}

export function getSectorMembershipSeedRows() {
  const effectiveFrom = new Date(
    `${sectorCatalog.effectiveFrom}T00:00:00.000Z`,
  );
  return sectorCatalog.sectors.flatMap((sector) =>
    sector.assetIds.map((assetId, index) => ({
      sectorId: sector.id,
      assetId,
      effectiveFrom,
      effectiveTo: null,
      sortOrder: index,
    })),
  );
}

export function assertCompleteSectorCoverage(
  expectedAssetCount = assetRegistry.assets.length,
): void {
  const configured = new Set(getCanonicalAssetIds());
  if (configured.size !== expectedAssetCount) {
    const missing = assetRegistry.assets
      .map((asset) => asset.assetId)
      .filter((assetId) => !configured.has(assetId));
    throw new Error(
      `Sector catalog covers ${configured.size}/${expectedAssetCount} assets; missing: ${missing.join(", ") || "none"}`,
    );
  }
}
