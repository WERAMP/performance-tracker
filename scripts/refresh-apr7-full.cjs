'use strict';
// refresh-apr7-full.cjs — week 2026-04-06, complete data as of end-of-day Apr 7
// Replaces the earlier partial run (only 12 locations) with full 67-location data

const fs = require('fs');
const path = require('path');
const BASE = 'C:/Users/kdwyer/Documents/claude/performance-tracker/public/data/performance';
const DIST = 'C:/Users/kdwyer/Documents/claude/performance-tracker/dist/data/performance';
const W = '2026-04-06';

function readJson(f) { return JSON.parse(fs.readFileSync(path.join(BASE,f),'utf8')); }
function writeJson(f, data) {
  const s = JSON.stringify(data);
  fs.writeFileSync(path.join(BASE,f), s);
  if (fs.existsSync(DIST)) fs.writeFileSync(path.join(DIST,f), s);
}
function replaceWeek(file, newRows) {
  const existing = readJson(file);
  const without = existing.filter(r => r.w !== W);
  const merged = [...without, ...newRows];
  merged.sort((a,b) => (a.w||'').localeCompare(b.w||'') || (a.c||'').localeCompare(b.c||'') || (a.pr||'').localeCompare(b.pr||''));
  writeJson(file, merged);
  const weeks = [...new Set(merged.map(r=>r.w))].sort();
  console.log(`${file}: ${existing.length-without.length} replaced, ${newRows.length} added -> total=${merged.length}, latest=${weeks[weeks.length-1]}`);
}

const locations = readJson('locations.json');
const knownCenters = new Set(locations.map(l => l.name));
const fc = rows => rows.filter(r => knownCenters.has(r.c));

