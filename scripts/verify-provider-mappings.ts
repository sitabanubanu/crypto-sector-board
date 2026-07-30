import { z } from "zod";
import {
  auditProviderMappings,
  type ProviderInventoryItem,
} from "../lib/market-data/mapping-audit";
import {
  REGISTRY_PROVIDERS,
  RegistryProviderSchema,
  type RegistryProvider,
} from "../lib/market-data/registry";

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
          baseCcy: z.string().min(1),
          quoteCcy: z.string().min(1),
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
  return payload.data.map((item) => ({
    provider: "okx",
    instrumentId: item.instId,
    baseSymbol: item.baseCcy,
    quoteSymbol: item.quoteCcy,
    status: item.state === "live" ? "active" : "inactive",
  }));
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
  const loaders: Record<
    RegistryProvider,
    () => Promise<ProviderInventoryItem[]>
  > = {
    gate: fetchGateInventory,
    okx: fetchOkxInventory,
    coingecko: fetchCoinGeckoInventory,
  };
  const inventory = (
    await Promise.all(providers.map((provider) => loaders[provider]()))
  ).flat();
  const report = auditProviderMappings(inventory, providers);

  console.log(JSON.stringify(report, null, 2));
  if (report.errors.length > 0) {
    process.exitCode = 1;
  }
}

main().catch((error) => {
  console.error("Provider mapping verification failed:", error);
  process.exitCode = 1;
});
