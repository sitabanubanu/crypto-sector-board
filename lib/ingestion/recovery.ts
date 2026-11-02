import type {
  DataHealthReport,
} from "./data-health";
import type { IngestionRunResult } from "./types";

export interface MarketDataRecoveryDependencies {
  checkHealth: () => Promise<DataHealthReport>;
  ingest: () => Promise<IngestionRunResult[]>;
}

export interface MarketDataRecoveryResult {
  action: "none" | "ingested";
  healthBefore: DataHealthReport;
  healthAfter: DataHealthReport;
  healthy: boolean;
  runs: IngestionRunResult[];
}

function hasFailedRun(runs: IngestionRunResult[]): boolean {
  return runs.some(
    (run) => run.status === "failed" || run.status === "partial",
  );
}

export async function runMarketDataRecovery(
  dependencies: MarketDataRecoveryDependencies,
): Promise<MarketDataRecoveryResult> {
  const healthBefore = await dependencies.checkHealth();
  if (healthBefore.status === "healthy" || healthBefore.blockingIssues.length === 0) {
    return {
      action: "none",
      healthBefore,
      healthAfter: healthBefore,
      healthy: healthBefore.status === "healthy",
      runs: [],
    };
  }

  const runs = await dependencies.ingest();
  const healthAfter = await dependencies.checkHealth();
  return {
    action: "ingested",
    healthBefore,
    healthAfter,
    healthy:
      healthAfter.status === "healthy" &&
      healthAfter.blockingIssues.length === 0 &&
      !hasFailedRun(runs),
    runs,
  };
}
