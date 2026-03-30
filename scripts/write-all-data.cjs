const fs = require('fs');
const base = 'C:/Users/kdwyer/.claude/projects/C--Users-kdwyer-Documents-claude-amp-pms--claude-worktrees-jolly-colden/314d8cd1-feab-4c73-b8d8-6bac7252a554/tool-results';
const dir = 'public/data/performance';

function load(ts) { return JSON.parse(fs.readFileSync(base + '/mcp-7a02645f-6293-41ff-9b4a-6820d7e65c94-execute_sql-' + ts + '.txt')); }
function norm(w) { return (w || '').substring(0, 10); }
function merge(chunks, mapFn) {
  const seen = new Set();
  const data = [];
  chunks.forEach(c => c.data.forEach(r => {
    const mapped = mapFn(r);
    if (!mapped) return;
    const key = Object.values(mapped).join('|');
    if (!seen.has(key)) { seen.add(key); data.push(mapped); }
  }));
  data.sort((a, b) => (a.w || '').localeCompare(b.w || '') || (a.c || '').localeCompare(b.c || '') || (a.pr || '').localeCompare(b.pr || ''));
  return data;
}

// 1. Weekly metrics (3 chunks) + collections (2 chunks)
const met2026 = load('1774879873701');
const met25H2 = load('1774879875743');
const met25H1 = load('1774879878322');
const coll2026 = load('1774879880285');
const coll2025 = load('1774879882464');

const metricsRaw = merge([met25H1, met25H2, met2026], r => ({
  w: norm(r.w), c: r.c, s: Number(r.s)||0, p: Number(r.p)||0, rt: Number(r.rt)||0, inj: Number(r.inj)||0, co: 0
}));
const collMap = {};
[...coll2025.data, ...coll2026.data].forEach(r => { collMap[norm(r.w) + '|' + r.c] = Number(r.co) || 0; });
metricsRaw.forEach(m => { m.co = collMap[m.w + '|' + m.c] || 0; });
fs.writeFileSync(dir + '/weekly-metrics.json', JSON.stringify(metricsRaw));
console.log('weekly-metrics.json:', metricsRaw.length, 'rows');

// 2. Ops data
const ops2026 = load('1774879908068');
const ops2025 = load('1774879910903');
const opsData = merge([ops2025, ops2026], r => {
  if (!r.c || r.c.trim() === '') return null;
  return { w: norm(r.w), c: r.c, ns: Number(r.ns)||0, cn: Number(r.cn)||0, t: Number(r.t)||0 };
});
fs.writeFileSync(dir + '/weekly-ops.json', JSON.stringify(opsData));
console.log('weekly-ops.json:', opsData.length, 'rows');

// 3. Utilization + Hours
const sched2026 = load('1774879913414');
const sched2025 = load('1774879916245');
const schedData = merge([sched2025, sched2026], r => ({
  w: norm(r.w), c: r.c, sh: Number(r.sh)||0, bh: Number(r.bh)||0, h: Number(r.h)||0, ur: Number(r.ur)||0
}));
fs.writeFileSync(dir + '/weekly-utilization.json', JSON.stringify(schedData.map(r => ({ w: r.w, c: r.c, ur: r.ur }))));
fs.writeFileSync(dir + '/weekly-provider-hours.json', JSON.stringify(schedData.map(r => ({ w: r.w, c: r.c, h: r.h, sh: r.sh, bh: r.bh }))));
console.log('weekly-utilization.json:', schedData.length);
console.log('weekly-provider-hours.json:', schedData.length);

// 4. NTX vs Filler
const ntxFiller = load('1774879920350');
const ntxData = merge([ntxFiller], r => ({ w: norm(r.w), c: r.c, ntx: Math.round(Number(r.ntx)||0), filler: Math.round(Number(r.filler)||0) }));
fs.writeFileSync(dir + '/weekly-ntx-filler.json', JSON.stringify(ntxData));
console.log('weekly-ntx-filler.json:', ntxData.length);

// 5. Inj rev by provider
const injProv2026 = load('1774879932993');
const injProv2025 = load('1774879935136');
const injProvData = merge([injProv2025, injProv2026], r => ({ w: norm(r.w), c: r.c, pr: r.pr, r: Number(r.r)||0 }));
fs.writeFileSync(dir + '/weekly-inj-rev-provider.json', JSON.stringify(injProvData));
console.log('weekly-inj-rev-provider.json:', injProvData.length);

// 6. Btx by provider
const btxProv = load('1774879942319');
const btxProvData = merge([btxProv], r => ({ w: norm(r.w), c: r.c, pr: r.pr, b: Number(r.b)||0, n: Number(r.n)||0 }));
fs.writeFileSync(dir + '/weekly-btx-provider.json', JSON.stringify(btxProvData));
console.log('weekly-btx-provider.json:', btxProvData.length);

