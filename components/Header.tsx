"use client";

import type { PeriodType } from "@/lib/types";

const PERIODS: { key: PeriodType; label: string }[] = [
  { key: "24h", label: "24h" },
  { key: "7d", label: "7d" },
  { key: "30d", label: "30d" },
];

interface Props {
  date: string;
  generatedAt: string;
  totalSectors: number;
  totalCoins: number;
  viewMode: "detailed" | "overview";
  onViewModeChange: (mode: "detailed" | "overview") => void;
  period: PeriodType;
  onPeriodChange: (p: PeriodType) => void;
}

export default function Header({
  date,
  generatedAt,
  totalSectors,
  totalCoins,
  viewMode,
  onViewModeChange,
  period,
  onPeriodChange,
}: Props) {
  const formatGeneratedAt = (iso: string) => {
    const d = new Date(iso);
    return d.toLocaleString("zh-CN", {
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      timeZone: "UTC",
    }) + " UTC";
  };

  const getFreshness = (iso: string) => {
    const diffMin = Math.round((Date.now() - new Date(iso).getTime()) / 60000);
    if (diffMin < 1) return "刚刚更新";
    if (diffMin < 60) return `${diffMin} 分钟前`;
    const diffHour = Math.round(diffMin / 60);
    if (diffHour < 24) return `${diffHour} 小时前`;
    return `${Math.round(diffHour / 24)} 天前`;
  };

  return (
    <header
      style={{
        background: "#ffffff",
        borderBottom: "1px solid #e5e7eb",
        padding: "14px 24px",
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        gap: 16,
      }}
    >
      <div>
        <div
          style={{
            fontSize: 20,
            fontWeight: 700,
            color: "#1f2328",
            letterSpacing: 0.2,
          }}
        >
          加密板块强弱看板
        </div>
        <div style={{ fontSize: 12, color: "#6b7280", marginTop: 3 }}>
          数据日期 {date}（24h 滚动）· 共 {totalSectors} 板块 / {totalCoins} 币种 · {formatGeneratedAt(generatedAt)}
          <span style={{ color: "#38a169", fontWeight: 600, marginLeft: 8 }}>
            ● {getFreshness(generatedAt)}
          </span>
        </div>
      </div>

      <div style={{ display: "flex", gap: 12 }}>
        <div
          style={{
            display: "inline-flex",
            background: "#f5f6f8",
            borderRadius: 8,
            padding: 3,
          }}
        >
          {PERIODS.map((p) => (
            <ToggleButton
              key={p.key}
              active={period === p.key}
              onClick={() => onPeriodChange(p.key)}
              label={p.label}
            />
          ))}
        </div>

        <div
          style={{
            display: "inline-flex",
            background: "#f5f6f8",
            borderRadius: 8,
            padding: 3,
          }}
        >
          <ToggleButton
            active={viewMode === "detailed"}
            onClick={() => onViewModeChange("detailed")}
            label="详细"
          />
          <ToggleButton
            active={viewMode === "overview"}
            onClick={() => onViewModeChange("overview")}
            label="总览"
          />
        </div>
      </div>
    </header>
  );
}

function ToggleButton({
  active,
  onClick,
  label,
}: {
  active: boolean;
  onClick: () => void;
  label: string;
}) {
  return (
    <button
      onClick={onClick}
      style={{
        padding: "6px 14px",
        fontSize: 13,
        fontWeight: 600,
        background: active ? "#ffffff" : "transparent",
        color: active ? "#1f2328" : "#6b7280",
        border: "none",
        borderRadius: 6,
        cursor: "pointer",
        boxShadow: active ? "0 1px 3px rgba(0,0,0,0.08)" : "none",
        transition: "all 0.15s",
      }}
    >
      {label}
    </button>
  );
}
