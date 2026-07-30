import {
  assetRegistry,
  buildProviderInstrumentRows,
  type RegistryProvider,
} from "./registry";

export interface ProviderInventoryItem {
  provider: RegistryProvider;
  instrumentId: string;
  baseSymbol: string;
  quoteSymbol: string | null;
  status: "active" | "inactive";
}

export interface MappingAuditIssue {
  severity: "error" | "warning";
  code:
    | "DUPLICATE_INVENTORY_ID"
    | "ACTIVE_INSTRUMENT_MISSING"
    | "ACTIVE_INSTRUMENT_INACTIVE"
    | "BASE_SYMBOL_CHANGED"
    | "QUOTE_SYMBOL_CHANGED"
    | "AMBIGUOUS_SYMBOL_PAIR"
    | "POSSIBLE_NEW_INSTRUMENT";
  provider: RegistryProvider;
  assetId?: string;
  instrumentId?: string;
  message: string;
}

export interface MappingAuditReport {
  checkedProviders: RegistryProvider[];
  checkedMappings: number;
  inventoryItems: number;
  errors: MappingAuditIssue[];
  warnings: MappingAuditIssue[];
}

export function auditProviderMappings(
  inventory: ProviderInventoryItem[],
  providers: readonly RegistryProvider[],
): MappingAuditReport {
  const selectedProviders = new Set(providers);
  const selectedInventory = inventory.filter((item) =>
    selectedProviders.has(item.provider),
  );
  const issues: MappingAuditIssue[] = [];
  const inventoryById = new Map<string, ProviderInventoryItem>();
  const inventoryBySymbols = new Map<string, ProviderInventoryItem[]>();

  for (const item of selectedInventory) {
    const idKey = `${item.provider}:${item.instrumentId}`;
    if (inventoryById.has(idKey)) {
      issues.push({
        severity: "error",
        code: "DUPLICATE_INVENTORY_ID",
        provider: item.provider,
        instrumentId: item.instrumentId,
        message: `Provider inventory returned duplicate instrument ${item.instrumentId}.`,
      });
    } else {
      inventoryById.set(idKey, item);
    }

    const symbolKey = `${item.provider}:${item.baseSymbol}:${item.quoteSymbol ?? ""}`;
    const matchingSymbols = inventoryBySymbols.get(symbolKey) ?? [];
    matchingSymbols.push(item);
    inventoryBySymbols.set(symbolKey, matchingSymbols);
  }

  const registryRows = buildProviderInstrumentRows().filter(
    (row) =>
      row.provider !== "legacy_snapshot" &&
      selectedProviders.has(row.provider),
  );

  for (const row of registryRows) {
    const provider = row.provider as RegistryProvider;
    if (row.status === "active" && row.instrumentId) {
      const current = inventoryById.get(`${provider}:${row.instrumentId}`);
      if (!current) {
        const candidates =
          inventoryBySymbols.get(
            `${provider}:${row.baseSymbol}:${row.quoteSymbol ?? ""}`,
          ) ?? [];
        issues.push({
          severity: "error",
          code: "ACTIVE_INSTRUMENT_MISSING",
          provider,
          assetId: row.assetId,
          instrumentId: row.instrumentId,
          message: `${row.assetId} expects ${row.instrumentId}, but it is absent from the provider inventory.`,
        });
        if (candidates.length > 1) {
          issues.push({
            severity: "warning",
            code: "AMBIGUOUS_SYMBOL_PAIR",
            provider,
            assetId: row.assetId,
            message: `The missing mapping has multiple symbol-matched candidates: ${candidates.map((item) => item.instrumentId).join(", ")}.`,
          });
        } else if (candidates.length === 1) {
          issues.push({
            severity: "warning",
            code: "POSSIBLE_NEW_INSTRUMENT",
            provider,
            assetId: row.assetId,
            instrumentId: candidates[0].instrumentId,
            message: `${row.assetId} may have moved from ${row.instrumentId} to ${candidates[0].instrumentId}.`,
          });
        }
        continue;
      }
      if (current.status !== "active") {
        issues.push({
          severity: "error",
          code: "ACTIVE_INSTRUMENT_INACTIVE",
          provider,
          assetId: row.assetId,
          instrumentId: row.instrumentId,
          message: `${row.instrumentId} exists but is not active.`,
        });
      }
      if (current.baseSymbol !== row.baseSymbol) {
        issues.push({
          severity: "error",
          code: "BASE_SYMBOL_CHANGED",
          provider,
          assetId: row.assetId,
          instrumentId: row.instrumentId,
          message: `${row.instrumentId} base changed from ${row.baseSymbol} to ${current.baseSymbol}.`,
        });
      }
      if (current.quoteSymbol !== row.quoteSymbol) {
        issues.push({
          severity: "error",
          code: "QUOTE_SYMBOL_CHANGED",
          provider,
          assetId: row.assetId,
          instrumentId: row.instrumentId,
          message: `${row.instrumentId} quote changed from ${row.quoteSymbol ?? "none"} to ${current.quoteSymbol ?? "none"}.`,
        });
      }
      continue;
    }

    const asset = assetRegistry.assets.find(
      (candidate) => candidate.assetId === row.assetId,
    );
    if (!asset) continue;
    const expectedQuote = provider === "coingecko" ? null : "USDT";
    const candidates =
      inventoryBySymbols.get(
        `${provider}:${asset.symbol}:${expectedQuote ?? ""}`,
      ) ?? [];
    if (candidates.some((candidate) => candidate.status === "active")) {
      issues.push({
        severity: "warning",
        code: "POSSIBLE_NEW_INSTRUMENT",
        provider,
        assetId: row.assetId,
        message: `${row.assetId} is ${row.status}, but matching active instrument(s) now exist: ${candidates.map((candidate) => candidate.instrumentId).join(", ")}.`,
      });
    }
  }

  return {
    checkedProviders: [...providers],
    checkedMappings: registryRows.length,
    inventoryItems: selectedInventory.length,
    errors: issues.filter((issue) => issue.severity === "error"),
    warnings: issues.filter((issue) => issue.severity === "warning"),
  };
}
