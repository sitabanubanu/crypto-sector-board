# 67 个资产的质量研究与证据边界

> 复核日期：2026-08-11  
> 覆盖范围：`data/assets.json` 中当前注册的 67 个资产  
> 研究用途：帮助观察“它解决什么问题、需求是否真实、规模如何、项目方经济状态如何”，不是投资建议，也不构成买卖评级。

## 1. 先说结论

项目现在已经为 67 个资产建立统一的静态研究档案，并在币种详情弹窗中展示。档案不是把每个币种简单标成“好/坏”，而是把质量拆成可以复核的证据维度：

- **解决的问题**：项目/网络试图解决的具体痛点，以及服务的需求类型。
- **市场规模**：区分实时可观察资产规模与更大的可寻址需求市场。
- **项目方经济状态**：区分没有单一项目方、未披露/证据不足，以及有费用/收入代理但尚未证明净利润。
- **质量信号**：需求证据、产品成熟度、安全证据、去中心化、代币价值捕获、供给风险和研究置信度。

当前 67 个资产的经济状态分布为：

| 标签 | 数量 | 含义 |
|---|---:|---|
| `not_applicable` | 14 | 网络型资产或没有可归属到单一项目方的损益表，不适用“项目方盈利”问题 |
| `not_disclosed` | 32 | 未找到足够公开、可核验的项目实体损益表，不能判断是否盈利 |
| `revenue_generating_not_profit_proven` | 21 | 能看到协议费用、收入或金库流入代理，但没有把它误称为项目方净利润 |

这意味着目前没有任何资产被不负责任地标成“项目方确定盈利”。对协议来说，手续费、收入、金库余额和代币持有者分配，分别是不同概念，不能相互替代。

## 2. 数据与研究边界

### 2.1 市场规模不是一个数字

看板继续从实时 `CoinSnapshot` 展示市值和 24h 成交额；研究档案另外记录细分市场、可寻址需求、规模观察指标及口径限制。市值与成交额是**可观察资产规模**的代理，不等于真实用户人数、收入、利润或总可寻址市场（TAM）。

协议类资产还可以参考 TVL、费用和收入等链上代理，但这些指标会受到激励、刷量、价格波动、重复计算和统计口径影响。只有在给出来源、时间和口径后，才把它们作为需求信号使用。

### 2.2 “是否盈利”的判定规则

只有公开、可核验的项目实体损益表，才能支持“净利润为正”这一结论。以下内容不能单独证明盈利：

1. 代币价格上涨或市值较高；
2. 协议有手续费、交易量或 TVL；
3. DAO 金库余额增加；
4. 基金会、实验室、公司与代币网络之间的资金流；
5. 某一季度的收入截图或第三方估算。

因此 UI 使用证据受限的三态标签，避免把“收入代理”误读成“项目方盈利”。

### 2.3 质量标签的解释

质量标签是研究记录，不是自动投资评分：

| 指标 | 可选值 | 解释 |
|---|---|---|
| 需求证据 | `high / medium / low / speculative` | 产品使用、开发者/用户需求与持续活动的公开证据强弱 |
| 产品成熟度 | `mature / operating / early / unclear` | 是否长期运行、主网/产品是否稳定、是否仍处于早期 |
| 安全证据 | `strong / medium / limited` | 审计、漏洞历史、公开运行记录和安全机制的综合证据 |
| 去中心化 | `high / medium / low / unknown` | 验证者/治理/托管/升级权的分散程度；不是价值判断 |
| 代币价值捕获 | `direct / indirect / weak / unknown / none` | 使用或协议现金流是否明确回到代币持有者，不能把治理权自动视为现金流 |
| 供给风险 | `low / medium / high` | 解锁、集中持仓、通胀、增发和单点控制等风险 |
| 置信度 | `high / medium / low` | 研究证据完整度和时效性，不是资产质量分数 |

## 3. 来源分层与可复核性

每个资产档案至少包含一个官方项目资料链接和一个市场数据链接；协议类资产在有可比口径时加入 DeFiLlama 页面。来源优先级如下：

1. **A 级：官方/一手资料**：项目文档、基金会或协议官方页面、治理/代币经济资料。
2. **B 级：专业公共数据源**：CoinGecko 的市场字段、DeFiLlama 的 TVL/费用/收入代理。
3. **C 级：二手资料**：仅用于发现线索，不单独支撑盈利、市场规模或安全结论。

CoinGecko 的 markets 接口提供价格、市值、成交额等市场字段，见 [CoinGecko coins/markets 文档](https://docs.coingecko.com/reference/coins-markets)；这些字段不提供项目方损益表。DeFiLlama 公开 API/文档提供 TVL、费用和收入等协议指标，见 [DeFiLlama API 文档](https://defillama.com/docs/api) 与 [方法说明](https://docs.llama.fi/)，这些指标同样不是经过审计的项目方净利润。

## 4. 67 个资产的档案位置

机器可读的完整档案在 [`data/asset-quality-research.json`](../data/asset-quality-research.json)。每个 `assetId` 与 [`data/assets.json`](../data/assets.json) 的 canonical ID 一一对应，当前覆盖：

`bitcoin`、`ethereum`、`solana`、`binancecoin`、`ripple`、`cardano`、`avalanche-2`、`tron`、`the-open-network`、`polkadot`、`sui`、`aptos`、`near`、`arbitrum`、`optimism`、`starknet`、`mantle`、`conflux-token`、`litecoin`、`bitcoin-cash`、`ethereum-classic`、`aave`、`uniswap`、`compound-governance-token`、`curve-dao-token`、`lido-dao`、`jupiter-exchange-solana`、`ethena`、`maker`、`hyperliquid`、`dydx-chain`、`aster-2`、`bittensor`、`fetch-ai`、`worldcoin-wld`、`virtual-protocol`、`render-token`、`filecoin`、`livepeer`、`helium`、`dogecoin`、`pepe`、`dogwifcoin`、`official-trump`、`shiba-inu`、`bonk`、`floki`、`monero`、`zcash`、`dash`、`ondo-finance`、`ordinals`、`blockstack`、`chainlink`、`ethereum-name-service`、`pi-network`、`internet-computer`、`morpho`、`polygon-ecosystem-token`、`pancakeswap-token`、`hedera-hashgraph`、`cosmos`、`injective-protocol`、`quant-network`、`algorand`、`kaspa`、`aerodrome-finance`。

详情弹窗会把档案与当前实时市值、24h 成交额及价格表现放在一起。这样可以同时看到“它声称解决什么问题”和“当前市场给了多大可观察规模”，但不会把相关性、规模代理或研究标签包装成未来收益预测。

## 5. 使用与更新规则

1. 先看 `problemSolved` 和 `market.addressableNeed`，确认项目需求是否与你要研究的问题相关。
2. 再看实时市值、24h 成交额和 `scaleCaveat`，不要用单一市值判断市场大小。
3. 查看 `economics`：`not_disclosed` 不是“亏损”，而是公开证据不足；`revenue_generating_not_profit_proven` 也不是“盈利”。
4. 用六项质量标签定位需要进一步查证的地方，尤其是供给解锁、中心化升级权、安全审计和代币是否真正捕获现金流。
5. 重要决策前重新打开官方资料和链上数据。研究档案是截至复核日的快照，不会替代最新公告、治理投票、审计或财务披露。

后续若要把研究升级为更强的尽调系统，优先增加：带时间戳的 TVL/费用历史、解锁日历、审计与漏洞记录、治理/验证者集中度、协议收入与代币持有者实际分配的拆分，以及可引用的项目实体财务披露。没有这些证据时，系统应继续保持“未披露/未证明”的保守标签。
