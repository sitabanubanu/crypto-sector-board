# 02 - 技术架构

## 1. 技术栈

| 用途 | 选型 | 版本 |
|---|---|---|
| 框架 | Next.js (App Router) | 16.2.6 |
| 运行时 | React | 19.2.4 |
| 语言 | TypeScript | ^5 |
| 样式 | Tailwind CSS | ^4 |
| 可视化 | D3.js (`d3-hierarchy`) | 阶段 2 安装 |
| HTTP | 原生 fetch | - |
| 数据源 | CoinGecko Public API | 无 key |
| 定时 | GitHub Actions cron | 内置 |
| 部署 | Vercel | - |

> ⚠️ **Next.js 16 / Tailwind v4 注意事项**：
> - Next 16 没有 `pages/`，全部用 `app/` (App Router)
> - Tailwind v4 不再生成 `tailwind.config.ts`，配置走 `@import "tailwindcss"` + `@theme` CSS 块
> - PostCSS 插件改名 `@tailwindcss/postcss`
> - 未来若要改 Next 配置，先看 `node_modules/next/dist/docs/`

## 2. 数据流

```
┌─────────────┐     ┌──────────────┐     ┌────────────┐     ┌──────────┐     ┌────────┐
│ CoinGecko   │ ──▶ │ GitHub       │ ──▶ │ data/      │ ──▶ │ Next.js  │ ──▶ │ 浏览器 │
│ Public API  │     │ Actions      │     │ snapshots/ │     │ (Vercel) │     │        │
└─────────────┘     │ daily 00:30  │     │ *.json     │     └──────────┘     └────────┘
                    └──────────────┘     └────────────┘
                          │                    ▲
                          │  git commit/push   │
                          └────────────────────┘
```

- 数据抓取：GitHub Actions 每天 UTC 00:30 跑 `scripts/fetch-snapshot.ts`
- 数据归档：脚本生成 `data/snapshots/YYYY-MM-DD.json` 并 commit 到仓库
- 自动部署：仓库变化触发 Vercel 重新构建（构建时读最新 snapshot）
- 前端渲染：服务端组件读 JSON → 传给客户端 D3 组件渲染 Treemap

## 3. 关键设计决策

### 为什么用静态 JSON 而不是数据库？
- 用户零运维：不用申请数据库、不用管连接
- 数据天然版本化：每次抓取都是 commit，可追溯
- 读性能极佳：构建时打进静态资源

### 为什么用 GitHub Actions 而不是 Vercel Cron？
- Vercel 免费版 cron 不保证时间精度
- Actions 跑出来的数据顺便 commit，归档零成本
- 失败有内置邮件通知

### 为什么用 `sqrt(market_cap)` 不用原始市值？
- BTC 占总市值 ~50%，原始映射会让 BTC 占半屏
- `sqrt` 压头部权重，让小板块也能看清

## 4. 目录结构
见项目根目录 `PLAN.md` 第三节。

## 5. 关键依赖（待装）
- `d3-hierarchy`（Treemap 算法）
- `d3-scale`（颜色映射）
- `d3-array`（统计函数）