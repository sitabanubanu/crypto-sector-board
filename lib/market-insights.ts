import { z } from "zod";
import sectorInsightsData from "@/data/sector-insights.json";
import assetInsightsData from "@/data/asset-insights.json";
import assetQualityResearchData from "@/data/asset-quality-research.json";

const SourceUrlSchema = z.string().url();

export const MarketSizeInsightSchema = z
  .object({
    summary: z.string().min(1),
    proxies: z.array(z.string().min(1)).min(1),
    asOf: z.string().date(),
    caveat: z.string().min(1),
    sources: z.array(SourceUrlSchema).min(1),
  })
  .strict();

export const SectorInsightSchema = z
  .object({
    sectorId: z.string().min(1),
    tagline: z.string().min(1),
    marketRole: z.string().min(1),
    whatItDoes: z.string().min(1),
    targetUsers: z.array(z.string().min(1)).min(1),
    demand: z.array(z.string().min(1)).min(1),
    marketSize: MarketSizeInsightSchema,
    risks: z.array(z.string().min(1)).min(1),
  })
  .strict();

export const SectorInsightsFileSchema = z
  .object({
    version: z.literal(1),
    reviewedAt: z.string().date(),
    sectors: z.array(SectorInsightSchema).min(1),
  })
  .strict();

export const AssetInsightSchema = z
  .object({
    assetId: z.string().min(1),
    thesis: z.string().min(1),
    role: z.string().min(1),
    useCases: z.array(z.string().min(1)).min(1),
    targetUsers: z.array(z.string().min(1)).min(1),
    demandSignals: z.array(z.string().min(1)).min(1),
    riskNotes: z.array(z.string().min(1)).min(1),
    sources: z.array(SourceUrlSchema).min(1),
  })
  .strict();

export const AssetInsightsFileSchema = z
  .object({
    version: z.literal(1),
    reviewedAt: z.string().date(),
    assets: z.array(AssetInsightSchema).min(1),
  })
  .strict();

const QualityConfidenceSchema = z.enum(["high", "medium", "low"]);

export const AssetQualityMarketSchema = z
  .object({
    segment: z.string().min(1),
    addressableNeed: z.string().min(1),
    scaleIndicators: z.array(z.string().min(1)).min(1),
    scaleCaveat: z.string().min(1),
  })
  .strict();

export const AssetQualityEconomicsSchema = z
  .object({
    entityType: z.string().min(1),
    profitabilityStatus: z.enum([
      "not_applicable",
      "not_disclosed",
      "revenue_generating_not_profit_proven",
    ]),
    evidence: z.string().min(1),
    confidence: QualityConfidenceSchema,
  })
  .strict();

export const AssetQualitySignalsSchema = z
  .object({
    demandEvidence: z.enum(["high", "medium", "low", "speculative"]),
    maturity: z.enum(["mature", "operating", "early", "unclear"]),
    securityEvidence: z.enum(["strong", "medium", "limited"]),
    decentralization: z.enum(["high", "medium", "low", "unknown"]),
    tokenCapture: z.enum(["direct", "indirect", "weak", "unknown", "none"]),
    supplyRisk: z.enum(["low", "medium", "high"]),
    confidence: QualityConfidenceSchema,
  })
  .strict();

export const AssetQualityResearchSchema = z
  .object({
    assetId: z.string().min(1),
    problemSolved: z.string().min(1),
    market: AssetQualityMarketSchema,
    economics: AssetQualityEconomicsSchema,
    quality: AssetQualitySignalsSchema,
    sources: z.array(SourceUrlSchema).min(1),
  })
  .strict();

export const AssetQualityResearchFileSchema = z
  .object({
    version: z.literal(1),
    reviewedAt: z.string().date(),
    methodology: z
      .object({
        marketSize: z.string().min(1),
        profitability: z.string().min(1),
        quality: z.string().min(1),
      })
      .strict(),
    assets: z.array(AssetQualityResearchSchema).min(1),
  })
  .strict();

