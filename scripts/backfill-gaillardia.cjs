'use strict';
// One-off backfill: fill historical H-MD-Gaillardia data that was silently
// dropped by queries before the 2026-02-23 rename workaround was added.
// Reads scripts/backfill-q{N}.json, merges into public + dist output files
// for ONLY weeks not already present for Gaillardia. Safe to re-run.

const fs = require('fs');
const path = require('path');

const PUB = path.join(__dirname, '..', 'public', 'data', 'performance');
const DIST = path.join(__dirname, '..', 'dist', 'data', 'performance');

function readJson(dir, file) { return JSON.parse(fs.readFileSync(path.join(dir, file), 'utf8')); }
function writeJson(file, data) {
  const str = JSON.stringify(data);
  fs.writeFileSync(path.join(PUB, file), str);
  if (fs.existsSync(DIST)) fs.writeFileSync(path.join(DIST, file), str);
}

const TARGETS = [
  { backfill: 'backfill-q3.json',  output: 'weekly-ops.json' },
  { backfill: 'backfill-q7.json',  output: 'weekly-provider-hours.json' },
  { backfill: 'backfill-q16.json', output: 'weekly-utilization.json' },
  { backfill: 'backfill-q10.json', output: 'weekly-metrics-provider.json' },
  { backfill: 'backfill-q14.json', output: 'weekly-ops-provider.json' },
  { backfill: 'backfill-q17.json', output: 'weekly-util-hours-provider.json' },
];

for (const { backfill, output } of TARGETS) {
  const back = JSON.parse(fs.readFileSync(path.join(__dirname, backfill), 'utf8'));
  const existing = readJson(PUB, output);

  const gailWeeks = new Set(existing.filter(r => r.c === 'H-MD-Gaillardia').map(r => r.w));
  const newRows = back.filter(r => !gailWeeks.has(r.w));

  if (newRows.length === 0) {
    console.log(`${output}: no new weeks to add (already covered)`);
    continue;
  }

  const merged = [...existing, ...newRows];
  merged.sort((a, b) =>
    (a.w || '').localeCompare(b.w || '') ||
    (a.c || '').localeCompare(b.c || '') ||
    (a.pr || '').localeCompare(b.pr || '')
  );
  writeJson(output, merged);

  const newWeeks = [...new Set(newRows.map(r => r.w))].sort();
  console.log(`${output}: +${newRows.length} rows across ${newWeeks.length} weeks (${newWeeks[0]} → ${newWeeks[newWeeks.length - 1]})`);
}

console.log('=== Gaillardia backfill done ===');
