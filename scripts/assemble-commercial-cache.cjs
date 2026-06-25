'use strict';
// assemble-commercial-cache.cjs — turn the consolidated Corral pulls (saved to
// .commercial-cache/CORE_MONTHLY.json + CORE_WEEKLY.json) into the per-metric DEMO_*
// cache files that build-commercial.cjs reads. This is the "fully Corral-driven" path
// (no commercial-kd board dependency) for the CORE period metrics:
//   botox_units, filler_syringes, inj_visits, filler_sales/total_inj, neuro_rev,
//   trend_sales/visits.  Older periods (outside the pull window) are kept from the
//   existing cache so the trailing charts don't lose history.
//
// Inputs (refresh daily via the Corral pull — see SYNC-COMMERCIAL.md), shape
//   { "data":[ {p,c,pr,botox_units_sold,filler_syringes_sold,inj_visits,filler_sales,
//               total_injectables_sales,neuro_revenue,total_sales,unique_visits} ] }:
//   .commercial-cache/CORE_MONTHLY.json  (p = month start)
//   .commercial-cache/CORE_WEEKLY.json   (p = ISO-week Monday)
//
// NOTE: multi-syringe (DEMO_MULTI_SYRINGE), brand units (DEMO_NEURO_UNITS_BRAND) and
// rev/hour (DEMO_*REV_PER_HOUR) are NOT produced here yet — they still come from whatever
// seeded those cache files. See SYNC-COMMERCIAL.md "remaining".
const fs = require('fs'), path = require('path');
const CACHE = path.join(__dirname, '.commercial-cache');
const CENTER_MAP = { 'Ever/Body-Greenwich Village': 'Ever/Body-Greenwich' };
const rd = f => { const p = path.join(CACHE, f); return fs.existsSync(p) ? JSON.parse(fs.readFileSync(p, 'utf8')).data : null; };
const wr = (f, arr) => fs.writeFileSync(path.join(CACHE, f), JSON.stringify({ data: arr }));

// practice lookup (center -> practice) from the commercial feed
let prac = {};
try { for (const r of JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'public', 'data', 'commercial', 'commercial-monthly.json'), 'utf8'))) if (r.practice && !prac[r.c]) prac[r.c] = r.practice; } catch (e) {}

function assemble(grain) {
  const pull = rd(grain === 'monthly' ? 'CORE_MONTHLY.json' : 'CORE_WEEKLY.json');
  if (!pull || !pull.length) { console.warn(`assemble-commercial-cache: no CORE_${grain.toUpperCase()} pull — ${grain} core left as-is.`); return; }
  const pk = grain === 'monthly' ? 'month' : 'week';
  const minP = pull.reduce((m, r) => (r.p < m ? r.p : m), '9999');
  const rows = pull.map(r => ({ p: String(r.p).slice(0, 10), c: CENTER_MAP[r.c] || r.c, pr: r.pr,
    botox: +r.botox_units_sold || 0, filler: +r.filler_syringes_sold || 0, inj: +r.inj_visits || 0,
    fsale: +r.filler_sales || 0, tinj: +r.total_injectables_sales || 0, nrev: +r.neuro_revenue || 0,
    tsale: +r.total_sales || 0, visits: +r.unique_visits || 0 }));
  const P = grain === 'monthly' ? '' : 'WEEKLY_';
  // each metric: keep existing cache rows for periods < minP (history), append fresh rows
  const merge = (file, mapFn) => {
    const existing = (rd(file) || []).filter(r => String(r[pk]).slice(0, 10) < minP);
    wr(file, existing.concat(rows.map(mapFn)));
  };
  merge(`DEMO_${P}BOTOX.json`,      r => ({ [pk]: r.p, center_name: r.c, staff_member: r.pr, practice: prac[r.c] || '', botox_units_sold: r.botox }));
  merge(`DEMO_${P}FILLER.json`,     r => ({ [pk]: r.p, center_name: r.c, staff_member: r.pr, practice: prac[r.c] || '', filler_syringes_sold: r.filler }));
  merge(`DEMO_${P}INJ_VISITS.json`, r => ({ [pk]: r.p, center_name: r.c, staff_member: r.pr, practice: prac[r.c] || '', inj_visits: r.inj }));
  merge(`DEMO_${P}FILLER_PCT.json`, r => ({ [pk]: r.p, center_name: r.c, staff_member: r.pr, practice: prac[r.c] || '', filler_sales: r.fsale, total_injectables_sales: r.tinj }));
  merge(`DEMO_${P}NEURO_REV.json`,  r => ({ [pk]: r.p, center_name: r.c, staff_member: r.pr, practice: prac[r.c] || '', neuro_revenue: r.nrev }));
  merge(`DEMO_${P}TREND.json`,      r => ({ [pk]: r.p, center_name: r.c, staff_member: r.pr, practice: prac[r.c] || '', total_sales: r.tsale, unique_visits: r.visits }));
  // weekly UNITS feed combines botox+filler (build reads DEMO_WEEKLY_UNITS for both)
  if (grain === 'weekly') merge('DEMO_WEEKLY_UNITS.json', r => ({ week: r.p, center_name: r.c, staff_member: r.pr, practice: prac[r.c] || '', botox_units: r.botox, filler_syringes: r.filler }));
  console.log(`assemble-commercial-cache: ${grain} core refreshed for periods >= ${minP} (${rows.length} rows).`);
}
// Secondary metrics (multi-syringe, brand units, rev/hour). Their pull files already match
// the DEMO_* cache schema 1:1, so we just merge (keep history < minP, append fresh, apply
// the Greenwich center alias). Each input is optional; missing input leaves that cache as-is.
function mergeSecondary(inFile, outFile, pk) {
  const pull = rd(inFile);
  if (!pull || !pull.length) return;
  const minP = pull.reduce((m, r) => (String(r[pk]).slice(0,10) < m ? String(r[pk]).slice(0,10) : m), '9999');
  const keep = (rd(outFile) || []).filter(r => String(r[pk]).slice(0,10) < minP);
  const fresh = pull.map(r => (r.center_name && CENTER_MAP[r.center_name]) ? { ...r, center_name: CENTER_MAP[r.center_name] } : r);
  wr(outFile, keep.concat(fresh));
  console.log(`assemble-commercial-cache: ${outFile} refreshed for ${pk} >= ${minP} (${pull.length} rows).`);
}

function run() {
  assemble('monthly'); assemble('weekly');
  mergeSecondary('MS_MONTHLY.json',       'DEMO_MULTI_SYRINGE.json',          'month');
  mergeSecondary('MS_WEEKLY.json',        'DEMO_WEEKLY_MULTI_SYRINGE.json',   'week');
  mergeSecondary('BRAND_MONTHLY.json',    'DEMO_NEURO_UNITS_BRAND.json',      'month');
  mergeSecondary('BRAND_WEEKLY.json',     'DEMO_WEEKLY_NEURO_UNITS_BRAND.json','week');
  mergeSecondary('REVHOUR_MONTHLY.json',  'DEMO_REV_PER_HOUR.json',           'month');
  mergeSecondary('REVHOUR_WEEKLY.json',   'DEMO_WEEKLY_REV_PER_HOUR.json',    'week');
}
module.exports = { run };
if (require.main === module) run();
