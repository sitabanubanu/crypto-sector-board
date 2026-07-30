# 02 - 技术架构

> 2026-07-30 P4 状态：页面主读路径已从静态 JSON 切换到 PostgreSQL BFF；服务端保留 JSON 只读回滚和 DB/JSON 双读校验。Preview 已接入数据库，Production 仍未连接。

## 1. 技术栈

| 用途 | 选型 | 版本 / 状态 |
|---|---|---|
| 框架 | Next.js App Router | 16.2.12 |
| 运行时 | React | 19.2.4 |
| 语言 | TypeScript | ^5 |
| 样式 | Tailwind CSS | ^4 |
| 可视化 | D3.js | 已安装 |
| 客户端缓存 | SWR | 2.4.2 |
| 数据库 | PostgreSQL（Preview 为 Neon） | Preview 已接入；Production 待独立接入 |
| ORM | Drizzle ORM | 0.45.2 |
| 数据源 | Gate、OKX、CoinGecko | 服务端采集，不由浏览器直连 |
| 定时 | GitHub Actions cron | 每小时只触发采集 |
| 部署 | Vercel | Preview 已验收 |

> Next.js 16 全部使用 `app/`；Tailwind v4 配置位于 CSS，不使用 `tailwind.config.ts`。服务端数据库代码必须留在 `lib/server/` 或 `lib/db/`，不得进入客户端 bundle。

## 2. 当前数据流

```text
Gate / OKX / CoinGecko
          │
          ▼
GitHub Actions ingest.yml
          │  游标、补洞、重试、运行锁
          ▼
PostgreSQL
  ├── latest quotes / market caps ──▶ board DAL ──▶ /api/v1/board
  ├── 1h candles ───────────────────▶ history DAL ─▶ /api/v1/candles
  │                                               └▶ /api/v1/history
  └── ingestion runs / coverage ────────────────▶ /api/v1/data-health

data/snapshots/*.json ──▶ JSON rollback + DB/JSON dual-read comparison
```

- 首屏由服务端直接调用 DAL，避免服务端再绕 HTTP 调自己的 API。
- 浏览器使用 SWR：`board` 每 30 秒刷新；56 个资产的 31 天历史合并为一个请求，每 5 分钟刷新。
- 浏览器不再逐币调用 Gate、OKX 或 CoinGecko 通用代理。
- `/api/v1/board` 使用 30 秒服务端数据缓存；candles/history 使用 5 分钟缓存。
- 历史查询在 PostgreSQL 内按 UTC 日去重聚合，避免把约 8 万条小时记录拉到 Node.js 后再处理。

## 3. BFF 接口

| 接口 | 用途 | 查询边界 | HTTP 缓存 |
|---|---|---|---|
| `GET /api/v1/board` | 当前板块、币种、来源和质量元数据 | 不接受额外参数 | `s-maxage=30` |
| `GET /api/v1/candles` | 单资产小时 K 线 | 规范 asset ID，最长 31 天 | `s-maxage=300` |
| `GET /api/v1/history` | 批量日级历史 | 规范 asset IDs，2～31 天，最多 56 个资产 | `s-maxage=300` |
| `GET /api/v1/data-health` | 采集健康、缺口和 freshness | 无 | `no-store` |

所有接口都用 Zod 严格校验查询和响应契约；错误响应不缓存，也不向客户端暴露数据库连接信息或上游响应体。

## 4. 读路径与回滚

- `DATA_BACKEND=db`：使用 PostgreSQL，是 P4 默认路径。
- `DATA_DUAL_READ=true`：DB 模式下同时读取最后一份有效 JSON，只比较覆盖和主要数值差异；JSON 失败不会拖垮 DB 页面。
- `DATA_BACKEND=json`：完全绕过数据库并读取旧快照，是一键回滚路径；此时双读开关自动失效。
- Vercel 环境变量修改只对新 deployment 生效，因此切换后必须重新部署对应环境。

旧 JSON 不再自动生成或提交。它只承担回滚基线，不是新的历史数据源，也不能用于严肃回测。

## 5. 关键设计决策

### 为什么仍保留 JSON？

- 数据库、采集和页面切换可以独立回滚。
- Preview 出现数据库连接或查询故障时，可以恢复最后一份已验证快照。
- 双读能在不影响用户页面的前提下发现 DB 与旧口径的覆盖差异。

### 为什么采集继续用 GitHub Actions？

- Actions 只负责调度；幂等、锁、补洞和重试都在采集服务与数据库中。
- 更换调度平台不需要重写 provider adapter。
- 采集不会提交数据文件，也不会触发 Vercel 部署。

### 为什么面积用 `sqrt(market_cap)`？

- 原始市值会让 BTC 过度占据画面。
- 平方根压缩头部权重，同时保留市值相对关系。

## 6. 目录职责

- `app/api/v1/`：面向页面的窄接口和数据健康接口。
- `lib/server/`：server-only DAL、缓存、后端选择和编排。
- `lib/db/`：schema、数据库连接和查询。
- `lib/market-data/`：可测试的契约、聚合、比较和纯函数。
- `components/board/`：客户端 SWR 读取与页面状态。
- `lib/ingestion/`：provider adapter、幂等采集、补洞和健康检查。
- `data/assets.json`：规范资产与 provider 映射注册表。
- `data/snapshots/`：只读回滚快照。
