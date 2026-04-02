'use strict';
const fs = require('fs');
const path = require('path');

// --- Paths ---
const FILE1 = 'C:/Users/kdwyer/.claude/projects/C--Users-kdwyer-Documents-claude-amp-pms--claude-worktrees-jolly-colden/314d8cd1-feab-4c73-b8d8-6bac7252a554/tool-results/mcp-7a02645f-6293-41ff-9b4a-6820d7e65c94-execute_sql-1775157222154.txt';
const FILE2 = 'C:/Users/kdwyer/.claude/projects/C--Users-kdwyer-Documents-claude-amp-pms--claude-worktrees-jolly-colden/314d8cd1-feab-4c73-b8d8-6bac7252a554/tool-results/mcp-7a02645f-6293-41ff-9b4a-6820d7e65c94-execute_sql-1775157225051.txt';
const METRICS_PATH = 'C:/Users/kdwyer/Documents/claude/performance-tracker/public/data/performance/weekly-metrics.json';
const OUT_PUBLIC  = 'C:/Users/kdwyer/Documents/claude/performance-tracker/public/data/performance/weekly-budget.json';
const OUT_DIST    = 'C:/Users/kdwyer/Documents/claude/performance-tracker/dist/data/performance/weekly-budget.json';

// --- Load revenue budget ---
console.log('Loading revenue budget (File 1)...');
const revRows = JSON.parse(fs.readFileSync(FILE1, 'utf8')).data;
console.log(`  ${revRows.length} revenue budget rows`);

// --- Load collections budget ---
console.log('Loading collections budget (File 2)...');
const collRows = JSON.parse(fs.readFileSync(FILE2, 'utf8')).data;
console.log(`  ${collRows.length} collections budget rows`);

// --- Build maps: revMap[c][YYYY-MM] = weekly_b ---
const revMap = {};
for (const row of revRows) {
  const ym = row.month_start.slice(0, 7); // "YYYY-MM"
  if (!revMap[row.c]) revMap[row.c] = {};
  revMap[row.c][ym] = parseFloat(row.weekly_b) || 0;
}

const collMap = {};
for (const row of collRows) {
  const ym = row.month_start.slice(0, 7);
  if (!collMap[row.c]) collMap[row.c] = {};
  collMap[row.c][ym] = parseFloat(row.weekly_cb) || 0;
}

// --- Load weekly-metrics.json for known centers ---
console.log('Loading weekly-metrics.json...');
const metricsData = JSON.parse(fs.readFileSync(METRICS_PATH, 'utf8'));
const allCenters = [...new Set(metricsData.map(r => r.c))].sort();
console.log(`  ${allCenters.length} unique centers`);

// Find earliest week in metrics
const metricWeeks = [...new Set(metricsData.map(r => r.w))].sort();
const earliestWeek = metricWeeks[0];
console.log(`  Earliest week in metrics: ${earliestWeek}`);

// --- Generate all weeks from earliestWeek through 2026-12-28 ---
function addDays(dateStr, days) {
  const d = new Date(dateStr + 'T00:00:00Z');
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

const endWeek = '2026-12-28';
const allWeeks = [];
let cur = earliestWeek;
while (cur <= endWeek) {
  allWeeks.push(cur);
  cur = addDays(cur, 7);
}
console.log(`  Generated ${allWeeks.length} weeks from ${allWeeks[0]} to ${allWeeks[allWeeks.length - 1]}`);

// --- Build output array ---
const output = [];
for (const w of allWeeks) {
  const ym = w.slice(0, 7); // "YYYY-MM" from week start date
  for (const c of allCenters) {
    const b  = (revMap[c]  && revMap[c][ym]  != null)  ? revMap[c][ym]  : null;
    const cb = (collMap[c] && collMap[c][ym] != null)  ? collMap[c][ym] : null;
    if (b != null || cb != null) {
      output.push({ w, c, b: b || 0, cb: cb || 0 });
    }
  }
}

// Sort by w, then c
output.sort((a, b) => {
  if (a.w < b.w) return -1;
  if (a.w > b.w) return 1;
  if (a.c < b.c) return -1;
  if (a.c > b.c) return 1;
  return 0;
});

console.log(`\nOutput: ${output.length} rows`);

// --- Verify Bethesda 2026-03-30 ---
const bethMar = output.filter(r => r.c === 'Ever/Body-Bethesda Row' && r.w === '2026-03-30');
console.log('\nVerification - Ever/Body-Bethesda Row, 2026-03-30:');
console.log(JSON.stringify(bethMar, null, 2));

// Show a few sample rows
console.log('\nSample rows (first 5):');
console.log(JSON.stringify(output.slice(0, 5), null, 2));

// --- Write output ---
const json = JSON.stringify(output);

console.log(`\nWriting to ${OUT_PUBLIC}...`);
fs.mkdirSync(path.dirname(OUT_PUBLIC), { recursive: true });
fs.writeFileSync(OUT_PUBLIC, json);
console.log(`  Done. ${(json.length / 1024).toFixed(1)} KB`);

console.log(`Writing to ${OUT_DIST}...`);
fs.mkdirSync(path.dirname(OUT_DIST), { recursive: true });
fs.writeFileSync(OUT_DIST, json);
console.log(`  Done.`);

console.log('\nrebuild-budget.cjs complete.');
