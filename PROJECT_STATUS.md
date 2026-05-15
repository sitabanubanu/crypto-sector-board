# 项目状态快照

> **用途**：让任何人（或下次的 AI 会话）打开 30 秒内能续上项目。
> **更新频率**：每个阶段切换或重大决策后更新本文件。
> **更新时间**：2026-05-15（路线图改版：从"每日静态看板"升级为"交易辅助系统"）

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
| **阶段 2 — Treemap 渲染** | 🟡 **进行中**（调样阶段） |
| 阶段 3 — 部署到 Vercel | ⬜ 未开始 |
| 阶段 4 — 每小时自动抓取（GitHub Actions） | ⬜ 未开始 |
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

1. **阶段 2 收尾**（当前焦点）
   - 用户在浏览器验收当前排版（BTC 占比是否合理、小板块是否可读）
   - 根据反馈微调 `components/SectorTreemap.tsx` 的面积公式 / 字号阈值

2. **阶段 3 — Vercel 部署**
   - 去 https://vercel.com 用 GitHub 登录 → Import → 一键部署
   - 拿到 `*.vercel.app` 公网网址

3. **阶段 4 — 每小时自动抓取**
   - 写 `.github/workflows/hourly-snapshot.yml`
   - cron: `0 * * * *`（每小时整点）

4. **阶段 5-6 — 日志自动化 + 稳定观察**

5. **阶段 7+ — 第二程交易增强**
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
