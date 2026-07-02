# Reconcile a finished month with Zenoti

`refresh-daily.cjs` only re-pulls the current week / lookback window, and its
durability clamps deliberately protect older committed weeks. So once a month
ages out it's frozen — while Corral (= Zenoti) keeps absorbing refunds/voids, so
the tracker drifts slightly **above** Zenoti (e.g. Avelure-Waterford Jun-2026:
committed $72,214 vs Zenoti $72,067.97).

`scripts/reconcile-month.cjs` is the intentional exception: it re-pulls a chosen
month and overwrites `daily-metrics` + `weekly-metrics` (center-level
`s`/`p`/`rt`/`inj`), **preserves collections** (`co`), then runs
`apply-exclusions.cjs` to recompute the Rev/Patient twins (`sx`/`px`) from the
fresh `s`/`p`. Result: **Sales and Rev/Patient tie to Zenoti** for that month.

> **Apples-to-apples:** tracker Sales = Zenoti **Sales-Accrual, Sales (Exc. Tax)**,
> item types **Service + Product**. `inj` uses the canonical injectables definition
> in `SYNC-INJECTABLES.md`. Compare in Zenoti with the Item Type filter set to
> Service + Product only.

---

## Step 1 — Pull the month's daily metrics → `scripts/qm-daily.json`

Rows `[{ d, c, s, p, rt, inj }]`, by center by day, for the target month.

> **Return money as integer cents** (`ROUND(x*100)`) — the Corral MCP truncates
> trailing decimals in its JSON, which silently loses ~$0.50/day. Divide by 100
> when writing the file.

```sql
SELECT
  CAST(sale_date AS DATE)                                   AS d,
  center_name                                              AS c,
  ROUND(SUM(CASE WHEN item_type IN ('Service','Product') THEN sales_exc_tax ELSE 0 END)*100) AS s_c,
  COUNT(DISTINCT CASE WHEN item_type IN ('Service','Product') THEN guest_id END)             AS p,
  ROUND(SUM(CASE WHEN item_type='Product' THEN sales_exc_tax ELSE 0 END)*100)               AS rt_c,
  ROUND(SUM(CASE WHEN item_category='Injectables'
    AND item_sub_category IN ('Dermal Filler','Neuromodulators','Biostimulator Filler','Kybella & Lipolysis','PRP & PRF','Injectables - Other')
    AND LOWER(item_name) NOT LIKE '%cancel%' AND LOWER(item_name) NOT LIKE '%no show%'
    AND LOWER(item_name) NOT LIKE '%no-show%' AND LOWER(item_name) NOT LIKE '%numbing%'
    AND LOWER(item_name) NOT LIKE '%lidocaine%'
    THEN sales_exc_tax ELSE 0 END)*100)                                                     AS inj_c
FROM use_dataset(1237)
WHERE CAST(sale_date AS DATE) >= '2026-06-01' AND CAST(sale_date AS DATE) < '2026-07-01'
  -- add:  AND center_name IN (SELECT center_name FROM use_dataset(751))   for the tracker center universe
  -- or a single center:  AND center_code = 'PS-07'
GROUP BY 1, 2 ORDER BY 1, 2;
```

Write `[{ "d", "c", "s": s_c/100, "p", "rt": rt_c/100, "inj": inj_c/100 }]`.

## Step 2 — Pull the month's weekly metrics → `scripts/qm-weekly.json`

Same columns but grouped by ISO week (`DATE_TRUNC('week', …)`). Weekly `p` is a
`COUNT(DISTINCT guest)` and **cannot** be summed from daily, so it needs its own
pull. Use `... >= '<month-start>' AND ... <= '<last-week-Sunday>'` so the week that
straddles the month end is complete (e.g. the `2026-06-29` week runs to `2026-07-05`).

