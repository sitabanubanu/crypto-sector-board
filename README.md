# 🧊 加密板块强弱看板

> **一眼看穿 14 个加密板块的资金流向，比 99% 的交易者更快发现轮动机会。**

[![Deploy](https://img.shields.io/badge/Vercel-Deployed-black?logo=vercel)](https://crypto-sector-board.vercel.app)
[![Stack](https://img.shields.io/badge/Next.js-16-000?logo=next.js)](https://nextjs.org)
[![Data](https://img.shields.io/badge/Data-Gate.io%20%7C%20OKX%20%7C%20CoinGecko-38a169)](https://www.okx.com)

---

## 👀 这是什么

一个为短线交易者设计的**加密板块实时看板**。把 ~60 个主流币按 14 个板块嵌套展示，**红涨绿跌**，面积反映市值权重。不是看零散的涨跌幅列表——你看的是**板块级别的资金结构**。

### 看一眼就知道

- 今天资金在猛攻哪个板块（方块大红 + 粗边框 = 高换手率）
- 哪些板块在持续走强/走弱（24h / 3d / 7d / 30d 四列并排）
- 有没有轮动信号（🔥 强势确认 / 💰 回调机会 / ⚠️ 诱多陷阱 / ❄️ 弱势回避）
- 你的持仓今天表现如何（金色 ★ 标记 + 持仓汇总面板）
- 板块之间有没有同涨同跌（相关性热力图）
- 如果按轮动策略调仓，历史收益会是多少（回测面板）

---

## 🔥 功能清单

### 🗺️ 板块热力图 (Treemap)
- 14 个内置板块：BTC / L1 / L2 / PoW / DeFi / 衍生品 DEX / AI / DePIN / Meme / 隐私 / RWA / BTC生态 / 基础设施 / 其他
- D3.js squarified treemap 布局，面积 = 板块市值，颜色 = 涨跌幅
- **红涨绿跌** 9 档色阶（中国交易者习惯）
- 悬停看板块 OHLC、振幅、市值；点击任意币种弹出详情弹窗
- 成交量融入视觉：边框粗细 = 换手率，一眼识别资金活跃度
- 视图切换：详细 / 总览 / 分屏 / 柱状图全屏 / 板块全屏

### 📊 多周期柱状图
- **24h / 3d / 7d / 30d 四列并排**，同屏对比短中长期趋势
- 板块名旁圆点 = 成交量占比，资金集中度一目了然
- 信号列自动标注轮动信号图标
- 底部附交易用法速查

### 🔍 币种详情弹窗
- 当前价格、24h 成交量、市值
- 四周期涨跌条（24h / 3d / 7d / 30d）
- 与板块均值对比，标明跑赢/跑输
- **7 日迷你 K 线**（SVG 折线图 + 面积填充）

### 🔄 板块轮动信号
- 自动检测四种信号：强势确认 🔥 / 弱势回避 ❄️ / 回调机会 💰 / 诱多陷阱 ⚠️
- 算法：四周期方向一致性判断
- Treemap 和柱状图同时展示

### ⭐ 持仓标记
- `data/sectors.json` 中配置持仓币种
- Treemap 上持有币显示金色五角星
- 右上角持仓汇总面板：总市值、24h 加权收益、逐币明细

### 📈 板块相关性热力图
- 14×14 Pearson 相关系数矩阵
- 红 = 正相关，绿 = 负相关，深浅 = 强度
- 悬停显示具体系数
- 用途：避免重仓高度相关的板块（如 AI 和 Meme 相关系数 0.85）

### 🧪 策略回测
- 简易轮动策略：每日选涨幅前 3 板块，等权持有 1 天
- 对比 BTC 基准，计算 α 超额收益
- 展示：总收益、胜率、最大回撤、月度收益、被选板块表现

### ✏️ 板块管理器
- 当前只读；匿名写接口已经关闭
- 内置板块通过 `data/sectors.json` 和 Pull Request 维护
- 认证管理端将在后续阶段重新开放

### ⚙️ 自选板块编辑器
- 内置板块一键开关
- 创建自定义板块：命名 + 搜索 Gate.io USDT 交易对
- localStorage 自动保存，跨会话保留

### 🎛️ 多策略预设
- 一键切换：全板块 / 主流链 / 激进 / 防御 / 基建
- 预设自动同步到自选配置，也可手动微调

### 📱 移动端适配
- 手机浏览器打开自动切换紧凑布局
- 列表视图 + 自适应字号

### 📡 Telegram 推送
- 每小时自动推送板块摘要（Top 5 + Bottom 3 + 信号 + BTC）
- GitHub Actions 定时执行，无需服务器

---

## ⚡ 数据引擎

| 层级 | 数据源 | 用途 | 刷新 |
|---|---|---|---|
| **主行情** | Gate.io | quote、24h、`1h` K 线 | 每小时采集 |
| **补充/回退** | OKX | Gate 缺失时的 quote 与 K 线 | 每小时采集 |
| **市值/末端回退** | CoinGecko | market cap、无交易所币种 quote | 每小时采集 |
| **页面主读** | PostgreSQL BFF | board、candles、批量 history | 30 秒 / 5 分钟缓存 |
| **回滚读取** | 只读 JSON 快照 | `DATA_BACKEND=json` 紧急回滚 | 不再自动新增 |

> 浏览器不直连上游，也不再逐币请求 K 线；56 个资产的 31 天历史合并为一个 BFF 请求。缺失数据会显示 `N/A`，不会承诺或伪造“所有币都有数据”。DB 模式可双读旧 JSON 比较，出现故障时可一键回滚。

---

## 🛠️ 本地运行

```bash
# 安装
npm install

# 开发
npm run dev          # → http://localhost:3000

# 构建
npm run build

# 完整离线质量门
npm run check

# 检查资产注册表与 migration
npm run registry:check
npm run db:check

# 有 DATABASE_URL 后初始化 PostgreSQL
npm run db:setup

# P3：采集、迁移旧快照和数据健康
npm run ingest-market-data
npm run db:import-legacy
npm run data:health

# 数据库与采集集成测试
npm run test:integration
```

### 环境变量

| 变量 | 说明 |
|---|---|
| `DATABASE_URL` | PostgreSQL pooled connection string；BFF、采集和 data-health 必需 |
| `DATABASE_POOL_MAX` | serverless 单进程连接上限，默认 1，允许 1～10 |
| `DATA_BACKEND` | 页面读路径：`db`（默认）或 `json`（回滚） |
| `DATA_DUAL_READ` | DB 模式下是否比较最后有效 JSON，默认 `true` |
| `COINGECKO_API_KEY` | CoinGecko Pro API 密钥，提升频率上限 |
| `INGEST_*_BACKFILL_HOURS` | 首次、修复和最大补洞窗口；默认 24/24/168 |
| `INGEST_HISTORY_BACKFILL_HOURS` | 仅一次性深历史补齐使用；定时任务保持未设置 |
| `TELEGRAM_BOT_TOKEN` | Telegram Bot Token，用于推送 |
| `TELEGRAM_CHAT_ID` | Telegram 接收人 Chat ID |
| `GITHUB_TOKEN` | GitHub PAT，用于网页内编辑板块清单 |

---

## 🧱 技术栈

**Next.js 16** (App Router + Turbopack) · **React 19** · **TypeScript** · **D3.js** · **SWR** · **PostgreSQL + Drizzle** · **Gate.io / OKX / CoinGecko API** · **Vercel**

- 服务端首屏 + server-only DAL + 版本化 BFF
- 规范资产注册表统一三家 provider instrument
- PostgreSQL migration、seed、幂等采集和自动补洞已就绪
- board 30 秒缓存、批量 history 5 分钟缓存，支持 DB/JSON 双读和回滚
- 自选配置存 localStorage，隐私零泄露
- GitHub Actions 每小时只写数据库，不提交数据文件、不触发部署
- 支持 CoinGecko Pro API 密钥，解锁更高频率

---

## 📂 项目结构

```
crypto-sector-board/
├── app/
│   ├── page.tsx                          # 服务端入口（直接调用 board DAL）
│   ├── layout.tsx                        # 根布局
│   └── api/
│       ├── v1/board/route.ts             # 当前看板 BFF
│       ├── v1/candles/route.ts           # 单资产小时 K 线
│       ├── v1/history/route.ts           # 多资产批量日级历史
│       └── v1/data-health/route.ts        # 数据 SLO
├── components/
│   ├── HomeClient.tsx                    # 看板交互与展示编排
│   ├── board/use-board-data.ts           # board/history SWR
│   ├── SectorTreemap.tsx                 # D3 嵌套方块热力图
│   ├── TrendBarChart.tsx                 # 四周期并排柱状图 + 信号列
│   ├── Header.tsx                        # 顶栏：周期/视图/预设/状态
│   ├── CoinDetailModal.tsx               # 币种详情弹窗 + 7 日迷你 K 线
│   ├── WatchlistEditor.tsx               # 自选板块开关 + 自定义板块
│   ├── SectorManager.tsx                 # 网页内板块清单编辑器
│   ├── PortfolioSummary.tsx              # 持仓汇总面板（金色 ★ 标记）
│   ├── CorrelationHeatmap.tsx            # 板块相关性矩阵热力图
│   └── BacktestPanel.tsx                 # 策略回测面板
├── lib/
│   ├── gate.ts                           # Gate.io 数据抓取 + 快照构建
│   ├── okx.ts                            # OKX API + 符号映射
│   ├── coingecko.ts                      # CoinGecko API + K 线获取
│   ├── metrics.ts                        # 市值加权指标计算
│   ├── colors.ts                         # 红涨绿跌色盘
│   ├── signals.ts                        # 板块轮动信号检测
│   ├── correlation.ts                    # Pearson 相关性矩阵
│   ├── backtest.ts                       # 策略回测引擎
│   ├── presets.ts                        # 板块预设定义
│   ├── watchlist.ts                      # 自选 localStorage 持久化
│   ├── snapshot.ts                       # 快照读写
│   ├── db/                               # Drizzle schema、连接和 reference seed
│   ├── ingestion/                        # P3 adapter、补洞、重试、健康报告
│   ├── market-data/                      # P4 契约、聚合、双读比较
│   ├── server/                           # server-only DAL、缓存、后端切换
│   └── types.ts                          # 全局类型定义
├── data/
│   ├── assets.json                       # 56 资产 / 168 provider 状态
│   ├── sectors.json                      # v2 规范 assetIds 板块配置
│   └── snapshots/                        # 历史快照归档
├── drizzle/                              # PostgreSQL SQL migrations + metadata
├── scripts/
│   ├── fetch-snapshot.ts                 # CoinGecko 快照抓取
│   ├── db-migrate.ts / db-seed.ts        # 数据库初始化
│   ├── ingest-market-data.ts             # P3 幂等行情采集
│   ├── import-legacy-snapshots.ts         # 旧快照迁移
│   ├── data-health.ts                    # 数据健康命令
│   ├── verify-provider-mappings.ts        # 在线映射巡检
│   └── send-telegram.ts                  # Telegram 推送
└── .github/workflows/
    ├── quality.yml                       # PR / main 质量门
    ├── ingest.yml                        # 每小时只写 PostgreSQL
    └── data-health.yml                   # 每日数据质量检查
```

---

## 📄 许可

MIT — 随便用，交易盈亏自负。
