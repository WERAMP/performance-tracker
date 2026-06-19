'use strict';
// Bootstrap scripts/.commercial-cache/ from the latest commercial-kd Corral output
// (commercial-kd-live/data.js). This SEEDS the cache so build-commercial.cjs can run
// immediately with numbers identical to the commercial-kd board. For a fresh
// re-derive, re-run the queries in SYNC-COMMERCIAL.md and overwrite the cache instead.
//
// Usage: node scripts/bootstrap-commercial-cache.cjs [path-to-commercial-kd data.js]
const fs = require('fs');
const path = require('path');

const DEFAULT_DATAJS = path.resolve(__dirname, '..', '..', 'Corral', 'commercial-kd-live', 'data.js');
const DATAJS = process.argv[2] || DEFAULT_DATAJS;
const OUT = path.join(__dirname, '.commercial-cache');

const NEEDED = [
  'DEMO_TREND', 'DEMO_INJ_VISITS', 'DEMO_BOTOX', 'DEMO_FILLER', 'DEMO_FILLER_PCT',
  'DEMO_MULTI_SYRINGE', 'DEMO_NEURO_REV', 'DEMO_NEURO_UNITS_BRAND', 'DEMO_REV_PER_HOUR',
  'DEMO_WEEKLY_UNITS', 'DEMO_DAILY_UNITS', 'DEMO_WEEKLY_TREND', 'DEMO_WEEKLY_INJ_VISITS',
  'DEMO_WEEKLY_FILLER_PCT', 'DEMO_WEEKLY_NEURO_REV', 'DEMO_WEEKLY_NEURO_UNITS_BRAND',
  'DEMO_WEEKLY_MULTI_SYRINGE', 'DEMO_WEEKLY_REV_PER_HOUR',
];

if (!fs.existsSync(DATAJS)) {
  console.error(`data.js not found at ${DATAJS}\nPass the path as argv[2], or re-pull per SYNC-COMMERCIAL.md.`);
  process.exit(1);
}
fs.mkdirSync(OUT, { recursive: true });

const text = fs.readFileSync(DATAJS, 'utf8').replace(/^﻿/, '');
const lines = text.split(/\r?\n/);
const want = new Set(NEEDED);
const found = {};
const re = /^const (DEMO_[A-Z0-9_]+)\s*=\s*(\[[\s\S]*\]);?\s*$/;
for (const line of lines) {
  const m = re.exec(line);
  if (m && want.has(m[1])) {
    try {
      const arr = JSON.parse(m[2]);
      fs.writeFileSync(path.join(OUT, `${m[1]}.json`), JSON.stringify({ data: arr }));
      found[m[1]] = arr.length;
    } catch (e) {
      console.error(`Failed to parse ${m[1]}: ${e.message}`);
    }
  }
}
const missing = NEEDED.filter(n => !(n in found));
console.log('Seeded .commercial-cache/ from', DATAJS);
for (const n of NEEDED) console.log(`  ${n.padEnd(34)} ${found[n] != null ? found[n] + ' rows' : 'MISSING'}`);
if (missing.length) { console.error('\nMISSING arrays:', missing.join(', ')); process.exit(1); }
