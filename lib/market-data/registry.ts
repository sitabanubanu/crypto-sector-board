import { z } from "zod";
import assetsData from "@/data/assets.json";
import type {
  NewAssetRow,
  NewProviderInstrumentRow,
} from "@/lib/db/schema";

export const RegistryProviderSchema = z.enum(["coingecko", "gate", "okx"]);
export const AssetStatusSchema = z.enum(["active", "migrating", "inactive"]);
export const InstrumentStatusSchema = z.enum([
  "active",
  "unavailable",
  "delisted",
  "migrating",
  "ambiguous",
]);
export const AssetAliasTypeSchema = z.enum([
  "legacy_asset_id",
  "provider_slug",
  "former_name",
]);

const AssetIdSchema = z
  .string()
  .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/);
const SymbolSchema = z.string().regex(/^[A-Z0-9.]+$/);
const TimestampSchema = z.string().datetime({ offset: true });

const AssetAliasSchema = z
  .object({
    value: AssetIdSchema,
    type: AssetAliasTypeSchema,
    note: z.string().min(1),
  })
  .strict();

const ProviderMappingSchema = z
  .object({
    status: InstrumentStatusSchema,
    instrumentId: z.string().min(1).nullable(),
    baseSymbol: SymbolSchema.optional(),
    quoteSymbol: SymbolSchema.nullable().optional(),
    priority: z.number().int().positive().optional(),
    firstSeenAt: TimestampSchema.optional(),
    lastVerifiedAt: TimestampSchema.optional(),
    delistedAt: TimestampSchema.optional(),
    mappingNote: z.string().min(1).optional(),
  })
  .strict()
  .superRefine((mapping, context) => {
    if (mapping.status === "active" && mapping.instrumentId == null) {
      context.addIssue({
        code: "custom",
        path: ["instrumentId"],
        message: "Active provider mappings require an instrumentId",
      });
    }
    if (mapping.status === "unavailable" && mapping.instrumentId != null) {
      context.addIssue({
        code: "custom",
        path: ["instrumentId"],
        message: "Unavailable provider mappings cannot declare an instrumentId",
      });
    }
    if (mapping.status !== "active" && !mapping.mappingNote) {
      context.addIssue({
        code: "custom",
        path: ["mappingNote"],
        message: "Non-active provider mappings require an explanation",
      });
    }
    if (mapping.status === "delisted" && !mapping.delistedAt) {
      context.addIssue({
        code: "custom",
        path: ["delistedAt"],
        message: "Delisted provider mappings require delistedAt",
      });
    }
  });

const AssetDefinitionSchema = z
  .object({
    assetId: AssetIdSchema,
    symbol: SymbolSchema,
    name: z.string().min(1),
    status: AssetStatusSchema,
    primaryProvider: RegistryProviderSchema,
    mappingNote: z.string().min(1).optional(),
    aliases: z.array(AssetAliasSchema),
    providers: z
      .object({
        coingecko: ProviderMappingSchema,
        gate: ProviderMappingSchema,
        okx: ProviderMappingSchema,
      })
      .strict(),
  })
  .strict()
  .superRefine((asset, context) => {
    if (asset.status === "migrating" && !asset.mappingNote) {
      context.addIssue({
        code: "custom",
        path: ["mappingNote"],
        message: "Migrating assets require a mappingNote",
      });
    }
    if (asset.providers[asset.primaryProvider].status !== "active") {
      context.addIssue({
        code: "custom",
        path: ["primaryProvider"],
        message: "The primary provider must have an active mapping",
      });
    }
    if (
      !Object.values(asset.providers).some(
        (mapping) => mapping.status === "active",
      )
    ) {
      context.addIssue({
        code: "custom",
        path: ["providers"],
        message: "Every tracked asset requires at least one active provider",
      });
    }
  });

