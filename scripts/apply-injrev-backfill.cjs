// Apply per-practice injectable-revenue backfill chunks to weekly-inj-rev-provider.json.
//
// Each file in scripts/backfill-chunks/<practice>.json is a JSON array of rows
// of shape { w, c, pr, r } pulled directly from the warehouse:
//
//   SELECT DATE_TRUNC('week', sale_date::date) AS w,
//          center_name AS c, sold_by AS pr,
//          ROUND(SUM(sales_exc_tax), 2) AS r
//   FROM zenoti_<practice>.transformed_sales_accrual_flat_file_products_services
//   WHERE sale_date BETWEEN <12 weeks ago> AND <today>
//     AND item_category = 'Injectables'
//     AND sold_by IS NOT NULL AND center_name IS NOT NULL
//   GROUP BY 1, 2, 3
//   HAVING SUM(sales_exc_tax) <> 0;
//
// This script:
//   1) Loads every chunk file
//   2) Applies the existing center alias map (Ever/Body-Greenwich Village ->
//      Ever/Body-Greenwich)
//   3) Identifies the (week, center) pairs covered by the chunks — only those
//      get replaced. Centers/practices not covered by any chunk file are
//      preserved as-is.
//   4) Writes the merged result back to weekly-inj-rev-provider.json
//
// Why this exists: Q11's weekly snapshot pattern produced partial-week rows
// when the upstream Zenoti flat_file lagged. The dashboard's weekly file had
// stale partial captures across many weeks. This script does a clean re-pull
// from the warehouse and replaces them. Run this whenever the dashboard's
// numbers don't tie to a Zenoti report.

'use strict';
const fs = require('fs');
const path = require('path');

const DATA_FILE   = path.join(__dirname, '..', 'public', 'data', 'performance', 'weekly-inj-rev-provider.json');
const DIST_FILE   = path.join(__dirname, '..', 'dist', 'data', 'performance', 'weekly-inj-rev-provider.json');
const CHUNKS_DIR  = path.join(__dirname, 'backfill-chunks');

const CENTER_ALIASES = {
  'Ever/Body-Greenwich Village': 'Ever/Body-Greenwich',
};

const chunkFiles = fs.readdirSync(CHUNKS_DIR).filter(f => f.endsWith('.json')).sort();
console.log(`Loading ${chunkFiles.length} chunk file(s) from backfill-chunks/...`);

const allBackfill = [];
const summary = [];
for (const f of chunkFiles) {
  const rows = JSON.parse(fs.readFileSync(path.join(CHUNKS_DIR, f), 'utf8'))
    .map(r => ({ ...r, c: CENTER_ALIASES[r.c] || r.c }));
  allBackfill.push(...rows);
  const total = rows.reduce((s, r) => s + (Number(r.r) || 0), 0);
  summary.push({ file: f, rows: rows.length, total });
}

// (week, center) pairs touched by the backfill
const wcPairs = new Set(allBackfill.map(r => `${r.w}|${r.c}`));

const existing = JSON.parse(fs.readFileSync(DATA_FILE, 'utf8'));
const dropped = existing.filter(r => wcPairs.has(`${r.w}|${r.c}`));
const kept    = existing.filter(r => !wcPairs.has(`${r.w}|${r.c}`));

const merged = [...kept, ...allBackfill];
merged.sort((a, b) =>
  (a.w || '').localeCompare(b.w || '') ||
  (a.c || '').localeCompare(b.c || '') ||
  (a.pr || '').localeCompare(b.pr || '')
);

const out = JSON.stringify(merged);
fs.writeFileSync(DATA_FILE, out);
if (fs.existsSync(DIST_FILE)) fs.writeFileSync(DIST_FILE, out);

const sumDropped = dropped.reduce((s, r) => s + (Number(r.r) || 0), 0);
const sumAdded   = allBackfill.reduce((s, r) => s + (Number(r.r) || 0), 0);

console.log('\n--- per-chunk summary ---');
for (const s of summary) {
  console.log(`  ${s.file.padEnd(28)} rows=${String(s.rows).padStart(4)}   total=$${Math.round(s.total).toLocaleString()}`);
}
console.log('\n--- merge summary ---');
console.log(`  (week, center) pairs touched: ${wcPairs.size}`);
console.log(`  rows dropped from existing:   ${dropped.length} ($${Math.round(sumDropped).toLocaleString()})`);
console.log(`  rows added from chunks:       ${allBackfill.length} ($${Math.round(sumAdded).toLocaleString()})`);
console.log(`  net delta:                    $${Math.round(sumAdded - sumDropped).toLocaleString()}`);
console.log(`  total rows in file:           ${merged.length}`);
