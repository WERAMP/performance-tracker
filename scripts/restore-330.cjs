const fs = require('fs');
const dir = 'public/data/performance';
const base = 'C:/Users/kdwyer/.claude/projects/C--Users-kdwyer-Documents-claude-amp-pms--claude-worktrees-jolly-colden/314d8cd1-feab-4c73-b8d8-6bac7252a554/tool-results';

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

// Find the most recent tool results
const files = fs.readdirSync(base).filter(f => f.endsWith('.txt')).sort();
const recent = files.filter(f => { const m = f.match(/(\d{13})/); return m && parseInt(m[1]) >= 1774964000000; });
const toolus = files.filter(f => f.startsWith('toolu_01'));
console.log('Recent execute_sql files:', recent.length);
console.log('Toolu files:', toolus.filter(f => { try { return fs.statSync(base+'/'+f).mtimeMs > 1774964000000; } catch(e) { return false; }}).length);

// Identify each result by peeking at columns
function identifyResult(filename) {
  try {
    const preview = fs.readFileSync(base + '/' + filename, 'utf8').substring(0, 300);
    if (preview.includes('"s"') && preview.includes('"p"') && preview.includes('"rt"') && !preview.includes('"pr"')) return 'metrics';
    if (preview.includes('"co"') && !preview.includes('"pr"')) return 'collections';
    if (preview.includes('"ntx"') && preview.includes('"si"') && !preview.includes('"pr"')) return 'combined-loc';
    if (preview.includes('"bn"') && preview.includes('"pr"')) return 'combined-prov';
    if (preview.includes('"rev"') && preview.includes('"coll"') && preview.includes('"pr"')) return 'rev-coll-prov';
    if (preview.includes('"s"') && preview.includes('"pr"') && preview.includes('"rt"')) return 'metrics-prov';
  } catch(e) {}
  return 'unknown';
}

const resultMap = {};
[...recent, ...toolus].forEach(f => {
  try {
    if (fs.statSync(base+'/'+f).mtimeMs < 1774964000000) return;
  } catch(e) { return; }
  const type = identifyResult(f);
  if (type !== 'unknown') resultMap[type] = f;
});
console.log('Identified results:', Object.keys(resultMap));

// 1. Metrics (revenue, patients, retail, injectables) + merge collections
if (resultMap.metrics && resultMap.collections) {
  const metricsRaw = JSON.parse(fs.readFileSync(base + '/' + resultMap.metrics)).data;
  const collRaw = JSON.parse(fs.readFileSync(base + '/' + resultMap.collections)).data;
  const collMap = {};
  collRaw.forEach(r => { collMap[(r.w||'').substring(0,10) + '|' + r.c] = Number(r.co) || 0; });

  const newMetrics = metricsRaw.map(r => {
    const w = (r.w||'').substring(0,10);
    return { w, c: r.c, s: Number(r.s)||0, co: collMap[w+'|'+r.c] || 0, p: Number(r.p)||0, rt: Number(r.rt)||0, inj: Number(r.inj)||0 };
  });
  append('weekly-metrics.json', newMetrics, r => r.w+'|'+r.c);
}

// 2. Combined location data (ntx, filler, syringe, btx)
if (resultMap['combined-loc']) {
  const locRaw = JSON.parse(fs.readFileSync(base + '/' + resultMap['combined-loc'])).data;

  // NTX-Filler
  append('weekly-ntx-filler.json', locRaw.map(r => ({
    w: r.w, c: r.c, ntx: Math.round(Number(r.ntx)||0), filler: Math.round(Number(r.filler)||0)
  })), r => r.w+'|'+r.c);

  // BTX location
  const btxRows = locRaw.filter(r => r.btx_avg != null && Number(r.btx_avg) > 0).map(r => ({
    w: r.w, c: r.c, b: Number(r.btx_avg)||0
  }));
  append('weekly-btx.json', btxRows, r => r.w+'|'+r.c);

  // Syringe location
  append('weekly-syringe-loc.json', locRaw.map(r => ({
    w: r.w, c: r.c, si: Number(r.si)||0, sf: Number(r.sf)||0, ni: Number(r.ni)||0, nf: Number(r.nf)||0
  })), r => r.w+'|'+r.c);
}

// 3. Combined provider data (inj rev, btx, syringe)
if (resultMap['combined-prov']) {
  const provRaw = JSON.parse(fs.readFileSync(base + '/' + resultMap['combined-prov'])).data;

  // Inj-rev provider
  const injRevRows = provRaw.filter(r => Number(r.r) > 100).map(r => ({
    w: r.w, c: r.c, pr: r.pr, r: Number(r.r)||0
  }));
  append('weekly-inj-rev-provider.json', injRevRows, r => r.w+'|'+r.c+'|'+r.pr);

  // BTX provider
  const btxProvRows = provRaw.filter(r => r.b != null && Number(r.bn) >= 2).map(r => ({
    w: r.w, c: r.c, pr: r.pr, b: Number(r.b)||0, n: Number(r.bn)||0
  }));
  append('weekly-btx-provider.json', btxProvRows, r => r.w+'|'+r.c+'|'+r.pr);

  // Syringe provider
  const syrProvRows = provRaw.filter(r => Number(r.n) >= 2).map(r => ({
    w: r.w, c: r.c, pr: r.pr, si: Number(r.si)||0, sf: Number(r.sf)||0, n: Number(r.n)||0
  }));
  append('weekly-syringe-provider.json', syrProvRows, r => r.w+'|'+r.c+'|'+r.pr);
}

// 4. Rev-coll provider
if (resultMap['rev-coll-prov']) {
  const rcpRaw = JSON.parse(fs.readFileSync(base + '/' + resultMap['rev-coll-prov'])).data;
  append('weekly-rev-coll-provider.json', rcpRaw.filter(r => r.c && r.pr).map(r => ({
    w: (r.w||'').substring(0,10), c: r.c, pr: r.pr, rev: Number(r.rev)||0, coll: Number(r.coll)||0
  })), r => r.w+'|'+r.c+'|'+r.pr);
}

// 5. Metrics provider
if (resultMap['metrics-prov']) {
  const mpRaw = JSON.parse(fs.readFileSync(base + '/' + resultMap['metrics-prov'])).data;
  append('weekly-metrics-provider.json', mpRaw.map(r => ({
    w: (r.w||'').substring(0,10), c: r.c, pr: r.pr, s: Number(r.s)||0, p: Number(r.p)||0, rt: Number(r.rt)||0, inj: Number(r.inj)||0
  })), r => r.w+'|'+r.c+'|'+r.pr);
}

// Verify Sparrow-vF
const locs = JSON.parse(fs.readFileSync(dir + '/locations.json'));
const svfLocs = new Set(locs.filter(l => l.types && l.types.includes('Sparrow-vF')).map(l => l.name));
const metrics = JSON.parse(fs.readFileSync(dir + '/weekly-metrics.json'));
const svf330 = metrics.filter(r => r.w === '2026-03-30' && svfLocs.has(r.c));
console.log('\nSparrow-vF 3/30 metrics: ' + svf330.length + ' locations');
console.log('Total 3/30 revenue: $' + svf330.reduce((s,r) => s + r.s, 0).toLocaleString());