export const AssetRegistrySchema = z
  .object({
    version: z.literal(1),
    namespace: z.literal("crypto-sector-board"),
    firstSeenAt: TimestampSchema,
    lastVerifiedAt: TimestampSchema,
    assets: z.array(AssetDefinitionSchema).min(1),
  })
  .strict()
  .superRefine((registry, context) => {
    if (
      Date.parse(registry.lastVerifiedAt) < Date.parse(registry.firstSeenAt)
    ) {
      context.addIssue({
        code: "custom",
        path: ["lastVerifiedAt"],
        message: "lastVerifiedAt cannot precede firstSeenAt",
      });
    }

    const assetIds = new Set<string>();
    const aliases = new Set<string>();
    const providerInstruments = new Set<string>();

    registry.assets.forEach((asset, assetIndex) => {
      if (assetIds.has(asset.assetId)) {
        context.addIssue({
          code: "custom",
          path: ["assets", assetIndex, "assetId"],
          message: `Duplicate assetId: ${asset.assetId}`,
        });
      }
      assetIds.add(asset.assetId);

      asset.aliases.forEach((alias, aliasIndex) => {
        if (aliases.has(alias.value)) {
          context.addIssue({
            code: "custom",
            path: ["assets", assetIndex, "aliases", aliasIndex, "value"],
            message: `Duplicate asset alias: ${alias.value}`,
          });
        }
        aliases.add(alias.value);
      });

      for (const [provider, mapping] of Object.entries(asset.providers)) {
        if (mapping.instrumentId == null) continue;
        const key = `${provider}:${mapping.instrumentId}`;
        if (providerInstruments.has(key)) {
          context.addIssue({
            code: "custom",
            path: ["assets", assetIndex, "providers", provider, "instrumentId"],
            message: `Provider instrument is already assigned: ${key}`,
          });
        }
        providerInstruments.add(key);
      }
    });

    registry.assets.forEach((asset, assetIndex) => {
      asset.aliases.forEach((alias, aliasIndex) => {
        if (assetIds.has(alias.value)) {
          context.addIssue({
            code: "custom",
            path: ["assets", assetIndex, "aliases", aliasIndex, "value"],
            message: `Alias collides with an assetId: ${alias.value}`,
          });
        }
      });
    });
  });

export type RegistryProvider = z.infer<typeof RegistryProviderSchema>;
export type AssetDefinition = z.infer<typeof AssetDefinitionSchema>;
export type ProviderMapping = z.infer<typeof ProviderMappingSchema>;
export type AssetRegistry = z.infer<typeof AssetRegistrySchema>;

export const REGISTRY_PROVIDERS = [
  "coingecko",
  "gate",
  "okx",
] as const satisfies readonly RegistryProvider[];

export const assetRegistry = AssetRegistrySchema.parse(assetsData);

const assetsById = new Map(
  assetRegistry.assets.map((asset) => [asset.assetId, asset]),
);
const aliasesToAssetId = new Map(
  assetRegistry.assets.flatMap((asset) =>
    asset.aliases.map((alias) => [alias.value, asset.assetId] as const),
  ),
);
const assetIdsByProviderInstrument = new Map(
  assetRegistry.assets.flatMap((asset) =>
    REGISTRY_PROVIDERS.flatMap((provider) => {
      const instrumentId = asset.providers[provider].instrumentId;
      return instrumentId
        ? [[`${provider}:${instrumentId}`, asset.assetId] as const]
        : [];
    }),
  ),
);

function deriveSymbols(
  asset: AssetDefinition,
  provider: RegistryProvider,
  mapping: ProviderMapping,
): { baseSymbol: string; quoteSymbol: string | null } {
  if (provider === "coingecko") {
    return {
      baseSymbol: mapping.baseSymbol ?? asset.symbol,
      quoteSymbol: mapping.quoteSymbol ?? null,
    };
  }

  const separator = provider === "gate" ? "_" : "-";
  const parts = mapping.instrumentId?.split(separator) ?? [];
  return {
    baseSymbol: mapping.baseSymbol ?? parts[0] ?? asset.symbol,
    quoteSymbol: mapping.quoteSymbol ?? parts[1] ?? "USDT",
  };
}

