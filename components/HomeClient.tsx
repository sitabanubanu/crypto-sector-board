"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Header from "@/components/Header";
import SectorTreemap from "@/components/SectorTreemap";
import TrendBarChart from "@/components/TrendBarChart";
import WatchlistEditor from "@/components/WatchlistEditor";
import {
  loadWatchlist,
  toggleSector,
  resetWatchlist,
  filterSnapshotByWatchlist,
  addCustomSector,
  updateCustomSector,
  deleteCustomSector,
} from "@/lib/watchlist";
import {
  fetchOkxSpotTickers,
  buildSnapshotFromOkx,
  buildCustomSectorsFromOkx,
  getOkxUsdtSpotIds,
} from "@/lib/okx";
import type { DailySnapshot, PeriodType, WatchlistConfig, SectorConfig, OkxTicker, CustomSectorConfig } from "@/lib/types";

interface Props {
  snapshot: DailySnapshot;
}

const OKX_REFRESH_MS = 30000;

export default function HomeClient({ snapshot }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState({ width: 0, height: 0 });
  const [viewMode, setViewMode] = useState<"detailed" | "overview">("detailed");
  const [period, setPeriod] = useState<PeriodType>("24h");
  const [okxData, setOkxData] = useState<DailySnapshot | null>(null);
  const [okxTickers, setOkxTickers] = useState<Map<string, OkxTicker> | null>(null);
  const [okxStatus, setOkxStatus] = useState<"idle" | "loading" | "live" | "error">("idle");
  const [mainView, setMainView] = useState<"split" | "chart" | "treemap">("split");
  const [watchlistOpen, setWatchlistOpen] = useState(false);
  const [watchlistConfig, setWatchlistConfig] = useState<WatchlistConfig>(() =>
    loadWatchlist(snapshot.sectors.map((s) => s.id)),
  );

  // Size observer
  useEffect(() => {
    let rafId: number;
    const updateSize = () => {
      if (containerRef.current) {
        const rect = containerRef.current.getBoundingClientRect();
        setSize({ width: rect.width, height: rect.height });
      }
    };
    updateSize();
    const debouncedUpdate = () => {
      cancelAnimationFrame(rafId);
      rafId = requestAnimationFrame(updateSize);
    };
    window.addEventListener("resize", debouncedUpdate);
    return () => {
      window.removeEventListener("resize", debouncedUpdate);
      cancelAnimationFrame(rafId);
    };
  }, []);

  // Sector config for OKX merging
  const sectorConfig = useMemo<SectorConfig[]>(
    () => snapshot.sectors.map((s) => ({ id: s.id, name: s.name, coins: s.coins.map((c) => c.id) })),
    [snapshot],
  );

  // Fetch OKX data
  const fetchOkx = useCallback(async () => {
    setOkxStatus((prev) => (prev === "idle" ? "loading" : prev));
    try {
      const tickers = await fetchOkxSpotTickers();
      setOkxTickers(tickers);
      const merged = buildSnapshotFromOkx(sectorConfig, tickers, snapshot);
      if (merged.sectors.length > 0) {
        setOkxData(merged);
        setOkxStatus("live");
      }
    } catch {
      setOkxStatus("error");
    }
  }, [sectorConfig, snapshot]);

  // Fetch OKX on mount + auto-refresh
  useEffect(() => {
    fetchOkx();
    const id = setInterval(fetchOkx, OKX_REFRESH_MS);
    return () => clearInterval(id);
  }, [fetchOkx]);

  // Watchlist callbacks
  const handleWatchlistToggle = useCallback((sectorId: string) => {
    setWatchlistConfig((prev) => toggleSector(prev, sectorId));
  }, []);

  const handleWatchlistReset = useCallback(() => {
    setWatchlistConfig(resetWatchlist(snapshot.sectors.map((s) => s.id)));
  }, [snapshot.sectors]);

  // Custom sector callbacks
  const handleAddCustomSector = useCallback((name: string, coins: string[]) => {
    setWatchlistConfig((prev) => addCustomSector(prev, name, coins));
  }, []);

  const handleUpdateCustomSector = useCallback((id: string, name: string, coins: string[]) => {
    setWatchlistConfig((prev) => updateCustomSector(prev, id, name, coins));
  }, []);

  const handleDeleteCustomSector = useCallback((id: string) => {
    setWatchlistConfig((prev) => deleteCustomSector(prev, id));
  }, []);

  // Active snapshot: OKX real-time + custom sectors merged
  const activeSnapshot = useMemo(() => {
    const raw = okxData ?? snapshot;
    const filtered = filterSnapshotByWatchlist(raw, watchlistConfig);

    // Build custom sectors from OKX data
    const customSectorsConfig = watchlistConfig.customSectors ?? [];
    let customSectorSnapshots: DailySnapshot["sectors"] = [];
    if (customSectorsConfig.length > 0 && okxTickers) {
      const built = buildCustomSectorsFromOkx(customSectorsConfig, okxTickers, snapshot);
      customSectorSnapshots = built.filter(
        (s) => watchlistConfig.sectors[s.id]?.enabled !== false,
      );
    }

    return {
      ...filtered,
      sectors: [...filtered.sectors, ...customSectorSnapshots],
      generatedAt: (okxData ?? filtered).generatedAt,
      source: (okxData ?? filtered).source,
    };
  }, [okxData, okxTickers, snapshot, watchlistConfig]);

  // Derived data for UI
  const okxUsdtIds = useMemo(() => {
    if (!okxTickers) return [] as string[];
    return getOkxUsdtSpotIds(okxTickers);
  }, [okxTickers]);

  const customSectors: CustomSectorConfig[] = watchlistConfig.customSectors ?? [];

  // Build metadata maps (names + coin counts) for ALL sectors including custom
  const allSectorNames: Record<string, string> = {};
  const allCoinCounts: Record<string, number> = {};
  const allSectorIds: string[] = [];

  // Built-in
  for (const s of snapshot.sectors) {
    allSectorNames[s.id] = s.name;
    allCoinCounts[s.id] = s.coins.length;
    allSectorIds.push(s.id);
  }
  // Custom
  for (const cs of customSectors) {
    allSectorNames[cs.id] = cs.name;
    allCoinCounts[cs.id] = cs.coins.length;
    allSectorIds.push(cs.id);
  }

  // Stats for Header
  const totalCoins = activeSnapshot.sectors.reduce((sum, s) => sum + s.coins.length, 0);

  return (
    <div
      style={{
        height: "100vh",
        display: "flex",
        flexDirection: "column",
        background: "#f5f6f8",
        overflow: "hidden",
      }}
    >
      <Header
        date={activeSnapshot.date}
        generatedAt={activeSnapshot.generatedAt}
        totalSectors={activeSnapshot.sectors.length}
        totalCoins={totalCoins}
        viewMode={viewMode}
        onViewModeChange={setViewMode}
        period={period}
        onPeriodChange={setPeriod}
        okxStatus={okxStatus}
        onOpenWatchlist={() => setWatchlistOpen(true)}
      />
      <div style={{ flex: 1, display: "flex", flexDirection: "column", minHeight: 0, position: "relative" }}>
        <div
          ref={containerRef}
          style={{
            flex: mainView === "chart" ? "0 0 0px" : mainView === "treemap" ? "1 1 0%" : "7 1 0%",
            position: "relative",
            minHeight: 0,
            overflow: mainView === "chart" ? "hidden" : "visible",
          }}
        >
          {size.width > 0 && size.height > 0 && (
            <SectorTreemap
              snapshot={activeSnapshot}
              width={size.width}
              height={size.height}
              viewMode={viewMode}
              period={period}
            />
          )}
        </div>
        <div
          style={{
            flex: mainView === "treemap" ? "0 0 0px" : mainView === "chart" ? "1 1 0%" : "3 1 0%",
            minHeight: 0,
            overflow: mainView === "treemap" ? "hidden" : "auto",
          }}
        >
          <TrendBarChart sectors={activeSnapshot.sectors} />
        </div>

        {/* View toggle — bottom-left corner */}
        <button
          onClick={() => {
            const next: Record<string, "split" | "chart" | "treemap"> = {
              split: "chart",
              chart: "treemap",
              treemap: "split",
            };
            setMainView(next[mainView]);
          }}
          title="切换视图"
          style={{
            position: "absolute",
            left: 12,
            bottom: 12,
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
        >
          {mainView === "split" ? "▣ 柱状图全屏" : mainView === "chart" ? "▦ 板块全屏" : "⊞ 分屏"}
        </button>
      </div>

      <WatchlistEditor
        open={watchlistOpen}
        sectorIds={allSectorIds}
        sectorNames={allSectorNames}
        sectorCoinCounts={allCoinCounts}
        config={watchlistConfig}
        onToggle={handleWatchlistToggle}
        onReset={handleWatchlistReset}
        onClose={() => setWatchlistOpen(false)}
        okxInstIds={okxUsdtIds}
        customSectors={customSectors}
        onAddCustomSector={handleAddCustomSector}
        onUpdateCustomSector={handleUpdateCustomSector}
        onDeleteCustomSector={handleDeleteCustomSector}
      />
    </div>
  );
}
