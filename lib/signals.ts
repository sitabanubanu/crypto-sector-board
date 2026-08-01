import type { SectorPulse } from "./market-pulse";

export const SIGNAL_RULE_VERSION = "market-pulse-v1";
export const ROTATION_RANK_THRESHOLD = 3;
export const ANOMALY_Z_THRESHOLD = 2;

export type SignalType =
  | "rotation_up"
  | "rotation_down"
  | "anomaly_up"
  | "anomaly_down";

export interface SectorSignal {
  sectorId: string;
  type: SignalType;
  label: string;
  icon: string;
  reason: string;
  ruleVersion: typeof SIGNAL_RULE_VERSION;
  asOf: string;
  sampleSize: number;
  quality: "ok";
}

function formatRankChange(value: number): string {
  return `${Math.abs(value)} 位`;
}

export function detectSectorSignal(
  pulse: SectorPulse,
): SectorSignal | null {
  if (pulse.quality !== "ok") return null;

  if (
    pulse.anomalyZScore != null &&
    Math.abs(pulse.anomalyZScore) >= ANOMALY_Z_THRESHOLD
  ) {
    const upward = pulse.anomalyZScore > 0;
    return {
      sectorId: pulse.sectorId,
      type: upward ? "anomaly_up" : "anomaly_down",
      label: upward ? "向上异动" : "向下异动",
      icon: upward ? "▲" : "▼",
      reason: `${pulse.sectorName} 当前 24h 收益相对 ${pulse.historySampleSize} 个完整 UTC 日达到 z=${pulse.anomalyZScore.toFixed(2)}`,
      ruleVersion: SIGNAL_RULE_VERSION,
      asOf: pulse.asOf,
      sampleSize: pulse.historySampleSize,
      quality: "ok",
    };
  }

  if (
    pulse.rankChange != null &&
    Math.abs(pulse.rankChange) >= ROTATION_RANK_THRESHOLD &&
    pulse.currentRank != null &&
    pulse.previousRank != null
  ) {
    const upward = pulse.rankChange > 0;
    return {
      sectorId: pulse.sectorId,
      type: upward ? "rotation_up" : "rotation_down",
      label: upward ? "排名上升" : "排名下降",
      icon: upward ? "↑" : "↓",
      reason: `${pulse.sectorName} 从 #${pulse.previousRank} 变为 #${pulse.currentRank}，${upward ? "上升" : "下降"}${formatRankChange(pulse.rankChange)}`,
      ruleVersion: SIGNAL_RULE_VERSION,
      asOf: pulse.asOf,
      sampleSize: pulse.historySampleSize,
      quality: "ok",
    };
  }

  return null;
}

export function detectAllSignals(
  pulses: ReadonlyArray<SectorPulse>,
): Map<string, SectorSignal> {
  const signals = new Map<string, SectorSignal>();
  for (const pulse of pulses) {
    const signal = detectSectorSignal(pulse);
    if (signal) signals.set(pulse.sectorId, signal);
  }
  return signals;
}
