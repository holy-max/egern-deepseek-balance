// DeepSeek Balance Widget for Egern (holy-max)
// GET https://api.deepseek.com/user/balance
// Trend: local persistence via ctx.storage (API has no usage history)
// Peak windows: official pricing docs — Beijing Mon–Fri 09:00–12:00 & 14:00–18:00
// Inspiration: local Surge DeepSeek-Balance panel + community peak badges

export default async function (ctx) {
  const env = ctx.env || {};
  const apiKey = String(env.API_KEY || env.key || '').trim();
  const warn = Number(env.warn_cny || env.warn || 10) || 10;
  const preferCurrency = String(env.currency || 'CNY').trim().toUpperCase();
  const historyPoints = Math.max(8, Math.min(48, Number(env.history_points) || 24));
  const title = String(env.title || 'DeepSeek').trim() || 'DeepSeek';

  const C = {
    bg1: '#0d1117', bg2: '#161b22', card: '#12181f',
    text: '#e6edf3', muted: '#7d8590', dim: '#484f58',
    good: '#3fb950', peak: '#ff7b72', off: '#3fb950',
    warn: '#d29922', bad: '#ff7b72',
    topped: '#58a6ff', granted: '#a371f7',
    line: '#58a6ff', fill: 'rgba(88,166,255,0.22)',
    track: '#30363d',
  };

  const bgGradient = {
    type: 'linear', colors: [C.bg1, C.bg2],
    startPoint: { x: 0, y: 0 }, endPoint: { x: 0.25, y: 1 },
  };

  if (!apiKey || apiKey === '在此粘贴' || apiKey.startsWith('sk-xxx') || apiKey === 'YOUR_KEY') {
    return errorWidget('请填写 API_KEY', '模块 Env 里粘贴 platform.deepseek.com 的 sk-… Key（只留本机）');
  }

  let payload;
  try {
    payload = await fetchBalance(ctx, apiKey);
  } catch (e) {
    return errorWidget('请求失败', String(e.message || e));
  }

  const row = pickBalance(payload.balance_infos, preferCurrency);
  if (!row) {
    return errorWidget('无余额池', payload.is_available === false ? '账户不可用 / 余额不足' : 'balance_infos 为空');
  }

  const currency = row.currency || preferCurrency || 'CNY';
  const total = num(row.total_balance);
  const granted = num(row.granted_balance);
  const topped = num(row.topped_up_balance);
  const available = payload.is_available !== false && total > 0;

  const hist = persistHistory(ctx, { currency, total, topped, granted }, historyPoints);
  const delta = hist.length >= 2 ? total - hist[hist.length - 2].total : null;
  const spentWindow = spendFromHistory(hist);
  const phase = peakPhase(new Date());
  const accent = !available || total <= 0 ? C.bad : total <= warn ? C.warn : C.good;
  const phaseColor = phase.isPeak ? C.peak : C.off;

  const data = {
    title, currency, total, granted, topped, available, warn,
    delta, spentWindow, hist, phase, accent, phaseColor, C, bgGradient,
  };

  const family = ctx.widgetFamily || 'systemMedium';
  if (family === 'accessoryInline') return lockInline(data);
  if (family === 'accessoryCircular') return lockCircular(data);
  if (family === 'accessoryRectangular') return lockRect(data);
  if (family === 'systemSmall') return layoutSmall(data);
  if (family === 'systemLarge' || family === 'systemExtraLarge') return layoutLarge(data);
  return layoutMedium(data);
}

// ─── API ─────────────────────────────────────
async function fetchBalance(ctx, apiKey) {
  const resp = await ctx.http.get('https://api.deepseek.com/user/balance', {
    headers: {
      Authorization: `Bearer ${apiKey}`,
      Accept: 'application/json',
      'User-Agent': 'Egern-DeepSeek-Balance/1.0 (holy-max)',
    },
  });
  const status = Number(resp && resp.status);
  let json;
  try {
    json = await resp.json();
  } catch (_) {
    throw new Error(status ? `HTTP ${status} · 非 JSON` : '无响应');
  }
  if (status && (status < 200 || status >= 300)) {
    if (status === 401) throw new Error('HTTP 401 · Key 无效或过期');
    if (status === 402) throw new Error('HTTP 402 · 余额不足');
    throw new Error(`HTTP ${status}`);
  }
  return json || {};
}