// 7. Btx by location (aggregate)
const btxLocAgg = {};
btxProvData.forEach(r => {
  const k = r.w + '|' + r.c;
  if (!btxLocAgg[k]) btxLocAgg[k] = { w: r.w, c: r.c, totalU: 0, totalN: 0 };
  btxLocAgg[k].totalU += r.b * r.n;
  btxLocAgg[k].totalN += r.n;
});
const btxLocData = Object.values(btxLocAgg).map(r => ({ w: r.w, c: r.c, b: r.totalN > 0 ? Math.round(r.totalU / r.totalN * 10) / 10 : 0 }));
btxLocData.sort((a, b) => a.w.localeCompare(b.w) || a.c.localeCompare(b.c));
fs.writeFileSync(dir + '/weekly-btx.json', JSON.stringify(btxLocData));
console.log('weekly-btx.json:', btxLocData.length);

// 8. Syringe by location
const syrLoc = load('1774879946036');
const syrLocData = merge([syrLoc], r => ({ w: norm(r.w), c: r.c, si: Number(r.si)||0, sf: Number(r.sf)||0, ni: Number(r.ni)||0, nf: Number(r.nf)||0 }));
fs.writeFileSync(dir + '/weekly-syringe-loc.json', JSON.stringify(syrLocData));
console.log('weekly-syringe-loc.json:', syrLocData.length);

// 9. Syringe by provider
const syrProv = load('1774879950525');
const syrProvData = merge([syrProv], r => ({ w: norm(r.w), c: r.c, pr: r.pr, si: Number(r.si)||0, sf: Number(r.sf)||0, n: Number(r.n)||0 }));
fs.writeFileSync(dir + '/weekly-syringe-provider.json', JSON.stringify(syrProvData));
console.log('weekly-syringe-provider.json:', syrProvData.length);

// 10. Rev-Coll by provider
const rc2026 = load('1774879965774');
const rc25H2 = load('1774879989262');
const rcProvData = merge([rc25H2, rc2026], r => {
  const w = norm(r.w); if (!w || !r.c || !r.pr) return null;
  return { w, c: r.c, pr: r.pr, rev: Number(r.rev)||0, coll: Number(r.coll)||0 };
});
fs.writeFileSync(dir + '/weekly-rev-coll-provider.json', JSON.stringify(rcProvData));
console.log('weekly-rev-coll-provider.json:', rcProvData.length);

// 11. Metrics by provider
const metProv2026 = load('1774879972814');
const metProv25H2 = load('1774879975478');
const metProvData = merge([metProv25H2, metProv2026], r => {
  const w = norm(r.w); if (!w || !r.c || !r.pr) return null;
  return { w, c: r.c, pr: r.pr, s: Number(r.s)||0, p: Number(r.p)||0, rt: Number(r.rt)||0, inj: Number(r.inj)||0 };
});
fs.writeFileSync(dir + '/weekly-metrics-provider.json', JSON.stringify(metProvData));
console.log('weekly-metrics-provider.json:', metProvData.length);

// 12. Budget
const budgetRaw = load('1774879992122');
const budgetMonthly = {};
budgetRaw.data.forEach(r => {
  const ms = (r.month_start || '').substring(0, 10);
  if (!ms || !r.c) return;
  budgetMonthly[ms + '|' + r.c] = Number(r.dg) || 0;
});
const allMetricWeeks = [...new Set(metricsRaw.map(r => r.w))].sort();
const budgetData = [];
allMetricWeeks.forEach(w => {
  const monthKey = w.substring(0, 7) + '-01';
  Object.entries(budgetMonthly).forEach(([key, dg]) => {
    const [ms, c] = [key.substring(0, 10), key.substring(11)];
    if (ms === monthKey) budgetData.push({ w, c, b: Math.round(dg * 7) });
  });
});
budgetData.sort((a, b) => a.w.localeCompare(b.w) || a.c.localeCompare(b.c));
fs.writeFileSync(dir + '/weekly-budget.json', JSON.stringify(budgetData));
console.log('weekly-budget.json:', budgetData.length);

// Summary
console.log('\n=== FINAL SUMMARY ===');
const files = fs.readdirSync(dir).filter(f => f.endsWith('.json'));
files.forEach(f => {
  const d = JSON.parse(fs.readFileSync(dir + '/' + f));
  if (Array.isArray(d)) {
    const weeks = [...new Set(d.map(r => r.w).filter(Boolean))].sort();
    console.log(f + ': ' + d.length + ' rows' + (weeks.length ? ', ' + weeks.length + ' wks (' + weeks[0] + ' → ' + weeks[weeks.length-1] + ')' : ''));
  }
});
