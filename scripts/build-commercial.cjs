'use strict';
// Build Section E ("Consultation Commercial Success Tracking") feeds from the
// raw Corral results in scripts/.commercial-cache/ (seeded by
// bootstrap-commercial-cache.cjs, or re-pulled per SYNC-COMMERCIAL.md).
// Output (public/ + dist/ under data/commercial/), all rows per (period, center, provider):
//   commercial-monthly.json / commercial-weekly.json — merged metric rows + nested `brands`
//   commercial-revhour-monthly.json / commercial-revhour-weekly.json — (period, practice, provider) rev/hour
//   commercial-daily-units.json — last-30-day (day, center, provider) botox + filler units
'use strict';
const fs = require('fs'), path = require('path');
const SD = __dirname;
const CACHE = path.join(SD, '.commercial-cache');
const OUT_PUB = path.join(SD, '..', 'public', 'data', 'commercial');
const OUT_DIST = path.join(SD, '..', 'dist', 'data', 'commercial');
const EXCLUDED = new Set(['Neal Moores', 'Brian Reuben']); // mirror commercialDefs EXCLUDED_PROVIDERS

const cache = (name) => {
  const p = path.join(CACHE, `${name}.json`);
  if (!fs.existsSync(p)) throw new Error(`Missing cache ${name}.json — run bootstrap-commercial-cache.cjs or SYNC-COMMERCIAL.md`);
  return JSON.parse(fs.readFileSync(p, 'utf8')).data;
};
const num = (v) => { const n = parseFloat(v); return isNaN(n) ? 0 : n; };
const r2 = (v) => Math.round(num(v) * 100) / 100;
const ri = (v) => Math.round(num(v));
const keep = (r) => r.staff_member && !EXCLUDED.has(r.staff_member);

function buildPeriodFeed(grain) {
  const W = grain === 'weekly';
  const pk = W ? 'week' : 'month';
  const C = (n) => cache(W ? n : n); // names differ per grain below
  const NAMES = W ? {
    units: 'DEMO_WEEKLY_UNITS', injv: 'DEMO_WEEKLY_INJ_VISITS', fpct: 'DEMO_WEEKLY_FILLER_PCT',
    multi: 'DEMO_WEEKLY_MULTI_SYRINGE', nrev: 'DEMO_WEEKLY_NEURO_REV', brand: 'DEMO_WEEKLY_NEURO_UNITS_BRAND',
    trend: 'DEMO_WEEKLY_TREND',
  } : {
    filler: 'DEMO_FILLER', botox: 'DEMO_BOTOX', injv: 'DEMO_INJ_VISITS', fpct: 'DEMO_FILLER_PCT',
    multi: 'DEMO_MULTI_SYRINGE', nrev: 'DEMO_NEURO_REV', brand: 'DEMO_NEURO_UNITS_BRAND', trend: 'DEMO_TREND',
  };
  const rows = new Map();
  const key = (p, c, pr) => `${p}|${c}|${pr}`;
  const get = (p, c, pr, practice) => {
    const k = key(p, c, pr);
    if (!rows.has(k)) rows.set(k, { p, c, pr, practice: practice || '', filler_syr: 0, inj_visits: 0, filler_sales: 0, total_inj: 0, neuro_rev: 0, a3: 0, a4: 0, a5: 0, trend_sales: 0, trend_visits: 0, botox_units: 0, brands: {} });
    const row = rows.get(k);
    if (practice && !row.practice) row.practice = practice;
    return row;
  };

  // filler syringes + (weekly) botox units come from UNITS weekly / FILLER+BOTOX monthly
  if (W) {
    for (const r of cache(NAMES.units)) { if (!keep(r)) continue; const x = get(r[pk], r.center_name, r.staff_member, r.practice); x.filler_syr = r2(r.filler_syringes); x.botox_units = r2(r.botox_units); }
  } else {
    for (const r of cache(NAMES.filler)) { if (!keep(r)) continue; get(r[pk], r.center_name, r.staff_member, r.practice).filler_syr = r2(r.filler_syringes_sold); }
    for (const r of cache(NAMES.botox))  { if (!keep(r)) continue; get(r[pk], r.center_name, r.staff_member, r.practice).botox_units = r2(r.botox_units_sold); }
  }
  for (const r of cache(NAMES.injv)) { if (!keep(r)) continue; get(r[pk], r.center_name, r.staff_member, r.practice).inj_visits = ri(r.inj_visits); }
  for (const r of cache(NAMES.fpct)) { if (!keep(r)) continue; const x = get(r[pk], r.center_name, r.staff_member, r.practice); x.filler_sales = r2(r.filler_sales); x.total_inj = r2(r.total_injectables_sales); }
  for (const r of cache(NAMES.nrev)) { if (!keep(r)) continue; get(r[pk], r.center_name, r.staff_member, r.practice).neuro_rev = r2(r.neuro_revenue); }
  for (const r of cache(NAMES.multi)) { if (!keep(r)) continue; const x = get(r[pk], r.center_name, r.staff_member, r.practice); x.a3 = ri(r.appts_3); x.a4 = ri(r.appts_4); x.a5 = ri(r.appts_5plus); }
  for (const r of cache(NAMES.trend)) { if (!keep(r)) continue; const x = get(r[pk], r.center_name, r.staff_member, r.practice); x.trend_sales = r2(r.total_sales); x.trend_visits = ri(r.unique_visits); }
  for (const r of cache(NAMES.brand)) { if (!keep(r)) continue; const x = get(r[pk], r.center_name, r.staff_member, r.practice); x.brands[r.brand_bucket] = r2((x.brands[r.brand_bucket] || 0) + num(r.raw_units)); }

  // ≥10-unit visit metrics for the per-visit chart toggle: eg10 = Botox-equiv neuro
  // units on visits with >=10 Botox-equiv units, vg10 = count of those visits.
  // Sourced from COMMERCIAL_GE10.json (invoice-grain pull) — see SYNC-COMMERCIAL.md.
  let ge10 = { monthly: [], weekly: [] };
  try { ge10 = JSON.parse(fs.readFileSync(path.join(SD, '.commercial-cache', 'COMMERCIAL_GE10.json'), 'utf8')); } catch (e) { /* feeds emit eg10/vg10=0 if absent */ }
  const gmap = new Map((ge10[W ? 'weekly' : 'monthly'] || []).map(x => [`${x.p}|${x.c}|${x.pr}`, x]));
  for (const row of rows.values()) { const x = gmap.get(key(row.p, row.c, row.pr)); row.eg10 = x ? x.eg10 : 0; row.vg10 = x ? x.vg10 : 0; }

  return [...rows.values()];
}

