import { createHash } from "node:crypto";
import { sql } from "drizzle-orm";
import type {
  PgDatabase,
  PgQueryResultHKT,
} from "drizzle-orm/pg-core";
import * as schema from "@/lib/db/schema";
import {
  providerMappingChecks,
  type NewProviderMappingCheckRow,
} from "@/lib/db/schema";
import {
  buildProviderInstrumentRows,
  type RegistryProvider,
} from "./registry";
import type { ProviderInventoryItem, MappingAuditReport } from "./mapping-audit";

type MappingAuditDatabase<TResult extends PgQueryResultHKT> = PgDatabase<
  TResult,
  typeof schema
>;

export function hashProviderInventory(
  inventory: readonly ProviderInventoryItem[],
): string {
  const canonical = [...inventory]
    .sort(
      (left, right) =>
        left.provider.localeCompare(right.provider) ||
        left.instrumentId.localeCompare(right.instrumentId) ||
        left.baseSymbol.localeCompare(right.baseSymbol) ||
        (left.quoteSymbol ?? "").localeCompare(right.quoteSymbol ?? "") ||
        left.status.localeCompare(right.status),
    )
    .map((item) =>
      [
        item.provider,
        item.instrumentId,
        item.baseSymbol,
        item.quoteSymbol ?? "",
        item.status,
      ].join("\u001f"),
    )
    .join("\u001e");
  return createHash("sha256").update(canonical).digest("hex");
}

export async function persistProviderMappingChecks<
  TResult extends PgQueryResultHKT,
>(
  database: MappingAuditDatabase<TResult>,
  input: {
    checkedAt: Date;
    providers: readonly RegistryProvider[];
    inventory: readonly ProviderInventoryItem[];
    report: MappingAuditReport;
  },
): Promise<void> {
  const registryRows = buildProviderInstrumentRows();
  const rows: NewProviderMappingCheckRow[] = input.providers.map((provider) => {
    const providerInventory = input.inventory.filter(
      (item) => item.provider === provider,
    );
    const errors = input.report.errors.filter(
      (issue) => issue.provider === provider,
    );
    const warnings = input.report.warnings.filter(
      (issue) => issue.provider === provider,
    );
    return {
      provider,
      checkedAt: input.checkedAt,
      status: errors.length > 0 ? ("failed" as const) : ("success" as const),
      inventoryHash: hashProviderInventory(providerInventory),
      checkedMappings: registryRows.filter(
        (row) => row.provider === provider,
      ).length,
      inventoryItems: providerInventory.length,
      errorCount: errors.length,
      warningCount: warnings.length,
      errors: errors.map((error) => ({ ...error })),
      warnings: warnings.map((warning) => ({ ...warning })),
    };
  });

  if (rows.length === 0) return;
  await database
    .insert(providerMappingChecks)
    .values(rows)
    .onConflictDoUpdate({
      target: providerMappingChecks.provider,
      set: {
        checkedAt: sql`excluded.checked_at`,
        status: sql`excluded.status`,
        inventoryHash: sql`excluded.inventory_hash`,
        checkedMappings: sql`excluded.checked_mappings`,
        inventoryItems: sql`excluded.inventory_items`,
        errorCount: sql`excluded.error_count`,
        warningCount: sql`excluded.warning_count`,
        errors: sql`excluded.errors`,
        warnings: sql`excluded.warnings`,
      },
    });
}
