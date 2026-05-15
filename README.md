# 加密板块强弱看板 (Crypto Sector Board)

一个用 Treemap 嵌套方块直观展示加密市场板块强弱的网页工具，辅助短线交易判断。

## 特性

- **板块视图**：14 个自定义板块（BTC / L1 / L2 / DeFi / AI / Memecoin / 隐私 / DePIN / RWA …）
- **方块面积**：板块用市值 `sqrt` 映射（避免 BTC 占半屏），单币用市值
- **颜色编码**：绿涨红跌，深浅表幅度
- **数据频率**：每天 UTC 00:30 自动抓取上一日数据
- **数据源**：CoinGecko 公开 API
- **历史归档**：每日快照存入仓库 `data/snapshots/`，未来可做历史对比

## 技术栈
Next.js 16 (App Router) · React 19 · TypeScript · Tailwind CSS v4 · D3.js · GitHub Actions · Vercel

## 本地开发

```bash
npm install
npm run dev
# 打开 http://localhost:3000
```

## 手动抓取数据

```bash
npm run fetch-snapshot
# 生成 data/snapshots/YYYY-MM-DD.json
```

## 项目文档
- 总规划：[PLAN.md](./PLAN.md)
- AI 协作指南：[CLAUDE.md](./CLAUDE.md)
- 详细文档：[docs/](./docs)
- 开发日志：[dev-logs/](./dev-logs)

## 状态
MVP 开发中（阶段 0 — 项目骨架）。详见 [docs/05-roadmap.md](./docs/05-roadmap.md)。