'use strict';
// apply-commercial-accuracy.cjs — runs at the END of the daily refresh, AFTER build-commercial.
//
// Makes the injectable-revenue figures accurate AND keeps Section C ("Inj Revenue" provider
// card) == Section E ("Total Injectables Sales") on the agreed definition:
//   Neuromodulators + Dermal Filler + Biostimulator Filler, sold_by, sales_exc_tax,
//   excluding cancel/no-show/numbing/lidocaine.
//
// It rebuilds, for the window covered by the daily pull:
//   • daily-/weekly-inj-rev-provider.json   (Section C "Inj Revenue")
//   • filler_sales + neuro_rev on commercial-monthly/weekly.json (Section E), adding rows for
//     providers the commercial-kd pipeline misses entirely (e.g. New Radiance).
//
// Input (refresh daily as part of the Corral pull — see SYNC-COMMERCIAL.md):
//   scripts/.commercial-cache/ACCURATE_INJ_SPLIT.json
//     { "data": [ { "d":"YYYY-MM-DD", "c":center, "pr":sold_by, "neuro":num, "filler":num }, ... ] }
//   i.e. per (center, sold_by, day): neuro = SUM(sales_exc_tax) Neuromodulators,
//        filler = SUM(sales_exc_tax) Dermal+Biostimulator Filler (same exclusions), all sold_by.
//
// If the input is absent the step no-ops (the refresh never breaks).
const fs = require('fs'), path = require('path');
const SD = __dirname;
const PERF = path.join(SD, '..', 'public', 'data', 'performance');
const COMM = path.join(SD, '..', 'public', 'data', 'commercial');
const DIST = path.join(SD, '..', 'dist', 'data');
const SPLIT = path.join(SD, '.commercial-cache', 'ACCURATE_INJ_SPLIT.json');
// CorralData center alias — keep in sync with refresh-daily.cjs CENTER_ALIASES.
const CENTER_MAP = { 'Ever/Body-Greenwich Village': 'Ever/Body-Greenwich' };

const r2 = n => Math.round(n * 100) / 100;
const monday = s => { const dt = new Date(s + 'T00:00:00Z'); const k = (dt.getUTCDay() + 6) % 7; dt.setUTCDate(dt.getUTCDate() - k); return dt.toISOString().slice(0, 10); };
const monthStart = s => s.slice(0, 7) + '-01';
const nextMonthStart = s => { const d = new Date(s + 'T00:00:00Z'); d.setUTCMonth(d.getUTCMonth() + 1, 1); return d.toISOString().slice(0, 10); };
function writePair(dir, sub, file, data) {
  const s = JSON.stringify(data);
  fs.writeFileSync(path.join(dir, file), s);
  const dd = path.join(DIST, sub); if (fs.existsSync(dd)) fs.writeFileSync(path.join(dd, file), s);
}

