const fs = require('fs');
const dir = 'public/data/performance';

const metrics = JSON.parse(fs.readFileSync(dir + '/weekly-metrics.json'));
const ops = JSON.parse(fs.readFileSync(dir + '/weekly-ops.json'));
const ntxFiller = JSON.parse(fs.readFileSync(dir + '/weekly-ntx-filler.json'));
const syrLoc = JSON.parse(fs.readFileSync(dir + '/weekly-syringe-loc.json'));
const btx = JSON.parse(fs.readFileSync(dir + '/weekly-btx.json'));
const util = JSON.parse(fs.readFileSync(dir + '/weekly-utilization.json'));
const hours = JSON.parse(fs.readFileSync(dir + '/weekly-provider-hours.json'));
const locs = JSON.parse(fs.readFileSync(dir + '/locations.json'));
const locNames = new Set(locs.map(l => l.name));

const merged = {};
metrics.filter(r => locNames.has(r.c)).forEach(r => {
  const k = r.w + '|' + r.c;
  merged[k] = { w: r.w, c: r.c, rev: r.s||0, coll: r.co||0, patients: r.p||0, retail: r.rt||0, inj: r.inj||0 };
  const m = merged[k];
  m.revPerPt = m.patients > 0 ? m.rev / m.patients : 0;
  m.retailPct = m.rev > 0 ? m.retail / m.rev * 100 : 0;
  m.injPct = m.rev > 0 ? m.inj / m.rev * 100 : 0;
  m.nonInjRev = m.rev - m.inj;
});
ops.forEach(r => { const k = r.w + '|' + r.c; if (merged[k]) { merged[k].cn = r.cn||0; merged[k].ns = r.ns||0; merged[k].totalAppts = r.t||0; }});
ntxFiller.forEach(r => { const k = r.w + '|' + r.c; if (merged[k]) { merged[k].ntx = r.ntx||0; merged[k].filler = r.filler||0; merged[k].ntxPct = merged[k].rev > 0 ? r.ntx/merged[k].rev*100 : 0; merged[k].fillerPct = merged[k].rev > 0 ? r.filler/merged[k].rev*100 : 0; }});
btx.forEach(r => { const k = r.w + '|' + r.c; if (merged[k]) merged[k].btxUnits = r.b||0; });
syrLoc.forEach(r => { const k = r.w + '|' + r.c; if (merged[k]) { merged[k].syrPerInj = r.si||0; merged[k].syrPerFiller = r.sf||0; }});
util.forEach(r => { const k = r.w + '|' + r.c; if (merged[k]) merged[k].utilRate = r.ur||0; });
hours.forEach(r => { const k = r.w + '|' + r.c; if (merged[k]) { merged[k].billHrs = r.h||0; merged[k].schedHrs = r.sh||0; }});

const rows = Object.values(merged).filter(r => r.rev > 0 && r.patients > 0);

function slopeCalc(xs, ys) {
  const n = xs.length; if (n < 10) return null;
  const mx = xs.reduce((s,v)=>s+v,0)/n, my = ys.reduce((s,v)=>s+v,0)/n;
  let num=0, den=0;
  for (let i=0;i<n;i++) { num+=(xs[i]-mx)*(ys[i]-my); den+=(xs[i]-mx)**2; }
  return den > 0 ? num/den : null;
}
function corrCalc(xs, ys) {
  const n = xs.length; if (n < 10) return null;
  const mx = xs.reduce((s,v)=>s+v,0)/n, my = ys.reduce((s,v)=>s+v,0)/n;
  let num=0, dx=0, dy=0;
  for (let i=0;i<n;i++) { num+=(xs[i]-mx)*(ys[i]-my); dx+=(xs[i]-mx)**2; dy+=(ys[i]-my)**2; }
  return dx>0&&dy>0 ? num/Math.sqrt(dx*dy) : null;
}
function Q(data, mKey, oKey) {
  const v = data.filter(r => r[mKey] != null && r[mKey] > 0 && r[oKey] != null && r[oKey] > 0);
  v.sort((a,b) => a[mKey] - b[mKey]);
  const q1 = v.slice(0, Math.floor(v.length*0.25));
  const q4 = v.slice(Math.floor(v.length*0.75));
  return { q1m: q1.reduce((s,r)=>s+r[mKey],0)/q1.length, q4m: q4.reduce((s,r)=>s+r[mKey],0)/q4.length,
           q1o: q1.reduce((s,r)=>s+r[oKey],0)/q1.length, q4o: q4.reduce((s,r)=>s+r[oKey],0)/q4.length };
}

