'use strict';
// refresh-daily.cjs — PERMANENT daily refresh script
// Do NOT modify this file each day. It reads from scripts/q{N}.json input files.
//
// Input files (overwrite these each day, never commit them):
//   q1.json  — Q1 weekly revenue by center
//   q3.json  — Q3 weekly ops by center
//   q4.json  — Q4 weekly ntx/filler by center
//   q5.json  — Q5 btx by provider
//   q6.json  — Q6 syringe by location
//   q7.json  — Q7 provider hours by location
//   q8.json  — Q8 daily revenue (7-day lookback)
//   q9.json  — Q9 daily collections (7-day lookback, use_dataset(1237) NOT flat_file)
//   q10.json — Q10 metrics by provider
//   q11.json — Q11 injectable revenue by provider
//
//   NOTE: q1/q8/q10 `inj` and q11 `r` MUST use the canonical injectables
//   definition — see scripts/SYNC-INJECTABLES.md (keeps numbers tied to v_KD).
//
//   q12.json — Q12 collections by provider (use_dataset(1237) NOT flat_file)
//   q13.json — Q13 syringe by provider
//   q14.json — Q14 ops by provider
//   q16.json — Q16 location-level service hours + net scheduled hours (utilization)
//   q17.json — Q17 provider-level service hours + net scheduled hours (utilization)
//
//   --- Metric-exclusion inputs (REQUIRED — see scripts/SYNC-EXCLUSIONS.md) ---
//   These drive apply-exclusions.cjs (rev/patient fee+consult+vitamin exclusion,
//   cancel/no-show consult/wellness exclusion, botox <10u feeds, 100-unit vials).
//   The refresh ABORTS if any are missing so the exclusions are never silently
//   dropped. A genuinely empty result is fine — just save an empty file `[]`.
//   q-revpat-center.json    — fees+consult+vitamin adj by center-week
//   q-revpat-provider.json  — same by provider-week
//   q-ops-keep-center.json  — consult/wellness-excluded appt counts by center-week
//   q-ops-keep-provider.json— same by provider-week
//   q-btx-ge10.json         — botox appts >=10 units by provider-week
//   q-btx-vial.json         — "Botox 100 Units" (Service) add by provider-week
//
//   --- Section E (Provider Productivity) inputs — REQUIRED for E to update daily ---
//   Section E rebuilds at the end of this refresh (assemble-commercial-cache ->
//   build-commercial -> apply-commercial-accuracy), fully from Corral (no commercial-kd
//   board). Refresh these .commercial-cache pulls as part of the daily Corral pull or
//   Section E goes stale (build-commercial prints a STALE warning). See SYNC-COMMERCIAL.md
//   for the exact SQL. All are per (period, center, sold_by), injector-gated:
//   .commercial-cache/CORE_MONTHLY.json + CORE_WEEKLY.json   — botox_units, filler_syringes,
//       inj_visits, filler_sales, total_injectables_sales, neuro_revenue, total_sales, unique_visits
//   .commercial-cache/MS_MONTHLY.json + MS_WEEKLY.json       — multi-syringe appts (3/4/5+)
//   .commercial-cache/BRAND_MONTHLY.json + BRAND_WEEKLY.json — neuromodulator units by brand bucket
//   .commercial-cache/REVHOUR_MONTHLY.json + REVHOUR_WEEKLY.json — service sales + scheduled hours
//   .commercial-cache/DEMO_DAILY_UNITS.json                 — last-30d daily botox/filler units
//   .commercial-cache/ACCURATE_INJ_SPLIT.json               — per (center,sold_by,day) neuro+filler;
//       drives the accurate "Inj Revenue" (Section C) == "Total Injectables Sales" (Section E)
//
// NOTE: No q2.json — weekly co is derived from q9 daily data for accuracy.

const fs = require('fs');
const path = require('path');

const BASE = path.join(__dirname, '..', 'public', 'data', 'performance');
const DIST = path.join(__dirname, '..', 'dist', 'data', 'performance');

// CorralData occasionally renames centers. Map old/alternate names → canonical tracker name.
const CENTER_ALIASES = {
  'Ever/Body-Greenwich Village': 'Ever/Body-Greenwich',
};

