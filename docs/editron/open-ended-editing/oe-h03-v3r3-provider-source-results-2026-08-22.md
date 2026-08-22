# HOLD-03 V3R3 provider-source cohort — frozen execution result

Date: 2026-08-22

Status: `MODIFY_AND_RERUN_CORRECTED_IDENTITY`

Authority: research evidence only; no ProjectService read or mutation

## Executive result

The sealed HOLD-03 V3R3 cohort executed all eighteen authorised rows. The run
is valid raw provider, accounting, sandbox and failure-diagnostic evidence. It
is **not** valid final model-ranking evidence because it exposed two defects in
the benchmark contract itself after the responses were frozen:

1. the provider-visible generated-composition API did not state the required
   component-to-layer-kind bindings; and
2. it did not state that `Panel.translateX` and `Panel.translateY` are CSS-pixel
   values rather than normalised fractions.

The historical V3R3 artifacts must remain immutable. Corrected testing requires
a newly versioned capability snapshot and cohort identity.

## Reproducible identities

- Execution commit: `ffe78719fcd83983a5e3e1af60bb68e1567c1ea6`
- Runner source SHA-256:
  `134a987c9f5a4888db2ea5abc64abfd8cff2a0e244863308f81344c66c8e252d`
- Cohort manifest SHA-256:
  `6fec9b9ef6c8fb9e816f7dd6c2f78cab137872b7dc37d7abd2f86b08db3315a2`
- Paid authorisation SHA-256:
  `7d3cf7dd6fd7aea53f421b70b704e34f9278dcb81d8ea056916ccd331b50ead4`
- Run contract SHA-256:
  `61dcdbeca64fba72523de7e085a9782c326661275c70b93b51064bb17c822e12`
- Cohort receipt SHA-256:
  `b0df262777a9e54ca95238ca7c06e4f2a2ebcd71528710a7bccf80ea414318a4`
- Row-set SHA-256:
  `e9c3767699e607a21b9f69ff36c8c76f65c6de05f917bf6e6ddcc21dfc842f71`
- Sandbox snapshot: `snap_6Z8KLEnNn9kLx3JzW7UqcS5NgQEw`
- Snapshot application commit:
  `95c5a1fbdccb3058b408079777266f4e97b10c94`
- Run root:
  `.calibration-temp/open-ended-planner-v2/sealed-h03-provider-v3r3-run-20260822092759/`

The snapshot was built from the existing Debian Bookworm VCR image and passed
the exact Remotion 4.0.509, glibc 2.36, linked-compositor, browser, Sharp, TSX
and real H.264 render canaries. The paid authorisation binds that exact snapshot
and execution commit; the runner rejects a copied or mismatched snapshot.

## Accounting and state effects

| Route | Rows | Provider HTTP attempts | Accepted contract artifacts | Recorded spend | Raw disposition |
| --- | ---: | ---: | ---: | ---: | --- |
| OpenAI Luna | 6 | 6 | 6 | `$0.01871835` | 6 `PROOF_UNVERIFIABLE` |
| OpenAI Terra | 6 | 6 | 6 | `$0.19921950` | 6 `PROOF_UNVERIFIABLE` |
| Google Flash | 6 | 6 | 0 | `$0` | 6 `SOURCE_NOT_ACCEPTED` |
| **Total** | **18** | **18** | **12** | **`$0.21793785`** | 12 proof-unverifiable; 6 source-not-accepted |

All rows record zero real-project reads, zero project mutations and no state
effects. Luna and Terra responses were complete and untruncated. Gemini's
official `countTokens` calls succeeded at 4,762 input tokens, but every
generation request returned `HTTP_429 / PROVIDER_RATE_LIMIT`; those six rows
are provider-route non-evaluations and say nothing about Gemini's editing
ability.

## Route-specific interpretation

### Luna

All six provider artifacts passed the source contract. Four artifacts compiled
and produced real generated and hybrid MP4s, but failed the frozen edge-motion
predicate. Two artifacts failed at runtime because they wrapped the text layer
`title-main` in `Panel`, even though `Panel` accepts source-panel layers only.