function getDefaultPriority(provider: RegistryProvider): number {
  if (provider === "gate") return 10;
  if (provider === "okx") return 20;
  return 30;
}

function getCapabilities(provider: RegistryProvider) {
  return provider === "coingecko"
    ? {
        supportsQuotes: true,
        supportsCandles: false,
        supportsMarketCap: true,
      }
    : {
        supportsQuotes: true,
        supportsCandles: true,
        supportsMarketCap: false,
      };
}

export function getAssetDefinition(
  assetId: string,
): AssetDefinition | undefined {
  return assetsById.get(assetId);
}

export function resolveAssetId(value: string): string | null {
  const normalized = value.trim().toLowerCase();
  if (assetsById.has(normalized)) return normalized;
  return aliasesToAssetId.get(normalized) ?? null;
}

export function getProviderMapping(
  assetId: string,
  provider: RegistryProvider,
): ProviderMapping | undefined {
  return assetsById.get(assetId)?.providers[provider];
}

export function getActiveProviderInstrument(
  assetId: string,
  provider: RegistryProvider,
): string | null {
  const mapping = getProviderMapping(assetId, provider);
  return mapping?.status === "active" ? mapping.instrumentId : null;
}

export function getAssetIdByProviderInstrument(
  provider: RegistryProvider,
  instrumentId: string,
): string | null {
  return (
    assetIdsByProviderInstrument.get(`${provider}:${instrumentId}`) ?? null
  );
}

export function createProviderInstrumentMap(
  provider: RegistryProvider,
): Record<string, string | null> {
  return Object.fromEntries(
    assetRegistry.assets.map((asset) => [
      asset.assetId,
      getActiveProviderInstrument(asset.assetId, provider),
    ]),
  );
}

export function getActiveProviderInstrumentIds(
  provider: RegistryProvider,
): string[] {
  return assetRegistry.assets.flatMap((asset) => {
    const instrumentId = getActiveProviderInstrument(asset.assetId, provider);
    return instrumentId ? [instrumentId] : [];
  });
}

export function buildAssetRows(): NewAssetRow[] {
  return assetRegistry.assets.map((asset) => ({
    assetId: asset.assetId,
    symbol: asset.symbol,
    name: asset.name,
    status: asset.status,
    primaryProvider: asset.primaryProvider,
    mappingNote: asset.mappingNote ?? null,
    updatedAt: new Date(assetRegistry.lastVerifiedAt),
  }));
}

export function buildAssetAliasRows() {
  return assetRegistry.assets.flatMap((asset) =>
    asset.aliases.map((alias) => ({
      alias: alias.value,
      assetId: asset.assetId,
      aliasType: alias.type,
      note: alias.note,
    })),
  );
}

export function buildProviderInstrumentRows(): NewProviderInstrumentRow[] {
  return assetRegistry.assets.flatMap((asset) =>
    REGISTRY_PROVIDERS.map((provider) => {
      const mapping = asset.providers[provider];
      const symbols = deriveSymbols(asset, provider, mapping);
      return {
        mappingId: `${asset.assetId}:${provider}:spot`,
        assetId: asset.assetId,
        provider,
        role: "spot",
        instrumentId: mapping.instrumentId,
        baseSymbol: symbols.baseSymbol,
        quoteSymbol: symbols.quoteSymbol,
        status: mapping.status,
        priority: mapping.priority ?? getDefaultPriority(provider),
        ...getCapabilities(provider),
        firstSeenAt: new Date(
          mapping.firstSeenAt ?? assetRegistry.firstSeenAt,
        ),
        lastVerifiedAt: new Date(
          mapping.lastVerifiedAt ?? assetRegistry.lastVerifiedAt,
        ),
        delistedAt: mapping.delistedAt
          ? new Date(mapping.delistedAt)
          : null,
        mappingNote: mapping.mappingNote ?? null,
        updatedAt: new Date(assetRegistry.lastVerifiedAt),
      };
    }),
  );
}