function readInput(f) {
  const p = path.join(__dirname, f);
  if (!fs.existsSync(p)) throw new Error(`Missing input file: ${f} — run all SQL queries first`);
  // Strip UTF-8 BOM if present (e.g. files saved by PowerShell Set-Content)
  const data = JSON.parse(fs.readFileSync(p, 'utf8').replace(/^\uFEFF/, ''));
  return data.map(r => r.c && CENTER_ALIASES[r.c] ? { ...r, c: CENTER_ALIASES[r.c] } : r);
}
function readJson(f) { return JSON.parse(fs.readFileSync(path.join(BASE, f), 'utf8')); }
function writeJson(f, data) {
  const str = JSON.stringify(data);
  fs.writeFileSync(path.join(BASE, f), str);
  if (fs.existsSync(DIST)) fs.writeFileSync(path.join(DIST, f), str);
}
function fc(v) { return Math.round(parseFloat(v) || 0); }
function ff(v) { const n = parseFloat(v); return isNaN(n) ? null : Math.round(n * 100) / 100; }

function replaceWeek(file, newRows) {
  const existing = readJson(file);
  // DURABILITY: only ever write the current week (W). Drop any newRows for other
  // weeks so a full-history or non-canonical q-file pull can NEVER overwrite the
  // committed historical values (canonical injectables `inj`, sold_by retail
  // `rt`/`s`). Whatever machine runs the refresh, history is preserved as-is.
  // The current week's correctness still depends on the operator's SQL — the
  // canonical q1/q8/q10/q11 SQL is in scripts/SYNC-INJECTABLES.md.
  const wRows = newRows.filter(r => r.w === W);
  const droppedHist = newRows.length - wRows.length;
  const merged = [...existing.filter(r => r.w !== W), ...wRows];
  merged.sort((a, b) =>
    (a.w || '').localeCompare(b.w || '') ||
    (a.c || '').localeCompare(b.c || '') ||
    (a.pr || '').localeCompare(b.pr || '')
  );
  writeJson(file, merged);
  const weeks = [...new Set(merged.map(r => r.w))].sort();
  console.log(`${file}: ${existing.filter(r => r.w === W).length} removed, ${wRows.length} added${droppedHist ? ` (${droppedHist} non-current-week rows ignored — history protected)` : ''} -> total=${merged.length}, latest=${weeks[weeks.length - 1]}`);
}

// Replace EVERY week present in newRows. Use this when the input q-file
// contains the trailing N weeks (instead of only the current week).
//
// Why this exists: the original `replaceWeek` snapshots one week at a time,
// which means a partial-week input (Zenoti's flat_file lags real Zenoti by
// hours/days) gets baked in and never overwritten. We saw this on
// 2026-04-13 — Q11 captured only Apr 13 for Christopher Blaisdell, Apr 13–14
// for Julie Skowronski, and zero rows for Kat Yung (her week started Apr 17).
// To fix going forward: switch the upstream SQL to emit `WHERE sale_date >=
// CURRENT_DATE - INTERVAL '4 weeks'` and call replaceWeeks instead of
// replaceWeek. Re-running it daily then self-heals any partial-week capture
// within ~4 days of the lag clearing.
function replaceWeeks(file, newRows) {
  // DURABILITY: clamp to a trailing window (current week W back ~4 weeks) so a
  // full-history pull can't replace older committed weeks. History stays put
  // regardless of what the q-file contains. See scripts/SYNC-INJECTABLES.md.
  const CUTOFF = (() => { const d = new Date(W + 'T00:00:00Z'); d.setUTCDate(d.getUTCDate() - 28); return d.toISOString().slice(0, 10); })();
  const recent = newRows.filter(r => r.w && r.w >= CUTOFF);
  const newWeekSet = new Set(recent.map(r => r.w).filter(Boolean));
  if (newWeekSet.size === 0) {
    console.warn(`${file}: replaceWeeks called with no week info — falling back to replaceWeek with W=${W}`);
    return replaceWeek(file, newRows);
  }
  const existing = readJson(file);
  const removed = existing.filter(r => newWeekSet.has(r.w)).length;
  const merged = [...existing.filter(r => !newWeekSet.has(r.w)), ...recent];
  merged.sort((a, b) =>
    (a.w || '').localeCompare(b.w || '') ||
    (a.c || '').localeCompare(b.c || '') ||
    (a.pr || '').localeCompare(b.pr || '')
  );
  writeJson(file, merged);
  const weeks = [...new Set(merged.map(r => r.w))].sort();
  const replacedWeeks = [...newWeekSet].sort().join(', ');
  console.log(`${file}: ${removed} removed across {${replacedWeeks}}, ${newRows.length} added -> total=${merged.length}, latest=${weeks[weeks.length - 1]}`);
}

