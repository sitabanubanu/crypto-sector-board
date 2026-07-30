# P2 数据库与资产注册表

> 状态：2026-07-30 P2 云端 Preview 验收完成；Neon PostgreSQL 已创建并连接到 Preview，migration/seed 已执行，Vercel Preview 已发布。Production 仍未连接。

## 1. 本阶段完成了什么

- 接入 Drizzle ORM 和标准 PostgreSQL 驱动 `postgres.js`。
- 建立首个可执行 migration，而不是只维护 ORM 类型。
- 建立 56 个规范资产、20 个别名和 168 条 provider 状态。
- 把 `data/sectors.json` 升级为 v2，板块成员字段从含混的 `coins` 改为 `assetIds`。
- 建立可重复执行的资产、映射、板块和成员关系 seed。
- 建立离线注册表检查和 Gate、OKX、CoinGecko 在线映射巡检。
- 用 PGlite 真正执行 migration，并验证唯一键、外键、OHLC 检查和幂等 seed。

P2 只建立数据库和身份底座。P3 已在其上实现幂等采集、补洞和运行锁；页面切换数据库属于 P4，因此在 P4 验收前仍保留 JSON 读取链路。

## 2. 数据库驱动与连接

生产运行时使用 Drizzle 稳定版和 `postgres.js`。连接由 `lib/db/connection.ts` 惰性创建：

- 构建阶段不会因为没有 `DATABASE_URL` 而失败。
- `DATABASE_URL` 优先，`POSTGRES_URL` 只作为兼容旧环境的后备。
- 默认连接池上限为 1，可用 `DATABASE_POOL_MAX` 调整到 1～10。
- 禁用 prepared statements，以兼容常见的 serverless transaction pooler。
- URL 和凭据只允许存在于服务端环境变量，不进入客户端 bundle。

Vercel 已停止提供旧的原生 Vercel Postgres，新项目应从 Marketplace 连接 Neon、Supabase 或其他 PostgreSQL 服务。数据库应和 Vercel Functions 选择相近区域，并使用 provider 提供的 pooled connection string：

