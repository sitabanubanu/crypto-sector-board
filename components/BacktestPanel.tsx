"use client";

import { useState, useEffect } from "react";
import { runBacktest } from "@/lib/backtest";
import type { BacktestResult } from "@/lib/backtest";
import type { DailySnapshot } from "@/lib/types";

export default function BacktestPanel() {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<BacktestResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  const run = async () => {
    setLoading(true);
    setError(null);
    try {
      // Fetch snapshot list
      const listRes = await fetch("/api/snapshots");
      const { dates } = await listRes.json();
      if (!dates || dates.length < 5) {
        setError("历史快照不足（需要至少 5 天数据）");
        setLoading(false);
        return;
      }

      // Load all snapshots
      const snapshots: DailySnapshot[] = [];
      for (const date of dates) {
        try {
          const res = await fetch(`/api/snapshots?date=${date}`);
          if (res.ok) {
            const json = await res.json();
            snapshots.push(json);
          }
        } catch { /* skip corrupt snapshots */ }
      }

      const bt = runBacktest(snapshots, 3);
      if (!bt) {
        setError("回测数据不足");
      } else {
        setResult(bt);
      }
    } catch {
      setError("加载失败");
    }
    setLoading(false);
  };

  if (!open) {
    return (
      <button
        onClick={() => { setOpen(true); run(); }}
        style={{
          position: "fixed",
          right: 12,
          bottom: 108,
          background: "#ffffff",
          border: "1px solid #e5e7eb",
          borderRadius: 8,
          padding: "6px 12px",
          fontSize: 12,
          fontWeight: 600,
          color: "#6b7280",
          cursor: "pointer",
          boxShadow: "0 1px 4px rgba(0,0,0,0.08)",
          zIndex: 10,
        }}
        title="策略回测"
      >
        ⏱ 回测
      </button>
    );
  }

  return (
    <>
      <div
        onClick={() => setOpen(false)}
        style={{
          position: "fixed",
          inset: 0,
          background: "rgba(0,0,0,0.15)",
          zIndex: 98,
        }}
      />
      <div
        style={{
          position: "fixed",
          top: "50%",
          left: "50%",
          transform: "translate(-50%, -50%)",
          background: "#ffffff",
          borderRadius: 12,
          boxShadow: "0 8px 32px rgba(0,0,0,0.12)",
          zIndex: 99,
          padding: "20px 24px",
          maxWidth: "95vw",
          maxHeight: "90vh",
          overflow: "auto",
          width: 500,
        }}
      >
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
          <span style={{ fontSize: 14, fontWeight: 700, color: "#1f2328" }}>策略回测</span>
          <button
            onClick={() => setOpen(false)}
            style={{ background: "none", border: "none", fontSize: 18, color: "#9ca3af", cursor: "pointer" }}
          >
            ✕
          </button>
        </div>

        {loading && <div style={{ textAlign: "center", padding: 40, color: "#9ca3af" }}>加载历史数据…</div>}
        {error && <div style={{ textAlign: "center", padding: 40, color: "#e53e3e" }}>{error}</div>}

        {result && (
          <div>
            {/* Summary cards */}
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginBottom: 14 }}>
              <Card label="策略总收益" value={`${result.totalReturn >= 0 ? "+" : ""}${result.totalReturn}%`}
                color={result.totalReturn >= 0 ? "#e53e3e" : "#38a169"} />
              <Card label="BTC 基准" value={`${result.btcReturn >= 0 ? "+" : ""}${result.btcReturn}%`}
                color={result.btcReturn >= 0 ? "#e53e3e" : "#38a169"} />
              <Card label="胜率" value={`${result.winRate}%`} color="#1f2328" />
              <Card label="最大回撤" value={`-${result.maxDrawdown}%`} color="#e53e3e" />
            </div>

            {/* Alpha */}
            <div style={{
              padding: "8px 12px",
              background: (result.totalReturn - result.btcReturn) >= 0 ? "#fed7d7" : "#c6f6d5",
              borderRadius: 6,
              fontSize: 12,
              fontWeight: 700,
              textAlign: "center",
              marginBottom: 14,
              color: (result.totalReturn - result.btcReturn) >= 0 ? "#c81e1e" : "#22543d",
            }}>
              α = {(result.totalReturn - result.btcReturn) >= 0 ? "+" : ""}
              {Math.round((result.totalReturn - result.btcReturn) * 100) / 100}%
              {" vs BTC 基准"}
            </div>

            {/* Monthly breakdown */}
            <div style={{ fontSize: 11, color: "#6b7280", marginBottom: 4 }}>月度收益</div>
            <div style={{ marginBottom: 14 }}>
              {result.monthlyReturns.map((m) => (
                <div key={m.month} style={{ display: "flex", justifyContent: "space-between", padding: "3px 0", fontSize: 11, borderBottom: "1px solid #f5f6f8" }}>
                  <span style={{ fontWeight: 500 }}>{m.month}</span>
                  <span style={{ color: m.strategy >= 0 ? "#e53e3e" : "#38a169", fontWeight: 600, marginRight: 20 }}>
                    {m.strategy >= 0 ? "+" : ""}{m.strategy}%
                  </span>
                </div>
              ))}
            </div>

            {/* Sector picks */}
            <div style={{ fontSize: 11, color: "#6b7280", marginBottom: 4 }}>被选板块表现</div>
            <div>
              {result.sectorPerformance.slice(0, 5).map((s) => (
                <div key={s.name} style={{ display: "flex", justifyContent: "space-between", padding: "3px 0", fontSize: 11, borderBottom: "1px solid #f5f6f8" }}>
                  <span>{s.name} <span style={{ color: "#9ca3af" }}>×{s.picks}</span></span>
                  <span style={{ color: s.avgReturn >= 0 ? "#e53e3e" : "#38a169", fontWeight: 600 }}>
                    {s.avgReturn >= 0 ? "+" : ""}{s.avgReturn}%
                  </span>
                </div>
              ))}
            </div>

            <div style={{ fontSize: 10, color: "#9ca3af", marginTop: 12, lineHeight: 1.5 }}>
              策略：每日选 24h 涨幅前 3 板块，等权持有 1 天。历史表现不代表未来收益。
            </div>

            <button
              onClick={run}
              disabled={loading}
              style={{
                width: "100%",
                marginTop: 10,
                padding: "6px 0",
                background: "#f5f6f8",
                border: "1px solid #e5e7eb",
                borderRadius: 6,
                fontSize: 11,
                cursor: "pointer",
                color: "#6b7280",
              }}
            >
              重新计算
            </button>
          </div>
        )}
      </div>
    </>
  );
}

function Card({ label, value, color }: { label: string; value: string; color: string }) {
  return (
    <div style={{ background: "#f8f9fb", borderRadius: 8, padding: "10px 12px", textAlign: "center" }}>
      <div style={{ fontSize: 9, color: "#9ca3af", marginBottom: 2 }}>{label}</div>
      <div style={{ fontSize: 16, fontWeight: 700, color }}>{value}</div>
    </div>
  );
}