// ── Input validation guard ──────────────────────────────────────────────────
// Aborts if any q{N}.json is missing, stale (mtime < today), unparseable, or
// unexpectedly empty. Prevents the silent stale-data ships we saw before
// 2026-04-28 (e.g. q12 not refreshed for days, q14 carried over from yesterday).
//
// earlyMonday: true when the week just started and week-anchored queries may
// legitimately be empty. Two cases:
//   1. Q1 is completely empty (no sales at all yet on day 1 of week)
//   2. It is Monday (day 1 of week) regardless of Q1 — because Q7/Q16/Q17 use
//      `< CURRENT_DATE` as upper bound, meaning they always return 0 rows on
//      Monday (no completed days exist yet), and Q5/Q11 are empty before any
//      clinics have done injectable/botox appointments (typically 7am run).
const q1Raw = (() => {
  try { return JSON.parse(fs.readFileSync(path.join(__dirname, 'q1.json'), 'utf8').replace(/^﻿/, '')); }
  catch { return null; }
})();
const isMonday = new Date().getDay() === 1;
const isTuesdayAfterHoliday = new Date().getDay() === 2 &&
  Array.isArray(q1Raw) && !q1Raw.some(r => parseFloat(r.inj || 0) > 0);
const earlyMonday = (Array.isArray(q1Raw) && q1Raw.length === 0) || isMonday || isTuesdayAfterHoliday;
if (earlyMonday) console.log(`earlyMonday=true (isMonday=${isMonday}, isTuesdayAfterHoliday=${isTuesdayAfterHoliday}, q1Rows=${Array.isArray(q1Raw) ? q1Raw.length : 'n/a'}) — week-anchored queries (q4/q5/q7/q10-q12/q16/q17) allowed empty`);

const REQUIRED_INPUTS = [
  { f: 'q1.json',  allowEmpty: true,         desc: 'Weekly revenue (early Monday may legitimately be empty)' },
  { f: 'q3.json',  allowEmpty: false,         desc: 'Weekly ops by center' },
  { f: 'q4.json',  allowEmpty: earlyMonday,   desc: 'Weekly NTX/filler by center' },
  { f: 'q5.json',  allowEmpty: earlyMonday,   desc: 'Botox units by provider (dataset 1237 — must have data)' },
  { f: 'q6.json',  allowEmpty: true,          desc: 'Syringe by location (raw flat_file — known to lag, allowed empty)' },
  { f: 'q7.json',  allowEmpty: earlyMonday,   desc: 'Provider hours by location' },
  { f: 'q8.json',  allowEmpty: false,         desc: 'Daily revenue (7-day lookback)' },
  { f: 'q9.json',  allowEmpty: false,         desc: 'Daily collections (7-day lookback)' },
  { f: 'q10.json', allowEmpty: earlyMonday,   desc: 'Provider weekly metrics' },
  { f: 'q11.json', allowEmpty: earlyMonday,   desc: 'Provider injectable revenue' },
  { f: 'q12.json', allowEmpty: earlyMonday,   desc: 'Provider collections (dataset 1237 — must have data)' },
  { f: 'q13.json', allowEmpty: true,          desc: 'Provider syringe (raw flat_file — known to lag, allowed empty)' },
  { f: 'q14.json', allowEmpty: false,         desc: 'Provider ops rates (dataset 754 — must have data)' },
  { f: 'q16.json', allowEmpty: earlyMonday,   desc: 'Location utilization' },
  { f: 'q17.json', allowEmpty: earlyMonday,   desc: 'Provider utilization' },
  // Metric-exclusion inputs — REQUIRED so exclusions are never silently dropped.
  // allowEmpty: file must EXIST (proves the query was run); an empty [] is OK.
  // See scripts/SYNC-EXCLUSIONS.md for the queries.
  { f: 'q-revpat-center.json',    allowEmpty: true, desc: 'Rev/patient fee+consult+vitamin adj by center (SYNC-EXCLUSIONS.md #1)' },
  { f: 'q-revpat-provider.json',  allowEmpty: true, desc: 'Rev/patient adj by provider (SYNC-EXCLUSIONS.md #2)' },
  { f: 'q-ops-keep-center.json',  allowEmpty: true, desc: 'Cancel/no-show consult/wellness-excluded counts by center (SYNC-EXCLUSIONS.md #3)' },
  { f: 'q-ops-keep-provider.json',allowEmpty: true, desc: 'Cancel/no-show counts by provider (SYNC-EXCLUSIONS.md #4)' },
  { f: 'q-btx-ge10.json',         allowEmpty: true, desc: 'Botox >=10u appts by provider (SYNC-EXCLUSIONS.md #5)' },
  { f: 'q-btx-vial.json',         allowEmpty: true, desc: '"Botox 100 Units" vial add by provider (SYNC-EXCLUSIONS.md #6)' },
];

