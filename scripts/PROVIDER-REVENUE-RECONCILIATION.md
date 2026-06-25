# Durable fix — provider revenue staleness ("Total Revenue" mismatch)

> **Status: design / proposed.** Diagnosed 2026-06-24 from the Avelure-Buffalo
> report (Amanda Lopez "Total Revenue" showed **$27,925** vs the Zenoti
> Sales-Accrual truth of **$25,249**). A localhost-only reheal of Avelure-Buffalo
> proved the fix (see "Interim reheal" below). This doc is the durable solution so
> the whole platform stops drifting — it is **not yet applied to the refresh**.

---

## 1. Symptom

Provider-card **Total Revenue** (Section C) overstates actual revenue. For
Avelure-Buffalo / Amanda Lopez, May 2026:

| Source | May 1–31 Total Revenue |
|---|---|
| Tracker card (before) | $27,925 |
| Zenoti Sales-Accrual (truth) | $25,248.52 |
| Canonical definition recomputed from Corral | $25,248.52 |

The card's own definition recomputes to the Zenoti number — so the **displayed
value did not match its own definition.** The error is in the committed data
feed, not the front-end math.

## 2. The definition (authoritative)

Provider `s` / `rev` = **services credited to `serviced_by` + products credited
to `sold_by`**, summed as `sales_exc_tax`, on dataset **1237**:

```sql
-- services -> serviced_by ;  products -> sold_by
SUM(CASE
      WHEN COALESCE(item_type,'') <> 'Product' AND TRIM(serviced_by) = :pr THEN sales_exc_tax
      WHEN item_type = 'Product'              AND TRIM(sold_by)     = :pr THEN sales_exc_tax
      ELSE 0 END)
```

This matches the canonical retail attribution in
[`SYNC-INJECTABLES.md`](SYNC-INJECTABLES.md) (strip serviced-retail, add
sold_by-retail). **Two gotchas that caused false diagnoses:**

- `item_type <> 'Product'` **silently drops NULL `item_type` rows** (surgical
  line items at e.g. 22 Plastic Surgery). Always use `COALESCE(item_type,'') <> 'Product'`.
- Center / provider **names differ between the feed and dataset 1237** — see §5.

## 3. Root cause

