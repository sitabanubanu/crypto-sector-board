# 加密板块强弱看板 — 完整开发计划

> 这是项目的总体规划文件，已与用户对齐并批准。后续每阶段执行时，对照本文件验收。
> 详细文档拆分到 `docs/` 目录下，本文件保留全局视图。

## Context

用户是编程零基础的短线交易者，希望通过一个"板块强弱看板"网页快速判断加密市场不同板块的日内强弱，辅助短线决策。核心诉求：

- 板块清单由用户自定义（已提供，见下方）
- 每日 UTC 0 点切日，记录上一日的最高价、最低价、振幅、波动率、收益率
- 板块指标 = 板块内各币按市值加权平均
- Treemap 嵌套方块：外层=板块（面积~板块总市值），内层=单币（面积~单币市值）
- 颜色表示昨日涨跌（绿涨红跌，深浅表幅度）

**MVP 范围**：只做"昨日完整快照"主屏，不做 3天/周/月 历史对比页（数据从第一天起自动归档，后续可加）。

**关键约束**：
- 用户零代码基础，开发节奏必须**小步推进、每阶段独立验证、可回滚**
- 部署到 Vercel 公开网址，GitHub Actions 跑每日快照
- 项目自带文档体系（docs/）和开发日志（dev-logs/），方便复盘和延续

---

## 一、板块清单（已与用户对齐 + 我补充的市场代表币）

| # | 板块 | 币种（CoinGecko ticker） | 备注 |
|---|---|---|---|
| 0 | **BTC** | BTC | 单独成块 |
| 1 | **Layer 1 主流** | ETH, SOL, BNB, XRP, ADA, AVAX, TRX, TON, DOT, SUI, APT, NEAR | 用户提到的 + 我补 AVAX/TRX/NEAR |
| 2 | **L2 & 扩容** | ARB, OP, STRK, MNT, CFX | 补 ARB/MNT |
| 3 | **PoW 老币** | LTC, BCH, ETC | 补 LTC |
| 4 | **DeFi** | AAVE, UNI, COMP, CRV, LDO, JUP, ENA, MKR | 补 MKR |
| 5 | **衍生品 DEX** | HYPE, DYDX, ASTER | |
| 6 | **AI** | TAO, FET, WLD, VIRTUAL, RENDER | 补 RENDER |
| 7 | **DePIN** | FIL, LPT, HNT | 补 HNT |
| 8 | **Memecoin** | DOGE, PEPE, WIF, TRUMP, SHIB, BONK, FLOKI | 补 SHIB/BONK/FLOKI |
| 9 | **隐私币** | XMR, ZEC, DASH | |
| 10 | **RWA** | ONDO | 板块仅 1 币，先这样 |
| 11 | **BTC 生态** | ORDI, STX | 补 STX |
| 12 | **基础设施** | LINK, ENS | |
| 13 | **其他主流** | PI | 用户列了但不属其它分类，单列一格 |

**关于 CRCLX**：用户提供的 CoinAnk 链接显示是 Gate.io 上 CRCLX_USDT 永续合约（productType=SWAP），属衍生品标的，CoinGecko 不收录。**MVP 阶段先不加入**，未来若扩展接合约 API 可再考虑。

---

## 二、技术栈

| 用途 | 选型 | 原因 |
|---|---|---|
| 框架 | Next.js 14 (App Router) + React + TypeScript | Vercel 一键部署，生态成熟 |
| 样式 | Tailwind CSS | 不写 CSS 文件，类名直接拼 |
| 可视化 | D3.js (`d3-hierarchy` treemap) | 标准实现，社区方案成熟 |
| 数据源 | CoinGecko 免费 API | 无需 key，速率限制对本场景够用 |
| 定时任务 | GitHub Actions cron | 免费、零运维 |
| 存储 | 仓库内 JSON (`data/snapshots/YYYY-MM-DD.json`) | 零基础友好，无需数据库 |
| 部署 | Vercel | 免费，从 GitHub 自动部署 |

---

## 三、项目目录结构

