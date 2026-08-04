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
  `(merchant, cadence)` is stable, but the descriptor form it was fingerprinted on can drift — a
  series whose charges continued under a drifted descriptor went dead on false silence (closed by
  #237, see Consequences) — while a cancelled series keeps its historical detection forever
  (false-alive). Evidence-based classification got all live rows right where date-based
  misclassified a genuinely active series (see #192 decision record).

  > **Correction (2026-08-04):** This bullet originally attributed the false-dead failure to
  > amount variance drifting the upsert key `(merchant, amountBucket, cadence)`. That claim was
  > factually wrong: `src/lib/recurring-detection/fingerprint.ts` fingerprints `(merchant,
cadence)` only — amount was deliberately excluded from the start, because `expectedAmount` is
  > a rolling average that drifts sync-to-sync and any fixed amount bucket has boundary-straddle
  > (see that file's doc comment). Amount variance cannot fork or freeze a row. The actual
  > false-dead mechanism has always been descriptor instability, which the bullet above now
  > describes; the ADR's conclusion — evidence-based, derived liveness — is unaffected by this
  > correction.

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
