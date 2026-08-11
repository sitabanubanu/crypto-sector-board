# P6 优先资产与板块研究档案

## 已完成范围

- 资产目录从 56 扩展到 67：ICP、MORPHO、POL、CAKE、HBAR、ATOM、INJ、QNT、ALGO、KAS、AERO。
- 14 个板块目录保持不变，所有资产均有唯一规范板块归属；主流阈值仍为 3 亿美元。
- Gate、CoinGecko、OKX 的映射均由注册表管理。在线巡检发现 CAKE、QNT、KAS、AERO 当前不在 OKX 现货清单，已设置为 `unavailable`，主源仍为 Gate。
- 新增 `data/sector-insights.json` 和 `data/asset-insights.json`。每条研究档案都带复核日期、需求代理指标、风险和来源；地址/账户只作为代理，不宣称真实独立用户数。
- Treemap 支持板块点击、键盘 Enter/Space 和搜索回车打开板块抽屉；币种详情追加项目档案。
- 状态栏支持 `full`、`compact`、`hidden` 三种模式并持久化；BTC 只调整视觉权重，不改变市值、收益或排名数据。

## 数据和 Preview/Production 验收记录

2026-08-11（UTC）在 Vercel Preview PostgreSQL 上完成：

| 项目 | 结果 |
|---|---:|
| reference seed | 67 assets / 30 aliases / 201 mappings / 14 sectors / 67 memberships |
| CoinGecko quote | 67/67 |
| Gate quote | 65/65 |
| OKX quote | 59/59（其余 8 个为明确 unavailable） |
| Gate 1h candles | 8,238/8,238 |
| OKX 1h candles | 5,260/5,260 |
| 最新 24h K 线覆盖 | 2,976/2,976 |
| 最新 7d K 线覆盖 | 20,832/20,832 |
| quote 覆盖/新鲜度 | 191/191 |
| data-health | `healthy` |

Production 使用同一套已授权的 Neon Free 连接完成幂等迁移与 seed，并重新部署后复验：

| 项目 | Production 结果 |
|---|---:|
| `/api/v1/board` backend | `database` |
| board assets / coverage | 67 / `1` |
| DB/JSON 双读 | 67 / 67 common，database-only 0，json-only 0 |
| `/api/v1/data-health` | `healthy` |
| quotes | 191/191，freshness `1` |
| 24h/7d candle gaps | 0 |
| Production deployment | `dpl_CmBQ7sTJ6eoVvX3SjnCqz1kqeVfr` |
| 正式入口 | <https://crypto-sector-board.vercel.app> |

## 后续维护规则

1. 新资产先修改 `data/assets.json` 和 `data/sectors.json`，再运行 `npm run registry:check`。
2. 任何 provider 下架都改为 `unavailable`/`delisted` 并填写 `mappingNote`，禁止把相似 ticker 当作替代品。
3. 研究档案只写可追溯的来源和代理指标；不得把地址、账户、社交提及直接称为独立用户数。
4. 当前个人零成本方案允许对共享 Neon Free 数据库执行经过确认的幂等 seed/采集；未来拆分 Production 数据库后，生产写入必须改为独立凭据和变更窗口。每次发布前必须通过 `npm run check`、Preview/Production `/api/v1/board` 和 `/api/v1/data-health`。
