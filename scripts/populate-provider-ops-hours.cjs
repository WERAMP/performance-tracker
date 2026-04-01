/**
 * populate-provider-ops-hours.cjs
 * Builds two new per-provider data files for the Performance Tracker:
 *   public/data/performance/weekly-ops-provider.json    {w, c, pr, cn, ns, t}
 *   public/data/performance/weekly-util-hours-provider.json  {w, c, pr, h, sh, bh, ur}
 *
 * Run:  node scripts/populate-provider-ops-hours.cjs
 */

'use strict';
const fs = require('fs');
const path = require('path');

const OUT_DIR = path.join(__dirname, '../public/data/performance');

// ── Read query result files ────────────────────────────────────────────────
const OPS_FILE = 'C:/Users/kdwyer/.claude/projects/C--Users-kdwyer-Documents-claude-amp-pms--claude-worktrees-jolly-colden/314d8cd1-feab-4c73-b8d8-6bac7252a554/tool-results/mcp-7a02645f-6293-41ff-9b4a-6820d7e65c94-execute_sql-1775073810730.txt';
const SCH_FILE = 'C:/Users/kdwyer/.claude/projects/C--Users-kdwyer-Documents-claude-amp-pms--claude-worktrees-jolly-colden/314d8cd1-feab-4c73-b8d8-6bac7252a554/tool-results/mcp-7a02645f-6293-41ff-9b4a-6820d7e65c94-execute_sql-1775073799433.txt';

const opsRaw  = JSON.parse(fs.readFileSync(OPS_FILE)).data;
const schRaw  = JSON.parse(fs.readFileSync(SCH_FILE)).data;

// ── Load known location names from locations.json ─────────────────────────
const locFile = path.join(OUT_DIR, 'locations.json');
const locations = JSON.parse(fs.readFileSync(locFile));
const knownCenters = new Set(locations.map(l => l.name));

// ── Process ops data → weekly-ops-provider.json ──────────────────────────
const opsOut = opsRaw
  .filter(r => knownCenters.has(r.c) && r.pr && r.pr.trim() && r.pr.trim() !== ' ')
  .map(r => ({
    w: r.w,
    c: r.c,
    pr: r.pr.trim(),
    cn: parseFloat(r.cn) || 0,
    ns: parseFloat(r.ns) || 0,
    t:  parseInt(r.t)  || 0,
  }))
  .sort((a, b) => a.w.localeCompare(b.w) || a.c.localeCompare(b.c) || a.pr.localeCompare(b.pr));

fs.writeFileSync(path.join(OUT_DIR, 'weekly-ops-provider.json'), JSON.stringify(opsOut));
const opsWeeks = [...new Set(opsOut.map(r => r.w))].sort();
console.log(`weekly-ops-provider.json: ${opsOut.length} rows, weeks ${opsWeeks[0]} → ${opsWeeks[opsWeeks.length-1]}`);

// ── Process schedule data → weekly-util-hours-provider.json ──────────────
const schOut = schRaw
  .filter(r => knownCenters.has(r.c) && r.pr && r.pr.trim())
  .map(r => ({
    w:  r.w,
    c:  r.c,
    pr: r.pr.trim(),
    h:  parseFloat(r.h)  || 0,
    sh: parseFloat(r.sh) || 0,
    bh: parseFloat(r.bh) || 0,
    ur: r.ur != null ? parseFloat(r.ur) : null,
  }))
  .sort((a, b) => a.w.localeCompare(b.w) || a.c.localeCompare(b.c) || a.pr.localeCompare(b.pr));

fs.writeFileSync(path.join(OUT_DIR, 'weekly-util-hours-provider.json'), JSON.stringify(schOut));
const schWeeks = [...new Set(schOut.map(r => r.w))].sort();
console.log(`weekly-util-hours-provider.json: ${schOut.length} rows, weeks ${schWeeks[0]} → ${schWeeks[schWeeks.length-1]}`);

console.log('\nDone. Run npm run build and commit.');
