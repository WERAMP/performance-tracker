# Pre-deploy checklist — botox <10u toggle + rev/patient fee exclusion

Two features are staged on **localhost only** (built by editing finished data files).
Before deploying, make them **durable across the daily refresh**, then deploy.
Until then, do NOT just commit the current data files — the next daily refresh
would regenerate them without the new fields.

## Status of staged work (in `performance-tracker-live`)
- **Botox "Exclude <10u" toggle** — `src/components/PerformanceTracker.jsx`
  (ToggleSwitch + dual data load) + filtered feeds `weekly-btx-ge10.json`,
  `weekly-btx-provider-ge10.json`, `daily-btx-provider-ge10.json`.
- **Avg Revenue per Patient excludes no-show/cancellation fees** — component
  rewired to `sx`/`px`/`revx`; twins added to `weekly-metrics.json`,
  `daily-metrics.json`, `weekly-metrics-provider.json`,
  `daily-metrics-provider.json`, `daily-rev-coll-provider.json`.
- Transformation scripts (permanent): `scripts/apply-revpatient-exclusions.cjs`,
  `scripts/build-btx-ge10.cjs`, `scripts/apply-ops-exclusions.cjs`,
  `scripts/apply-ops-provider-exclusions.cjs`.
- DONE (this commit): safety-net fallback added to the component (reads `sx ?? s`,
  `px ?? p`, `revx ?? rev`) so a refresh missing the twins degrades gracefully.

## DO AT DEPLOY TIME

### 1. Make rev/patient fee-exclusion durable
- Add 2 Corral queries to the daily query set, output saved as input files:
  - center-week fees: `(c, w, fee_rev, fee_only_pt)`
  - provider-week fees: `(c, pr, w, fee_rev, fee_only_pt)`
  - (fee = item_name ILIKE no show / no-show / cancellation / cancel;
     fee_only_pt = guests with a fee but no non-fee Service/Product that week)
- Update `scripts/refresh-daily.cjs` to write, on the metrics feeds:
  `sx = s − fee_rev`, `px = p − fee_only_pt`, and `revx = rev − fee_rev`
  (daily feeds: spread weekly fee /7 across the week's 7 days).
  Logic already exists in `scripts/apply-revpatient-exclusions.cjs` — port it in.

### 2. Make botox <10u feeds durable
- Add the `≥10u` botox query (unit = SUM(qty) where qty>1, keep appts ≥10 units)
  to the daily query set and have `refresh-daily.cjs` also emit the three
  `*-btx*-ge10.json` files each run. Logic in `scripts/build-btx-ge10.cjs`.

### 2b. Make consult/GFE/vitamin exclusion durable
- Rev/Patient: the `sx`/`px` adjustment (now broadened to exclude **no-show/cancellation
  fees + Consultation/GFE + Wellness `IVs & Vitamin Injections`**) must be reproduced by
  the refresh — same mechanism as #1 (logic in `scripts/apply-revpatient-exclusions.cjs`, the
  `is_excl` set).
- Appointments: `weekly-ops.json` + `weekly-ops-provider.json` cancellation/no-show
  (`cn`/`ns`/`t`) recomputed from dataset **754**, excluding appointment groups whose
  service is **Consultation-only or Wellness-only** (logic in
  `scripts/apply-ops-exclusions.cjs` and `apply-ops-provider-exclusions.cjs`).
  Fold these into the daily ops query/transform.
- NOTE: 754 has no sub-category, so vitamin injections in the *appointment* metric are
  approximated by the whole **Wellness** category (broader than just vitamins). The
  rev/patient side uses 1237's exact sub-category and is precise.

### 3. Safety net in the app
- Component: read `r.sx ?? r.s` and `r.px ?? r.p` for rev/patient so a refresh
  missing the twins degrades to old (with-fees) numbers instead of blank.

### 4. Clean up + deploy
- Done: temp diagnostics removed; transformation scripts kept under permanent names.
- `npm run build`, commit, `git push origin main`.
- Cloudflare Pages (`performance-tracker-dhi.pages.dev`) auto-deploys; the
  `amp-router` Worker serves it at `ampintelligence.ai/tracker`.
- Verify the live `*-ge10.json` and `sx/px` fields are present after the build.

### 5. Update the refresh runbook
- Document the extra queries in a refresh runbook (pattern: `scripts/SYNC-FROM-CORRAL.md`)
  so future daily refreshes keep reproducing all the above.
