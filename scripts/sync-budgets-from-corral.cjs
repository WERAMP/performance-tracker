'use strict';
/**
 * sync-budgets-from-corral.cjs
 * ===========================================================================
 * Re-syncs the tracker's budget feeds from CORRAL (the data warehouse at
 * api.corraldata.com) so revenue and collections TARGETS for every location
 * and period are correct.
 *
 * This replaces the old CSV-export approach (build-budget-from-sheet.cjs),
 * which broke on two things:
 *   1. Some sheet cells are typed with "$" (e.g. "$107,481") so they parsed
 *      to NaN -> 0 -> "no target" (e.g. Avelure-Buffalo).
 *   2. The export carries only ONE metric (accrual revenue), so collections
 *      had to mirror revenue (e.g. Avelure-Creve Coeur).
 * Corral gives clean numeric goals, and (once wired) a real collections feed.
 *
 * ─ How it runs (see scripts/SYNC-FROM-CORRAL.md) ───────────────────────────
 * This script does NOT talk to Corral directly (auth lives in the Corral MCP
 * connector, which runs inside Claude). Instead:
 *   1. In Claude (Corral connected), run the queries from the README and save
 *      their JSON output to:
 *        scripts/.corral-cache/revenue-goals.json      (required)
 *        scripts/.corral-cache/collections-goals.json  (optional — collections)
 *   2. node scripts/sync-budgets-from-corral.cjs
 *   3. npm run build && commit & push (Cloudflare Pages auto-deploys)
 *
 * Each input file is the raw result of the Corral query: an array of rows with
 * at least { location, month, goal, daily_goal }. (practice/center_id ignored.)
 * ===========================================================================
 */
const fs = require('fs');
const path = require('path');

const ROOT        = path.resolve(__dirname, '..');
const CACHE_DIR   = path.join(__dirname, '.corral-cache');
const REV_INPUT   = path.join(CACHE_DIR, 'revenue-goals.json');
const COLL_INPUT  = path.join(CACHE_DIR, 'collections-goals.json');

const OUT_WEEKLY_PUBLIC  = path.join(ROOT, 'public/data/performance/weekly-budget.json');
const OUT_WEEKLY_DIST    = path.join(ROOT, 'dist/data/performance/weekly-budget.json');
const OUT_MONTHLY_PUBLIC = path.join(ROOT, 'public/data/performance/monthly-budget.json');
const OUT_MONTHLY_DIST   = path.join(ROOT, 'dist/data/performance/monthly-budget.json');
const END_WEEK = '2026-12-28';

// Corral/sheet location name -> tracker center name (only where they differ).
const NAME_MAP = {
  'Curate MedAesthetics - Knoxville': 'Curate Knoxville',
  'Curate MedAesthetics - Nashville': 'Curate Nashville',
  'H-MD Medical Spa - Chisholm Creek': 'H-MD-Chisholm Creek',
  'H-MD Medical Spa - Tulsa': 'H-MD-Tulsa',
  'H-MD Medical Spa': 'H-MD-Gaillardia',       // renamed in tracker 2026-02-23
  'Lift Aesthetics': 'Destination Aesthetics - Napa',
  'Mainline - Ardmore': 'Mainline Center for Laser Surgery',
};
// Tracker centers absent from Corral — keep their committed baseline rows.
const CARRY_OVER = [];
// Corral centers deliberately dropped from the tracker (closed locations) —
// skip so a re-sync doesn't reintroduce their budget rows.
const EXCLUDE = ['Ever/Body-Bethesda Row'];

// ── helpers ────────────────────────────────────────────────────────────────
// Robust numeric parse: strips $, commas, spaces, stray text. "$107,481" -> 107481
function num(v) {
  if (v == null) return 0;
  const n = Number(String(v).replace(/[^0-9.\-]/g, ''));
  return Number.isFinite(n) ? n : 0;
}
function monthKey(m) {                 // "M/D/YYYY" -> "YYYY-MM"
  const [mo, , yr] = String(m).split('/');
  return `${yr}-${String(mo).padStart(2, '0')}`;
}
function daysInMonthKey(mk) { const [y, m] = mk.split('-').map(Number); return new Date(y, m, 0).getDate(); }
function addDays(d, n) { const x = new Date(d + 'T00:00:00Z'); x.setUTCDate(x.getUTCDate() + n); return x.toISOString().slice(0, 10); }
function loadJson(p) { return JSON.parse(fs.readFileSync(p, 'utf8')); }

