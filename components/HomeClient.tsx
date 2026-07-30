"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Header from "@/components/Header";
import SectorTreemap from "@/components/SectorTreemap";
import TrendBarChart from "@/components/TrendBarChart";
import WatchlistEditor from "@/components/WatchlistEditor";
import CoinDetailModal from "@/components/CoinDetailModal";
import CorrelationHeatmap from "@/components/CorrelationHeatmap";
import { useBoardData } from "@/components/board/use-board-data";
import {
  loadWatchlist,
  saveWatchlist,
  toggleSector,
  resetWatchlist,
  filterSnapshotByWatchlist,
  addCustomSector,
  updateCustomSector,
  deleteCustomSector,
} from "@/lib/watchlist";
import {
  PRESETS,
  PRESET_STORAGE_KEY,
  applyPreset,
  findMatchingPresetId,
} from "@/lib/presets";
import { buildCustomSectorSnapshots } from "@/lib/market-data/custom-sectors";
import { detectAllSignals } from "@/lib/signals";
import { buildCorrelationMatrix } from "@/lib/correlation";
import type { PeriodType, WatchlistConfig, SectorConfig, CustomSectorConfig, CoinSnapshot } from "@/lib/types";
import type { BoardResponse } from "@/lib/market-data/bff-contracts";

interface Props {
  initialBoard: BoardResponse;
}

function useIsMobile() {
  const [isMobile, setIsMobile] = useState(false);
  useEffect(() => {
    const check = () => setIsMobile(window.innerWidth < 640);
    check();
    window.addEventListener("resize", check);
    return () => window.removeEventListener("resize", check);
  }, []);
  return isMobile;
}

