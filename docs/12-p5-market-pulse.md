# P5.0 + P5.1：语义校正与板块脉搏实施计划

> 制定日期：2026-08-02
> 基线提交：`d3bcddc`
> 范围：只实施 P5.0 与 P5.1；真实持仓、Telegram 条件提醒、移动端专用列表和回测继续拆分到后续阶段。

## 1. 本阶段目标

本阶段要把网站从“展示四个周期涨跌”推进到“能解释板块为什么强、强得是否广、排名是否正在变化”。同时先修正三个会误导使用者的旧语义：

1. `holdings` 只是关注标记，统一改名为 `focusAssets` / “关注资产”。
2. 旧信号只比较四个周期的正负号，不再称为板块轮动信号。
3. 旧相关性按数组下标对齐、样本不足时返回 0，必须改为时间戳对齐并显式显示样本数。

## 2. 交付范围

### P5.0：正确性与语义

- BFF、板块配置、客户端和 Treemap 将 `holdings` 改为 `focusAssets`。
- 关注资产继续使用金色星标，但所有可见文案改为“关注”，不表示真实仓位。
- 相关性使用非重叠 UTC 日收益、按日期 inner join、至少 30 个共同样本。
- 相关性不足、零方差或无有效权重时返回 `null` / `N/A`，不能伪造成 0。
- 相关性矩阵返回每一对板块的共同样本数，并使用“历史共同波动，不代表因果”的说明。
- 币种详情中的换手率改称“成交活跃度”，明确它不能证明资金流入、吸筹或出货。
- 信号输出必须包含规则版本、原因、`asOf`、样本数和质量状态。

### P5.1：板块脉搏

- 板块上涨广度：有效成分中收益大于 0 的占比。
- 板块中位数收益：降低单一大市值资产对观感的影响。
- Top 贡献者：按“当前市值权重 × 24h 收益”的绝对贡献排序。
- 贡献集中度：前三名绝对贡献占全部绝对贡献的比例。
- 当前排名、最近完整 UTC 日排名、排名变化。
- 异动 z-score：当前 24h 板块收益相对历史完整日收益的标准分。
- 页面增加“市场脉搏”区域，展示全市场广度、领涨板块、最大排名变化和活跃信号。
- 首页增加币种/板块搜索；匹配结果在 Treemap 和板块柱状图中高亮，单一币种可直接打开详情。

## 3. 统一计算口径

### 3.1 当前广度与贡献

```text
breadth = count(valid coin return > 0) / count(valid coin return)
median_return = median(valid coin returns)
coin_coverage = count(valid coin returns) / count(sector coins)
coin_contribution = coin_return × coin_market_cap / covered_market_cap
top3_concentration = sum(abs(top3 contributions)) / sum(abs(all contributions))
```

- 广度统计板块全部有效成分，不只统计主流币。
- 贡献计算与主看板一致，只使用当前 `isMainstream=true` 且市值有效的资产。
- 当前 24h 覆盖不足 80% 时，不产生信号。

### 3.2 历史板块日收益

- 输入使用 `/api/v1/history` 返回的 UTC 日级收盘价。
- 每个资产只计算相邻 UTC 日的非重叠收益；日期断档时不跨缺口计算。
- 每个历史日期使用当前主看板的主流币集合和当前市值作为固定权重。
- 当日有效市值覆盖低于 80% 时，该板块当日收益无效。
- 该口径只用于当前的轮动描述、异动和相关性，不可用于回测；真正回测必须使用 point-in-time 市值与板块成员。

### 3.3 排名与信号

- 当前排名：当前滚动 24h 市值加权收益降序。
- 参照排名：最新一个有足够板块覆盖的完整 UTC 日收益排名。
- `rankChange = previousRank - currentRank`，正数表示上升。
- 排名上升或下降至少 3 位时产生轮动信号。
- 当前收益相对至少 20 个历史日收益达到 `|z| >= 2` 时产生异动信号。
- 若数据过期、板块覆盖不足或所需样本不足，返回 `insufficient_data`，不产生交易式结论。
- 规则版本固定为 `market-pulse-v1`。

