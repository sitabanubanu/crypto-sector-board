# 项目状态快照

> **用途**：让任何人（或下次的 AI 会话）打开 30 秒内能续上项目。
> **更新频率**：每个阶段切换或重大决策后更新本文件。
> **更新时间**：2026-08-11
>
> **注意**：本文主体保留早期 MVP 阶段记录。当前修复路线以 `docs/07-complete-repair-plan.md` 和 `docs/14-p6-priority-assets-and-insights.md` 为准。

---

## 当前修复进度（2026-08-11）

- P6（优先资产与研究档案）：已完成 11 个资产接入，注册表为 67 assets / 30 aliases / 201 provider mappings / 14 sectors / 67 memberships；板块目录完整覆盖。
- P6 数据链路：Gate 在线映射 67/67、OKX 显式剔除 4 个当前不存在的现货映射；共享 Neon Free 数据库已完成 Preview/Production 幂等迁移与 seed，744 小时历史补齐成功，quotes 191/191、24h/7d K 线 100%、`data-health` 为 `healthy`。
- P6 页面：新增板块研究抽屉、币种项目档案、搜索/市场脉搏板块下钻、状态栏 full/compact/hidden 持久化、BTC 视觉权重压缩；桌面与 390×844 移动端控制台无 error/warning。
- P6 质量研究扩展：已为注册表中的全部 67 个资产建立 `data/asset-quality-research.json`，详情弹窗新增问题定义、可观察市场规模、项目方经济状态和六项质量标签；公开收入代理不会被标成净利润，完整口径见 `docs/15-asset-quality-research.md`。
- P6 质量门：17 个测试文件、105 项测试、lint、typecheck、registry、migration、生产构建通过；新增 `docs/14-p6-priority-assets-and-insights.md` 与 `docs/15-asset-quality-research.md`。
- P6 发布：提交 `5541ea8` 已推送 GitHub `main`；Preview deployment `dpl_F7R1Y9yoWT8WcuXhMPCeX9yojQqS` 与 Production deployment `dpl_HzDnhVduhuhHMpvirRrPyszyNjKS` 均为 Ready，正式入口为 `https://crypto-sector-board.vercel.app`。
- P6 线上复核：Production 页面可以打开币种详情并看到“项目质量研究”区块；`/api/v1/data-health` 返回 `healthy`，quote 191/191 fresh，24h/7d K 线缺口均为 0，database backend 覆盖 67/67。