console.log('=== SERVICE MIX IMPACT ON KPIs ===\n');

// NTX % → various
const ntxR = rows.filter(r => r.ntxPct != null);
console.log('Neurotoxin % of Revenue:');
console.log('  → Rev/Patient: +$' + slopeCalc(ntxR.map(r=>r.ntxPct), ntxR.map(r=>r.revPerPt))?.toFixed(2) + '/pt per 1% NTX (r=' + corrCalc(ntxR.map(r=>r.ntxPct), ntxR.map(r=>r.revPerPt))?.toFixed(3) + ')');
console.log('  → Revenue: $' + slopeCalc(ntxR.map(r=>r.ntxPct), ntxR.map(r=>r.rev))?.toFixed(0) + '/wk per 1% NTX');
const ntxHR = ntxR.filter(r => r.billHrs > 0);
console.log('  → Rev/Billable Hr: $' + slopeCalc(ntxHR.map(r=>r.ntxPct), ntxHR.map(r=>r.rev/r.billHrs))?.toFixed(2) + '/hr per 1% NTX');
const nQ = Q(ntxR, 'ntxPct', 'revPerPt');
console.log('  Quartile: Bottom=' + nQ.q1m.toFixed(1) + '% NTX → $' + nQ.q1o.toFixed(0) + '/pt | Top=' + nQ.q4m.toFixed(1) + '% → $' + nQ.q4o.toFixed(0) + '/pt');

console.log('\nFiller % of Revenue:');
const filR = rows.filter(r => r.fillerPct != null && r.fillerPct > 0);
console.log('  → Rev/Patient: +$' + slopeCalc(filR.map(r=>r.fillerPct), filR.map(r=>r.revPerPt))?.toFixed(2) + '/pt per 1% Filler');
console.log('  → Revenue: $' + slopeCalc(filR.map(r=>r.fillerPct), filR.map(r=>r.rev))?.toFixed(0) + '/wk per 1% Filler');
const fQ = Q(filR, 'fillerPct', 'revPerPt');
console.log('  Quartile: Bottom=' + fQ.q1m.toFixed(1) + '% Filler → $' + fQ.q1o.toFixed(0) + '/pt | Top=' + fQ.q4m.toFixed(1) + '% → $' + fQ.q4o.toFixed(0) + '/pt');

console.log('\nTotal Injectable % → All KPIs:');
const injR = rows.filter(r => r.injPct > 0);
console.log('  → Rev/Patient: +$' + slopeCalc(injR.map(r=>r.injPct), injR.map(r=>r.revPerPt))?.toFixed(2) + '/pt per 1% inj');
console.log('  → Revenue: $' + slopeCalc(injR.map(r=>r.injPct), injR.map(r=>r.rev))?.toFixed(0) + '/wk per 1% inj');
console.log('  → Collections: $' + slopeCalc(injR.map(r=>r.injPct), injR.map(r=>r.coll))?.toFixed(0) + '/wk per 1% inj');
const injHR = injR.filter(r => r.billHrs > 0);
console.log('  → Rev/Billable Hr: $' + slopeCalc(injHR.map(r=>r.injPct), injHR.map(r=>r.rev/r.billHrs))?.toFixed(2) + '/hr per 1% inj');

