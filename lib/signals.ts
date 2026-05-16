import type { SectorSnapshot } from "./types";

export type SignalType = "strong_up" | "strong_down" | "pullback" | "bull_trap";

export interface SectorSignal {
  sectorId: string;
  type: SignalType;
  label: string;
  icon: string;
}

const SIGNAL_DEFS: Record<SignalType, { label: string; icon: string }> = {
  strong_up: { label: "强势确认", icon: "🔥" },
  strong_down: { label: "弱势回避", icon: "❄️" },
  pullback: { label: "回调机会", icon: "💰" },
  bull_trap: { label: "诱多陷阱", icon: "⚠️" },
};

export function detectSectorSignal(sector: SectorSnapshot): SectorSignal | null {
  const r24h = sector.weightedReturnPct;
  const r3d = sector.weightedReturnPct3d;
  const r7d = sector.weightedReturnPct7d;

  // Need at least 24h + two historical periods
  if (r3d == null || r7d == null) return null;

  const pos24h = r24h > 0;
  const pos3d = r3d > 0;
  const pos7d = r7d > 0;
  const pos30d = (sector.weightedReturnPct30d ?? 0) > 0;

  // All 4 positive
  if (pos24h && pos3d && pos7d && pos30d) {
    return { sectorId: sector.id, type: "strong_up", ...SIGNAL_DEFS.strong_up };
  }
  // All 4 negative
  if (!pos24h && !pos3d && !pos7d && !pos30d) {
    return { sectorId: sector.id, type: "strong_down", ...SIGNAL_DEFS.strong_down };
  }
  // 24h negative but 3d & 7d positive → short-term dip in uptrend
  if (!pos24h && pos3d && pos7d) {
    return { sectorId: sector.id, type: "pullback", ...SIGNAL_DEFS.pullback };
  }
  // 24h positive but 3d & 7d negative → short-term pop in downtrend
  if (pos24h && !pos3d && !pos7d) {
    return { sectorId: sector.id, type: "bull_trap", ...SIGNAL_DEFS.bull_trap };
  }

  return null;
}

export function detectAllSignals(sectors: SectorSnapshot[]): Map<string, SectorSignal> {
  const map = new Map<string, SectorSignal>();
  for (const sector of sectors) {
    const signal = detectSectorSignal(sector);
    if (signal) {
      map.set(sector.id, signal);
    }
  }
  return map;
}