### 3.4 相关性

- 使用上述板块日收益序列。
- 两板块按 UTC 日期取 inner join。
- 共同样本至少 30 个。
- Pearson 分母为 0 时返回 `null`。
- UI 同时展示相关系数和共同样本数。

## 4. 代码组织

```text
lib/
  sector-history.ts        # UTC 日收益、覆盖、时间戳对齐
  market-pulse.ts          # 广度、中位数、贡献、排名、z-score
  signals.ts               # 基于 pulse 的版本化可解释信号
  correlation.ts           # 基于 timestamp join 的 Pearson
components/
  MarketPulseBar.tsx       # 摘要、信号和首页搜索
  SectorTreemap.tsx        # 搜索高亮、关注资产语义
  TrendBarChart.tsx        # 搜索高亮、窄屏非负尺寸
  CorrelationHeatmap.tsx   # N/A、样本数和非因果说明
```

## 5. 验收标准

### 自动化

- 板块广度、中位数、贡献和集中度有确定性 fixture 测试。
- 缺日期不能跨日计算收益。
- 排名变化方向和并列排序稳定。
- z-score 在样本不足和零方差时返回 `null`。
- 信号在 stale、低覆盖和样本不足时不触发。
- 相关性按日期对齐、少于 30 个共同样本返回 `null`，样本数正确。
- BFF 只返回 `focusAssets`，不再返回 `holdings`。
- `npm run check` 全部通过。

### 浏览器

- 桌面和 390×844 手机尺寸控制台无 error/warning。
- 市场脉搏能显示广度、领涨板块、排名变化、贡献者和信号原因。
- 搜索 BTC、Bitcoin、AI 或中文板块名均能产生高亮。
- 清空搜索后恢复全部透明度。
- 单一币种搜索按 Enter 可打开币种详情。
- 相关性面板能显示 `N/A` 或真实系数及 `n`，不会把缺失显示成 0。

### 发布

- 更新 README、PROJECT_STATUS 和完整修复计划中的 P5 进度。
- 只提交本阶段相关文件，不纳入现有未跟踪的 `.agents/` 和 `skills-lock.json`。
- 推送 GitHub `main`。
- 部署 Vercel Production。
- 线上复验主页、`/api/v1/board`、`/api/v1/history`、`/api/v1/data-health` 和核心交互。

## 6. 非目标

- 不实现真实持仓或云端用户账户。
- 不连接交易所账户、钱包或交易执行。
- 不启用 Telegram 推送。
- 不实现回测。
- 不新增付费数据源。
- 不把成交活跃度描述为真实资金流。

## 7. 执行记录

- [x] P5.0 关注资产语义完成。
- [x] P5.0 相关性和成交活跃度语义完成。
- [x] P5.1 板块历史、脉搏和信号领域层完成。
- [x] P5.1 市场脉搏与搜索高亮 UI 完成。
- [x] 单元测试和完整质量门完成：16 个测试文件、99 个测试通过。
- [x] 桌面与 390×844 移动浏览器回归完成：0 error/0 warning，移动端无横向溢出。
- [x] GitHub 推送完成：功能提交 `b7f8f2d` 已进入 `main`，Quality workflow `30710517995` 成功。
- [x] Vercel Production 部署与线上验收完成：Deploy Production workflow `30710554119` 成功，deployment `cU6aN4eMXSs9GUvxoGwt4NiWEoP3` 为 Ready，正式入口为 `https://crypto-sector-board.vercel.app`。
- [x] 线上数据验收完成：board database coverage 100%，history/candles 正常，data-health 为 `healthy`，24h/7d 缺口均为 0，三个 provider 均成功。
- [x] 线上交互验收完成：历史排名与 `market-pulse-v1` 正常加载，BTC 搜索得到 3 个匹配并可打开详情，相关性矩阵使用 30 个共同日收益样本；390×844 下页面宽度 390/390，控制台 0 error/0 warning。
