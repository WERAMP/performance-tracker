'use strict';
// apply-exclusions.cjs — PERMANENT post-refresh pass.
// Re-applies the metric exclusions on top of the feeds that refresh-daily.cjs
// just wrote, so they survive every daily refresh:
//   • Avg Revenue per Patient: exclude no-show/cancellation fees + Consultation/GFE
//     + Wellness vitamin/IV  ->  sx (revenue) / px (patients) / revx twins.
//   • Cancellation / No-Show: exclude Consultation-only & Wellness-only appointment
//     groups (dataset 754)  ->  cn / ns / t.
//   • Botox "Exclude <10u": rebuild *-btx*-ge10 feeds (units = SUM(qty>1), keep
//     appointments with >= 10 units).
//
// Inputs (saved by the operator from the queries in SYNC-EXCLUSIONS.md). All optional —
// a missing input simply skips that part (the app's sx ?? s fallback keeps it safe).
//   scripts/q-revpat-center.json    [{ c, w, fee_rev, fee_only_pt }]
//   scripts/q-revpat-provider.json  [{ c, pr, w, fee_rev, fee_only_pt }]
//   scripts/q-ops-keep-center.json  [{ c, w, t_keep, can_keep, ns_keep }]
//   scripts/q-ops-keep-provider.json[{ c, pr, w, t_keep, can_keep, ns_keep }]
//   scripts/q-btx-ge10.json         [{ c, pr, w, n, total_qty }]
//
// Idempotent. Only touches weeks present in the inputs (matches the incremental refresh).
const fs = require('fs');
const path = require('path');

const BASE = path.join(__dirname, '..', 'public', 'data', 'performance');
const DIST = path.join(__dirname, '..', 'dist', 'data', 'performance');
const CENTER_ALIASES = { 'Ever/Body-Greenwich Village': 'Ever/Body-Greenwich' };

function readInput(f) {
  const p = path.join(__dirname, f);
  if (!fs.existsSync(p)) return null;
  const data = JSON.parse(fs.readFileSync(p, 'utf8').replace(/^﻿/, ''));
  return data.map(r => (r.c && CENTER_ALIASES[r.c] ? { ...r, c: CENTER_ALIASES[r.c] } : r));
}
function readFeed(f) { return JSON.parse(fs.readFileSync(path.join(BASE, f), 'utf8')); }
function writeFeed(f, data) {
  const s = JSON.stringify(data);
  fs.writeFileSync(path.join(BASE, f), s);
  if (fs.existsSync(DIST)) fs.writeFileSync(path.join(DIST, f), s);
}
const num = v => Number(v) || 0;
const r2 = v => Math.round(v * 100) / 100;
const r4 = v => Math.round(v * 10000) / 10000;
const r1 = v => Math.round(v * 10) / 10;
function mondayOf(d) {
  const dt = new Date(d + 'T00:00:00Z');
  return new Date(dt.getTime() - ((dt.getUTCDay() + 6) % 7) * 86400000).toISOString().slice(0, 10);
}