function pickBalance(infos, prefer) {
  if (!Array.isArray(infos) || !infos.length) return null;
  if (prefer === 'CNY' || prefer === 'USD') {
    const hit = infos.find((x) => x.currency === prefer);
    if (hit) return hit;
  }
  const scored = [...infos].sort((a, b) => num(b.total_balance) - num(a.total_balance));
  return scored[0];
}

// ─── History (local only — API has no spend series) ───
function persistHistory(ctx, sample, maxPoints) {
  const key = '_dsBalH';
  const prev = (ctx.storage && ctx.storage.getJSON(key)) || [];
  const list = Array.isArray(prev) ? prev.slice() : [];
  const now = Date.now();
  const last = list[list.length - 1];
  // Deduplicate near-identical samples within 60s
  if (last && last.currency === sample.currency && Math.abs(now - (last.t || 0)) < 60_000
      && Math.abs(num(last.total) - sample.total) < 0.005) {
    last.t = now;
  } else {
    list.push({ t: now, currency: sample.currency, total: sample.total, topped: sample.topped, granted: sample.granted });
  }
  while (list.length > maxPoints) list.shift();
  if (ctx.storage && ctx.storage.setJSON) ctx.storage.setJSON(key, list);
  return list;
}

function spendFromHistory(hist) {
  if (!hist || hist.length < 2) return null;
  let spent = 0;
  for (let i = 1; i < hist.length; i++) {
    const d = hist[i - 1].total - hist[i].total;
    if (d > 0.004) spent += d; // ignore top-ups
  }
  return spent;
}

// ─── Peak / off-peak (official 2026) ─────────
// Peak: UTC Mon–Fri 01:00–04:00 & 06:00–10:00
//     = Beijing Mon–Fri 09:00–12:00 & 14:00–18:00
// Off-peak: all other hours, weekends, Chinese public holidays (full day)
// Source: https://api-docs.deepseek.com/quick_start/pricing/
function peakPhase(now = new Date()) {
  const parts = beijingParts(now);
  const holiday = isChinaHoliday(parts.y, parts.m, parts.d);
  const weekend = parts.weekday === 0 || parts.weekday === 6; // Sun=0 Sat=6
  const mins = parts.h * 60 + parts.min;
  const inMorning = mins >= 9 * 60 && mins < 12 * 60;
  const inAfternoon = mins >= 14 * 60 && mins < 18 * 60;
  const weekdayPeakWindow = !weekend && (inMorning || inAfternoon);
  const isPeak = weekdayPeakWindow && !holiday;

  const next = nextBoundary(parts, holiday);
  const leftMins = Math.max(0, Math.round((next.at - now.getTime()) / 60000));
  const hh = Math.floor(leftMins / 60);
  const mm = leftMins % 60;
  const leftStr = hh > 0 ? `${hh}h${String(mm).padStart(2, '0')}m` : `${mm}m`;

  return {
    isPeak,
    holiday,
    weekend,
    label: isPeak ? '高峰' : '谷时',
    badge: isPeak ? '峰' : '谷',
    hint: isPeak
      ? `高峰计价 · ${leftStr} 后进谷时`
      : holiday
        ? `谷时半价 · 节假日全天 · ${leftStr} 后看窗`
        : weekend
          ? `谷时半价 · 周末全天 · ${leftStr} 后看窗`
          : `谷时半价 · ${leftStr} 后高峰`,
    windowText: isPeak
      ? (inMorning ? '09:00–12:00' : '14:00–18:00')
      : '半价中',
    nextLabel: next.label,
    leftStr,
  };
}

