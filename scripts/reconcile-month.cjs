'use strict';
// reconcile-month.cjs — re-pull a FINISHED month from Corral so its committed
// numbers tie to Zenoti again.
//
// WHY
// ---
// refresh-daily.cjs only re-pulls the current week / lookback window, and its
// durability clamps deliberately PROTECT older committed weeks from being
// overwritten. So once a month ages out, its daily/weekly values are frozen at
// whatever was captured — while Corral (= Zenoti) keeps absorbing refunds/voids.
// The tracker then drifts a little above Zenoti (e.g. Avelure-Waterford June-2026:
// committed $72,214 vs Zenoti $72,067.97). This script is the INTENTIONAL
// exception that re-pulls a chosen month and overwrites it.
//
// WHAT IT TIES
// ------------
// Center-level Sales, Rev/Patient, Retail %, Injectable % (the KPI tiles) and the
// weekly Revenue chart. It rewrites `s/p/rt/inj` for the month in daily-metrics
// and weekly-metrics, PRESERVES collections (`co`), then runs apply-exclusions to
// recompute the rev/patient twins (`sx`/`px`) from the fresh `s`/`p`.
//
// SCOPE NOTE: center-level only. Provider feeds (Section C) and ops/botox are NOT
// re-pulled here unless you also drop their month-wide inputs (see below) — the
// apply-exclusions call will pick up any q-ops-keep-*/q-btx-* present.
//
// INPUTS (pull month-windowed from Corral — see RECONCILE-MONTH.md). Money to the
// cent; inj uses the canonical definition (SYNC-INJECTABLES.md):
//   scripts/qm-daily.json   REQUIRED  [{ d, c, s, p, rt, inj }] daily by center
//   scripts/qm-weekly.json  REQUIRED  [{ w, c, s, p, rt, inj }] weekly by center
//                                     (weekly p = COUNT(DISTINCT guest), can't be
//                                      summed from daily — must be its own pull)
//   scripts/q-revpat-center.json   for the month's weeks (SYNC-EXCLUSIONS #1) — so
//                                   Rev/Patient (sx/px) ties. Omit to skip.
//   scripts/q-revpat-provider.json optional, provider rev/patient twins.
//
// USAGE
//   node scripts/reconcile-month.cjs --dry-run [--center "Avelure-Waterford"]
//   node scripts/reconcile-month.cjs                # apply + run exclusions
//   node scripts/reconcile-month.cjs --no-exclusions

const fs = require('fs');
const path = require('path');

const BASE = path.join(__dirname, '..', 'public', 'data', 'performance');
const DIST = path.join(__dirname, '..', 'dist', 'data', 'performance');
const CENTER_ALIASES = { 'Ever/Body-Greenwich Village': 'Ever/Body-Greenwich' };

const args = process.argv.slice(2);
const DRY_RUN = args.includes('--dry-run');
const NO_EXCL = args.includes('--no-exclusions');
const SPOT = args.includes('--center') ? args[args.indexOf('--center') + 1] : null;

function readInput(f, { required } = {}) {
  const p = path.join(__dirname, f);
  if (!fs.existsSync(p)) {
    if (required) { console.error(`ABORT: missing required input ${f} — see scripts/RECONCILE-MONTH.md`); process.exit(1); }
    return null;
  }
  let data;
  try { data = JSON.parse(fs.readFileSync(p, 'utf8').replace(/^﻿/, '')); }
  catch (e) { console.error(`ABORT: ${f} is not valid JSON — ${e.message}`); process.exit(1); }
  if (!Array.isArray(data)) { console.error(`ABORT: ${f} must be a JSON array`); process.exit(1); }
  return data.map(r => (r.c && CENTER_ALIASES[r.c] ? { ...r, c: CENTER_ALIASES[r.c] } : r));
}
function readFeed(f) { return JSON.parse(fs.readFileSync(path.join(BASE, f), 'utf8')); }
function writeFeed(f, data) {
  const s = JSON.stringify(data);
  fs.writeFileSync(path.join(BASE, f), s);
  if (fs.existsSync(DIST)) fs.writeFileSync(path.join(DIST, f), s);
}
const fc = v => Math.round(parseFloat(v) || 0);            // integer (patient counts)
const fd = v => Math.round((parseFloat(v) || 0) * 100) / 100; // dollars to the cent

// ── Load inputs ──────────────────────────────────────────────────────────────
const qmDaily = readInput('qm-daily.json', { required: true });
const qmWeekly = readInput('qm-weekly.json', { required: true });
if (qmDaily.length === 0) { console.error('ABORT: qm-daily.json is empty — refusing to wipe a month.'); process.exit(1); }
if (qmWeekly.length === 0) { console.error('ABORT: qm-weekly.json is empty — refusing to wipe a month.'); process.exit(1); }

const locations = JSON.parse(fs.readFileSync(path.join(BASE, 'locations.json'), 'utf8'));
const knownCenters = new Set(locations.map(l => l.name));

const monthDays = [...new Set(qmDaily.map(r => r.d))].sort();
const monthWeeks = [...new Set(qmWeekly.map(r => r.w))].sort();
const dayStart = monthDays[0], dayEnd = monthDays[monthDays.length - 1];
const spanDays = (new Date(dayEnd) - new Date(dayStart)) / 86400000 + 1;
if (spanDays > 45) console.warn(`WARN: qm-daily spans ${spanDays} days (${dayStart}..${dayEnd}) — expected ~1 month. Continuing.`);

