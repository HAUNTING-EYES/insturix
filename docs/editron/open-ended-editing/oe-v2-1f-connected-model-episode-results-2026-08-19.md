# Editron V2-1F connected model episode — results and findings

Date: 2026-08-19

Branch: `infrastructure-improvs-+Editron`

Status: **research evidence; isolated proposals only; zero production mutation. No
model ranking is published from this document.**

Authority: governing plan is
[oe-agentic-editorial-planning-and-benchmark-reconciliation-2026-08-17.md](./oe-agentic-editorial-planning-and-benchmark-reconciliation-2026-08-17.md);
CAP-2A truth set is
[../capability-census/editron-cap2a-execution-ledger-v1.md](../capability-census/editron-cap2a-execution-ledger-v1.md).
Code and receipts remain the authority for implementation status.

## What V2-1F tested

Whether a model can plan a real multi-operator edit under the V2R selected-operator
contract, have that plan generically lowered with **zero added / zero dropped**
operators, executed on an **isolated clone** through the real production owners, and
**rendered** — and, for the gap tasks, whether the system honestly refuses to fake a
missing capability instead of mutating.

Every run is gated by the single V2R pre-registration manifest
(`v2r-preregistration-manifest.ts`). Raw per-stage provider lineage is persisted for
each episode under `.calibration-temp/open-ended-planner-v2/v2r-full-pipeline-dev0*/`.

## Scorecard

`PASS` = model plan lowered zero-add/zero-drop, executed on an isolated clone through
the real owners, and rendered with genuine proof. `HONEST_GAP` = model declared /
lowering produced `CAPABILITY_GAP` with zero compiled mutation operators and zero
mutation. `BLOCKED` = episode could not be scored for the recorded reason.

| Task | Luna | Terra | Qwen |
| --- | --- | --- | --- |
| DEV-01 native cut + push-in + duck | PASS | PASS | PASS |
| DEV-03 beat-sync + final shake | PASS | PASS | PASS |
| DEV-04 moving-matte honest gap | HONEST_GAP | HONEST_GAP | HONEST_GAP |
| DEV-02 hybrid/generated honest gap | BLOCKED (finding F2) | HONEST_GAP | HONEST_GAP |

Rendered proof for DEV-01/DEV-03 is in the blind review pack at
`.calibration-temp/open-ended-planner-v2/blind-review/` (anonymized samples + sealed
key). DEV-03 render proof per model: three cut-boundary mean-abs-diffs ≈ 45/45/49,
shake-active diff ≈ 1.22 at tick 480 returning to 0 at tick 490, protected-audio
source/baseline correlation 1.0, rendered peak ≈ 0.52, `browserErrors` empty, and all
`externalCalls` counters 0.

## Pre-registration version history (disclosed)

Two interpretation-bearing clarifications were made mid-experiment and registered by
version bump rather than silent drift. Runs before and after each bump are comparable
only within their manifest version.

| Component | V2R | V2R_2 | V2R_3 |
| --- | --- | --- | --- |
| Stage-2/3 node contract (`STAGE2_SELECTED_OPERATOR_CONTRACT_VERSION_V2R`) | selected-operator + alternatives | nodeInputs keys must exactly match the operator's declared input field names | catalog operators are eligible research-proxy planning targets regardless of CAP-2A production certification; a gap is only when the needed operation is absent from the catalog |
| Generic lowerer (`GENERIC_LOWERING_POLICY_VERSION_V2R`) | zero-add/zero-drop binder | honor a graph-level `CAPABILITY_GAP`/`UNVERIFIABLE` disposition | honor that graph-level gap **only when no mutation operator compiled** |

DEV-01 cohort (prior session) and DEV-03 Luna/Qwen ran under node contract V2R_2;
DEV-03 Terra and the DEV-01 Luna/Terra re-renders ran under V2R_3 + lowerer V2R_3.
DEV-02/DEV-04 ran under V2R_2/V2R_3 as recorded in their lineage receipts.

## Findings

### F1 — Terra DEV-03 eligibility-signal conflict (resolved by V2R_3)
Under V2R_2 Terra read the honest CAP-2A `ISOLATED_PROXY_ONLY / EXCLUDED planner
eligibility` signal for `sync_cuts_to_beats` / `apply_camera_shake` and refused to
plan DEV-03 (declared `CAPABILITY_GAP` with zero intent nodes). Luna and Qwen planned
past the same dossier. Disposition chosen: **record as a finding AND clarify the
packet.** The V2R_3 node-contract clarification (catalog operators are research-proxy
plannable; a gap is only an absent operation) let Terra plan. In one Terra re-run the
model still hedged with a graph-level gap while selecting compilable mutations; the
V2R_3 lowerer refinement (gap only when no mutation compiled) prevents that hedging
from blocking an executable isolated plan. All three models now pass DEV-03.

### F2 — Luna DEV-02 CAP-2A identifier confusion (BLOCKED)
Luna repeatedly emits the CAP-2A census identifier (`generated_composition.prepare` or
`generated-composition.prepare`) instead of the selectable spec operatorId
`generated_composition_program`. The capability dossier exposes both the spec
`operatorId` and the `cap2a.cap2aOperatorId`, and Luna conflates them. Terra and Qwen
do not exhibit this on DEV-02. Luna DEV-02 is recorded as BLOCKED pending either a
dossier-clarity fix or repeated-trial evidence; it is not scored as a planning failure.

### F3 — robustness: unknown-operator crash instead of graceful rejection
`publicOperatorCatalog` (`staged-packet-v2.ts`) raises `REFERENCED_OPERATOR_MISSING`
(an exception that aborts the episode) when a model's Stage-2 artifact references an
operatorId absent from the catalog. `validateSelectedOperatorNodesV2R` already detects
`SELECTED_OPERATOR_UNKNOWN` but is not wired into Stage-2 acceptance. A hallucinated
operator id should produce a graceful Stage-2 rejection (a scored `FAIL`/`UNVERIFIABLE`
attempt), not a crash. This surfaced via F2 and via a Luna DEV-04 first attempt.

### F4 — plan non-determinism
Models produce different plan shapes across attempts: Luna DEV-04 hallucinated an
operator id on one attempt and succeeded on the next; Terra DEV-03 produced an
8-operator hedged plan in one attempt and a clean 5-operator plan in another; Luna
DEV-03 selected 9 operators (canonical + resolvers) while Qwen selected the minimal 5.
Repeated trials are required before any consistency claim.

## Remaining before a V2-1F verdict

1. **Blind human review** of the DEV-01/DEV-03 rendered proxies (pack assembled; the
   user is the single disclosed reviewer — no two-reviewer agreement is claimed).
2. **Repeated trials** across models for DEV-01/02/03/04 to quantify F4 and confirm
   F2/F3 dispositions.
3. **F2/F3 fixes** (dossier identifier clarity + graceful unknown-operator rejection)
   followed by a Luna DEV-02 re-run.
4. Publish `GO/MODIFY/NO-GO` only after the above, with the version history above
   disclosed.
