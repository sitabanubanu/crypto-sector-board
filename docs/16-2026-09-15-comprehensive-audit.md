# 加密板块情绪看板：2026-09-15 全面审查与整改方案

审查日期：2026-09-15（Asia/Shanghai）
仓库：`sitabanubanu/crypto-sector-board`
审查基线：`codex/p0-security-stabilization`，HEAD `7c305a6fa5a2860197f500853791df91bc14c558`；该提交与 GitHub `main` 一致。

本轮是诊断和方案审查。没有修改业务源码、依赖清单、锁文件、数据库、GitHub、Vercel，也没有触发线上采集或部署。`output/audit-2026-09-15/` 中的截图和本报告是本轮产生的审查产物；`.agents/`、`.playwright-cli/`、`output/`、`skills-lock.json` 是工作区原有的未跟踪内容，不属于源码修复。

## 先给结论

GitHub 最近持续红灯的直接原因已经确定：**静态注册表的核验时间被写进了数据库，健康规则把它当作实时行情故障；在线核验脚本又没有把最新核验结果持久化。** `data/assets.json` 的 `lastVerifiedAt` 是 `2026-08-11`，`lib/ingestion/data-health.ts` 用 30 天阈值判断映射过期，所以从 9 月 10 日开始，67 个 CoinGecko 映射全部被判定为 stale。补采行情只能更新 K 线和报价，不能更新映射核验日期，于是每天都会重复失败。

这不是 GitHub Actions v7 下载失败，也不是最近一次构建失败。9 月 14 日的 Data Health 运行中，checkout、setup-node、`npm ci`、数据库迁移和补采都成功；补采后 K 线覆盖为 `2976/2976`、`20832/20832`，191 个报价全部 fresh，失败资产、卡死任务、未解决 provider 错误均为 0，但 `statusAfter=degraded`，脚本仍因 `healthy=false` 退出 1。9 月 13 日补采全部为 `skipped_duplicate`，仍然是同一个结论。

### GitHub 证据

