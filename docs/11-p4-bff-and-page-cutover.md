# 11 - P4 BFF 与页面读路径切换

> 执行日期：2026-07-30
> 范围：只完成 P4；不实施 P5 的持仓、信号、相关性和回测重构。
> 云端边界：先在 Preview 完成验收；随后按个人零成本例外发布 Production，暂时复用同一 Neon Free 数据库。

## 1. 目标与结果

P4 将页面从“服务端读静态 JSON + 浏览器逐币请求交易所”切换为“服务端 PostgreSQL DAL + 窄 BFF + 浏览器批量缓存”。

完成结果：

- 新增 board、candles、history 三个版本化 BFF。
- 首屏直接在服务端读取 DAL；客户端用 SWR 做增量刷新。
- 56 个资产的 31 天历史合并为一个请求。
- 浏览器不再访问 Gate、OKX、CoinGecko 通用代理。
- 页面展示真实 backend、source、freshness、coverage、fallback 与缺失状态。
- DB 模式支持与最后一份有效 JSON 双读比较。
- `DATA_BACKEND=json` 可完全绕过数据库，一键恢复旧读路径。

## 2. 新增接口

| 接口 | 数据 | 服务端缓存 | 浏览器用途 |
|---|---|---|---|
| `GET /api/v1/board` | 当前资产、板块聚合、provenance、质量元数据 | 30 秒 | 首屏后每 30 秒 SWR |
| `GET /api/v1/candles` | 单资产小时 K 线 | 5 分钟 | 诊断与按需查询 |
| `GET /api/v1/history` | 最多 56 个资产、2～31 天日级历史 | 5 分钟 | 页面一次批量请求 |

接口查询与响应都由 Zod 契约约束。未知参数、未知资产、超出窗口或资产数量上限返回 400；内部错误只返回通用消息。

## 3. Board 聚合规则

- 资产主键始终使用 `data/assets.json` 的 canonical `assetId`。
- latest quote 优先选择新鲜记录，再按资产注册表 provider 优先级选择。
- 24h 使用 latest quote；3d/7d/30d 使用数据库 K 线历史。
- market cap 从有效且最新的数据中选择。
- 缺少价格、市值或历史时保留 `null`/`N/A`，不得转换为 0。
- 板块加权沿用统一指标契约，并返回实际 coverage。
- 每个币返回 provider、fallback、observedAt 和 stale 信息。

## 4. 历史查询与性能

初版实现把两个交易所约 8 万条小时记录拉到 Node.js 后再按日处理，全量 56 资产请求可能超过 30 秒。复审后将日级选点下推到 PostgreSQL：

```sql
DISTINCT ON (asset_id, provider, UTC day)
```

本地生产构建连接 Preview 数据库实测：

- 56 个资产、31 天首次查询约 4.27 秒。
- 返回 1,674 个日点。
- 总覆盖率约 96.43%。
- MKR、XMR 因无 Gate/OKX 现货映射而明确缺失；不会用 SKY 或其他资产替代。

history 返回每个资产自己的 source、points、coverage 与 missing 列表，上市较晚或 provider 历史不足时不会填充虚假数据。

## 5. 页面与客户端改造

- `app/page.tsx` 改为动态服务端入口，直接调用 board DAL。
- `components/board/use-board-data.ts` 统一管理 board 与 history SWR。
- `HomeClient` 不再导入 Gate/OKX/CoinGecko 浏览器请求函数。
- correlation、币种详情和自定义板块都使用 canonical asset ID 与同一份历史数据。
- 自定义板块直接从当前 board 计算，不再额外请求交易所。
- watchlist schema 升级到 v3，旧 `BTC_USDT` / `BTC-USDT` 自动迁移为 `bitcoin`。
- Header 和 tooltip 显示当前数据库/JSON 后端、来源、coverage、freshness 与 fallback。

JSON 模式下客户端不会请求 history，因为旧快照已经包含页面可用的回滚口径。

## 6. 深历史补齐

新增一次性 `INGEST_HISTORY_BACKFILL_HOURS`，不改变默认小时采集行为。Preview 运行 744 小时补齐结果：

