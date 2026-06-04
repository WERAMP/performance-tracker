# Re-syncing tracker budgets from Corral

This is the deployable runbook for re-syncing the Performance Tracker's
**revenue and collections targets** from Corral (`api.corraldata.com`). Run it
whenever the monthly goals change in the source.

It fixes the two problems the old Google-Sheet CSV approach had:

| Symptom | Cause | Fix here |
|---|---|---|
| A location shows **no target** (e.g. Avelure-Buffalo) | Some sheet cells are typed as `"$107,481"`; the CSV parser produced `NaN → 0` | Corral returns clean numbers; the script also strips `$`/commas defensively |
| Collections target just **mirrors revenue** (e.g. Avelure-Creve Coeur) | The CSV had only one metric (accrual revenue) | Collections comes from its **own** Corral feed (see step 2); if absent, it's left **blank** instead of faked |

The transform script (`sync-budgets-from-corral.cjs`) does **not** call Corral
directly — Corral auth lives in the Corral MCP connector inside Claude. So the
flow is: **Claude pulls the data → you save it → the script transforms it.**

---

## Prerequisites
- This repo checked out, `npm install` done.
- Claude with the **Corral** connector enabled (the `corraldata.com` MCP) and
  access to the **`amp-organization`** customer.

---

## Step 1 — Pull the REVENUE goals (required)

In Claude, run this against Corral (customer **`amp-organization`**) and save the
**raw JSON result** to `scripts/.corral-cache/revenue-goals.json`:

```sql
SELECT location, center_id, month, goal, daily_goal
FROM google_sheets.practice_location_monthly_goals
WHERE goal IS NOT NULL AND goal <> ''
ORDER BY location, month;
```

Each row needs `location`, `center_id`, `month` (`M/D/YYYY`), `goal`, `daily_goal`.
A `{ "data": [ ... ] }` wrapper is fine (it's the raw MCP result shape).

> **Large results:** these feeds are ~2,000 rows. The Corral MCP will say the
> result is too large and **auto-save it to a `…/tool-results/…execute_sql….txt`
> file** — just copy that file to the cache path above.

## Step 2 — Pull the COLLECTIONS (cash) goals

Collections targets live in a **separate** ingested sheet,
`google_sheets_monthly_goals_cash.table` (the "cash goals" the PM-dashboard
Collections widget uses). Run this against **`amp-organization`** and save to
`scripts/.corral-cache/collections-goals.json`:

```sql
SELECT location, center_id, month, goal, daily_goal
FROM google_sheets_monthly_goals_cash.table
WHERE goal IS NOT NULL AND goal <> ''
ORDER BY location, month;
```

> **Why `center_id` matters:** the cash sheet names some sites differently from
> the revenue sheet (e.g. `OK-Tulsa` vs `H-MD Medical Spa - Tulsa`,
> `OK-Oklahoma City` = Chisholm Creek, `TN-Knoxville`/`TN-Nashville` = Curate).
> The script joins collections to the right tracker center by `center_id`, so
> these resolve automatically — **keep `center_id` in both queries.**
>
> If this file is absent, collections targets are left **blank** (no goal shown)
> — the script never mirrors revenue into collections.

## Step 3 — Transform into the tracker's budget feeds

```bash
node scripts/sync-budgets-from-corral.cjs
```

This regenerates, in both `public/` and `dist/`:
- `data/performance/monthly-budget.json` — exact monthly goals (drives the
  location-card period/Total-Month numbers, YTD table, monthly chart bars).
- `data/performance/weekly-budget.json` — weekly bars for the rev/coll charts.

Read the printed report: confirm the center counts, the carried-over center
(`Destination Aesthetics - Napa`, which has no Corral goal), and the
Highway 14 spot-check.

## Step 4 — Build, commit, deploy

```bash
npm run build
git add -A
git commit -m "chore: re-sync budgets from Corral"
git push origin main
```

Cloudflare Pages (`performance-tracker-dhi.pages.dev`) auto-deploys on push to
`main`; the `amp-router` Worker serves it at `ampintelligence.ai/tracker`.
Verify on the live backend without logging in:

```bash
curl -s https://performance-tracker-dhi.pages.dev/data/performance/monthly-budget.json \
  | node -e "const m=JSON.parse(require('fs').readFileSync(0));console.log(m.find(r=>r.c==='Avelure-Buffalo'&&r.m==='2026-06'))"
```

---

## Notes
- **Name mapping:** Corral location names map 1:1 to tracker center names except
  for the few in `NAME_MAP` at the top of `sync-budgets-from-corral.cjs`
  (Curate, H-MD, `Mainline - Ardmore`). Add to that map if a new location's
  Corral name differs from its tracker name.
- **Why no auto-build hook:** because the data comes through Claude/Corral (not a
  headless fetch), this is a deliberate manual re-sync — `npm run build` no
  longer regenerates budgets, so it can't clobber a fresh Corral sync.
- `scripts/.corral-cache/` is git-ignored; the saved query results never get
  committed.
