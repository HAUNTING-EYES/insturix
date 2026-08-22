# Stage 2.5 generalisation current matrix — 2026-08-22

## Outcome

The phrase **“seven unseen holdouts” was stale**. `HOLD-01` through `HOLD-08`
all participated in the immutable 96-row V2R paid cohort. What differs is the
validity and sufficiency of their evidence. This note binds that historical
interpretation to the corrected current owners before any further spend.

The no-dispatch identity is
`EDITRON_OE_SEALED_HOLDOUT_GENERALISATION_COHORT_V4R_1`:

- base V3R2 manifest: `a468c2f4...`;
- CAP-2A V6 manifest: `2549623e...`;
- historical interpretation receipt: `20b5e1c2...` (96 rows);
- H03-C1 V3R4 receipt: `47a57bf2...` (18 separate rows);
- V4R manifest: `fcfe2524...`;
- row set: `de6d5912...`;
- authority: research only, no provider dispatch and no project authority.

## Code-grounded evidence classification

| Task | Historical 12-row truth | Current disposition |
| --- | --- | --- |
| HOLD-01 | 5 confounded, 7 resource-guard non-evaluations | Corrected-owner requalification |
| HOLD-02 | 2 rendered reproofs, 1 valid trace failure, 9 resource guards | Current-context rendered requalification |
| HOLD-03 | 5 confounded, 2 valid trace failures, 1 valid safe stop, 4 resource guards | C1 covered separately by V3R4; C2 safety replication |
| HOLD-04 | 4 confounded, 8 resource guards | Corrected-owner requalification |
| HOLD-05 | 5 confounded, 4 valid trace failures, 1 safe stop, 2 resource guards | Corrected-owner requalification |
| HOLD-06 | 6 valid trace failures, 6 valid safe stops | Current-context safety replication, not first execution |
| HOLD-07 | 6 valid trace failures, 6 valid safe stops | Current-context safety replication, not first execution |
| HOLD-08 | 2 valid trace failures, 10 valid safe stops | Current-context safety replication, not first execution |

## Frozen next cohort

H03-C1 is excluded because the corrected generated-source V3R4 run already
covers it. The other fifteen condition cases each run once on Luna, Terra and
Gemini 3.7: **45 rows**. The contract balances three independently seeded tool
presentation orders (15 each) and direct versus opaque result handoff (23/22).

This design answers current-context qualification efficiently. One repetition
per provider/case is **not** a reliability estimate and cannot support a model
leaderboard. Repeated reliability, repair-curve, native/generated/hybrid,
conflict/rebase, compaction-resume and long-form trials remain separate gates.

Before inference, the existing sole episode/evaluator/proof runner must be
adapted to consume this row set, the initial requests must pass a credentialed
zero-inference preflight, and an explicit bounded spend authorization must bind
the exact preflight and manifest. A Gemini 429 remains a provider
non-evaluation; no substitution with Gemini 3.6 is permitted.