// Accept either a bare array or a Corral wrapper like { data: [...] }.
function rowsOf(parsed) { return Array.isArray(parsed) ? parsed : (parsed && parsed.data) || []; }

// Build map[center][YYYY-MM] = { goal, daily } from a goals feed.
// The two source sheets name some locations differently (revenue uses
// "H-MD Medical Spa - Tulsa", cash uses "OK-Tulsa"), so we join on the stable
// center_id: the revenue pass records center_id -> tracker center, and the
// collections pass resolves by center_id first (falling back to NAME_MAP/name).
function indexGoals(rows, idToCenter, buildIds) {
  const map = {};
  for (const r of rows) {
    const loc = (r.location || '').trim();
    const cid = r.center_id != null ? String(r.center_id).trim() : '';
    // Revenue pass: tracker center = the (mapped) location NAME (sheet names match
    // tracker names) and we record id→name for the collections join. Collections
    // pass: resolve by center_id first (cash sheet uses different names), else name.
    let center;
    if (buildIds) {
      center = NAME_MAP[loc] || loc;
      if (cid && center) idToCenter[cid] = center;
    } else {
      center = (cid && idToCenter[cid]) || NAME_MAP[loc] || loc;
    }
    if (!center || EXCLUDE.includes(center)) continue;
    const mk = monthKey(r.month);
    const goal = Math.round(num(r.goal));
    if (!goal) continue;                               // skip blank/zero goals
    const daily = num(r.daily_goal) || goal / daysInMonthKey(mk);
    (map[center] = map[center] || {})[mk] = { goal, daily };
  }
  return map;
}

// ── main ─────────────────────────────────────────────────────────────────
if (!fs.existsSync(REV_INPUT)) {
  console.error(`\n  MISSING: ${path.relative(ROOT, REV_INPUT)}`);
  console.error('  Run the revenue query from scripts/SYNC-FROM-CORRAL.md in Claude');
  console.error('  (Corral connected) and save its JSON output to that path, then re-run.\n');
  process.exit(1);
}

const idToCenter = {};                                   // center_id -> tracker center name
const revMap = indexGoals(rowsOf(loadJson(REV_INPUT)), idToCenter, true);

let collMap = null;
if (fs.existsSync(COLL_INPUT)) {
  collMap = indexGoals(rowsOf(loadJson(COLL_INPUT)), idToCenter, false);
} else {
  console.warn(`  NOTE: ${path.relative(ROOT, COLL_INPUT)} not found — collections targets`);
  console.warn('        will be left blank (no goal). Provide it to populate collections.');
}

// Pristine baseline (committed feed) for earliest week + carry-over rows.
let baseline;
try {
  const { execSync } = require('child_process');
  baseline = JSON.parse(execSync('git show HEAD:public/data/performance/weekly-budget.json',
    { cwd: ROOT, maxBuffer: 64 * 1024 * 1024 }).toString());
} catch (e) {
  console.warn('  (git baseline unavailable — using on-disk weekly-budget.json)');
  baseline = loadJson(OUT_WEEKLY_PUBLIC);
}
const earliestWeek = [...new Set(baseline.map(r => r.w))].sort()[0];
const baselineCenters = [...new Set(baseline.map(r => r.c))];

