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

## 3. `data/sectors.json` 结构

```json
{
  "version": 1,
  "lastUpdated": "2026-05-15",
  "mainStreamThreshold": 300000000,
  "sectors": [
    {
      "id": "btc",
      "name": "BTC",
      "coins": ["bitcoin"]
    },
    {
      "id": "l1",
      "name": "Layer 1 主流",
      "coins": ["ethereum", "solana", "binancecoin", ...]
    }
  ]
}
```

字段说明：
- `id`：板块英文短 ID
- `name`：UI 显示名（中英皆可）
- `coins`：CoinGecko **ID** 列表（全小写英文 slug，**不是 ticker**）

> CoinGecko ID 查询方式：访问 `https://www.coingecko.com/en/coins/{slug}`，URL 里的 slug 就是 ID。或调用 `/search?query=xxx` 接口。

### 已知 ID 映射陷阱
| Ticker | 错误猜测 | 正确 ID |
|---|---|---|
| ORDI | `ordi` | `ordinals` |
| ASTER | `aster-defi` | `aster-2` |
| FET / ASI | `artificial-superintelligence-alliance` | `fetch-ai` |
| VIRTUAL | `virtuals-protocol` | `virtual-protocol` |
| STX | `stacks` | `blockstack` |

## 4. `data/snapshots/YYYY-MM-DD.json` 结构

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

## 5. 指标公式

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

## 6. 数据源约束
- **CoinGecko 免费层限频**：~10-30 次/分钟
- **本项目实现**：批量接口 + 8 秒批次间隔，56 个币 → 2 个请求 → ~10 秒完成
- **失败重试**：每次请求最多重试 3 次，429 退避 4s/8s/16s
- **抓取 endpoint**：`/coins/markets?vs_currency=usd&ids={comma_list}&price_change_percentage=24h`

## 7. 数据正确性核对
每次脚本调整后核对：
1. BTC `high`/`low`/`returnPct` 与 CoinGecko 网页 24h 数据误差 <0.5%
2. 板块 `totalMarketCap` = 板块内各币 marketCap 之和
3. 板块 `weightedReturnPct` 用 Excel 手算复核一次
4. 检查所有 56 个币是否都被 `marketData` 返回（漏的 ID 写错了）
