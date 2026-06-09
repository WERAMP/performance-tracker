// PREVIEW — add fee-excluded twins sx (revenue minus no-show/cancellation fees)
// and px (patients minus fee-only guests) to weekly-metrics.json and
// weekly-metrics-provider.json. Used ONLY by the Avg Revenue per Patient metric.
// Restore: git checkout public/data/performance/weekly-metrics.json public/data/performance/weekly-metrics-provider.json
const fs = require('fs');
const path = require('path');
const BASE = path.join(__dirname, '..', 'public', 'data', 'performance');
const DIST = path.join(__dirname, '..', 'dist', 'data', 'performance');
const ALIAS = { 'Ever/Body-Greenwich Village': 'Ever/Body-Greenwich' };

const DIR = process.argv[2];
const idPath = id => path.join(DIR, 'mcp-7a02645f-6293-41ff-9b4a-6820d7e65c94-execute_sql-' + id + '.txt');
const centerWeekFiles = process.argv[3].split(',').map(idPath);
const provWeekFiles   = process.argv[4].split(',').map(idPath);

function loadFee(files, keyFn) {
  const m = {};
  for (const f of files) {
    const rows = JSON.parse(fs.readFileSync(f, 'utf8')).data;
    for (const r of rows) {
      const c = ALIAS[r.c] || r.c;
      const k = keyFn(c, r);
      if (!m[k]) m[k] = { feeRev: 0, feeOnlyPt: 0 };
      m[k].feeRev += Number(r.fee_rev) || 0;
      m[k].feeOnlyPt += Number(r.fee_only_pt) || 0;
    }
  }
  return m;
}
const cwFee = loadFee(centerWeekFiles, (c, r) => c + '|' + r.w);
const cpwFee = loadFee(provWeekFiles, (c, r) => c + '|' + r.pr + '|' + r.w);

function addTwins(file, keyFn, feeMap) {
  const p = path.join(BASE, file);
  const data = JSON.parse(fs.readFileSync(p, 'utf8'));
  let touched = 0;
  for (const r of data) {
    const adj = feeMap[keyFn(r)] || { feeRev: 0, feeOnlyPt: 0 };
    const s = Number(r.s) || 0, pt = Number(r.p) || 0;
    r.sx = Math.max(0, Math.round((s - adj.feeRev) * 100) / 100);
    r.px = Math.max(0, pt - adj.feeOnlyPt);
    if (adj.feeRev || adj.feeOnlyPt) touched++;
  }
  const str = JSON.stringify(data);
  fs.writeFileSync(p, str);
  if (fs.existsSync(DIST)) fs.writeFileSync(path.join(DIST, file), str);
  console.log(file + ': rows=' + data.length + ' fee-adjusted=' + touched);
}

addTwins('weekly-metrics.json', r => r.c + '|' + r.w, cwFee);
addTwins('weekly-metrics-provider.json', r => r.c + '|' + r.pr + '|' + r.w, cpwFee);

// Monday (week anchor) for a YYYY-MM-DD date, UTC-safe
function mondayOf(d) {
  const dt = new Date(d + 'T00:00:00Z');
  const off = (dt.getUTCDay() + 6) % 7; // 0=Mon
  return new Date(dt.getTime() - off * 86400000).toISOString().slice(0, 10);
}
// Add daily twins by spreading the week's fee adjustment across its 7 days.
function addDailyTwins(file, keyFn, feeMap, specs) {
  const p = path.join(BASE, file);
  if (!fs.existsSync(p)) { console.log(file + ': MISSING, skipped'); return; }
  const data = JSON.parse(fs.readFileSync(p, 'utf8'));
  let touched = 0;
  for (const r of data) {
    const adj = feeMap[keyFn(r)] || { feeRev: 0, feeOnlyPt: 0 };
    if (adj.feeRev || adj.feeOnlyPt) touched++;
    for (const sp of specs) {
      const base = Number(r[sp.src]) || 0;
      const sub = (sp.kind === 'rev' ? adj.feeRev : adj.feeOnlyPt) / 7;
      r[sp.dst] = Math.max(0, Math.round((base - sub) * 10000) / 10000);
    }
  }
  const str = JSON.stringify(data);
  fs.writeFileSync(p, str);
  if (fs.existsSync(DIST)) fs.writeFileSync(path.join(DIST, file), str);
  console.log(file + ': rows=' + data.length + ' fee-adjusted=' + touched);
}

const cwKeyD = r => (ALIAS[r.c] || r.c) + '|' + mondayOf(r.d);
const cpwKeyD = r => (ALIAS[r.c] || r.c) + '|' + r.pr + '|' + mondayOf(r.d);
addDailyTwins('daily-metrics.json', cwKeyD, cwFee, [{ src: 's', dst: 'sx', kind: 'rev' }, { src: 'p', dst: 'px', kind: 'pt' }]);
addDailyTwins('daily-metrics-provider.json', cpwKeyD, cpwFee, [{ src: 's', dst: 'sx', kind: 'rev' }, { src: 'p', dst: 'px', kind: 'pt' }]);
addDailyTwins('daily-rev-coll-provider.json', cpwKeyD, cpwFee, [{ src: 'rev', dst: 'revx', kind: 'rev' }]);

// spot check
const wm = JSON.parse(fs.readFileSync(path.join(BASE, 'weekly-metrics.json'), 'utf8'));
const r = wm.find(x => x.c === 'Back to 30 - Boiling Springs' && x.w === '2026-05-18');
console.log('\nBoiling Springs 2026-05-18:', JSON.stringify(r));
console.log('  rev/pt before:', (r.s / r.p).toFixed(2), ' after:', (r.sx / r.px).toFixed(2));
