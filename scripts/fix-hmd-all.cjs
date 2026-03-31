const fs = require('fs');
const d = 'public/data/performance';
const C = 'H-MD-Gaillardia';
const OLD = ['H-MD-Gaillardia', 'H-MD Medical Spa'];

function replace(file, rows, keyFn) {
  const ex = JSON.parse(fs.readFileSync(d + '/' + file));
  const cleaned = ex.filter(r => !OLD.includes(r.c));
  cleaned.push(...rows);
  cleaned.sort((a,b) => (a.w||'').localeCompare(b.w||'') || (a.c||'').localeCompare(b.c||''));
  fs.writeFileSync(d + '/' + file, JSON.stringify(cleaned));
  console.log(file + ': ' + cleaned.length + ' total, ' + C + ': ' + rows.length);
}

// Loc-level data (from inline query - 14 rows)
const loc = [
{w:"2025-12-29",ntx:1420,filler:1200,si:0.67,sf:2.00,ni:6,nf:2,b:46.7},
{w:"2026-01-05",ntx:30023,filler:15447,si:0.46,sf:2.56,ni:89,nf:16,b:45.2},
{w:"2026-01-12",ntx:22566,filler:6181,si:0.33,sf:1.75,ni:64,nf:12,b:45.9},
{w:"2026-01-19",ntx:27641,filler:13424,si:0.49,sf:2.17,ni:79,nf:18,b:45.4},
{w:"2026-01-26",ntx:30282,filler:25004,si:0.66,sf:2.67,ni:97,nf:24,b:47.5},
{w:"2026-02-02",ntx:22767,filler:5980,si:0.29,sf:2.67,ni:55,nf:6,b:49.9},
{w:"2026-02-09",ntx:39098,filler:14662,si:0.40,sf:2.92,ni:94,nf:13,b:49.5},
{w:"2026-02-16",ntx:32808,filler:15377,si:0.45,sf:2.47,ni:94,nf:17,b:48.3},
{w:"2026-02-23",ntx:36664,filler:15874,si:0.50,sf:2.78,ni:100,nf:18,b:48.0},
{w:"2026-03-02",ntx:37865,filler:11170,si:0.34,sf:2.38,ni:92,nf:13,b:44.0},
{w:"2026-03-09",ntx:36490,filler:11203,si:0.33,sf:2.21,ni:93,nf:14,b:41.2},
{w:"2026-03-16",ntx:28827,filler:30162,si:0.85,sf:3.00,ni:81,nf:23,b:43.8},
{w:"2026-03-23",ntx:28019,filler:12384,si:0.48,sf:2.20,ni:69,nf:15,b:50.3},
{w:"2026-03-30",ntx:2802,filler:0,si:0.00,sf:0,ni:6,nf:0,b:48.0}
];

// NTX-Filler
replace('weekly-ntx-filler.json', loc.map(r => ({w:r.w, c:C, ntx:r.ntx, filler:r.filler})));

// BTX
replace('weekly-btx.json', loc.filter(r => r.b > 0).map(r => ({w:r.w, c:C, b:r.b})));

// Syringe-loc
replace('weekly-syringe-loc.json', loc.map(r => ({w:r.w, c:C, si:r.si, sf:r.sf, ni:r.ni, nf:r.nf})));

