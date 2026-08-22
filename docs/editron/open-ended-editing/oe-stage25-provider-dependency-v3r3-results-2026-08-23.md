# Stage 2.5 provider-dependency V3R3 results — 2026-08-23

## Verdict

The bounded non-leading dependency episode passed for every evaluable OpenAI
row after one benchmark-validator defect was corrected and the immutable
provider episodes were replayed without new inference:

| Route | Evaluable rows | Corrected result | Median episode latency | Estimated spend |
| --- | ---: | ---: | ---: | ---: |
| GPT-5.6 Luna | 3 | 3/3 PASS | 23.559 s | $0.024154960 |
| GPT-5.6 Terra | 3 | 3/3 PASS | 18.548 s | $0.220714200 |
| Gemini 3.7 Flash | 0 | 3 infrastructure-unverifiable | 4.371 s to terminal 429 | $0 |

Total recorded estimated spend was `$0.244869160`. The six evaluable episodes
all selected exactly the six eligible operations, carried owner-issued opaque
results across the dependency chain, advanced the isolated writer revision
`R42 -> R43 -> R44 -> R45`, and stopped at `READY_FOR_PROOF`. They did not
claim rendered acceptance.

This is positive evidence for one fork/join dependency shape under three tool
presentation orders. It is not a production planner certification, provider
leaderboard, ProjectService integration result, rendered-quality result or
Stage 2.5 `GO`.

## Frozen identities

- Source run:
  `.calibration-temp/open-ended-planner-v2/stage25-provider-dependency-run-20260822195252`
- Cohort version: `EDITRON_STAGE25_PROVIDER_DEPENDENCY_COHORT_V3R_3`
- Source commit: `9ca9e8f9ab7a2483706728317c1f7b24ed5f9422`
- Manifest SHA-256:
  `4e38038757205ebabb50967efc62baeb575ff331bbd3362d6f455c1e8e5fa07b`
- Zero-inference preflight receipt SHA-256:
  `1f6ec9dc5b09d8cbec894752dc324e92301ffe92a5aadb860ffbea09f759b3e6`
- Original cohort receipt SHA-256:
  `929241d7cb3e2b687143a74b74d2545daa5ea11600fa4295a27d227cfe900c30`
- Corrected offline replay source commit:
  `a7e2cba3d4a13605be7c2092da72d9bcfb35fb1d`
- Corrected replay receipt SHA-256:
  `d1cc5d7c9c78b7e461f9f8ea441bb5347155b28515c777f1697d06c775d0cc57`
- Replay schedule contract:
  `EDITRON_OE_STAGE25_PROVIDER_TRACE_SCHEDULE_BINDING_V1_2`

The committed replay receipt is
`stage25-provider-dependency-v3r3-replay-receipt.json`. It hash-binds every
source row, episode, trace, hidden evaluation and transport receipt. It records
six passes, zero failures, three provider-infrastructure non-evaluations, zero
provider inference calls and zero state effects.

## What the episode actually tested

The model received the complete forty-operation directory and the six exact
eligible tool records in one of three randomized presentation orders. It did
not receive the hidden tool sequence or the exact owner-resolved beat, visual
or form values. The required editing episode was:

1. retrieve measured audio evidence;
2. align legal cuts to measured beats while protecting speech;
3. retrieve the product visual moment;
4. resolve the bounded zoom form;
5. apply the keyframes with the latest writer-issued revision; and
6. apply a range-bounded warm filter using the next writer-issued revision.

Audio and visual retrieval could run independently. Mutations could not. The
models had to use opaque result references for the resolved evidence and every
post-write revision. The runner invoked the existing isolated beat-sync,
keyframe-form, keyframe-patch and filter owners; it did not let a compiler add
creative operations.

All six Luna/Terra episodes reached the correct isolated final state and the
hidden semantic evaluator passed them. The terminal disposition remained
`READY_FOR_PROOF` because no bounded render, reload proof or audiovisual
acceptance proof ran in this cohort.

## Why the raw V3R3 receipt said 2 PASS / 4 FAIL

The provider outputs were preserved. The defect was in the schedule validator,
not in the four rejected model episodes.

The V3R3 validator incorrectly required every node after a mutation to provide
`expectedProjectRevision`, including read-only operations whose CAP-2A schemas
do not define that input. Consequently, a legal `find_visual_moment` after beat
synchronization was rejected even though the following revision-sensitive
resolver and mutation correctly consumed the latest writer receipt.

Commit `9ecf50240` corrected the rule:

- an operation whose schema declares `expectedProjectRevision` must bind the
  latest writer-issued revision;
- a revisionless read remains legal after a write; and
- stale, copied or forged revision handoffs still fail closed at the next
  revision-sensitive operation.

