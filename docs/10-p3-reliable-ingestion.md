# P3 可靠采集与补洞

> 状态：2026-07-30 本地实现、P3 完整审计修复、Preview 数据迁移、实际采集和 Vercel Preview 复验完成。Production 未连接；GitHub workflow 要在本批改动 push 后才会激活。

## 1. 阶段边界

P3 负责把行情采集从“生成 JSON、提交 Git、触发部署”改为可靠写入 PostgreSQL：

- Gate、OKX 采集已闭合的 `1h` OHLCV。
- CoinGecko、Gate、OKX 采集 latest quote；CoinGecko 同时写 market cap。
- 数据库中的最后 K 线是采集游标；漏跑后从游标自动追赶。
- 同一个 provider、任务、小时桶只允许一条 `ingestion_runs`，唯一键同时承担运行锁和重复投递保护。
- 429、5xx、网络失败和超时按指数退避重试；单个资产失败不丢弃其他资产。
- 旧 JSON 只作为迁移来源和 P4 前的页面回滚保护，不再由定时任务新增。
- 页面读数据库、BFF 和旧 JSON 读取下线属于 P4，不在本阶段混做。

## 2. 关键文件

| 文件 | 作用 |
|---|---|
| `lib/ingestion/provider-adapters.ts` | Gate、OKX、CoinGecko 服务端 adapter |
| `lib/ingestion/http.ts` | 超时、响应大小、限频和可重试错误策略 |
| `lib/ingestion/service.ts` | 运行锁、游标、补洞、幂等 upsert、partial 状态 |
| `lib/ingestion/legacy-import.ts` | 旧快照迁移并标记 `notForBacktest` |
| `lib/ingestion/data-health.ts` | provider、缺口、失败资产和 freshness 报告 |
| `app/api/v1/data-health/route.ts` | 只读、`no-store` 的数据健康接口 |
| `scripts/ingest-market-data.ts` | 定时采集命令入口 |
| `.github/workflows/ingest.yml` | 每小时只写数据库，不写 Git、不部署 |
| `.github/workflows/data-health.yml` | 每日数据健康检查 |

## 3. 采集语义

### 3.1 小时桶

运行时间向下取整到 UTC 整点，该整点是 `toExclusive`。例如任务在
`12:07Z` 启动，只采集 `12:00Z` 之前已经闭合的 K 线，不保存仍在变化的
`12:00Z` K 线。

### 3.2 补洞

- 首次运行默认回填 24 小时。
- 尾部漏跑从数据库中最后一个 `open_time + 1h` 开始追赶。
- 尾部已经追平时，再扫描最近 24 小时并修复内部缺口。
- 单次最大追赶 168 小时，避免错误配置造成无界请求。
- 三个窗口可用 `INGEST_INITIAL_BACKFILL_HOURS`、
  `INGEST_REPAIR_LOOKBACK_HOURS`、`INGEST_MAX_BACKFILL_HOURS` 调整。

### 3.3 幂等和失败隔离

运行键格式：

```text
market-quotes:{provider}:{bucket}
market-candles:{provider}:1h:{bucket}
```

`ingestion_runs.dedupe_key` 是数据库唯一键。相同小时桶重放返回
`skipped_duplicate`；K 线主键
`(asset_id, provider, timeframe, open_time)` 保证 upsert 不增加重复点。
已经完成或仍在正常运行的桶不能再次领取；完全失败的桶可以 compare-and-set
重新领取。超过 30 分钟仍为 `running` 的桶视为超过 workflow 运行上限的遗留任务，
也可由下一次投递安全回收。这样既能修正 provider/schema 问题后立即恢复，也不会让
进程崩溃留下永久死锁。

单资产请求失败时，其他资产仍然落库，运行记为 `partial`；整个 provider
不可用且没有可用数据时才记为 `failed`。错误摘要只保存经过截断的错误类型、
资产和 HTTP 状态，不保存 API key、完整查询参数或堆栈。

## 4. 旧快照迁移

```bash
npm run db:import-legacy
```

迁移后的旧 24h 滚动窗口使用 provider `legacy_snapshot`、timeframe `1d`，
并带有：

```json
{
  "quality": "legacy_snapshot",
  "window": "rolling_24h",
  "notForBacktest": true
}
```

它不是交易所切日 K 线，不能进入 P5 回测。导入键由快照日期和
`generatedAt` 组成，重复运行不会重复写入。

## 5. 本地与 CI 命令

```bash
# 先迁移并写入 reference data
npm run db:setup

# 一次实际采集
npm run ingest-market-data

# 查看安全的数据健康报告
npm run data:health

# P2/P3 数据库集成测试
npm run test:integration

# 完整离线质量门
npm run check
```