- P0：安全边界、依赖审计和质量门已完成并通过 `npm run check`。
- P1：数据契约、provider fixtures、指标/快照校验、缓存和 watchlist 状态机已完成并通过测试。
- P2：Neon Marketplace 免费计划资源 `crypto-sector-board-preview-db` 已连接到 Preview（`sin1`），`npm run db:setup` 已成功写入 56 assets、20 aliases、168 provider mappings、14 sectors、56 memberships。
- P3（审计修复完成）：已实现 Gate/OKX `1h` K 线、三家 latest quote、CoinGecko market cap、数据库游标补洞、小时桶幂等锁、限流重试、单币失败隔离、事务化旧快照导入和 `/api/v1/data-health`；补齐 quote 防倒退、30 分钟遗留运行回收、Provider 无效记录错误、HTTP 响应释放以及健康状态防误报。
- P3 自动化：旧 `hourly-snapshot.yml` 已替换为只写数据库的 `ingest.yml`；不再提交快照、不再由采集任务触发 Vercel 部署。`partial` 采集和 `degraded` 健康状态现在会让 Action 失败。全量 13 个测试文件、82 个测试通过，生产依赖 0 漏洞，生产构建通过。
- P3 Preview 数据：24 份旧快照导入 1260 个合法资产窗口、拒绝 84 个不完整 OHLC；重复导入 24/24 均 `skipped_duplicate`。`0002_p3_quote_volume_semantics.sql` 已修正 OKX 历史成交量错列，剩余错误行 0；审计后真实采集 5/5 成功，latest quote 162/162 且 fresh 162/162，24h 闭合 `1h` K 线 2544/2544。
- P3 Preview 部署：Vercel deployment `dpl_B6Zkk1pnXX9vphjt35fPVKkiQo6d`，状态 Ready，URL 为 `https://crypto-sector-board-mnxjgjvox-sitabanubanu-8645s-projects.vercel.app`。
- P3 线上验收：新版 `/api/v1/data-health` 为 `healthy`、24h 缺口 0、quote 缺失/过期 0、卡死运行 0、过期 provider 0；主页/sectors/snapshots 为 200，非法快照为 400，匿名 POST 为 405，部署错误日志为空。
- P4 BFF：新增 `/api/v1/board`、`/api/v1/candles`、`/api/v1/history`，DB 聚合、严格契约、30 秒/5 分钟缓存、DB/JSON 双读和 `DATA_BACKEND=json` 回滚均已完成。
- P4 页面：首屏改为 server-only DAL，客户端用 SWR；56 个资产的 31 天历史合并为一个请求，浏览器不再调用 Gate/OKX/CoinGecko 通用代理。watchlist 已升级为 canonical asset ID schema v3。
- P4 历史：Preview 已执行一次性 744 小时补齐；Gate 40,176/40,176，OKX 38,659/38,688。日级聚合下推 PostgreSQL后，56 资产/31 天首次查询约 4.27 秒，覆盖约 96.43%；MKR、XMR 无交易所现货历史并明确标为缺失。
- P4 验收：14 个测试文件、89 个测试、生产依赖 0 漏洞和 production build 通过；桌面及 390×844 移动浏览器控制台 0 error/0 warning，30d、币种详情和自定义板块正常。
- P4 Preview 部署：deployment `dpl_2dsVYRMtmtfSkMgf7oEBeHV83TBB` 为 Ready，URL 为 `https://crypto-sector-board-4ryd8fh3y-sitabanubanu-8645s-projects.vercel.app`。board/history/candles/data-health/主页均通过受保护云端复验。
- P4 最终数据状态：board DB coverage 100%、dual-read common 56/56；history 1,674 点、覆盖约 96.43%；手动补齐最新小时后 data-health 为 `healthy`，24h/7d/quotes 均 100%。
- P5.0 语义与正确性：`holdings` 已统一改为 `focusAssets` / “关注资产”；成交量/市值指标改称“成交活跃度”并移除资金流结论；相关性改为 UTC 日收益按日期 inner join，少于 30 个共同样本、零方差或无效权重均显示 `N/A`，同时保留共同样本数。
- P5.1 市场脉搏：新增市场与板块上涨广度、中位数收益、Top 贡献者、贡献集中度、当前/上一完整 UTC 日排名、排名变化和 z-score；信号统一为 `market-pulse-v1`，输出原因、规则版本、时间、样本数和质量状态。
- P5.1 页面：新增首页市场脉搏和资产/板块搜索；匹配结果联动高亮 Treemap 与柱状图，精确资产搜索按 Enter 可打开详情；Treemap 币种支持键盘操作，相关性与详情弹窗补齐 dialog 语义。
- P5.0/P5.1 验收：16 个测试文件、99 个测试、lint、typecheck、资产注册表、migration、生产/完整依赖审计和 production build 全部通过；桌面与 390×844 浏览器回归无 error/warning，移动端页面宽度 390/390、无横向溢出。
- P5.0/P5.1 发布：功能提交 `b7f8f2d` 已推送到 GitHub `main`；Quality workflow `30710517995` 成功，Deploy Production workflow `30710554119` 成功，Vercel deployment `cU6aN4eMXSs9GUvxoGwt4NiWEoP3` 为 Ready，正式入口仍为 `https://crypto-sector-board.vercel.app`。
- P5.0/P5.1 线上验收：主页、board/history/candles/data-health API 均为 200；board 使用 database backend、覆盖 100%，历史数据可生成截至 2026-07-31 的 30 个共同日收益样本；市场脉搏、BTC 搜索/详情、相关性矩阵和 390×844 移动端均通过，生产浏览器控制台 0 error/0 warning。手动补齐后 data-health 为 `healthy`，24h/7d 缺口均为 0，三个 provider 均成功。
- Production 发布采用个人零成本临时方案：Vercel 保持 Hobby，Production 与 Preview 共用现有 Neon Free 数据库，不创建新的付费资源。该方案没有环境数据隔离，只适合当前个人、低流量、非商业使用；有外部用户或商业用途前必须拆分数据库。
- GitHub repository secret `INGEST_DATABASE_URL` 已指向这套共享免费数据库；`ingest.yml` 在 `main` 中每小时只写数据库，不再提交快照或触发数据型部署。
- 当前页面默认从数据库读取；旧 JSON 只作为只读回滚和双读比较基线，不再自动生成。
- 未完成：真实持仓、无前视回测、Telegram workflow、移动端专用列表、Production 独立数据库和正式域名。当前共享数据库例外及恢复步骤见 `docs/06-runbook.md`。

