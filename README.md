<p align="center">
  <img src="./assets/readme/hero.svg" width="100%" alt="加密板块强弱看板：用市场广度、板块轮动与 Treemap 观察 56 个资产的结构变化">
</p>

<p align="center">
  <a href="https://crypto-sector-board.vercel.app"><img src="https://img.shields.io/badge/Live-Vercel-111827?logo=vercel&logoColor=white" alt="Vercel Production"></a>
  <a href="https://github.com/sitabanubanu/crypto-sector-board/actions/workflows/quality.yml"><img src="https://github.com/sitabanubanu/crypto-sector-board/actions/workflows/quality.yml/badge.svg?branch=main" alt="Quality workflow"></a>
  <img src="https://img.shields.io/badge/Next.js-16-000000?logo=next.js" alt="Next.js 16">
  <img src="https://img.shields.io/badge/PostgreSQL-Neon-336791?logo=postgresql&logoColor=white" alt="PostgreSQL on Neon">
</p>

<p align="center">
  <a href="https://crypto-sector-board.vercel.app"><strong>打开正式看板</strong></a>
  ·
  <a href="#本地运行">本地运行</a>
  ·
  <a href="./docs/06-runbook.md">运维与回滚</a>
</p>

**先看市场涨得广不广，再看哪些板块正在换挡。**

这是一个面向个人观察的加密市场结构看板。它把 **56 个资产**归入
**14 个板块**，每小时汇总 Gate.io、OKX 与 CoinGecko 数据，用市场广度、
Treemap、板块排名和 **24h / 3d / 7d / 30d** 同口径历史回答“谁强、为什么强、
强势是否扩散”。面积表示市值权重，颜色遵循中文行情习惯：**红涨、绿跌**。

<p align="center">
  <a href="https://crypto-sector-board.vercel.app">
    <img src="./assets/readme/product.png" width="100%" alt="正式站实景：市场脉搏、板块 Treemap 与四周期强弱对比">
  </a>
</p>

<p align="center"><sub>Production 实景 · P5.0/P5.1 · 14 个板块 / 56 个资产；行情与排名会随数据刷新变化。</sub></p>

## 它回答的四个问题

| 你想知道 | 看板怎么回答 |
|---|---|
| 今天是普涨还是少数币拉动？ | 显示全市场与板块上涨广度、中位数收益、有效样本数和贡献集中度。 |
| 哪些板块正在变强或变弱？ | 对比当前滚动 24h 排名与上一完整 UTC 日排名，标出上升、下降和最大变动。 |
| 一个板块为什么强？ | 按当前市值权重拆解资产贡献，列出主要贡献者，并给出版本化信号原因。 |
| 不同板块是否在同步波动？ | 用按 UTC 日期 inner join 的日收益计算相关性；少于 30 个共同样本时显示 `N/A`。 |

## 核心能力

- **市场脉搏**：市场广度、板块广度、排名变化、Top 贡献者、贡献集中度和数据质量同屏展示。
- **可解释信号**：`market-pulse-v1` 明确记录规则版本、触发原因、`asOf`、样本数与质量状态；覆盖或时效不足时不触发。
- **结构视图**：Treemap 同时展示板块与币种，面积对应市值权重，红绿对应涨跌。
- **四周期对比**：24h、3d、7d、30d 并排；缺失历史保持 `N/A`，不会伪造成 0。
- **搜索与下钻**：按资产 ID、代码、名称或板块搜索并联动高亮；精确资产可直接打开价格、K 线和成交活跃度详情。
- **相关性矩阵**：显示真实 Pearson 系数与共同样本数，同时明确“历史共同波动不代表因果”。
- **数据可信度**：页面暴露 backend、source、freshness、coverage 与 fallback；健康接口独立报告 provider、K 线和 quote 状态。

## 数据路径

<p align="center">
  <img src="./assets/readme/data-path.svg" width="100%" alt="Gate、OKX 和 CoinGecko 经每小时采集写入 PostgreSQL，再由 BFF 提供给 Next.js 页面，并保留 JSON 回滚路径">
</p>

1. Gate.io 与 OKX 提供 quote 和 `1h` K 线；CoinGecko 补充市值与末端 quote。
2. GitHub Actions 每小时采集，处理限流重试、单资产隔离、幂等写入和游标补洞。
3. PostgreSQL 保存规范资产注册表、latest quotes、小时 K 线与运行记录。
4. Next.js 通过版本化 BFF 返回 board、candles、history 与健康状态；浏览器不直连交易所。
5. 数据库读路径异常时可切换到只读 JSON；数据采集与网站部署彼此解耦。

## 工程与发布状态

- P0～P5.1 已进入 GitHub `main` 和 Vercel Production。
- 56 个规范资产、20 个别名、168 条 provider 状态和 14 个板块均通过注册表检查。
- 当前质量门包含 16 个测试文件、99 项测试、lint、TypeScript、migration、依赖审计与 Production build。
- `/api/v1/board` 默认从 PostgreSQL 读取，并与最后一份有效 JSON 做可选双读比较。
- `.github/workflows/ingest.yml` 每小时只写数据库；Production 通过独立的手动部署 workflow 发布。

> [!WARNING]
> 本项目只做市场结构观察与工程实验，不构成投资建议。金色星标表示“关注资产”，
> 不是用户真实持仓；信号和相关性描述已发生的样本期状态，不预测未来，也不表示因果。

当前边界：

