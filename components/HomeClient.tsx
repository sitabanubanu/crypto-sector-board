"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Header from "@/components/Header";
import SectorTreemap from "@/components/SectorTreemap";
import TrendBarChart from "@/components/TrendBarChart";
import WatchlistEditor from "@/components/WatchlistEditor";
import CoinDetailModal from "@/components/CoinDetailModal";
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
  fetchGateSpotTickers,
  fetchGateKlines,
  buildSnapshotFromGate,
  buildCustomSectorsFromGate,
  getGateUsdtSpotIds,
  CG_TO_GATE,
} from "@/lib/gate";
import { detectAllSignals } from "@/lib/signals";
import type { DailySnapshot, PeriodType, WatchlistConfig, SectorConfig, CustomSectorConfig, CoinSnapshot, SectorSnapshot } from "@/lib/types";

interface Props {
  snapshot: DailySnapshot;
}

const OKX_REFRESH_MS = 30000;

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

export default function HomeClient({ snapshot }: Props) {
  const isMobile = useIsMobile();
  const containerRef = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState({ width: 0, height: 0 });
  const [viewMode, setViewMode] = useState<"detailed" | "overview">("detailed");
  const [period, setPeriod] = useState<PeriodType>("24h");
  const [okxData, setOkxData] = useState<DailySnapshot | null>(null);
  const [okxTickers, setOkxTickers] = useState<Map<string, { currency_pair: string; last: string; high_24h: string; low_24h: string; base_volume: string; quote_volume: string; change_percentage: string }> | null>(null);
  const [okxStatus, setOkxStatus] = useState<"idle" | "loading" | "live" | "error">("idle");
  const [okxKlines, setOkxKlines] = useState<Map<string, number[]> | null>(null);
  const [mainView, setMainView] = useState<"split" | "chart" | "treemap">("split");
  const [selectedCoin, setSelectedCoin] = useState<{ coin: CoinSnapshot; sectorName: string } | null>(null);
  const [watchlistOpen, setWatchlistOpen] = useState(false);
  const [watchlistConfig, setWatchlistConfig] = useState<WatchlistConfig>(() =>
    loadWatchlist(snapshot.sectors.map((s) => s.id)),
  );

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

  // Sector config for OKX merging
  const sectorConfig = useMemo<SectorConfig[]>(
    () => snapshot.sectors.map((s) => ({ id: s.id, name: s.name, coins: s.coins.map((c) => c.id) })),
    [snapshot],
  );

  // Fetch Gate.io data
  const fetchOkx = useCallback(async () => {
    setOkxStatus((prev) => (prev === "idle" ? "loading" : prev));
    try {
      const tickers = await fetchGateSpotTickers();
      setOkxTickers(tickers);

      // Collect instIds only for coins we track (built-in + custom sectors)
      const needed = new Set<string>();
      for (const sc of sectorConfig) {
        for (const coinId of sc.coins) {
          const gateId = CG_TO_GATE[coinId];
          if (gateId) needed.add(gateId);
        }
      }
      for (const cs of watchlistConfig.customSectors ?? []) {
        for (const instId of cs.coins) needed.add(instId);
      }
      const klines = needed.size > 0
        ? await fetchGateKlines([...needed])
        : new Map<string, number[]>();
      setOkxKlines(klines);

      // Build snapshot with klines data
      const merged = buildSnapshotFromGate(sectorConfig, tickers, snapshot, klines);
      if (merged.sectors.length > 0) {
        setOkxData(merged);
        setOkxStatus("live");
      }
    } catch {
      setOkxStatus("error");
    }
  }, [sectorConfig, snapshot, watchlistConfig]);

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

  // Active snapshot: Gate.io real-time + custom sectors merged
  const activeSnapshot = useMemo(() => {
    const raw = okxData ?? snapshot;
    const filtered = filterSnapshotByWatchlist(raw, watchlistConfig);

    // Build custom sectors from Gate.io data
    const customSectorsConfig = watchlistConfig.customSectors ?? [];
    let customSectorSnapshots: DailySnapshot["sectors"] = [];
    if (customSectorsConfig.length > 0 && okxTickers) {
      const built = buildCustomSectorsFromGate(customSectorsConfig, okxTickers, snapshot, okxKlines ?? undefined);
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
  }, [okxData, okxTickers, snapshot, watchlistConfig, okxKlines]);

  // Sector rotation signals
  const signals = useMemo(() => detectAllSignals(activeSnapshot.sectors), [activeSnapshot.sectors]);

  // Total volume across all sectors for volume dot scaling
  const totalVolume = useMemo(
    () => activeSnapshot.sectors.reduce((sum, s) => sum + (s.totalVolume24h ?? 0), 0),
    [activeSnapshot.sectors],
  );

  // Coin → sector lookup for detail modal
  const coinSector = useMemo(() => {
    for (const s of activeSnapshot.sectors) {
      for (const c of s.coins) {
        if (c.id === selectedCoin?.coin.id) return s;
      }
    }
    return undefined;
  }, [activeSnapshot.sectors, selectedCoin]);

  // Derived data for UI
  const gateUsdtIds = useMemo(() => {
    if (!okxTickers) return [] as string[];
    return getGateUsdtSpotIds(okxTickers);
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
        totalSectors={activeSnapshot.sectors.length}
        totalCoins={totalCoins}
        viewMode={viewMode}
        onViewModeChange={setViewMode}
        period={period}
        onPeriodChange={setPeriod}
        okxStatus={okxStatus}
        onOpenWatchlist={() => setWatchlistOpen(true)}
        isMobile={isMobile}
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
          <TrendBarChart sectors={activeSnapshot.sectors} signals={signals} totalVolume={totalVolume} isMobile={isMobile} />
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
        okxInstIds={gateUsdtIds}
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
          onClose={() => setSelectedCoin(null)}
        />
      )}
    </div>
  );
}
