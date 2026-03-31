const fs = require('fs');
const dir = 'public/data/performance';

// Remove old H-MD Medical Spa / H-MD-Gaillardia and replace with fresh data from inline query results

function replaceCenter(file, oldNames, newRows) {
  const ex = JSON.parse(fs.readFileSync(dir + '/' + file));
  const cleaned = ex.filter(r => !oldNames.includes(r.c));
  cleaned.push(...newRows);
  cleaned.sort((a,b) => (a.w||'').localeCompare(b.w||'') || (a.c||'').localeCompare(b.c||''));
  fs.writeFileSync(dir + '/' + file, JSON.stringify(cleaned));
  const weeks = [...new Set(cleaned.map(r => r.w))].sort();
  console.log(file + ': ' + cleaned.length + ' total, H-MD-Gaillardia: ' + newRows.length + ' rows, latest=' + weeks[weeks.length-1]);
}

const OLD_NAMES = ['H-MD-Gaillardia', 'H-MD Medical Spa'];

// Read the tool result files directly
const base = 'C:/Users/kdwyer/.claude/projects/C--Users-kdwyer-Documents-claude-amp-pms--claude-worktrees-jolly-colden/314d8cd1-feab-4c73-b8d8-6bac7252a554/tool-results';

// Find the most recent H-MD-Gaillardia query results
const files = fs.readdirSync(base).sort();
const recentFiles = files.filter(f => {
  try { return fs.statSync(base + '/' + f).mtimeMs >= Date.now() - 3600000; } catch(e) { return false; }
});
console.log('Recent tool result files:', recentFiles.length);

// Parse results
let metricsResult, locResult;
recentFiles.forEach(f => {
  try {
    const preview = fs.readFileSync(base + '/' + f, 'utf8').substring(0, 200);
    if (preview.includes('H-MD-Gaillardia') && preview.includes('"s"') && preview.includes('"co"') && !preview.includes('"ntx"')) {
      metricsResult = f;
    }
    if (preview.includes('H-MD-Gaillardia') && preview.includes('"ntx"') && preview.includes('"si"')) {
      locResult = f;
    }
  } catch(e) {}
});

console.log('Metrics result:', metricsResult || 'NOT FOUND');
console.log('Loc result:', locResult || 'NOT FOUND');

if (metricsResult) {
  const data = JSON.parse(fs.readFileSync(base + '/' + metricsResult)).data;
  const rows = data.map(r => ({
    w: (r.w||'').substring(0,10), c: 'H-MD-Gaillardia',
    s: Number(r.s)||0, co: Number(r.co)||0, p: Number(r.p)||0, rt: Number(r.rt)||0, inj: Number(r.inj)||0
  }));
  replaceCenter('weekly-metrics.json', OLD_NAMES, rows);
}

if (locResult) {
  const data = JSON.parse(fs.readFileSync(base + '/' + locResult)).data;

  // NTX-Filler
  replaceCenter('weekly-ntx-filler.json', OLD_NAMES, data.map(r => ({
    w: r.w, c: 'H-MD-Gaillardia', ntx: Math.round(Number(r.ntx)||0), filler: Math.round(Number(r.filler)||0)
  })));

  // BTX
  replaceCenter('weekly-btx.json', OLD_NAMES, data.filter(r => Number(r.b) > 0).map(r => ({
    w: r.w, c: 'H-MD-Gaillardia', b: Number(r.b)||0
  })));

  // Syringe-loc
  replaceCenter('weekly-syringe-loc.json', OLD_NAMES, data.map(r => ({
    w: r.w, c: 'H-MD-Gaillardia', si: Number(r.si)||0, sf: Number(r.sf)||0, ni: Number(r.ni)||0, nf: Number(r.nf)||0
  })));
}

// Also clean up other files that might have old name
['weekly-budget.json', 'weekly-ops.json', 'weekly-rev-coll-provider.json', 'weekly-metrics-provider.json',
 'weekly-inj-rev-provider.json', 'weekly-btx-provider.json', 'weekly-syringe-provider.json'].forEach(f => {
  try {
    const data = JSON.parse(fs.readFileSync(dir + '/' + f));
    let renamed = 0;
    data.forEach(r => { if (r.c === 'H-MD Medical Spa') { r.c = 'H-MD-Gaillardia'; renamed++; }});
    if (renamed > 0) {
      fs.writeFileSync(dir + '/' + f, JSON.stringify(data));
      console.log(f + ': renamed ' + renamed + ' rows from H-MD Medical Spa → H-MD-Gaillardia');
    }
  } catch(e) {}
});

console.log('\nDone!');