(function validateInputs() {
  const startOfToday = new Date();
  startOfToday.setHours(0, 0, 0, 0);

  const errors = [];
  const warnings = [];
  const summary = [];

  for (const { f, allowEmpty, desc } of REQUIRED_INPUTS) {
    const p = path.join(__dirname, f);
    if (!fs.existsSync(p)) {
      errors.push(`MISSING  ${f} — query was not run (${desc})`);
      continue;
    }
    const stat = fs.statSync(p);
    if (stat.mtime < startOfToday) {
      errors.push(`STALE    ${f} — last modified ${stat.mtime.toISOString()} (${desc})`);
      continue;
    }
    let data;
    try {
      data = JSON.parse(fs.readFileSync(p, 'utf8').replace(/^\uFEFF/, ''));
    } catch (e) {
      errors.push(`PARSE    ${f} — ${e.message}`);
      continue;
    }
    if (!Array.isArray(data)) {
      errors.push(`SHAPE    ${f} — expected JSON array (${desc})`);
      continue;
    }
    if (data.length === 0) {
      if (allowEmpty) {
        warnings.push(`empty    ${f} — ${desc}`);
      } else {
        errors.push(`EMPTY    ${f} — query returned 0 rows but data is expected (${desc})`);
      }
      continue;
    }
    const ws = data.map(r => r.w).filter(Boolean).sort();
    const ds = data.map(r => r.d).filter(Boolean).sort();
    const latest = ws.length ? ws[ws.length - 1] : (ds.length ? ds[ds.length - 1] : '?');
    summary.push(`ok       ${f}  rows=${data.length}  latest=${latest}`);
  }

  console.log('--- input validation ---');
  for (const s of summary) console.log(s);
  for (const w of warnings) console.warn(w);

  if (errors.length) {
    console.error('\n=== INPUT VALIDATION FAILED ===');
    for (const e of errors) console.error(e);
    console.error(`\n${errors.length} of ${REQUIRED_INPUTS.length} input files are missing, stale, or unexpectedly empty.`);
    console.error('ABORTED to prevent shipping incomplete data.');
    console.error('Action: re-run the failed queries, save the results, and run this script again.');
    console.error('Do NOT build/commit/push until all required inputs are fresh.\n');
    process.exit(1);
  }

  console.log(`ok       all ${REQUIRED_INPUTS.length} inputs validated\n`);
})();

// ── Determine W from q1 data (falls back to q3 on early Monday when no sales yet) ──
const q1Data = readInput('q1.json');
const _q3Early = readInput('q3.json');
const W = q1Data.length > 0 ? q1Data[0].w : _q3Early[0].w;
console.log(`W = ${W} (derived from ${q1Data.length > 0 ? 'q1' : 'q3 — early Monday, no sales yet'})`);

const locations = JSON.parse(fs.readFileSync(path.join(BASE, 'locations.json'), 'utf8'));
const knownCenters = new Set(locations.map(l => l.name));

// ── Data quality sanity check ─────────────────────────────────────────────────
// Guards against AI-fabricated data that passes the freshness check but has
// wrong values (e.g. inflated round numbers, missing entire days). Root cause:
// context compaction in a scheduled session can cause the AI to lose real query
// results and invent plausible-looking but incorrect data (incident: 2026-06-22).
(function validateDataQuality() {
  const q1 = readInput('q1.json');
  const q8 = readInput('q8.json');
  const q9 = readInput('q9.json');
  const errors = [];

  // Q8: 7-day lookback must cover at least 5 distinct calendar dates.
  // Fabricated data had zeros for entire days (missing Tue, Fri, Sat) leaving
  // only 4 dates — this check catches that pattern without needing expected values.
  const q8Dates = [...new Set(q8.map(r => r.d).filter(Boolean))];
  if (q8Dates.length < 5) {
    errors.push(`DATA_QUALITY q8.json: only ${q8Dates.length} unique dates in 7-day lookback (expected ≥5). Dates found: ${q8Dates.sort().join(', ')}. Possible fabricated or truncated data.`);
  }

  // Q8: minimum row count — 7-day × ~50 locations = 350 rows expected; 100 is a
  // very conservative floor. Fabricated file had ~160 rows (only 4 dates × fewer locations).
  if (q8.length < 100) {
    errors.push(`DATA_QUALITY q8.json: only ${q8.length} rows — expected ≥100 for a 7-day lookback across 50+ locations`);
  }

  // Q9: same date-coverage check for daily collections
  const q9Dates = [...new Set(q9.map(r => r.d).filter(Boolean))];
  if (q9Dates.length < 5) {
    errors.push(`DATA_QUALITY q9.json: only ${q9Dates.length} unique dates in 7-day lookback (expected ≥5). Dates found: ${q9Dates.sort().join(', ')}`);
  }

  // Q1 non-earlyMonday: at least 20 locations must have s > 0
  if (!earlyMonday && q1.length > 0) {
    const locWithSales = q1.filter(r => parseFloat(r.s) > 0).length;
    if (locWithSales < 20) {
      errors.push(`DATA_QUALITY q1.json: only ${locWithSales} of ${q1.length} locations have weekly revenue > $0 — expected ≥20 on a live week`);
    }
  }

  if (errors.length) {
    console.error('\n=== DATA QUALITY CHECK FAILED ===');
    for (const e of errors) console.error(e);
    console.error('\nThis likely indicates fabricated or corrupted query results.');
    console.error('Re-run ALL SQL queries against CorralData and verify results before proceeding.');
    console.error('DO NOT build or push until all checks pass.\n');
    process.exit(1);
  }
  console.log('data quality ok\n');
})();