| 时间（UTC） | Run | 结果 | 结论 |
| --- | --- | --- | --- |
| 2026-09-14 10:45 | [34834756256](https://github.com/sitabanubanu/crypto-sector-board/actions/runs/34834756256) | Data Health failure | 行情补采后仍因 stale mapping 为 degraded |
| 2026-09-13 10:21 | [34751631330](https://github.com/sitabanubanu/crypto-sector-board/actions/runs/34751631330) | Data Health failure | 重复补采无法修复映射时间 |
| 2026-09-12 09:25 | [34685805999](https://github.com/sitabanubanu/crypto-sector-board/actions/runs/34685805999) | Data Health failure | 同一原因 |
| 2026-09-11 09:48 | [34586039386](https://github.com/sitabanubanu/crypto-sector-board/actions/runs/34586039386) | Data Health failure | 同一原因 |
| 2026-09-10 09:49 | [34462725506](https://github.com/sitabanubanu/crypto-sector-board/actions/runs/34462725506) | Data Health failure | 30 天阈值后的首次连续报警 |

生产只读接口在 2026-09-15T07:54:15.927Z 也呈现同一状态：24h/7d 覆盖 100%，191 个报价新鲜，failed/stuck 为 0；CoinGecko `activeMappings=67/staleMappings=67`，Gate `65/65`，OKX `59/59`。接口：[生产 data-health](https://crypto-sector-board.vercel.app/api/v1/data-health)。

当前日志摘要还没有打印 `staleMappings`，只打印了 `staleAssetCount` 和 provider 汇总，因此真正的失败原因在 GitHub 页面上不够明显。这是第二个独立的可观测性缺陷。

## 根因链和责任边界

1. `data/assets.json:5` 保存了静态文件生成时的 `lastVerifiedAt=2026-08-11`。
2. `lib/market-data/registry.ts:335-376` 把这个时间写入 provider instrument rows。
3. `lib/db/seed.ts:91` upsert 时写入 `excluded.last_verified_at`。
4. `lib/ingestion/data-health.ts:165` 用 `now - 30 days` 计算过期边界，`417-420` 统计 stale mappings，`446-461` 直接让整体健康状态变成 degraded。
5. `lib/ingestion/recovery.ts` 对任何非 healthy 状态都执行一次全量行情补采；没有按失败原因选择动作。
6. `scripts/verify-provider-mappings.ts` 只实时拉取 Gate、OKX、CoinGecko inventory 并输出 JSON，没有保存“谁在什么时间、用什么 inventory、得到什么结果”。它也不在定时 workflow 中。
7. `scripts/repair-market-data.ts:44-70` 没打印 staleMappings，且所有非 healthy 结果都以退出码 1 结束。

因此这里混在一起的是三种不同事实：实时行情是否可用、provider 映射是否需要重新核验、核验任务是否真的执行过。应拆成独立的状态和责任，而不是延长 30 天、把日期直接改成今天，或让所有 degraded 都继续重采。

## P0：先让 GitHub 恢复为“有意义的绿灯”

### P0-A：拆开实时数据健康和注册表维护健康

建议新增持久化的 `provider_mapping_checks`（或等价表），至少保存：provider、checkedAt、inventory hash、active/missing/changed 数量、错误码、脚本版本和原始摘要。`registry:verify` 成功后在同一事务中写入检查结果；失败只写失败事件，不覆盖上一次成功记录。静态 registry 的 `lastVerifiedAt` 保留为资产资料，不再伪装成最近一次在线核验。

`data-health.ts` 改成两层结果：

- `marketStatus`：K 线覆盖、报价 freshness、失败资产、provider runs、stuck runs；这些才触发行情恢复。
- `mappingStatus`：`fresh`、`overdue`、`missing`、`changed`、`check_failed`；这些由 mapping audit 负责。

接口和日志同时输出 `reasonCodes`，至少包括 `CANDLE_GAP`、`QUOTE_STALE`、`PROVIDER_RUN_FAILED`、`MAPPING_CHECK_OVERDUE`、`MAPPING_MISSING`、`MAPPING_CHANGED`、`DB_UNAVAILABLE`。`healthy` 不应再由所有维护提醒简单 OR 在一起；建议用 `blockingIssues` 决定 Data Health 的退出码。行情全新鲜、映射核验只是 overdue 时，Data Health 不再调用全量行情补采，也不因同一原因每天重复失败；映射审计 workflow 单独以 overdue/changed 作为自己的失败条件。映射存在缺失或 inventory 发生未经批准的变更时，仍然必须红灯。

这保留了安全性：不会把“没核验过”伪装成“核验通过”，只是把它送到正确的维护队列。

### P0-B：按原因路由恢复动作

`runMarketDataRecovery` 应先读取 `blockingIssues`：只有 `CANDLE_GAP`、`QUOTE_STALE`、`PROVIDER_RUN_FAILED` 等行情原因才调用 `runMarketIngestion`；`MAPPING_CHECK_OVERDUE` 只触发 mapping audit；`MAPPING_MISSING/CHANGED` 直接停止并给出资产、provider、instrumentId 和修复建议。修复后要重新计算同一份 reason codes，而不是只看一个 `status` 字符串。

`repair-market-data.ts` 的 JSON 必须包含完整的 `mapping` 摘要、`reasonCodes`、`blockingIssues`、每次 run 的 `skipped_duplicate` 计数和退出原因。这样下一次 GitHub 失败可以直接判断是数据、映射、数据库还是调度，不需要从几十行摘要中猜测。

### P0-C：让在线核验真正被调度和验收

新增 `mapping-audit.yml`，建议每天错峰运行并支持 `workflow_dispatch`；步骤为 `npm ci`、`npm run registry:verify -- --persist`、上传 JSON artifact、在发现 missing/changed 时失败。`quality.yml` 同时加入 `npm run registry:check` 和 `npm run db:check`，与本地 `npm run check` 保持一致。

首个修复版本的验收必须是：

1. 手动执行一次 mapping audit，数据库存在一条带 checkedAt 和 inventory hash 的成功记录。
2. 连续执行两次 `data:repair`：第二次在行情 fresh 时 action 为 `none`，不再全量重采。
3. 伪造一个过期检查记录，验证只产生 `MAPPING_CHECK_OVERDUE`，不会调用行情采集。
4. 伪造缺失 instrument，验证 `MAPPING_MISSING` 使 mapping audit 失败，并输出具体资产/provider。
5. GitHub 上 Data Health、Mapping Audit、Quality 三个 workflow 各自对自己的职责负责，至少连续三个调度周期结果稳定。

不要用“把 2026-08-11 改成今天”作为修复；那会压掉告警而没有新的外部证据。

## P0：安全依赖门必须单独处理

本地 `npm ci --ignore-scripts`、lint、typecheck、19 个测试文件共 118 个测试、`npm run build`、`registry:check`、`db:check` 均通过。但完整 `npm run check` 在 `audit:prod` 处失败，`audit:all-policy` 单独也失败。当前审计统计为 9 个漏洞：6 moderate、2 high、1 critical；生产路径命中 Next.js 和 sharp。

建议做小批量、可回滚的定向升级并单独开 PR：

- `next`、`@next/env`、`eslint-config-next` 升到同一条 16.3.x 修复线（当前 npm 建议 16.3.5）；当前 16.2.12 命中 [Next.js Windows hosted RCE advisory](https://github.com/advisories/GHSA-p293-qw3h-jr36)，受影响范围 `<16.3.3`，修复版为 16.3.3。若生产始终是 Linux，Windows advisory 的利用条件可能不成立，但依赖仍处于受影响范围，不能据此忽略。
- `overrides.sharp` 从 0.35.0 升到至少 0.35.4；[sharp/libheif advisory](https://github.com/advisories/GHSA-rgj7-g3m4-5g8c) 明确列出 `<0.35.4` 为受影响范围。
- `js-yaml` 到 4.3.2（由 ESLint 链引入）和 `vitest` 到 4.1.11；不因审计建议而把 drizzle-kit 降到 0.18.x，也不在这次 PR 顺手升级 TypeScript/React 大版本。

每组升级都要重新生成 lockfile，并按 `npm ci`、lint、typecheck、test、registry/db check、audit、build 顺序验收。不要声称“已被攻击”；目前证据是版本命中公开 advisory，利用条件和实际入侵都没有被验证。

## P1：运行和发布可靠性

### 调度和 SLO

采集 workflow 在每小时 `:17/:47`，历史上出现过约 5 小时 14 分的实际运行空档；Data Health 计划为 `05:23 UTC`，9 月 14 日约 5 小时 22 分后才运行。GitHub 官方说明 scheduled workflow 在每小时开始附近可能延迟，负载足够高时排队任务可能丢弃，且只在默认分支上的 workflow 文件运行（[GitHub schedule 文档](https://docs.github.com/en/actions/reference/workflows-and-actions/events-that-trigger-workflows#schedule)）。目前分钟偏移是合理缓解，但不能当作 SLO。

建议把“上一次成功采集距现在多久”做成指标和告警：正常目标 `<75 min`，`>90 min` 告警，`>2 个周期` 阻断健康。保存 workflow dispatch time、job start、数据库写入时间和最新 candle/quote 时间，区分 GitHub 排队慢、数据库锁、provider 慢和写入失败。Vercel Cron 与 GitHub ingestion 目前是两条调度入口，应明确一个主写入者；保留另一条作为受控补偿时要用同一个幂等锁和 run id，避免两边互相制造 `skipped_duplicate`。

### 发布门和环境

`deploy-production.yml` 现在由手动 workflow 直接执行 `npx vercel@58.4.4 deploy --prod`，没有程序化验证当前 SHA、Quality 结果或分支。建议改成“Quality 成功的 immutable artifact → production deploy”，并校验 commit SHA；生产环境用 protected environment，Preview 与 Production 的数据库连接保持清晰边界。现有 Neon Free 资源可以继续使用，不要求立即付费迁移；只有连接池、并发或配额达到实测阈值时，再评估隔离或升级。

### API 和错误恢复

- `app/page.tsx` 初始 DB 失败只显示“市场数据暂时不可用，请稍后刷新”，没有重试按钮、错误编号和 error boundary；增加用户可执行的重试，并保留安全的 request id。
- `components/board/use-board-data.ts` 把 history 的 error/loading 丢掉了，界面容易把 503 误说成“历史不足”；向消费者暴露 `historyStatus`、`historyError`，分别呈现“暂无数据”和“服务暂时失败”。
- Board/history/candles 的 503、400、JSON contract parse error 要在前端区分；数据库断开不能静默降级为过期 JSON。开发环境没有 `DATABASE_URL` 时本地 503 是预期边界，不能拿 JSON 模式通过来证明生产 DB 链路正常。
- 数据库迁移、采集 retry 要带 attempt、backoff、最终 error code；所有 retry 结束后上传 artifact，避免只有一行退出码。

## P1：数据语义和交互逻辑

1. **周期口径**：实测切到 30d 后 Treemap 变为 30d，但 Market Pulse 仍显示 24h 和旧排名，标题没有清楚标注周期。让 pulse、排名、treemap、详情共同接收 `period`，或明确把 pulse 固定为 24h 并在标题写出“市场脉搏（24h）”。
2. **相等判断**：BTC 详情的资产值和 BTC 单资产板块值相同时，`components/CoinDetailModal.tsx:64-66` 仍显示“落后板块”。增加浮点容差和“持平”；`sr=0` 时也要有明确定义。
3. **模态焦点**：`useDismissibleLayer.ts` 只做 Escape、初始焦点和关闭后恢复，没有 focus trap/inert。实测在 BTC 弹窗关闭按钮上按 Shift+Tab，焦点可以离开 `aria-modal=true` 的 dialog。补焦点循环、背景 inert、屏幕阅读器可见标题和关闭原因，并测试 Tab、Shift+Tab、Escape、点击 backdrop。
4. **状态栏**：`HomeClient.tsx` 默认 compact；Header 的切换路径为 full → compact → hidden → compact，用户无法回到 full。加载 localStorage 的 effect 还可能在另一个写入 effect 前后互相覆盖。改为 loaded guard，一直显示“数据截至、freshness、coverage、backend、刷新状态”的精简摘要，诊断详情单独收起；移动端也显示时间和状态。
5. **历史查询口径**：`queryDailyHistoryCandles` 按 UTC 日取最后一个可用小时，不等价于每天 23:00 或完整 24 小时。要么在产品文案明确“日内最后可用点”，要么改为明确的日界线/完整度规则，并把 coverage 写进 response meta。基准 open/close 的时间偏移也要用固定 fixture 回归。
6. **候选数据来源**：`selectQuote` 允许无 active mapping 的历史 quote 作为低优先级候选。需要加 fixture 验证“active mapping 存在时永不选失效映射；仅在明确 fallback policy 下才选历史值”，不要让过期 fallback 无声进入 aggregate。

## P2：审美、可读性和无障碍

现有桌面首屏重心放在 Treemap，浅色背景、红涨绿跌和 N/A 语义符合已有产品约定；搜索 Enter 打开详情、Escape 关闭等基本路径可用。问题是信息密度和视觉编码在极值与小屏场景下失真。

### 已确认的视觉问题

- `lib/colors.ts` 用固定 ±1/4/8% 阈值覆盖所有周期。30d 截图中大面积同色，差异消失；应按周期采用连续/分位色阶，同时保留红涨绿跌，不改变用户已经形成的语义。
- 当前 `textColorOnBlock` 在绝对值达到 1% 就使用白字。计算结果：白字对 `#fc8181` 为 2.44:1、对 `#68d391` 为 1.86:1、对 `#e53e3e` 为 4.13:1；均不能作为普通小号正文的稳定 AA 方案。W3C 的普通文本门槛是 4.5:1（[WCAG 1.4.3](https://www.w3.org/WAI/WCAG22/Understanding/contrast-minimum.html)）。浅背景应切换深字，深背景才使用白字，并同时加入明暗、边框或纹理等非颜色编码。
- 移动端 67 个资产继续挤在 Treemap 中，点击目标很小、板块名被截断，底部浮动“相关性”“看板+数据”会遮住内容。默认给移动端排序列表或分组卡片，Treemap 作为可切换的总览；保留搜索、排序和明确的触控最小目标。
- 大量 9/10/11px 文本、固定 380px 研究详情和技术字段 `high/mature/direct` 让信息层级偏“内部调试面板”。将 provider、quality、DB/JSON 等移到诊断抽屉，主界面先回答“现在发生了什么、覆盖到什么时候、为什么值得关注”。
- 预设按钮和部分紧凑控件高度约 22.5px，手机版更小；切换按钮缺少 `aria-pressed`，首页缺少稳定的 h1 语义。补充键盘可见焦点、按钮状态、Tooltip 的可访问名称和最小触控高度。
- 隐藏的趋势图仍可能存在于可访问 DOM（通过 CSS 收缩/overflow 隐藏），应在非活动视图使用条件渲染或 `aria-hidden`，避免辅助技术读到不可见内容。

### 证据截图

- [01-desktop.png](../output/audit-2026-09-15/01-desktop.png)：生产桌面 24h 首屏，结构和主视觉可用。
- [02-period-30d.png](../output/audit-2026-09-15/02-period-30d.png)：30d 颜色饱和且周期口径不一致。
- [03-btc-detail.png](../output/audit-2026-09-15/03-btc-detail.png)：BTC 详情；可复现“持平却显示落后”和焦点越界问题。
- [05-local-desktop.png](../output/audit-2026-09-15/05-local-desktop.png)：本地 JSON 模式，只能证明 UI 能渲染，不能证明生产数据库链路。
- `04-mobile.png` 是水合尚未完成时的中间截图（标题竖排、看板空白），不作为永久缺陷证据；稳定移动端检查已确认 document scrollWidth 与 viewport 相等、没有全页横向溢出，但仍有小目标、信息密度和浮层遮挡问题。

## P3：结构治理和后续范围

目前 BFF/server-only DAL、Zod contract、PGlite 集成测试、幂等/重试/单币隔离基础已经存在，不建议推倒重写。优先整理边界：schema 是数据库真相、registry 是静态 canonical mapping、provider inventory 是在线证据、BFF contract 是客户端边界。

`HomeClient.tsx` 约 480 行，研究、脉搏、状态、视图和本地存储耦合在一个壳中；按“数据 hook / 状态栏 / 视图切换 / 详情层 / 研究面板”拆分，并先建立 design tokens（颜色、间距、字体、边框、焦点环），再做视觉改造。旧 JSON、provider proxy、旧 backtest/portfolio 组件先做引用和流量盘点，分阶段下线，不能盲删。README 和 `PROJECT_STATUS.md` 中的 56/67、17/103/19/118 等历史阶段数字要集中到一个生成或审核入口，避免文档继续误导维护者。

真实持仓、回测、Telegram 推送等扩张先暂停，等健康、调度、契约和可观测性稳定后再做。

## 建议实施顺序

### 第 1 个 PR：恢复诊断可信度

加入 mapping check 持久化模型、`--persist` 核验、reason codes、按原因路由 recovery、完整 repair JSON；补齐单元测试和 `mapping-audit.yml`。不改变行情算法，不更新大版本依赖。验收重点是连续两次 repair 不再因 stale mapping 重采。

### 第 2 个 PR：安全和 CI 门

定向升级 Next/sharp/js-yaml/vitest；Quality 对齐本地 check；生成 lockfile；在干净 runner 上完成 npm ci、lint、typecheck、test、registry/db check、audit、build。只有所有门通过才进入部署。

### 第 3 个 PR：运行和发布

统一调度责任，增加最新成功采集 SLO、延迟和 queue/run/write timestamps；生产部署绑定已验证 SHA 和 artifact；保留 Preview/Production 环境界限。

### 第 4 个 PR：数据语义和交互

统一 period、修正持平文本、focus trap、状态栏持久化、历史 error 暴露、API retry/error boundary、daily history 口径和 quote fallback fixture。

### 第 5 个 PR：视觉和移动端

改 token 和对比度、周期色阶、移动列表/总览切换、控件尺寸、研究信息层级和 aria 状态；用稳定的桌面、390px 移动端、键盘和屏幕阅读器流程验收。

## 最小验收清单

```text
npm ci
npm run lint
npm run typecheck
npm run registry:check
npm run db:check
npm test
npm run audit:prod
npm run audit:all-policy
npm run build
npm run registry:verify -- --persist
npm run data:health
npm run data:repair
```

数据 fixture 必须覆盖：fresh mapping、overdue mapping、missing/changed mapping、candle gap、stale quote、provider failure、skipped_duplicate、数据库 503、无效 query、历史服务 503。UI 验收必须覆盖：24h/3d/7d/30d 口径、持平文本、focus trap、Escape 恢复焦点、状态栏刷新后保持、390px 无全页溢出、颜色对比度和不可见图表不进入辅助技术树。

## 当前状态和限制

本轮已完成 GitHub 历史运行、生产 data-health 只读检查、本地静态检查/构建/测试、依赖审计、源码结构、API 错误路径和桌面/移动端界面审查。当前工作区没有业务源码或 lockfile 改动，也没有把生产密钥复制到本地。由于浏览器审查会话在恢复时失去认证，未重新保存稳定移动端截图；报告已明确排除水合中间态截图。没有读取云端 Vercel Cron 日志，也没有授权触发生产 cron，因此不能声称 Vercel 入口是否同样会 503；该项应在 P1 运行 PR 中用授权的观测和 run id 补齐。

本报告解决的是“为什么持续报错”和“怎样按职责修复、怎样验收”。截至报告生成时，GitHub 的 Data Health 历史红灯仍然存在；源码尚未修复、依赖尚未升级、线上尚未重新部署。

## 实施跟进（2026-09-15）

根据本报告已在当前工作区落地第一阶段修复：新增 `provider_mapping_checks` 表和 `drizzle/0003_chemical_puppet_master.sql`；`registry:verify --persist` 会保存每个 provider 的核验时间、inventory hash、错误和警告；Data Health 现在输出 `mapping`、`reasonCodes`、`blockingIssues`，映射过期不会再触发行情补采；`repair-market-data` 会打印完整原因；Quality 已加入 registry/db 检查，并新增独立的 Provider Mapping Audit workflow。

同时完成定向依赖升级：Next/@next/env/eslint-config-next 16.3.5、sharp 0.35.4、Vitest 4.1.11、js-yaml 4.3.2 override。当前 `npm audit --omit=dev` 为 0 个漏洞，`audit:all-policy` 通过；drizzle-kit 的开发链 moderate advisory 仍不通过自动强制降级处理。

实施后的验证为：`npm run check` 全部通过，20 个测试文件共 121 个测试通过，Next 16.3.5 production build 通过；真实 `npm run registry:verify` 成功检查 201 个 mappings、24892 个 provider inventory items、0 errors/0 warnings。尚未执行生产数据库 `db:migrate`、线上 `registry:verify --persist` 或部署，因此 GitHub 线上红灯需要在合并并部署这些改动后，通过一次 mapping audit 和至少两个 Data Health 周期确认恢复。
