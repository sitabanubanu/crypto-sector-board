"use client";

import type {
  MarketPulse,
  MarketSearchResult,
  SectorPulse,
} from "@/lib/market-pulse";
import type { SectorSignal } from "@/lib/signals";
import { formatPct } from "@/lib/colors";

interface Props {
  pulse: MarketPulse;
  signals: ReadonlyMap<string, SectorSignal>;
  query: string;
  searchResults: MarketSearchResult[];
  isMobile: boolean;
  onQueryChange: (value: string) => void;
  onSelectResult: (result: MarketSearchResult) => void;
}

function formatRatio(value: number | null): string {
  return value == null ? "N/A" : `${(value * 100).toFixed(0)}%`;
}

function rankChangeLabel(pulse: SectorPulse): string {
  if (pulse.rankChange == null) return "—";
  if (pulse.rankChange > 0) return `↑${pulse.rankChange}`;
  if (pulse.rankChange < 0) return `↓${Math.abs(pulse.rankChange)}`;
  return "→";
}

function exactOrFirstResult(
  query: string,
  results: MarketSearchResult[],
): MarketSearchResult | undefined {
  const normalized = query.trim().toLocaleLowerCase("zh-CN");
  return (
    results.find(
      (result) =>
        result.id.toLocaleLowerCase() === normalized ||
        result.label.toLocaleLowerCase() === normalized ||
        result.secondaryLabel.toLocaleLowerCase("zh-CN") === normalized,
    ) ?? results[0]
  );
}

