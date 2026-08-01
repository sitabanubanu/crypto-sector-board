"use client";

import { useState } from "react";
import type { CoinSnapshot, SectorSnapshot } from "@/lib/types";
import { formatPct } from "@/lib/colors";

interface Props {
  focusAssets: string[];
  sectors: SectorSnapshot[];
}

/** Legacy hidden component retained only as a focus-list view. It is not a portfolio. */
export default function PortfolioSummary({ focusAssets, sectors }: Props) {
  const [collapsed, setCollapsed] = useState(true);

  const focusedCoins: { coin: CoinSnapshot; sectorName: string }[] = [];
  for (const s of sectors) {
    for (const c of s.coins) {
      if (focusAssets.includes(c.id)) {
        focusedCoins.push({ coin: c, sectorName: s.name });
      }
    }
  }
  const hasFocusAssets = focusedCoins.length > 0;
  const weightedCoins = focusedCoins.filter(
    (holding) =>
      holding.coin.marketCap != null &&
      holding.coin.marketCap > 0 &&
      holding.coin.returnPct != null,
  );
  const coveredValue = weightedCoins.reduce(
    (sum, holding) => sum + holding.coin.marketCap!,
    0,
  );
  const weightedReturn =
    coveredValue > 0
      ? weightedCoins.reduce(
          (sum, holding) =>
            sum + holding.coin.returnPct! * holding.coin.marketCap!,
          0,
        ) / coveredValue
      : null;

  return (
    <div
      style={{
        position: "fixed",
        top: 64,
        right: 12,
        zIndex: 50,
        background: "#ffffff",
        border: "1px solid #e5e7eb",
        borderRadius: 10,
        boxShadow: "0 2px 12px rgba(0,0,0,0.08)",
        width: collapsed ? "auto" : 240,
        fontSize: 12,
        overflow: "hidden",
      }}
    >
      {/* Header */}
      <button
        onClick={() => setCollapsed(!collapsed)}
        style={{
          width: "100%",
          padding: "8px 12px",
          background: "linear-gradient(135deg, #f59e0b 0%, #d97706 100%)",
          border: "none",
          cursor: "pointer",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 8,
          color: "#ffffff",
          fontWeight: 700,
          fontSize: 13,
        }}
      >
        <span>★ {hasFocusAssets ? "关注资产" : "添加关注"}</span>
        <span style={{ fontSize: 10, opacity: 0.8 }}>
          {collapsed ? "展开" : "收起"}
        </span>
      </button>

      {!collapsed && (
        <div style={{ padding: "8px 0", maxHeight: 360, overflow: "auto" }}>
          {!hasFocusAssets ? (
            <div style={{ padding: "12px", fontSize: 11, color: "#9ca3af", lineHeight: 1.6 }}>
              在 <code style={{ background: "#f5f6f8", padding: "1px 4px", borderRadius: 3 }}>data/sectors.json</code> 的
              <code style={{ background: "#f5f6f8", padding: "1px 4px", borderRadius: 3 }}>focusAssets</code> 数组中填入币种 ID（如 bitcoin、ethereum），开启关注标记。它不表示真实持仓。
            </div>
          ) : (
            <>
              <div
                style={{
                  padding: "6px 12px",
                  display: "flex",
                  justifyContent: "space-between",
                  borderBottom: "1px solid #e5e7eb",
                  fontWeight: 600,
                }}
              >
                <span style={{ color: "#6b7280" }}>关注列表 24h 市值加权</span>
                <span
                  style={{
                    color:
                      weightedReturn == null
                        ? "#9ca3af"
                        : weightedReturn >= 0
                          ? "#e53e3e"
                          : "#38a169",
                  }}
                >
                  {formatPct(weightedReturn)}
                </span>
              </div>

              {/* Individual coins */}
              {focusedCoins
                .sort(
                  (a, b) =>
                    (b.coin.returnPct ?? Number.NEGATIVE_INFINITY) -
                    (a.coin.returnPct ?? Number.NEGATIVE_INFINITY),
                )
                .map((h) => (
                  <div
                    key={h.coin.id}
                    style={{
                      padding: "5px 12px",
                      display: "flex",
                      justifyContent: "space-between",
                      alignItems: "center",
                      borderBottom: "1px solid #f5f6f8",
                    }}
                  >
                    <div>
                      <span style={{ fontWeight: 600, fontSize: 11 }}>
                        {h.coin.symbol}
                      </span>
                      <span
                        style={{
                          fontSize: 9,
                          color: "#9ca3af",
                          marginLeft: 6,
                        }}
                      >
                        {h.sectorName}
                      </span>
                    </div>
                    <span
                      style={{
                        fontWeight: 600,
                        fontSize: 11,
                        color:
                          h.coin.returnPct == null
                            ? "#9ca3af"
                            : h.coin.returnPct >= 0
                              ? "#e53e3e"
                              : "#38a169",
                      }}
                    >
                      {formatPct(h.coin.returnPct)}
                    </span>
                  </div>
                ))}
            </>
          )}
        </div>
      )}
    </div>
  );
}