// ── Q9: load daily collections (dataset 1237) — needed early for weekly co ───
const q9Data = readInput('q9.json');

// ── 1. WEEKLY-METRICS ─────────────────────────────────────────────────────────
// co derived from Q9 daily data (not Q2/flat_file — avoids same-day lag)
const weeklyCoMap = {};
for (const r of q9Data) {
  if (r.d >= W && knownCenters.has(r.c)) {
    weeklyCoMap[r.c] = (weeklyCoMap[r.c] || 0) + Math.round(parseFloat(r.co) || 0);
  }
}
const metricsRows = q1Data
  .filter(r => knownCenters.has(r.c))
  .map(r => ({ w: W, c: r.c, s: fc(r.s), co: weeklyCoMap[r.c] || 0, p: fc(r.p), rt: fc(r.rt), inj: fc(r.inj) }));
replaceWeek('weekly-metrics.json', metricsRows);

// ── 2. WEEKLY-OPS ─────────────────────────────────────────────────────────────
const q3Data = _q3Early;
// cn/ns are percentage rates from dataset 754, t is appointment group count
const opsRows = q3Data.filter(r => knownCenters.has(r.c))
  .map(r => ({ w: W, c: r.c, cn: ff(r.cn), ns: ff(r.ns), t: fc(r.t) }));
replaceWeek('weekly-ops.json', opsRows);

// ── 3. WEEKLY-NTX-FILLER ──────────────────────────────────────────────────────
const q4Data = readInput('q4.json');
const ntxRows = q4Data.filter(r => knownCenters.has(r.c))
  .map(r => ({ w: W, c: r.c, ntx: fc(r.ntx), filler: fc(r.filler) }));
replaceWeek('weekly-ntx-filler.json', ntxRows);

// ── 4. WEEKLY-BTX-PROVIDER + WEEKLY-BTX ──────────────────────────────────────
const q5Data = readInput('q5.json');
const btxProvRows = q5Data.filter(r => knownCenters.has(r.c) && r.pr != null)
  .map(r => {
    const n = fc(r.n);
    const total_qty = ff(r.total_qty);
    const b = n > 0 ? Math.round((total_qty / n) * 100) / 100 : null;
    return { w: W, c: r.c, pr: r.pr, b, n, total_qty };
  });
replaceWeek('weekly-btx-provider.json', btxProvRows);
const btxMap = {};
for (const r of btxProvRows) {
  if (!btxMap[r.c]) btxMap[r.c] = { sumQty: 0, sumN: 0 };
  btxMap[r.c].sumQty += r.total_qty || 0;
  btxMap[r.c].sumN += r.n || 0;
}
const btxRows = Object.entries(btxMap).map(([c, v]) => {
  const avg_units = v.sumN > 0 ? Math.round((v.sumQty / v.sumN) * 100) / 100 : null;
  return {
    w: W, c,
    b: avg_units,
    avg_units,
    total_qty: Math.round(v.sumQty * 100) / 100
  };
});
replaceWeek('weekly-btx.json', btxRows);

// ── 5. WEEKLY-SYRINGE-LOC ─────────────────────────────────────────────────────
const q6Data = readInput('q6.json');
const syrRows = q6Data.filter(r => knownCenters.has(r.c))
  .map(r => ({ w: W, c: r.c, si: ff(r.si), sf: ff(r.sf), ni: parseInt(r.ni) || 0, nf: parseInt(r.nf) || 0 }));
replaceWeek('weekly-syringe-loc.json', syrRows);