console.log('\nBotox Units → All KPIs:');
const btxR = rows.filter(r => r.btxUnits > 0 && r.ntx > 0);
console.log('  → NTX Revenue: +$' + (slopeCalc(btxR.map(r=>r.btxUnits), btxR.map(r=>r.ntx))*10)?.toFixed(0) + ' per +10 units');
console.log('  → Total Revenue: +$' + (slopeCalc(btxR.map(r=>r.btxUnits), btxR.map(r=>r.rev))*10)?.toFixed(0) + ' per +10 units');
console.log('  → Rev/Patient: +$' + (slopeCalc(btxR.map(r=>r.btxUnits), btxR.map(r=>r.revPerPt))*10)?.toFixed(0) + ' per +10 units');
const btxQ = Q(btxR, 'btxUnits', 'ntx');
console.log('  Quartile: Bottom=' + btxQ.q1m.toFixed(0) + ' units → $' + btxQ.q1o.toFixed(0) + ' NTX/wk | Top=' + btxQ.q4m.toFixed(0) + ' → $' + btxQ.q4o.toFixed(0));

console.log('\nFiller Syringes/Filler Appt → KPIs:');
const syrR = rows.filter(r => r.syrPerFiller > 0 && r.filler > 0);
console.log('  → Filler Revenue: +$' + slopeCalc(syrR.map(r=>r.syrPerFiller), syrR.map(r=>r.filler))?.toFixed(0) + '/wk per +1 syringe');
console.log('  → Total Revenue: +$' + slopeCalc(syrR.map(r=>r.syrPerFiller), syrR.map(r=>r.rev))?.toFixed(0) + '/wk per +1 syringe');
console.log('  → Rev/Patient: +$' + slopeCalc(syrR.map(r=>r.syrPerFiller), syrR.map(r=>r.revPerPt))?.toFixed(0) + '/wk per +1 syringe');

console.log('\n=== CANCEL / NO-SHOW → FULL KPI CASCADE ===\n');

const cnR = rows.filter(r => r.cn != null);
console.log('Cancel Rate → Each KPI:');
console.log('  → Patients: ' + slopeCalc(cnR.map(r=>r.cn), cnR.map(r=>r.patients))?.toFixed(2) + ' pts per +1% cancel (r=' + corrCalc(cnR.map(r=>r.cn), cnR.map(r=>r.patients))?.toFixed(3) + ')');
console.log('  → Revenue: $' + slopeCalc(cnR.map(r=>r.cn), cnR.map(r=>r.rev))?.toFixed(0) + '/wk per +1% cancel');
console.log('  → Collections: $' + slopeCalc(cnR.map(r=>r.cn), cnR.map(r=>r.coll))?.toFixed(0) + '/wk per +1% cancel');
console.log('  → Rev/Patient: $' + slopeCalc(cnR.map(r=>r.cn), cnR.map(r=>r.revPerPt))?.toFixed(2) + ' per +1% cancel');
const cnUR = cnR.filter(r => r.utilRate > 0);
console.log('  → Utilization: ' + slopeCalc(cnUR.map(r=>r.cn), cnUR.map(r=>r.utilRate))?.toFixed(2) + '% per +1% cancel');
const cnHR = cnR.filter(r => r.billHrs > 0);
console.log('  → Rev/Bill Hr: $' + slopeCalc(cnHR.map(r=>r.cn), cnHR.map(r=>r.rev/r.billHrs))?.toFixed(2) + '/hr per +1% cancel');

const cnNsR = rows.filter(r => r.cn != null && r.ns != null);
cnNsR.forEach(r => r.lostRate = r.cn + r.ns);
console.log('\nCombined Cancel+NoShow Rate → Revenue:');
const lQ = Q(cnNsR, 'lostRate', 'rev');
console.log('  Lowest 25% lost rate: ' + lQ.q1m.toFixed(1) + '% → $' + lQ.q1o.toFixed(0) + '/wk');
console.log('  Highest 25% lost rate: ' + lQ.q4m.toFixed(1) + '% → $' + lQ.q4o.toFixed(0) + '/wk');
console.log('  Revenue gap: $' + Math.abs(lQ.q1o - lQ.q4o).toFixed(0) + '/wk');

