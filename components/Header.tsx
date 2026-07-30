"use client";

import { useEffect, useState } from "react";
import type { PeriodType } from "@/lib/types";
import type {
  DataQuality,
  MarketDataProvider,
} from "@/lib/market-data/contracts";
import type {
  DataBackend,
} from "@/lib/market-data/bff-contracts";
import type {
  BoardRefreshStatus,
} from "@/components/board/use-board-data";
import {
  isDataQualityStale,
  isTimestampStale,
  SNAPSHOT_FALLBACK_STALE_AFTER_SECONDS,
} from "@/lib/market-data/freshness";
import { PRESETS } from "@/lib/presets";

const PERIODS: { key: PeriodType; label: string }[] = [
  { key: "24h", label: "24h" },
  { key: "3d", label: "3d" },
  { key: "7d", label: "7d" },
  { key: "30d", label: "30d" },
];

interface Props {
  date: string;
  generatedAt: string;
  dataQuality?: DataQuality;
  totalSectors: number;
  totalCoins: number;
  viewMode: "detailed" | "overview";
  onViewModeChange: (mode: "detailed" | "overview") => void;
  period: PeriodType;
  onPeriodChange: (p: PeriodType) => void;
  refreshStatus: BoardRefreshStatus;
  dataBackend: DataBackend;
  dataSources: MarketDataProvider[];
  dualRead: boolean;
  onOpenWatchlist: () => void;
  isMobile: boolean;
  activePreset: string;
  onPresetChange: (id: string) => void;
}

export default function Header({
  date,
  generatedAt,
  dataQuality,
  totalSectors,
  totalCoins,
  viewMode,
  onViewModeChange,
  period,
  onPeriodChange,
  refreshStatus,
  dataBackend,
  dataSources,
  dualRead,
  onOpenWatchlist,
  isMobile,
  activePreset,
  onPresetChange,
}: Props) {
  const [nowMs, setNowMs] = useState<number | null>(null);

  useEffect(() => {
    const updateNow = () => setNowMs(Date.now());
    const initialTimer = window.setTimeout(updateNow, 0);
    const interval = window.setInterval(updateNow, 60_000);

    return () => {
      window.clearTimeout(initialTimer);
      window.clearInterval(interval);
    };
  }, []);

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
    if (nowMs === null) return "正在校准";
    const diffMin = Math.max(
      0,
      Math.floor((nowMs - new Date(iso).getTime()) / 60000),
    );
    if (diffMin < 1) return "刚刚更新";
    if (diffMin < 60) return `${diffMin} 分钟前`;
    const diffHour = Math.round(diffMin / 60);
    if (diffHour < 24) return `${diffHour} 小时前`;
    return `${Math.round(diffHour / 24)} 天前`;
  };

  const statusDotColor =
    refreshStatus === "ready" ? "#38a169" :
    refreshStatus === "refreshing" ? "#f59e0b" :
    refreshStatus === "error" || refreshStatus === "stale"
      ? "#e53e3e"
      : "#d1d5db";
  const sourceNames: Record<MarketDataProvider, string> = {
    gate: "Gate",
    okx: "OKX",
    coingecko: "CoinGecko",
    snapshot: "Snapshot",
  };
  const backendLabel = dataBackend === "database" ? "数据库" : "JSON 回滚";
  const sourceLabel = dataSources.map((source) => sourceNames[source]).join(" + ");
  const refreshLabel =
    refreshStatus === "refreshing" ? "更新中" :
    refreshStatus === "error" ? "刷新失败" :
    refreshStatus === "stale" ? "数据过期" : "正常";
  const freshnessAt = dataQuality?.asOf ?? generatedAt;
  const freshnessIsStale =
    nowMs === null
      ? Boolean(dataQuality?.isStale)
      : dataQuality
        ? isDataQualityStale(dataQuality, nowMs)
        : isTimestampStale(
            freshnessAt,
            SNAPSHOT_FALLBACK_STALE_AFTER_SECONDS,
            nowMs,
          );
  const freshnessColor = freshnessIsStale ? "#e53e3e" : "#38a169";
  const coverageLabel = dataQuality
    ? `覆盖 ${(dataQuality.coverageRatio * 100).toFixed(0)}%`
    : null;

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
      {/* Top row: title + watchlist + data delivery status */}
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
              <span style={{ color: freshnessColor, fontWeight: 600, marginLeft: 8 }}>
                ● {getFreshness(freshnessAt)}
              </span>
              {coverageLabel && (
                <span style={{ marginLeft: 8 }}>
                  · {coverageLabel}
                  {dataQuality!.fallbackAssets.length > 0
                    ? ` / ${dataQuality!.fallbackAssets.length} 个兜底`
                    : ""}
                </span>
              )}
            </div>
          )}
        </div>
        <div style={{ display: "flex", gap: 8, alignItems: "center", flexShrink: 0 }}>
          {isMobile && (
            <span style={{ display: "inline-flex", alignItems: "center", gap: 3, fontSize: 10, color: "#6b7280" }}>
              <span style={{ width: 5, height: 5, borderRadius: 3, background: statusDotColor }} />
              {dataBackend === "database" ? "DB" : "JSON"} · {totalSectors}板块
            </span>
          )}
          <button
            disabled
            title="板块编辑维护中，待管理员认证上线后恢复"
            aria-label="板块编辑维护中"
            style={{
              background: "#f5f6f8",
              border: "none",
              borderRadius: 8,
              padding: isMobile ? "6px 8px" : "8px 10px",
              cursor: "not-allowed",
              fontSize: isMobile ? 13 : 15,
              lineHeight: 1,
              color: "#6b7280",
              opacity: 0.45,
            }}
          >
            🔒
          </button>
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
              <span style={{ width: 6, height: 6, borderRadius: 3, background: statusDotColor }} />
              {backendLabel} · {sourceLabel || "暂无来源"} · {refreshLabel}
              {dualRead ? " · 双读校验" : ""}
            </span>
          )}
        </div>
      </div>

      {/* Preset chips */}
      <div style={{ display: "flex", gap: 4, alignItems: "center", flexWrap: "wrap" }}>
        {PRESETS.map((p) => (
          <button
            key={p.id}
            onClick={() => onPresetChange(p.id)}
            title={p.description}
            style={{
              padding: isMobile ? "2px 7px" : "3px 10px",
              fontSize: isMobile ? 10 : 11,
              fontWeight: activePreset === p.id ? 600 : 400,
              background: activePreset === p.id ? "#1f2328" : "#f5f6f8",
              color: activePreset === p.id ? "#ffffff" : "#6b7280",
              border: "none",
              borderRadius: 10,
              cursor: "pointer",
              transition: "all 0.15s",
            }}
          >
            {p.name}
          </button>
        ))}
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