The four motion failures cannot be used as clean model failures: the visible
API exposed numeric translation properties but omitted their CSS-pixel unit.
Several responses used small fractional translations consistent with a
normalised-coordinate interpretation.

### Terra

All six provider artifacts passed the source contract, then failed at runtime
because they wrapped `TextSlot` inside `Panel` with `layerId="title-main"`.
The manifest identified that layer as `TEXT`, but the visible API did not state
that `Panel.layerId` must bind `SOURCE_PANEL` while `TextSlot.slotId` must bind
`TEXT`. The verifier compounded the ambiguity by checking only that a layer ID
existed, not that its kind matched the component.

### Gemini Flash

All six requests stopped at the provider boundary with HTTP 429. No provider
model identity or generated artifact was returned. The correct disposition is
`UNVERIFIABLE_PROVIDER_RATE_LIMIT`, not a model-quality failure.

## Benchmark defects and required correction

The corrected identity must freeze these rules before any provider sees an
answer:

1. `Panel.layerId` binds only a declared `SOURCE_PANEL` layer.
2. `TextSlot.slotId` binds only a declared `TEXT` layer and may be rendered
   directly at canvas level.
3. `translateX` and `translateY` use CSS pixels; examples and limits must not
   leak the hidden answer or exact winning motion magnitude.
4. The verifier must validate component-to-layer kinds separately instead of
   merging all referenced IDs into one set.
5. The rendered predicate must prove visible bounded entry/exit motion and
   native/generated/native continuity without requiring one hidden authored
   recipe.
6. A capability-ceiling repair may run only against a versioned failure class
   declared before the rerun. V3R3's verifier accepted the invalid layer-kind
   use, so its nominal repair arm never received that diagnostic.

Changing the provider-visible contract or verifier invalidates the current
CAP-2A source binding by design. Reissue CAP-2A rather than rewriting V5, then
freeze a new cohort identity and zero-inference preflight before spending.

## Superseding correction checkpoint

The historical V3R3 run and this diagnosis remain unchanged. The corrective
prerequisites are now code-grounded:

- `9632e7541` adds provider-visible layer-kind/unit semantics and rejects
  kind-invalid programs before sandbox execution;
- `9f0c2c072` proves all six declared panel-motion directions using
  target-derived edge probes;
- `d84b54159` issues the corrected H03 provider-visible source contract; and
- `e3ea46fde` issues CAP-2A V6 with manifest
  `2549623eaca44feabf15aa53d8dd93c02804b37406db69879fd047981d2f9ce9`,
  binding 222 source paths and 477 observed identifiers with zero runtime or
  production authority.

These corrections have not yet produced a valid provider result. A new
V6-bound H03 cohort identity, zero-inference preflight and full eighteen-row
rerun are still required.

## Promotion boundary

This run proves the following harness facts:

- exact spend and attempt accounting;
- snapshot-bound authorisation;
- deny-all sandbox execution and teardown;
- real provider-source transport for Luna and Terra;
- real generated and hybrid render attempts;
- failure receipts with zero project mutation.

It does not prove that Luna, Terra or Gemini can reliably generate this
composition, does not select a production model, and does not authorise a
production editing agent. Stage 2.5 remains `MODIFY_AND_PROCEED_RESEARCH`.

## Ordered continuation

1. **Complete:** correct and test the visible API and kind-aware verifier.
2. **Complete:** audit the H03 motion predicate for target fidelity rather than
   recipe fidelity.
3. **Partial:** CAP-2A V6 is reissued; freeze a corrected V6-bound H03 cohort
   identity.
4. Pass zero-inference preflight, resolve Gemini generation quota, and rerun all
   rows whose visible contract changed.
5. Freeze the interpretation before proceeding to dependency diversity,
   forced native/generated/hybrid comparisons, conflict/rebase/locked-range,
   context-resume, long-form/range planning and blind editor receipts.