function beijingParts(date) {
  const fmt = new Intl.DateTimeFormat('en-US', {
    timeZone: 'Asia/Shanghai',
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit',
    hour12: false, weekday: 'short',
  });
  const map = {};
  for (const p of fmt.formatToParts(date)) map[p.type] = p.value;
  const weekdayMap = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };
  let h = Number(map.hour);
  if (h === 24) h = 0; // some engines
  return {
    y: Number(map.year),
    m: Number(map.month),
    d: Number(map.day),
    h,
    min: Number(map.minute),
    sec: Number(map.second),
    weekday: weekdayMap[map.weekday] ?? 0,
  };
}

// 2026 State Council holiday rest days (Beijing calendar dates)
// https://www.gov.cn/zhengce/content/202511/content_7047090.htm
const HOLIDAYS_2026 = new Set([
  // 元旦
  '2026-01-01', '2026-01-02', '2026-01-03',
  // 春节
  '2026-02-15', '2026-02-16', '2026-02-17', '2026-02-18', '2026-02-19',
  '2026-02-20', '2026-02-21', '2026-02-22', '2026-02-23',
  // 清明
  '2026-04-04', '2026-04-05', '2026-04-06',
  // 劳动节
  '2026-05-01', '2026-05-02', '2026-05-03', '2026-05-04', '2026-05-05',
  // 端午
  '2026-06-19', '2026-06-20', '2026-06-21',
  // 中秋
  '2026-09-25', '2026-09-26', '2026-09-27',
  // 国庆
  '2026-10-01', '2026-10-02', '2026-10-03', '2026-10-04',
  '2026-10-05', '2026-10-06', '2026-10-07',
]);