```sql
SELECT
  CAST(DATE_TRUNC('week', CAST(sale_date AS DATE)) AS DATE) AS w,
  center_name AS c,
  ROUND(SUM(CASE WHEN item_type IN ('Service','Product') THEN sales_exc_tax ELSE 0 END)*100) AS s_c,
  COUNT(DISTINCT CASE WHEN item_type IN ('Service','Product') THEN guest_id END)             AS p,
  ROUND(SUM(CASE WHEN item_type='Product' THEN sales_exc_tax ELSE 0 END)*100)               AS rt_c,
  ROUND(SUM(CASE WHEN item_category='Injectables' AND item_sub_category IN
    ('Dermal Filler','Neuromodulators','Biostimulator Filler','Kybella & Lipolysis','PRP & PRF','Injectables - Other')
    AND LOWER(item_name) NOT LIKE '%cancel%' AND LOWER(item_name) NOT LIKE '%no show%'
    AND LOWER(item_name) NOT LIKE '%no-show%' AND LOWER(item_name) NOT LIKE '%numbing%'
    AND LOWER(item_name) NOT LIKE '%lidocaine%' THEN sales_exc_tax ELSE 0 END)*100)         AS inj_c
FROM use_dataset(1237)
WHERE CAST(sale_date AS DATE) >= '2026-06-01' AND CAST(sale_date AS DATE) <= '2026-07-05'
GROUP BY 1, 2 ORDER BY 1, 2;
```

## Step 3 — Pull the month's Rev/Patient exclusion input → `scripts/q-revpat-center.json`

So Rev/Patient ties. This is `SYNC-EXCLUSIONS.md` query #1 with the month window
(cover the same weeks as Step 2). Optionally also pull #2 →
`scripts/q-revpat-provider.json` for provider Rev/Patient. If you skip this, Sales
still ties but Rev/Patient falls back to raw `s` (the app's `sx ?? s`).

> To also reconcile Cancel/No-Show and Botox for the month, pull the other
> `SYNC-EXCLUSIONS.md` inputs (#3–#6) with the month window too — `reconcile-month`
> calls `apply-exclusions`, which picks up whatever inputs are present.

## Step 4 — Reconcile

```bash
node scripts/reconcile-month.cjs --dry-run --center "Avelure-Waterford"   # preview
node scripts/reconcile-month.cjs                                          # apply + exclusions
```

Only the `(day/week, center)` pairs present in the inputs are replaced, so a
single-center or partial pull never deletes other centers' data. Collections are
preserved. The spot-check Sales should equal Zenoti's Sales-Accrual
(Service + Product, exc-tax) to within display rounding.

## Step 5 — Build, deploy, clean up

```bash
npm run build
git add -A && git commit -m "chore: reconcile <month> with Corral" && git push origin main
rm -f scripts/qm-*.json scripts/q-revpat-*.json   # transient inputs (git-ignored anyway)
```

---

## Notes
- **Scope:** center-level (KPI tiles + weekly Revenue chart + Rev/Patient). Provider
  cards (Section C) and ops/botox are only reconciled if you also drop their
  month-wide inputs (provider metrics feeds + the other `SYNC-EXCLUSIONS.md` pulls).
- **Provider-feed guard:** `apply-exclusions` also rewrites provider `sx`/`revx`
  whenever `q-revpat-center.json` is present. If you did NOT supply
  `q-revpat-provider.json`, `reconcile-month` snapshots the provider feeds
  (`weekly-/daily-metrics-provider`, `daily-rev-coll-provider`) and restores them
  after, so a center-only reconcile never zeroes provider exclusions. Supply
  `q-revpat-provider.json` (SYNC-EXCLUSIONS #2) to reconcile Section C too.
- Large fleet pulls exceed the MCP's inline limit and **auto-save to a
  `…/tool-results/…txt` file** (`{data,columns}`); read that file and reshape the
  cent columns (`s_c/100`, …) — don't hand-transcribe. Daily is ~1,800 rows/month
  (under the 3k cap); pull per-month to stay under it.
- Inputs are git-ignored (`scripts/q*.json`), like the daily `q1.json`…`q17.json`.
- A reconcile is a **moment-in-time** tie: the tracker is a snapshot, so a month can
  drift again as new refunds post. Re-run when precision matters (e.g. at close).
- Prevention (less drift between reconciles): widen the daily `q8`/`q9` lookback in
  the daily refresh from ~7 days toward ~6 weeks so recent months self-heal.
