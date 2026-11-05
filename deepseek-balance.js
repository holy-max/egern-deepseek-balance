// DeepSeek Balance Widget for Egern (holy-max)
// GET https://api.deepseek.com/user/balance
// Peak: Beijing Mon–Fri 09:00–12:00 & 14:00–18:00 (excl. CN holidays); else off-peak
// Redesign ui6: flat medium layout (no nested card overflow); ui5: alignItems center only; ui4: no last-delta + exact BJ peak countdown

export default async function (ctx) {
  const env = ctx.env || {};
  const apiKey = String(env.API_KEY || env.key || '').trim();
  const warn = Number(env.warn_cny || env.warn || 10) || 10;
  const preferCurrency = String(env.currency || 'CNY').trim().toUpperCase();
  const title = String(env.title || 'DeepSeek').trim() || 'DeepSeek';

  const C = {
    bg1: '#0d1117', bg2: '#161b22', card: '#12181f',
    text: '#e6edf3', muted: '#7d8590', dim: '#484f58',
    good: '#3fb950', peak: '#ff7b72', off: '#3fb950',
    warn: '#d29922', bad: '#ff7b72',
    topped: '#58a6ff', granted: '#a371f7',
    track: '#30363d', chip: '#1c2128',
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

  const phase = peakPhase(new Date());
  const accent = !available || total <= 0 ? C.bad : total <= warn ? C.warn : C.good;
  const phaseColor = phase.isPeak ? C.peak : C.off;

  const data = {
    title, currency, total, granted, topped, available, warn,
    phase, accent, phaseColor, C, bgGradient,
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
      'User-Agent': 'Egern-DeepSeek-Balance/1.2 (holy-max)',
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

// ─── Peak / off-peak (official 2026) ─────────
// Peak: Beijing Mon–Fri 09:00–12:00 & 14:00–18:00, excluding CN statutory holidays.
// Weekends (incl. 调休上班) and holidays are off-peak all day.
export function peakPhase(now = new Date()) {
  const parts = beijingParts(now);
  const holiday = isChinaHoliday(parts.y, parts.m, parts.d);
  const weekend = parts.weekday === 0 || parts.weekday === 6;
  const mins = parts.h * 60 + parts.min;
  const inMorning = mins >= 9 * 60 && mins < 12 * 60;
  const inAfternoon = mins >= 14 * 60 && mins < 18 * 60;
  const isPeak = !weekend && !holiday && (inMorning || inAfternoon);

  const next = nextBoundary(now);
  const leftMs = Math.max(0, next.at - now.getTime());
  const leftStr = fmtCountdown(leftMs);

  let windowText;
  if (isPeak) {
    windowText = inMorning ? '09:00–12:00' : '14:00–18:00';
  } else if (weekend) {
    windowText = '周末半价';
  } else if (holiday) {
    windowText = '节假日半价';
  } else if (mins >= 12 * 60 && mins < 14 * 60) {
    windowText = '12:00–14:00';
  } else if (mins < 9 * 60) {
    windowText = '夜间半价';
  } else {
    windowText = '晚间半价';
  }

  // Single status line: window + countdown (no duplicate "高峰计价 · …")
  const action = next.enteringPeak ? '进峰' : '进谷';
  const statusLine = `${windowText}  ·  ${leftStr}后${action}`;

  return {
    isPeak,
    holiday,
    weekend,
    label: isPeak ? '高峰' : '谷时',
    badge: isPeak ? '峰' : '谷',
    windowText,
    statusLine,
    nextLabel: next.label,
    nextAt: next.at,
    leftStr,
    leftMs,
    enteringPeak: next.enteringPeak,
  };
}

export function beijingParts(date) {
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
  if (h === 24) h = 0; // some engines emit 24:xx for midnight
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

const HOLIDAYS_2026 = new Set([
  '2026-01-01', '2026-01-02', '2026-01-03',
  '2026-02-15', '2026-02-16', '2026-02-17', '2026-02-18', '2026-02-19',
  '2026-02-20', '2026-02-21', '2026-02-22', '2026-02-23',
  '2026-04-04', '2026-04-05', '2026-04-06',
  '2026-05-01', '2026-05-02', '2026-05-03', '2026-05-04', '2026-05-05',
  '2026-06-19', '2026-06-20', '2026-06-21',
  '2026-09-25', '2026-09-26', '2026-09-27',
  '2026-10-01', '2026-10-02', '2026-10-03', '2026-10-04',
  '2026-10-05', '2026-10-06', '2026-10-07',
]);

export function isChinaHoliday(y, m, d) {
  const key = `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
  if (y === 2026) return HOLIDAYS_2026.has(key);
  return false;
}

function pad2(n) {
  return String(n).padStart(2, '0');
}

/** Exact Date for a Beijing civil wall-clock time. */
export function beijingDateAt(y, m, d, h, min = 0, sec = 0) {
  return new Date(`${y}-${pad2(m)}-${pad2(d)}T${pad2(h)}:${pad2(min)}:${pad2(sec)}+08:00`);
}

function addCalendarDays(y, m, d, delta) {
  // noon UTC+8 avoids DST non-issues (China has none) and month overflow
  const base = beijingDateAt(y, m, d, 12, 0, 0);
  const next = new Date(base.getTime() + delta * 86400000);
  const p = beijingParts(next);
  return { y: p.y, m: p.m, d: p.d, weekday: p.weekday };
}

export function isPeakAt(parts) {
  const holiday = isChinaHoliday(parts.y, parts.m, parts.d);
  const weekend = parts.weekday === 0 || parts.weekday === 6;
  if (weekend || holiday) return false;
  const mins = parts.h * 60 + parts.min + (parts.sec || 0) / 60;
  return (mins >= 9 * 60 && mins < 12 * 60) || (mins >= 14 * 60 && mins < 18 * 60);
}

/**
 * Exact next peak↔off-peak boundary.
 * Root cause of old bug: scanned in 30-minute steps from now, so a 17:05→18:00
 * transition was reported as 18:05 (~1h00m) instead of 18:00 (~55m), and near
 * hour edges the rounded grid could land a full hour off the real boundary.
 */
export function nextBoundary(now = new Date()) {
  const curPeak = isPeakAt(beijingParts(now));
  const start = beijingParts(now);

  // Candidate walls each day: midnight (day/weekend/holiday flip) + peak edges
  const hours = [0, 9, 12, 14, 18];

  for (let dayOffset = 0; dayOffset <= 16; dayOffset++) {
    const day = addCalendarDays(start.y, start.m, start.d, dayOffset);
    for (const h of hours) {
      const t = beijingDateAt(day.y, day.m, day.d, h, 0, 0);
      if (t.getTime() <= now.getTime()) continue;
      const peak = isPeakAt(beijingParts(t));
      if (peak !== curPeak) {
        return {
          at: t.getTime(),
          enteringPeak: peak,
          label: peak ? '进高峰' : '进谷时',
        };
      }
    }
  }

  // Fallback — should not hit with 16-day scan
  return {
    at: now.getTime() + 86400000,
    enteringPeak: !curPeak,
    label: '下个窗口',
  };
}

export function fmtCountdown(ms) {
  const totalMs = Math.max(0, Number(ms) || 0);
  if (totalMs < 60000) return '不到1分';
  const totalMin = Math.round(totalMs / 60000);
  if (totalMin < 60) return `${totalMin}分`;
  const days = Math.floor(totalMin / (60 * 24));
  const hours = Math.floor((totalMin % (60 * 24)) / 60);
  const mins = totalMin % 60;
  if (days > 0) {
    if (hours > 0) return `${days}天${hours}时`;
    return `${days}天`;
  }
  if (mins > 0) return `${hours}时${mins}分`;
  return `${hours}时`;
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

function refreshAfterMinutes(mins) {
  return new Date(Date.now() + mins * 60 * 1000).toISOString();
}

function toRgb(hex) {
  const h = String(hex || '').replace('#', '');
  if (h.length < 6) return 'rgb(125,133,144)';
  const n = parseInt(h.slice(0, 6), 16);
  return `rgb(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255})`;
}

// ─── Layout helpers ──────────────────────────
function phasePill(phase, phaseColor, C) {
  return {
    type: 'stack', direction: 'row', alignItems: 'center', gap: 3,
    padding: [2, 7], borderRadius: 7, backgroundColor: C.chip,
    children: [
      {
        type: 'text', text: phase.isPeak ? '● 高峰' : '● 谷时',
        font: { size: 'caption2', weight: 'bold' },
        textColor: phaseColor, maxLines: 1,
      },
    ],
  };
}

function headerRow(data, iconSize = 14) {
  const { title, C, phase, phaseColor, accent } = data;
  return {
    type: 'stack', direction: 'row', alignItems: 'center', gap: 6,
    children: [
      { type: 'image', src: 'sf-symbol:brain.head.profile', color: accent, width: iconSize, height: iconSize },
      { type: 'text', text: title, font: { size: 'headline', weight: 'bold' }, textColor: C.text, maxLines: 1 },
      { type: 'spacer' },
      phasePill(phase, phaseColor, C),
    ],
  };
}

/** Compact dual amounts — single text line, no padded chip cards (those overflow medium height). */
function amountsLine(topped, granted, currency, C) {
  return {
    type: 'text',
    text: `充 ${fmtMoney(topped, currency)}   ·   赠 ${fmtMoney(granted, currency)}`,
    font: { size: 'caption1', family: 'Menlo', weight: 'medium' },
    textColor: C.muted, maxLines: 1, minScale: 0.65,
  };
}

/** Side-by-side thin chips for large only (enough vertical room). */
function moneyChip(label, amount, currency, color, C) {
  return {
    type: 'stack', direction: 'column', gap: 2, flex: 1,
    padding: [6, 8], borderRadius: 8, backgroundColor: C.chip,
    children: [
      { type: 'text', text: label, font: { size: 'caption2', weight: 'semibold' }, textColor: C.muted, maxLines: 1 },
      {
        type: 'text', text: fmtMoney(amount, currency),
        font: { size: 13, family: 'Menlo', weight: 'bold' }, textColor: color, maxLines: 1, minScale: 0.7,
      },
    ],
  };
}

function statusLine(phase, phaseColor, C) {
  return {
    type: 'stack', direction: 'row', alignItems: 'center', gap: 6,
    children: [
      {
        type: 'text', text: phase.windowText,
        font: { size: 'caption1', weight: 'bold', family: 'Menlo' },
        textColor: phaseColor, maxLines: 1, minScale: 0.75,
      },
      {
        type: 'text',
        text: `·  ${phase.leftStr}后${phase.enteringPeak ? '进峰' : '进谷'}`,
        font: { size: 'caption1', weight: 'medium' },
        textColor: C.muted, maxLines: 1, minScale: 0.7,
      },
      { type: 'spacer' },
    ],
  };
}

function footerRelative(C) {
  return {
    type: 'stack', direction: 'row', alignItems: 'center', children: [
      { type: 'spacer' },
      { type: 'date', date: new Date().toISOString(), format: 'relative', font: { size: 'caption2' }, textColor: C.dim },
    ],
  };
}

function warnBar(total, warn, color, C, currency, width = 280, height = 5) {
  if (!(warn > 0)) return null;
  const ratio = Math.max(0, Math.min(1, total / (warn * 2)));
  const filled = Math.max(2, Math.round(ratio * width));
  return {
    type: 'stack', direction: 'column', gap: 2, children: [
      {
        type: 'stack', direction: 'row', alignItems: 'center', children: [
          { type: 'text', text: `告警线 ${fmtMoney(warn, currency)}`, font: { size: 'caption2' }, textColor: C.dim },
          { type: 'spacer' },
          { type: 'text', text: total <= warn ? '偏低' : '充足', font: { size: 'caption2', weight: 'semibold' }, textColor: color },
        ],
      },
      {
        type: 'stack', direction: 'row', height, borderRadius: height / 2, backgroundColor: C.track, children: [
          { type: 'stack', width: filled, height, borderRadius: height / 2, backgroundColor: color, children: [] },
          { type: 'spacer' },
        ],
      },
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
// Medium iOS height ~155–169pt. Nested card + title(28) + padded chips overflow
// and Egern stacks children on top of each other — keep flat & compact.
function layoutSmall(data) {
  const { C, total, topped, granted, currency, phase, phaseColor, accent, bgGradient, title } = data;
  return {
    type: 'widget', backgroundGradient: bgGradient, padding: 10, gap: 4,
    refreshAfter: refreshAfterMinutes(10),
    children: [
      {
        type: 'stack', direction: 'row', alignItems: 'center', gap: 4, children: [
          { type: 'image', src: 'sf-symbol:brain.head.profile', color: accent, width: 12, height: 12 },
          { type: 'text', text: title, font: { size: 'caption1', weight: 'bold' }, textColor: C.text, maxLines: 1, minScale: 0.7 },
          { type: 'spacer' },
          {
            type: 'text', text: phase.isPeak ? '● 峰' : '● 谷',
            font: { size: 'caption1', weight: 'bold' }, textColor: phaseColor,
          },
        ],
      },
      {
        type: 'text', text: fmtMoney(total, currency),
        font: { size: 'title3', weight: 'bold', family: 'Menlo' },
        textColor: accent, maxLines: 1, minScale: 0.55,
      },
      amountsLine(topped, granted, currency, C),
      {
        type: 'text',
        text: `${phase.leftStr}后${phase.enteringPeak ? '进峰' : '进谷'}`,
        font: { size: 'caption2' }, textColor: phaseColor, maxLines: 1, minScale: 0.7,
      },
    ],
  };
}

function layoutMedium(data) {
  const { C, total, topped, granted, currency, phase, phaseColor, accent, bgGradient } = data;
  return {
    type: 'widget', backgroundGradient: bgGradient, padding: [10, 12], gap: 6,
    refreshAfter: refreshAfterMinutes(10),
    children: [
      headerRow(data, 14),
      {
        type: 'stack', direction: 'column', gap: 2, children: [
          { type: 'text', text: '总余额', font: { size: 'caption2', weight: 'semibold' }, textColor: C.muted, maxLines: 1 },
          {
            type: 'text', text: fmtMoney(total, currency),
            // title=28 overflows medium when stacked with chips; title3=20 fits
            font: { size: 'title3', weight: 'bold', family: 'Menlo' },
            textColor: accent, maxLines: 1, minScale: 0.6,
          },
        ],
      },
      {
        type: 'stack', direction: 'row', alignItems: 'center', gap: 10, children: [
          {
            type: 'text', text: `充 ${fmtMoney(topped, currency)}`,
            font: { size: 'caption1', family: 'Menlo', weight: 'semibold' },
            textColor: C.topped, maxLines: 1, minScale: 0.7,
          },
          {
            type: 'text', text: `赠 ${fmtMoney(granted, currency)}`,
            font: { size: 'caption1', family: 'Menlo', weight: 'semibold' },
            textColor: C.granted, maxLines: 1, minScale: 0.7,
          },
        ],
      },
      statusLine(phase, phaseColor, C),
      footerRelative(C),
    ],
  };
}

function layoutLarge(data) {
  const { C, total, topped, granted, currency, phase, phaseColor, accent, bgGradient, warn } = data;
  const bar = warnBar(total, warn, accent, C, currency);
  return {
    type: 'widget', backgroundGradient: bgGradient, padding: [12, 14], gap: 8,
    refreshAfter: refreshAfterMinutes(10),
    children: [
      headerRow(data, 16),
      {
        type: 'stack', direction: 'column', gap: 3, children: [
          { type: 'text', text: '总余额', font: { size: 'caption1', weight: 'semibold' }, textColor: C.muted },
          {
            type: 'text', text: fmtMoney(total, currency),
            font: { size: 'title', weight: 'bold', family: 'Menlo' },
            textColor: accent, maxLines: 1, minScale: 0.5,
          },
        ],
      },
      {
        type: 'stack', direction: 'row', alignItems: 'center', gap: 8, children: [
          moneyChip('充值', topped, currency, C.topped, C),
          moneyChip('赠送', granted, currency, C.granted, C),
        ],
      },
      ...(bar ? [bar] : []),
      statusLine(phase, phaseColor, C),
      footerRelative(C),
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
  const size = 56;
  const stroke = 6;
  const warn = Math.max(data.warn, 0.01);
  const ratio = Math.max(0, Math.min(1, data.total / (warn * 2)));
  const r = size / 2 - stroke;
  const circ = 2 * Math.PI * r;
  const dash = ratio * circ;
  const strokeColor = toRgb(data.accent);
  const track = toRgb('#30363d');
  const label = data.total >= 100 ? data.total.toFixed(0) : data.total.toFixed(1);
  const svg =
    `<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 ${size} ${size}'>` +
    `<circle cx='${size / 2}' cy='${size / 2}' r='${r}' fill='none' stroke='${track}' stroke-width='${stroke}'/>` +
    `<circle cx='${size / 2}' cy='${size / 2}' r='${r}' fill='none' stroke='${strokeColor}' stroke-width='${stroke}' ` +
    `stroke-linecap='round' stroke-dasharray='${dash.toFixed(2)} ${circ.toFixed(2)}' transform='rotate(-90 ${size / 2} ${size / 2})'/>` +
    `<text x='${size / 2}' y='${size / 2}' fill='${toRgb('#e6edf3')}' font-size='12' font-weight='700' ` +
    `text-anchor='middle' dominant-baseline='central'>${label}</text></svg>`;
  return {
    type: 'widget', padding: 2,
    children: [{
      type: 'image',
      src: `data:image/svg+xml,${svg}`,
      width: 56, height: 56, resizeMode: 'contain',
    }],
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
        type: 'text',
        text: `${data.phase.leftStr}后${data.phase.enteringPeak ? '进峰' : '进谷'}`,
        font: { size: 10 }, opacity: 0.75, maxLines: 1, minScale: 0.65,
      },
    ],
  };
}
