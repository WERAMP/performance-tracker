// Shared definitions for "Consultation Commercial Success Tracking" (Section E).
// Ported verbatim from commercial-kd-live/app.js so Section E ties out to the
// commercial-kd board. Used by both the build script and the UI.

// ---------- Practice-level Dysport & Daxxify reconstitution ratios ----------
// Maps center_name -> units per vial. Divide raw "One Unit" units by
// (units_per_vial / 100) to get Botox-equivalent. Equivalency/Add-on items are
// already converted (1:1). Defaults: Dysport 3:1, Daxxify 1:1.
export const DYSPORT_RECON = {
  'Aesthetic Clinique - Santa Rosa': 300,
  'Back to 30 - Boiling Springs': 120,
  'Back to 30 - Highway 14': 120,
  'Back to 30 - McBee': 120,
  'Back to 30 - Simpsonville': 120,
  'Blush - Avon': 300,
  'Blush - East Longmeadow': 300,
  'Blush - Enfield': 300,
  'Blush - Glastonbury': 300,
  'Blush - Orange': 300,
  'Curate Chattanooga': 100,
  'Curate Murfreesboro': 100,
  'Curate Nashville': 100,
  'Curate Ooltewah': 100,
  'Destination Aesthetics - El Dorado': 300,
  'Destination Aesthetics - Elk Grove': 300,
  'Destination Aesthetics - Folsom': 300,
  'Destination Aesthetics - Napa': 300,
  'Destination Aesthetics - Roseville': 300,
  'Destination Aesthetics - Sacramento': 300,
  'EsthetixMD - Bend': 300,
  'Ever/Body-Colleyville': 300,
  'Ever/Body-Flatiron': 300,
  'Ever/Body-Greenwich': 300,
  'Ever/Body-Logan Circle': 300,
  'Ever/Body-Williamsburg': 300,
  'Glo - Wilmington': 300,
  'Glo - Winterville': 300,
  'Living Young - Odessa': 250,
  'Living Young - Palm Harbor': 250,
  'Living Young - Seminole': 250,
  'Living Young - St. Petersburg': 250,
  'Mainline Center for Laser Surgery': 300,
  'Mainline Center For Laser Surgery': 300,
  'New Radiance - Boca Raton': 300,
  'New Radiance - Palm Beach Gardens': 300,
  'New Radiance - Port St. Lucie': 300,
  'New Radiance - Wellington': 300,
  'Pur Skin Clinic - Edmonds': 300,
  'Pur Skin Clinic - Kirkland': 300,
  'Pur Skin Clinic - Seattle': 300,
  'SkynBar': 200,
  'Synergy - Kennewick': 300,
  'Synergy - Yakima': 300,
  'The Ageless Center': 250,
};

export const DAXXIFY_RECON = {
  'Aesthetic Clinique - Santa Rosa': 100,
  'Back to 30 - Boiling Springs': 100,
  'Back to 30 - Highway 14': 100,
  'Back to 30 - McBee': 100,
  'Back to 30 - Simpsonville': 100,
  'Curate Chattanooga': 100,
  'Curate Murfreesboro': 100,
  'Curate Nashville': 100,
  'Curate Ooltewah': 100,
  'Destination Aesthetics - El Dorado': 100,
  'Destination Aesthetics - Elk Grove': 100,
  'Destination Aesthetics - Folsom': 100,
  'Destination Aesthetics - Napa': 100,
  'Destination Aesthetics - Roseville': 100,
  'Destination Aesthetics - Sacramento': 100,
  'EsthetixMD - Bend': 100,
  'Ever/Body-Colleyville': 100,
  'Ever/Body-Flatiron': 100,
  'Ever/Body-Greenwich': 100,
  'Ever/Body-Logan Circle': 100,
  'Ever/Body-Williamsburg': 100,
  'Glo - Wilmington': 100,
  'Glo - Winterville': 100,
  'Living Young - Odessa': 100,
  'Living Young - Palm Harbor': 100,
  'Living Young - Seminole': 100,
  'Living Young - St. Petersburg': 100,
  'Mainline Center for Laser Surgery': 100,
  'Mainline Center For Laser Surgery': 100,
  'New Radiance - Boca Raton': 100,
  'New Radiance - Palm Beach Gardens': 100,
  'New Radiance - Port St. Lucie': 100,
  'New Radiance - Wellington': 100,
  'Pur Skin Clinic - Edmonds': 50,
  'Pur Skin Clinic - Kirkland': 50,
  'Pur Skin Clinic - Seattle': 50,
  'SkynBar': 100,
  'Synergy - Kennewick': 100,
  'Synergy - Yakima': 100,
  'The Ageless Center': 100,
};

const DYSPORT_DEFAULT_RATIO = 3;
const DAXXIFY_DEFAULT_RATIO = 1;
export const getDysportRatio = (c) => { const v = DYSPORT_RECON[c]; return v ? v / 100 : DYSPORT_DEFAULT_RATIO; };
export const getDaxxifyRatio = (c) => { const v = DAXXIFY_RECON[c]; return v ? v / 100 : DAXXIFY_DEFAULT_RATIO; };

// Brand buckets (matches the SQL CASE in DEMO_NEURO_UNITS_BRAND): 'botox','xeomin',
// 'dysport_raw','dysport_equiv','daxxify_raw','daxxify_equiv','other'.
// Convert one bucket's raw units to Botox-equivalent, attributed to a top-level
// brand key (botox/xeomin/dysport/daxxify). 'other' is ignored. Mirrors app.js.
export function brandEquiv(bucket, rawUnits, centerName) {
  const raw = parseFloat(rawUnits) || 0;
  switch (bucket) {
    case 'botox':         return { brand: 'botox',   units: raw };
    case 'xeomin':        return { brand: 'xeomin',  units: raw };
    case 'dysport_raw':   return { brand: 'dysport', units: raw / getDysportRatio(centerName) };
    case 'dysport_equiv': return { brand: 'dysport', units: raw };
    case 'daxxify_raw':   return { brand: 'daxxify', units: raw / getDaxxifyRatio(centerName) };
    case 'daxxify_equiv': return { brand: 'daxxify', units: raw };
    default:              return null; // 'other'
  }
}

export const NEURO_BRANDS = ['botox', 'xeomin', 'dysport', 'daxxify'];

// Provider scope gates (mirrors commercial-kd-live/app.js L712-720).
export const INJECTOR_TITLES = [
  'Nurse Practitioner', 'Physician Assistant', 'Medical Doctor',
  'Registered Nurse', 'Provider', 'Aesthetic Injector NP',
  'Aesthetic Injector PA', 'Licensed Practical Nurse',
  'Medical Director', 'Supervising Physicians', 'Managing Partner',
];
export const EXCLUDED_PROVIDERS = ['Neal Moores', 'Brian Reuben'];