```
模仿项目/
├── CLAUDE.md                       # ★ AI 协作总入口：指引各文档路径 + 工作流程
├── README.md                       # 给用户看的项目说明
├── PLAN.md                         # 本文件，全局规划
├── app/
│   ├── page.tsx                    # 主页：读最新快照 → 渲染 Treemap
│   ├── layout.tsx                  # 全局布局（暗色主题）
│   └── globals.css                 # Tailwind 入口
├── components/
│   ├── SectorTreemap.tsx           # D3 treemap 组件
│   ├── Header.tsx                  # 顶部信息栏
│   └── Tooltip.tsx                 # 悬停详情
├── lib/
│   ├── coingecko.ts                # API 封装
│   ├── metrics.ts                  # 指标计算
│   └── types.ts                    # 类型定义
├── data/
│   ├── sectors.json                # 板块清单（手工维护）
│   └── snapshots/
│       └── YYYY-MM-DD.json         # 每日快照（Actions 写入）
├── scripts/
│   └── fetch-snapshot.ts           # 抓取 + 计算 + 写文件
├── docs/                           # ★ 项目标准文档（详见第四节）
│   ├── 01-requirements.md
│   ├── 02-architecture.md
│   ├── 03-data-spec.md
│   ├── 04-design-system.md
│   ├── 05-roadmap.md
│   └── 06-runbook.md
├── dev-logs/                       # ★ 每日开发日志（详见第五节）
│   ├── _template.md
│   └── YYYY-MM-DD.md
├── .github/workflows/
│   └── daily-snapshot.yml          # 每日 UTC 00:30 跑数据抓取
└── package.json / tsconfig.json / tailwind.config.ts
```

---

## 四、`docs/` 标准文档清单

每份文档独立、专一，便于以后逐项更新。

| 文件 | 内容概要 |
|---|---|
| **01-requirements.md** | 产品需求：用户画像、核心场景、功能列表、非功能需求（性能、可用性）、MVP 范围与未来迭代 |
| **02-architecture.md** | 技术架构：技术栈选型理由、数据流（CoinGecko → Actions → JSON → Next.js → 用户浏览器）、目录结构、关键依赖版本 |
| **03-data-spec.md** | 数据规范：sectors.json 结构、snapshot JSON 字段定义、指标公式（振幅/波动率/加权平均）、UTC 切日规则、市值过滤规则 |
| **04-design-system.md** | 视觉规范：暗色主题色板、涨跌色映射函数、字体层级、Treemap 间距、响应式断点、可访问性要求 |
| **05-roadmap.md** | 开发阶段路线图，每完成一阶段在此打勾 |
| **06-runbook.md** | 运维手册：本地启动命令、手动跑数据脚本、查看 Actions 日志、Vercel 部署排错、CoinGecko 限频处理、常见报错对照 |

---

## 五、`dev-logs/` 开发日志机制

每天自动留下一份"今天做了什么 / 还没做什么"的记录，方便回顾和断点续做。

1. **本地 Git pre-commit hook 触发**（主要）：每次提交把当天的提交信息追加到 `dev-logs/YYYY-MM-DD.md`
2. **GitHub Actions 兜底**（每天 UTC 23:50）：即使当天没提交也生成日志骨架

`_template.md` 结构：今日完成 / 进行中 / 明日待办 / 遇到的问题或决策。

---

## 六、开发阶段（小步推进，每阶段独立验证）

| 阶段 | 目标 | 验收 |
|---|---|---|
| **阶段 0** | 项目骨架与文档 | GitHub 仓库可见，本地 `npm run dev` 看到 Next.js 欢迎页 |
| **阶段 1** | 板块清单 + 数据抓取脚本 | 本地跑出 snapshot JSON，BTC 数据与 CoinGecko 网页误差 <1% |
| **阶段 2** | Treemap 渲染 | 浏览器看到板块方块，BTC 不超过 25% 面积，颜色与涨跌一致 |
| **阶段 3** | 部署到 Vercel | 拿到 vercel.app 公网网址，手机能打开 |
| **阶段 4** | 每日自动抓取 | GitHub Actions 自动跑通，Vercel 自动重新部署 |
| **阶段 5** | 开发日志自动化 | 每次提交自动写入 dev-logs |
| **阶段 6** | 稳定性观察期（2-3 天） | 连续两天 cron 自动跑通无人工干预 |
| **阶段 7+** | 后续迭代（先不做） | 历史对比、表格视图、K 线下钻、网页编辑板块清单 |

---

## 七、风险与对策

| 风险 | 对策 |
|---|---|
| CoinGecko 限频 / API 改版 | 限频脚本 + 失败重试 3 次；docs/06-runbook.md 写明排错路径 |
| GitHub Actions 偶发失败 | Actions workflow 设置失败邮件通知；阶段 6 观察期留出排查时间 |
| 板块清单后期想改 | sectors.json 是纯数据文件，编辑后下次抓取自动生效，无需改代码 |
| 数据正确性误差 | 每阶段都设核对环节；指标公式集中在 lib/metrics.ts，便于审计 |
| AI 协作上下文丢失 | CLAUDE.md + docs/ + dev-logs/ 三层文档保留全部决策与进度 |
| 中文路径/空格 | 项目路径含 "cluade code"（拼写笔误，含空格），多数 Node 工具能处理；若安装报错再换路径 |