// ── 6. WEEKLY-PROVIDER-HOURS + WEEKLY-UTILIZATION ────────────────────────────
const q7Data = readInput('q7.json');
const schedRows = q7Data.filter(r => knownCenters.has(r.c)).map(r => ({
  w: W, c: r.c,
  h: Math.round(parseFloat(r.h) * 10) / 10,
  sh: Math.round(parseFloat(r.sh) * 10) / 10,
  bh: Math.round(parseFloat(r.bh) * 10) / 10
}));
replaceWeek('weekly-provider-hours.json', schedRows);
const q16Data = readInput('q16.json');
const utilRows = q16Data.filter(r => knownCenters.has(r.c)).map(r => {
  const nh = parseFloat(r.nh) || 0;
  const sh = parseFloat(r.sh) || 0;
  const ur = nh > 0 ? Math.round((sh / nh) * 100 * 100) / 100 : 0;
  return { w: W, c: r.c, ur };
}).filter(r => r.ur > 0);
replaceWeek('weekly-utilization.json', utilRows);

// ── 7. DAILY-METRICS (7-day lookback) ────────────────────────────────────────
const q8Data = readInput('q8.json');
const LOOKBACK_START = q8Data.map(r => r.d).sort()[0];
const dailyCollMap = {};
for (const r of q9Data) {
  if (!dailyCollMap[r.d]) dailyCollMap[r.d] = {};
  if (knownCenters.has(r.c)) dailyCollMap[r.d][r.c] = Math.round(parseFloat(r.co) || 0);
}
const dailyRows = q8Data.filter(r => knownCenters.has(r.c)).map(r => ({
  d: r.d, c: r.c,
  s: fc(r.s), co: (dailyCollMap[r.d] && dailyCollMap[r.d][r.c]) || 0,
  p: fc(r.p), rt: fc(r.rt), inj: fc(r.inj)
}));
// DURABILITY: only touch days within the lookback window so a full-history q8
// pull can't overwrite committed historical daily `inj` (canonical backfill).
const safeDailyRows = dailyRows.filter(r => r.d >= LOOKBACK_START);
const lookbackDates = [...new Set(safeDailyRows.map(r => r.d))];
const existingDaily = readJson('daily-metrics.json');
const withoutLookback = existingDaily.filter(r => !lookbackDates.includes(r.d));
const mergedDaily = [...withoutLookback, ...safeDailyRows];
mergedDaily.sort((a, b) => (a.d || '').localeCompare(b.d || '') || (a.c || '').localeCompare(b.c || ''));
writeJson('daily-metrics.json', mergedDaily);
console.log(`daily-metrics.json: ${existingDaily.filter(r => lookbackDates.includes(r.d)).length} removed (${LOOKBACK_START} lookback), ${dailyRows.length} added -> total=${mergedDaily.length}, latest=${lookbackDates.sort().pop()}`);

// ── 8. WEEKLY-METRICS-PROVIDER ───────────────────────────────────────────────
const q10Data = readInput('q10.json');
const metricsProvRows = q10Data.filter(r => knownCenters.has(r.c) && r.pr != null)
  .map(r => ({ w: W, c: r.c, pr: r.pr, s: fc(r.s), p: fc(r.p), rt: fc(r.rt), inj: fc(r.inj) }));
replaceWeek('weekly-metrics-provider.json', metricsProvRows);

// ── 9. WEEKLY-INJ-REV-PROVIDER ───────────────────────────────────────────────
// Q11 should now emit the trailing 4 weeks of injectable revenue (not just the
// current week) — the SQL filter is `sale_date >= DATE_TRUNC('week',
// CURRENT_DATE - INTERVAL '3 weeks')`. Each row carries its own `w` Monday
// week-anchor, and replaceWeeks below replaces every week present in the
// input. This self-heals partial-week-snapshot bugs from upstream flat_file
// lag (see comment on replaceWeeks for the 2026-04-13 incident).
//
// Backward compatibility: if Q11 still emits only the current week (rows
// missing `w` or all sharing the same `w`), replaceWeeks behaves exactly
// like replaceWeek for that single week.
const q11Data = readInput('q11.json');
const injRevProvRows = q11Data.filter(r => knownCenters.has(r.c) && r.pr != null)
  .map(r => ({ w: r.w || W, c: r.c, pr: r.pr, r: ff(r.r) || 0 }));
// NOTE (2026-06-25): "Inj Revenue" is now the Section-E definition (filler+neuron, sold_by),
// owned by apply-commercial-accuracy.cjs which writes weekly-/daily-inj-rev-provider from
// ACCURATE_INJ_SPLIT at the end of the refresh. We intentionally DON'T write the canonical
// (serviced_by) inj here anymore — doing so would revert the redefinition on any run that
// lacks today's ACCURATE_INJ_SPLIT pull. q11 is retained for reference/back-compat only.
// (was: replaceWeeks('weekly-inj-rev-provider.json', injRevProvRows);)

