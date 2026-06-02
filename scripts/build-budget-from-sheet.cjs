'use strict';
/**
 * build-budget-from-sheet.cjs
 * ---------------------------------------------------------------------------
 * Regenerates public/data/performance/weekly-budget.json (and the dist copy)
 * directly from the AMP budget Google Sheet instead of from SQL.
 *
 * Source of truth:
 *   https://docs.google.com/spreadsheets/d/1ffyYI4IiztcUjQVstVcc-G7L91_hgHxXlh4jwiLFjfg/edit?gid=421777697
 *   Tab columns: practice | location | center_id | month | goal | daily_goal | metric
 *   (metric is always "accrual revenue"; goal is the MONTHLY revenue goal.)
 *
 * The tracker treats each weekly-budget row's `b`/`cb` as a WEEKLY figure and
 * distributes b/7 per calendar day (see proRateBudget in PerformanceTracker.jsx).
 * The sheet already gives a per-day figure (`daily_goal`), so the exact weekly
 * value the app expects is:  b = round(daily_goal * 7).
 * `cb` (collections budget) mirrors `b`, matching how the existing feed behaves
 * (the sheet has no separate collections goal).
 *
 * Run:  node scripts/build-budget-from-sheet.cjs
 * ---------------------------------------------------------------------------
 */
const fs = require('fs');
const path = require('path');

const SHEET_ID  = '1ffyYI4IiztcUjQVstVcc-G7L91_hgHxXlh4jwiLFjfg';
const GID       = '421777697';
const CSV_URL   = `https://docs.google.com/spreadsheets/d/${SHEET_ID}/export?format=csv&gid=${GID}`;

const ROOT          = path.resolve(__dirname, '..');
const OUT_PUBLIC    = path.join(ROOT, 'public/data/performance/weekly-budget.json');
const OUT_DIST      = path.join(ROOT, 'dist/data/performance/weekly-budget.json');
// Exact monthly goals — consumed by the day-accurate budget math (cards, YTD,
// monthly chart aggregation). weekly-budget.json above is kept only for the
// weekly chart bars.
const OUT_PUBLIC_M  = path.join(ROOT, 'public/data/performance/monthly-budget.json');
const OUT_DIST_M    = path.join(ROOT, 'dist/data/performance/monthly-budget.json');
const END_WEEK      = '2026-12-28';

function daysInMonthKey(mk) { const [y, m] = mk.split('-').map(Number); return new Date(y, m, 0).getDate(); }

// Sheet location name -> tracker center name (only where they differ).
const NAME_MAP = {
  'Curate MedAesthetics - Knoxville': 'Curate Knoxville',
  'Curate MedAesthetics - Nashville': 'Curate Nashville',
  'H-MD Medical Spa - Chisholm Creek': 'H-MD-Chisholm Creek',
  'H-MD Medical Spa - Tulsa': 'H-MD-Tulsa',
  // Renamed in the tracker on 2026-02-23 (see scripts/backfill-gaillardia.cjs);
  // the sheet still carries the pre-rename name.
  'H-MD Medical Spa': 'H-MD-Gaillardia',
  'Mainline - Ardmore': 'Mainline Center for Laser Surgery',
};

// Tracker centers that have NO row in the sheet (under any name). Their budget
// rows are carried over verbatim from the committed baseline so they don't lose
// their goals. Keep this list explicit (not derived from prior output) so the
// script is idempotent on re-runs.
const CARRY_OVER = ['Destination Aesthetics - Napa'];

// ---- minimal CSV parser (handles quoted fields w/ commas & escaped quotes) ----
function parseCsv(text) {
  const rows = [];
  let i = 0, field = '', row = [], inQuotes = false;
  while (i < text.length) {
    const ch = text[i];
    if (inQuotes) {
      if (ch === '"') {
        if (text[i + 1] === '"') { field += '"'; i += 2; continue; }
        inQuotes = false; i++; continue;
      }
      field += ch; i++; continue;
    }
    if (ch === '"') { inQuotes = true; i++; continue; }
    if (ch === ',') { row.push(field); field = ''; i++; continue; }
    if (ch === '\r') { i++; continue; }
    if (ch === '\n') { row.push(field); rows.push(row); row = []; field = ''; i++; continue; }
    field += ch; i++;
  }
  if (field.length || row.length) { row.push(field); rows.push(row); }
  return rows;
}

