import "../envConfig";
import { z } from "zod";
import { closeDatabase, getDatabase } from "../lib/db/connection";
import {
  auditProviderMappings,
  type ProviderInventoryItem,
} from "../lib/market-data/mapping-audit";
import {
  REGISTRY_PROVIDERS,
  RegistryProviderSchema,
  type RegistryProvider,
} from "../lib/market-data/registry";
import { persistProviderMappingChecks } from "../lib/market-data/mapping-audit-store";

const GateInventorySchema = z.array(
  z
    .object({
      id: z.string().min(1),
      base: z.string().min(1),
      quote: z.string().min(1),
      trade_status: z.string().min(1),
    })
    .passthrough(),
);

const OkxInventorySchema = z
  .object({
    code: z.literal("0"),
    data: z.array(
      z
      .object({
        instId: z.string().min(1),
        // OKX occasionally includes non-trading metadata rows with empty
        // currency fields. They are ignored below after the envelope is
        // validated instead of making the whole provider audit fail.
        baseCcy: z.string(),
        quoteCcy: z.string(),
          state: z.string().min(1),
        })
        .passthrough(),
    ),
  })
  .passthrough();

const CoinGeckoInventorySchema = z.array(
  z
    .object({
      id: z.string().min(1),
      symbol: z.string(),
      name: z.string(),
    })
    .passthrough(),
);

function parseProviders(): RegistryProvider[] {
  const providerArgument = process.argv.find((argument) =>
    argument.startsWith("--provider="),
  );
  if (!providerArgument || providerArgument === "--provider=all") {
    return [...REGISTRY_PROVIDERS];
  }
  return [
    RegistryProviderSchema.parse(providerArgument.slice("--provider=".length)),
  ];
}

async function fetchJson(url: string, attempts = 2): Promise<unknown> {
  let lastError: unknown;
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    try {
      const response = await fetch(url, {
        headers: {
          Accept: "application/json",
          "User-Agent": "crypto-sector-board-mapping-audit/1.0",
        },
        signal: AbortSignal.timeout(20_000),
      });
      if (!response.ok) {
        throw new Error(`HTTP ${response.status} ${response.statusText}`);
      }
      return await response.json();
    } catch (error) {
      lastError = error;
      if (attempt + 1 < attempts) {
        await new Promise((resolve) => setTimeout(resolve, 1_000));
      }
    }
  }
  throw lastError;
}

async function fetchGateInventory(): Promise<ProviderInventoryItem[]> {
  const payload = GateInventorySchema.parse(
    await fetchJson("https://api.gateio.ws/api/v4/spot/currency_pairs"),
  );
  return payload.map((item) => ({
    provider: "gate",
    instrumentId: item.id,
    baseSymbol: item.base,
    quoteSymbol: item.quote,
    status: item.trade_status === "tradable" ? "active" : "inactive",
  }));
}

async function fetchOkxInventory(): Promise<ProviderInventoryItem[]> {
  const payload = OkxInventorySchema.parse(
    await fetchJson(
      "https://www.okx.com/api/v5/public/instruments?instType=SPOT",
    ),
  );
  return payload.data.flatMap((item) => {
    const baseSymbol = item.baseCcy.trim().toUpperCase();
    const quoteSymbol = item.quoteCcy.trim().toUpperCase();
    if (!baseSymbol || !quoteSymbol) return [];
    return [
      {
        provider: "okx" as const,
        instrumentId: item.instId,
        baseSymbol,
        quoteSymbol,
        status: item.state === "live" ? ("active" as const) : ("inactive" as const),
      },
    ];
  });
}

async function fetchCoinGeckoInventory(): Promise<ProviderInventoryItem[]> {
  const payload = CoinGeckoInventorySchema.parse(
    await fetchJson(
      "https://api.coingecko.com/api/v3/coins/list?include_platform=false",
    ),
  );
  return payload.flatMap((item) => {
    const symbol = item.symbol.trim().toUpperCase();
    return symbol
      ? [
          {
            provider: "coingecko" as const,
            instrumentId: item.id,
            baseSymbol: symbol,
            quoteSymbol: null,
            status: "active" as const,
          },
        ]
      : [];
  });
}

async function main() {
  const providers = parseProviders();
  const persist = process.argv.includes("--persist");
  const loaders: Record<
    RegistryProvider,
    () => Promise<ProviderInventoryItem[]>
  > = {
    gate: fetchGateInventory,
    okx: fetchOkxInventory,
    coingecko: fetchCoinGeckoInventory,
  };
  const providerResults = await Promise.all(
    providers.map(async (provider) => {
      try {
        return { provider, inventory: await loaders[provider](), error: null };
      } catch (error) {
        return {
          provider,
          inventory: [],
          error: error instanceof Error ? error.message : "unknown error",
        };
      }
    }),
  );
  const inventory = providerResults.flatMap((result) => result.inventory);
  const report = auditProviderMappings(inventory, providers);
  report.errors.push(
    ...providerResults.flatMap((result) =>
      result.error
        ? [
            {
              severity: "error" as const,
              code: "INVENTORY_FETCH_FAILED" as const,
              provider: result.provider,
              message: `Provider inventory fetch failed: ${result.error}`,
            },
          ]
        : [],
    ),
  );
  const checkedAt = new Date();

  if (persist) {
    await persistProviderMappingChecks(getDatabase(), {
      checkedAt,
      providers,
      inventory,
      report,
    });
  }

  console.log(
    JSON.stringify(
      {
        ...report,
        persisted: persist,
        checkedAt: persist ? checkedAt.toISOString() : undefined,
      },
      null,
      2,
    ),
  );
  if (report.errors.length > 0) {
    process.exitCode = 1;
  }
}

main()
  .catch((error) => {
    console.error("Provider mapping verification failed:", error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await closeDatabase();
  });
