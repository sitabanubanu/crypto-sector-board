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
- 网页内直接增删改板块和币种
- 搜索 Gate.io 现货交易对
- 保存后自动提交（本地开发写文件，生产环境通过 GitHub API 提交 PR）

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
| **主力** | Gate.io | 实时价格、24h 涨跌、K 线 | 30 秒 |
| **兜底** | OKX | Gate.io 没有的币（如 ONDO）自动切换 | 30 秒 |
| **末端** | CoinGecko | 两边都没有的币（如 XMR、Aster） | 30 秒 |
| **历史** | 快照归档 | 7d / 30d 基准数据 | 每小时 |

> 三层 fallback 保证所有币种都有数据。浏览器直连交易所公开 API，不经任何代理。Gate.io 国内可访问，无需翻墙。

---

## 🛠️ 本地运行

```bash
# 安装
npm install

# 开发
npm run dev          # → http://localhost:3000

# 构建
npm run build        # 纯静态输出，零服务器

# 手动抓取快照（补充历史数据）
npm run fetch-snapshot

# 手动发送 Telegram 推送
npm run telegram-push
```

### 环境变量（可选）

| 变量 | 说明 |
|---|---|
| `COINGECKO_API_KEY` | CoinGecko Pro API 密钥，提升频率上限 |
| `TELEGRAM_BOT_TOKEN` | Telegram Bot Token，用于推送 |
| `TELEGRAM_CHAT_ID` | Telegram 接收人 Chat ID |
| `GITHUB_TOKEN` | GitHub PAT，用于网页内编辑板块清单 |

---

## 🧱 技术栈

**Next.js 16** (App Router + Turbopack) · **React 19** · **TypeScript** · **D3.js** (hierarchy + scale) · **Gate.io / OKX / CoinGecko API** · **Vercel** · **GitHub Actions**

- 纯静态部署 + Edge API Routes，零服务器成本
- 交易所数据浏览器直连，三层 fallback 自动切换
- 自选配置存 localStorage，隐私零泄露
- GitHub Actions 每小时自动抓取快照 + Telegram 推送
- 支持 CoinGecko Pro API 密钥，解锁更高频率

---

## 📂 项目结构

```
crypto-sector-board/
├── app/
│   ├── page.tsx                          # 服务端入口（读取快照+持仓）
│   ├── layout.tsx                        # 根布局
│   └── api/
│       ├── cg/[...path]/route.ts         # CoinGecko 边缘代理
│       ├── gate/[...path]/route.ts       # Gate.io 边缘代理
│       ├── okx/[...path]/route.ts        # OKX 边缘代理
│       ├── sectors/route.ts              # 板块清单 CRUD
│       └── snapshots/route.ts            # 历史快照查询
├── components/
│   ├── HomeClient.tsx                    # 数据调度中枢 + OKX/CoinGecko 实时更新
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
│   └── types.ts                          # 全局类型定义
├── data/
│   ├── sectors.json                      # 14 板块 / ~60 币种 / 持仓配置
│   └── snapshots/                        # 历史快照归档
├── scripts/
│   ├── fetch-snapshot.ts                 # CoinGecko 快照抓取
│   └── send-telegram.ts                  # Telegram 推送
└── .github/workflows/
    └── hourly-snapshot.yml               # 每小时自动抓取 + 推送
```

---

## 📄 许可

MIT — 随便用，交易盈亏自负。