---

## 1. 项目目标

**加密板块强弱看板 → 交易辅助系统**：从"一张静态图"升级为**多时间维度 + 自动信号 + 个性推送**的交易决策工具。

核心路线：
- **第一程（本期 MVP）**：Treemap 看板 + 每小时自动刷新 + Vercel 公网部署
- **第二程（交易增强）**：多时间维度对比 + 板块轮动信号 + 异动检测 + 资金流向
- **第三程（个人化）**：持仓标记 + 板块相关性矩阵 + Telegram 推送

---

## 2. 当前进度（按 `docs/05-roadmap.md` 阶段划分）

### 第一程：MVP 上线

| 阶段 | 状态 |
|---|---|
| 阶段 0 — 项目骨架与文档 | ✅ 完成 |
| 阶段 1 — 板块清单 + 数据抓取脚本 | ✅ 完成（56/56 币抓通） |
| 阶段 2 — Treemap 渲染 | ✅ 完成（排版优化完毕） |
| 阶段 3 — 部署到 Vercel | ✅ 完成（crypto-sector-board.vercel.app） |
| 阶段 4 — 每小时自动抓取（GitHub Actions） | ✅ 完成（cron: 7 * * * *） |
| 阶段 5 — 开发日志自动化 | ⬜ 未开始 |
| 阶段 6 — 稳定性观察期 | ⬜ 未开始 |

### 第二程：交易增强

| 阶段 | 状态 |
|---|---|
| 阶段 7 — 多时间维度对比 | ⬜ 未开始 |
| 阶段 8 — 板块轮动 + 异动检测 | ⬜ 未开始 |
| 阶段 9 — 成交量加权 + 资金流向 | ⬜ 未开始 |
| 阶段 10 — 移动端适配 | ⬜ 未开始 |

### 第三程：个人化

| 阶段 | 状态 |
|---|---|
| 阶段 11 — 持仓标记 | ⬜ 未开始 |
| 阶段 12 — 板块相关性矩阵 | ⬜ 未开始 |
| 阶段 13 — Telegram 推送 | ⬜ 未开始 |

---

## 3. 已完成

- Next.js 16 + React 19 + TypeScript + Tailwind v4 项目骨架
- 完整文档体系：`docs/` 6 份标准文档 + `dev-logs/` 开发日志 + `CLAUDE.md` AI 协作指南 + `PLAN.md` 全局规划
- 板块清单 `data/sectors.json`（14 板块，56 币）
- 数据抓取脚本 `scripts/fetch-snapshot.ts`（CoinGecko 批量接口，10 秒跑完）
- 指标计算 `lib/metrics.ts`（基于滚动 24h 数据）
- 颜色规范 `lib/colors.ts`（红涨绿跌 9 档色阶）
- Treemap 主组件 `components/SectorTreemap.tsx`（SVG 渲染、可悬停 Tooltip、详细/总览切换）
- Header 顶栏 `components/Header.tsx`
- 主页面 `app/page.tsx` 读取最新快照渲染
- 本地 `npm run dev` 可看到完整页面
- GitHub 仓库已建：https://github.com/sitabanubanu/crypto-sector-board

---

## 4. 未完成

### 阶段 2 收尾（紧接着做）
- 排版调优：BTC 占比已通过 `pow(0.4) + 800` 压缩，但需用户验收
- 小板块（隐私币 / RWA / 其他主流）内部文字可读性可能仍需调整
- 视图切换"详细/总览"行为需在浏览器实测

