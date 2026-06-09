# Daily refresh — metric exclusion inputs

`scripts/apply-exclusions.cjs` runs automatically at the end of `refresh-daily.cjs`.
It re-applies the metric exclusions so they survive every refresh:

- **Avg Revenue per Patient** excludes no-show/cancellation **fees + Consultation/GFE +
  Wellness vitamin/IV** from revenue (`sx`), patients (`px`), and provider revenue (`revx`).
- **Cancellation / No-Show** excludes **Consultation-only & Wellness-only** appointment
  groups (dataset 754) from `cn` / `ns` / `t`.
- **Botox "Exclude <10u"** rebuilds the `*-btx*-ge10` feeds (units = `SUM(qty>1)`, keep
  appointments with `>= 10` units).

To feed it, run these 5 queries against Corral (customer **`amp-organization`**) as part
of the daily pull and save each raw result to the path shown. All inputs are **optional** —
if one is missing, that part is skipped and the app falls back to raw values (it can't
break the refresh). Each query pulls a rolling 5-week window (self-heals recent weeks);
older weeks keep the values from prior runs.

> Large results auto-save to a `…/tool-results/…txt` file — copy its `.data` array to the
> path below (the file just needs to be a JSON array of the rows).

---

## 1 → `scripts/q-revpat-center.json`  `[{c,w,fee_rev,fee_only_pt}]`
```sql
WITH base AS (
  SELECT center_name AS c, DATE_TRUNC('week', DATE(sale_date))::date AS w,
         guest_id, sales_exc_tax, item_type,
         ((item_name ILIKE '%no show%' OR item_name ILIKE '%no-show%'
           OR item_name ILIKE '%cancellation%' OR item_name ILIKE '%cancel%')
          OR item_category = 'Consultation'
          OR item_sub_category IN ('IVs & Vitamin Injections','Vitamin Injection')) AS is_excl
  FROM use_dataset(1237)
  WHERE DATE(sale_date) >= DATE_TRUNC('week', CURRENT_DATE) - INTERVAL '4 weeks'
),
g AS (
  SELECT c, w, guest_id,
    SUM(CASE WHEN is_excl AND item_type IN ('Service','Product') THEN sales_exc_tax ELSE 0 END) AS gex,
    MAX(CASE WHEN is_excl THEN 1 ELSE 0 END) AS he,
    MAX(CASE WHEN (NOT is_excl) AND item_type IN ('Service','Product') THEN 1 ELSE 0 END) AS hr
  FROM base GROUP BY c, w, guest_id
)
SELECT c, w::text AS w, ROUND(SUM(gex)::numeric,2) AS fee_rev,
       SUM(CASE WHEN he=1 AND hr=0 THEN 1 ELSE 0 END) AS fee_only_pt
FROM g GROUP BY c, w HAVING SUM(CASE WHEN he=1 THEN 1 ELSE 0 END) > 0 ORDER BY c, w;
```

## 2 → `scripts/q-revpat-provider.json`  `[{c,pr,w,fee_rev,fee_only_pt}]`
Same as #1 but add `COALESCE(serviced_by, sold_by) AS pr` to `base`, `WHERE pr IS NOT NULL`,
and group by `c, pr, w`.

## 3 → `scripts/q-ops-keep-center.json`  `[{c,w,t_keep,can_keep,ns_keep}]`
```sql
WITH grp AS (
  SELECT center_name AS c, DATE_TRUNC('week', appt_date)::date AS w, appointment_group_id AS g,
    MAX(CASE WHEN service_category IS NULL OR service_category NOT IN ('Consultation','Wellness') THEN 1 ELSE 0 END) AS has_keep,
    MAX(CASE WHEN cancel_or_no_show_status='-1' THEN 1 ELSE 0 END) AS is_can,
    MAX(CASE WHEN cancel_or_no_show_status='-2' THEN 1 ELSE 0 END) AS is_ns
  FROM use_dataset(754)
  WHERE appt_date >= DATE_TRUNC('week', CURRENT_DATE) - INTERVAL '4 weeks'
  GROUP BY 1,2,3
)
SELECT c, w::text AS w,
  SUM(has_keep) AS t_keep,
  SUM(CASE WHEN has_keep=1 THEN is_can ELSE 0 END) AS can_keep,
  SUM(CASE WHEN has_keep=1 THEN is_ns ELSE 0 END) AS ns_keep
FROM grp GROUP BY c, w ORDER BY c, w;
```

## 4 → `scripts/q-ops-keep-provider.json`  `[{c,pr,w,t_keep,can_keep,ns_keep}]`
Same as #3 but add `MAX(therapist_first_name || ' ' || therapist_last_name) AS pr` in `grp`,
group the outer query by `c, pr, w`, and `WHERE pr IS NOT NULL`.

## 5 → `scripts/q-btx-ge10.json`  `[{c,pr,w,n,total_qty}]`
```sql
WITH ip AS (
  SELECT center_name AS c, DATE_TRUNC('week', DATE(sale_date))::date AS w,
         invoice_id, COALESCE(serviced_by, sold_by) AS pr,
         SUM(CASE WHEN qty > 1 THEN qty ELSE 0 END) AS units
  FROM use_dataset(1237)
  WHERE item_sub_category='Neuromodulators' AND item_type='Service'
    AND item_name NOT ILIKE '%cancellation%'
    AND item_name NOT ILIKE '%no show%' AND item_name NOT ILIKE '%no-show%'
    AND DATE(sale_date) >= DATE_TRUNC('week', CURRENT_DATE) - INTERVAL '4 weeks'
  GROUP BY 1,2,3,4
  HAVING SUM(CASE WHEN qty > 1 THEN qty ELSE 0 END) >= 10
)
SELECT c, pr, w::text AS w, COUNT(*) AS n, SUM(units) AS total_qty
FROM ip WHERE pr IS NOT NULL GROUP BY c, pr, w ORDER BY c, w, pr;
```

---

## Notes
- These inputs are git-ignored (transient, like `q1.json`…`q17.json`).
- `apply-exclusions.cjs` only touches the weeks present in the inputs, so a rolling
  window keeps recent weeks correct without rewriting history.
- Vitamin injections in the **appointment** metric (#3/#4) are approximated by the whole
  **Wellness** `service_category` (754 has no sub-category). The rev/patient side (#1/#2)
  uses 1237's exact `IVs & Vitamin Injections` sub-category and is precise.
- One-time historical backfill (all weeks, not just rolling) was applied at deploy; this
  runbook keeps it current going forward.
