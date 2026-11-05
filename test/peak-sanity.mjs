#!/usr/bin/env node
// Sanity-check Beijing peak/off-peak boundary math used by the widget.
import {
  peakPhase,
  beijingParts,
  beijingDateAt,
  nextBoundary,
  isPeakAt,
  isChinaHoliday,
  fmtCountdown,
} from '../deepseek-balance.js';

let failed = 0;
function assert(cond, msg) {
  if (!cond) {
    failed += 1;
    console.error('FAIL:', msg);
  } else {
    console.log('OK  ', msg);
  }
}

function expectPeak(isoBeijingLocal, wantPeak, note) {
  // isoBeijingLocal like '2026-11-05T17:05:00' interpreted as +08:00
  const now = new Date(isoBeijingLocal + '+08:00');
  const phase = peakPhase(now);
  assert(phase.isPeak === wantPeak, `${note}: isPeak=${phase.isPeak} want=${wantPeak} @ ${isoBeijingLocal}`);
  return { now, phase };
}

function expectNext(isoBeijingLocal, wantIso, wantEnteringPeak, note) {
  const now = new Date(isoBeijingLocal + '+08:00');
  const next = nextBoundary(now);
  const got = new Date(next.at).toISOString();
  const want = new Date(wantIso + '+08:00').toISOString();
  assert(got === want, `${note}: next.at ${got} want ${want}`);
  assert(next.enteringPeak === wantEnteringPeak, `${note}: enteringPeak=${next.enteringPeak} want=${wantEnteringPeak}`);
  const leftMin = Math.round((next.at - now.getTime()) / 60000);
  console.log('     countdown', fmtCountdown(next.at - now.getTime()), `(${leftMin} min)`);
}

// ── Cases mirroring the screenshot bug ──
// Afternoon peak ~17:05 → next boundary must be EXACTLY 18:00 (not 18:05 / 1h00m grid)
{
  const { phase } = expectPeak('2026-11-05T17:05:00', true, 'Thu 17:05 afternoon peak');
  assert(phase.windowText === '14:00–18:00', `windowText=${phase.windowText}`);
  expectNext('2026-11-05T17:05:00', '2026-11-05T18:00:00', false, '17:05 → 18:00 进谷');
  assert(phase.leftStr === '55分', `leftStr=${phase.leftStr} want 55分 (old bug showed 1h00m)`);
}

{
  expectPeak('2026-11-05T17:59:00', true, 'Thu 17:59 still peak');
  expectNext('2026-11-05T17:59:00', '2026-11-05T18:00:00', false, '17:59 → 18:00');
  const phase = peakPhase(new Date('2026-11-05T17:59:00+08:00'));
  assert(phase.leftStr === '1分', `17:59 leftStr=${phase.leftStr}`);
}

{
  expectPeak('2026-11-05T18:00:00', false, 'Thu 18:00 off-peak (end-exclusive)');
  expectNext('2026-11-05T18:00:00', '2026-11-06T09:00:00', true, 'Fri evening → Fri 09:00 进峰');
}

{
  expectPeak('2026-11-05T11:30:00', true, 'Thu morning peak');
  expectNext('2026-11-05T11:30:00', '2026-11-05T12:00:00', false, '11:30 → 12:00 进谷');
}

{
  expectPeak('2026-11-05T12:00:00', false, 'Thu noon lunch off-peak');
  expectNext('2026-11-05T12:00:00', '2026-11-05T14:00:00', true, '12:00 → 14:00 进峰');
  const phase = peakPhase(new Date('2026-11-05T12:30:00+08:00'));
  assert(phase.windowText === '12:00–14:00', `lunch windowText=${phase.windowText}`);
}

{
  expectPeak('2026-11-05T08:59:00', false, 'Thu before morning peak');
  expectNext('2026-11-05T08:59:00', '2026-11-05T09:00:00', true, '08:59 → 09:00');
}

{
  expectPeak('2026-11-05T09:00:00', true, 'Thu 09:00 enter peak');
  expectNext('2026-11-05T09:00:00', '2026-11-05T12:00:00', false, '09:00 → 12:00');
}

// Weekend → next Monday 09:00
{
  expectPeak('2026-11-07T15:00:00', false, 'Sat afternoon off-peak');
  expectNext('2026-11-07T15:00:00', '2026-11-09T09:00:00', true, 'Sat → Mon 09:00');
  const phase = peakPhase(new Date('2026-11-07T15:00:00+08:00'));
  assert(phase.windowText === '周末半价', `sat window=${phase.windowText}`);
  assert(phase.enteringPeak === true, 'sat enteringPeak');
}

// Friday evening → Monday 09:00
{
  expectPeak('2026-11-06T19:00:00', false, 'Fri evening');
  expectNext('2026-11-06T19:00:00', '2026-11-09T09:00:00', true, 'Fri eve → Mon 09:00');
}

// Holiday (National Day week 2026-10-01 Thu) → first non-holiday weekday 09:00 = Oct 8
{
  assert(isChinaHoliday(2026, 10, 1) === true, '2026-10-01 holiday');
  expectPeak('2026-10-01T10:00:00', false, 'National Day morning off-peak');
  expectNext('2026-10-01T10:00:00', '2026-10-08T09:00:00', true, 'holiday → Oct 8 09:00');
}

// 调休上班 weekend (2026-09-20 Sun) still off-peak per DeepSeek
{
  expectPeak('2026-09-20T10:00:00', false, '调休周日仍谷时');
}

// beijingParts sanity
{
  const p = beijingParts(new Date('2026-11-05T17:05:30+08:00'));
  assert(p.y === 2026 && p.m === 11 && p.d === 5 && p.h === 17 && p.min === 5, `parts=${JSON.stringify(p)}`);
  assert(p.weekday === 4, `weekday=${p.weekday} want Thu=4`);
}

// fmtCountdown
{
  assert(fmtCountdown(30 * 1000) === '不到1分', 'sub-minute');
  assert(fmtCountdown(55 * 60000) === '55分', '55分');
  assert(fmtCountdown(60 * 60000) === '1时', '1时 exact');
  assert(fmtCountdown(65 * 60000) === '1时5分', '1时5分');
  assert(fmtCountdown(26 * 60 * 60000) === '1天2时', '1天2时');
}

// Status line shape
{
  const phase = peakPhase(new Date('2026-11-05T17:05:00+08:00'));
  assert(phase.statusLine.includes('14:00–18:00'), `status has window: ${phase.statusLine}`);
  assert(phase.statusLine.includes('55分后进谷'), `status has countdown: ${phase.statusLine}`);
  assert(!/自上次/.test(JSON.stringify(phase)), 'no last-delta fields');
}

console.log('\n' + (failed ? `${failed} FAILED` : 'ALL PASSED'));
process.exit(failed ? 1 : 0);
