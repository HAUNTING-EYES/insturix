# Editron Codex hardcodes, assumptions and evidence-debt register

Opened: 2026-08-20; last reconciled: 2026-08-22
Authority: code-grounded programme audit; status register, not runtime authority
Audit lane: editron-worktree / infrastructure-improvs-+Editron
Audit HEAD: findings rechecked through 9ebc2eb92;
latest route-ablation paid-cohort receipt 9583de5c0eb3281ea780e82cca4d0b735c1ec36f41970d6d7d3bfbe5031a498f

## Purpose

This document records the material hardcodes, authored benchmark choices,
architectural assumptions, invalid earlier evidence and unresolved production
claims introduced or relied upon during the Editron work from 2026-08-10
through 2026-08-20.

It deliberately distinguishes four things that were previously blurred:

1. a frozen synthetic or diagnostic fixture;
2. a bounded research choice;
3. a provisional production hypothesis that still needs calibration;
4. a hidden production assumption or defect that must be removed.

This is not a list of every numeric literal in the repository. It is the
material decision register found by auditing the master plan, current code,
Git history, benchmark artifacts, the existing benchmark postmortem and the
active task transcript. A newly discovered material assumption must be added
here; it must not be silently explained away.

## Status vocabulary

| Flag | Meaning |
| --- | --- |
| FIXTURE_FROZEN | Intentional value belonging only to one versioned test fixture. It may not be generalized to product behaviour. |
| RESEARCH_BOUND | Deliberate experiment limit used for fairness, cost or safety. It is not a production limit. |
| PROVISIONAL_POLICY | Plausible design choice that has not passed the required calibration or held-out evaluation. |
| KNOWN_DEFECT | Current code can produce an incorrect or unsafe result because of this assumption. |
| MISSING_CONTRACT | The production identity, owner, policy or proof does not yet exist. |
| HISTORICAL_INVALID_EVIDENCE | A prior score or conclusion did not test what it claimed. Preserve it for diagnosis; never use it for model promotion. |
| USER_DECISION | An explicit operator decision rather than a measured technical conclusion. |
| VERIFIED_CURRENT | Reproduced directly from the active branch at the audit HEAD. |

## Audit boundary and evidence

- The active worktree was dirty before this document. No reset, clean, stash,
  merge, commit or push was performed.
- The local annotated tag editron-interface-freeze-1 still resolves to
  5a47e00896e0e915cd4c03e71a0b104ac0c05999. Neither that commit nor Phase 2C
  7e9b4dd7ff60beeef2b6dfff4038ca367164cb65 is an ancestor of the active HEAD.
- The active task transcript examined for assumption discovery is
  C:/Users/admin/.codex/sessions/2026/08/09/rollout-2026-08-09T13-46-08-019fe597-f478-71a1-9e15-e44ff8230c0a.jsonl.
  It is supporting discovery evidence, not current code truth.
