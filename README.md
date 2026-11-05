# egern-deepseek-balance

holy-max 公开模块：在 Egern 主屏幕 / 锁屏小组件里看 DeepSeek **官方余额**、**充值 / 赠送**拆分、以及 **峰 / 谷计价**状态与下一窗口倒计时。

布局参考 ServerCat：紧凑矩形信息卡，**不做趋势曲线**（官方没有用量历史接口；本地折线前几次只有空洞的「采样中…」，占位不值）。

## Peak / off-peak

按 [DeepSeek 定价文档](https://api-docs.deepseek.com/quick_start/pricing/)（北京时间）：

- **高峰**：工作日 `09:00–12:00`、`14:00–18:00`
- **谷时**：其余时段、周末、国务院法定节假日（2026 已内置）

## Layout

| Size | Content |
| --- | --- |
| Small | 标题 + 峰/谷徽章 · 大号余额 · 充值/赠送 · 下一窗口 |
| Medium | 标题行 · 总额卡 + 充值/赠送 chips · 峰谷条（窗口 + 倒计时） |
| Large | 同上 + 告警阈值轻量环 · 充值/赠送分卡 · 峰谷说明 |

## Install

**Raw:**

```text
https://raw.githubusercontent.com/holy-max/egern-deepseek-balance/main/deepseek-balance.yaml
```

**China mirror (ghfast):**

```text
https://ghfast.top/https://raw.githubusercontent.com/holy-max/egern-deepseek-balance/main/deepseek-balance.yaml
```

本地模块只改 `script_url`：

```yaml
script_url: https://ghfast.top/https://raw.githubusercontent.com/holy-max/egern-deepseek-balance/main/deepseek-balance.js?v=ui2
update_interval: 300
```

### Env

| Key | Notes | Default |
| --- | --- | --- |
| `API_KEY` | platform.deepseek.com 的 `sk-…`，**只填本机 Env，勿提交** | *(empty)* |
| `warn_cny` | 低于该值变黄 | `10` |
| `currency` | `CNY` / `USD` 偏好 | `CNY` |
| `history_points` | 本地余额快照点数（仅算「自上次」差额） | `8` |
| `title` | 标题 | `DeepSeek` |

## Changelog

### ui2
- 去掉趋势 SVG（不再出现大块「采样中…」空白）
- ServerCat 风：余额 + 充值/赠送 + 峰/谷徽章 + 下一窗口
- `script_url` 缓存戳 `?v=ui2`

## License

MIT
