import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import SectorInsightDrawer from "../components/SectorInsightDrawer";
import { resolveDetailSelection } from "../lib/detail-selection";
import type { SectorInsight } from "../lib/market-insights";
import type { SectorSnapshot } from "../lib/types";

const sector: SectorSnapshot = {
  id: "defi",
  name: "DeFi",
  totalMarketCap: 1_000_000,
  totalVolume24h: 50_000,
  weightedReturnPct: 0.02,
  weightedAmplitude: 0.03,
  weightedVolatility: 0.01,
  coins: [
    {
      id: "aave",
      symbol: "AAVE",
      name: "Aave",
      marketCap: 100_000,
      open: 99,
      high: 102,
      low: 98,
      close: 101,
      returnPct: 0.02,
      amplitude: 0.04,
      volatility: 0.02,
      volume24h: 5_000,
      isMainstream: false,
    },
  ],
};

const insight: SectorInsight = {
  sectorId: "defi",
  tagline: "开放金融协议",
  marketRole: "链上金融基础设施",
  whatItDoes: "提供无需许可的金融服务",
  targetUsers: ["链上用户"],
  demand: ["交易与借贷"],
  marketSize: {
    summary: "使用链上市值和成交量做代理指标。",
    proxies: ["总锁仓量"],
    asOf: "2026-08-28",
    caveat: "地址数量不等于真实用户数量。",
    sources: ["https://example.com/research"],
  },
  risks: ["智能合约风险"],
};

describe("detail selection", () => {
  it("keeps sector and coin details mutually exclusive", () => {
    const sectorDetail = resolveDetailSelection(
      { kind: "sector", sectorId: "defi" },
      [sector],
    );
    const coinDetail = resolveDetailSelection(
      { kind: "coin", sectorId: "defi", coinId: "aave" },
      [sector],
    );

    expect(sectorDetail).toEqual({ kind: "sector", sector });
    expect(coinDetail).toEqual({
      kind: "coin",
      sector,
      coin: sector.coins[0],
    });
  });

  it("resolves against the newest snapshot and drops missing targets", () => {
    const refreshed = { ...sector, name: "DeFi（已刷新）" };

    expect(
      resolveDetailSelection(
        { kind: "sector", sectorId: "defi" },
        [refreshed],
      ),
    ).toEqual({ kind: "sector", sector: refreshed });
    expect(
      resolveDetailSelection(
        { kind: "coin", sectorId: "defi", coinId: "missing" },
        [refreshed],
      ),
    ).toBeNull();
  });
});

describe("sector insight drawer rendering", () => {
  it("leaves the desktop board interactive without claiming modality", () => {
    const html = renderToStaticMarkup(
      createElement(SectorInsightDrawer, {
        sector,
        insight,
        period: "24h",
        isMobile: false,
        onClose: vi.fn(),
      }),
    );

    expect(html).not.toContain("sector-insight-backdrop");
    expect(html).not.toContain('aria-modal="true"');
  });

  it("keeps the mobile bottom sheet modal and backdrop-dismissible", () => {
    const html = renderToStaticMarkup(
      createElement(SectorInsightDrawer, {
        sector,
        insight,
        period: "24h",
        isMobile: true,
        onClose: vi.fn(),
      }),
    );

    expect(html).toContain('data-testid="sector-insight-backdrop"');
    expect(html).toContain('aria-modal="true"');
  });
});