function run() {
  if (!fs.existsSync(SPLIT)) { console.warn('apply-commercial-accuracy: no ACCURATE_INJ_SPLIT.json — skipped (Section C/E injectables left as built).'); return; }
  const split = JSON.parse(fs.readFileSync(SPLIT, 'utf8')).data
    .map(r => ({ d: String(r.d).slice(0, 10), c: CENTER_MAP[r.c] || r.c, pr: r.pr, neuro: +r.neuro || 0, filler: +r.filler || 0 }));
  if (!split.length) { console.warn('apply-commercial-accuracy: ACCURATE_INJ_SPLIT empty — skipped.'); return; }

  const dates = split.map(r => r.d).sort();
  const dMin = dates[0], dMax = dates[dates.length - 1];
  // periods fully (or current-MTD) covered:
  const firstFullMonth = (dMin.slice(8) === '01') ? monthStart(dMin) : nextMonthStart(dMin); // overwrite months whose start >= this
  const firstFullWeek = monday(dMin) === dMin ? dMin : (() => { const d = new Date(dMin + 'T00:00:00Z'); d.setUTCDate(d.getUTCDate() + (8 - ((d.getUTCDay() + 6) % 7 + 1))); return monday(d.toISOString().slice(0, 10)); })();
  const lastWeek = monday(dMax);
  const weekFull = w => w >= firstFullWeek && (() => { const e = new Date(w + 'T00:00:00Z'); e.setUTCDate(e.getUTCDate() + 6); return e.toISOString().slice(0, 10) <= dMax; })();

  // accurate aggregates from the split
  const dInj = new Map();   // d|c|pr -> r        (Section C daily)
  const wInj = new Map();   // w|c|pr -> r        (Section C weekly, full weeks)
  const mE = new Map();     // c|pr|monthStart -> {neuro,filler}   (Section E monthly)
  const wE = new Map();     // c|pr|weekMon   -> {neuro,filler}    (Section E weekly)
  for (const x of split) {
    const r = x.neuro + x.filler;
    dInj.set(x.d + '|' + x.c + '|' + x.pr, r2((dInj.get(x.d + '|' + x.c + '|' + x.pr) || 0) + r));
    const w = monday(x.d);
    if (weekFull(w)) { const k = w + '|' + x.c + '|' + x.pr; wInj.set(k, r2((wInj.get(k) || 0) + r)); }
    const ms = monthStart(x.d);
    if (ms >= firstFullMonth) { const k = x.c + '|' + x.pr + '|' + ms; const a = mE.get(k) || { neuro: 0, filler: 0 }; a.neuro += x.neuro; a.filler += x.filler; mE.set(k, a); }
    if (weekFull(w)) { const k = x.c + '|' + x.pr + '|' + w; const a = wE.get(k) || { neuro: 0, filler: 0 }; a.neuro += x.neuro; a.filler += x.filler; wE.set(k, a); }
  }

  // ---- Section C: rebuild inj-rev-provider feeds from the split ----
  const centers = new Set(split.map(r => r.c));
  function rebuildInj(file, periodKey, agg, inWin) {
    const data = JSON.parse(fs.readFileSync(path.join(PERF, file), 'utf8'));
    const kept = data.filter(r => !(centers.has(r.c) && inWin(r[periodKey])));
    let n = 0;
    for (const [k, r] of agg) { const [p, c, pr] = k.split('|'); if (r2(r) === 0) continue; kept.push({ [periodKey]: p, c, pr, r: r2(r) }); n++; }
    kept.sort((a, b) => (a[periodKey] || '').localeCompare(b[periodKey] || '') || (a.c || '').localeCompare(b.c || '') || (a.pr || '').localeCompare(b.pr || ''));
    writePair(PERF, 'performance', file, kept); console.log(`  ${file}: ${n} rows rebuilt (${dMin}..${dMax})`);
  }
  rebuildInj('daily-inj-rev-provider.json', 'd', dInj, d => d >= dMin && d <= dMax);
  rebuildInj('weekly-inj-rev-provider.json', 'w', wInj, w => w >= firstFullWeek && w <= lastWeek);

  // ---- Section E: overwrite filler_sales + neuro_rev on commercial feeds; add missing rows ----
  function patchCommercial(file, agg, periodOk) {
    const data = JSON.parse(fs.readFileSync(path.join(COMM, file), 'utf8'));
    const practiceByCenter = {}; for (const r of data) if (r.practice && !practiceByCenter[r.c]) practiceByCenter[r.c] = r.practice;
    const idx = new Map(); for (const r of data) idx.set(r.c + '|' + r.pr + '|' + r.p, r);
    let over = 0, added = 0, zeroed = 0;
    for (const [key, v] of agg) {
      const [c, pr, p] = key.split('|'); if (!periodOk(p)) continue;
      if (r2(v.neuro) === 0 && r2(v.filler) === 0) continue;
      const ex = idx.get(key);
      if (ex) { ex.neuro_rev = r2(v.neuro); ex.filler_sales = r2(v.filler); over++; }
      else { data.push({ p, c, pr, practice: practiceByCenter[c] || '', filler_syr: 0, inj_visits: 0, filler_sales: r2(v.filler), total_inj: r2(v.neuro + v.filler), neuro_rev: r2(v.neuro), a3: 0, a4: 0, a5: 0, trend_sales: 0, trend_visits: 0, botox_units: 0, brands: {}, eg10: 0, vg10: 0 }); added++; }
    }
    for (const r of data) { if (!periodOk(r.p)) continue; if (!agg.has(r.c + '|' + r.pr + '|' + r.p) && ((+r.neuro_rev || 0) !== 0 || (+r.filler_sales || 0) !== 0)) { r.neuro_rev = 0; r.filler_sales = 0; zeroed++; } }
    data.sort((a, b) => (a.p || '').localeCompare(b.p || '') || (a.c || '').localeCompare(b.c || '') || (a.pr || '').localeCompare(b.pr || ''));
    writePair(COMM, 'commercial', file, data); console.log(`  ${file}: ${over} overwritten, ${added} added, ${zeroed} zeroed`);
  }
  patchCommercial('commercial-monthly.json', mE, p => p >= firstFullMonth);
  patchCommercial('commercial-weekly.json', wE, w => weekFull(w));
  console.log('apply-commercial-accuracy: done.');
}
module.exports = { run };
if (require.main === module) run();
