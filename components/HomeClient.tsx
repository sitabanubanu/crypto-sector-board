"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Header from "@/components/Header";
import MarketPulseBar from "@/components/MarketPulseBar";
import SectorTreemap from "@/components/SectorTreemap";
import TrendBarChart from "@/components/TrendBarChart";
import WatchlistEditor from "@/components/WatchlistEditor";
import CoinDetailModal from "@/components/CoinDetailModal";
import SectorInsightDrawer from "@/components/SectorInsightDrawer";
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
import { buildMarketPulse, searchMarket, type MarketSearchResult } from "@/lib/market-pulse";
import type { PeriodType, WatchlistConfig, CustomSectorConfig, CoinSnapshot } from "@/lib/types";
import {
  getAssetInsight,
  getAssetQualityResearch,
  getSectorInsight,
} from "@/lib/market-insights";
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
    historyByAssetId,
    status: boardStatus,
  } = useBoardData(initialBoard);
  const snapshot = board.data.snapshot;
  const focusAssets = board.data.focusAssets;
  const isMobile = useIsMobile();
  const containerRef = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState({ width: 0, height: 0 });
  const [viewMode, setViewMode] = useState<"detailed" | "overview">("detailed");
  const [period, setPeriod] = useState<PeriodType>("24h");
  // Start with the board as the primary full-height view. Users can use the
  // bottom-left toggle to switch to the board + data split (or chart-only).
  const [mainView, setMainView] = useState<"split" | "chart" | "treemap">("treemap");
  const [selectedCoin, setSelectedCoin] = useState<{ coin: CoinSnapshot; sectorName: string } | null>(null);
  const [selectedSector, setSelectedSector] = useState<import("@/lib/types").SectorSnapshot | null>(null);
  const [statusBarMode, setStatusBarMode] = useState<"full" | "compact" | "hidden">("compact");
  const [watchlistOpen, setWatchlistOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  useEffect(() => {
    const timer = window.setTimeout(() => {
      try {
        const stored = window.localStorage.getItem("crypto-sector-board:status-bar-mode");
        if (stored === "full" || stored === "compact" || stored === "hidden") {
          setStatusBarMode(stored);
        }
      } catch {
        // Keep the compact in-memory default when storage is unavailable.
      }
    }, 0);
    return () => window.clearTimeout(timer);
  }, []);
  useEffect(() => {
    try {
      localStorage.setItem("crypto-sector-board:status-bar-mode", statusBarMode);
    } catch {
      // Storage is optional; the current state remains authoritative.
    }
  }, [statusBarMode]);
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

  const marketPulse = useMemo(
    () => buildMarketPulse(activeSnapshot, historyByAssetId),
    [activeSnapshot, historyByAssetId],
  );

  // Versioned, explainable signals derived from rank changes and anomalies.
  const signals = useMemo(
    () => detectAllSignals(marketPulse.sectors),
    [marketPulse.sectors],
  );

  // Correlation matrix uses one compact, batched database history response.
  const correlationMatrix = useMemo(() => {
    if (historyByAssetId.size === 0) return null;
    return buildCorrelationMatrix(activeSnapshot.sectors, historyByAssetId);
  }, [activeSnapshot.sectors, historyByAssetId]);

  const searchResults = useMemo(
    () => searchMarket(activeSnapshot, searchQuery),
    [activeSnapshot, searchQuery],
  );
  const hasSearchHighlight =
    searchQuery.trim().length > 0 && searchResults.length > 0;
  const highlightedAssetIds = useMemo(
    () =>
      new Set(
        searchResults.flatMap((result) =>
          result.kind === "asset" ? [result.id] : [],
        ),
      ),
    [searchResults],
  );
  const highlightedSectorIds = useMemo(
    () => new Set(searchResults.flatMap((result) => result.sectorIds)),
    [searchResults],
  );

  const handleSearchSelect = useCallback(
    (result: MarketSearchResult) => {
      setSearchQuery(result.label);
      if (result.kind === "sector") {
        const sector = activeSnapshot.sectors.find((candidate) => candidate.id === result.id);
        if (sector) {
          setSelectedCoin(null);
          setSelectedSector(sector);
        }
        return;
      }
      for (const sector of activeSnapshot.sectors) {
        const coin = sector.coins.find((candidate) => candidate.id === result.id);
        if (coin) {
          setSelectedCoin({ coin, sectorName: sector.name });
          return;
        }
      }
    },
    [activeSnapshot.sectors],
  );

  const handleSectorClick = useCallback((sector: import("@/lib/types").SectorSnapshot) => {
    setSelectedCoin(null);
    setSelectedSector(sector);
  }, []);

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
        statusBarMode={statusBarMode}
        onStatusBarModeChange={setStatusBarMode}
      />
      {statusBarMode !== "hidden" && (
        <MarketPulseBar
          pulse={marketPulse}
          signals={signals}
          query={searchQuery}
          searchResults={searchResults}
          isMobile={isMobile}
          onQueryChange={setSearchQuery}
          onSelectResult={handleSearchSelect}
        />
      )}
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
              focusAssets={focusAssets}
              highlightedAssetIds={highlightedAssetIds}
              highlightedSectorIds={highlightedSectorIds}
              hasSearchHighlight={hasSearchHighlight}
              onCoinClick={(coin, sectorName) => setSelectedCoin({ coin, sectorName })}
              onSectorClick={handleSectorClick}
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
          <TrendBarChart
            sectors={activeSnapshot.sectors}
            signals={signals}
            isMobile={isMobile}
            highlightedSectorIds={highlightedSectorIds}
            hasSearchHighlight={hasSearchHighlight}
          />
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
          {mainView === "split" ? "▣ 柱状图全屏" : mainView === "chart" ? "▦ 板块全屏" : "⊞ 看板 + 数据"}
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
          insight={getAssetInsight(selectedCoin.coin.id)}
          qualityResearch={getAssetQualityResearch(selectedCoin.coin.id)}
          closes={closesByAssetId.get(selectedCoin.coin.id)}
          onClose={() => setSelectedCoin(null)}
        />
      )}

      {selectedSector && (
        <SectorInsightDrawer
          sector={selectedSector}
          insight={getSectorInsight(selectedSector.id)}
          period={period}
          isMobile={isMobile}
          onClose={() => setSelectedSector(null)}
        />
      )}
    </div>
  );
}