// ── 10. WEEKLY-REV-COLL-PROVIDER ─────────────────────────────────────────────
const q12Data = readInput('q12.json');
const collProvMap = {};
for (const r of q12Data) {
  if (knownCenters.has(r.c) && r.pr != null) collProvMap[r.c + '|' + r.pr] = ff(r.coll) || 0;
}
const revCollProvRows = metricsProvRows.map(r => ({
  w: W, c: r.c, pr: r.pr, rev: r.s, coll: collProvMap[r.c + '|' + r.pr] || 0
}));
replaceWeek('weekly-rev-coll-provider.json', revCollProvRows);

// ── 11. WEEKLY-SYRINGE-PROVIDER ──────────────────────────────────────────────
const q13Data = readInput('q13.json');
const syrProvRows = q13Data.filter(r => knownCenters.has(r.c) && r.pr != null)
  .map(r => ({ w: W, c: r.c, pr: r.pr, n: fc(r.n), si: ff(r.si), sf: ff(r.sf) }));
replaceWeek('weekly-syringe-provider.json', syrProvRows);

// ── 12. WEEKLY-OPS-PROVIDER ──────────────────────────────────────────────────
const q14Data = readInput('q14.json');
// cn/ns are percentage rates from dataset 754
const opsProvRows = q14Data
  .filter(r => knownCenters.has(r.c) && r.pr != null && r.w === W)
  .map(r => ({ w: W, c: r.c, pr: r.pr, cn: ff(r.cn), ns: ff(r.ns), t: fc(r.t) }));
replaceWeek('weekly-ops-provider.json', opsProvRows);

// ── 13. WEEKLY-UTIL-HOURS-PROVIDER ───────────────────────────────────────────
const q17Data = readInput('q17.json');
const utilProvRows = q17Data.filter(r => knownCenters.has(r.c) && r.pr != null).map(r => {
  const nh = parseFloat(r.nh) || 0;
  const sh = parseFloat(r.sh) || 0;
  const ur = nh > 0 ? Math.round((sh / nh) * 100 * 100) / 100 : 0;
  return { w: W, c: r.c, pr: r.pr, h: ff(r.nh), sh: ff(r.sh), ur };
}).filter(r => r.h > 0);
replaceWeek('weekly-util-hours-provider.json', utilProvRows);

// ── 14. DAILY PROVIDER FILES (spread weekly data across 7 days) ──────────────
// Provider Performance cards use daily-grain files so MTD/QTD/YTD date filters
// resolve to exact calendar boundaries rather than whole-week buckets.
// Each weekly row becomes 7 identical daily rows (Mon–Sun): totals divided by 7,
// rates/averages kept constant.
const WEEK_DAYS = 7;
const wDates = (() => {
  const dates = [];
  const base = new Date(W + 'T00:00:00Z');
  for (let i = 0; i < WEEK_DAYS; i++) {
    const d = new Date(base); d.setUTCDate(d.getUTCDate() + i);
    dates.push(d.toISOString().slice(0, 10));
  }
  return dates;
})();
const wDateSet = new Set(wDates);

function replaceDailyWeek(file, newRows) {
  const existing = readJson(file);
  const merged = [...existing.filter(r => !wDateSet.has(r.d)), ...newRows];
  merged.sort((a, b) =>
    (a.d || '').localeCompare(b.d || '') ||
    (a.c || '').localeCompare(b.c || '') ||
    (a.pr || '').localeCompare(b.pr || '')
  );
  writeJson(file, merged);
  const removed = existing.filter(r => wDateSet.has(r.d)).length;
  console.log(`${file}: ${removed} removed (${W} week), ${newRows.length} added -> total=${merged.length}, latest=${wDates[wDates.length - 1]}`);
}

// daily-inj-rev-provider: owned by apply-commercial-accuracy.cjs (Section-E definition),
// NOT regenerated from canonical q11 here — see note at §9. (was: weekly/7 spread + replaceDailyWeek)

// daily-metrics-provider: s/p/rt/inj are weekly totals → divide by 7
const dailyMetricsProv = [];
for (const r of metricsProvRows) {
  for (const d of wDates)
    dailyMetricsProv.push({ d, c: r.c, pr: r.pr,
      s:   Math.round((r.s   / WEEK_DAYS) * 100) / 100,
      p:   Math.round((r.p   / WEEK_DAYS) * 10000) / 10000,
      rt:  Math.round((r.rt  / WEEK_DAYS) * 100) / 100,
      inj: Math.round((r.inj / WEEK_DAYS) * 100) / 100,
    });
}
replaceDailyWeek('daily-metrics-provider.json', dailyMetricsProv);

