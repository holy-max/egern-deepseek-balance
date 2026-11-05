# Egern DeepSeek 余额

[holy-max](https://github.com/holy-max) 公开模块：DeepSeek 官方余额 + 峰/谷计价状态，适配 Egern 小组件。

## 卡片（ui6）

```
[brain] DeepSeek                     ● 高峰
总余额
¥123.45
充 ¥100.00   赠 ¥23.45
14:00–18:00  ·  55分后进谷
                                刚刚
```

- 去掉「自上次 · 无变化」与趋势曲线
- 峰/谷 pill + 精确下一边界倒计时（北京时间）
- **Medium 必须扁平**：不要嵌套厚 card / `title`(28pt) / 双侧 chip 内边距，否则高度溢出时 Egern 会把子层叠在一起
- `alignItems` 只能用 `start|end|center`（没有 stretch）
- 锁屏配件保留精简版

## 峰谷规则（官方）

北京时间周一至周五 **09:00–12:00**、**14:00–18:00** 为高峰（不含中国法定节假日）；其余时段、周末（含调休上班）、法定节假日全天为谷时（半价）。

倒计时按候选边界 `00:00 / 09:00 / 12:00 / 14:00 / 18:00` 精确计算，不再用 30 分钟步进扫描。

## 安装

1. Egern → 模块 → 添加本地 / URL：本仓库 `deepseek-balance.yaml`
2. 模块 Env 填写 `API_KEY`（platform.deepseek.com 的 `sk-…`，只留本机）
3. 画廊或桌面小组件添加「DeepSeek 余额」

国内可用 ghfast 前缀拉取 `script_url`。

> 若改完仍像旧版：GitHub raw 对 `/main/` 路径有 CDN 缓存，`?v=` 不一定刷新；可用 commit SHA 路径或等几分钟后再同步模块。

## 开发

```bash
node test/peak-sanity.mjs
```

## License

MIT
