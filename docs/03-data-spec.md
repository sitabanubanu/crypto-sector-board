# 03 - 数据规范

## 1. UTC 切日规则
- "昨日" = 前一个 UTC 00:00:00 ~ 当日 UTC 00:00:00 之间
- 等同北京时间前一日 8:00 ~ 当日 8:00
- 与 CoinGecko、Binance、CoinMarketCap 主流口径一致

## 2. 市值过滤规则
- "主流币种" 阈值：流通市值 ≥ 3 亿美元（USD）
- 单币若低于阈值：抓取数据但标记 `isMainstream=false`，UI 上仍显示但视觉降级

## 3. `data/sectors.json` 结构

```json
{
  "version": 1,
  "lastUpdated": "2026-05-15",
  "sectors": [
    {
      "id": "btc",
      "name": "BTC",
      "coins": ["bitcoin"]
    },
    {
      "id": "l1",
      "name": "Layer 1 主流",
      "coins": ["ethereum", "solana", "binancecoin", "ripple", "cardano", "avalanche-2", "tron", "the-open-network", "polkadot", "sui", "aptos", "near"]
    }
  ]
}
```

字段说明：
- `id`：板块英文短 ID，URL/CSS 安全
- `name`：UI 显示的板块名（中文/英文皆可）
- `coins`：CoinGecko ID 列表，**用全小写英文短名**（不是 ticker）

> CoinGecko ID 查询方式：访问 `https://www.coingecko.com/en/coins/{slug}`，URL 里的 slug 就是 ID。或调用 `/coins/list` 接口。

## 4. `data/snapshots/YYYY-MM-DD.json` 结构

```json
{
  "date": "2026-05-14",
  "generatedAt": "2026-05-15T00:30:12Z",
  "source": "coingecko",
  "sectors": [
    {
      "id": "btc",
      "name": "BTC",
      "totalMarketCap": 1300000000000,
      "weightedReturnPct": 0.0234,
      "weightedAmplitude": 0.0312,
      "weightedVolatility": 0.0089,
      "coins": [
        {
          "id": "bitcoin",
          "symbol": "BTC",
          "name": "Bitcoin",
          "marketCap": 1300000000000,
          "open": 65000.12,
          "high": 67200.45,
          "low": 64800.99,
          "close": 66501.23,
          "returnPct": 0.0231,
          "amplitude": 0.0370,
          "volatility": 0.0091,
          "isMainstream": true
        }
      ]
    }
  ]
}
```

## 5. 指标公式

### 单币指标
```
return_pct  = (close - open) / open
amplitude   = high / low - 1
volatility  = stdev(intraday_prices) / mean(intraday_prices)
              用 24 小时内每小时收盘价（24 个采样点）
```

### 板块指标（按各币市值加权）
```
sector_metric = Σ (coin_metric_i × market_cap_i) / Σ market_cap_i
```

只对 `isMainstream=true` 的币参与板块指标计算（防止小币噪声影响）。

## 6. 数据源约束
- **CoinGecko 免费层限频**：~10-30 次/分钟，脚本按 1.5 秒间隔串行调用
- **失败重试**：每次请求最多重试 3 次（指数退避：2s/4s/8s）
- **抓取 endpoint**：`/coins/{id}/market_chart?vs_currency=usd&days=2&interval=hourly`
- **市值 endpoint**：`/coins/markets?vs_currency=usd&ids={comma_list}`

## 7. 数据正确性核对
每次脚本调整后，对照以下三点核对：
1. BTC `high`/`low`/`return_pct` 与 CoinGecko 网页 24h 数据误差 <1%
2. 板块 `totalMarketCap` = 板块内各币 marketCap 之和
3. 板块 `weightedReturnPct` 用 Excel 手算复核一次