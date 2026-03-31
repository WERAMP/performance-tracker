// Add 3/30 data from inline query results to all remaining files
const fs = require('fs');
const dir = 'public/data/performance';

function append(file, newRows, keyFn) {
  const ex = JSON.parse(fs.readFileSync(dir + '/' + file));
  const keys = new Set(ex.map(keyFn));
  let added = 0;
  newRows.forEach(r => { const k = keyFn(r); if (!keys.has(k)) { ex.push(r); added++; keys.add(k); }});
  ex.sort((a,b) => (a.w||'').localeCompare(b.w||'') || (a.c||'').localeCompare(b.c||''));
  fs.writeFileSync(dir + '/' + file, JSON.stringify(ex));
  const weeks = [...new Set(ex.map(r => r.w))].sort();
  console.log(file + ': +' + added + ' = ' + ex.length + ', latest=' + weeks[weeks.length-1]);
}

// The combined-loc query for 3/30 returned 53 rows with columns: w, c, ntx, filler, si, sf, ni, nf, b
// Parse into separate files

// NTX-Filler: use ntx, filler columns
const ntfData = require('./' + dir + '/weekly-ntx-filler.json');
const ntfHas330 = ntfData.some(r => r.w === '2026-03-30');
if (!ntfHas330) {
  // Read from the combined loc inline result - we need to re-query this one
  console.log('weekly-ntx-filler: needs re-query for 3/30');
} else {
  console.log('weekly-ntx-filler: already has 3/30');
}

// Check all files
const files = ['weekly-btx','weekly-ntx-filler','weekly-syringe-loc','weekly-syringe-provider','weekly-inj-rev-provider','weekly-btx-provider'];
files.forEach(f => {
  const d = JSON.parse(fs.readFileSync(dir + '/' + f + '.json'));
  const has330 = d.some(r => r.w === '2026-03-30');
  console.log(f + ': ' + (has330 ? 'HAS 3/30' : 'NEEDS 3/30'));
});

// Since we can't extract inline data programmatically, let's just re-query the missing data
// in a way that forces file saving
console.log('\nNeed to re-query: combined-loc and combined-prov with forced file output');
