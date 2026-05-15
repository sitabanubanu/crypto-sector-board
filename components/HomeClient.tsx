"use client";

import { useEffect, useRef, useState } from "react";
import Header from "@/components/Header";
import SectorTreemap from "@/components/SectorTreemap";
import type { DailySnapshot } from "@/lib/types";

interface Props {
  snapshot: DailySnapshot;
}

export default function HomeClient({ snapshot }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState({ width: 0, height: 0 });
  const [viewMode, setViewMode] = useState<"detailed" | "overview">("detailed");

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

  const totalCoins = snapshot.sectors.reduce((sum, s) => sum + s.coins.length, 0);

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
        date={snapshot.date}
        generatedAt={snapshot.generatedAt}
        totalSectors={snapshot.sectors.length}
        totalCoins={totalCoins}
        viewMode={viewMode}
        onViewModeChange={setViewMode}
      />
      <div ref={containerRef} style={{ flex: 1, position: "relative" }}>
        {size.width > 0 && size.height > 0 && (
          <SectorTreemap
            snapshot={snapshot}
            width={size.width}
            height={size.height}
            viewMode={viewMode}
          />
        )}
      </div>
    </div>
  );
}
