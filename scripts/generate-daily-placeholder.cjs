// Generate daily-grain placeholder files from existing weekly data.
//
// Each weekly row (w = Monday) is split into 7 daily rows (Mon..Sun),
// distributing totals evenly across the 7 days and keeping per-row
// rates constant. This is a LOCALHOST PREVIEW shim so the new daily
// filter logic can be verified end-to-end without waiting on the
// upstream SQL rewrite. Real production data must come from a
// daily-grain query against Corral.

const fs = require('fs');
const path = require('path');

const DATA_DIR = path.join(__dirname, '..', 'public', 'data', 'performance');

function addDays(isoDate, n) {
  const d = new Date(isoDate + 'T00:00:00Z');
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

// Split a weekly row into 7 daily rows.
// `divKeys` are fields whose values get divided by 7 (totals).
// `keepKeys` are fields whose values stay constant across days (rates).
function splitWeekly(rows, divKeys, keepKeys, extraKeys = {}) {
  const out = [];
  for (const r of rows) {
    for (let i = 0; i < 7; i++) {
      const day = { d: addDays(r.w, i), c: r.c, pr: r.pr };
      for (const k of divKeys) {
        const v = Number(r[k]) || 0;
        day[k] = v / 7;
      }
      for (const k of keepKeys) {
        if (r[k] != null) day[k] = r[k];
      }
      for (const [k, fn] of Object.entries(extraKeys)) {
        day[k] = fn(r) / 7;
      }
      out.push(day);
    }
  }
  return out;
}

function readJSON(name) {
  return JSON.parse(fs.readFileSync(path.join(DATA_DIR, name), 'utf8'));
}

function writeJSON(name, data) {
  fs.writeFileSync(path.join(DATA_DIR, name), JSON.stringify(data));
  console.log('  wrote', name, '— rows:', data.length, '(' + (fs.statSync(path.join(DATA_DIR, name)).size / 1024).toFixed(0) + ' KB)');
}

console.log('Generating daily placeholder files from weekly data...');

// 1. Inj revenue: { w, c, pr, r } -> { d, c, pr, r }
{
  const w = readJSON('weekly-inj-rev-provider.json');
  const d = splitWeekly(w, ['r'], []);
  writeJSON('daily-inj-rev-provider.json', d);
}

// 2. Rev/coll: { w, c, pr, rev, coll } -> { d, c, pr, rev, coll }
{
  const w = readJSON('weekly-rev-coll-provider.json');
  const d = splitWeekly(w, ['rev', 'coll'], []);
  writeJSON('daily-rev-coll-provider.json', d);
}

// 3. Metrics provider: { w, c, pr, s, p, rt, inj } -> daily
{
  const w = readJSON('weekly-metrics-provider.json');
  const d = splitWeekly(w, ['s', 'p', 'rt', 'inj'], []);
  writeJSON('daily-metrics-provider.json', d);
}

// 4. BTX provider: { w, c, pr, b, n } -> daily
//    `b` is units-per-invoice (rate, kept constant);
//    `n` is invoice count (split / 7);
//    `total_qty = b * n` synthesized so the JSX code path that reads
//    r.total_qty works unchanged.
{
  const w = readJSON('weekly-btx-provider.json');
  const d = splitWeekly(w, ['n'], ['b'], { total_qty: r => (Number(r.b) || 0) * (Number(r.n) || 0) });
  writeJSON('daily-btx-provider.json', d);
}

// 5. Syringe provider: { w, c, pr, si, sf, n } -> daily
//    si/sf are per-appointment averages (kept constant);
//    n is invoice count (split / 7).
{
  const w = readJSON('weekly-syringe-provider.json');
  const d = splitWeekly(w, ['n'], ['si', 'sf']);
  writeJSON('daily-syringe-provider.json', d);
}

console.log('Done. These are PLACEHOLDER files for localhost preview only.');
console.log('For production, replace with daily-grain query output from Corral.');