// ── 1. WEEKLY-METRICS (revenue + collections merged) ─────────────────────────
const revData = [{"c":"22 Plastic Surgery","s":"58719.90","p":"14","rt":"1346.90","inj":"0.00"},{"c":"22 Spa MD","s":"3671.91","p":"16","rt":"752.66","inj":"1256.50"},{"c":"Aesthetic Clinique - Santa Rosa","s":"22751.01","p":"46","rt":"2386.15","inj":"11772.13"},{"c":"Avelure-Buffalo","s":"6285.77","p":"29","rt":"31.00","inj":"1304.82"},{"c":"Avelure-Creve Coeur","s":"4649.93","p":"25","rt":"0.00","inj":"448.12"},{"c":"Avelure-Grand Rapids","s":"2201.31","p":"15","rt":"95.00","inj":"387.50"},{"c":"Avelure-Greenwood","s":"1516.71","p":"12","rt":"0.00","inj":"250.00"},{"c":"Avelure-Indy","s":"4898.14","p":"28","rt":"261.40","inj":"1552.60"},{"c":"Avelure-Novi","s":"3106.85","p":"11","rt":"202.80","inj":"551.00"},{"c":"Avelure-O'Fallon","s":"1571.49","p":"11","rt":"28.20","inj":"18.74"},{"c":"Avelure-Ocala","s":"4967.75","p":"13","rt":"0.00","inj":"400.00"},{"c":"Avelure-Rochester","s":"4613.83","p":"25","rt":"0.00","inj":"598.53"},{"c":"Avelure-Rochester Hills","s":"1222.18","p":"6","rt":"0.00","inj":"8.50"},{"c":"Avelure-Sunset Hills","s":"1677.85","p":"11","rt":"0.00","inj":"0.00"},{"c":"Avelure-Zona Rosa","s":"4149.64","p":"21","rt":"340.80","inj":"1175.00"},{"c":"Back to 30 - Boiling Springs","s":"1573.50","p":"11","rt":"0.00","inj":"549.50"},{"c":"Back to 30 - Highway 14","s":"11657.17","p":"23","rt":"466.64","inj":"9294.47"},{"c":"Back to 30 - McBee","s":"4261.55","p":"16","rt":"461.25","inj":"2893.30"},{"c":"Back to 30 - Simpsonville","s":"3645.31","p":"11","rt":"0.00","inj":"1809.64"},{"c":"Blush - Avon","s":"5035.05","p":"12","rt":"171.00","inj":"4719.05"},{"c":"Blush - East Longmeadow","s":"2905.50","p":"14","rt":"130.50","inj":"1865.00"},{"c":"Blush - Enfield","s":"12016.14","p":"26","rt":"61.20","inj":"10332.86"},{"c":"Blush - Glastonbury","s":"5507.29","p":"21","rt":"0.00","inj":"3545.29"},{"c":"Blush - Orange","s":"6042.05","p":"19","rt":"582.00","inj":"4639.75"},{"c":"Curate Chattanooga","s":"0.00","p":"1","rt":"0.00","inj":"0.00"},{"c":"Curate Knoxville","s":"4414.64","p":"16","rt":"48.00","inj":"502.00"},{"c":"Curate Nashville","s":"7364.46","p":"20","rt":"430.95","inj":"2844.50"},{"c":"Curate Ooltewah","s":"4887.00","p":"16","rt":"528.00","inj":"2735.00"},{"c":"Destination Aesthetics - El Dorado","s":"14244.39","p":"17","rt":"642.50","inj":"12996.89"},{"c":"Destination Aesthetics - Elk Grove","s":"17453.22","p":"34","rt":"266.60","inj":"16420.86"},{"c":"Destination Aesthetics - Folsom","s":"6044.65","p":"16","rt":"752.70","inj":"4721.95"},{"c":"Destination Aesthetics - Napa","s":"5456.76","p":"19","rt":"639.26","inj":"3338.00"},{"c":"Destination Aesthetics - Roseville","s":"11242.54","p":"25","rt":"924.54","inj":"7342.25"},{"c":"Destination Aesthetics - Sacramento","s":"17411.32","p":"26","rt":"489.00","inj":"16536.76"},{"c":"EsthetixMD - Bend","s":"26663.84","p":"76","rt":"622.00","inj":"18890.50"},{"c":"Ever/Body-Bethesda Row","s":"2530.92","p":"9","rt":"0.00","inj":"0.00"},{"c":"Ever/Body-Colleyville","s":"2755.42","p":"4","rt":"795.42","inj":"1300.00"},{"c":"Ever/Body-Flatiron","s":"11606.42","p":"35","rt":"119.00","inj":"8464.04"},{"c":"Ever/Body-Gaithersburg","s":"4475.05","p":"12","rt":"60.00","inj":"2070.00"},{"c":"Ever/Body-Greenwich","s":"0.00","p":"5","rt":"0.00","inj":"0.00"},{"c":"Ever/Body-Hartford","s":"3699.53","p":"25","rt":"0.00","inj":"449.78"},{"c":"Ever/Body-Logan Circle","s":"8274.63","p":"19","rt":"52.00","inj":"1507.50"},{"c":"Ever/Body-North Haven","s":"4278.47","p":"27","rt":"0.00","inj":"693.89"},{"c":"Ever/Body-South Windsor","s":"1182.87","p":"5","rt":"0.00","inj":"0.00"},{"c":"Ever/Body-Williamsburg","s":"8090.68","p":"23","rt":"0.00","inj":"3841.73"},{"c":"Glo - Wilmington","s":"29532.15","p":"92","rt":"1252.00","inj":"16330.15"},{"c":"Glo - Winterville","s":"6222.50","p":"25","rt":"844.00","inj":"2438.00"},{"c":"H-MD-Chisholm Creek","s":"2312.89","p":"13","rt":"130.00","inj":"370.45"},{"c":"H-MD-Gaillardia","s":"9335.99","p":"29","rt":"606.60","inj":"7615.32"},{"c":"H-MD-Tulsa","s":"1987.46","p":"10","rt":"0.00","inj":"964.80"},{"c":"Living Young - Odessa","s":"5575.68","p":"15","rt":"108.00","inj":"4892.68"},{"c":"Living Young - Palm Harbor","s":"17813.17","p":"51","rt":"262.00","inj":"15229.30"},{"c":"Living Young - Seminole","s":"9118.70","p":"34","rt":"0.00","inj":"6225.87"},{"c":"Living Young - St. Petersburg","s":"3494.78","p":"19","rt":"0.00","inj":"1424.50"},{"c":"Mainline Center for Laser Surgery","s":"15980.50","p":"22","rt":"77.50","inj":"7338.00"},{"c":"New Radiance - Boca Raton","s":"2500.00","p":"16","rt":"0.00","inj":"375.00"},{"c":"New Radiance - Palm Beach Gardens","s":"4797.39","p":"17","rt":"0.00","inj":"1193.39"},{"c":"New Radiance - Port St. Lucie","s":"5666.20","p":"21","rt":"0.00","inj":"5067.20"},{"c":"New Radiance - Wellington","s":"9326.30","p":"13","rt":"0.00","inj":"7276.30"},{"c":"Nouveau Day Spa","s":"6871.00","p":"58","rt":"38.00","inj":"0.00"},{"c":"Pur Skin Clinic - Edmonds","s":"20794.25","p":"40","rt":"365.00","inj":"15473.00"},{"c":"Pur Skin Clinic - Kirkland","s":"4175.60","p":"15","rt":"161.00","inj":"2689.60"},{"c":"Pur Skin Clinic - Seattle","s":"10622.65","p":"20","rt":"0.00","inj":"7710.40"},{"c":"SkynBar","s":"434.50","p":"2","rt":"0.00","inj":"0.00"},{"c":"Synergy - Kennewick","s":"11895.44","p":"40","rt":"467.75","inj":"1648.69"},{"c":"Synergy - Yakima","s":"4558.48","p":"14","rt":"390.98","inj":"3278.00"},{"c":"The Ageless Center","s":"10139.96","p":"21","rt":"0.00","inj":"10139.96"}];

