import type { BoardComparison } from "./bff-contracts";
import type { CoinSnapshot, DailySnapshot } from "@/lib/types";

function uniqueCoins(snapshot: DailySnapshot): Map<string, CoinSnapshot> {
  const result = new Map<string, CoinSnapshot>();
  for (const sector of snapshot.sectors) {
    for (const coin of sector.coins) {
      if (!result.has(coin.id)) result.set(coin.id, coin);
    }
  }
  return result;
}

function median(values: number[]): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((left, right) => left - right);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0
    ? (sorted[middle - 1] + sorted[middle]) / 2
    : sorted[middle];
}

function relativeDifferences(
  left: Map<string, CoinSnapshot>,
  right: Map<string, CoinSnapshot>,
  select: (coin: CoinSnapshot) => number | null | undefined,
) {
  const differences: number[] = [];
  for (const [assetId, leftCoin] of left) {
    const rightCoin = right.get(assetId);
    if (!rightCoin) continue;
    const leftValue = select(leftCoin);
    const rightValue = select(rightCoin);
    if (
      leftValue == null ||
      rightValue == null ||
      !Number.isFinite(leftValue) ||
      !Number.isFinite(rightValue) ||
      rightValue === 0
    ) {
      continue;
    }
    differences.push(Math.abs(leftValue - rightValue) / Math.abs(rightValue));
  }

  return {
    sampleSize: differences.length,
    medianRelativeDifference: median(differences),
    maxRelativeDifference:
      differences.length > 0 ? Math.max(...differences) : null,
  };
}

export function compareBoardSnapshots(
  database: DailySnapshot,
  json: DailySnapshot,
  comparedAt = new Date(),
): BoardComparison {
  const databaseCoins = uniqueCoins(database);
  const jsonCoins = uniqueCoins(json);
  const commonAssets = [...databaseCoins.keys()].filter((assetId) =>
    jsonCoins.has(assetId),
  );

  return {
    referenceBackend: "json",
    comparedAt: comparedAt.toISOString(),
    databaseAssets: databaseCoins.size,
    jsonAssets: jsonCoins.size,
    commonAssets: commonAssets.length,
    databaseOnlyAssets: [...databaseCoins.keys()]
      .filter((assetId) => !jsonCoins.has(assetId))
      .sort(),
    jsonOnlyAssets: [...jsonCoins.keys()]
      .filter((assetId) => !databaseCoins.has(assetId))
      .sort(),
    generatedAtDeltaSeconds:
      Math.abs(
        Date.parse(database.generatedAt) - Date.parse(json.generatedAt),
      ) / 1_000,
    price: relativeDifferences(
      databaseCoins,
      jsonCoins,
      (coin) => coin.close,
    ),
    marketCap: relativeDifferences(
      databaseCoins,
      jsonCoins,
      (coin) => coin.marketCap,
    ),
  };
}