### 第一程剩余
- Vercel 部署（阶段 3）
- GitHub Actions **每小时**抓取（阶段 4，升级为每小时）
- pre-commit hook 自动写 dev-logs（阶段 5）
- 稳定性观察（阶段 6）

### 第二程
- 多时间维度对比（阶段 7）——需要至少 7 天历史数据积累
- 板块轮动 + 异动信号（阶段 8）
- 成交量加权（阶段 9）
- 移动端列表视图（阶段 10）

### 已知技术债（不阻塞 MVP）
- `volatility` 是振幅一半的近似（无 K 线序列），未来升级 Pro API 后改回标准差
- "昨日完整快照" 实际是"滚动 24h"，等 Pro API 后改回 UTC 切日
- 每小时抓取初期可能遇到 Actions 执行时间限制，需观察

---

## 5. 关键约束

### 数据约束
- **CoinGecko 免费层限频严**：每分钟 ~10 请求，必须用批量接口 `/coins/markets`
- **每小时抓取可行**：批量接口一次抓 56 币只需 2 个请求（每页 50），远在限频内
- **数据时间口径**：滚动 24h，不是 UTC 0 点切日（详见 [docs/03-data-spec.md](docs/03-data-spec.md) 第 1 节）
- **主流币阈值**：流通市值 ≥ 3 亿美元才参与板块加权计算
- **第二程需要数据积累**：轮动检测至少需要 7 天历史，相关性矩阵至少需要 30 天

### 视觉约束
- **红涨绿跌**（中国习惯，已与用户对齐）
- **浅色背景**（已与用户对齐）
- **桌面优先**（≥1280px 全屏 Treemap），阶段 10 再做移动端专用视图
- 面积映射：`pow(marketCap, 0.4) + 800`，BTC 不应占超 1/8 屏

### 环境约束
- **VPN 代理端口 7890**：CoinGecko API 在国内访问需要走代理；脚本通过 `undici.ProxyAgent` 读 `HTTPS_PROXY` 环境变量
- **GitHub Actions 无需代理**：服务器在境外，直接访问 CoinGecko
- **目录名中文+空格**：npm 包只能装子文件夹 `crypto-sector-board/`
- **npm install 必须在 `crypto-sector-board/` 里跑**

### 协作约束（详见 [CLAUDE.md](CLAUDE.md)）
- 用户零编程基础，小步推进，每阶段独立验证
- 提交信息用中文简短描述
- 数据规范改动需同步更新 `docs/03-data-spec.md`

---

## 6. 文件结构说明

```
crypto-sector-board/
├── CLAUDE.md                    # AI 协作总入口（每次会话先读）
├── PLAN.md                      # 全局规划（不轻易改）
├── PROJECT_STATUS.md            # ★ 本文件，当前快照（高频更新）
├── README.md                    # 给外部看的项目介绍
│
├── app/                         # Next.js 路由（页面入口）
│   ├── page.tsx                 # 主页：读最新快照 → 渲染 Treemap
│   ├── layout.tsx               # 全局布局
│   └── globals.css              # 基础样式（浅色背景锁定）
│
├── components/                  # React 组件
│   ├── SectorTreemap.tsx        # ★ 核心：D3 treemap 渲染 + Tooltip
│   ├── Header.tsx               # 顶部信息栏 + 视图切换
│   ├── HomeClient.tsx           # 客户端壳子（测容器尺寸）
│   ├── TrendTable.tsx           # [未来] 多时间维度对比表
│   ├── SignalBar.tsx            # [未来] 顶部信号条
│   ├── FlowIndicator.tsx        # [未来] 资金热度标记
│   ├── MobileListView.tsx       # [未来] 移动端列表视图
│   ├── CorrelationHeatmap.tsx   # [未来] 板块相关性矩阵
│   └── PortfolioSummary.tsx     # [未来] 持仓汇总
│
├── lib/                         # 纯工具函数
│   ├── types.ts                 # 核心 TypeScript 类型
│   ├── coingecko.ts             # CoinGecko API 封装（含限频/重试/代理）
│   ├── metrics.ts               # 指标计算（振幅/涨幅/加权平均）
│   ├── colors.ts                # 涨跌色映射 + 格式化函数
│   ├── history.ts               # [未来] 历史数据聚合
│   ├── signals.ts               # [未来] 轮动/异动信号引擎
│   └── correlation.ts           # [未来] 板块相关性计算
│
├── scripts/
│   └── fetch-snapshot.ts        # 每小时抓取脚本（npm run fetch-snapshot）
│
├── data/
│   ├── sectors.json             # ★ 板块清单 + [未来] 持仓标记
│   └── snapshots/
│       └── YYYY-MM-DDTHH.json   # 每小时快照归档
│
├── docs/                        # 标准文档（每份独立、专一）
│   ├── 01-requirements.md       # ★ 产品需求（已改版：三条程线）
│   ├── 02-architecture.md       # 技术架构
│   ├── 03-data-spec.md          # ★ 数据规范（含 ID 映射陷阱表）
│   ├── 04-design-system.md      # 视觉规范（颜色、字号、布局）
│   ├── 05-roadmap.md            # ★ 开发路线图（已改版：19 阶段）
│   └── 06-runbook.md            # 运维手册（命令、排错）
│
└── dev-logs/                    # 开发日志（每日一份）
    ├── _template.md
    └── YYYY-MM-DD.md
```

