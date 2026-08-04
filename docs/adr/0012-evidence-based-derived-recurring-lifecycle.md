# 0012 — Evidence-based, derived recurring lifecycle

**Status:** accepted (2026-08-02, #192 grilling session)

A recurring series' life or death is judged **only from transaction evidence** — the most recent
money-out transaction that is the same `merchant identity` as the series' `merchant`
(`sameMerchant` in `transaction-matching`) — and the verdict is **derived at read time, never
persisted**. A series is **live** when its last observed matching charge is within 1.5× its
cadence interval of today (the same multiplier and
`dormancyThreshold` basis the dormant/missed anomaly detectors use); otherwise it is **dead**. The
stored `next_expected_date` column is demoted to a detection-time display artifact: detection keeps
writing it, but no lifecycle, anomaly, or forecast consumer may read it.

## Why not the obvious alternatives

- **Rolling `next_expected_date` forward (the naive fix for #192)** fabricates future charges for
  cancelled series — the exact defect the issue exists to kill.
- **Judging life from the stored date** fails in _both_ directions on real data: the upsert key
  `(merchant, cadence)` is stable, but before #237 unified detection and evidence matching onto one
  `merchant identity` predicate, the descriptor form it was fingerprinted on could drift — a series
  whose charges continued under a drifted descriptor went dead on false silence (false-dead) —
  while a cancelled series keeps its historical detection forever (false-alive). Evidence-based
  classification got all live rows right where date-based misclassified a genuinely active series
  (see #192 decision record).
- **Persisting the death verdict (auto-writing `status`)** breaks the store invariant that upsert
  never overwrites status ("never silently resurrect"): an auto-cancelled series whose charges
  resume can never come back without a provenance column (who cancelled — user or machine?), i.e. a
  schema change and a second lifecycle. A derived verdict is self-healing: evidence reappears, the
  series is live again. Explicit **user cancel remains the only persisted death**.

## Consequences

- `active` in the `status` column no longer means "alive"; it means "not user-retired". Liveness is
  a computed property. Rows for dead-but-uncancelled series legitimately remain `active` and are
  surfaced as dormant alerts for the owner to adjudicate.
- Every lifecycle consumer must share the one evidence basis and the one 1.5× constant: the
  upcoming-charges forecast, `detectDormant`, `detectMissedPayments`, and the subscriptions page.
  A consumer left on the stored date reintroduces cross-page contradictions (a series simultaneously
  "dormant" and "upcoming").
- Forecast outputs (projected date = last observed charge + cadence; expected amount = rolling
  average of recent observed charges) are computed from the same evidence scan, not from stored
  columns.
- Liveness matching is amount-agnostic by design: a price change must not kill a series. The cost —
  any merchant-matching purchase keeps a series alive — is accepted; habitual false-positive series
  die by user dismissal, not by lifecycle.
- Descriptor instability (a merchant whose description mutates per charge) was the known blind
  spot: evidence-matching only saw the descriptor form detection fingerprinted, so a series whose
  charges continued under a drifted descriptor went dead on false silence. Closed by #237, which
  moved both detection clustering and evidence matching onto one shared `merchant identity`
  predicate (`sameMerchant` in `transaction-matching`) — the two can no longer disagree about which
  charges belong to a series.

## Clarification 2026-08-04

The "Judging life from the stored date" bullet above originally stated the upsert key as
`(merchant, amountBucket, cadence)` and attributed false-dead rows partly to amount variance
drifting that key. That claim was factually wrong: `src/lib/recurring-detection/fingerprint.ts`
fingerprints `(merchant, cadence)` only — amount is deliberately excluded from the start, because
`expectedAmount` is a rolling average that drifts sync-to-sync and any fixed amount bucket has
boundary-straddle (two amounts within the ±10% match tolerance can fall either side of a bucket
edge). Amount variance cannot fork or freeze a row.

The bullet has been corrected above to name the genuine false-dead mechanism: descriptor
instability, the same blind spot the Consequences section documents as closed by #237. This
correction does not change the ADR's decision — evidence-based, derived liveness remains the
chosen design — only the "why not the stored date" bullet's amount-drift claim was wrong. Tracked
by #239.