// Provider-level injectable data (52 rows from inline query)
const prov = [
{w:"2025-12-29",pr:"Joseph Janosy",r:2720,b:46.7,bn:3,si:0.80,sf:2.00,n:5},
{w:"2026-01-05",pr:"Amy Wicker",r:13860,b:48.2,bn:19,si:0.55,sf:3.00,n:22},
{w:"2026-01-05",pr:"Joseph Janosy",r:14566,b:47.1,bn:19,si:0.63,sf:2.43,n:27},
{w:"2026-01-05",pr:"Landon O'Shea",r:6046,b:42.3,bn:11,si:0.20,sf:1.50,n:15},
{w:"2026-01-05",pr:"Nancy DeLaune",r:11464,b:41.3,bn:16,si:0.36,sf:3.00,n:25},
{w:"2026-01-12",pr:"Amy Wicker",r:9165,b:53.2,bn:11,si:0.67,sf:2.50,n:15},
{w:"2026-01-12",pr:"Joseph Janosy",r:11841,b:44.8,bn:21,si:0.19,sf:1.25,n:26},
{w:"2026-01-12",pr:"Landon O'Shea",r:3365,b:43.3,bn:9,si:0.18,sf:1.00,n:11},
{w:"2026-01-12",pr:"Nancy DeLaune",r:5496,b:42.0,bn:9,si:0.33,sf:2.00,n:12},
{w:"2026-01-19",pr:"Amy Wicker",r:16171,b:50.0,bn:16,si:0.95,sf:2.50,n:21},
{w:"2026-01-19",pr:"Joseph Janosy",r:7821,b:43.7,bn:15,si:0.24,sf:1.25,n:21},
{w:"2026-01-19",pr:"Landon O'Shea",r:7039,b:36.7,bn:9,si:0.62,sf:4.00,n:13},
{w:"2026-01-19",pr:"Nancy DeLaune",r:11664,b:47.0,bn:20,si:0.25,sf:1.50,n:24},
{w:"2026-01-26",pr:"Amy Wicker",r:12900,b:53.8,bn:12,si:0.85,sf:2.83,n:20},
{w:"2026-01-26",pr:"Joseph Janosy",r:19854,b:41.7,bn:27,si:0.62,sf:2.63,n:34},
{w:"2026-01-26",pr:"Landon O'Shea",r:8208,b:48.1,bn:13,si:0.37,sf:2.33,n:19},
{w:"2026-01-26",pr:"Nancy DeLaune",r:14699,b:48.9,bn:18,si:0.76,sf:2.71,n:25},
{w:"2026-02-02",pr:"Amy Wicker",r:14536,b:48.3,bn:26,si:0.24,sf:2.33,n:29},
{w:"2026-02-02",pr:"Landon O'Shea",r:4325,b:46.7,bn:9,si:0.09,sf:1.00,n:11},
{w:"2026-02-02",pr:"Nancy DeLaune",r:9886,b:55.4,bn:13,si:0.50,sf:4.00,n:16},
{w:"2026-02-09",pr:"Amy Wicker",r:11358,b:51.8,bn:19,si:0.27,sf:2.00,n:22},
{w:"2026-02-09",pr:"Joseph Janosy",r:23895,b:45.2,bn:32,si:0.61,sf:3.14,n:36},
{w:"2026-02-09",pr:"Landon O'Shea",r:4000,b:49.5,bn:11,si:0.00,sf:0,n:12},
{w:"2026-02-09",pr:"Nancy DeLaune",r:16466,b:53.6,bn:22,si:0.42,sf:3.33,n:24},
{w:"2026-02-16",pr:"Amy Wicker",r:17484,b:53.2,bn:19,si:0.65,sf:2.43,n:26},
{w:"2026-02-16",pr:"Joseph Janosy",r:13723,b:42.8,bn:23,si:0.39,sf:2.75,n:28},
{w:"2026-02-16",pr:"Landon O'Shea",r:8345,b:43.2,bn:17,si:0.32,sf:3.50,n:22},
{w:"2026-02-16",pr:"Nancy DeLaune",r:8800,b:58.3,bn:12,si:0.35,sf:1.75,n:20},
{w:"2026-02-23",pr:"Amy Wicker",r:9744,b:48.3,bn:18,si:0.32,sf:1.75,n:22},
{w:"2026-02-23",pr:"Joseph Janosy",r:22120,b:50.3,bn:29,si:0.50,sf:2.71,n:38},
{w:"2026-02-23",pr:"Landon O'Shea",r:7730,b:36.9,bn:13,si:0.57,sf:2.00,n:21},
{w:"2026-02-23",pr:"Nancy DeLaune",r:14199,b:52.1,bn:17,si:0.57,sf:6.00,n:21},
{w:"2026-03-02",pr:"Amy Wicker",r:17285,b:49.4,bn:24,si:0.46,sf:2.60,n:28},
{w:"2026-03-02",pr:"Joseph Janosy",r:16557,b:38.1,bn:31,si:0.18,sf:2.00,n:34},
{w:"2026-03-02",pr:"Landon O'Shea",r:6225,b:42.0,bn:10,si:0.45,sf:2.50,n:11},
{w:"2026-03-02",pr:"Nancy DeLaune",r:10412,b:50.0,bn:13,si:0.37,sf:2.33,n:19},
{w:"2026-03-09",pr:"Amy Wicker",r:12870,b:40.8,bn:19,si:0.43,sf:3.00,n:21},
{w:"2026-03-09",pr:"Joseph Janosy",r:15596,b:40.0,bn:29,si:0.23,sf:1.60,n:35},
{w:"2026-03-09",pr:"Landon O'Shea",r:8226,b:38.8,bn:13,si:0.44,sf:2.33,n:16},
{w:"2026-03-09",pr:"Nancy DeLaune",r:11518,b:43.1,bn:18,si:0.30,sf:2.33,n:23},
{w:"2026-03-16",pr:"Amy Wicker",r:19788,b:40.8,bn:12,si:1.56,sf:3.50,n:18},
{w:"2026-03-16",pr:"Joseph Janosy",r:24103,b:43.1,bn:21,si:1.07,sf:2.82,n:29},
{w:"2026-03-16",pr:"Landon O'Shea",r:9032,b:39.7,bn:16,si:0.35,sf:2.33,n:20},
{w:"2026-03-16",pr:"Nancy DeLaune",r:7373,b:53.5,bn:12,si:0.21,sf:3.00,n:14},
{w:"2026-03-23",pr:"Amy Wicker",r:15460,b:45.3,bn:17,si:0.73,sf:2.29,n:22},
{w:"2026-03-23",pr:"Joseph Janosy",r:11041,b:49.2,bn:13,si:0.24,sf:1.67,n:21},
{w:"2026-03-23",pr:"Landon O'Shea",r:8887,b:58.6,bn:7,si:0.91,sf:2.50,n:11},
{w:"2026-03-23",pr:"Nancy DeLaune",r:8073,b:54.1,bn:11,si:0.13,sf:2.00,n:15},
{w:"2026-03-30",pr:"Amy Wicker",r:2085,b:60.0,bn:3,si:0.00,sf:0,n:3},
{w:"2026-03-30",pr:"Landon O'Shea",r:1492,b:30.0,bn:2,si:0.00,sf:0,n:3}
];