const skipped = new Set();
function knownOnly(rows) {
  return rows.filter(r => { if (knownCenters.has(r.c)) return true; skipped.add(r.c); return false; });
}

// ── Rebuild daily-metrics for the month (preserve co) ────────────────────────
const daySet = new Set(monthDays);
const existingDaily = readFeed('daily-metrics.json');
const coDaily = {};
for (const r of existingDaily) if (daySet.has(r.d)) coDaily[r.d + '|' + r.c] = fd(r.co);
const newDaily = knownOnly(qmDaily).map(r => ({
  d: r.d, c: r.c, s: fd(r.s),
  co: coDaily[r.d + '|' + r.c] || 0,           // collections preserved (not re-pulled)
  p: fc(r.p), rt: fd(r.rt), inj: fd(r.inj),
}));
// Only replace rows for the (month day, center) pairs present in the input, so a
// single-center or partial input never deletes other centers' committed data.
const dailyCenters = new Set(newDaily.map(r => r.c));
const inMonthDaily = r => daySet.has(r.d) && dailyCenters.has(r.c);
const dailyRemoved = existingDaily.filter(inMonthDaily).length;
const mergedDaily = [...existingDaily.filter(r => !inMonthDaily(r)), ...newDaily]
  .sort((a, b) => (a.d || '').localeCompare(b.d || '') || (a.c || '').localeCompare(b.c || ''));

// ── Rebuild weekly-metrics for the month's weeks (preserve co) ───────────────
const weekSet = new Set(monthWeeks);
const existingWeekly = readFeed('weekly-metrics.json');
const coWeekly = {};
for (const r of existingWeekly) if (weekSet.has(r.w)) coWeekly[r.w + '|' + r.c] = fd(r.co);
const newWeekly = knownOnly(qmWeekly).map(r => ({
  w: r.w, c: r.c, s: fd(r.s),
  co: coWeekly[r.w + '|' + r.c] || 0,
  p: fc(r.p), rt: fd(r.rt), inj: fd(r.inj),
}));
const weeklyCenters = new Set(newWeekly.map(r => r.c));
const inMonthWeekly = r => weekSet.has(r.w) && weeklyCenters.has(r.c);
const weeklyRemoved = existingWeekly.filter(inMonthWeekly).length;
const mergedWeekly = [...existingWeekly.filter(r => !inMonthWeekly(r)), ...newWeekly]
  .sort((a, b) => (a.w || '').localeCompare(b.w || '') || (a.c || '').localeCompare(b.c || ''));

// ── Report ───────────────────────────────────────────────────────────────────
console.log('--- reconcile-month ---');
console.log(`days:  ${dayStart} .. ${dayEnd} (${monthDays.length})   weeks: ${monthWeeks.join(', ')}`);
console.log(`collections: PRESERVED (co not re-pulled)`);
console.log(`daily-metrics:  ${dailyRemoved} removed, ${newDaily.length} added`);
console.log(`weekly-metrics: ${weeklyRemoved} removed, ${newWeekly.length} added`);
if (skipped.size) console.warn(`skipped unknown center(s): ${[...skipped].sort().join(', ')}`);
const monthSales = newDaily.reduce((a, r) => a + r.s, 0);
console.log(`reconciled month Sales (all centers, exc-tax): $${monthSales.toFixed(2)}`);
if (SPOT) {
  const d = newDaily.filter(r => r.c === SPOT), w = newWeekly.filter(r => r.c === SPOT);
  console.log(`spot [${SPOT}]: daily Sales=$${d.reduce((a, r) => a + r.s, 0).toFixed(2)}  weekly Sales=$${w.reduce((a, r) => a + r.s, 0).toFixed(2)}  (compare to Zenoti Sales-Accrual, Service+Product, exc-tax)`);
}

// Warn about exclusion inputs that apply-exclusions would also act on.
const exclInputs = ['q-revpat-center.json', 'q-revpat-provider.json', 'q-ops-keep-center.json', 'q-ops-keep-provider.json', 'q-btx-ge10.json', 'q-btx-vial.json']
  .filter(f => fs.existsSync(path.join(__dirname, f)));
console.log(`exclusion inputs present: ${exclInputs.length ? exclInputs.join(', ') : 'none (Rev/Patient sx will fall back to raw s)'}`);
if (!exclInputs.includes('q-revpat-center.json')) console.warn('  NOTE: no q-revpat-center.json — Rev/Patient will NOT be reconciled (tiles use sx ?? s fallback).');

if (DRY_RUN) { console.log('\n--dry-run: no files written.'); process.exit(0); }

writeFeed('daily-metrics.json', mergedDaily);
writeFeed('weekly-metrics.json', mergedWeekly);
console.log(`\nwrote daily-metrics.json + weekly-metrics.json (public${fs.existsSync(DIST) ? ' + dist' : ''}).`);

// ── Recompute exclusion twins (sx/px …) from the fresh s/p ───────────────────
if (NO_EXCL) {
  console.log('--no-exclusions: skipped apply-exclusions (sx/px NOT recomputed).');
} else if (exclInputs.length) {
  console.log('\nrunning apply-exclusions to recompute sx/px from the fresh s/p…');
  require('./apply-exclusions.cjs').run();
} else {
  console.log('no exclusion inputs present — skipped apply-exclusions.');
}
console.log('\nNext: npm run build, then commit & push to deploy (see RECONCILE-MONTH.md).');