function isChinaHoliday(y, m, d) {
  const key = `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
  if (y === 2026) return HOLIDAYS_2026.has(key);
  // Outside baked year: weekends still handled separately; weekday holidays unknown → not holiday
  return false;
}

function nextBoundary(parts, holiday) {
  // Compute next peak↔off switch from current Beijing wall clock
  const base = Date.UTC(parts.y, parts.m - 1, parts.d, parts.h - 8, parts.min, parts.sec || 0); // rough → better use iterative
  // Walk forward in 30-min steps up to 8 days
  const start = new Date();
  for (let i = 1; i <= 8 * 48; i++) {
    const t = new Date(start.getTime() + i * 30 * 60 * 1000);
    const p = beijingParts(t);
    const hol = isChinaHoliday(p.y, p.m, p.d);
    const weekend = p.weekday === 0 || p.weekday === 6;
    const mins = p.h * 60 + p.min;
    const inMorning = mins >= 9 * 60 && mins < 12 * 60;
    const inAfternoon = mins >= 14 * 60 && mins < 18 * 60;
    const peak = !weekend && !hol && (inMorning || inAfternoon);
    const curPeak = (() => {
      const weekend0 = parts.weekday === 0 || parts.weekday === 6;
      const mins0 = parts.h * 60 + parts.min;
      const am = mins0 >= 9 * 60 && mins0 < 12 * 60;
      const pm = mins0 >= 14 * 60 && mins0 < 18 * 60;
      return !weekend0 && !holiday && (am || pm);
    })();
    if (peak !== curPeak) {
      return { at: t.getTime(), label: peak ? '进高峰' : '进谷时' };
    }
  }
  return { at: start.getTime() + 24 * 3600 * 1000, label: '下个窗口' };
}

// ─── Formatters ──────────────────────────────
function num(x) {
  const n = Number(x);
  return Number.isFinite(n) ? n : 0;
}

function fmtMoney(n, currency) {
  const sym = currency === 'USD' ? '$' : '¥';
  const v = Number(n) || 0;
  return `${sym}${v.toFixed(2)}`;
}

function deltaLine(delta, currency) {
  if (delta == null) return '首次采样 · 曲线将随刷新生长';
  if (Math.abs(delta) < 0.005) return '自上次 · 无变化';
  if (delta < 0) return `自上次 · 花了 ${fmtMoney(-delta, currency)}`;
  return `自上次 · 到账 ${fmtMoney(delta, currency)}`;
}

function refreshAfterMinutes(mins) {
  return new Date(Date.now() + mins * 60 * 1000).toISOString();
}

function toRgb(hex) {
  const h = String(hex || '').replace('#', '');
  if (h.length < 6) return 'rgb(125,133,144)';
  const n = parseInt(h.slice(0, 6), 16);
  return `rgb(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255})`;
}

// ─── SVG sparkline (balance over local samples) ───
function sparkSrc(hist, color, w = 200, h = 48) {
  const vals = (hist || []).map((x) => num(x.total));
  if (vals.length < 2) {
    const svg = `<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 ${w} ${h}'>` +
      `<text x='${w / 2}' y='${h / 2}' fill='${toRgb(Cdim())}' font-size='11' text-anchor='middle' dominant-baseline='middle'>采样中…</text></svg>`;
    return `data:image/svg+xml,${svg}`;
  }
  const min = Math.min(...vals);
  const max = Math.max(...vals);
  const span = Math.max(max - min, 0.01);
  const padY = 4;
  const pts = vals.map((v, i) => {
    const x = (i / (vals.length - 1)) * (w - 2) + 1;
    const y = padY + (1 - (v - min) / span) * (h - padY * 2);
    return `${x.toFixed(1)},${y.toFixed(1)}`;
  });
  const poly = pts.join(' ');
  const first = pts[0].split(',');
  const last = pts[pts.length - 1].split(',');
  const area = `${first[0]},${h - 1} ${poly} ${last[0]},${h - 1}`;
  const stroke = toRgb(color);
  const svg =
    `<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 ${w} ${h}'>` +
    `<polygon points='${area}' fill='rgba(88,166,255,0.18)' stroke='none'/>` +
    `<polyline points='${poly}' fill='none' stroke='${stroke}' stroke-width='2.2' stroke-linejoin='round' stroke-linecap='round'/>` +
    `<circle cx='${last[0]}' cy='${last[1]}' r='2.6' fill='${stroke}'/>` +
    `</svg>`;
  return `data:image/svg+xml,${svg}`;
}

function Cdim() { return '#484f58'; }

// Optional remaining-vs-warn ring (only when warn > 0)
function warnRingSrc(total, warn, color, size = 56, stroke = 6) {
  const pct = warn > 0 ? Math.max(0, Math.min(100, Math.round((total / warn) * 100))) : 100;
  // Interpret as "headroom above warn": full ring when total >= warn*2 for calm look,
  // or ratio total/warn capped — use min(total/warn, 2)/2 so warn==total → 50%, 2x warn → 100%
  const ratio = warn > 0 ? Math.max(0, Math.min(1, total / (warn * 2))) : 1;
  const r = size / 2 - stroke;
  const circ = 2 * Math.PI * r;
  const dash = ratio * circ;
  const strokeColor = toRgb(color);
  const track = toRgb('#30363d');
  const label = total >= 100 ? total.toFixed(0) : total.toFixed(1);
  const svg =
    `<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 ${size} ${size}'>` +
    `<circle cx='${size / 2}' cy='${size / 2}' r='${r}' fill='none' stroke='${track}' stroke-width='${stroke}'/>` +
    `<circle cx='${size / 2}' cy='${size / 2}' r='${r}' fill='none' stroke='${strokeColor}' stroke-width='${stroke}' ` +
    `stroke-linecap='round' stroke-dasharray='${dash.toFixed(2)} ${circ.toFixed(2)}' transform='rotate(-90 ${size / 2} ${size / 2})'/>` +
    `<text x='${size / 2}' y='${size / 2}' fill='${toRgb('#e6edf3')}' font-size='${size >= 56 ? 12 : 10}' font-weight='700' ` +
    `text-anchor='middle' dominant-baseline='central'>${label}</text></svg>`;
  return `data:image/svg+xml,${svg}`;
}