- Gate：40,176 / 40,176 成功。
- OKX：38,659 / 38,688 成功，只有 TAO 最早 29 个小时缺失；Gate 对 TAO 的 744 小时完整。
- 深历史运行分类为 `market-candles-history`，不参与当前 24h/7d 实时 SLO。
- 当前 data-health 为 `healthy`：24h 与 7d coverage 均为 100%，quote freshness 100%，无 failed assets、无卡死运行。

## 7. 双读与回滚

默认 Preview 配置：

```dotenv
DATA_BACKEND=db
DATA_DUAL_READ=true
```

DB 模式下，board 响应包含 DB/JSON 的公共资产数、单边缺失和主要数值差异。JSON 读取失败只会缺少 comparison，不会让数据库页面失败。

回滚：

1. 对目标 Vercel 环境设置 `DATA_BACKEND=json`。
2. 重新部署。
3. 验证 board 的 `meta.backend=json`。

恢复：

1. 确认 data-health 为 `healthy`。
2. 设置 `DATA_BACKEND=db`、`DATA_DUAL_READ=true`。
3. 重新部署并核对 comparison。

## 8. 验收记录

代码质量：

- 14 个测试文件、89 个测试通过。
- ESLint、TypeScript、资产注册表、migration 校验通过。
- 生产依赖 high 漏洞为 0。
- 完整开发依赖审计只保留已记录、可到期失败的 9 包 ESLint/minimatch 临时例外。
- Next.js production build 通过。

真实浏览器：

- 桌面和 390 × 844 移动视口均正常。
- 24h/3d/7d/30d 切换正常。
- BTC 详情弹窗显示数据库历史。
- 自定义板块可用 canonical asset 创建并即时出现在图表中。
- 控制台 0 error、0 warning。
- 请求只包含 `/api/v1/board` 和单个批量 `/api/v1/history`，没有旧 `/api/gate`、`/api/okx`、`/api/cg` 调用。

## 9. Preview 部署

- Deployment：`dpl_2dsVYRMtmtfSkMgf7oEBeHV83TBB`
- 状态：Ready
- Preview URL：`https://crypto-sector-board-4ryd8fh3y-sitabanubanu-8645s-projects.vercel.app`
- 环境：Preview，仅连接 `crypto-sector-board-preview-db`
- 配置：`DATA_BACKEND=db`、`DATA_DUAL_READ=true`

Vercel Deployment Protection 会把匿名浏览器重定向到登录页，因此受保护接口使用 `vercel curl` 验收。最终云端结果：

- board：database、dual-read、56 assets、14 sectors、coverage 100%、common assets 56/56、非 stale。
- history：56 assets、1,674 points、coverage 96.43%、missing 为 maker/monero。
- candles：Bitcoin/Gate 新查询窗口 coverage 100%。
- data-health：`healthy`，24h/7d candles、quote coverage、quote freshness 均为 100%，0 failed assets、0 stuck runs。
- 主页：返回完整 HTML、标题和数据库看板内容。

最终验收时发现 Preview 少了最新一个完整小时，原因是本地 `ingest.yml` 尚未 push、定时任务未激活。仅对 Preview 手动补跑一次采集后，Gate/OKX/CoinGecko 五个运行全部 success，健康状态恢复为 `healthy`。这也说明 commit/push 前 Preview 不会自行持续更新。

## 10. Production 发布边界

- P0～P4 通过 `main` 发布到现有 Vercel Production，稳定入口保持 `https://crypto-sector-board.vercel.app`。
- Production 配置为 `DATA_BACKEND=db`、`DATA_DUAL_READ=true`、`DATABASE_POOL_MAX=1`。
- 为保持个人使用零新增费用，Production 与 Preview 暂时复用 `crypto-sector-board-preview-db`；没有数据隔离，不是面向多用户或商业用途的最终架构。
- GitHub Actions 每小时写同一数据库，不再生成或提交 JSON 快照，也不再因为数据更新触发 Production 部署。
- 数据库读路径异常时可把 Production 的 `DATA_BACKEND` 切为 `json` 并重新部署；不要删除共享数据库。
- MKR、XMR 没有可用 Gate/OKX 现货历史，这是注册表明确声明的真实缺失。
- P5 才会重做持仓语义、信号、相关性和无前视回测；P4 不提前改变这些业务口径。
