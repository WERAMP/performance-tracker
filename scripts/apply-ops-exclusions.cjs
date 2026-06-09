// PREVIEW — recompute weekly-ops cancellation/no-show (cn, ns, t) EXCLUDING
// Consultation-only and Wellness-only appointment groups (dataset 754).
// Restore: git checkout public/data/performance/weekly-ops.json
const fs = require('fs');
const path = require('path');
const BASE = path.join(__dirname, '..', 'public', 'data', 'performance');
const DIST = path.join(__dirname, '..', 'data', 'performance'); // dist handled below
const ALIAS = { 'Ever/Body-Greenwich Village': 'Ever/Body-Greenwich' };
const DIR = process.argv[2];
const ids = process.argv[3].split(',');
const idPath = id => path.join(DIR, 'mcp-7a02645f-6293-41ff-9b4a-6820d7e65c94-execute_sql-' + id + '.txt');

const cw = {};
for (const id of ids) {
  for (const r of JSON.parse(fs.readFileSync(idPath(id), 'utf8')).data) {
    const c = ALIAS[r.c] || r.c;
    const k = c + '|' + r.w;
    if (!cw[k]) cw[k] = { t_all:0,can_all:0,ns_all:0,t_keep:0,can_keep:0,ns_keep:0 };
    for (const f of Object.keys(cw[k])) cw[k][f] += Number(r[f]) || 0;
  }
}
const r1 = v => Math.round(v * 10) / 10;

const file = path.join(BASE, 'weekly-ops.json');
const data = JSON.parse(fs.readFileSync(file, 'utf8'));
let mism = 0, updated = 0;
for (const row of data) {
  const a = cw[row.c + '|' + row.w];
  if (!a) continue;
  // validate baseline (all groups) reproduces deployed cn/ns/t
  const cnAll = a.t_all > 0 ? r1(a.can_all / a.t_all * 100) : 0;
  const nsAll = a.t_all > 0 ? r1(a.ns_all / a.t_all * 100) : 0;
  if (Math.abs((row.cn||0)-cnAll) > 0.15 || Math.abs((row.ns||0)-nsAll) > 0.15 || (row.t||0)!==a.t_all) mism++;
  // write excluded version
  row.t = a.t_keep;
  row.cn = a.t_keep > 0 ? r1(a.can_keep / a.t_keep * 100) : 0;
  row.ns = a.t_keep > 0 ? r1(a.ns_keep / a.t_keep * 100) : 0;
  updated++;
}
const str = JSON.stringify(data);
fs.writeFileSync(file, str);
const dist = path.join(__dirname, '..', 'dist', 'data', 'performance', 'weekly-ops.json');
if (fs.existsSync(dist)) fs.writeFileSync(dist, str);
console.log('weekly-ops rows updated:', updated, ' baseline mismatches vs deployed:', mism);

// before/after Boiling Springs
const orig = JSON.parse(require('child_process').execSync('git show HEAD:public/data/performance/weekly-ops.json', {cwd: path.join(__dirname,'..'), maxBuffer: 1e8}).toString());
['2026-04-27','2026-05-04','2026-05-11','2026-05-18','2026-05-25'].forEach(w => {
  const o = orig.find(x=>x.c==='Back to 30 - Boiling Springs'&&x.w===w);
  const n = data.find(x=>x.c==='Back to 30 - Boiling Springs'&&x.w===w);
  if(o&&n) console.log(`  ${w}: t ${o.t}->${n.t}  cn ${o.cn}->${n.cn}  ns ${o.ns}->${n.ns}`);
});