// ─── Layout helpers ──────────────────────────
function phaseBadge(phase, phaseColor, C) {
  return {
    type: 'stack', direction: 'row', alignItems: 'center', gap: 4,
    padding: [3, 8], borderRadius: 8, backgroundColor: C.card,
    borderWidth: 1, borderColor: phaseColor + '66',
    children: [
      {
        type: 'text', text: phase.isPeak ? '● 高峰' : '● 谷时',
        font: { size: 'caption1', weight: 'bold' },
        textColor: phaseColor, maxLines: 1,
      },
    ],
  };
}

function headerRow(data, iconSize = 14) {
  const { title, C, phase, phaseColor } = data;
  return {
    type: 'stack', direction: 'row', alignItems: 'center', gap: 6,
    children: [
      { type: 'image', src: 'sf-symbol:brain.head.profile', color: data.accent, width: iconSize, height: iconSize },
      { type: 'text', text: title, font: { size: 'headline', weight: 'bold' }, textColor: C.text, maxLines: 1 },
      { type: 'spacer' },
      phaseBadge(phase, phaseColor, C),
    ],
  };
}

function errorWidget(title, detail) {
  return {
    type: 'widget', padding: 14, gap: 6,
    backgroundColor: '#0d1117',
    refreshAfter: refreshAfterMinutes(5),
    children: [
      {
        type: 'stack', direction: 'row', alignItems: 'center', gap: 6, children: [
          { type: 'image', src: 'sf-symbol:exclamationmark.triangle.fill', color: '#ff7b72', width: 16, height: 16 },
          { type: 'text', text: title, font: { size: 'headline', weight: 'bold' }, textColor: '#e6edf3' },
        ],
      },
      { type: 'text', text: detail, font: { size: 'caption1' }, textColor: '#7d8590', maxLines: 4 },
    ],
  };
}

// ─── Size layouts ────────────────────────────
function layoutSmall(data) {
  const { C, total, currency, phase, phaseColor, hist, accent, bgGradient, title } = data;
  return {
    type: 'widget', backgroundGradient: bgGradient, padding: 10, gap: 6,
    refreshAfter: refreshAfterMinutes(10),
    children: [
      {
        type: 'stack', direction: 'row', alignItems: 'center', gap: 4, children: [
          { type: 'image', src: 'sf-symbol:brain.head.profile', color: accent, width: 12, height: 12 },
          { type: 'text', text: title, font: { size: 'caption1', weight: 'bold' }, textColor: C.text, maxLines: 1, minScale: 0.7 },
          { type: 'spacer' },
          { type: 'text', text: phase.badge, font: { size: 'caption1', weight: 'bold' }, textColor: phaseColor },
        ],
      },
      {
        type: 'text', text: fmtMoney(total, currency),
        font: { size: 'title', weight: 'bold', family: 'Menlo' },
        textColor: accent, maxLines: 1, minScale: 0.55,
      },
      {
        type: 'image', src: sparkSrc(hist, C.line, 160, 36),
        width: 160, height: 36, resizeMode: 'contain',
      },
      {
        type: 'text', text: phase.hint,
        font: { size: 'caption2' }, textColor: C.muted, maxLines: 1, minScale: 0.65,
      },
    ],
  };
}

