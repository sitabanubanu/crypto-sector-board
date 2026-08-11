"use client";

import { useEffect, useRef, type ReactNode } from "react";
import type { SectorSnapshot } from "@/lib/types";
import type { SectorInsight } from "@/lib/market-insights";
import { formatMarketCap, formatPct, getSectorReturn } from "@/lib/colors";
import type { PeriodType } from "@/lib/types";

interface Props {
  sector: SectorSnapshot;
  insight: SectorInsight;
  period: PeriodType;
  isMobile: boolean;
  onClose: () => void;
}

export default function SectorInsightDrawer({
  sector,
  insight,
  period,
  isMobile,
  onClose,
}: Props) {
  const closeRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    closeRef.current?.focus();
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [onClose]);

  return (
    <>
      <div
        aria-hidden="true"
        onClick={onClose}
        style={{
          position: "fixed",
          inset: 0,
          background: "rgba(15, 23, 42, 0.28)",
          zIndex: 220,
        }}
      />
      <aside
        role="dialog"
        aria-modal="true"
        aria-labelledby="sector-insight-title"
        style={{
          position: "fixed",
          zIndex: 221,
          background: "#ffffff",
          boxShadow: "0 20px 60px rgba(15, 23, 42, 0.2)",
          border: "1px solid #e5e7eb",
          ...(isMobile
            ? {
                left: 0,
                right: 0,
                bottom: 0,
                maxHeight: "82vh",
                borderRadius: "16px 16px 0 0",
              }
            : {
                top: 12,
                right: 12,
                bottom: 12,
                width: 390,
                borderRadius: 14,
              }),
          overflow: "auto",
        }}
      >
        <div
          style={{
            position: "sticky",
            top: 0,
            zIndex: 1,
            padding: "16px 18px 12px",
            background: "rgba(255,255,255,0.96)",
            borderBottom: "1px solid #f0f1f3",
            backdropFilter: "blur(8px)",
          }}
        >
          <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 12 }}>
            <div>
              <div style={{ fontSize: 11, color: "#64748b", letterSpacing: 0.5 }}>板块研究档案</div>
              <h2 id="sector-insight-title" style={{ margin: "4px 0 2px", fontSize: 20, lineHeight: 1.2, color: "#0f172a" }}>
                {sector.name}
              </h2>
              <div style={{ fontSize: 12, color: "#64748b", lineHeight: 1.5 }}>{insight.tagline}</div>
            </div>
            <button
              ref={closeRef}
              type="button"
              onClick={onClose}
              aria-label="关闭板块详情"
              style={{ border: "none", background: "#f1f5f9", color: "#475569", borderRadius: 8, width: 32, height: 32, cursor: "pointer", fontSize: 18, lineHeight: 1 }}
            >
              ×
            </button>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 8, marginTop: 14 }}>
            <Metric label="板块市值" value={formatMarketCap(sector.totalMarketCap)} />
            <Metric label="24h 成交额" value={formatMarketCap(sector.totalVolume24h)} />
            <Metric label="当前表现" value={formatPct(getSectorReturn(sector, period))} />
          </div>
        </div>

        <div style={{ padding: "16px 18px 24px", display: "grid", gap: 16 }}>
          <Section title="它在市场中的位置">
            <p>{insight.marketRole}</p>
            <p><strong>主要作用：</strong>{insight.whatItDoes}</p>
          </Section>
          <Section title="解决谁的什么需求">
            <LabelList label="目标用户" items={insight.targetUsers} />
            <LabelList label="核心需求" items={insight.demand} />
          </Section>
          <Section title="需求规模（代理口径）">
            <p>{insight.marketSize.summary}</p>
            <LabelList label="可观测指标" items={insight.marketSize.proxies} />
            <p style={{ color: "#b45309", background: "#fffbeb", border: "1px solid #fde68a", borderRadius: 8, padding: "8px 10px" }}>
              <strong>口径限制：</strong>{insight.marketSize.caveat}
            </p>
            <div style={{ fontSize: 11, color: "#94a3b8" }}>资料复核日期：{insight.marketSize.asOf}</div>
          </Section>
          <Section title="主要风险">
            <LabelList items={insight.risks} />
          </Section>
          <Section title="资料来源">
            <div style={{ display: "grid", gap: 5 }}>
              {insight.marketSize.sources.map((source) => (
                <a key={source} href={source} target="_blank" rel="noreferrer" style={{ color: "#2563eb", fontSize: 12, overflowWrap: "anywhere" }}>
                  {source}
                </a>
              ))}
            </div>
          </Section>
        </div>
      </aside>
    </>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div style={{ background: "#f8fafc", borderRadius: 8, padding: "8px 9px", minWidth: 0 }}>
      <div style={{ color: "#94a3b8", fontSize: 10 }}>{label}</div>
      <div style={{ color: "#1e293b", fontSize: 12, fontWeight: 700, marginTop: 3, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{value}</div>
    </div>
  );
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section>
      <h3 style={{ margin: "0 0 7px", fontSize: 13, color: "#334155" }}>{title}</h3>
      <div style={{ fontSize: 12, color: "#475569", lineHeight: 1.65 }}>{children}</div>
    </section>
  );
}

function LabelList({ label, items }: { label?: string; items: string[] }) {
  return (
    <div style={{ marginTop: label ? 8 : 0 }}>
      {label && <div style={{ fontSize: 11, color: "#64748b", marginBottom: 3 }}>{label}</div>}
      <ul style={{ margin: 0, paddingLeft: 18 }}>
        {items.map((item) => <li key={item}>{item}</li>)}
      </ul>
    </div>
  );
}