---

## 7. 下一步计划（按优先级）

当前修复路线：

1. 下一批 P5 先设计真实持仓最小模型，明确数量、成本、计价币、估值和本地/云端存储边界；不要把关注资产继续当成持仓。
2. 持仓模型确认后，再设计 point-in-time 板块成员与市值数据，最后实现无前视回测、费用/滑点和缺口报告。
3. Telegram workflow、移动端专用列表和管理端继续独立排期；出现外部用户或商业用途前拆分 Production 数据库。

以下为早期 MVP 路线记录，不再作为当前执行入口：

1. ~~阶段 2 收尾~~ ✅ 排版优化已完成，推送到 GitHub

2. ~~阶段 3 — Vercel 部署~~ ✅ 公网地址：https://crypto-sector-board.vercel.app

3. ~~阶段 4 — 每小时自动抓取~~ ✅ `.github/workflows/hourly-snapshot.yml`，cron: `7 * * * *`

4. **阶段 5 — 开发日志自动化**（下一个）
   - 装 husky，写 pre-commit hook
   - GitHub Actions 兜底

5. **阶段 6 — 稳定性观察期**（2-3 天）
   - 观察每小时抓取是否正常
   - 观察 Vercel 自动部署是否触发

6. **阶段 7+ — 第二程交易增强**
   - 需要至少 7 天历史数据积累后才能启动

---

## 8. ⚠️ 不要改动的部分

| 文件 / 决策 | 原因 |
|---|---|
| `data/sectors.json` 板块归类 | 由用户维护；AI 只能在用户明确要求时改 |
| UTC 切日的方向（未来升级目标） | 虽然 MVP 用滚动 24h，但未来升级 API 后要切回 UTC 切日；不要把"滚动 24h"写死成永久方案 |
| `docs/03-data-spec.md` ID 映射陷阱表 | 已积累的踩坑记录（ordi→ordinals 等），新增可以，不要删 |
| 红涨绿跌的颜色惯例 | 已与用户对齐，不要改成西方习惯 |
| 浅色背景 | 已与用户对齐，不要做暗色 |
| `lib/coingecko.ts` 的批量接口选择 | 这是限频妥协的结果，不要回退到单币 `/market_chart` 轮询 |
| npm 命令必须在 `crypto-sector-board/` 内跑 | 在外层跑会污染上层目录（已踩过坑） |
| Tailwind v4 配置方式 | 没有 `tailwind.config.ts`，配置在 CSS 里；不要按 v3 文档配置 |
| `globals.css` 已锁定浅色 | 不要再加 `prefers-color-scheme: dark` 自动切换 |

---

## 9. 重要链接

- GitHub 仓库：https://github.com/sitabanubanu/crypto-sector-board
- 本地开发：http://localhost:3000（运行 `npm run dev` 后）
- CoinGecko API 文档：https://docs.coingecko.com/reference/introduction
- 详细文档索引：见 [CLAUDE.md](CLAUDE.md) "文档索引" 章节
