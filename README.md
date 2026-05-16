# 🧊 加密板块强弱看板

> **一眼看穿 14 个加密板块的强弱轮动，比 99% 的交易者更快发现资金流向。**

[![Deploy](https://img.shields.io/badge/Vercel-Deployed-black?logo=vercel)](https://crypto-sector-board.vercel.app)
[![Stack](https://img.shields.io/badge/Next.js-16-000?logo=next.js)](https://nextjs.org)
[![Data](https://img.shields.io/badge/Data-OKX%20Real--time-38a169)](https://www.okx.com)

---

## 👀 这是什么

一个为短线交易者设计的**加密市场热力图**。用 D3.js Treemap 把 56 个主流币按 14 个板块（L1/L2/DeFi/AI/Meme/RWA…）嵌套展示，**红涨绿跌**，面积反映市值权重，一眼看出哪个板块在吸血、哪个在失血。

**不是看行情软件上零散的涨跌幅列表——你看到的是板块级别的资金结构。**

---

## ⚡ 为什么比别的好用

| 你的痛点 | 这里的解法 |
|---|---|
| CoinGecko/CMC 每小时才更新一次 | **OKX 直连，30 秒刷新**，国内无需代理 |
| 切换 24h/7d/30d 看不清趋势 | **三列并排柱状图**，同屏对比三个周期，一眼识别趋势一致性 |
| 只能看预设板块，不能看自己想看的 | **自定义板块编辑器**，搜 OKX 现货币种创建专属看板 |
| 小板块被柱状图挡住 | **左下角一键全屏切换**，想只看热力图或只看对比图都行 |
| 换个浏览器配置就没了 | **localStorage 自动保存**，自选板块跨会话保留 |

---

## 🔥 核心功能

### 🗺️ Treemap 热力图
- 14 个内置板块：BTC / L1 / L2 / PoW / DeFi / DEX / AI / DePIN / Meme / 隐私 / RWA / BTC生态 / 基础设施 / 其他
- 56 个主流币，市值 > $3 亿纳入加权计算
- **红涨绿跌**（中国交易者习惯），颜色深浅 = 涨跌幅度
- 悬停看 OHLC、振幅、市值等详细数据

### 📊 多周期对比柱状图
- 24h / 7d / 30d **同时展示**，不用切换
- 按 24h 涨跌排序，用颜色编码统一面板
- 底部附交易用法说明（强势确认 / 回调机会 / 诱多陷阱 / 弱势回避）

### ✏️ 自选板块编辑器
- 内置板块一键开关
- **创建自定义板块**：命名 + 搜索 OKX 现货交易对
- 编辑、删除随意
- 自定义板块与内置板块平等渲染

### 🔄 实时数据引擎
- 浏览器直连 OKX 公开 API（不经过任何代理，国内可访问）
- 30 秒自动刷新，状态灯显示连接情况
- 7d/30d 历史数据从快照补充

---

## 🛠️ 本地运行

```bash
npm install
npm run dev        # → http://localhost:3000
npm run build      # 生产构建（纯静态，零后端）
```

抓取 CoinGecko 快照（7d/30d 历史数据来源，OKX 实时数据不需要这步）：

```bash
npm run fetch-snapshot
```

---

## 🧱 技术栈

**Next.js 16** (App Router, force-static) · **React 19** · **TypeScript** · **D3.js** · **OKX Public API** · **Vercel** · **GitHub Actions**

- 纯静态部署，零服务器成本
- OKX 数据浏览器直连，无需后端代理
- 自选配置存 localStorage，隐私零泄露
- GitHub Actions 每小时自动更新历史快照

---

## 📂 项目结构

```
crypto-sector-board/
├── app/                    # Next.js App Router
├── components/
│   ├── SectorTreemap.tsx   # D3 嵌套方块热力图
│   ├── TrendBarChart.tsx   # 三周期并排柱状图
│   ├── WatchlistEditor.tsx # 自定义板块编辑器
│   ├── Header.tsx          # 顶部控制栏
│   └── HomeClient.tsx      # 数据调度中枢
├── lib/
│   ├── okx.ts              # OKX API + 56 币符号映射 + 自定义板块转换
│   ├── watchlist.ts        # localStorage 自选持久化
│   ├── metrics.ts          # 市值加权指标计算
│   ├── colors.ts           # 红涨绿跌 8 阶色盘
│   └── types.ts            # 全局类型定义
├── data/
│   ├── sectors.json        # 14 板块 / 56 币种配置
│   └── snapshots/          # CoinGecko 历史快照归档
└── scripts/
    └── fetch-snapshot.ts   # CoinGecko 数据抓取脚本
```

---

## 📄 许可

MIT — 随便用，交易盈亏自负。