function buildRevHour(grain) {
  const W = grain === 'weekly';
  const pk = W ? 'week' : 'month';
  const src = cache(W ? 'DEMO_WEEKLY_REV_PER_HOUR' : 'DEMO_REV_PER_HOUR');
  const rows = new Map();
  for (const r of src) {
    if (!keep(r)) continue;
    const k = `${r[pk]}|${r.practice}|${r.staff_member}`;
    if (!rows.has(k)) rows.set(k, { p: r[pk], practice: r.practice || '', pr: r.staff_member, total_sales: 0, utilized_hours: 0 });
    const x = rows.get(k); x.total_sales = r2(r.total_sales); x.utilized_hours = r2(r.utilized_hours);
  }
  return [...rows.values()];
}

function buildDailyUnits() {
  return cache('DEMO_DAILY_UNITS').filter(keep).map(r => ({
    d: r.day, c: r.center_name, pr: r.staff_member, practice: r.practice || '',
    botox_units: r2(r.botox_units), filler_syringes: r2(r.filler_syringes),
  }));
}

function write(name, data) {
  const s = JSON.stringify(data);
  fs.mkdirSync(OUT_PUB, { recursive: true });
  fs.writeFileSync(path.join(OUT_PUB, name), s);
  if (fs.existsSync(path.join(SD, '..', 'dist'))) { fs.mkdirSync(OUT_DIST, { recursive: true }); fs.writeFileSync(path.join(OUT_DIST, name), s); }
  console.log(`${name}: ${data.length} rows`);
}

const monthly = buildPeriodFeed('monthly');
const weekly = buildPeriodFeed('weekly');
write('commercial-monthly.json', monthly);
write('commercial-weekly.json', weekly);
write('commercial-revhour-monthly.json', buildRevHour('monthly'));
write('commercial-revhour-weekly.json', buildRevHour('weekly'));
write('commercial-daily-units.json', buildDailyUnits());
console.log('Done. Centers:', new Set(monthly.map(r => r.c)).size, ' Providers:', new Set(monthly.map(r => r.pr)).size);