- Preview 与 Production 暂时共用一套 Neon Free 数据库，只适合个人、低流量、非商业使用。
- 当前历史板块收益使用当前市值固定权重，适合轮动描述与相关性观察，**不能直接用于无前视回测**。
- MKR、XMR 没有可用的 Gate/OKX 现货历史，相应历史保持缺失，不使用其他资产代替。
- 真实持仓盈亏、point-in-time 回测、Telegram workflow 和移动端专用列表尚未实现。

## 接口

| Endpoint | 用途 | 缓存 |
|---|---|---:|
| `GET /api/v1/board` | 当前板块、资产、来源、关注资产与覆盖率 | 30 秒 |
| `GET /api/v1/candles?assetId=bitcoin&limit=48` | 单资产 `1h` K 线 | 5 分钟 |
| `GET /api/v1/history?assetIds=bitcoin,ethereum&days=31` | 多资产批量 UTC 日级历史 | 5 分钟 |
| `GET /api/v1/data-health` | provider、K 线、quote 与采集运行健康 | 不缓存 |

错误查询返回窄错误对象；服务端异常不会向客户端暴露连接串或上游凭据。

## 本地运行

最快路径不要求数据库。缺少数据库连接时，页面自动使用仓库内的只读 JSON：

```bash
git clone https://github.com/sitabanubanu/crypto-sector-board.git
cd crypto-sector-board
npm install
npm run dev
```

打开 `http://localhost:3000`。

要使用完整数据库路径，复制 `.env.example` 为 `.env.local`，填写隔离的
`DATABASE_URL`，然后运行：

```bash
npm run db:setup
npm run ingest-market-data
npm run data:health
```

### 质量门

```bash
npm run check
```

`check` 会依次执行 ESLint、TypeScript、资产注册表、migration 校验、Vitest、
生产依赖审计、完整审计策略和 Next.js Production build。

<details>
<summary><strong>主要环境变量</strong></summary>

| 变量 | 作用 |
|---|---|
| `DATABASE_URL` | 服务端 PostgreSQL pooled connection string |
| `DATABASE_POOL_MAX` | Serverless 单进程连接上限，默认 `1` |
| `DATA_BACKEND` | `db` 主路径或 `json` 回滚路径 |
| `DATA_DUAL_READ` | DB 模式下是否比较最后一份有效 JSON |
| `COINGECKO_API_KEY` | 可选 CoinGecko Pro key，只能放在服务端 |
| `INGEST_INITIAL_BACKFILL_HOURS` | 首次采集窗口 |
| `INGEST_REPAIR_LOOKBACK_HOURS` | 内部缺口检查窗口 |
| `INGEST_MAX_BACKFILL_HOURS` | 单次自动补洞上限 |
| `INGEST_HISTORY_BACKFILL_HOURS` | 一次性深历史补齐；不得写入定时 workflow |

完整示例见 [`.env.example`](./.env.example)。

</details>

<details>
<summary><strong>项目结构</strong></summary>

```text
app/api/v1/          board / candles / history / data-health
components/          市场脉搏、Treemap、趋势图、详情和相关性
data/                资产注册表、板块配置和只读快照
drizzle/             PostgreSQL migrations
lib/db/              schema、连接、seed 和查询
lib/ingestion/       provider adapter、补洞、重试和健康报告
lib/market-data/     数据契约、标准化、聚合和双读比较
lib/server/          server-only DAL、缓存和后端切换
scripts/             DB、采集、健康和映射命令
tests/               契约、路由、指标、数据库、采集和市场脉搏测试
.github/workflows/   质量门、每小时采集、健康巡检和手动 Production 部署
```

</details>

## 部署

- **代码发布**：先让 `npm run check` 与 GitHub Quality workflow 通过，再手动运行
  `Deploy Production`；当前没有启用 Vercel Git 自动部署。
- **数据刷新**：`.github/workflows/ingest.yml` 每小时只写 PostgreSQL，不提交快照、不触发部署。
- **数据巡检**：`.github/workflows/data-health.yml` 检查覆盖率、新鲜度和失败运行。

Production：[crypto-sector-board.vercel.app](https://crypto-sector-board.vercel.app)

## 路线图

- [x] **P0～P4** — 安全边界、数据契约、PostgreSQL、可靠采集与 BFF 页面读路径
- [x] **P5.0/P5.1** — 关注资产语义、正确相关性、市场脉搏、可解释信号与搜索
- [ ] **P5.2** — 真实持仓最小模型、point-in-time 数据与无前视回测
- [ ] **P6** — 移动端专用列表、Telegram、管理端和独立 Production 数据库

完整进度见 [`PROJECT_STATUS.md`](./PROJECT_STATUS.md) 和
[`docs/07-complete-repair-plan.md`](./docs/07-complete-repair-plan.md)。

## 文档

- [架构](./docs/02-architecture.md)
- [数据口径](./docs/03-data-spec.md)
- [运维与回滚](./docs/06-runbook.md)
- [完整修复计划](./docs/07-complete-repair-plan.md)
- [P2 数据库与注册表](./docs/09-p2-database-and-asset-registry.md)
- [P3 可靠采集](./docs/10-p3-reliable-ingestion.md)
- [P4 BFF 与页面切换](./docs/11-p4-bff-and-page-cutover.md)
- [P5.0/P5.1 市场脉搏实施计划](./docs/12-p5-market-pulse.md)

## 许可证

当前仓库尚未包含独立 `LICENSE` 文件。仓库公开可读不等于已经授予复用许可；
对外授权前需要补充明确的开源许可证。
