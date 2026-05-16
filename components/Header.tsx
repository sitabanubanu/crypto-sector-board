"use client";

import type { PeriodType } from "@/lib/types";

const PERIODS: { key: PeriodType; label: string }[] = [
  { key: "24h", label: "24h" },
  { key: "3d", label: "3d" },
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
  okxStatus: "idle" | "loading" | "live" | "error";
  onOpenWatchlist: () => void;
  isMobile: boolean;
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
  okxStatus,
  onOpenWatchlist,
  isMobile,
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

  const okxDotColor =
    okxStatus === "live" ? "#38a169" :
    okxStatus === "loading" ? "#f59e0b" :
    okxStatus === "error" ? "#e53e3e" : "#d1d5db";

  return (
    <header
      style={{
        background: "#ffffff",
        borderBottom: "1px solid #e5e7eb",
        padding: isMobile ? "8px 12px" : "14px 24px",
        display: "flex",
        flexDirection: isMobile ? "column" : "row",
        alignItems: isMobile ? "stretch" : "center",
        justifyContent: "space-between",
        gap: isMobile ? 6 : 16,
      }}
    >
      {/* Top row: title + watchlist + OKX */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div
            style={{
              fontSize: isMobile ? 15 : 20,
              fontWeight: 700,
              color: "#1f2328",
              letterSpacing: 0.2,
            }}
          >
            加密板块强弱看板
          </div>
          {!isMobile && (
            <div style={{ fontSize: 12, color: "#6b7280", marginTop: 3 }}>
              数据日期 {date}（24h 滚动）· 共 {totalSectors} 板块 / {totalCoins} 币种 · {formatGeneratedAt(generatedAt)}
              <span style={{ color: "#38a169", fontWeight: 600, marginLeft: 8 }}>
                ● {getFreshness(generatedAt)}
              </span>
            </div>
          )}
        </div>
        <div style={{ display: "flex", gap: 8, alignItems: "center", flexShrink: 0 }}>
          {isMobile && (
            <span style={{ display: "inline-flex", alignItems: "center", gap: 3, fontSize: 10, color: "#6b7280" }}>
              <span style={{ width: 5, height: 5, borderRadius: 3, background: okxDotColor }} />
              {totalSectors}板块
            </span>
          )}
          <button
            onClick={onOpenWatchlist}
            title="编辑自选"
            style={{
              background: "#f5f6f8",
              border: "none",
              borderRadius: 8,
              padding: isMobile ? "6px 8px" : "8px 10px",
              cursor: "pointer",
              fontSize: isMobile ? 13 : 15,
              lineHeight: 1,
              color: "#6b7280",
            }}
          >
            ⚙
          </button>
          {!isMobile && (
            <span style={{ display: "inline-flex", alignItems: "center", gap: 4, fontSize: 11, color: "#6b7280" }}>
              <span style={{ width: 6, height: 6, borderRadius: 3, background: okxDotColor }} />
              OKX{okxStatus === "live" ? " 实时" : okxStatus === "loading" ? " 加载中" : okxStatus === "error" ? " 异常" : ""}
            </span>
          )}
        </div>
      </div>

      {/* Bottom row: period + view mode toggles */}
      <div style={{ display: "flex", gap: isMobile ? 6 : 12, alignItems: "center", justifyContent: isMobile ? "center" : "flex-end" }}>
        <div style={{ display: "inline-flex", background: "#f5f6f8", borderRadius: 8, padding: 2 }}>
          {PERIODS.map((p) => (
            <ToggleButton
              key={p.key}
              active={period === p.key}
              onClick={() => onPeriodChange(p.key)}
              label={p.label}
              compact={isMobile}
            />
          ))}
        </div>
        <div style={{ display: "inline-flex", background: "#f5f6f8", borderRadius: 8, padding: 2 }}>
          <ToggleButton
            active={viewMode === "detailed"}
            onClick={() => onViewModeChange("detailed")}
            label={isMobile ? "详" : "详细"}
            compact={isMobile}
          />
          <ToggleButton
            active={viewMode === "overview"}
            onClick={() => onViewModeChange("overview")}
            label={isMobile ? "总" : "总览"}
            compact={isMobile}
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
  compact,
}: {
  active: boolean;
  onClick: () => void;
  label: string;
  compact?: boolean;
}) {
  return (
    <button
      onClick={onClick}
      style={{
        padding: compact ? "5px 10px" : "6px 14px",
        fontSize: compact ? 12 : 13,
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
