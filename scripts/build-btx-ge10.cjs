// PREVIEW — rebuild weekly-btx-provider.json + weekly-btx.json from Corral,
// excluding botox appointments with < 10 units (all weeks, provider + location).
// Restore with: git checkout public/data/performance/weekly-btx.json public/data/performance/weekly-btx-provider.json
const fs = require('fs');
const path = require('path');

const files = process.argv.slice(2);
const BASE = path.join(__dirname, '..', 'public', 'data', 'performance');
const DIST = path.join(__dirname, '..', 'dist', 'data', 'performance');
const ALIAS = { 'Ever/Body-Greenwich Village': 'Ever/Body-Greenwich' };

// gather provider rows, merging aliases
const provMap = {};  // c|pr|w -> {n,total_qty}
let raw = 0;
for (const f of files) {
  const rows = JSON.parse(fs.readFileSync(f, 'utf8')).data;
  for (const r of rows) {
    raw++;
    const c = ALIAS[r.center_name || r.c] || (r.c || r.center_name);
    const k = c + '|' + r.pr + '|' + r.w;
    if (!provMap[k]) provMap[k] = { c, pr: r.pr, w: r.w, n: 0, total_qty: 0 };
    provMap[k].n += Number(r.n) || 0;
    provMap[k].total_qty += Number(r.total_qty) || 0;
  }
}

const provRows = Object.values(provMap).map(v => ({
  w: v.w, c: v.c, pr: v.pr,
  b: v.n > 0 ? Math.round((v.total_qty / v.n) * 100) / 100 : null,
  n: v.n,
  total_qty: Math.round(v.total_qty * 100) / 100,
})).sort((a, b) =>
  (a.w || '').localeCompare(b.w || '') || (a.c || '').localeCompare(b.c || '') || (a.pr || '').localeCompare(b.pr || ''));

// derive location rows
const locMap = {};
for (const r of provRows) {
  const k = r.c + '|' + r.w;
  if (!locMap[k]) locMap[k] = { w: r.w, c: r.c, sumQty: 0, sumN: 0 };
  locMap[k].sumQty += r.total_qty || 0;
  locMap[k].sumN += r.n || 0;
}
const locRows = Object.values(locMap).map(v => ({
  w: v.w, c: v.c,
  b: v.sumN > 0 ? Math.round((v.sumQty / v.sumN) * 100) / 100 : null,
  total_qty: Math.round(v.sumQty * 100) / 100,
})).sort((a, b) =>
  (a.w || '').localeCompare(b.w || '') || (a.c || '').localeCompare(b.c || ''));

// daily-btx-provider: expand each weekly provider row across its 7 days (n,total_qty /7; b kept)
function weekDays(w) {
  const out = [];
  const base = new Date(w + 'T00:00:00Z');
  for (let i = 0; i < 7; i++) {
    const d = new Date(base.getTime() + i * 86400000);
    out.push(d.toISOString().slice(0, 10));
  }
  return out;
}
const dailyRows = [];
for (const r of provRows) {
  for (const d of weekDays(r.w)) {
    dailyRows.push({
      d, c: r.c, pr: r.pr,
      n: Math.round(((r.n || 0) / 7) * 10000) / 10000,
      b: r.b,
      total_qty: Math.round(((r.total_qty || 0) / 7) * 10000) / 10000,
    });
  }
}
dailyRows.sort((a, b) =>
  (a.d || '').localeCompare(b.d || '') || (a.c || '').localeCompare(b.c || '') || (a.pr || '').localeCompare(b.pr || ''));

function write(file, data) {
  const s = JSON.stringify(data);
  fs.writeFileSync(path.join(BASE, file), s);
  if (fs.existsSync(DIST)) fs.writeFileSync(path.join(DIST, file), s);
}
write('weekly-btx-provider-ge10.json', provRows);
write('weekly-btx-ge10.json', locRows);
write('daily-btx-provider-ge10.json', dailyRows);
console.log('daily-btx-provider-ge10 rows written:', dailyRows.length);

console.log('raw provider rows read:', raw);
console.log('provider rows written:', provRows.length, ' location rows written:', locRows.length);
console.log('weeks:', [...new Set(locRows.map(r => r.w))].sort()[0], '->', [...new Set(locRows.map(r => r.w))].sort().slice(-1)[0]);

// optional before/after vs the live (git) weekly-btx.json, if available
try {
  const orig = JSON.parse(require('child_process')
    .execSync('git show HEAD:public/data/performance/weekly-btx.json', { cwd: path.join(__dirname, '..'), maxBuffer: 1e8 }).toString());
  console.log('\nBack to 30 - Boiling Springs  (live b -> filtered b):');
  ['2026-04-27','2026-05-04','2026-05-11','2026-05-18','2026-05-25','2026-06-01'].forEach(w => {
    const o = orig.find(x => x.c === 'Back to 30 - Boiling Springs' && x.w === w);
    const n = locRows.find(x => x.c === 'Back to 30 - Boiling Springs' && x.w === w);
    console.log(`  ${w}  ${o ? o.b : '?'}  ->  ${n ? n.b : '(none)'}`);
  });
} catch (e) { /* diagnostic only */ }
