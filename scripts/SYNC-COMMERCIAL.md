# Section E — Consultation Commercial Success Tracking (data refresh)

> **Daily-refresh integration (2026-06-24).** Section E is now rebuilt by `refresh-daily.cjs`
> on every run — it calls `build-commercial.cjs` then `apply-commercial-accuracy.cjs` at the
> end (mirrors the `apply-exclusions` hook). **But the build only reflects fresh data if the
> `scripts/.commercial-cache/` is re-pulled as part of the daily Corral pull** (the build
> can't reach Corral itself — Corral is MCP/app-only). `build-commercial.cjs` prints a loud
> `⚠️ commercial cache STALE` warning if the cache's newest day is >2d old, so a missed pull
> is visible. Two cache pieces to refresh daily:
> 1. The `DEMO_*` arrays — bootstrap from `commercial-kd-live/data.js` (`bootstrap-commercial-cache.cjs`)
>    **only if that board itself ran today**, otherwise re-pull per the table below.
> 2. `ACCURATE_INJ_SPLIT.json` — the accurate filler/neuron split that keeps Section C
>    "Inj Revenue" == Section E "Total Injectables Sales" (and fills brands the commercial-kd
>    `sales_data` CTE misses entirely, e.g. New Radiance). Pull per (center, sold_by, day):
>    ```sql
>    SELECT CAST(f.sale_date AS DATE) AS d, f.center_name AS c, TRIM(f.sold_by) AS pr,
>      ROUND(SUM(CASE WHEN f.item_sub_category='Neuromodulators' THEN f.sales_exc_tax ELSE 0 END),2) AS neuro,
>      ROUND(SUM(CASE WHEN f.item_sub_category IN ('Dermal Filler','Biostimulator Filler') THEN f.sales_exc_tax ELSE 0 END),2) AS filler
>    FROM use_dataset(1237) f
>    WHERE f.item_category='Injectables'
>      AND f.item_sub_category IN ('Neuromodulators','Dermal Filler','Biostimulator Filler')
>      AND LOWER(f.item_name) NOT LIKE '%cancel%' AND LOWER(f.item_name) NOT LIKE '%no show%'
>      AND LOWER(f.item_name) NOT LIKE '%no-show%' AND LOWER(f.item_name) NOT LIKE '%numbing%' AND LOWER(f.item_name) NOT LIKE '%lidocaine%'
>      AND TRIM(COALESCE(f.sold_by,''))<>'' AND CAST(f.sale_date AS DATE) >= DATE '2026-01-01'
>    GROUP BY 1,2,3 HAVING ROUND(SUM(f.sales_exc_tax),2)<>0 ORDER BY 1,2,3;
>    ```
>    Save to `scripts/.commercial-cache/ACCURATE_INJ_SPLIT.json` as `{ "data": [ ... ] }`
>    (paginate per the 3000-row cap — see [[corral-mcp-row-cap]] — and merge).
>
> **Daily-units (the "Daily Trends" tab) can be refreshed straight from dataset 1237** — no
> dependence on the commercial-kd board (it lags). Pull per (day, center, sold_by) for the
> trailing ~30 days and save to `scripts/.commercial-cache/DEMO_DAILY_UNITS.json` as
> `{ "data":[ {day,staff_member,practice,center_name,botox_units,filler_syringes} ] }`:
> ```sql
> SELECT CAST(f.sale_date AS DATE) AS day, f.center_name, TRIM(f.sold_by) AS staff_member,
>   ROUND(SUM(CASE WHEN f.item_name='Botox One Unit' THEN f.qty ELSE 0 END),2) AS botox_units,
>   ROUND(SUM(CASE WHEN f.item_sub_category IN ('Dermal Filler','Biostimulator Filler') AND f.sales_exc_tax>0 THEN f.qty ELSE 0 END),2) AS filler_syringes
> FROM use_dataset(1237) f
> WHERE CAST(f.sale_date AS DATE) >= CURRENT_DATE - INTERVAL '30 days' AND TRIM(COALESCE(f.sold_by,''))<>''
> GROUP BY 1,2,3 HAVING SUM(CASE WHEN f.item_name='Botox One Unit' THEN f.qty ELSE 0 END)<>0
>   OR SUM(CASE WHEN f.item_sub_category IN ('Dermal Filler','Biostimulator Filler') AND f.sales_exc_tax>0 THEN f.qty ELSE 0 END)<>0;
> ```
> (Map `Ever/Body-Greenwich Village`→`Ever/Body-Greenwich`; attach `practice` from the centers
> map. NOTE: this omits the injector job-title gate — it includes any `sold_by` seller, which
> the board's gated query would drop. Close enough for the daily-units view; the monthly/weekly
> units, visits, trend and rev/hour still come from the board.)
>
> **Self-sufficient (no board) path for the CORE period metrics (2026-06-25).** The daily
> refresh now also runs `assemble-commercial-cache.cjs` (before `build-commercial`), which
> builds the `DEMO_*`/`DEMO_WEEKLY_*` cache files for the **core** Trends metrics —
> botox_units, filler_syringes, inj_visits, filler_sales/total_inj, neuro_rev, trend_sales,
> trend_visits — straight from dataset 1237 + the injector gate, no commercial-kd board needed.
> Refresh two pulls daily (paginate the 3000-row cap; older periods are kept from cache):
> save to `.commercial-cache/CORE_MONTHLY.json` (group `DATE_TRUNC('month', sale_date)`, ≥ start
> of the trailing window) and `.commercial-cache/CORE_WEEKLY.json` (`DATE_TRUNC('week', …)`),
> shape `{data:[{p,c,pr,botox_units_sold,filler_syringes_sold,inj_visits,filler_sales,
> total_injectables_sales,neuro_revenue,total_sales,unique_visits}]}`. The query (gate +
> consult/touch-up exclusion for `unique_visits`) is the consolidated `base`/`ct` SQL used on
> 2026-06-25 — see git history / the assembled cache. Map `Ever/Body-Greenwich Village`→`Ever/Body-Greenwich`.
>
> **All 3 secondary metrics now ALSO ported (2026-06-25) — Section E is fully Corral-driven.**
> `assemble-commercial-cache.cjs` now also builds, from these daily pull inputs (merge older
> periods from cache; map Greenwich; injector-gated via `zenoti_corp.employees`):
> - `.commercial-cache/MS_MONTHLY.json` / `MS_WEEKLY.json` → `DEMO_(WEEKLY_)MULTI_SYRINGE`
>   (per-invoice filler `SUM(qty)>=3`, count invoices =3/=4/>=5).
> - `.commercial-cache/BRAND_MONTHLY.json` / `BRAND_WEEKLY.json` → `DEMO_(WEEKLY_)NEURO_UNITS_BRAND`
>   (brand_bucket CASE on item_name + "Buy the Vial" unit parse `REGEXP_SUBSTR(item_name,'[0-9]+ *[Uu]nit')`).
> - `.commercial-cache/REVHOUR_MONTHLY.json` / `REVHOUR_WEEKLY.json` → `DEMO_(WEEKLY_)REV_PER_HOUR`
>   (service `SUM(sales_exc_tax)` by sold_by/practice LEFT JOIN `zenoti_corp.transformed_employee_schedules`
>   `SUM(booked_hours)` by full_name/practice, both injector-gated). Exact SQL: git history / `tmp-sqls/`.
>
> Net: the FULL daily commercial pull is now CORE_MONTHLY/WEEKLY, MS_MONTHLY/WEEKLY,
> BRAND_MONTHLY/WEEKLY, REVHOUR_MONTHLY/WEEKLY, DEMO_DAILY_UNITS, ACCURATE_INJ_SPLIT —
> all from dataset 1237 (+ employees/schedules), no commercial-kd board dependency.
>
> **Durable upstream fix still owed:** the commercial-kd `sales_data` CTE excludes brands like
> New Radiance entirely (shows $0) and lagged ~1-2 weeks. `apply-commercial-accuracy.cjs` only
> patches injectable *revenue*; the other Section E metrics (units, visits, trend, rev/hour)
> are still only as complete/fresh as commercial-kd. Fix the commercial-kd queries upstream to
> remove the patch's need.


Section E of the Location Performance Report reproduces the commercial-kd board's
**Monthly / Weekly / Daily Trends**, scoped to one location and toggleable by provider.
Its metrics are **re-derived from Corral with the same definitions as commercial-kd**, so
the numbers tie out to ampintelligence.ai/commercial-kd.

Pipeline: **Corral SQL → `scripts/.commercial-cache/<NAME>.json` → `build-commercial.cjs` →
`public/data/commercial/*.json`** (mirrored to `dist/`). The UI applies the Botox-equiv
brand conversion client-side (see `src/commercialDefs.js`).

## Fast path (bootstrap from the latest commercial-kd output)
The commercial-kd board already runs these exact queries and bakes the results into
`commercial-kd-live/data.js`. To seed/refresh the cache from it:
```
node scripts/bootstrap-commercial-cache.cjs   # reads ../../Corral/commercial-kd-live/data.js
node scripts/build-commercial.cjs
```

## Full re-derive (independent of commercial-kd)
Run these against Corral (customer **`amp-organization`**) and save each raw result to
`scripts/.commercial-cache/<NAME>.json` (`{ "data": [ ... ] }`; paginate per the 3000-row
cap — see [[corral-mcp-row-cap]] — and merge chunks), then run `build-commercial.cjs`.

All queries share the multi-practice **`sales_data`** CTE and the **injector** gate; full
canonical SQL is in `Consultation Commercial Tracking/tmp-sqls/*.sql` (the source the
commercial-kd build uses). Definitions to preserve exactly:

- **`sales_data`** = `UNION ALL` of each practice's `zenoti_<practice>.sales_accrual_flat_file`
  (+ `zenoti_corp.transformed_sales_accrual_flat_file_products_services WHERE practice IN ('Avelure','Ever/Body','Nouveau Day Spa')`), carrying `sale_date, invoice_id, sold_by, sold_by_id, center_id, item_type, item_name, item_category, item_sub_category, qty, sales_exc_tax, guest_id, practice`.
- Every metric joins `zenoti_corp.employees e ON sold_by_id=e.id AND center_id=e.center_id`
  and `zenoti_corp.centers c ON c.id=center_id`, filters `sale_date >= '2025-01-01'` and
  `e.job_info.name::varchar IN (INJECTOR_TITLES)`, groups by `(period, sold_by, practice, c.name)`.
- **Grain**: month = `DATE_TRUNC('month', sale_date)`; week = `DATE_TRUNC('iso week', sale_date)`; day = `DATE(sale_date)` (daily limited to last 30 days).

| Cache name (per grain prefix) | Metric definition |
|---|---|
| `DEMO_FILLER` (wk: from `DEMO_WEEKLY_UNITS`) | `SUM(qty)` where `item_sub_category IN ('Dermal Filler','Biostimulator Filler')`, `sales_exc_tax>0` → filler syringes |
| `DEMO_BOTOX` (wk: `DEMO_WEEKLY_UNITS`) | botox units sold (units table) |
| `DEMO_INJ_VISITS` | `COUNT(DISTINCT invoice_id)` where `item_category='Injectables'` |
| `DEMO_FILLER_PCT` | `filler_sales`=`SUM(sales_exc_tax)` over `('Dermal Filler','Biostimulator Filler','Kybella & Lipolysis')`; `total_injectables_sales`=`SUM(sales_exc_tax)` over the 5 sub-cats (`+'Neuromodulators','PRP & PRF'`), `item_category='Injectables'` |
| `DEMO_NEURO_REV` | `SUM(sales_exc_tax)` where `item_sub_category='Neuromodulators'` and item_name matches a neuro brand |
| `DEMO_NEURO_UNITS_BRAND` | units grouped by `brand_bucket` (CASE on item_name → botox/xeomin/dysport_raw/dysport_equiv/daxxify_raw/daxxify_equiv/other), `item_sub_category='Neuromodulators'`, `sales_exc_tax>0`, exclude cancel/no-show. **Vial rule:** for `item_type='Service'` lines whose name has "`N Unit(s)`" (e.g. "Botox 100 Units"), count `N × qty` (parsed via `REGEXP_SUBSTR(item_name,'[0-9]+ *[Uu]nit')`); else `qty`. Keeps "Buy the Vial" services from undercounting as 1. |
| `DEMO_MULTI_SYRINGE` | per-invoice `SUM(qty)>=3` filler syringes → count invoices with `=3`,`=4`,`>=5` |
| `DEMO_REV_PER_HOUR` | `SUM(sales_exc_tax) WHERE item_type='Service'` / `SUM(booked_hours)` from `zenoti_corp.transformed_employee_schedules` (grouped by period, staff, **practice** — no center) |
| `DEMO_TREND` | `total_sales`=`SUM(sales_exc_tax) WHERE item_type='Service'`; `unique_visits`=`COUNT(DISTINCT invoice_id)` **excluding consult-only & touch-up-only invoices** (see `consult_touchup_invoices` CTE); `rev_per_visit`=ratio |

Provider scope gate (in `src/commercialDefs.js`, applied in SQL + build):
`INJECTOR_TITLES` = NP, PA, MD, RN, Provider, Aesthetic Injector NP/PA, LPN, Medical Director, Supervising Physicians, Managing Partner; `EXCLUDED_PROVIDERS` = Neal Moores, Brian Reuben.

## Notes
- `.commercial-cache/` and `public/data/commercial/` are large; cache is git-ignored, feeds are committed.
- Botox-equiv conversion (Dysport/Daxxify per-center ratios) is **client-side** in `commercialDefs.js`, so feeds keep raw brand buckets.
- Two pipelines now compute these metrics (this + commercial-kd). If they drift, reconcile definitions here against `commercial-kd-live/app.js`.
