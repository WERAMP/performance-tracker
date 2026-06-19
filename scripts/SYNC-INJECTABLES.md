# Daily refresh — canonical "Total Injectables Sales" definition

The tracker's injectable-revenue fields (`inj` on q1/q8/q10, `r` on q11) MUST use the
**canonical injectables definition** agreed with v_KD (`ampintelligence.ai/commercial-kd`)
on 2026-06-18. This file is the durable record of that definition so every daily refresh
keeps producing canonical numbers. (The daily q1/q8/q10/q11 SQL is run by hand via the
Corral MCP and is not otherwise stored in the repo.)

> Run against Corral customer **`amp-organization`**. Center/provider attribution and the
> rest of each query (s / p / rt, center scoping, etc.) are **unchanged** — only the
> injectable-revenue expression below is canonical.

## Canonical definition

```
item_category = 'Injectables'
AND item_sub_category IN (
  'Dermal Filler',
  'Neuromodulators',
  'Biostimulator Filler',
  'Kybella & Lipolysis',
  'PRP & PRF',
  'Injectables - Other'
)
-- 'Threads' intentionally EXCLUDED — revisit if Threads revenue should count
AND LOWER(item_name) NOT LIKE '%cancel%'
AND LOWER(item_name) NOT LIKE '%no show%'
AND LOWER(item_name) NOT LIKE '%no-show%'
AND LOWER(item_name) NOT LIKE '%numbing%'
AND LOWER(item_name) NOT LIKE '%lidocaine%'
-- metric = SUM(sales_exc_tax)
```

---

## q1 (weekly rev by center) · q8 (daily rev by center) · q10 (metrics by provider)

These each emit an `inj` column alongside their other fields. Replace **only** the `inj`
expression with the canonical CASE WHEN (use the query's own table alias in place of `s`):

```sql
ROUND(SUM(CASE WHEN s.item_category = 'Injectables'
  AND s.item_sub_category IN ('Dermal Filler','Neuromodulators','Biostimulator Filler','Kybella & Lipolysis','PRP & PRF','Injectables - Other')
  AND LOWER(s.item_name) NOT LIKE '%cancel%'
  AND LOWER(s.item_name) NOT LIKE '%no show%'
  AND LOWER(s.item_name) NOT LIKE '%no-show%'
  AND LOWER(s.item_name) NOT LIKE '%numbing%'
  AND LOWER(s.item_name) NOT LIKE '%lidocaine%'
  THEN s.sales_exc_tax ELSE 0 END), 2) AS inj
```

Leave the rest of q1/q8/q10 exactly as-is. Save results to `scripts/q1.json`,
`scripts/q8.json`, `scripts/q10.json`.

## q11 (injectable revenue by provider) — full canonical query

q11 is entirely injectable revenue, so the canonical filter goes in the `WHERE`/`HAVING`.
It emits the **trailing 4 weeks** (`replaceWeeks` in refresh-daily.cjs §9 self-heals
partial-week captures from flat_file lag). Save to `scripts/q11.json`.

```sql
SELECT
  CAST(DATE_TRUNC('week', CAST(f.sale_date AS DATE)) AS DATE) AS w,
  f.center_name AS c,
  TRIM(f.serviced_by) AS pr,
  ROUND(SUM(f.sales_exc_tax), 2) AS r
FROM use_dataset(1237) f
WHERE CAST(f.sale_date AS DATE) >= DATE_TRUNC('week', CURRENT_DATE - INTERVAL '3 weeks')
  AND f.item_category = 'Injectables'
  AND f.item_sub_category IN ('Dermal Filler','Neuromodulators','Biostimulator Filler','Kybella & Lipolysis','PRP & PRF','Injectables - Other')
  AND LOWER(f.item_name) NOT LIKE '%cancel%'
  AND LOWER(f.item_name) NOT LIKE '%no show%'
  AND LOWER(f.item_name) NOT LIKE '%no-show%'
  AND LOWER(f.item_name) NOT LIKE '%numbing%'
  AND LOWER(f.item_name) NOT LIKE '%lidocaine%'
  AND (f.center_name IN (SELECT center_name FROM use_dataset(751)) OR f.center_name = 'H-MD-Gaillardia')
  AND TRIM(f.serviced_by) IS NOT NULL
  AND TRIM(f.serviced_by) != ''
GROUP BY 1, 2, 3
HAVING SUM(f.sales_exc_tax) > 0
ORDER BY 1, 2, 3
```

---

## Provider retail (`rt`) — attribute by sold_by, not serviced_by

Retail = `item_type = 'Product'`, and products are attributed to **`sold_by`** (the
seller), not `serviced_by` (the service provider). The provider feeds group by
`serviced_by`, so a provider's retail was missing (e.g. Kelly Richards @ Blush-Enfield
showed Retail % = 0 despite real retail sales — her products have no `serviced_by`).

Canonical provider definition (agreed 2026-06-18, mirrors the location metric
`Product / (Services + Product)`):
- `rt` (provider) = `SUM(sales_exc_tax) WHERE sold_by = pr AND item_type = 'Product'`
- sales base `s` / `rev` = `(serviced_by sales − old serviced retail) + sold_by retail`
  — i.e. strip whatever retail was caught under `serviced_by` and add the `sold_by` retail.

So q10's `rt`/`s` (and q8 daily) must compute retail from `sold_by` Products and fold it
into the sales base. A one-off full-history recompute of `rt`/`s`/`rev` across
`weekly-/daily-metrics-provider` and `weekly-/daily-rev-coll-provider` was applied
2026-06-18 (sumRt $2.62M → $3.48M). Pull pattern: provider-week retail =
`sold_by` Products grouped by `(week, center, sold_by)`, restricted to sellers who also
appear as `serviced_by` (the provider universe).

## Notes

- **`refresh-daily.cjs` only replaces the current week** (q1/q8/q10) / trailing 4 weeks
  (q11). It does **not** re-canonicalize history. A one-off full-history recompute of the
  `inj`/`r` fields across all feeds was applied **2026-06-18** (center-week, center-day,
  provider-week) — weekly-metrics dropped ~$1.6M (Threads + noise) to **$98.60M** all-history.
- To redo a **full-history** canonicalization (e.g. if the definition changes again):
  pull canonical center-week, center-day, and provider-week (serviced_by) from
  `use_dataset(1237)` and rewrite only the `inj`/`r` fields in `weekly-metrics`,
  `daily-metrics`, `weekly-metrics-provider`, `weekly-inj-rev-provider`, and the daily
  twins. The Corral MCP caps results at 3000 rows — paginate with `OFFSET/LIMIT` and pad
  rows so each page auto-saves to a file (see the operator's MCP notes).
- **Per-practice manual backfill** of `weekly-inj-rev-provider.json` uses the same
  canonical filter — see the SQL comment in `apply-injrev-backfill.cjs`.
- v_KD applies an additional **injector-role join** (only revenue sold by injectors);
  the tracker counts all staff. That scope difference is intentional and is NOT part of
  this canonical definition.
