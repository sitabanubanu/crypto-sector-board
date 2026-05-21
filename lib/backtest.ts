import type { DailySnapshot } from "./types";

export interface BacktestResult {
  totalReturn: number;
  trades: number;
  winRate: number;
  maxDrawdown: number;
  btcReturn: number;
  monthlyReturns: { month: string; strategy: number; btc: number }[];
  sectorPerformance: { name: string; picks: number; avgReturn: number }[];
  equityCurve: { day: string; value: number; btc: number }[];
}

// Simple rotation strategy: each day, pick top N sectors by 24h return,
// hold for 1 period, rebalance next day. Equal weight among picks.
export function runBacktest(
  snapshots: DailySnapshot[],
  topN: number = 3,
): BacktestResult | null {
  if (snapshots.length < 5) return null;

  // Sort by date ascending
  const sorted = [...snapshots].sort((a, b) => a.date.localeCompare(b.date));

  let equity = 1;
  let btcEquity = 1;
  const equityCurve: { day: string; value: number; btc: number }[] = [{ day: sorted[0].date, value: 1, btc: 1 }];

  let trades = 0;
  let wins = 0;
  let peak = 1;
  let maxDrawdown = 0;

  const sectorPicks = new Map<string, { picks: number; totalReturn: number }>();
  const monthlyMap = new Map<string, { sRet: number; bRet: number; count: number }>();

  for (let i = 0; i < sorted.length - 1; i++) {
    const today = sorted[i];
    const tomorrow = sorted[i + 1];

    // Get BTC sector for benchmark
    const btcSector = today.sectors.find((s) => s.id === "btc");

    // Pick top N sectors by 24h return
    const ranked = [...today.sectors]
      .filter((s) => s.coins.length > 1 && s.weightedReturnPct != null)
      .sort((a, b) => b.weightedReturnPct - a.weightedReturnPct);

    const picks = ranked.slice(0, topN);
    if (picks.length === 0) continue;

    // Calculate next-day return for picks (average return)
    let dayReturn = 0;
    for (const pick of picks) {
      const nextSector = tomorrow.sectors.find((s) => s.id === pick.id);
      if (nextSector && nextSector.weightedReturnPct != null) {
        dayReturn += nextSector.weightedReturnPct / picks.length;
      }

      // Track sector performance
      const existing = sectorPicks.get(pick.name) || { picks: 0, totalReturn: 0 };
      existing.picks++;
      if (nextSector?.weightedReturnPct != null) {
        existing.totalReturn += nextSector.weightedReturnPct;
      }
      sectorPicks.set(pick.name, existing);
    }

    equity *= (1 + dayReturn);
    trades++;

    if (dayReturn > 0) wins++;

    // Drawdown
    if (equity > peak) peak = equity;
    const dd = (peak - equity) / peak;
    if (dd > maxDrawdown) maxDrawdown = dd;

    // BTC benchmark
    const nextBtc = tomorrow.sectors.find((s) => s.id === "btc");
    if (btcSector && nextBtc && nextBtc.weightedReturnPct != null) {
      btcEquity *= (1 + nextBtc.weightedReturnPct);
    }

    equityCurve.push({
      day: tomorrow.date,
      value: Math.round(equity * 10000) / 10000,
      btc: Math.round(btcEquity * 10000) / 10000,
    });

    // Monthly aggregation
    const month = tomorrow.date.slice(0, 7);
    const m = monthlyMap.get(month) || { sRet: 0, bRet: 0, count: 0 };
    if (nextBtc?.weightedReturnPct != null) {
      m.sRet += dayReturn;
      m.bRet += nextBtc.weightedReturnPct;
    }
    m.count++;
    monthlyMap.set(month, m);
  }

  const monthlyReturns = [...monthlyMap.entries()].map(([month, v]) => ({
    month,
    strategy: Math.round(v.sRet * 10000) / 100,
    btc: Math.round(v.bRet * 10000) / 100,
  }));

  const sectorPerformance = [...sectorPicks.entries()]
    .map(([name, v]) => ({
      name,
      picks: v.picks,
      avgReturn: Math.round((v.totalReturn / v.picks) * 10000) / 100,
    }))
    .sort((a, b) => b.avgReturn - a.avgReturn);

  return {
    totalReturn: Math.round((equity - 1) * 10000) / 100,
    trades,
    winRate: Math.round((wins / trades) * 10000) / 100,
    maxDrawdown: Math.round(maxDrawdown * 10000) / 100,
    btcReturn: Math.round((btcEquity - 1) * 10000) / 100,
    monthlyReturns,
    sectorPerformance,
    equityCurve,
  };
}