function run() {
  console.log('\n=== apply-exclusions ===');

  // ── 1. Avg Revenue per Patient: sx / px / revx ──────────────────────────────
  const rpC = readInput('q-revpat-center.json');
  const rpP = readInput('q-revpat-provider.json');
  if (rpC) {
    const cw = {}, cpw = {};
    const accum = (m, k, r) => { if (!m[k]) m[k] = { rev: 0, pt: 0 }; m[k].rev += num(r.fee_rev); m[k].pt += num(r.fee_only_pt); };
    for (const r of rpC) accum(cw, r.c + '|' + r.w, r);
    for (const r of (rpP || [])) accum(cpw, r.c + '|' + r.pr + '|' + r.w, r);
    const weeks = new Set(rpC.map(r => r.w));

    const wmKey = r => r.c + '|' + r.w;
    const setTwins = (rows, keyFn, map, daily) => {
      let n = 0;
      for (const r of rows) {
        const w = daily ? mondayOf(r.d) : r.w;
        if (!weeks.has(w)) continue;
        const adj = map[keyFn(r, w)] || { rev: 0, pt: 0 };
        if (daily) {
          r.sx = Math.max(0, r4(num(r.s) - adj.rev / 7));
          r.px = Math.max(0, r4(num(r.p) - adj.pt / 7));
        } else {
          r.sx = Math.max(0, r2(num(r.s) - adj.rev));
          r.px = Math.max(0, num(r.p) - adj.pt);
        }
        n++;
      }
      return n;
    };
    const wm = readFeed('weekly-metrics.json');
    const dm = readFeed('daily-metrics.json');
    const wmp = readFeed('weekly-metrics-provider.json');
    const dmp = readFeed('daily-metrics-provider.json');
    const drcp = readFeed('daily-rev-coll-provider.json');
    setTwins(wm, r => r.c + '|' + r.w, cw, false);
    setTwins(dm, r => r.c + '|' + mondayOf(r.d), cw, true);
    setTwins(wmp, r => r.c + '|' + r.pr + '|' + r.w, cpw, false);
    setTwins(dmp, r => r.c + '|' + r.pr + '|' + mondayOf(r.d), cpw, true);
    // daily-rev-coll-provider: revx = rev - provider fee_rev/7
    for (const r of drcp) {
      const w = mondayOf(r.d);
      if (!weeks.has(w)) continue;
      const adj = cpw[r.c + '|' + r.pr + '|' + w] || { rev: 0 };
      r.revx = Math.max(0, r4(num(r.rev) - adj.rev / 7));
    }
    writeFeed('weekly-metrics.json', wm);
    writeFeed('daily-metrics.json', dm);
    writeFeed('weekly-metrics-provider.json', wmp);
    writeFeed('daily-metrics-provider.json', dmp);
    writeFeed('daily-rev-coll-provider.json', drcp);
    console.log('  rev/patient twins applied for', weeks.size, 'week(s)');
  } else {
    console.warn('  [skip] q-revpat-center.json missing — rev/patient exclusion not applied');
  }

  // ── 2. Cancellation / No-Show: cn / ns / t (Consultation/Wellness excluded) ──
  const applyOps = (file, input, keyFn) => {
    const inp = readInput(input);
    if (!inp) { console.warn('  [skip] ' + input + ' missing — ops exclusion not applied for ' + file); return; }
    const map = {};
    for (const r of inp) {
      const k = keyFn(r);
      if (!map[k]) map[k] = { t: 0, can: 0, ns: 0 };
      map[k].t += num(r.t_keep); map[k].can += num(r.can_keep); map[k].ns += num(r.ns_keep);
    }
    const feed = readFeed(file);
    let n = 0;
    for (const row of feed) {
      const m = map[keyFn(row)];
      if (!m) continue;
      row.t = m.t;
      row.cn = m.t > 0 ? r1(m.can / m.t * 100) : 0;
      row.ns = m.t > 0 ? r1(m.ns / m.t * 100) : 0;
      n++;
    }
    writeFeed(file, feed);
    console.log('  ops applied to ' + file + ':', n, 'rows');
  };
  applyOps('weekly-ops.json', 'q-ops-keep-center.json', r => r.c + '|' + r.w);
  applyOps('weekly-ops-provider.json', 'q-ops-keep-provider.json', r => r.c + '|' + r.pr + '|' + r.w);

  // ── 3. Botox <10u feeds (*-ge10) ────────────────────────────────────────────
  const ge = readInput('q-btx-ge10.json');
  if (ge) {
    const weeks = new Set(ge.map(r => r.w));
    // provider rows
    const pmap = {};
    for (const r of ge) {
      const k = r.c + '|' + r.pr + '|' + r.w;
      if (!pmap[k]) pmap[k] = { w: r.w, c: r.c, pr: r.pr, n: 0, total_qty: 0 };
      pmap[k].n += num(r.n); pmap[k].total_qty += num(r.total_qty);
    }
    const newProv = Object.values(pmap).map(v => ({
      w: v.w, c: v.c, pr: v.pr,
      b: v.n > 0 ? r2(v.total_qty / v.n) : null, n: v.n, total_qty: r2(v.total_qty),
    }));
    // location rows = sum of providers
    const lmap = {};
    for (const r of newProv) {
      const k = r.c + '|' + r.w;
      if (!lmap[k]) lmap[k] = { w: r.w, c: r.c, sq: 0, sn: 0 };
      lmap[k].sq += r.total_qty; lmap[k].sn += r.n;
    }
    const newLoc = Object.values(lmap).map(v => ({
      w: v.w, c: v.c, b: v.sn > 0 ? r2(v.sq / v.sn) : null, total_qty: r2(v.sq),
    }));
    // daily provider = weekly / 7 across each week's 7 days
    const newDaily = [];
    for (const r of newProv) {
      const base = new Date(r.w + 'T00:00:00Z');
      for (let i = 0; i < 7; i++) {
        const d = new Date(base.getTime() + i * 86400000).toISOString().slice(0, 10);
        newDaily.push({ d, c: r.c, pr: r.pr, n: r4(r.n / 7), b: r.b, total_qty: r4(r.total_qty / 7) });
      }
    }
    const mergeWeeks = (file, rows, isDaily) => {
      let existing = [];
      try { existing = readFeed(file); } catch (e) {}
      const keep = isDaily
        ? existing.filter(r => !weeks.has(mondayOf(r.d)))
        : existing.filter(r => !weeks.has(r.w));
      const merged = [...keep, ...rows].sort((a, b) =>
        ((a.d || a.w) || '').localeCompare((b.d || b.w) || '') ||
        (a.c || '').localeCompare(b.c || '') || ((a.pr || '')).localeCompare(b.pr || ''));
      writeFeed(file, merged);
    };
    mergeWeeks('weekly-btx-provider-ge10.json', newProv, false);
    mergeWeeks('weekly-btx-ge10.json', newLoc, false);
    mergeWeeks('daily-btx-provider-ge10.json', newDaily, true);
    console.log('  botox <10u feeds rebuilt for', weeks.size, 'week(s)');
  } else {
    console.warn('  [skip] q-btx-ge10.json missing — botox <10u feeds not refreshed');
  }
  console.log('=== apply-exclusions done ===');
}

module.exports = { run };
if (require.main === module) run();
