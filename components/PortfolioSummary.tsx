"use client";

import { useState } from "react";
import type { CoinSnapshot, SectorSnapshot } from "@/lib/types";
import { formatPct, formatMarketCap } from "@/lib/colors";

interface Props {
  holdings: string[];
  sectors: SectorSnapshot[];
}

export default function PortfolioSummary({ holdings, sectors }: Props) {
  const [collapsed, setCollapsed] = useState(false);

  if (holdings.length === 0) return null;

  // Find held coins across all sectors
  const heldCoins: { coin: CoinSnapshot; sectorName: string }[] = [];
  for (const s of sectors) {
    for (const c of s.coins) {
      if (holdings.includes(c.id)) {
        heldCoins.push({ coin: c, sectorName: s.name });
      }
    }
  }
  if (heldCoins.length === 0) return null;

  const totalValue = heldCoins.reduce((sum, h) => sum + h.coin.marketCap, 0);
  const weightedReturn = totalValue > 0
    ? heldCoins.reduce((sum, h) => sum + h.coin.returnPct * h.coin.marketCap, 0) / totalValue
    : 0;

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
        <span>★ 持仓概览</span>
        <span style={{ fontSize: 10, opacity: 0.8 }}>
          {collapsed ? "展开" : "收起"}
        </span>
      </button>

      {!collapsed && (
        <div style={{ padding: "8px 0", maxHeight: 360, overflow: "auto" }}>
          {/* Summary row */}
          <div
            style={{
              padding: "6px 12px",
              display: "flex",
              justifyContent: "space-between",
              borderBottom: "1px solid #f0f1f3",
              fontWeight: 600,
            }}
          >
            <span style={{ color: "#6b7280" }}>总市值</span>
            <span style={{ color: "#1f2328" }}>{formatMarketCap(totalValue)}</span>
          </div>
          <div
            style={{
              padding: "6px 12px",
              display: "flex",
              justifyContent: "space-between",
              borderBottom: "1px solid #e5e7eb",
              fontWeight: 600,
            }}
          >
            <span style={{ color: "#6b7280" }}>24h 加权涨跌</span>
            <span
              style={{
                color: weightedReturn >= 0 ? "#e53e3e" : "#38a169",
              }}
            >
              {formatPct(weightedReturn)}
            </span>
          </div>

          {/* Individual coins */}
          {heldCoins
            .sort((a, b) => b.coin.returnPct - a.coin.returnPct)
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
                    color: h.coin.returnPct >= 0 ? "#e53e3e" : "#38a169",
                  }}
                >
                  {formatPct(h.coin.returnPct)}
                </span>
              </div>
            ))}
        </div>
      )}
    </div>
  );
}