`refresh-daily.cjs` **freezes committed weekly history**: by design it only
writes the current week (`replaceWeek`), the trailing ~4 weeks (`replaceWeeks`),
or the daily lookback window, and **drops any q-file rows outside that window**
(see the durability note around [`refresh-daily.cjs:337`](refresh-daily.cjs#L337)
and [`:354`](refresh-daily.cjs#L354)).

That guard was added to stop a non-canonical / full-history pull on someone
else's machine from clobbering good history. But it has a failure mode: **if a
week is first captured while the upstream `flat_file` is still lagging
(partial/duplicated rows), the wrong value is frozen forever** — later, settled
data never corrects it. That is exactly the Amanda 2026-05-04 bucket: committed
**$10,889**, but the true settled value is **$7,467** (and *no* attribution basis
on current data exceeds **$8,817**, so it is unambiguously corrupt).

A secondary inflator: the daily feeds are produced by spreading weekly totals
`/7` ([`refresh-daily.cjs:468`](refresh-daily.cjs#L468)). At month boundaries
"Last Month" prorates the partial week 3/7 instead of using actual day sales, so
even correct weekly values don't sum to a true calendar month.

## 4. Durable fix — periodic reconciliation of *settled* weeks

Add a reconciliation pass that recomputes **settled** weeks from current Corral
data and overwrites committed values when they diverge. "Settled" = old enough
that `flat_file` has stopped moving (recommend **weeks whose Monday is ≥ 21 days
ago**). This keeps the existing freeze for *recent* weeks (protects against
mid-week non-canonical pulls) while letting *old* weeks self-heal.

**New script `scripts/reconcile-provider-revenue.cjs`:**

1. For each settled week present in `weekly-rev-coll-provider.json`, pull the
   canonical per-`(center, provider)` `s` and `rt` from Corral (definition in §2),
   grouped by `DATE_TRUNC('week', sale_date)`.
2. Normalize center & provider names through the maps in §5 before joining.
3. For each committed bucket, compare committed `rev` to canonical `s`:
   - **Hard rule (always overwrite):** committed `rev` exceeds the *ceiling*
     `SUM(sales WHERE serviced_by = pr OR sold_by = pr)` — impossible under any
     attribution → definitely corrupt.
   - **Soft rule (overwrite, configurable):** `abs(committed − canonical) >
     max($50, 1%)` → snapshot drift.
   - Leave buckets at name-unmatched centers untouched; log them for §5.
4. Rewrite `weekly-metrics-provider.json` `s`/`rt`, `weekly-rev-coll-provider.json`
   `rev`, and regenerate the daily twins. **Preserve** `coll` (separate cash
   feed), `p` (patient counts), and canonical `inj`.
5. Print a report: buckets changed, net $ correction, name-unmatched centers.

**Hook it into the daily refresh** (after the existing transforms in
`refresh-daily.cjs`) so it runs every pull — it only touches settled weeks, so it
can't fight the current-week capture. Pair it with the operator runbook the way
`apply-exclusions.cjs` is wired in (see [`DEPLOY-CHECKLIST.md`](../DEPLOY-CHECKLIST.md)).

### Stale detector (use as the reconciliation's core test)
The ceiling test is false-positive-free and robust to the §2 attribution nuance:

```sql
-- per (center, provider, week): committed rev > this ceiling  ==>  corrupt
SUM(CASE WHEN TRIM(serviced_by)=:pr OR TRIM(sold_by)=:pr THEN sales_exc_tax ELSE 0 END)
```

## 5. Name normalization (prerequisite — do first)

The provider feed and dataset 1237 disagree on some names; without a map the
reconciliation will wrongly zero out real revenue:

- **Center:** feed `Ever/Body-Greenwich` ↔ 1237 `Ever/Body-Greenwich Village`.
  Audit all 73 feed centers against `SELECT DISTINCT center_name FROM use_dataset(1237)`
  and build a `CENTER_NAME_MAP` (mirror the `NAME_MAP` pattern in
  [`sync-budgets-from-corral.cjs`](sync-budgets-from-corral.cjs)).
- **Provider:** name-order flips exist in older data, e.g. `Miller-Garlitz Brenda`
  vs `Brenda Miller-Garlitz`. Normalize before grouping.

## 6. Optional — kill the `/7` month-boundary error

The localhost reheal pulled **actual daily** provider revenue instead of weekly`/7`
and the Avelure card became exact ($25,248.52, not ~$827 high). To do this
platform-wide, add a daily-grain provider revenue query and write
`daily-rev-coll-provider.json` / `daily-metrics-provider.json` from real day
values rather than spreading. Weekly feeds can still be derived by summing days.

## 7. Store the source SQL in the repo

The q10/q12 provider queries are "run by hand via the Corral MCP and not otherwise
stored" — which is why this drift went undetected and is hard to reproduce. Commit
the canonical q10/q12 SQL next to `SYNC-INJECTABLES.md` so every operator and the
reconciliation script use the same definition.

---

## Interim reheal already applied (localhost only)

`scripts/_reheal-avelure.cjs` rebuilt **Avelure-Buffalo** rev/`s`/`rt` for
2026-04-27 → 06-21 from actual daily Corral values (preserving `coll`/`p`/`inj`).
Verified in the running app: Amanda Lopez "Total Revenue" = **$25,249** for May.
Originals are saved as `public/data/performance/*.bak.json`. This was **not
deployed** and is superseded by the platform-wide §4 fix.

## Known unrelated bug spotted while verifying
`PerformanceTracker.jsx:4705` throws React "Maximum update depth exceeded"
(setState inside a useEffect with an unstable dependency). Pre-existing, present
in production, and it makes headless screenshots hang. Worth a separate fix.
