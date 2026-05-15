# 06 - 运维手册

## 1. 本地开发命令

```bash
# 安装依赖（首次拉代码后）
npm install

# 启动开发服务器
npm run dev
# → 打开 http://localhost:3000

# 构建生产版本（验证能否上线）
npm run build && npm start

# 代码风格检查
npm run lint
```

## 2. 手动跑数据抓取脚本

```bash
# 阶段 1 之后可用
npm run fetch-snapshot

# 输出会写到 data/snapshots/YYYY-MM-DD.json
```

如果 CoinGecko 限频报 429：
1. 检查 `lib/coingecko.ts` 的 `RATE_LIMIT_MS`，至少 1500
2. 暂停 5-10 分钟再跑
3. 如果频繁触发，考虑申请 CoinGecko Demo Key 提升限额

## 3. GitHub Actions 排错

打开仓库 → Actions 标签 → 点失败的 run：
- **Yellow 黄圈**：跑过但有 warning
- **Red 红圈**：失败，看 log 找最后一条 error
- **常见错误**：
  - `git push` 权限：检查 workflow 的 `permissions: contents: write`
  - CoinGecko 429：脚本已带重试，连续多次失败邮件提醒后再处理
  - Node 版本：workflow 用 Node 20+

手动触发：Actions → 选 workflow → "Run workflow"

## 4. Vercel 部署排错

打开 Vercel Dashboard → 选项目 → Deployments：
- 点失败的部署看 Build log
- **常见错误**：
  - TypeScript 报错：本地先 `npm run build` 复现
  - 内存超限：免费版 build 内存有限，避免在 build 时跑重度计算
  - 环境变量：本项目暂不用，无需配置

回滚：Deployments → 选过去成功的 → Promote to Production

## 5. 数据问题排查

| 现象 | 可能原因 | 处理 |
|---|---|---|
| 网页显示 "暂无数据" | snapshot 缺失 | 看 Actions 日志，必要时本地手动跑一次 push |
| 某个币没数据 | sectors.json ID 写错 / CoinGecko 改名 | 查 `coingecko.com/en/coins/{slug}` 修正 |
| 涨跌幅明显错 | 时区切日错误 | 检查脚本里 UTC 时间逻辑 |
| 板块加权异常 | 单币市值缺失或 0 | 查 snapshot JSON 里该币 marketCap 字段 |

## 6. 仓库目录速查
- 业务代码：`app/` `components/` `lib/`
- 数据：`data/sectors.json` `data/snapshots/`
- 自动化：`scripts/` `.github/workflows/`
- 文档：`docs/`
- 日志：`dev-logs/`
- 全局规划：`PLAN.md`
- AI 协作入口：`CLAUDE.md`

## 7. 紧急停服
- Vercel Dashboard → 项目 Settings → Pause Project
- 或在 GitHub 上禁用 Actions workflow（改 cron 注释掉）