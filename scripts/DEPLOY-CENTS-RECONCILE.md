# Deploy: cents precision + Zenoti reconcile — and how it survives the daily refresh

Branch `cents-fix` (4 commits off `origin/main`):

1. `cfebf0e` — daily-metrics money fields (`s/co/rt/inj`) stored to the cent (`fd`
   helper); `fmtDollar` rounds at display so the UI stays whole-dollar.
2. `307f87f` — `reconcile-month.cjs` + `RECONCILE-MONTH.md` (re-pull a finished
   month so it re-ties to Zenoti).
3. `37a2d4c` — reconciled **all 67 centers for Q2 2026 (Apr–Jun)**: daily +
   weekly metrics now tie to Corral/Zenoti (verified 198/198 center-months).
   Plus a provider-feed guard in `reconcile-month.cjs`.
4. `e200d73` — rebuilt deploy bundle (`index-LFWquNYL.js`) so the display change
   ships. Still includes Section E.

## Deploy steps

`cents-fix` is based on current `origin/main`, so it fast-forwards cleanly
(local `main` may be stale — don't merge through it):

```bash
git push origin cents-fix:main      # direct fast-forward, OR:
gh pr create --base main --head cents-fix   # if you want review first
```

Cloudflare Pages (`performance-tracker-dhi.pages.dev`) auto-deploys on push;
`amp-router` serves it at ampintelligence.ai/tracker. Verify without login:

```bash
curl -s https://performance-tracker-dhi.pages.dev/data/performance/daily-metrics.json \
 | node -e "const m=JSON.parse(require('fs').readFileSync(0));const s=m.filter(r=>r.c==='Avelure-Waterford'&&r.d>='2026-06-01'&&r.d<='2026-06-30').reduce((a,r)=>a+r.s,0);console.log('June AW Sales',s.toFixed(2),'(Zenoti 72067.97)')"
```

## Persistence through the daily refresh — AUTOMATIC (no manual step)

The daily refresh (run by Kieren / `Kdwyer7`) commits linearly on `main`, i.e. it
syncs `main` before each run. So after this is merged, the next daily run picks up
the merged `refresh-daily.cjs` (cents) and the reconciled data automatically — no
action required from anyone, nothing to hand off.

- **The reconciled Q2 history is structurally protected.** `refresh-daily.cjs`
  only rewrites the current week (`replaceWeek`) / trailing ~4 weeks
  (`replaceWeeks`) / the daily `q8` lookback window, and drops any q-file rows
  outside that window. So Apr–Jun daily/weekly values stay as committed; only the
  current week refreshes, with fresh already-tied data. The daily run cannot
  revert the reconcile.
- **Backward-compatible:** `fd()` works on the existing q-file values and no new
  inputs are required, so the daily job runs unchanged.
- **New daily data:** stays cent-precise if the `q8`/`q9` pull carries cents;
  if a day is captured whole-dollar it's only ±$0.50 and self-heals at the next
  month-close reconcile. Either way it's tied to current Corral — no action needed.

## Keeping it tied over time (ongoing)

Months drift back above Zenoti as refunds/voids post after capture (the daily
lookback never re-pulls them). To re-tie a finished month, run
`reconcile-month.cjs` at month close — see `RECONCILE-MONTH.md`. Optional
prevention: widen the daily `q8`/`q9` lookback from ~7 days toward ~6 weeks so
recent months self-heal between reconciles.

## Not in this change (follow-ups)
- Only **Q2 2026** was reconciled. Q1 / December still drift — same tool, earlier months.
- **Center-level only.** Provider cards (Section C) weren't re-pulled; supply
  `q-revpat-provider.json` + provider metric pulls to reconcile them.
