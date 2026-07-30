# 03 - 数据规范

## 1. 数据时间范围（MVP 实际实现）

**重要**：MVP 阶段使用 CoinGecko 的 `/coins/markets` 批量接口，提供的是 **滚动 24 小时** 数据（high_24h、low_24h、price_change_percentage_24h）。

- 不严格对齐 UTC 0 点切日
- 抓取时刻往前推 24 小时的数据窗口
- 字段 `date` 标记的是脚本执行的 UTC 日期

**为什么这样**：CoinGecko 免费层限频严（每分钟 ~10 请求），按币逐个调 `/market_chart` 接口（精确日 K 线）会触发限流，56 个币要跑 10 分钟以上还经常失败。批量接口 1-2 次请求就拿全部数据，10 秒完成。

**未来升级**（阶段 7+）：升级到 CoinGecko Demo Key 或 Pro 后，可以改回精确 UTC 日 K 线方案，原 `lib/coingecko.ts` 中按 `/market_chart` 接口的代码已注释保留。

## 2. 市值过滤规则
- "主流币种" 阈值：流通市值 ≥ 3 亿美元（USD），定义在 `data/sectors.json` 的 `mainStreamThreshold`
- 单币若低于阈值：仍抓取并显示，但 `isMainstream=false`，**不参与板块加权计算**

## 3. 规范资产注册表（P2）

系统内部只认项目控制的稳定 `assetId`。CoinGecko slug、Gate pair 和 OKX instId 统一登记在 `data/assets.json`，不能再在业务代码中各维护一份映射。

每个资产具有 CoinGecko、Gate、OKX 三条显式 provider 状态。active 状态必须有 instrument ID；unavailable 状态必须解释原因。运行时契约和别名解析位于 `lib/market-data/registry.ts`。

关键迁移规则：

- TON/GRAM：保留历史资产 ID，通过 provider mapping 解释当前 GRAM instrument。
- MKR/SKY：两者单位不同，禁止用 SKY 行情伪装 MKR。
- ASTER/PI：只能使用注册表明确指定的 provider ID，不能根据 ticker 猜测。
- MNT/HNT/XMR：没有对应交易所 instrument 时明确标记 unavailable。

## 4. `data/sectors.json` v2 结构

```json
{
  "version": 2,
  "registryVersion": 1,
  "lastUpdated": "2026-07-30",
  "effectiveFrom": "2026-05-15",
  "mainStreamThreshold": 300000000,
  "sectors": [
    {
      "id": "btc",
      "name": "BTC",
      "assetIds": ["bitcoin"]
    },
    {
      "id": "l1",
      "name": "Layer 1 主流",
      "assetIds": ["ethereum", "solana", "binancecoin", ...]
    }
  ]
}
```

字段说明：
- `id`：板块英文短 ID
- `name`：UI 显示名（中英皆可）
- `assetIds`：项目规范资产 ID，不是 ticker，也不再等同于任一 provider 的 ID
- `registryVersion`：所依赖的资产注册表版本
- `effectiveFrom`：当前成员关系最早已知生效时间，用于 point-in-time 查询

任何新增资产必须先进入 `data/assets.json` 并通过 `npm run registry:check`，再加入板块。

## 5. `data/snapshots/YYYY-MM-DD.json` 结构

```json
{
  "date": "2026-05-15",
  "generatedAt": "2026-05-15T10:59:13.259Z",
  "source": "coingecko",
  "sectors": [
    {
      "id": "btc",
      "name": "BTC",
      "totalMarketCap": 1616622205853,
      "weightedReturnPct": 0.0146849,
      "weightedAmplitude": 0.03411815,
      "weightedVolatility": 0.01705907,
      "coins": [
        {
          "id": "bitcoin",
          "symbol": "BTC",
          "name": "Bitcoin",
          "marketCap": 1616622205853,
          "open": 79545.87,
          "high": 81958,
          "low": 79254,
          "close": 80714,
          "returnPct": 0.0146849,
          "amplitude": 0.03411815,
          "volatility": 0.01705907,
          "isMainstream": true
        }
      ]
    }
  ]
}
```

## 6. 指标公式

### 单币指标（基于滚动 24h 数据）
```
close       = current_price                            (CoinGecko 当前价)
high        = high_24h                                 (CoinGecko 24h 高)
low         = low_24h                                  (CoinGecko 24h 低)
return_pct  = price_change_percentage_24h / 100        (CoinGecko 24h 涨跌)
open        = close / (1 + return_pct)                 (反推开盘)
amplitude   = high / low - 1                           (振幅)
volatility  = amplitude / 2                            (近似估算，无 K 线序列)
```

> ⚠️ `volatility` 是近似估算（振幅一半），不是真正基于价格序列的标准差。MVP 阶段够用；需要更精确时升级到 Pro API 后取小时 K 线重新计算。

### 板块指标（按各币市值加权）
```
sector_metric = Σ (coin_metric_i × market_cap_i) / Σ market_cap_i
```

只对 `isMainstream=true` 的币参与板块加权计算。

## 7. 数据源约束
- **CoinGecko 免费层限频**：~10-30 次/分钟
- **本项目实现**：批量接口 + 8 秒批次间隔，56 个币 → 2 个请求 → ~10 秒完成
- **失败重试**：每次请求最多重试 3 次，429 退避 4s/8s/16s
- **抓取 endpoint**：`/coins/markets?vs_currency=usd&ids={comma_list}&price_change_percentage=24h`

## 8. 数据正确性核对
每次脚本调整后核对：
1. BTC `high`/`low`/`returnPct` 与 CoinGecko 网页 24h 数据误差 <0.5%
2. 板块 `totalMarketCap` = 板块内各币 marketCap 之和
3. 板块 `weightedReturnPct` 用 Excel 手算复核一次
4. 检查所有 56 个币是否都被 `marketData` 返回（漏的 ID 写错了）