- The prior, detailed benchmark-error evidence remains authoritative in
  [the benchmark reconciliation postmortem](./oe-agentic-editorial-planning-and-benchmark-reconciliation-2026-08-17.md#complete-material-error-ledger).
- Current implementation status remains governed by
  [the master execution ledger](../../EDITRON_FINAL_EXECUTION_PLAN_2026-08-10.md#authoritative-code-grounded-execution-ledger---2026-08-17).

## A. HREF-01 reference-observation assumptions

| ID | Hardcode or assumption | Flag | Current evidence and required disposition |
| --- | --- | --- | --- |
| HREF-01 | Fourteen samples at 0.5, 5, 10, 15, 20, 25, 30, 35, 40, 45, 50, 55, 60 and 64.25 seconds. | FIXTURE_FROZEN | The 64.75-second, 60-fps source contains 3,885 frames. Fourteen images cover about 0.36 percent of source frames. This is a sparse ordered-image transport and broad-observation arm, not a production reference-understanding sampling policy. Source: provider-native-reference-holdout-01-v2r.ts lines 20–35. |
| HREF-02 | Frames are downscaled to 960x540 JPEG, MJPEG quality 2, yuvj420p, one thread, with one exact 2018 FFmpeg binary and byte hashes. | FIXTURE_FROZEN | This provides byte reproducibility for this machine and fixture. It is not a claim that 540p JPEG is enough for typography, masks, tracking, grading or professional reference reconstruction, and it creates portability debt if the frozen binary disappears. Source: provider-native-reference-holdout-01-v2r.ts lines 70–80 and provider-native-reference-holdout-01-preflight-v2r.ts lines 240–251. |
| HREF-03 | Ordered images deliberately exclude native video and audio. | RESEARCH_BOUND | The arm can test image order, timestamp binding, broad progression and provider serialization. It cannot establish music, dialogue, sound design, exact easing, continuous motion, transition microtiming or unsampled events. These must remain UNVERIFIABLE or request dense/native evidence. |
| HREF-04 | Generic input guards allow at most 64 frames, 8 MiB per frame and 64 MiB total. | RESEARCH_BOUND | These are defensive transport guards in provider-native-reference-input-v2r.ts lines 10–12. They have not been calibrated as production reference-quality limits. |
| HREF-05 | The observer receives one control-only finish function and 4,096 maximum output tokens. | RESEARCH_BOUND | This deliberately prevents editing mutation and keeps the first diagnostic bounded. It does not establish that a one-turn observer is sufficient for complex references or dense reinspection. Source: provider-native-reference-holdout-01-preflight-v2r.ts lines 204–217. |
| HREF-06 | A recurring pattern requires at least two occurrences and relevant counterexamples. | PROVISIONAL_POLICY | This is a sensible anti-hallucination floor, not a universal definition of editorial grammar. It needs multi-reference expert calibration. Source: provider-native-reference-holdout-01-v2r.ts lines 120–126. |
| HREF-07 | The evaluator contains twelve provisional observations authored from one Insturix source. | PROVISIONAL_POLICY | They must be reviewed before any model response is seen. A single author and reference cannot establish general editorial competence. Source: provider-native-reference-holdout-01-evaluator-v2r.ts lines 23–60. |
| HREF-08 | Repository provenance was treated as enough for local preflight, but legal provider-egress clearance is not asserted. | MISSING_CONTRACT | The manifest explicitly says legal clearance is not asserted and provider egress needs separate authorization. No provider dispatch may infer rights from Git provenance. |
| HREF-09 | Luna, Terra and Gemini 3.7 Flash at medium reasoning are the current HREF routes. | RESEARCH_BOUND | This is an experiment roster, not model promotion or permanent routing. Qwen retirement is a USER_DECISION, not proof of technical inferiority. |
| HREF-10 | The planned competence pilot says at least twenty moving references and two independent expert annotations. | PROVISIONAL_POLICY | This is an initial diagnostic minimum, not a statistically certified universal sample size. The project must publish content coverage, annotator competence, agreement, adjudication and confidence before using it for promotion. |
| HREF-11 | Earlier discussion proposed approximately 2/4/8-fps escalation, every-frame inspection when needed and an aggregate 15-minute project reference limit. | PROVISIONAL_POLICY | None is a calibrated production threshold. Production sampling must be claim-conditioned, preserve native video/audio arms, detect missed events and be evaluated against dense ground truth. The 15-minute figure must not become a hidden product cap. |
| HREF-12 | A repair curve of 0/1/2/4/8 attempts was proposed after rejecting a 50-iteration research loop. | PROVISIONAL_POLICY | This is an experiment design. Interactive and asynchronous budgets must be selected from measured quality, latency and cost curves, not hard-coded as doctrine. |
| HREF-13 | A proposed cross-element relationship router included a threshold of four linked elements. | PROVISIONAL_POLICY | The dependency signal is useful, but N greater than or equal to four is not production evidence. It remains a held-out routing hypothesis and must not decide native/generated/hybrid execution without comparison trials. |
| HREF-14 | No production reference-sampling owner or certified policy currently exists. | MISSING_CONTRACT | HREF-01 proves a sparse diagnostic transport only. Production needs source-rate-aware event proposals, audio/native-video support, adaptive dense windows, missed-event measurement, versioned evidence receipts and evaluator coverage. |

## B. Historical benchmark errors that must remain flagged

Every row below is HISTORICAL_INVALID_EVIDENCE unless a narrower disposition is
stated. Later code fixes do not retroactively make the old run valid.

| ID | What was wrong | Permanent interpretation |
| --- | --- | --- |
| BENCH-01 | Early 0/45, 0/45 and 1/45 executable totals measured one-shot verifier-clean serialization. | They are not executed or rendered editing scores. |
| BENCH-02 | Withheld-evidence rows still required hidden evidence-bound mutations. | Impossible condition; invalid evidence. |
| BENCH-03 | Early DEV-02 demanded a native low-level graph and omitted the generated-composition route. | Invalid test of the agreed filmstrip-as-generated-island/full-reel-as-hybrid design. |
| BENCH-04 | Resolver and mutation ports were open or incompatible. | Contract defect, not automatically model failure. |
| BENCH-05 | candidateCapabilityIds mixed executable selections with alternatives. | Replaced by one selectedOperatorId per node and separate alternatives. Old scores remain invalid. |
| BENCH-06 | Models were told compiler-owned adapters could be omitted, but Terra was failed for omitting one. | Prompt/evaluator contradiction; that Terra row is invalid. |
| BENCH-07 | DEV-specific lowerers encoded expected task topology. | Mechanics evidence only; not generic planning proof. |
| BENCH-08 | A compiler patch inserted seven catalog read/search/proof nodes after the model responded. | Architectural drift. The binder must add and drop zero catalog operations. |
| BENCH-09 | Canonical or editor-approved handoffs were substituted for preceding model artifacts. | Valid stage/mechanics evidence only, not connected model orchestration. |
| BENCH-10 | Issued packets were rebuilt from mutable current preflight state. | Historical provenance was contaminated until issued snapshots were pinned. |
| BENCH-11 | DEV-01 product evidence said frame 205 while the proxy exposed it at frame 180. | Fixture/evidence mismatch. |
| BENCH-12 | DEV-01 initially mixed music and a speech-like tone in one source. | Could prove a gain envelope, not dialogue intelligibility. |
| BENCH-13 | The cut receipt lacked original-to-child ID and timeline-coordinate mapping. | Downstream push-in binding could not be proven without guessing. |
| BENCH-14 | Zoom form emitted 1.16 against a fixture maximum of 1.12 and dropped focal anchoring. | Owner/fixture mismatch; old proxy score invalid. |
| BENCH-15 | DEV-03 expected authored frames 120/240/360/480 while the analyzer measured 119/239/359/479. | Predicates must bind measured receipts. |
| BENCH-16 | five-track-analysis passed an audio URL to a decoded-audio analyzer and accepted a near-120-BPM fallback. | KNOWN_DEFECT in an alternate live analysis caller; not unified beat evidence. |
| BENCH-17 | Luna repair inherited roughly 14.4 seconds of a shared 40-second stage budget. | Provider timeout, not editing failure; attempts require independent declared budgets. |
| BENCH-18 | A Qwen replay dropped selected operations before compilation. | Invalid transformation; preserve raw selected operations. |
| BENCH-19 | Repair guidance disclosed evaluator-specific topology. | Diagnostic repair only; not comparable first-pass evidence. |
| BENCH-20 | Initial human-review packs were empty and only the user reviewed later outputs. | Preserve ordinal pilot results; never claim two-reviewer agreement. |
| BENCH-21 | A hand-authored mechanics render was described as though each model produced it. | Separate mechanics, model lineage and rendered editorial judgment. |
| BENCH-22 | Results across isolated stages, continuations, repairs, replays, timeouts and protocols were aggregated. | No provider winner may be inferred from those leaderboards. |

## C. Current DEV-01 through DEV-04 research hardcodes

| ID | Hardcode or assumption | Flag | Required interpretation |
| --- | --- | --- | --- |
| DEV-01 | Exact speech ranges, dead-air range, product moment, post-cut frame mapping, project revision, zoom bounds and ducking windows. | FIXTURE_FROZEN | Synthetic native-edit fixture only. It cannot establish general silence removal, product emphasis or dialogue mixing quality. |
| DEV-02 | Six-second/180-frame, 30-fps moving-panel construction; exact panel geometry, gutters, source slots, continuity samples and render thresholds. | FIXTURE_FROZEN | Generated-island mechanics and hybrid handoff fixture only. It is not a universal collage form or routing rule. |
| DEV-03 | Measured beat frames 119/239/359/479, exact cut moves and a bounded camera-shake form/proof threshold. | FIXTURE_FROZEN | Audio/video native-edit fixture only. The measured frames belong to its frozen WAV; the shake parameters require separate form-owner calibration. |
| DEV-04 | 240 frames at 30 fps, target crossing near frame 120 and expected capability gap for moving matte/rotoscoping. | FIXTURE_FROZEN | It proves the current packet must not fake the effect. It does not claim future Editron cannot implement tracking, masks or rotoscoping. |
| DEV-05 | Evaluator policy contains exact allowed operators, effect groups and required dependencies per DEV case. | RESEARCH_BOUND | This is hidden evaluator gold in v2r-semantic-operator-policy.ts, not a generic production routing or planning policy. It must never be exposed as repair hints. |
| DEV-06 | Current cohort has three routes, six route/case conditions and three repetitions. | RESEARCH_BOUND | Useful bounded reliability evidence; not production confidence or domain coverage. |
| DEV-07 | Per-case limits include 6–20 turns, 4,096 output tokens per turn, 64,000 input tokens, two identical calls and task-specific callable subsets. | RESEARCH_BOUND | Fair-run controls, not product conversation or edit-complexity limits. |
| DEV-08 | Live transport defaults to 240 seconds, up to three transient attempts and a 60-second retry-delay ceiling. | PROVISIONAL_POLICY | Operational safety defaults that need provider-specific latency/retry measurement before production SLOs. |
| DEV-09 | OpenAI token preflight uses local o200k estimation plus 15 percent and 512 tokens; Gemini uses official countTokens plus the same margin. | PROVISIONAL_POLICY | A conservative benchmark estimate, not proof of a true provider worst-case bound. |
| DEV-10 | Current CAP-2A tool dossier contains forty operations. | RESEARCH_BOUND | It is the complete relevant research packet for these tasks, not all tools in Editron and not the Adobe-class destination. |
| DEV-11 | V27 Luna and Terra results cover eighteen narrow expected outcomes each. | RESEARCH_BOUND | The 17/18 rows support continuing research. They do not select a production editorial model or certify real-project mutation. |
| DEV-12 | Gemini HTTP 429 rows were sometimes discussed as failure. | HISTORICAL_INVALID_EVIDENCE | Current disposition is PROVIDER_INFRASTRUCTURE_UNVERIFIABLE until actual model output exists. |
| DEV-13 | Qwen was removed from future cohorts. | USER_DECISION | Historical evidence remains. No technical conclusion that Qwen is globally worse may be inferred from retirement. |
| DEV-14 | `development-cohort-routes-v2.ts` preserves issued Luna/Terra price values of $1/$6 and $2.50/$15 per million input/output tokens, while the current official snapshot used by V2R-3 is $0.20/$1.20 and $2/$12. | HISTORICAL_ISSUED_SNAPSHOT | Do not silently rewrite historical experiment identities. New runs must use the dated V2R-3 route facts; historical cost ceilings and estimates must be interpreted using their own issued price table. |
| DEV-15 | The tracked generated-composition smoke harness retained a 90-second wall/60-second CPU ceiling after the frozen DEV-02 program and connected Stage 6 path had moved to 180/120 seconds. | FIXED_CURRENT_HISTORICAL_INVALID_EVIDENCE | The old ceiling rejected the current renderer as `RESOURCE_BUDGET_EXCEEDED`. Using the unchanged program-owned limits, current production snapshot `snap_CRyxD1...` rendered in 94,057 ms under host receipt `73291ed9...`, with hash-bound outputs and zero project mutation. This requalifies the sandbox mechanics only; the old V1 capability identity remains immutable and the connected route still requires a new versioned capability before execution. |
| DEV-16 | One current V2 connected DEV-02 run rendered the 180-frame generated island and joined it to a native continuation as a 345-frame H.264 proxy. | RESEARCH_PROVEN_LIMITED | Source receipt `9425dd46...`, hybrid receipt `1a56ecb4...` and output SHA-256 `aa5f6644...` pass frame integrity, panel geometry, title form, opposed motion, phase structure, full-canvas release, boundary continuity and native continuation with zero project reads/writes/state effects. Creative taste and flash safety remain `UNVERIFIABLE`; the output has no audio and is fixed 1080x1920/30/1. This is executable research mechanics, not product nested-composition support or a native/generated/hybrid routing verdict. |

## C2. Current sealed-holdout benchmark hardcodes and evidence debt

| ID | Hardcode or assumption | Flag | Required interpretation |
| --- | --- | --- | --- |
| SEALED-01 | The unseen cohort contains eight synthetic tasks, sixteen opaque cases, forty operation records, thirty-three callable operations and seven visible unavailable operations. | RESEARCH_BOUND | This is a leakage-controlled Stage 2.5 sample, not the complete Editron toolset, Adobe-class coverage or production confidence. |
| SEALED-02 | Operation presentation uses one deterministic case-bound order shared across providers and direct/opaque arms. | RESEARCH_BOUND | It prevents a model-specific ordering advantage in this cohort. It does not prove robustness to every catalog size or ordering; later trials must vary order under a new frozen identity. |
| SEALED-03 | Initial provider inputs are bounded at 85,000 tokens after measured maxima of 75,011 for Luna/Terra and 81,464 for Gemini. | RESEARCH_BOUND | The ceiling was derived for these 96 exact initial requests. It is not a provider limit, a product conversation limit or evidence that later turns fit. |
| SEALED-04 | OpenAI input size uses local o200k estimation plus 15 percent and 512 tokens; Gemini serializes the request into official `countTokens` and applies the same margin. | PROVISIONAL_POLICY | Both are conservative benchmark accounting policies, not exact billing or guaranteed context-window upper bounds. Gemini counting is provider-context egress and must remain separately authorized and logged. |
| SEALED-05 | Historical V2R-2 fixes 24 turns, 4,096 output tokens per turn and two identical calls. Budgeted V2R-3 instead derives selected-operation, per-operation candidate and cumulative-output limits from each public case, permits only `maxNodes + 2 schema repairs + 1 finish` turns, and dynamically lowers the next output allowance. | IMPLEMENTED_NOT_DISPATCH_PROVEN | The historical identity remains immutable and unguarded by design. Only V2R-3 is eligible for a future sealed run. Its candidate accounting is explicitly pinned to catalog V2R-8 search/resolver outputs and must be reviewed on every catalog revision. A complete zero-inference simulation is still required before dispatch. |
| SEALED-06 | The credential preflight bounded initial requests only. V2R-3 now requires a request-hash-bound per-turn input upper bound, route/case/manifest authorization, worst-case pre-invoke spend reservation and exact post-response usage accounting. | IMPLEMENTED_NOT_DISPATCH_PROVEN | OpenAI cache-read/cache-write/output and Gemini cached-input/output/thought tokens are separately accounted. Missing, forged, inconsistent or over-bound usage fails closed before owner execution. A real runner must still supply the approved per-route counter and pricing facts and prove all turns in the zero-inference simulation. |
| SEALED-07 | Task fixtures declare synthetic/no-egress policies, while a separate operator authorization allowed three metadata GETs and thirty-two Google `countTokens` POSTs. | RESEARCH_BOUND | Task policy is not itself provider authorization. The receipt must preserve this distinction; a future inference run needs an explicit egress/spend authorization covering its exact request hashes and routes. |
| SEALED-08 | Complete tool context is repeated across the prompt, tool authority and provider declarations, producing roughly 67k-81k bounded initial tokens. | PROVISIONAL_POLICY | The repetition is transparent but expensive. Stable-prefix caching or a smaller lossless representation may be benchmarked only if request semantics remain byte-auditable and every provider receives equivalent information. |
| SEALED-09 | The connected owner records typed operations and writer revisions in an isolated in-memory log. | RESEARCH_BOUND | It validates protocol and causal handoff only. It is not real native execution, generated compilation, ProjectService mutation, render proof or editorial quality evidence. |
| SEALED-10 | Runtime budgeting and its budgeted trace/evaluator landed as two clean commits: `ddfc04b78` and `4d6230a04`. | VERIFIED_CURRENT | V2R-3 binds the runtime authorization, per-turn accounting and resource receipt through a separately versioned lossless trace and evaluator. Historical V2R-2/V1 artifacts remain unchanged. At this checkpoint, proof adapters and complete zero-inference accounting-plus-proof simulation remain mandatory before dispatch; SEALED-11 records the subsequently implemented standalone route binding. |
| SEALED-11 | Commit `94de011ae` binds official dated route prices, the exact manifest/case/public-case/route approval, local OpenAI estimation and separately authorized Google `countTokens` context egress while authorizing zero inference. | IMPLEMENTED_NOT_EPISODE_PROVEN | Route/request/approval/expiry/counter drift fails closed and no secret enters the receipt. This closes only the standalone route-accounting boundary. Claim-appropriate proof adapters and a complete zero-inference episode simulation remain mandatory before dispatch. |
| SEALED-12 | Commit `83405595b` proves the research-isolated no-edit outcomes for HOLD-06/07/08 from a recomputed hidden evaluation, accounted trace, allowed terminal and zero successful mutation/generated nodes. | RESEARCH_PROVEN_LIMITED | This proves safe non-execution inside the sealed research authority. It explicitly does not prove real ProjectService byte equality, product mutation safety or render quality. HOLD-03 still needs generated/hybrid proof; SEALED-13/14/15/16 record later bounded HOLD-01/02/04/05 proofs. |
| SEALED-13 | Commit `3e22af490` renders HOLD-01 from the model-selected `use_matching_footage` source start and proves decoded adjacent-frame geometry against fixed `0.03` centre-distance and `0.9..1.1` diameter-ratio thresholds. | RESEARCH_PROVEN_LIMITED | The thresholds come from the frozen HOLD-01 rubric and the adapter is intentionally restricted to one 640x360, 30/1, H.264 source-range splice. It rejects altered media and a visibly wrong later source start, but it does not prove ProjectService mutation, product-renderer parity, mixed rates, arbitrary crop/keyframe plans or general match-cut certification. |
| SEALED-14 | Commit `81eeb933a` renders the three model-selected HOLD-02 ranges and measures decoded door-open, process and door-close action while binding opaque writer-revision handoff. | RESEARCH_PROVEN_LIMITED | It proves only `[0,240)` of a 720-frame fixed-30-fps synthetic project. The remaining range, ProjectService mutation, product renderer, mixed rates and general repeated-footage taste are not proved. A semantically wrong but structurally distinct closing range is deliberately rejected after pre-proof. |
| SEALED-15 | Commit `82f412bbb` binds HOLD-04's one selected cut to the real `cutTimelineRange` owner, proves one retained caption occurrence and unchanged computed presentation material, and decodes the resulting H.264/AAC proxy. | RESEARCH_PROVEN_LIMITED | The fixture is fixed 30/1 with synthetic tone and only a symbolic caption presentation reference. Caption pixels, intelligible speech, real ProjectService mutation/save/reload/undo, product-renderer parity and mixed rates are explicitly not proved. |
| SEALED-16 | The historical v1 `buildSubjectAwareReframePlan` treated normalized subject centres as CSS `object-position` percentages and left skipped overlays in old absolute pixels after a canvas change. Commit `0404a253f` replaces that behavior with source-raster-bound, box-aware cover geometry and explicit authored-layout projection in the same sole owner; commit `8d1afc89f` binds that owner to the sealed H05 trace and media. | RESEARCH_PROVEN_LIMITED | The former owner clipped the bound H05 subject on 38/450 frames (worst 360x640 margin `-20.53px`). The new adapter decodes all 450 source frames and all 450 360x640 H.264 output frames; a static crop and changed media fail closed. It proves a symbolic top-right-five-percent marker, not real logo pixels, ProjectService mutation, live-chat safety, audio preservation, mixed rates or general reframe certification. CAP-2A V3 remains immutable history and explicitly reports current-source drift until reissued after HOLD-03 stabilizes. |
| SEALED-17 | The paid V2R2/V2R3 cohort executed all 96 rows: 466 provider turns, 176 Google `countTokens` calls, `$9.730960595` recorded spend and zero project reads/mutations. | VERIFIED_CURRENT | Raw cohort receipt is `9582dffc068b7319835d48da4834c1de70bdb29b39aa011ce0239fa12238022f`. This proves execution/accounting/resume only. It is not a 96-row pass, model ranking or production result. |
| SEALED-18 | Runner status `PASS_CLAIM_PROOF` combines safe no-edit proof with rendered edit proof. | KNOWN_DEFECT | All 24 raw passes in this cohort are the general no-edit safety proof; there are zero original rendered-edit passes. Commit `b5f2af0da` adds a separate immutable interpretation owner. A future runner identity must use semantically distinct raw statuses. |
| SEALED-19 | HOLD-01's visible resolver can propose `cut_section`, while hidden proof accepts only `use_matching_footage`. | HISTORICAL_INVALID_EVIDENCE | Five non-resource HOLD-01 failures cannot rank the models. Freeze a new identity only after one declared operation contract is shared by owner, callable schema and proof. |
| SEALED-20 | Two HOLD-02 proof-eligible rows failed because the Windows output path was about 266 characters. | HISTORICAL_INVALID_EVIDENCE | Unchanged row 013 and 023 traces pass the frozen rendered proof under a short path. Reproof receipts are `7b9e96a3...` and `13097e0f...`. Future proof roots must be bounded before FFmpeg runs. |
| SEALED-21 | HOLD-03 proof requires a reference literal different from the visible owner binding, receives only a generic `layoutSpec` schema and renders a human-authored program fixture. | HISTORICAL_INVALID_EVIDENCE | Five C1 execution rows are confounded. The next identity must expose exact protected literals and typed nested inputs, then bind proof to the model-generated program rather than substituting the mechanics fixture. |
| SEALED-22 | HOLD-04's cut owner retimes captions, but the research episode does not expose truthful post-cut caption/timeline state or declare that owner effect adequately to the model. | HISTORICAL_INVALID_EVIDENCE | Four non-resource execution failures are confounded. The next owner session must maintain and return an evolving clone plus the exact cut receipt/coordinate and declared state effects. |
| SEALED-23 | HOLD-05 proof requires exact nested reframe fields while the callable `reframePlan` is only a generic object. | HISTORICAL_INVALID_EVIDENCE | Five C1 execution failures cannot rank the models. Publish a complete schema or return a typed opaque resolver result that proof consumes without model retyping. |
| SEALED-24 | Thirty rows stopped at the conservative 85,000-token input guard; opaque handoff stopped 23/48 versus direct 7/48. | RESEARCH_BOUND | These rows are `NOT_EVALUATED_RESOURCE_GUARD`, not model failures. A new identity must separate a capability-ceiling condition from a production-budget condition so ability and unit-economics are measured independently. |
| SEALED-25 | The first current V4R evaluator treated any successful visual retrieval plus any successful native mutation as sufficient for `READY_FOR_PROOF`. | FIXED_CURRENT_HISTORICAL_INVALID_EVIDENCE | This admitted an unsupported HOLD-01:C2 range deletion after noisy evidence. Commit `ccbe5fc2d` binds the current evaluator to the shared proof-owner allowlist, forbids H01 range deletion and requires the matching-footage owner for H01:C1. Partial `v4r-run-04` rows are defect evidence only. Historical evaluator identities remain unchanged. |
| SEALED-26 | V4R has one row per provider/case, balanced but different direct/opaque handoff and tool-order assignments. | RESEARCH_BOUND | Luna's 7/15 and Terra's 6/15 proof-pass counts are descriptive current-context outcomes, not reliability estimates or a leaderboard. Repeated paired trials are required for statistical model selection. |
| SEALED-27 | HOLD-02 proof is frozen to an exact 240-frame synthetic door/process/door sequence. | FIXTURE_FROZEN | The 720-frame and 360-frame alternatives selected in the current run are genuine failures against this case, not evidence that their general editing taste is universally wrong. The fixture does not certify general repeated-footage policy. |
| SEALED-28 | All fifteen current Gemini 3.7 rows terminated on HTTP 429 before usable model output. | PROVIDER_INFRASTRUCTURE_UNVERIFIABLE | They are neither passes nor model failures. Do not substitute Gemini 3.6 into the V4R identity or compare 0/15 with Luna/Terra. A new versioned supplement requires a callable funded route. |
| SEALED-29 | Reopening the completed V4R run root returned the identical cohort receipt without creating another row or attempt. | RESEARCH_PROVEN_LIMITED | This proves bounded local artifact reuse/resume for a completed cohort. It does not prove mid-episode context compaction/resume, durable production workflow recovery or recovery after a project revision conflict. |
| SEALED-30 | The V3R3 visual supplement maps episode assets `clip-a`, `clip-b`, `clip-c` and `product` into the owned `dev03-cards` fixture with source offsets `0/117/267/450`; it renders 640x360 at 30/1 for 720 frames and samples boundaries 118/119 and 238/239. Its fixed acceptance thresholds are boundary mean-absolute-difference at least 20, filter difference at least 2, scale ratios 1.05..1.12, horizontal centre shift -25..-4, vertical shift -3..3, and a fixture-specific cream-pixel detector. | RESEARCH_PROVEN_LIMITED | Portable receipt `62a1fb24...` proves those exact synthetic pixels and the stored Luna P1 operation result only. Offsets, raster, rate, sample frames, colour detector and thresholds are frozen proof-fixture policy; none may become general media mapping, timebase, filter, zoom, focal or quality policy. |
| SEALED-31 | The V3R3 rendered supplement covers one Luna P1 row and the source episode contains no audio overlay or ProjectService persistence. | RESEARCH_PROVEN_LIMITED | Isolated owner replay and rendered visual evidence pass. Rendered audio and ProjectService reload remain explicitly unverifiable; the receipt cannot promote the six-operation set, Luna, CAP-2A or Stage 2.5 to production. |

## D. Production timebase, media and render assumptions

| ID | Current hardcode or missing identity | Flag | Code-grounded consequence |
| --- | --- | --- | --- |
| TIME-01 | Main editor constant FPS equals 30; React editor reads/writes that constant. | KNOWN_DEFECT | components/editron/editor/version-7.0.0/constants.ts line 7 and react-video-editor.tsx lines 108, 183 and 306 make Project.fps look more configurable than the active editor path is. |
| TIME-02 | Project creation defaults to 30 and one save path falls back with state.fps or 30. | KNOWN_DEFECT | project-service.ts lines 419, 472, 516 and 1664 preserve the 30-fps assumption across storage. |
| TIME-03 | Remotion metadata coerces fps through a rounded positive integer. | KNOWN_DEFECT | remotion/metadata.ts cannot preserve 24000/1001, 30000/1001 or 60000/1001 exactly. |
| TIME-04 | Many UI, captions, overlays, MG and five-track conversions multiply or divide by 30. | KNOWN_DEFECT | Mixed rates and even non-30 integer project rates can produce wrong timing. The family owners must migrate deliberately; a blind global replacement is unsafe. |
| TIME-05 | Chapter thresholds are 27,000/4,500/900 frames while the fps parameter is unused. | KNOWN_DEFECT | Intended 15-minute, 150-second and 30-second durations change at other rates. Source: chapter-renderer.ts lines 35–46 and 111. |
| TIME-06 | MediaAsset stores duration and display dimensions but lacks exact stream cadence/timebase/PTS/VFR mapping, source timecode/reel, SAR, field order and full pixel/colour identity. | MISSING_CONTRACT | Source-frame identity, mixed-rate conform, professional relink, HDR/log and deterministic delivery proof cannot be claimed. Source: asset-resolver.ts lines 14–56. |
| TIME-07 | Current upload path verifies duration and stores rounded dimensions, not the complete stream identity above. | MISSING_CONTRACT | Browser/editor range coordinates cannot be treated as source-frame identity. |
| TIME-08 | Current analysis paths use caps such as 120 or 300 seconds, one-fps sampling, 64 frames per V-JEPA segment and 360 visual segments. | PROVISIONAL_POLICY | These can support baseline search/structure but not exact advanced edits unless claim-conditioned dense inspection is implemented and persisted. |
| TIME-09 | Current UI has a small set of 1080-long-edge aspect presets, while other defaults still use 1280x720. | KNOWN_DEFECT | There is no one certified raster/format authority. The presence of a dimension field is not DCI, UHD, HDR or delivery certification. |
| TIME-10 | Main delivery paths use H.264/AAC and inconsistent colour declaration between paths. | MISSING_CONTRACT | A rendered MP4 is not professional codec, colour, audio-layout, mastering or interchange certification. |
| TIME-11 | The only defensible current main-path compatibility claim is approximately 30/1 progressive, square-pixel SDR around current web presets, pending golden output certification. | VERIFIED_CURRENT | Do not claim system-wide 24/25/29.97/50/59.94/60, VFR, drop-frame, DCI, HDR, high bit depth, mixed rates or source timecode. |
| TIME-12 | Four-, five- and ten-hour projects are product scalability targets. | PROVISIONAL_POLICY | They are not separate presets and are not currently certified. Numeric frame count is not the blocker; source identity, bounded decode, virtualization, sharding, resume and proof are. |

## E. Project authority, revision, proof and security assumptions

| ID | Claim or condition | Flag | Current truth |
| --- | --- | --- | --- |
| AUTH-01 | IF1 was sometimes discussed as though frozen meant active. | HISTORICAL_INVALID_EVIDENCE | IF1 is a tagged accepted artifact. It is not in active HEAD ancestry, lib/editron/if1 is absent and the product has not migrated to it. |
| AUTH-02 | The active ProjectMutationReceiptV1 was treated as close to IF1. | MISSING_CONTRACT | It contains projectId, revision and committedAt only. It lacks canonical command hash, timeline revision, changed paths, proof, undo/replay and full retry disposition. |
| AUTH-03 | “Rollback race closed” was stated too broadly. | HISTORICAL_INVALID_EVIDENCE | Writer-issued after-revision closes the exact migrated race only. Before checkpoints can pair a caller snapshot with a separately read revision; after checkpoints can load newer state and bind it to the earlier writer receipt. |
| AUTH-04 | Whole-state and generic writers were assumed safe because ProjectService exists. | KNOWN_DEFECT | saveProject can still be called without expectedRevision, and updateProject at project-service.ts lines 2374–2390 writes without CAS, revision advancement or receipt. |
| AUTH-05 | Existing checkpoint/undo work was treated as replay-complete. | MISSING_CONTRACT | Safe paths exist, but complete IF1 undo/redo/replay and project-wide writer migration do not. |
| AUTH-06 | P0 worker hardening commit 5299a42 was discussed as though active. | HISTORICAL_INVALID_EVIDENCE | It is in a separate worktree and not an ancestor of this branch. Active Director, Tribe and Video worker routes still select raw handlers when QSTASH_CURRENT_SIGNING_KEY is absent. |
| AUTH-07 | Generated composition research rendering was discussed as product execution. | HISTORICAL_INVALID_EVIDENCE | ProjectService-owned generated-composition state foundations exist, but the active editor/renderer product path is not end-to-end wired and certified. Research sandbox execution is not a second project authority. |
| AUTH-08 | A production agent control plane, PlanService and generalized PreviewObservationService were sometimes described in present tense. | MISSING_CONTRACT | These are designed architecture. The production runtime, durable range plan, dirty-range observation cache, conflict/rebase loop and PASS/FAIL/UNVERIFIABLE proof service are not converged. |

## F. Architecture and product hypotheses still requiring proof

| ID | Hypothesis | Flag | Required test before production use |
| --- | --- | --- | --- |
| ARCH-01 | A model can reconstruct global editorial language, recurring grammar, hero moments and protected literals from references. | PROVISIONAL_POLICY | Multimodal heldouts with native video/audio, dense annotations, missed-event scoring, uncertainty calibration and blind editor judgment. HREF-01 is only the sparse first arm. |
| ARCH-02 | A model can create a useful Sequence/Range plan and choose the next edit in a durable agent loop. | PROVISIONAL_POLICY | Whole-episode trials covering decomposition, exact tools, real results, replan, conflict, compaction/resume, proof and user correction time. |
| ARCH-03 | Native/generated/hybrid routing can be decided by target coverage, certified ownership, relationships, editability, sandboxability and proof. | PROVISIONAL_POLICY | Force all legal routes on held-out tasks and compare fidelity, defects, editor correction time, editability, round-trip preservation, latency and cost. Never route by operation count alone. |
| ARCH-04 | Versioned evidence policies can determine enough evidence for a target claim and candidate operation. | PROVISIONAL_POLICY | Per-operation/claim policies need expert-authored minimums, negative cases, analyzer-version bindings, dense-ground-truth recall and rendered proof calibration. There is no universal automatic policy writer. |
| ARCH-05 | Learned masks/tracks such as SAM 2 or CoTracker outputs can support masking/rotoscoping. | PROVISIONAL_POLICY | They are candidate measurements, not proof. Require identity, drift, occlusion, edge and rendered-composite validation. |
| ARCH-06 | A small repair loop can make generated compositions production reliable. | PROVISIONAL_POLICY | Measure zero, one, two, four and eight-repair curves by task class. Do not assume 1–3 or copy a research result that allowed up to 50. |
| ARCH-07 | A legal internal caption preference set can improve taste. | PROVISIONAL_POLICY | Rights-cleared rendered alternatives, editor/client pairwise judgments, accessibility and brand coverage, held-out regression measurement and explicit override. It is not an open-dataset taste oracle. |
| ARCH-08 | FSD50K plus model intelligence can become a production SFX system. | PROVISIONAL_POLICY | Rights/provenance, catalog coverage, event extraction, retrieval, human-listening ground truth, mix proof and sequence-level repetition/density evaluation remain required. The 11-item S2 pilot is tooling calibration, not catalog sufficiency. |
| ARCH-09 | Reusing a vibe-coding shell will materially accelerate a web-native vibe editor. | PROVISIONAL_POLICY | Bounded spike must compare existing Mongo/QStash jobs, a durable workflow layer and selected shell components while keeping ProjectService/plan/media authority in Editron. |
| ARCH-10 | Cheap client capture plus deterministic server observation is sufficient. | PROVISIONAL_POLICY | Compare state diffs, browser frames, server stills, ordered motion proxies, audio windows and sequence previews for parity, latency, cost, reproducibility and claim coverage before rollout. |

## G. Current HREF-01 human review gate

The exact item-by-item checklist is maintained in
[the HREF-01 no-spend preflight](./oe-v2r-heldout-reference-01-preflight-2026-08-20.md#human-rubric-review).
Human approval confirms only that the frozen evaluator notices reasonable
things about this one source before model responses are seen. It does not
approve fourteen frames as a production sampling policy and does not replace
the later two-editor moving-reference pilot.

## H. Resolution rules

1. A FIXTURE_FROZEN value stays immutable for that experiment version. A better
   fixture receives a new identity; historical inputs and results are preserved.
2. A RESEARCH_BOUND or PROVISIONAL_POLICY value cannot silently become a product
   default. Promotion requires a declared scorecard, heldout evidence and owner.
3. A KNOWN_DEFECT must remain visible in the master ledger until active control
   flow and proof show it closed.
4. A MISSING_CONTRACT cannot be filled by a model description, shared helper,
   passing unit test or one successful render.
5. HISTORICAL_INVALID_EVIDENCE may be useful diagnostically but may not
   contribute to provider ranking, routing or production claims.
6. Future status reports must cite this register when they rely on any listed
   constant, threshold, capability or architecture assumption.