GitHub Actions 必须配置 repository secret：

| Secret | 必需 | 用途 |
|---|---:|---|
| `INGEST_DATABASE_URL` | 是 | 目标 PostgreSQL pooled connection string |
| `COINGECKO_API_KEY` | 否 | CoinGecko Pro 配额 |

`ingest.yml` 只有 `contents: read` 权限，不包含 `git add/commit/push`、Vercel
token 或部署命令。当前 P3 验收只能让该 secret 指向 Preview 数据库；
Production 必须另建数据库/branch 后再单独切换。

## 6. 数据健康

```text
GET /api/v1/data-health
```

报告包含：

- 三家 provider 的最近运行、最近成功、成功 freshness、卡死运行和
  24h partial/failed 次数；
- 429、5xx 计数；
- 24h/7d 小时 K 线覆盖率和缺口；
- 缺 K 线资产、失败资产；
- quote expected/present/fresh/missing、覆盖率、stale/fallback 数量；
- 注册表映射是否超过 30 天未核验；
- 最近运行的计数与状态，不返回原始错误正文和凭据。

`npm run data:health` 在 `degraded` 或 `critical` 时都会返回非零退出码；
`npm run ingest-market-data` 在任一 provider 为 `partial` 或 `failed` 时返回非零
退出码。数据库中已经成功写入的其他资产不会因此回滚，但 GitHub Actions 会明确亮红灯。

## 7. 停止与回滚

1. 在 GitHub Actions 禁用 `Market Data Ingestion`，即可停止新写入。
2. 页面在 P4 前仍读 `data/snapshots/`，停止采集不会让当前页面立刻失效。
3. 代码可回滚到上一版本；migration 不在 `next build` 中自动执行。
4. 不要降级或删除已写入的表；若 adapter 有问题，先停 workflow，再修复后从
   数据库游标继续补洞。

## 8. 自动化验收

- 漏跑 10 小时会补齐 10 个小时桶。
- 同一小时桶重跑返回 `skipped_duplicate`，K 线行数不增加。
- 完全失败的桶可以重新领取；恢复成功后再次重跑才返回 `skipped_duplicate`。
- 超过 30 分钟的遗留 `running` 桶可以安全回收。
- 一个资产失败时运行是 `partial`，其他资产继续写入。
- latest quote 只允许相同或更新的 `observed_at` 覆盖，乱序响应不能让行情倒退。
- OKX `volCcy24h` 按 quote currency 写入；`0002` 会修正早期错列数据。
- 旧快照事务化导入、失败可重试、重复导入不增加行数，并明确排除在回测之外。
- 429 尊重 `Retry-After`，重试前释放响应体，错误中不包含 URL 查询字符串。
- 健康检查忽略已停用映射和未来 K 线，并把缺失/过期 quote、过期成功记录及
  卡死运行纳入状态。
- migration、TypeScript、ESLint、测试和 Next.js production build 全部通过。

## 9. Preview 验收记录

- P3 migrations `0001_soft_xorn.sql` 和
  `0002_p3_quote_volume_semantics.sql` 已应用到现有 Preview Neon；
  OKX 错列成交量剩余行数为 0。
- 24 份旧快照全部处理：1260 个合法资产窗口写入，84 个缺少合法完整
  OHLC 的原始行被拒绝；第二次导入 24/24 均为 `skipped_duplicate`。
- 首次真实采集发现 CoinGecko 请求缺少 `7d/30d` 字段参数；adapter 修正后，
  原失败桶通过 compare-and-set 重新领取并成功，证明失败恢复路径有效。
- 审计修复后的真实采集 5/5 任务成功：CoinGecko quote 56/56、Gate quote
  54/54、OKX quote 52/52，Gate 新增闭合 K 线 54/54、OKX 52/52。
- 当前 latest quote 162/162 且 fresh 162/162；24h 闭合 `1h` K 线
  2544/2544；卡死运行 0、过期 provider 0、失败资产 0，Preview
  `data-health` 状态为 `healthy`。
- Vercel Preview deployment：
  `dpl_B6Zkk1pnXX9vphjt35fPVKkiQo6d`，
  `https://crypto-sector-board-mnxjgjvox-sitabanubanu-8645s-projects.vercel.app`。
- 线上主页、sectors、snapshots 均为 200；非法快照 400；匿名 POST sectors
  为 405；部署 error log 为空。
- 完整质量门通过：13 个测试文件、82 个测试、production audit 0 漏洞，
  production build 成功。
- GitHub repository secret `INGEST_DATABASE_URL` 已配置为 Preview 数据库。
  workflow 文件仍只存在于本地工作树，需随本批代码提交并 push 后才会定时执行。
- Production 没有新增数据库变量、migration 或写入。