function addDays(dateStr, days) {
  const d = new Date(dateStr + 'T00:00:00Z');
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

// "M/D/YYYY" -> "YYYY-MM"
function monthKey(m) {
  const [mo, , yr] = m.split('/');
  return `${yr}-${String(mo).padStart(2, '0')}`;
}

(async () => {
  console.log('Fetching budget sheet as CSV...');
  const res = await fetch(CSV_URL);
  if (!res.ok) {
    console.error(`\n  FAILED: HTTP ${res.status} fetching the sheet.`);
    console.error('  The sheet must be shared "Anyone with the link – Viewer"');
    console.error('  (or Published to the web). URL:\n  ' + CSV_URL + '\n');
    process.exit(1);
  }
  const csv = await res.text();
  const rows = parseCsv(csv);
  const hdr = rows[0];
  const data = rows.slice(1)
    .filter(r => r.length > 1 && r[0])
    .map(r => Object.fromEntries(hdr.map((h, j) => [h, r[j]])));
  console.log(`  ${data.length} rows, columns: ${hdr.join(', ')}`);

  // Build maps keyed by tracker center + YYYY-MM:
  //   byCenter      -> weekly budget (round(daily_goal * 7))  [weekly chart bars]
  //   byCenterGoal  -> exact monthly goal (the sheet's `goal` column)  [everything else]
  const byCenter = {};
  const byCenterGoal = {};
  const seenSheetLocs = new Set();
  for (const r of data) {
    const sheetLoc = (r.location || '').trim();
    if (!sheetLoc) continue;
    seenSheetLocs.add(sheetLoc);
    const center = NAME_MAP[sheetLoc] || sheetLoc;
    const mk = monthKey(r.month);
    const daily = parseFloat(String(r.daily_goal).replace(/,/g, '')) || 0;
    const goal  = Math.round(parseFloat(String(r.goal).replace(/,/g, '')) || 0);
    (byCenter[center]     = byCenter[center]     || {})[mk] = Math.round(daily * 7);
    (byCenterGoal[center] = byCenterGoal[center] || {})[mk] = goal;
  }

  // Pristine baseline = the committed (SQL-derived) feed, read from git so the
  // script is idempotent even when run repeatedly against its own output.
  // Falls back to the on-disk file if git is unavailable.
  let baseline;
  try {
    const { execSync } = require('child_process');
    baseline = JSON.parse(execSync(
      'git show HEAD:public/data/performance/weekly-budget.json',
      { cwd: ROOT, maxBuffer: 64 * 1024 * 1024 }
    ).toString());
  } catch (e) {
    console.warn('  (git baseline unavailable — falling back to on-disk file)');
    baseline = JSON.parse(fs.readFileSync(OUT_PUBLIC, 'utf8'));
  }
  const earliestWeek = [...new Set(baseline.map(r => r.w))].sort()[0];
  const baselineCenters = [...new Set(baseline.map(r => r.c))];
  // Sanity: every CARRY_OVER center must exist in the baseline.
  for (const c of CARRY_OVER) {
    if (!baselineCenters.includes(c)) console.warn(`  WARNING: CARRY_OVER center "${c}" not found in baseline.`);
  }

  // Generate every Mon-anchored week from earliestWeek..END_WEEK
  const weeks = [];
  for (let w = earliestWeek; w <= END_WEEK; w = addDays(w, 7)) weeks.push(w);

  const output = [];
  // 1) sheet-sourced centers
  for (const center of Object.keys(byCenter)) {
    for (const w of weeks) {
      const b = byCenter[center][w.slice(0, 7)];
      if (b == null) continue;
      output.push({ w, c: center, b, cb: b });
    }
  }
  // 2) carried-over centers (not present in the sheet) — keep baseline rows
  for (const row of baseline) {
    if (CARRY_OVER.includes(row.c)) output.push({ ...row });
  }

  output.sort((a, b) =>
    a.w < b.w ? -1 : a.w > b.w ? 1 : a.c < b.c ? -1 : a.c > b.c ? 1 : 0);

  const json = JSON.stringify(output);
  fs.mkdirSync(path.dirname(OUT_PUBLIC), { recursive: true });
  fs.writeFileSync(OUT_PUBLIC, json);
  if (fs.existsSync(path.dirname(OUT_DIST))) {
    fs.writeFileSync(OUT_DIST, json);
  }

  // ── monthly-budget.json: exact monthly goals { c, m:"YYYY-MM", b, cb } ──
  const monthly = [];
  for (const center of Object.keys(byCenterGoal)) {
    for (const mk of Object.keys(byCenterGoal[center])) {
      const g = byCenterGoal[center][mk];
      monthly.push({ c: center, m: mk, b: g, cb: g });
    }
  }
  // Carry-over centers (absent from the sheet): reconstruct a monthly goal from
  // the baseline weekly feed — (weekly_b / 7) * daysInMonth for that month.
  const baseWeeklyByCenterMonth = {};
  for (const row of baseline) {
    if (!CARRY_OVER.includes(row.c)) continue;
    const mk = row.w.slice(0, 7);
    // first week seen for the month is representative (all weeks share the value)
    if (baseWeeklyByCenterMonth[`${row.c}|${mk}`] == null) {
      baseWeeklyByCenterMonth[`${row.c}|${mk}`] = { b: row.b, cb: row.cb };
    }
  }
  for (const key of Object.keys(baseWeeklyByCenterMonth)) {
    const [c, mk] = key.split('|');
    const dim = daysInMonthKey(mk);
    const { b, cb } = baseWeeklyByCenterMonth[key];
    monthly.push({
      c, m: mk,
      b:  b  != null ? Math.round((b  / 7) * dim) : 0,
      cb: cb != null ? Math.round((cb / 7) * dim) : null,
    });
  }
  monthly.sort((a, b) =>
    a.m < b.m ? -1 : a.m > b.m ? 1 : a.c < b.c ? -1 : a.c > b.c ? 1 : 0);
  const monthlyJson = JSON.stringify(monthly);
  fs.writeFileSync(OUT_PUBLIC_M, monthlyJson);
  if (fs.existsSync(path.dirname(OUT_DIST_M))) fs.writeFileSync(OUT_DIST_M, monthlyJson);

  // ---- report ----
  const sheetCenters = Object.keys(byCenter).sort();
  // Sheet locations whose (mapped) name isn't a known tracker center.
  const unmatchedSheet = [...seenSheetLocs]
    .filter(l => !baselineCenters.includes(NAME_MAP[l] || l))
    .sort();
  console.log(`\nWrote ${output.length} rows -> ${path.relative(ROOT, OUT_PUBLIC)}`);
  console.log(`Wrote ${monthly.length} rows -> ${path.relative(ROOT, OUT_PUBLIC_M)} (exact monthly goals)`);
  console.log(`  Centers sourced from sheet : ${sheetCenters.length}`);
  console.log(`  Centers carried over (not in sheet): ${CARRY_OVER.length}` +
    (CARRY_OVER.length ? ` -> ${CARRY_OVER.join(', ')}` : ''));
  console.log(`  Sheet locations not mapped to a tracker center: ${unmatchedSheet.length}` +
    (unmatchedSheet.length ? `\n    - ${unmatchedSheet.join('\n    - ')}` : ''));

  const hwM = monthly.filter(r => r.c === 'Back to 30 - Highway 14' && r.m.startsWith('2026'));
  console.log('\nSpot check — Back to 30 - Highway 14, monthly goals 2026:');
  console.log(hwM.map(r => `  ${r.m}  $${r.b.toLocaleString()}`).join('\n'));
})();
