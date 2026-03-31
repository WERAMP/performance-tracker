const fs = require('fs');
const dir = 'public/data/performance';
const base = 'C:/Users/kdwyer/.claude/projects/C--Users-kdwyer-Documents-claude-amp-pms--claude-worktrees-jolly-colden/314d8cd1-feab-4c73-b8d8-6bac7252a554/tool-results';

function loadResult(filename) {
  try {
    return JSON.parse(fs.readFileSync(base + '/' + filename)).data;
  } catch(e) { console.error('Cannot load ' + filename + ': ' + e.message); return []; }
}

function appendAndSave(file, newRows, keyFn) {
  const existing = JSON.parse(fs.readFileSync(dir + '/' + file));
  const existingKeys = new Set(existing.map(keyFn));
  let added = 0;
  newRows.forEach(r => {
    const k = keyFn(r);
    if (!existingKeys.has(k)) { existing.push(r); added++; existingKeys.add(k); }
  });
  existing.sort((a, b) => (a.w || '').localeCompare(b.w || '') || (a.c || '').localeCompare(b.c || ''));
  fs.writeFileSync(dir + '/' + file, JSON.stringify(existing));
  const weeks = [...new Set(existing.map(r => r.w))].sort();
  console.log(file + ': +' + added + ' = ' + existing.length + ' total, latest=' + weeks[weeks.length-1]);
}

// Find the most recent tool result files (from the queries we just ran)
const allFiles = fs.readdirSync(base).sort();
const recentFiles = allFiles.filter(f => f.includes('execute_sql-177496'));
console.log('Recent result files:', recentFiles);

// The 6 inline results from parallel queries + 2 from the follow-up
// Query order was: btx-loc, ntx-filler, syringe-loc, syringe-prov, inj-rev-prov, btx-prov
// Then: rev-coll-prov (saved to file), metrics-prov (saved to file)

// For inline results, I need to find them in tool-results by timestamp
// Let me list all files from the last batch
const allRecent = allFiles.filter(f => {
  const ts = f.match(/(\d{13})/);
  return ts && parseInt(ts[1]) > 1774962000000;
});
console.log('All recent files:', allRecent);

// The rev-coll-provider and metrics-provider files
if (allRecent.length >= 1) {
  const revCollFile = allRecent.find(f => f.includes('1774962544234'));
  if (revCollFile) {
    const data = loadResult(revCollFile);
    const mapped = data.map(r => ({
      w: (r.w || '').substring(0, 10), c: r.c, pr: r.pr,
      rev: Number(r.rev) || 0, coll: Number(r.coll) || 0
    })).filter(r => r.c && r.w);
    appendAndSave('weekly-rev-coll-provider.json', mapped, r => r.w + '|' + r.c + '|' + r.pr);
  }
}

// Metrics provider
const metProvFile = allRecent.find(f => f.includes('toolu_01Kf'));
if (metProvFile) {
  const data = loadResult(metProvFile);
  const mapped = data.map(r => ({
    w: (r.w || '').substring(0, 10), c: r.c, pr: r.pr,
    s: Number(r.s) || 0, p: Number(r.p) || 0, rt: Number(r.rt) || 0, inj: Number(r.inj) || 0
  })).filter(r => r.c && r.w);
  appendAndSave('weekly-metrics-provider.json', mapped, r => r.w + '|' + r.c + '|' + r.pr);
} else {
  console.log('metrics-provider file not found by toolu ID, trying by content...');
  // Try to find it by checking content
  for (const f of allRecent) {
    try {
      const content = fs.readFileSync(base + '/' + f, 'utf8').substring(0, 200);
      if (content.includes('"s"') && content.includes('"rt"') && content.includes('"pr"')) {
        const data = JSON.parse(fs.readFileSync(base + '/' + f)).data;
        const mapped = data.map(r => ({
          w: (r.w || '').substring(0, 10), c: r.c, pr: r.pr,
          s: Number(r.s) || 0, p: Number(r.p) || 0, rt: Number(r.rt) || 0, inj: Number(r.inj) || 0
        })).filter(r => r.c && r.w);
        appendAndSave('weekly-metrics-provider.json', mapped, r => r.w + '|' + r.c + '|' + r.pr);
        break;
      }
    } catch(e) {}
  }
}

console.log('\nDone!');
