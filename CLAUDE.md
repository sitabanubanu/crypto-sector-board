# Claude 协作指南 — 加密板块强弱看板

## 项目一句话
每天 UTC 0 点抓取自定义板块的主流币行情，用 Treemap 一眼看出板块强弱，辅助短线决策。

---

## 工作流程（每次会话开头先做）

1. **读最新进度**：`dev-logs/` 下日期最新的那份日志，了解上次做到哪、有什么未决问题
2. **读当前阶段**：`docs/05-roadmap.md`，确认现在是阶段几、下一步该做什么
3. **读相关文档**：涉及具体修改时，对照下方文档清单读对应文件再动手
4. **遵守"小步推进"**：每完成一个原子任务（一两个文件改动），停下来让用户验证再继续

---

## 文档索引

| 想知道 | 看这里 |
|---|---|
| 项目要解决什么、做哪些功能 | `docs/01-requirements.md` |
| 技术栈和数据流 | `docs/02-architecture.md` |
| sectors.json / snapshot.json 结构、指标公式 | `docs/03-data-spec.md` |
| 颜色、字号、间距规范 | `docs/04-design-system.md` |
| 当前阶段与下一步 | `docs/05-roadmap.md` |
| 本地命令、排错、紧急停服 | `docs/06-runbook.md` |
| 全局规划 / 板块清单 | `PLAN.md` |
| 每日进度 | `dev-logs/YYYY-MM-DD.md` |

---

## 重要约定

### 与用户沟通
- 用户**零编程基础**：解释技术决策用类比，不堆术语
- 主动询问而不假设：方案有多种选择时用问题确认，不直接拍板
- 中文回复

### 代码与数据
- **数据正确性优先**：任何指标公式改动，需先更新 `docs/03-data-spec.md`，再改 `lib/metrics.ts`，最后跑一次本地快照核对
- **UTC 切日不可改动**：和主流行情站对齐（已与用户在 2026-05-15 确认）
- **sectors.json 不擅自增删**：用户维护，AI 只能在用户明确要求时修改
- **目录结构稳定**：新增文件优先放进已有目录，不随意建新顶级目录

### Git 与日志
- 提交信息**用中文简短描述**（pre-commit hook 会写入 dev-logs）
- 一个提交一件事，方便日志可读
- 阶段切换时手动在 `dev-logs/` 当日文件 "明日待办" 留 1-2 行

### Next.js 16 / Tailwind v4 注意
- 这套版本与旧版差异较大：
  - 没有 `pages/`，只用 `app/`
  - 没有 `tailwind.config.ts`，主题配置写在 CSS 里
  - PostCSS 插件名是 `@tailwindcss/postcss`
- 改 Next 配置前先查 `node_modules/next/dist/docs/` 而不是凭记忆写
- 这条来自 Next 16 自带的 `AGENTS.md` 提示，请遵守

---

## 板块清单（已与用户对齐，2026-05-15）

详见 `PLAN.md` 第一节。要点：
- BTC 单独成块
- 共 14 个板块（含 BTC），约 60 个币
- CoinGecko ID 列表存在 `data/sectors.json`，板块归属用户维护

---

## 项目状态

当前阶段：见 `docs/05-roadmap.md` 中"当前阶段"标注。