// ── monthly-budget.json (exact monthly goals; cb = collections or null) ──
const allCenters = new Set([...Object.keys(revMap), ...(collMap ? Object.keys(collMap) : [])]);
const monthly = [];
for (const c of allCenters) {
  const months = new Set([
    ...Object.keys(revMap[c] || {}),
    ...Object.keys((collMap && collMap[c]) || {}),
  ]);
  for (const mk of months) {
    const b  = revMap[c] && revMap[c][mk] ? revMap[c][mk].goal : 0;
    const cb = collMap && collMap[c] && collMap[c][mk] ? collMap[c][mk].goal : null;
    if (b || cb != null) monthly.push({ c, m: mk, b, cb });
  }
}
// carry-over centers: reconstruct monthly from baseline weekly (b/7 * daysInMonth)
const seenBaseMonth = {};
for (const row of baseline) {
  if (!CARRY_OVER.includes(row.c)) continue;
  const mk = row.w.slice(0, 7);
  if (seenBaseMonth[`${row.c}|${mk}`] == null) seenBaseMonth[`${row.c}|${mk}`] = row;
}
for (const key of Object.keys(seenBaseMonth)) {
  const [c, mk] = key.split('|'); const row = seenBaseMonth[key]; const dim = daysInMonthKey(mk);
  monthly.push({
    c, m: mk,
    b:  row.b  != null ? Math.round((row.b  / 7) * dim) : 0,
    cb: row.cb != null ? Math.round((row.cb / 7) * dim) : null,
  });
}
monthly.sort((a, b) => a.m < b.m ? -1 : a.m > b.m ? 1 : a.c < b.c ? -1 : a.c > b.c ? 1 : 0);

// ── weekly-budget.json (weekly bars: round(daily*7) by week-start month) ──
const weeks = [];
for (let w = earliestWeek; w <= END_WEEK; w = addDays(w, 7)) weeks.push(w);
const weekly = [];
for (const c of allCenters) {
  for (const w of weeks) {
    const mk = w.slice(0, 7);
    const rev  = revMap[c] && revMap[c][mk];
    const coll = collMap && collMap[c] && collMap[c][mk];
    const b  = rev  ? Math.round(rev.daily  * 7) : null;
    const cb = coll ? Math.round(coll.daily * 7) : null;
    if (b != null || cb != null) weekly.push({ w, c, b: b || 0, cb });
  }
}
for (const row of baseline) if (CARRY_OVER.includes(row.c)) weekly.push({ ...row });
weekly.sort((a, b) => a.w < b.w ? -1 : a.w > b.w ? 1 : a.c < b.c ? -1 : a.c > b.c ? 1 : 0);

// ── write ──
function writeBoth(pubPath, distPath, obj) {
  const json = JSON.stringify(obj);
  fs.mkdirSync(path.dirname(pubPath), { recursive: true });
  fs.writeFileSync(pubPath, json);
  if (fs.existsSync(path.dirname(distPath))) fs.writeFileSync(distPath, json);
}
writeBoth(OUT_WEEKLY_PUBLIC, OUT_WEEKLY_DIST, weekly);
writeBoth(OUT_MONTHLY_PUBLIC, OUT_MONTHLY_DIST, monthly);

// ── report ──
const unmatched = [...allCenters].filter(c => !baselineCenters.includes(c)).sort();
console.log(`\nSynced from Corral:`);
console.log(`  weekly-budget.json : ${weekly.length} rows`);
console.log(`  monthly-budget.json: ${monthly.length} rows`);
console.log(`  centers (revenue)  : ${Object.keys(revMap).length}`);
console.log(`  collections feed   : ${collMap ? Object.keys(collMap).length + ' centers' : 'NONE (cb left blank)'}`);
console.log(`  carried over       : ${CARRY_OVER.join(', ') || '(none)'}`);
console.log(`  centers not in tracker baseline (ignored downstream): ${unmatched.length}` +
  (unmatched.length ? `\n    - ${unmatched.join('\n    - ')}` : ''));
const spot = monthly.filter(r => r.c === 'Back to 30 - Highway 14' && r.m >= '2026-05' && r.m <= '2026-06');
console.log('\nSpot check — Back to 30 - Highway 14:');
spot.forEach(r => console.log(`  ${r.m}  revenue $${r.b.toLocaleString()}  collections ${r.cb == null ? '(blank)' : '$' + r.cb.toLocaleString()}`));