export default function HomeClient({ initialBoard }: Props) {
  const {
    board,
    closesByAssetId,
    status: boardStatus,
  } = useBoardData(initialBoard);
  const snapshot = board.data.snapshot;
  const holdings = board.data.holdings;
  const isMobile = useIsMobile();
  const containerRef = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState({ width: 0, height: 0 });
  const [viewMode, setViewMode] = useState<"detailed" | "overview">("detailed");
  const [period, setPeriod] = useState<PeriodType>("24h");
  const [mainView, setMainView] = useState<"split" | "chart" | "treemap">("split");
  const [selectedCoin, setSelectedCoin] = useState<{ coin: CoinSnapshot; sectorName: string } | null>(null);
  const [watchlistOpen, setWatchlistOpen] = useState(false);
  const builtInSectorIdsKey = snapshot.sectors
    .map((sector) => sector.id)
    .join(",");
  const builtInSectorIds = useMemo(
    () => builtInSectorIdsKey.split(",").filter(Boolean),
    [builtInSectorIdsKey],
  );
  const [watchlistConfig, setWatchlistConfig] = useState<WatchlistConfig>(() => ({
    version: 2,
    sectors: Object.fromEntries(
      snapshot.sectors.map((sector) => [sector.id, { enabled: true }]),
    ),
    customSectors: [],
  }));
  const [watchlistLoaded, setWatchlistLoaded] = useState(false);
  const activePreset =
    findMatchingPresetId(watchlistConfig, builtInSectorIds) ?? "";

  useEffect(() => {
    const timer = window.setTimeout(() => {
      setWatchlistConfig(loadWatchlist(builtInSectorIds));
      setWatchlistLoaded(true);
    }, 0);

    return () => window.clearTimeout(timer);
  }, [builtInSectorIds]);

  useEffect(() => {
    if (!watchlistLoaded) return;

    saveWatchlist(watchlistConfig);
    try {
      if (activePreset) {
        localStorage.setItem(PRESET_STORAGE_KEY, activePreset);
      } else {
        localStorage.removeItem(PRESET_STORAGE_KEY);
      }
    } catch {
      // Storage can be unavailable; in-memory state remains authoritative.
    }
  }, [activePreset, watchlistConfig, watchlistLoaded]);

  // Size observer — ResizeObserver on container + window resize fallback
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    const updateSize = () => {
      const rect = el.getBoundingClientRect();
      setSize({ width: rect.width, height: rect.height });
    };
    updateSize();

    // ResizeObserver catches layout changes (flex, view toggle, etc.)
    const ro = new ResizeObserver(() => updateSize());
    ro.observe(el);

    // Window resize as fallback
    let rafId: number;
    const debouncedResize = () => {
      cancelAnimationFrame(rafId);
      rafId = requestAnimationFrame(updateSize);
    };
    window.addEventListener("resize", debouncedResize);

    return () => {
      ro.disconnect();
      window.removeEventListener("resize", debouncedResize);
      cancelAnimationFrame(rafId);
    };
  }, []);

  // Canonical sector config used by the historical correlation view.
  const sectorConfig = useMemo<SectorConfig[]>(
    () => snapshot.sectors.map((s) => ({ id: s.id, name: s.name, coins: s.coins.map((c) => c.id) })),
    [snapshot],
  );

  // Watchlist callbacks
  const handleWatchlistToggle = useCallback((sectorId: string) => {
    setWatchlistConfig((prev) => toggleSector(prev, sectorId));
  }, []);

  const handleWatchlistReset = useCallback(() => {
    setWatchlistConfig(resetWatchlist(builtInSectorIds));
  }, [builtInSectorIds]);

  // Preset switch
  const handlePresetChange = useCallback((presetId: string) => {
    const preset = PRESETS.find((p) => p.id === presetId);
    if (!preset) return;
    setWatchlistConfig((prev) =>
      applyPreset(prev, preset, builtInSectorIds),
    );
  }, [builtInSectorIds]);

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

  // Active snapshot: BFF data filtered by the local watchlist.
  const activeSnapshot = useMemo(() => {
    const filtered = filterSnapshotByWatchlist(snapshot, watchlistConfig);

    const customSectorsConfig = watchlistConfig.customSectors ?? [];
    const customSectorSnapshots = buildCustomSectorSnapshots(
      customSectorsConfig,
      snapshot,
    ).filter(
        (s) => watchlistConfig.sectors[s.id]?.enabled !== false,
      );

    return {
      ...filtered,
      sectors: [...filtered.sectors, ...customSectorSnapshots],
    };
  }, [snapshot, watchlistConfig]);

  // Sector rotation signals
  const signals = useMemo(() => detectAllSignals(activeSnapshot.sectors), [activeSnapshot.sectors]);

  // Correlation matrix uses one compact, batched database history response.
  const correlationMatrix = useMemo(() => {
    if (closesByAssetId.size === 0) return null;
    return buildCorrelationMatrix(sectorConfig, closesByAssetId);
  }, [closesByAssetId, sectorConfig]);

  // Coin → sector lookup for detail modal
  const coinSector = useMemo(() => {
    for (const s of activeSnapshot.sectors) {
      for (const c of s.coins) {
        if (c.id === selectedCoin?.coin.id) return s;
      }
    }
    return undefined;
  }, [activeSnapshot.sectors, selectedCoin]);

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
        height: "100dvh",
        display: "flex",
        flexDirection: "column",
        background: "#f5f6f8",
        overflow: "hidden",
      }}
    >
      <Header
        date={activeSnapshot.date}
        generatedAt={activeSnapshot.generatedAt}
        dataQuality={activeSnapshot.dataQuality}
        totalSectors={activeSnapshot.sectors.length}
        totalCoins={totalCoins}
        viewMode={viewMode}
        onViewModeChange={setViewMode}
        period={period}
        onPeriodChange={setPeriod}
        refreshStatus={boardStatus}
        dataBackend={board.meta.backend}
        dataSources={board.meta.sources}
        dualRead={board.meta.dualRead}
        onOpenWatchlist={() => setWatchlistOpen(true)}
        isMobile={isMobile}
        activePreset={activePreset}
        onPresetChange={handlePresetChange}
      />
      <div style={{ flex: 1, display: "flex", flexDirection: "column", minHeight: 0, position: "relative" }}>
        <div
          ref={containerRef}
          style={{
            flex: mainView === "chart" ? "0 0 0px" : mainView === "treemap" ? "1 1 0%" : isMobile ? "5 1 0%" : "7 1 0%",
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
              signals={signals}
              holdings={holdings}
              onCoinClick={(coin, sectorName) => setSelectedCoin({ coin, sectorName })}
            />
          )}
        </div>
        <div
          style={{
            flex: mainView === "treemap" ? "0 0 0px" : mainView === "chart" ? "1 1 0%" : isMobile ? "5 1 0%" : "3 1 0%",
            minHeight: 0,
            overflow: mainView === "treemap" ? "hidden" : "auto",
          }}
        >
          <TrendBarChart sectors={activeSnapshot.sectors} signals={signals} isMobile={isMobile} />
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

      <CorrelationHeatmap matrix={correlationMatrix} isMobile={isMobile} />

      <WatchlistEditor
        open={watchlistOpen}
        sectorIds={allSectorIds}
        sectorNames={allSectorNames}
        sectorCoinCounts={allCoinCounts}
        config={watchlistConfig}
        onToggle={handleWatchlistToggle}
        onReset={handleWatchlistReset}
        onClose={() => setWatchlistOpen(false)}
        assets={board.data.assets}
        customSectors={customSectors}
        onAddCustomSector={handleAddCustomSector}
        onUpdateCustomSector={handleUpdateCustomSector}
        onDeleteCustomSector={handleDeleteCustomSector}
      />

      {selectedCoin && coinSector && (
        <CoinDetailModal
          coin={selectedCoin.coin}
          sectorName={selectedCoin.sectorName}
          sector={coinSector}
          closes={closesByAssetId.get(selectedCoin.coin.id)}
          onClose={() => setSelectedCoin(null)}
        />
      )}
    </div>
  );
}