The offline replay then revalidated the original signed episodes through that
corrected rule. It did not regenerate, repair or reinterpret model output.

## Earlier runs and why they are not scored

The sequence of immutable runs is retained because each exposed a real harness
defect:

| Run | Frozen receipt | Observed headline | Disposition |
| --- | --- | --- | --- |
| V1.1 `20260822191814` | `27b4e688...` | 0 pass / 6 fail / 3 infra | Confounded: hidden beat predicates required exact owner output withheld from the model. |
| V1.2 `20260822192341` | `d00e35d4...` | 0 pass / 6 fail / 3 infra | Confounded: `apply_filter` had no executable public form contract. |
| V3R1 `20260822193752` | `960abbd1...` | 4 pass / 0 fail / 3 infra / 2 harness | Exposed incorrect schedule-rejection classification. |
| V3R2 `20260822194432` | `ae04c63f...` | 4 pass / 2 fail / 3 infra | Exposed rejection of semantically empty optional result-reference arrays. |
| V3R3 `20260822195252` | `929241d7...` | 2 pass / 4 fail / 3 infra | Valid provider capture; four false schedule failures corrected by immutable offline replay. |

None of those defects justifies silently deleting an old receipt. The corrected
receipt supplements V3R3 and preserves the complete provenance chain.

## Gemini disposition

All three Gemini rows made three bounded transport attempts and received HTTP
429 because the production key's prepaid credits were depleted. The calls
produced no model artifact and no billable token usage in the stored receipts.
Gemini is therefore `PROVIDER_INFRASTRUCTURE_UNVERIFIABLE`, not PASS or FAIL.
Changing to a different Gemini model ID would not resolve an account-credit
failure. A separately versioned supplement may run after a funded credential
passes a fresh zero-inference preflight; V3R3 itself remains immutable.

## Subsequent bounded rendered-visual proof

Commits `7a16b0cec` and `03e7aa8a3` add a create-only proof adapter and runner
without changing the V3R3 cohort. The runner replayed the exact immutable
`openai_luna-p1` episode (`sourceRowSha256 dcd20d54...`) through the existing
isolated owner and compared every owner output with the stored provider episode
before rendering the final `R45` clone through Editron's existing Remotion
root.

Portable receipt
`stage25-provider-dependency-render-proof-v1-receipt.json` has SHA-256
`62a1fb2440a076de68b0e0de46fd0a8f7be70e20900f97741dc01464be08d479`.
It binds source code commit `03e7aa8a338f1295959f29497e689ee00df37eb8`,
the critical source blob hashes, source/replay/episode identities, owner state
hashes, the owned `dev03-cards` fixture and the decoded output.

Measured result:

- isolated owner replay: `PASS`;
- H.264 output: 640x360, 30/1, 720 decoded frames, zero audio streams;
- visible cut changes at 118/119 and 238/239 with mean absolute differences
  `45.309238` and `55.725499`;
- visible warm-treatment difference at frame 660: `9.601868`;
- rendered push-in geometry: width ratio `1.080178`, height ratio `1.076923`;
- rendered right-biased focal behavior: cream-card centre moved 14 pixels left
  and zero pixels vertically;
- browser errors, provider calls, cloud calls, ProjectService calls, database
  calls and state effects: zero.

This closes rendered **visual** proof for one synthetic Luna P1 episode only.
Rendered audio is `UNVERIFIABLE_NO_AUDIO_OVERLAY_IN_SOURCE_EPISODE` and
ProjectService reload is `UNVERIFIABLE_RESEARCH_CLONE_ONLY`. The source-offset
projection and pixel thresholds are frozen fixture measurements, not product
defaults or general operation certification.

## Claim boundary and next gates

The model bet has passed this one bounded question: Luna and Terra can choose
and execute the correct six-operation fork/join episode from complete tool
records while carrying opaque owner results and writer revisions under three
tool presentation orders.

The following remain open before Stage 2.5 can exit:

1. HREF-01's usable sole-reviewer receipt and targeted dense motion/audio
   interpretation, while keeping independent agreement unverifiable.
2. Further unseen holdouts and dependency/invalidation shapes.
3. Forced native, generated and hybrid executions on held-out targets.
4. Stale user edits, overlapping changes, safe rebase and locked ranges.
5. Provider interruption, compaction and exact resume with result identity.
6. Realistic long-form sequence/range planning under bounded evidence.
7. General owner-issued effects, ProjectService reload, rendered audio and
   ProjectService-owned integration beyond the one visual-only supplement.
8. Blind-editor quality, correction-time, latency and cost receipts.
9. A frozen `GO`, `MODIFY` or `NO-GO` decision.

Current programme status remains `MODIFY_AND_PROCEED_RESEARCH`.