export default function MarketPulseBar({
  pulse,
  signals,
  query,
  searchResults,
  isMobile,
  onQueryChange,
  onSelectResult,
}: Props) {
  const ranked = [...pulse.sectors]
    .filter((sector) => sector.currentRank != null)
    .sort(
      (left, right) =>
        left.currentRank! - right.currentRank! ||
        left.sectorId.localeCompare(right.sectorId),
    );
  const visible = ranked.slice(0, isMobile ? 3 : 5);
  const biggestMover = [...ranked]
    .filter((sector) => sector.rankChange != null)
    .sort(
      (left, right) =>
        Math.abs(right.rankChange!) - Math.abs(left.rankChange!) ||
        left.currentRank! - right.currentRank!,
    )[0];

  return (
    <section
      aria-label="市场脉搏与搜索"
      style={{
        background: "#ffffff",
        borderBottom: "1px solid #e5e7eb",
        padding: isMobile ? "6px 8px" : "8px 16px",
        display: "flex",
        alignItems: "stretch",
        gap: 8,
        minHeight: isMobile ? 72 : 76,
        overflowX: "auto",
        flexShrink: 0,
      }}
    >
      <div
        style={{
          minWidth: isMobile ? 112 : 142,
          padding: "7px 9px",
          borderRadius: 8,
          background: pulse.quality === "ok" ? "#f8fafc" : "#fff7ed",
          border: "1px solid #e5e7eb",
        }}
      >
        <div style={{ fontSize: 11, fontWeight: 700, color: "#1f2328" }}>
          市场脉搏
        </div>
        <div style={{ marginTop: 4, fontSize: 12, fontWeight: 700, color: "#334155" }}>
          广度 {formatRatio(pulse.marketBreadthRatio)}
        </div>
        <div style={{ marginTop: 2, fontSize: 9, color: "#94a3b8" }}>
          n={pulse.marketBreadthSampleSize}
          {pulse.previousRankDate ? ` · 对比 ${pulse.previousRankDate.slice(5)}` : " · 历史不足"}
        </div>
        {biggestMover?.rankChange != null && (
          <div style={{ marginTop: 2, fontSize: 9, color: "#64748b" }}>
            最大变动 {biggestMover.sectorName} {rankChangeLabel(biggestMover)}
          </div>
        )}
      </div>

      <div
        aria-label="领先板块"
        style={{ display: "flex", gap: 6, flex: "1 0 auto" }}
      >
        {visible.map((sector) => {
          const signal = signals.get(sector.sectorId);
          const contributors = sector.topContributors
            .slice(0, 2)
            .map((item) => item.symbol)
            .join("/");
          const title = [
            signal?.reason,
            `中位数 ${formatPct(sector.medianReturn)}`,
            `前三贡献集中度 ${formatRatio(sector.top3ConcentrationRatio)}`,
            `历史样本 ${sector.historySampleSize}`,
          ]
            .filter(Boolean)
            .join("；");
          return (
            <button
              key={sector.sectorId}
              type="button"
              onClick={() =>
                onSelectResult({
                  kind: "sector",
                  id: sector.sectorId,
                  label: sector.sectorName,
                  secondaryLabel: "领先板块",
                  sectorIds: [sector.sectorId],
                })
              }
              title={title}
              aria-label={`${sector.sectorName}，当前第 ${sector.currentRank} 名，${rankChangeLabel(sector)}，上涨广度 ${formatRatio(sector.breadthRatio)}`}
              style={{
                width: isMobile ? 118 : 132,
                minWidth: isMobile ? 118 : 132,
                padding: "6px 8px",
                textAlign: "left",
                background: signal ? "#fff7ed" : "#ffffff",
                border: signal ? "1px solid #fdba74" : "1px solid #e5e7eb",
                borderRadius: 8,
                cursor: "pointer",
                color: "#1f2328",
              }}
            >
              <div style={{ display: "flex", justifyContent: "space-between", gap: 4 }}>
                <span
                  style={{
                    fontSize: 11,
                    fontWeight: 700,
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                    whiteSpace: "nowrap",
                  }}
                >
                  #{sector.currentRank} {sector.sectorName}
                </span>
                <span
                  style={{
                    fontSize: 10,
                    fontWeight: 700,
                    color:
                      (sector.rankChange ?? 0) > 0
                        ? "#c81e1e"
                        : (sector.rankChange ?? 0) < 0
                          ? "#238636"
                          : "#64748b",
                  }}
                >
                  {rankChangeLabel(sector)}
                </span>
              </div>
              <div style={{ marginTop: 4, fontSize: 10, color: "#475569" }}>
                广度 {formatRatio(sector.breadthRatio)} · {formatPct(sector.currentReturn)}
              </div>
              <div
                style={{
                  marginTop: 3,
                  fontSize: 9,
                  color: signal ? "#c2410c" : "#94a3b8",
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                  whiteSpace: "nowrap",
                }}
              >
                {signal
                  ? `${signal.icon} ${signal.label}`
                  : contributors
                    ? `贡献 ${contributors}`
                    : "贡献数据不足"}
              </div>
            </button>
          );
        })}
      </div>

      <form
        role="search"
        onSubmit={(event) => {
          event.preventDefault();
          const result = exactOrFirstResult(query, searchResults);
          if (result) onSelectResult(result);
        }}
        style={{
          minWidth: isMobile ? 154 : 190,
          width: isMobile ? 154 : 210,
          padding: "5px 7px",
          borderRadius: 8,
          background: "#f8fafc",
          border: "1px solid #e5e7eb",
          display: "flex",
          flexDirection: "column",
          justifyContent: "center",
        }}
      >
        <label htmlFor="market-search" style={{ fontSize: 9, color: "#64748b", marginBottom: 3 }}>
          搜索并高亮币种 / 板块
        </label>
        <div style={{ display: "flex", gap: 4 }}>
          <input
            id="market-search"
            list="market-search-options"
            value={query}
            onChange={(event) => onQueryChange(event.target.value)}
            placeholder="BTC、Bitcoin、AI…"
            autoComplete="off"
            style={{
              minWidth: 0,
              flex: 1,
              border: "1px solid #cbd5e1",
              borderRadius: 6,
              padding: "5px 7px",
              fontSize: 11,
              color: "#1f2328",
              background: "#ffffff",
            }}
          />
          {query && (
            <button
              type="button"
              onClick={() => onQueryChange("")}
              aria-label="清空搜索"
              title="清空搜索"
              style={{
                border: "none",
                background: "transparent",
                color: "#94a3b8",
                cursor: "pointer",
                padding: "2px 4px",
              }}
            >
              ✕
            </button>
          )}
        </div>
        <datalist id="market-search-options">
          {searchResults.slice(0, 12).map((result) => (
            <option
              key={`${result.kind}-${result.id}`}
              value={result.label}
            >
              {result.secondaryLabel}
            </option>
          ))}
        </datalist>
        <div aria-live="polite" style={{ marginTop: 3, fontSize: 9, color: "#94a3b8" }}>
          {!query.trim()
            ? "输入后即时定位"
            : searchResults.length > 0
              ? `${searchResults.length} 个匹配 · Enter 打开/定位`
              : "没有匹配结果"}
        </div>
      </form>
    </section>
  );
}