function layoutMedium(data) {
  const { C, total, topped, granted, currency, phase, phaseColor, hist, accent, bgGradient, delta, spentWindow } = data;
  return {
    type: 'widget', backgroundGradient: bgGradient, padding: [10, 12], gap: 6,
    refreshAfter: refreshAfterMinutes(10),
    children: [
      headerRow(data, 14),
      {
        type: 'stack', direction: 'row', alignItems: 'center', gap: 10,
        padding: 10, borderRadius: 12, backgroundColor: C.card,
        children: [
          {
            type: 'stack', direction: 'column', gap: 2, flex: 1, children: [
              { type: 'text', text: '总余额', font: { size: 'caption2', weight: 'semibold' }, textColor: C.muted },
              {
                type: 'text', text: fmtMoney(total, currency),
                font: { size: 'title', weight: 'bold', family: 'Menlo' },
                textColor: accent, maxLines: 1, minScale: 0.5,
              },
              {
                type: 'text', text: deltaLine(delta, currency),
                font: { size: 'caption2' }, textColor: C.dim, maxLines: 1, minScale: 0.7,
              },
            ],
          },
          {
            type: 'stack', direction: 'column', alignItems: 'end', gap: 4, children: [
              {
                type: 'text', text: `充值 ${fmtMoney(topped, currency)}`,
                font: { size: 11, family: 'Menlo', weight: 'medium' }, textColor: C.topped, maxLines: 1,
              },
              {
                type: 'text', text: `赠送 ${fmtMoney(granted, currency)}`,
                font: { size: 11, family: 'Menlo', weight: 'medium' }, textColor: C.granted, maxLines: 1,
              },
              {
                type: 'text', text: phase.windowText,
                font: { size: 'caption2', weight: 'bold' }, textColor: phaseColor, maxLines: 1,
              },
            ],
          },
        ],
      },
      {
        type: 'image', src: sparkSrc(hist, accent === data.C.warn || accent === data.C.bad ? accent : C.line, 320, 44),
        width: 320, height: 44, resizeMode: 'contain',
      },
      {
        type: 'stack', direction: 'row', alignItems: 'center', children: [
          { type: 'text', text: phase.hint, font: { size: 'caption2' }, textColor: C.muted, maxLines: 1, minScale: 0.65 },
          { type: 'spacer' },
          {
            type: 'text',
            text: spentWindow != null ? `窗内花 ${fmtMoney(spentWindow, currency)}` : `${hist.length} 点`,
            font: { size: 'caption2', family: 'Menlo' }, textColor: C.dim, maxLines: 1,
          },
        ],
      },
    ],
  };
}

