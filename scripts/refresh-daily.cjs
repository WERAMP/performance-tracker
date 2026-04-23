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
//   q12.json — Q12 collections by provider (use_dataset(1237) NOT flat_file)
//   q13.json — Q13 syringe by provider
//   q14.json — Q14 ops by provider
//   q16.json — Q16 location-level service hours + net scheduled hours (utilization)
//   q17.json — Q17 provider-level service hours + net scheduled hours (utilization)
//
// NOTE: No q2.json — weekly co is derived from q9 daily data for accuracy.

const fs = require('fs');
const path = require('path');

const BASE = path.join(__dirname, '..', 'public', 'data', 'performance');
const DIST = path.join(__dirname, '..', 'dist', 'data', 'performance');

function readInput(f) {
  const p = path.join(__dirname, f);
  if (!fs.existsSync(p)) throw new Error(`Missing input file: ${f} — run all SQL queries first`);
  // Strip UTF-8 BOM if present (e.g. files saved by PowerShell Set-Content)
  return JSON.parse(fs.readFileSync(p, 'utf8').replace(/^\uFEFF/, ''));
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
  const merged = [...existing.filter(r => r.w !== W), ...newRows];
  merged.sort((a, b) =>
    (a.w || '').localeCompare(b.w || '') ||
    (a.c || '').localeCompare(b.c || '') ||
    (a.pr || '').localeCompare(b.pr || '')
  );
  writeJson(file, merged);
  const weeks = [...new Set(merged.map(r => r.w))].sort();
  console.log(`${file}: ${existing.filter(r => r.w === W).length} removed, ${newRows.length} added -> total=${merged.length}, latest=${weeks[weeks.length - 1]}`);
}

// ── Determine W from q1 data (falls back to q3 on early Monday when no sales yet) ──
const q1Data = readInput('q1.json');
const _q3Early = readInput('q3.json');
const W = q1Data.length > 0 ? q1Data[0].w : _q3Early[0].w;
console.log(`W = ${W} (derived from ${q1Data.length > 0 ? 'q1' : 'q3 — early Monday, no sales yet'})`);

const locations = JSON.parse(fs.readFileSync(path.join(BASE, 'locations.json'), 'utf8'));
const knownCenters = new Set(locations.map(l => l.name));

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
const lookbackDates = [...new Set(dailyRows.map(r => r.d))];
const existingDaily = readJson('daily-metrics.json');
const withoutLookback = existingDaily.filter(r => !lookbackDates.includes(r.d));
const mergedDaily = [...withoutLookback, ...dailyRows];
mergedDaily.sort((a, b) => (a.d || '').localeCompare(b.d || '') || (a.c || '').localeCompare(b.c || ''));
writeJson('daily-metrics.json', mergedDaily);
console.log(`daily-metrics.json: ${existingDaily.filter(r => lookbackDates.includes(r.d)).length} removed (${LOOKBACK_START} lookback), ${dailyRows.length} added -> total=${mergedDaily.length}, latest=${lookbackDates.sort().pop()}`);

// ── 8. WEEKLY-METRICS-PROVIDER ───────────────────────────────────────────────
const q10Data = readInput('q10.json');
const metricsProvRows = q10Data.filter(r => knownCenters.has(r.c) && r.pr != null)
  .map(r => ({ w: W, c: r.c, pr: r.pr, s: fc(r.s), p: fc(r.p), rt: fc(r.rt), inj: fc(r.inj) }));
replaceWeek('weekly-metrics-provider.json', metricsProvRows);

// ── 9. WEEKLY-INJ-REV-PROVIDER ───────────────────────────────────────────────
const q11Data = readInput('q11.json');
const injRevProvRows = q11Data.filter(r => knownCenters.has(r.c) && r.pr != null)
  .map(r => ({ w: W, c: r.c, pr: r.pr, r: ff(r.r) || 0 }));
replaceWeek('weekly-inj-rev-provider.json', injRevProvRows);

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

console.log('\n=== Done ===');
