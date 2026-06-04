# Handoff — Tracker budget targets now sourced from Corral

**For:** Kieren · **Repo:** `WERAMP/performance-tracker` · **Deploys to:** `ampintelligence.ai/tracker`

## TL;DR
The Performance Tracker's **revenue & collections targets** now come from **Corral**
(`corraldata.com`, customer `amp-organization`) instead of the Google-Sheet CSV
export. This fixes three things:

1. **Locations showing no target** (e.g. *Avelure Buffalo*) — the CSV export typed
   some goals as `"$107,481"`, which parsed to `NaN → 0`. Corral returns clean
   numbers (and the script strips `$`/commas defensively).
2. **Collections faking the revenue number** (e.g. *Avelure Creve Coeur*) — there is
   no collections metric in the revenue sheet, so it had been mirroring revenue.
   Collections now come from the **separate cash-goals sheet** and are distinct.
3. **Period / month target math** is now exact (each calendar day billed at its own
   month's rate; a full month equals the sheet goal to the dollar).

## What changed in the repo
| File | Change |
|---|---|
| `scripts/sync-budgets-from-corral.cjs` | **NEW** — the re-sync transform |
| `scripts/SYNC-FROM-CORRAL.md` | **NEW** — the runbook (exact Corral SQL + steps) |
| `package.json` | adds `npm run sync:budgets`; **removes** the old auto-`prebuild` so a build can't clobber a fresh sync |
| `.gitignore` | ignores `scripts/.corral-cache/` (the saved query dumps) |
| `scripts/build-budget-from-sheet.cjs` | **REMOVED** — old CSV approach, source of the `$` bug |
| `public/` + `dist/` `weekly-budget.json`, `monthly-budget.json` | regenerated from Corral (revenue + collections) |

> The tracker UI itself (reading `monthly-budget.json` + the day-accurate target
> math) was already shipped to `main` in an earlier commit, so it's live already —
> this handoff is the **data-source switch + collections fix**.

## Data sources (Corral, customer `amp-organization`)
- **Revenue:** `google_sheets.practice_location_monthly_goals`
- **Collections (cash):** `google_sheets_monthly_goals_cash.table`
- The two sheets name some sites differently (cash uses `OK-Tulsa`, `OK-Oklahoma City`
  = Chisholm Creek, `TN-Knoxville/Nashville` = Curate), so the script joins
  collections to the right tracker center by **`center_id`**.

## Deploy steps
1. Apply the changes: `git apply budget-corral-sync.patch` (from repo root), **or** copy
   the files in `files/` into place. The patch is against current `main`.
2. **Re-sync fresh from Corral** (recommended — see `scripts/SYNC-FROM-CORRAL.md`):
   in Claude with the Corral connector (`amp-organization`), run the two SQL queries,
   save each result to `scripts/.corral-cache/{revenue,collections}-goals.json`, then:
   ```bash
   npm run sync:budgets
   ```
   (The patch also includes a ready-made snapshot of the budget JSON if you'd rather
   deploy as-is without re-running.)
3. `npm run build`
4. Commit & push to `main`:
   ```bash
   git add -A && git commit -m "chore: sync tracker budgets from Corral (revenue + collections)" && git push origin main
   ```
   Cloudflare Pages (`performance-tracker-dhi.pages.dev`) auto-deploys; the
   `amp-router` Worker serves it at `ampintelligence.ai/tracker`.
5. Verify on the live backend (no login needed):
   ```bash
   curl -s https://performance-tracker-dhi.pages.dev/data/performance/monthly-budget.json \
     | node -e "const m=JSON.parse(require('fs').readFileSync(0));for(const c of ['Avelure-Buffalo','Avelure-Creve Coeur']){const r=m.find(x=>x.c===c&&x.m==='2026-06');console.log(c,'rev',r.b,'coll',r.cb);}"
   ```

## Notes
- Locations with a `0`/blank goal in Corral (e.g. *Ever/Body-Bethesda Row* = `0` in the
  sheet) show **no target** — by design; fix the source sheet to give them one.
- This changes **targets only**. The `$0` MTD "actuals" are a *separate* feed — the daily
  Zenoti refresh (`scripts/refresh-daily.cjs`), last run "data through 2026-05-31." June
  actuals appear once that daily job runs; unrelated to this change.
- To re-sync any time goals change, just repeat steps 2–4. Full runbook:
  `scripts/SYNC-FROM-CORRAL.md`.