function layoutLarge(data) {
  const { C, total, topped, granted, currency, phase, phaseColor, hist, accent, bgGradient, delta, spentWindow, warn } = data;
  const showRing = warn > 0;
  return {
    type: 'widget', backgroundGradient: bgGradient, padding: [12, 14], gap: 8,
    refreshAfter: refreshAfterMinutes(10),
    children: [
      headerRow(data, 16),
      {
        type: 'stack', direction: 'row', alignItems: 'center', gap: 12,
        padding: 12, borderRadius: 14, backgroundColor: C.card,
        children: [
          ...(showRing ? [{
            type: 'image',
            src: warnRingSrc(total, warn, accent, 64, 7),
            width: 64, height: 64, resizeMode: 'contain',
          }] : []),
          {
            type: 'stack', direction: 'column', gap: 3, flex: 1, children: [
              { type: 'text', text: '总余额', font: { size: 'caption1', weight: 'semibold' }, textColor: C.muted },
              {
                type: 'text', text: fmtMoney(total, currency),
                font: { size: 'largeTitle', weight: 'bold', family: 'Menlo' },
                textColor: accent, maxLines: 1, minScale: 0.45,
              },
              {
                type: 'text', text: deltaLine(delta, currency),
                font: { size: 'caption1' }, textColor: C.dim, maxLines: 1,
              },
            ],
          },
          {
            type: 'stack', direction: 'column', alignItems: 'end', gap: 6, children: [
              moneyChip('充值', topped, currency, C.topped, C),
              moneyChip('赠送', granted, currency, C.granted, C),
            ],
          },
        ],
      },
      {
        type: 'stack', direction: 'column', gap: 4, children: [
          {
            type: 'stack', direction: 'row', alignItems: 'center', children: [
              { type: 'text', text: '余额趋势（本地采样）', font: { size: 'caption1', weight: 'semibold' }, textColor: C.muted },
              { type: 'spacer' },
              { type: 'text', text: `${hist.length} 点`, font: { size: 'caption2', family: 'Menlo' }, textColor: C.dim },
            ],
          },
          {
            type: 'image', src: sparkSrc(hist, C.line, 340, 72),
            width: 340, height: 72, resizeMode: 'contain',
          },
          {
            type: 'text',
            text: '官方无用量历史接口；曲线来自本机每次刷新写入的余额快照',
            font: { size: 'caption2' }, textColor: C.dim, maxLines: 2,
          },
        ],
      },
      {
        type: 'stack', direction: 'row', alignItems: 'center', gap: 8,
        padding: [8, 10], borderRadius: 10, backgroundColor: C.card,
        children: [
          {
            type: 'text', text: phase.isPeak ? '高峰计价' : '谷时半价',
            font: { size: 'subheadline', weight: 'bold' }, textColor: phaseColor,
          },
          { type: 'text', text: phase.windowText, font: { size: 'caption1', family: 'Menlo' }, textColor: C.muted },
          { type: 'spacer' },
          { type: 'text', text: phase.leftStr + ' → ' + phase.nextLabel, font: { size: 'caption1' }, textColor: C.dim, maxLines: 1, minScale: 0.7 },
        ],
      },
      {
        type: 'stack', direction: 'row', alignItems: 'center', children: [
          {
            type: 'text',
            text: spentWindow != null ? `采样窗累计消耗 ${fmtMoney(spentWindow, currency)}` : '消耗统计需多次刷新',
            font: { size: 'caption2', family: 'Menlo' }, textColor: C.dim,
          },
          { type: 'spacer' },
          { type: 'date', date: new Date().toISOString(), format: 'relative', font: { size: 'caption2' }, textColor: C.dim },
        ],
      },
    ],
  };
}

function moneyChip(label, value, currency, color, C) {
  return {
    type: 'stack', direction: 'column', alignItems: 'end', gap: 1,
    padding: [4, 8], borderRadius: 8, backgroundColor: '#0d1117',
    children: [
      { type: 'text', text: label, font: { size: 'caption2' }, textColor: C.muted },
      { type: 'text', text: fmtMoney(value, currency), font: { size: 12, weight: 'semibold', family: 'Menlo' }, textColor: color },
    ],
  };
}

function lockInline(data) {
  return {
    type: 'widget',
    children: [{
      type: 'text',
      text: `${data.title} ${fmtMoney(data.total, data.currency)} · ${data.phase.badge}`,
    }],
  };
}

function lockCircular(data) {
  return {
    type: 'widget', padding: 2,
    children: [
      {
        type: 'image',
        src: warnRingSrc(data.total, Math.max(data.warn, data.total || 1), data.accent, 56, 6),
        width: 56, height: 56, resizeMode: 'contain',
      },
    ],
  };
}

function lockRect(data) {
  return {
    type: 'widget', gap: 2, padding: 2,
    children: [
      {
        type: 'stack', direction: 'row', alignItems: 'center', gap: 4, children: [
          { type: 'image', src: 'sf-symbol:brain.head.profile', width: 11, height: 11 },
          { type: 'text', text: data.title, font: { size: 'headline', weight: 'bold' }, maxLines: 1 },
          { type: 'spacer' },
          { type: 'text', text: data.phase.label, font: { size: 'caption2', weight: 'bold' } },
        ],
      },
      {
        type: 'text',
        text: `${fmtMoney(data.total, data.currency)}  充${fmtMoney(data.topped, data.currency)} 赠${fmtMoney(data.granted, data.currency)}`,
        font: { size: 11, family: 'Menlo' }, maxLines: 1, minScale: 0.7,
      },
      {
        type: 'text', text: data.phase.hint,
        font: { size: 10 }, opacity: 0.75, maxLines: 1, minScale: 0.65,
      },
    ],
  };
}