export type MarketSizeInsight = z.infer<typeof MarketSizeInsightSchema>;
export type SectorInsight = z.infer<typeof SectorInsightSchema>;
export type AssetInsight = z.infer<typeof AssetInsightSchema>;
export type AssetQualityMarket = z.infer<typeof AssetQualityMarketSchema>;
export type AssetQualityEconomics = z.infer<typeof AssetQualityEconomicsSchema>;
export type AssetQualitySignals = z.infer<typeof AssetQualitySignalsSchema>;
export type AssetQualityResearch = z.infer<typeof AssetQualityResearchSchema>;

export const sectorInsightsFile = SectorInsightsFileSchema.parse(
  sectorInsightsData,
);
export const assetInsightsFile = AssetInsightsFileSchema.parse(
  assetInsightsData,
);
export const assetQualityResearchFile = AssetQualityResearchFileSchema.parse(
  assetQualityResearchData,
);

const sectorInsightsById = new Map(
  sectorInsightsFile.sectors.map((insight) => [insight.sectorId, insight]),
);
const assetInsightsById = new Map(
  assetInsightsFile.assets.map((insight) => [insight.assetId, insight]),
);
const assetQualityResearchById = new Map(
  assetQualityResearchFile.assets.map((research) => [research.assetId, research]),
);

export function getSectorInsight(sectorId: string): SectorInsight {
  return (
    sectorInsightsById.get(sectorId) ?? {
      sectorId,
      tagline: "该板块尚未建立完整研究档案。",
      marketRole: "板块定位正在整理，当前仅展示实时市场统计。",
      whatItDoes: "请以项目官方文档和看板中的实时数据为准。",
      targetUsers: ["市场观察者"],
      demand: ["实时价格、规模和流动性观察"],
      marketSize: {
        summary: "暂无静态规模估计，优先使用看板运行时的市值、成交额和覆盖率代理。",
        proxies: ["板块总市值", "24h 成交额", "活跃资产覆盖率"],
        asOf: sectorInsightsFile.reviewedAt,
        caveat: "代理指标不是独立用户人数；链上地址不能直接等同真实用户。",
        sources: ["https://www.coingecko.com/"],
      },
      risks: ["研究档案尚未完成，避免仅凭板块标签做投资判断。"],
    }
  );
}

export function getAssetInsight(assetId: string): AssetInsight {
  return (
    assetInsightsById.get(assetId) ?? {
      assetId,
      thesis: "该资产暂无单独的研究档案，详情以实时数据和项目官方资料为准。",
      role: "板块成员",
      useCases: ["在看板中观察价格、规模、成交量和相对板块表现"],
      targetUsers: ["市场观察者"],
      demandSignals: ["市值、24h 成交额、历史收益和数据覆盖率"],
      riskNotes: ["没有经过人工复核的项目档案，不应将板块归属当作投资建议。"],
      sources: ["https://www.coingecko.com/"],
    }
  );
}

export function hasCuratedAssetInsight(assetId: string): boolean {
  return assetInsightsById.has(assetId);
}

export function getAssetQualityResearch(assetId: string): AssetQualityResearch {
  return (
    assetQualityResearchById.get(assetId) ?? {
      assetId,
      problemSolved: "该资产尚未建立完整的公开资料研究档案。",
      market: {
        segment: "待分类",
        addressableNeed: "需要结合项目官方资料、链上使用和市场数据进一步判断。",
        scaleIndicators: ["实时市值", "24h 成交额"],
        scaleCaveat: "代理指标不等于真实用户人数、总可寻址市场或项目收入。",
      },
      economics: {
        entityType: "unknown",
        profitabilityStatus: "not_disclosed",
        evidence: "没有足够的公开、可核验损益表，不能判断项目方是否盈利。",
        confidence: "low",
      },
      quality: {
        demandEvidence: "low",
        maturity: "unclear",
        securityEvidence: "limited",
        decentralization: "unknown",
        tokenCapture: "unknown",
        supplyRisk: "high",
        confidence: "low",
      },
      sources: ["https://www.coingecko.com/"],
    }
  );
}
