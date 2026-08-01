# 06 - 运维手册

## 1. 本地开发与质量门

```bash
npm install
npm run dev
npm run check
```

`npm run check` 会依次执行 ESLint、TypeScript、资产注册表、migration、Vitest、生产依赖审计、完整审计策略和 Next.js 生产构建。

复制 `.env.example` 为本地 `.env.local`，只填写隔离的开发或 Preview 凭据。任何真实连接串都不得提交。

## 2. 数据库与资产注册表

```bash
# 不连接数据库也能执行
npm run registry:check
npm run db:check

# 在线核对三家 provider
npm run registry:verify

# 有 DATABASE_URL 后执行
npm run db:setup
```

reference seed 的基线是 56 assets、20 aliases、168 provider instruments、14 sectors 和 56 个当前 memberships。`db:setup` 必须由运维步骤显式运行，不得塞进 `next build`。

Vercel 通过 Marketplace Storage 接入 PostgreSQL，并只注入服务端 `DATABASE_URL`。默认始终先操作 Preview，Production 使用独立资源并单独确认。当前个人部署采用下文记录的零成本临时例外。

## 3. 采集、补洞与数据健康

```bash
npm run db:migrate
npm run ingest-market-data
npm run data:health

# 旧 JSON 只做幂等迁移
npm run db:import-legacy
```

采集器会重试 429、5xx、网络错误和超时，并用数据库键抵抗重复投递。`partial`/`failed` 采集与 `degraded`/`critical` 健康状态返回非零退出码，但已经成功落库的资产不会回滚。

需要一次性补 31 天小时历史时，在 PowerShell 中运行：

```powershell
$env:INGEST_HISTORY_BACKFILL_HOURS = "744"
npm run ingest-market-data
Remove-Item Env:INGEST_HISTORY_BACKFILL_HOURS
```

这个变量只能临时使用，不能写入定时 workflow。深历史任务记录为 `market-candles-history`，不会把旧时点缺失误判为当前实时 SLO 失败。

## 4. P4 BFF 与页面读路径

关键环境变量：

| 变量 | 推荐值 | 作用 |
|---|---|---|
| `DATABASE_URL` | 默认 Preview/Production 各自独立 | 仅服务端数据库连接；当前个人部署例外见下文 |
| `DATA_BACKEND` | `db` | `db` 读 PostgreSQL；`json` 走回滚快照 |
| `DATA_DUAL_READ` | `true` | DB 模式下附带 DB/JSON 差异元数据 |
| `DATABASE_POOL_MAX` | `1` | serverless 单实例连接上限 |

本地或部署后检查：

```bash
curl http://localhost:3000/api/v1/board
curl "http://localhost:3000/api/v1/candles?assetId=bitcoin&limit=48"
curl "http://localhost:3000/api/v1/history?assetIds=bitcoin,ethereum&days=31"
curl http://localhost:3000/api/v1/data-health
```

预期行为：

- board 返回 `meta.backend=database`、真实 source/freshness/coverage 和 14 个板块。
- history 将全部资产合并为一个批量请求；不再出现每币一个 K 线请求。
- MKR 和 XMR 没有 Gate/OKX 现货映射，交易所历史应明确缺失，不能用 SKY 或其他资产冒充。
- 错误查询返回 400；内部错误返回不含凭据的 500；错误响应不缓存。

### 个人零成本临时例外（2026-07-30）

当前项目仅供所有者偶尔查看，且明确不接广告、不作商业使用。为避免新增云资源费用：

- Vercel 保持 Hobby；不升级套餐。
- Production 与 Preview 暂时共用现有 Neon Free 数据库。
- GitHub Actions 的 `INGEST_DATABASE_URL` 也写入这套共享数据库。
- 不创建第二套付费 PostgreSQL，不复制连接串到客户端或仓库。

这意味着 Preview 的迁移、seed、导入和手动采集都会影响 Production 数据。当前页面和 BFF 以只读为主，因此可接受该折中；一旦开放给其他用户、加入管理写操作或开始商业使用，必须先建立独立 Production 数据库、备份/恢复流程和单独凭据，再迁移流量。任何套餐升级或新资源创建都要重新确认费用。

## 5. DB/JSON 回滚