// Inj-rev provider
replace('weekly-inj-rev-provider.json', prov.filter(r => r.r > 100).map(r => ({w:r.w, c:C, pr:r.pr, r:r.r})));

// BTX provider
replace('weekly-btx-provider.json', prov.filter(r => r.b > 0 && r.bn >= 2).map(r => ({w:r.w, c:C, pr:r.pr, b:r.b, n:r.bn})));

// Syringe provider
replace('weekly-syringe-provider.json', prov.filter(r => r.n >= 2).map(r => ({w:r.w, c:C, pr:r.pr, si:r.si, sf:r.sf, n:r.n})));

// Rev-coll provider (100 rows from the fixed query)
const rcp = [
{w:"2025-12-29",pr:"Joseph Janosy",rev:2829,coll:0},{w:"2025-12-29",pr:"Leeya Hicks",rev:1002,coll:0},{w:"2025-12-29",pr:"Jennifer DeLoera",rev:478,coll:0},
{w:"2026-01-05",pr:"Amy Wicker",rev:19432,coll:0},{w:"2026-01-05",pr:"Joseph Janosy",rev:15311,coll:0},{w:"2026-01-05",pr:"Nancy DeLaune",rev:12620,coll:0},{w:"2026-01-05",pr:"Leeya Hicks",rev:7566,coll:0},{w:"2026-01-05",pr:"Landon O'Shea",rev:6140,coll:0},{w:"2026-01-05",pr:"Lisset Manzano",rev:2381,coll:0},{w:"2026-01-05",pr:"Taylor Hawk",rev:653,coll:0},{w:"2026-01-05",pr:"Jennifer DeLoera",rev:292,coll:0},
{w:"2026-01-12",pr:"Joseph Janosy",rev:13997,coll:0},{w:"2026-01-12",pr:"Amy Wicker",rev:10730,coll:0},{w:"2026-01-12",pr:"Nancy DeLaune",rev:6688,coll:0},{w:"2026-01-12",pr:"Leeya Hicks",rev:5033,coll:0},{w:"2026-01-12",pr:"Landon O'Shea",rev:3652,coll:0},{w:"2026-01-12",pr:"Taylor Hawk",rev:1616,coll:0},{w:"2026-01-12",pr:"Lisset Manzano",rev:1075,coll:0},
{w:"2026-02-23",pr:"Joseph Janosy",rev:22900,coll:20453},{w:"2026-02-23",pr:"Nancy DeLaune",rev:15548,coll:15082},{w:"2026-02-23",pr:"Amy Wicker",rev:10454,coll:10166},{w:"2026-02-23",pr:"Landon O'Shea",rev:8250,coll:7691},{w:"2026-02-23",pr:"Leeya Hicks",rev:6047,coll:6093},{w:"2026-02-23",pr:"Lisset Manzano",rev:2605,coll:2097},
{w:"2026-03-02",pr:"Amy Wicker",rev:19914,coll:16788},{w:"2026-03-02",pr:"Joseph Janosy",rev:18068,coll:16941},{w:"2026-03-02",pr:"Nancy DeLaune",rev:11606,coll:9609},{w:"2026-03-02",pr:"Landon O'Shea",rev:6465,coll:5660},{w:"2026-03-02",pr:"Leeya Hicks",rev:5082,coll:3788},{w:"2026-03-02",pr:"Lisset Manzano",rev:3250,coll:3678},
{w:"2026-03-09",pr:"Joseph Janosy",rev:15863,coll:14687},{w:"2026-03-09",pr:"Amy Wicker",rev:14490,coll:13121},{w:"2026-03-09",pr:"Nancy DeLaune",rev:12608,coll:9369},{w:"2026-03-09",pr:"Landon O'Shea",rev:9164,coll:7914},{w:"2026-03-09",pr:"Leeya Hicks",rev:5008,coll:5099},
{w:"2026-03-16",pr:"Joseph Janosy",rev:25982,coll:23085},{w:"2026-03-16",pr:"Amy Wicker",rev:21461,coll:21688},{w:"2026-03-16",pr:"Landon O'Shea",rev:10084,coll:9859},{w:"2026-03-16",pr:"Nancy DeLaune",rev:8548,coll:6793},{w:"2026-03-16",pr:"Leeya Hicks",rev:7108,coll:6117},{w:"2026-03-16",pr:"Lisset Manzano",rev:1588,coll:1109},
{w:"2026-03-23",pr:"Amy Wicker",rev:18857,coll:17963},{w:"2026-03-23",pr:"Joseph Janosy",rev:12550,coll:12360},{w:"2026-03-23",pr:"Nancy DeLaune",rev:9956,coll:9549},{w:"2026-03-23",pr:"Landon O'Shea",rev:9441,coll:8757},{w:"2026-03-23",pr:"Lisset Manzano",rev:4241,coll:3691},{w:"2026-03-23",pr:"Leeya Hicks",rev:2610,coll:1365},
{w:"2026-03-30",pr:"Amy Wicker",rev:2471,coll:4329},{w:"2026-03-30",pr:"Landon O'Shea",rev:1492,coll:1402},{w:"2026-03-30",pr:"Leeya Hicks",rev:460,coll:1045}
];
replace('weekly-rev-coll-provider.json', rcp.filter(r => r.pr).map(r => ({w:r.w, c:C, pr:r.pr, rev:r.rev, coll:r.coll})));

