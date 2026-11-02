import { describe, expect, test } from "vitest";
import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { migrate } from "drizzle-orm/pglite/migrator";
import * as schema from "../lib/db/schema";
import { providerMappingChecks } from "../lib/db/schema";
import {
  hashProviderInventory,
  persistProviderMappingChecks,
} from "../lib/market-data/mapping-audit-store";

describe("provider mapping audit persistence", () => {
  test("hashes inventory independently of provider response order", () => {
    const first = [
      {
        provider: "gate" as const,
        instrumentId: "ETH_USDT",
        baseSymbol: "ETH",
        quoteSymbol: "USDT",
        status: "active" as const,
      },
      {
        provider: "gate" as const,
        instrumentId: "BTC_USDT",
        baseSymbol: "BTC",
        quoteSymbol: "USDT",
        status: "active" as const,
      },
    ];
    expect(hashProviderInventory(first)).toBe(
      hashProviderInventory([...first].reverse()),
    );
  });

  test("persists a failed provider check without changing registry rows", async () => {
    const client = new PGlite();
    const database = drizzle(client, { schema });
    try {
      await migrate(database, { migrationsFolder: "drizzle" });
      await persistProviderMappingChecks(database, {
        checkedAt: new Date("2026-09-15T08:00:00.000Z"),
        providers: ["gate"],
        inventory: [],
        report: {
          checkedProviders: ["gate"],
          checkedMappings: 67,
          inventoryItems: 0,
          errors: [
            {
              severity: "error",
              code: "ACTIVE_INSTRUMENT_MISSING",
              provider: "gate",
              assetId: "bitcoin",
              instrumentId: "BTC_USDT",
              message: "missing",
            },
          ],
          warnings: [],
        },
      });

      const [check] = await database.select().from(providerMappingChecks);
      expect(check).toMatchObject({
        provider: "gate",
        status: "failed",
        errorCount: 1,
        warningCount: 0,
        inventoryItems: 0,
      });
      expect(check.inventoryHash).toHaveLength(64);
    } finally {
      await client.close();
    }
  });
});