页面数据库读路径异常时：

1. 在 Vercel 对目标环境把 `DATA_BACKEND` 改为 `json`。
2. 重新部署该环境。
3. 验证 `/api/v1/board` 的 `meta.backend` 为 `json`，并检查页面。
4. 保留数据库和采集，不要删除或覆盖数据。

恢复数据库路径：

1. 先确认 `/api/v1/data-health` 为 `healthy`。
2. 把 `DATA_BACKEND` 改回 `db`，`DATA_DUAL_READ` 设为 `true`。
3. 重新部署，核对 dual-read overlap 和主要数值差异。

JSON 模式会完全绕过数据库，`DATA_DUAL_READ` 在该模式下自动失效。回滚只改变读取，不改变采集与已存数据。

## 6. GitHub Actions 排错

- `Market Data Ingestion` 只应有仓库读取权限，不应含 `git push` 或 Vercel 部署。
- `DATABASE_URL is required`：检查 repository secret `INGEST_DATABASE_URL`。
- CoinGecko 429：等待退避重试；持续发生时检查配额。
- 单币失败：检查对应 `ingestion_runs`；其他资产应已落库且本次为 `partial`。
- Node 版本：workflow 使用 Node 22。

手动触发：GitHub 仓库 → Actions → 选择 workflow → Run workflow。

## 7. Vercel 部署排错

- 部署前本地执行 `npm run check`。
- Preview 必须存在 `DATABASE_URL`、`DATA_BACKEND=db`、`DATA_DUAL_READ=true`。
- Deployment Protection 开启时，匿名浏览器会跳到 Vercel 登录页；使用 `vercel curl` 验证受保护的 Preview API。
- 数据库迁移和 seed 不在 build 中运行；新数据库先显式执行 `npm run db:setup`。
- 默认生产环境不得复用 Preview 数据库。当前个人零成本部署是已记录的临时例外；执行 Preview migration、seed、导入或清理前，要按 Production 变更处理。

Vercel deployment 回滚与 `DATA_BACKEND=json` 是两层不同的保护：前者回滚代码，后者只回滚数据读路径。

### 手动发布 Production

项目不启用 Git push 自动部署。发布前先确认 `main` 的 `Quality` workflow 通过，然后在
GitHub Actions 手动运行 `Deploy Production`。该 workflow 只在 `workflow_dispatch` 时执行，
使用仓库 Secret `VERCEL_TOKEN` 和已提交的 `.vercel/project.json` 发布当前 `main`。

本机已有 Vercel 登录态时，也可以从已确认且工作树干净的提交执行：

```bash
npx vercel deploy --prod --yes
```

发布后至少复验主页、`/api/v1/board`、`/api/v1/history` 和
`/api/v1/data-health`；不要在日志或文档中输出数据库连接串、Vercel token 或 Telegram token。

## 8. 常见数据问题

| 现象 | 可能原因 | 处理 |
|---|---|---|
| 页面显示暂无数据 | 数据库连接失败或 board 聚合失败 | 看部署日志和 data-health；必要时切 `DATA_BACKEND=json` |
| 单币是 `N/A` | provider 下架、映射 unavailable 或 coverage 不足 | 运行 `registry:verify`，核对 `data/assets.json`，不要伪造 0 |
| 小时 K 线有缺口 | workflow 漏跑或单 provider 失败 | 重触发采集，游标会补洞，再运行 `data:health` |
| 31 天历史少于 31 点 | 上市较晚、历史源不完整或无交易所映射 | 查看 history 的 missing/coverage/source |
| 板块加权异常 | 市值缺失、陈旧或覆盖不足 | 检查 board provenance、market caps 和 coverage |
| DB/JSON 差异突然放大 | 数据口径、provider 选择或快照过旧 | 先看 dual-read 明细，再决定继续 DB 或临时回滚 |

## 9. 紧急操作

- 停止页面：Vercel Dashboard → Project Settings → Pause Project。
- 只停止新数据：在 GitHub Actions 禁用 `Market Data Ingestion`。
- 只回滚读取：设置 `DATA_BACKEND=json` 后重新部署。
- 不要删除数据库；恢复后采集器会从已存游标继续补洞。