// daily-btx-provider: n/total_qty are weekly totals → divide by 7; b is rate → keep
const dailyBtxProv = [];
for (const r of btxProvRows) {
  for (const d of wDates)
    dailyBtxProv.push({ d, c: r.c, pr: r.pr,
      n:         Math.round(((r.n         || 0) / WEEK_DAYS) * 10000) / 10000,
      b:         r.b,
      total_qty: Math.round(((r.total_qty || 0) / WEEK_DAYS) * 10000) / 10000,
    });
}
replaceDailyWeek('daily-btx-provider.json', dailyBtxProv);

// daily-rev-coll-provider: rev/coll are weekly totals → divide by 7
const dailyRevCollProv = [];
for (const r of revCollProvRows) {
  for (const d of wDates)
    dailyRevCollProv.push({ d, c: r.c, pr: r.pr,
      rev:  Math.round((r.rev  / WEEK_DAYS) * 100) / 100,
      coll: Math.round((r.coll / WEEK_DAYS) * 100) / 100,
    });
}
replaceDailyWeek('daily-rev-coll-provider.json', dailyRevCollProv);

// daily-syringe-provider: n is weekly total → divide by 7; si/sf are rates → keep
const dailySyrProv = [];
for (const r of syrProvRows) {
  for (const d of wDates)
    dailySyrProv.push({ d, c: r.c, pr: r.pr,
      n:  Math.round(((r.n || 0) / WEEK_DAYS) * 10000) / 10000,
      si: r.si,
      sf: r.sf,
    });
}
replaceDailyWeek('daily-syringe-provider.json', dailySyrProv);

// ── Metric exclusions (fees / consult / GFE / vitamin) + botox <10u feeds ──
// Re-applies on top of the feeds written above so the exclusions survive every
// refresh. Inputs are optional (see scripts/SYNC-EXCLUSIONS.md); missing inputs are
// skipped and the app falls back to raw values, so this can never break the refresh.
try {
  require('./apply-exclusions.cjs').run();
} catch (e) {
  console.warn('apply-exclusions skipped due to error:', e.message);
}

// ── Section E (Provider Productivity) — rebuild commercial feeds every refresh ──
// Section E was historically NOT part of this refresh (built by a separate manual
// bootstrap off the commercial-kd board), so it went stale while Sections A–D updated.
// It is now fully Corral-driven: assemble-commercial-cache builds the DEMO_* cache from
// the daily Corral pulls (CORE/MS/BRAND/REVHOUR ×monthly,weekly + DEMO_DAILY_UNITS), then
// build-commercial -> the feeds, then apply-commercial-accuracy re-applies the agreed
// filler+neuro (sold_by) definition so Section C "Inj Revenue" == Section E "Total
// Injectables Sales". Refresh those .commercial-cache pulls daily — see SYNC-COMMERCIAL.md;
// build-commercial warns loudly if the cache is stale. Each step is best-effort (try/catch)
// so a missing commercial pull never blocks the Sections A–D refresh.
// DURABILITY GUARD: only rebuild Section E when TODAY's commercial pull is present.
// If the operator didn't pull the .commercial-cache inputs this run, we must NOT rebuild
// from a stale/old cache (that would REVERT the committed, correct Section E + Inj Revenue
// to old/stale values). Instead we skip the whole commercial block and leave the committed
// feeds exactly as deployed. CORE_MONTHLY.json is the sentinel (fresh = mtime today).
const COMM_CACHE = path.join(__dirname, '.commercial-cache');
function freshToday(f) {
  try { const m = fs.statSync(path.join(COMM_CACHE, f)).mtime; return m.toISOString().slice(0, 10) === new Date().toISOString().slice(0, 10); }
  catch { return false; }
}
if (freshToday('CORE_MONTHLY.json')) {
  try { require('./assemble-commercial-cache.cjs').run(); } catch (e) { console.warn('assemble-commercial-cache skipped due to error:', e.message); }
  try { require('./build-commercial.cjs').run(); } catch (e) { console.warn('build-commercial skipped due to error:', e.message); }
  try { require('./apply-commercial-accuracy.cjs').run(); } catch (e) { console.warn('apply-commercial-accuracy skipped due to error:', e.message); }
} else {
  console.warn('\n⚠️  SECTION E NOT REBUILT — no fresh commercial pull today (.commercial-cache/CORE_MONTHLY.json).');
  console.warn('   Committed Section E + Inj Revenue feeds left AS-IS (not reverted). To refresh Section E,');
  console.warn('   pull the commercial inputs per scripts/SYNC-COMMERCIAL.md, then re-run this refresh.');
}

console.log('\n=== Done ===');
