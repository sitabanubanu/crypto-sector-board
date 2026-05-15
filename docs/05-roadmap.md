# 05 - 开发路线图

> 每完成一阶段在此打勾。当前阶段：**阶段 2**

## 阶段 0 — 项目骨架与文档
**目标**：仓库可见、文档可读，但没有任何业务代码。

- [x] 0-A 计划文件保存到项目目录（PLAN.md）
- [x] 0-B 初始化 Next.js 项目（TS + Tailwind）
- [x] 0-C 创建 docs/ 6 份标准文档骨架
- [x] 0-D 创建 dev-logs/ 模板和首份日志
- [x] 0-E 创建 CLAUDE.md（覆盖默认）和 README.md
- [x] 0-F git 初始化 + 推送到 GitHub

**验收**：✅ 用户能在 GitHub 上看到仓库；本地 `npm run dev` 看到 Next.js 默认欢迎页。

---

## 阶段 1 — 板块清单 + 数据抓取脚本
**目标**：能在本地手动跑出一份正确的快照 JSON。

- [x] 1-A 把第一节的板块清单转成 `data/sectors.json`（CoinGecko ID 映射，含已知陷阱）
- [x] 1-B 写 `lib/types.ts`：核心类型定义
- [x] 1-C 写 `lib/coingecko.ts`：API 封装 + 限频 + 重试（已切换到批量接口）
- [x] 1-D 写 `lib/metrics.ts`：基于滚动 24h 的指标计算
- [x] 1-E 写 `scripts/fetch-snapshot.ts`：串起整流程
- [x] 1-F 本地跑 `npm run fetch-snapshot`，56/56 币全部抓到

**验收**：✅ JSON 文件生成成功，BTC: open=79545 close=80714 +1.46% amp=3.41%，与 CoinGecko 网页一致。

**重要权衡**：使用批量接口 `/coins/markets` 拿"滚动 24h"数据，而非按 UTC 0 点切日。原因：免费层限频严，精确日 K 线方案要 10 分钟且经常失败。详见 `docs/03-data-spec.md` 第 1 节。

---

## 阶段 2 — Treemap 渲染
- [ ] 2-A 装 d3-hierarchy / d3-scale
- [ ] 2-B 写 `components/SectorTreemap.tsx`
- [ ] 2-C 写 `components/Header.tsx` + `Tooltip.tsx`
- [ ] 2-D `app/page.tsx` 读最新快照传入组件
- [ ] 2-E 应用视觉规范

**验收**：本地 `npm run dev`，BTC 不超过 25% 面积，颜色与涨跌一致。

---

## 阶段 3 — 部署到 Vercel
- [ ] 3-A 推代码到 GitHub
- [ ] 3-B Vercel 用 GitHub 登录 → Import 项目 → 部署
- [ ] 3-C 拿到 vercel.app 网址

**验收**：手机也能打开看到 Treemap。

---

## 阶段 4 — 每日自动抓取
- [ ] 4-A 写 `.github/workflows/daily-snapshot.yml`
- [ ] 4-B GitHub 上手动触发一次验证
- [ ] 4-C 确认成功提交 snapshot 文件 + Vercel 自动重新部署

**验收**：网页显示日期是今天 UTC 0 点切的"昨日"。

---

## 阶段 5 — 开发日志自动化
- [ ] 5-A 装 husky
- [ ] 5-B 写 `scripts/append-dev-log.ts`
- [ ] 5-C 写 `.husky/pre-commit`
- [ ] 5-D 加 `.github/workflows/daily-devlog.yml` 兜底

**验收**：今天的 dev-log 能看到本阶段提交。

---

## 阶段 6 — 稳定性观察期（2-3 天）
- [ ] 不做新功能
- [ ] 每天检查网页日期、Actions 状态
- [ ] 小问题记到 dev-logs

**验收**：连续 2-3 天数据正确刷新。

---

## 阶段 7+ — 后续迭代（不在本期）
- [ ] 历史对比页（3天/周/月）
- [ ] 排序表格视图
- [ ] K 线下钻
- [ ] 网页内编辑板块清单