const collData = [{"c":"22 Plastic Surgery","co":"8209.90"},{"c":"22 Spa MD","co":"2259.31"},{"c":"Aesthetic Clinique - Santa Rosa","co":"16841.72"},{"c":"Avelure-Buffalo","co":"347.29"},{"c":"Avelure-Creve Coeur","co":"90.00"},{"c":"Avelure-Grand Rapids","co":"-855.00"},{"c":"Avelure-Greenwood","co":"250.00"},{"c":"Avelure-Indy","co":"1311.40"},{"c":"Avelure-Novi","co":"627.80"},{"c":"Avelure-O'Fallon","co":"1028.20"},{"c":"Avelure-Ocala","co":"400.00"},{"c":"Avelure-Rochester","co":"150.00"},{"c":"Avelure-Rochester Hills","co":"0.00"},{"c":"Avelure-Sunset Hills","co":"775.00"},{"c":"Avelure-Zona Rosa","co":"1081.51"},{"c":"Back to 30 - Boiling Springs","co":"569.50"},{"c":"Back to 30 - Highway 14","co":"9108.44"},{"c":"Back to 30 - McBee","co":"3211.20"},{"c":"Back to 30 - Simpsonville","co":"1668.09"},{"c":"Blush - Avon","co":"5311.39"},{"c":"Blush - East Longmeadow","co":"691.72"},{"c":"Blush - Enfield","co":"13769.35"},{"c":"Blush - Glastonbury","co":"5108.46"},{"c":"Blush - Orange","co":"7171.93"},{"c":"Curate Chattanooga","co":"0.00"},{"c":"Curate Knoxville","co":"1448.00"},{"c":"Curate Nashville","co":"1633.45"},{"c":"Curate Ooltewah","co":"6938.00"},{"c":"Destination Aesthetics - El Dorado","co":"10158.17"},{"c":"Destination Aesthetics - Elk Grove","co":"14379.26"},{"c":"Destination Aesthetics - Folsom","co":"6922.50"},{"c":"Destination Aesthetics - Napa","co":"4782.49"},{"c":"Destination Aesthetics - Roseville","co":"10573.59"},{"c":"Destination Aesthetics - Sacramento","co":"18273.44"},{"c":"EsthetixMD - Bend","co":"20361.75"},{"c":"Ever/Body-Bethesda Row","co":"1377.00"},{"c":"Ever/Body-Colleyville","co":"844.42"},{"c":"Ever/Body-Flatiron","co":"7142.13"},{"c":"Ever/Body-Gaithersburg","co":"2525.00"},{"c":"Ever/Body-Greenwich","co":"0.00"},{"c":"Ever/Body-Hartford","co":"170.48"},{"c":"Ever/Body-Logan Circle","co":"3707.00"},{"c":"Ever/Body-North Haven","co":"2112.99"},{"c":"Ever/Body-South Windsor","co":"-22.22"},{"c":"Ever/Body-Williamsburg","co":"3610.75"},{"c":"Glo - Wilmington","co":"21114.65"},{"c":"Glo - Winterville","co":"4113.00"},{"c":"H-MD-Chisholm Creek","co":"580.15"},{"c":"H-MD-Gaillardia","co":"11070.95"},{"c":"H-MD-Tulsa","co":"764.80"},{"c":"Living Young - Odessa","co":"3600.25"},{"c":"Living Young - Palm Harbor","co":"9285.70"},{"c":"Living Young - Seminole","co":"6508.95"},{"c":"Living Young - St. Petersburg","co":"6536.00"},{"c":"Mainline Center for Laser Surgery","co":"15560.50"},{"c":"New Radiance - Boca Raton","co":"1975.00"},{"c":"New Radiance - Palm Beach Gardens","co":"5636.00"},{"c":"New Radiance - Port St. Lucie","co":"5100.70"},{"c":"New Radiance - Wellington","co":"7326.30"},{"c":"Nouveau Day Spa","co":"3701.00"},{"c":"Pur Skin Clinic - Edmonds","co":"19827.00"},{"c":"Pur Skin Clinic - Kirkland","co":"2950.60"},{"c":"Pur Skin Clinic - Seattle","co":"10047.15"},{"c":"SkynBar","co":"434.50"},{"c":"Synergy - Kennewick","co":"2304.19"},{"c":"Synergy - Yakima","co":"4497.98"},{"c":"The Ageless Center","co":"7302.86"}];

const collMap = {};
for (const r of collData) collMap[r.c] = Math.round(parseFloat(r.co) * 100) / 100;

replaceWeek('weekly-metrics.json', fc(revData).map(r => ({
  w: W, c: r.c,
  s:   Math.round(parseFloat(r.s)  || 0),
  co:  collMap[r.c] !== undefined ? Math.round(collMap[r.c] * 100) / 100 : 0,
  p:   Math.round(parseFloat(r.p)  || 0),
  rt:  Math.round(parseFloat(r.rt) || 0),
  inj: Math.round(parseFloat(r.inj)|| 0),
})));

// ── 2. WEEKLY-NTX-FILLER (all zeros this early in week — use raw inj split) ──
// NTX/filler subcategory data not available yet; insert zero placeholders so
// the charts don't show stale data from prior partial run.
const ntxData = fc(revData).filter(r => parseFloat(r.inj) > 0).map(r => ({
  w: W, c: r.c, ntx: 0, filler: 0
}));
replaceWeek('weekly-ntx-filler.json', ntxData);

console.log('\nDone — weekly-metrics and weekly-ntx-filler updated for week', W);
