// PREVIEW — subtract Consultation-only / Wellness-only appointment groups from
// weekly-ops-provider cancellation/no-show (delta on deployed cn/ns/t).
// Restore: git checkout public/data/performance/weekly-ops-provider.json
const fs = require('fs');
const path = require('path');
const BASE = path.join(__dirname, '..', 'public', 'data', 'performance');
const ALIAS = { 'Ever/Body-Greenwich Village': 'Ever/Body-Greenwich' };
const DIR = process.argv[2];
const ids = process.argv[3].split(',');
const idPath = id => path.join(DIR, 'mcp-7a02645f-6293-41ff-9b4a-6820d7e65c94-execute_sql-' + id + '.txt');

const excl = {};
for (const id of ids) {
  for (const r of JSON.parse(fs.readFileSync(idPath(id), 'utf8')).data) {
    const c = ALIAS[r.c] || r.c;
    const k = c + '|' + r.pr + '|' + r.w;
    if (!excl[k]) excl[k] = { t:0, can:0, ns:0 };
    excl[k].t += Number(r.excl_t) || 0;
    excl[k].can += Number(r.excl_can) || 0;
    excl[k].ns += Number(r.excl_ns) || 0;
  }
}
const r1 = v => Math.round(v * 10) / 10;
const file = path.join(BASE, 'weekly-ops-provider.json');
const data = JSON.parse(fs.readFileSync(file, 'utf8'));
let updated = 0;
for (const row of data) {
  const e = excl[row.c + '|' + row.pr + '|' + row.w];
  if (!e) continue;
  const t = Number(row.t) || 0;
  const cancelled = Math.round((Number(row.cn) || 0) / 100 * t);
  const noshow = Math.round((Number(row.ns) || 0) / 100 * t);
  const nt = Math.max(0, t - e.t);
  const nc = Math.max(0, cancelled - e.can);
  const nn = Math.max(0, noshow - e.ns);
  row.t = nt;
  row.cn = nt > 0 ? r1(nc / nt * 100) : 0;
  row.ns = nt > 0 ? r1(nn / nt * 100) : 0;
  updated++;
}
const str = JSON.stringify(data);
fs.writeFileSync(file, str);
const dist = path.join(__dirname, '..', 'dist', 'data', 'performance', 'weekly-ops-provider.json');
if (fs.existsSync(dist)) fs.writeFileSync(dist, str);
console.log('weekly-ops-provider rows updated:', updated, ' of', data.length);
const s = data.filter(r => r.c === 'Back to 30 - Boiling Springs' && r.w === '2026-05-25');
console.log('Boiling 5/25 providers:', JSON.stringify(s));
