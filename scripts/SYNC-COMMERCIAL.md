# Section E — Consultation Commercial Success Tracking (data refresh)

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
| `DEMO_NEURO_UNITS_BRAND` | `SUM(qty)` grouped by `brand_bucket` (CASE on item_name → botox/xeomin/dysport_raw/dysport_equiv/daxxify_raw/daxxify_equiv/other), `item_sub_category='Neuromodulators'`, `sales_exc_tax>0`, exclude cancel/no-show |
| `DEMO_MULTI_SYRINGE` | per-invoice `SUM(qty)>=3` filler syringes → count invoices with `=3`,`=4`,`>=5` |
| `DEMO_REV_PER_HOUR` | `SUM(sales_exc_tax) WHERE item_type='Service'` / `SUM(booked_hours)` from `zenoti_corp.transformed_employee_schedules` (grouped by period, staff, **practice** — no center) |
| `DEMO_TREND` | `total_sales`=`SUM(sales_exc_tax) WHERE item_type='Service'`; `unique_visits`=`COUNT(DISTINCT invoice_id)` **excluding consult-only & touch-up-only invoices** (see `consult_touchup_invoices` CTE); `rev_per_visit`=ratio |

Provider scope gate (in `src/commercialDefs.js`, applied in SQL + build):
`INJECTOR_TITLES` = NP, PA, MD, RN, Provider, Aesthetic Injector NP/PA, LPN, Medical Director, Supervising Physicians, Managing Partner; `EXCLUDED_PROVIDERS` = Neal Moores, Brian Reuben.

## Notes
- `.commercial-cache/` and `public/data/commercial/` are large; cache is git-ignored, feeds are committed.
- Botox-equiv conversion (Dysport/Daxxify per-center ratios) is **client-side** in `commercialDefs.js`, so feeds keep raw brand buckets.
- Two pipelines now compute these metrics (this + commercial-kd). If they drift, reconcile definitions here against `commercial-kd-live/app.js`.
