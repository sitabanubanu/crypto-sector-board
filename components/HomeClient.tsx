"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Header from "@/components/Header";
import SectorTreemap from "@/components/SectorTreemap";
import TrendBarChart from "@/components/TrendBarChart";
import WatchlistEditor from "@/components/WatchlistEditor";
import { loadWatchlist, toggleSector, resetWatchlist, filterSnapshotByWatchlist } from "@/lib/watchlist";
import { fetchOkxSpotTickers, buildSnapshotFromOkx } from "@/lib/okx";
import type { DailySnapshot, PeriodType, WatchlistConfig, SectorConfig } from "@/lib/types";

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
  const [okxStatus, setOkxStatus] = useState<"idle" | "loading" | "live" | "error">("idle");
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

  // Sector config for OKX merging (derived from snapshot, stable across re-renders)
  const sectorConfig = useMemo<SectorConfig[]>(
    () => snapshot.sectors.map((s) => ({ id: s.id, name: s.name, coins: s.coins.map((c) => c.id) })),
    [snapshot],
  );

  // Fetch OKX data directly from browser
  const fetchOkx = useCallback(async () => {
    setOkxStatus((prev) => (prev === "idle" ? "loading" : prev));
    try {
      const tickers = await fetchOkxSpotTickers();
      const merged = buildSnapshotFromOkx(sectorConfig, tickers, snapshot);
      if (merged.sectors.length > 0) {
        setOkxData(merged);
        setOkxStatus("live");
      }
    } catch {
      setOkxStatus("error");
    }
  }, [sectorConfig, snapshot]);

  // Fetch OKX immediately on mount, then auto-refresh
  useEffect(() => {
    fetchOkx();
    const id = setInterval(fetchOkx, OKX_REFRESH_MS);
    return () => clearInterval(id);
  }, [fetchOkx]);

  // Handle watchlist toggle
  const handleWatchlistToggle = useCallback((sectorId: string) => {
    setWatchlistConfig((prev) => toggleSector(prev, sectorId));
  }, []);

  const handleWatchlistReset = useCallback(() => {
    setWatchlistConfig(resetWatchlist(snapshot.sectors.map((s) => s.id)));
  }, [snapshot.sectors]);

  // Active snapshot: OKX real-time preferred, fallback to snapshot
  const activeSnapshot = useMemo(() => {
    const raw = okxData ?? snapshot;
    const filtered = filterSnapshotByWatchlist(raw, watchlistConfig);
    if (okxData) {
      return { ...filtered, generatedAt: okxData.generatedAt, source: okxData.source };
    }
    return filtered;
  }, [okxData, snapshot, watchlistConfig]);

  // Stats for Header
  const totalCoins = activeSnapshot.sectors.reduce((sum, s) => sum + s.coins.length, 0);

  // Watchlist editor metadata
  const sectorNames: Record<string, string> = {};
  const sectorCoinCounts: Record<string, number> = {};
  for (const s of activeSnapshot.sectors) {
    sectorNames[s.id] = s.name;
    sectorCoinCounts[s.id] = s.coins.length;
  }

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
      <div style={{ flex: 1, display: "flex", flexDirection: "column", minHeight: 0 }}>
        <div ref={containerRef} style={{ flex: 7, position: "relative", minHeight: 0 }}>
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
        <div style={{ flex: 3, minHeight: 0, overflow: "auto" }}>
          <TrendBarChart sectors={activeSnapshot.sectors} />
        </div>
      </div>

      <WatchlistEditor
        open={watchlistOpen}
        sectorIds={snapshot.sectors.map((s) => s.id)}
        sectorNames={sectorNames}
        sectorCoinCounts={sectorCoinCounts}
        config={watchlistConfig}
        onToggle={handleWatchlistToggle}
        onReset={handleWatchlistReset}
        onClose={() => setWatchlistOpen(false)}
      />
    </div>
  );
}