const nsR = rows.filter(r => r.ns != null);
console.log('\nNo-Show Rate → Each KPI:');
console.log('  → Patients: ' + slopeCalc(nsR.map(r=>r.ns), nsR.map(r=>r.patients))?.toFixed(2) + ' pts per +1% no-show (r=' + corrCalc(nsR.map(r=>r.ns), nsR.map(r=>r.patients))?.toFixed(3) + ')');
console.log('  → Revenue: $' + slopeCalc(nsR.map(r=>r.ns), nsR.map(r=>r.rev))?.toFixed(0) + '/wk per +1% no-show');
console.log('  → Collections: $' + slopeCalc(nsR.map(r=>r.ns), nsR.map(r=>r.coll))?.toFixed(0) + '/wk per +1% no-show');
console.log('  → Rev/Patient: $' + slopeCalc(nsR.map(r=>r.ns), nsR.map(r=>r.revPerPt))?.toFixed(2) + ' per +1% no-show');
console.log('  → Utilization: ' + slopeCalc(nsR.filter(r=>r.utilRate>0).map(r=>r.ns), nsR.filter(r=>r.utilRate>0).map(r=>r.utilRate))?.toFixed(2) + '% per +1% no-show');

// Cancel vs No-Show: which is worse?
console.log('\nCancel vs No-Show: Which hurts more?');
console.log('  Cancel: $' + Math.abs(slopeCalc(cnR.map(r=>r.cn), cnR.map(r=>r.rev)))?.toFixed(0) + ' revenue lost per 1% increase');
console.log('  No-Show: $' + Math.abs(slopeCalc(nsR.map(r=>r.ns), nsR.map(r=>r.rev)))?.toFixed(0) + ' revenue lost per 1% increase');
console.log('  No-shows are ' + (Math.abs(slopeCalc(nsR.map(r=>r.ns), nsR.map(r=>r.rev))) / Math.abs(slopeCalc(cnR.map(r=>r.cn), cnR.map(r=>r.rev)))).toFixed(1) + 'x worse per % point than cancellations');

console.log('\n=== RETAIL → KPI CASCADE ===\n');

console.log('Retail % → Each KPI:');
console.log('  → Rev/Patient: +$' + slopeCalc(rows.map(r=>r.retailPct), rows.map(r=>r.revPerPt))?.toFixed(2) + '/pt per +1% retail');
console.log('  → Revenue: $' + slopeCalc(rows.map(r=>r.retailPct), rows.map(r=>r.rev))?.toFixed(0) + '/wk per +1% retail');
console.log('  → Collections: $' + slopeCalc(rows.map(r=>r.retailPct), rows.map(r=>r.coll))?.toFixed(0) + '/wk per +1% retail');
const retQ = Q(rows, 'retailPct', 'rev');
console.log('  Quartile: Bottom ' + retQ.q1m.toFixed(1) + '% → $' + retQ.q1o.toFixed(0) + '/wk | Top ' + retQ.q4m.toFixed(1) + '% → $' + retQ.q4o.toFixed(0) + '/wk');

console.log('\nRetail $ per week by segment:');
const lo = rows.filter(r => r.retailPct < 3);
const hi = rows.filter(r => r.retailPct > 7.5);
console.log('  Below 3% retail: avg $' + (lo.reduce((s,r)=>s+r.retail,0)/lo.length).toFixed(0) + '/wk retail, avg $' + (lo.reduce((s,r)=>s+r.rev,0)/lo.length).toFixed(0) + '/wk rev');
console.log('  Above 7.5% retail: avg $' + (hi.reduce((s,r)=>s+r.retail,0)/hi.length).toFixed(0) + '/wk retail, avg $' + (hi.reduce((s,r)=>s+r.rev,0)/hi.length).toFixed(0) + '/wk rev');

console.log('\nRetail Margin Advantage:');
console.log('  Product margin: ~60-70% (COGS ~30-40%)');
console.log('  Service margin: ~35-45% (labor + overhead ~55-65%)');
console.log('  Each $1 retail = ~$0.65 margin vs ~$0.40 for services');
console.log('  +$1,000/wk retail = +$250/wk additional margin vs same $ in services');
console.log('  At 7.5% target on $50K rev = $3,750/wk retail = $2,438/wk margin (vs $1,500 as service)');
