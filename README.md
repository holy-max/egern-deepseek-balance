# Egern DeepSeek 余额小组件

holy-max 公开模块：在 Egern 主屏幕 / 锁屏小组件里看 DeepSeek 官方余额、充值/赠送拆分、**峰/谷计价状态**，以及一条**本地采样**的余额趋势曲线。

灵感来自本机 Surge `DeepSeek-Balance` 面板逻辑，按 [Egern Widget DSL](https://egernapp.com/zh-CN/docs/configuration/widgets/) 重写（不使用 Surge `$panel` API）。

## 官方 API 能给什么 / 不能给什么

| 能力 | 状态 |
| --- | --- |
| 当前余额 | ✅ `GET https://api.deepseek.com/user/balance` |
| 充值 / 赠送拆分 | ✅ `topped_up_balance` / `granted_balance` |
| 是否可用 | ✅ `is_available` |
| 用量历史 / 花费序列 / 发票 | ❌ **没有**公开接口 |

因此趋势曲线只能靠 **Egern `ctx.storage` 在本机持久化**最近 N 次刷新的 `total_balance` 快照。换机或清数据曲线会空；前几次刷新显示「采样中…」。

文档：[Get User Balance](https://api-docs.deepseek.com/api/get-user-balance) · [Models & Pricing](https://api-docs.deepseek.com/quick_start/pricing/)

## 峰 / 谷窗口（以官网为准）

官方定价页（2026）：

- **高峰**：UTC 周一至周五 `01:00–04:00` 与 `06:00–10:00`  
  = **北京时间**周一至周五 `09:00–12:00` 与 `14:00–18:00`
- **谷时（半价）**：其余所有时段，含**周末全天**、**中国法定节假日全天**
- 脚本内置 **2026 国务院放假安排**休息日列表；其它年份节假日未烘焙时，仅按工作日窗口判断

> 本机旧版 Surge 面板曾用 `00:30–08:30` 谷时启发式，已过时，本模块按官网重写。

## 布局

| 尺寸 | 内容 |
| --- | --- |
| Small | 标题 + 峰/谷字标 + 大号余额 + 细 SVG 曲线 + 倒计时提示 |
| Medium | 标题行徽章 · 矩形卡（总额 / 充值·赠送 / 窗口）· SVG 曲线 · 窗内累计消耗 |
| Large | 同上 + 相对告警阈值的轻量圆环 + 更长曲线 + 峰谷说明条 |
| 锁屏圆/矩形/内联 | 余额摘要 + 峰谷 |

低余额（`< warn_cny`）变黄；耗尽变红。

## 安装

### 方式 A：模块 URL（推荐）

1. Egern → 工具 → 模块 → `+`
2. URL（国内可走 ghfast）：

```text
https://ghfast.top/https://raw.githubusercontent.com/holy-max/egern-deepseek-balance/main/deepseek-balance.yaml
```

或直连：

```text
https://raw.githubusercontent.com/holy-max/egern-deepseek-balance/main/deepseek-balance.yaml
```

3. 模块 Env 填写：
   - `API_KEY`：`sk-…`（只留本机，**不要**提交到 git）
   - `warn_cny`：可选，默认 `10`
   - `currency`：可选，`CNY` / `USD`
4. 分析 → 小组件画廊 → 选 **DeepSeek 余额** → 主屏幕长按添加 Egern 小组件

### 方式 B：本地 yaml（与 server-monitor 同级）

把仓库里的 `deepseek-balance.yaml` 拷到 Egern iCloud Documents，把 `script_url` 改成 ghfast 地址，再在 `Egern.yaml` 的 `modules` 里引用本地文件，并在 `env.API_KEY` 里填 Key。

## Env

| 键 | 说明 | 默认 |
| --- | --- | --- |
| `API_KEY` | DeepSeek API Key | （必填） |
| `warn_cny` | 低余额告警阈值 | `10` |
| `currency` | 优先币种 | `CNY` |
| `history_points` | 本地曲线点数 | `24` |
| `title` | 标题 | `DeepSeek` |

## 手机验证

1. 模块 Env 已填 Key，画廊里跑通（应用内卡片先变）
2. 主屏幕添加后等 WidgetKit 刷新；必要时删掉重加
3. 看峰/谷徽章是否与北京时间窗口一致
4. 多刷几次，曲线应从「采样中」长出折线

## 许可

MIT · holy-max  
参考：本机 Surge DeepSeek 余额面板、DeepSeek 官方 API / 定价文档、社区峰谷徽章实践。
