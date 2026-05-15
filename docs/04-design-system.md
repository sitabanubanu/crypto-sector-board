# 04 - 视觉规范

## 1. 主题
**暗色主题**（与多数行情软件一致，长时间盯盘不刺眼）。

## 2. 调色板

| 用途 | 颜色 | Hex |
|---|---|---|
| 页面背景 | 极深灰蓝 | `#0b0e13` |
| 卡片/方块底色 | 中灰 | `#1a1d24` |
| 主文字 | 浅灰白 | `#e6e6e6` |
| 次要文字 | 中灰 | `#9ca3af` |
| 边框/分隔 | 暗灰 | `#2a2d35` |
| 强烈上涨 | 深绿 | `#16a34a` |
| 上涨 | 中绿 | `#22c55e` |
| 微涨 | 淡绿 | `#86efac` |
| 平盘 | 中性灰 | `#3a3a3a` |
| 微跌 | 淡红 | `#fca5a5` |
| 下跌 | 中红 | `#ef4444` |
| 强烈下跌 | 深红 | `#dc2626` |

## 3. 涨跌色映射函数
```ts
function returnPctToColor(pct: number): string {
  // pct 范围 [-0.10, +0.10] 线性插值
  // 超过 ±10% 截断到深色端
  const clamped = Math.max(-0.10, Math.min(0.10, pct));
  if (clamped > 0) return interpolate("#3a3a3a", "#16a34a", clamped / 0.10);
  if (clamped < 0) return interpolate("#3a3a3a", "#dc2626", -clamped / 0.10);
  return "#3a3a3a";
}
```

## 4. Treemap 间距
- 板块外框间距：4 px
- 板块内单币间距：1 px
- 板块标题字号：14-20 px（按方块面积自适应）
- 单币 Ticker 字号：10-14 px（方块过小则隐藏）

## 5. 字体
- 主字体：系统默认 (`-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto`)
- 数字使用等宽（`font-variant-numeric: tabular-nums`），便于对齐

## 6. 响应式断点
| 断点 | 宽度 | 行为 |
|---|---|---|
| Mobile | < 640 px | Treemap 仍渲染，超小方块只保留颜色，不显示文字 |
| Tablet | 640 - 1024 px | 正常显示，标题字号略小 |
| Desktop | ≥ 1024 px | 完整显示 |

## 7. 可访问性
- 涨跌色对比度满足 WCAG AA（4.5:1 against `#0b0e13`）
- 重要数字附 `aria-label="涨幅 +2.3%"`
- Tooltip 用 hover 触发，键盘 focus 也能弹出