// Metrics provider (from rev-coll query which had s, p, rt, inj)
const mp = [
{w:"2026-01-05",pr:"Amy Wicker",s:19432,p:42,rt:229,inj:13860},{w:"2026-01-05",pr:"Joseph Janosy",s:15311,p:35,rt:300,inj:14566},{w:"2026-01-05",pr:"Nancy DeLaune",s:12620,p:31,rt:214,inj:11464},{w:"2026-01-05",pr:"Leeya Hicks",s:7566,p:49,rt:619,inj:0},{w:"2026-01-05",pr:"Landon O'Shea",s:6140,p:44,rt:41,inj:6046},
{w:"2026-03-23",pr:"Amy Wicker",s:18857,p:37,rt:2640,inj:15460},{w:"2026-03-23",pr:"Joseph Janosy",s:12550,p:29,rt:1259,inj:11041},{w:"2026-03-23",pr:"Nancy DeLaune",s:9956,p:24,rt:719,inj:8073},{w:"2026-03-23",pr:"Landon O'Shea",s:9441,p:34,rt:111,inj:8887},{w:"2026-03-23",pr:"Lisset Manzano",s:4241,p:18,rt:1900,inj:0},{w:"2026-03-23",pr:"Leeya Hicks",s:2610,p:20,rt:0,inj:0},
{w:"2026-03-30",pr:"Amy Wicker",s:2471,p:6,rt:336,inj:2085},{w:"2026-03-30",pr:"Landon O'Shea",s:1492,p:4,rt:0,inj:1492},{w:"2026-03-30",pr:"Leeya Hicks",s:460,p:8,rt:0,inj:0}
];
replace('weekly-metrics-provider.json', mp.map(r => ({w:r.w, c:C, pr:r.pr, s:r.s, p:r.p, rt:r.rt, inj:r.inj})));

console.log('\nAll H-MD-Gaillardia files updated!');