- [Vercel Marketplace Storage](https://vercel.com/docs/marketplace-storage)
- [Vercel Postgres integrations](https://vercel.com/docs/postgres)
- [Drizzle PostgreSQL](https://orm.drizzle.team/docs/get-started-postgresql)

## 3. 数据模型

| 表 | 作用 | 核心约束 |
|---|---|---|
| `assets` | 项目自有的规范资产身份 | `asset_id` 主键；symbol 和状态校验 |
| `asset_aliases` | 历史 ID、改名和 provider slug | alias 主键；外键指向资产 |
| `provider_instruments` | 每个资产在三家 provider 的显式状态 | mapping 主键；资产/provider/role 唯一；非空 instrument 在 provider 内唯一 |
| `market_quotes_latest` | 每个资产/provider 的最新行情 | `(asset_id, provider)` 主键 |
| `market_candles` | 1h/1d 完整 OHLCV | `(asset_id, provider, timeframe, open_time)` 主键；OHLC 与时间检查 |
| `market_caps` | 市值和供应量时间序列 | `(asset_id, provider, observed_at)` 主键；非负检查 |
| `ingestion_runs` | 采集运行、游标、覆盖率和错误 | `dedupe_key` 唯一；计数、覆盖率和时间顺序检查 |
| `sectors` | 板块定义 | `sector_id` 主键；排序唯一 |
| `sector_memberships` | 有效期化的板块成员关系 | `(sector_id, asset_id, effective_from)` 主键 |

初始 migration 位于 `drizzle/0000_p2_asset_registry.sql`，Drizzle metadata 位于 `drizzle/meta/`。不要手改 metadata；修改 `lib/db/schema.ts` 后执行 `npm run db:generate`。

## 4. 资产注册表

源文件是 `data/assets.json`，运行时契约在 `lib/market-data/registry.ts`。每个资产必须满足：

- 一个项目控制的稳定 `assetId`。
- 明确 symbol、name、资产状态和 primary provider。
- CoinGecko、Gate、OKX 三家各一条显式状态。
- active 映射必须有 instrument ID。
- unavailable 映射不得伪造 instrument ID，并必须解释原因。
- migrating 资产必须记录迁移说明。
- provider instrument 不能被两个资产重复占用。

当前关键决策：

| 资产 | 决策 |
|---|---|
| TON / GRAM | 保留历史规范 ID `the-open-network`；历史 TON 与当前 GRAM 属于同一跟踪迁移链；Gate/OKX 使用 GRAM instrument |
| MKR / SKY | 保留 MKR 为独立资产；SKY 单位不同，禁止把 SKY 行情直接套到 MKR 历史 |
| ASTER | 规范 ID 继续为 `aster-2` 以兼容历史，别名 `aster`；三家 instrument 明确登记 |
| PI | 只接受注册表中的 mainnet `PI_USDT` / `PI-USDT`，不按 ticker 猜测 IOU |
| XMR | Gate/OKX 明确 unavailable，CoinGecko 是声明的可用来源 |
| MNT / HNT | 2026-07-30 在线巡检确认 OKX spot instrument 不存在，状态已改为 unavailable |

旧的 `CG_TO_GATE`、`CG_TO_OKX` 不再各自维护一份人工映射，而是由注册表生成兼容 map。

## 5. 板块配置 v2

`data/sectors.json` 现在使用：

```json
{
  "version": 2,
  "registryVersion": 1,
  "lastUpdated": "2026-07-30",
  "effectiveFrom": "2026-05-15",
  "sectors": [
    {
      "id": "btc",
      "name": "BTC",
      "assetIds": ["bitcoin"]
    }
  ]
}
```

`lastUpdated` 表示配置文件修改时间，`effectiveFrom` 表示当前成员关系最早已知生效时间，两者不能混用。运行时如果需要旧的 `{ coins: string[] }` 形状，只能通过 `getRuntimeSectorConfigs()` 适配。

## 6. 命令

```bash
# 纯静态检查：56 个资产、三家状态、板块覆盖和特殊迁移说明
npm run registry:check

# 真实访问三家 provider，检查下架、改名和 symbol 漂移
npm run registry:verify
npm run registry:verify -- --provider=gate

# 检查 migration metadata
npm run db:check

# schema 修改后生成新 migration
npm run db:generate

# 有 DATABASE_URL 时，执行 migration 和 reference seed
npm run db:migrate
npm run db:seed
npm run db:setup
```

`npm run check` 会执行离线 registry、migration metadata、测试和构建；不会访问外网，也不会连接真实数据库。

## 7. Vercel / Neon 接入顺序

1. [x] 在 Vercel Marketplace 为 Preview 建立 Neon 资源，区域为 `sin1`。
2. [x] 仅将 pooled connection string 注入 Preview 的 `DATABASE_URL`（同时由 Marketplace 写入 provider 兼容变量）；Production 未连接。
3. [x] 在受信任的本地终端运行 `npm run db:setup`；migration 不在 `next build` 中执行。
4. [x] 核对 Preview 数据库：56 assets、20 aliases、168 provider mappings、14 sectors、56 memberships。
5. [x] 部署 Preview，并验证主页、板块 API、快照索引/详情、非法 ID 防护和写入方法保护。
6. [ ] Preview 验收后，再为 Production 创建独立数据库/branch，执行相同 migration 和 seed（后续操作）。
7. [x] P3 完成幂等采集和回滚路径以前，保留 `data/snapshots/` 和现有 JSON 读取链路。

本轮实际资源：Vercel Marketplace Neon 免费计划 `free_v3`，资源名 `crypto-sector-board-preview-db`，仅连接 `preview` 环境。连接串未写入仓库，临时本地环境文件在迁移完成后已删除。

## 8. 验收证据

- 注册表：56 assets、20 aliases、168 provider states、14 sectors、56 covered assets。
- 在线巡检：Gate、OKX、CoinGecko 共检查 168 条映射，0 error、0 warning。
- Migration：PGlite 中真实应用 SQL 成功。
- Seed：连续运行两次，行数不增长。
- 约束：重复 ingestion key、重复 candle、未知 asset FK、非法 OHLC 均被数据库拒绝。
- 云端 migration/seed：`npm run db:setup` 成功，输出为 56 assets、20 aliases、168 provider mappings、14 sectors、56 memberships。
- Vercel Preview：部署 `dpl_FGjJSRLYp8zFRTjDf1YcXPFNEdP4` 状态 `Ready`，目标为 `preview`；线上主页返回 200，`/api/sectors`、`/api/snapshots` 和具体快照可读，非法快照 ID 返回 400，`POST /api/sectors` 返回 405。
- 生产依赖审计：0 high / critical。

### 远端风险与回滚

- Preview 当前受 Vercel Deployment Protection 保护；未携带登录态的裸请求会返回 302，验收使用 CLI 自动处理的保护绕过请求完成，绕过令牌未写入仓库或环境变量。
- 构建日志有 npm optional peer/deprecation 警告和 Edge runtime 静态生成提示，但构建与部署均成功；这些警告不应被当作数据库迁移成功的替代证据。
- 回滚方式：删除/断开 Preview Neon 资源前先保留 `data/snapshots/`；代码可回滚到上一 Preview deployment，数据库 migration 不在 build 中自动执行，因此不会随回滚隐式降级 schema。
- Production 目前没有数据库环境变量，也没有本轮迁移；不要把 Preview 连接串复制到 Production。

Drizzle Kit 稳定版当前通过弃用的 `@esbuild-kit` 链引入一个 dev-only moderate esbuild 公告；它不进入生产依赖，且项目不暴露 esbuild 开发服务器。该例外记录在 `docs/08-security-audit-exceptions.md`。
