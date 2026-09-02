# Final Vibe Content OS Migration Plan (Codex) — GOVERNING DOC

> **STATUS: RECONSTRUCTED.** The founder pasted the verbatim Codex plan into
> the build session on 2026-09-01; the paste was lost to context compaction
> before it could be saved. This document reconstructs every load-bearing
> claim that was **code-verified against the paste at the time it was read**
> (see evidence column). **Founder: replace the body below with the verbatim
> Codex text when convenient — until then, this reconstruction is binding
> for all studio work, and every claim carries its evidence.**
>
> **READ THIS BEFORE ANY STUDIO WORK.** If a task conflicts with this plan,
> stop and surface the conflict — do not proceed on the older
> `docs/VIBE_OS_PLAN.md` phase list, which is background/superseded where the
> two disagree.

## 1. Goal

Migrate the old multi-tool system (separate Editron / ThinkForge / Clickatron /
CalOS / Alyzitron surfaces) into **one unified Vibe Content OS**: the studio
(`/studio`) with one conversation per project, the agent orchestrating all
engines, and a durable persistence spine underneath.

**Evidence:** migration plan paste, 2026-09-01; all subsequent founder
approvals ("i approve the infra to vibe content merge", "ok go for all phases")
referred to this plan.

## 2. Deferred products — NOT in current scope (founder directive, twice)

The following are explicitly deferred by the plan AND re-confirmed by the
founder on 2026-09-02 ("WE WONT BE DOING AVATARS AND MUSITRON RN", "editron is
WIP so tread accordingly"):

| Product | Status | What that means in practice |
|---|---|---|
| **Editron (new editor)** | WIP — deferred | Studio chat NEVER drives the WIP engine. Edit-family turns decline honestly: capability-gap card, "editing is coming soon", classic editor named as alternative. (Implemented: commit `de8f08c7b`.) |
| **Musitron** | Deferred | No music integration work. No new music surfaces, no music suggestions in real mode. |
| **Avatar Vault / avatars** | Deferred | No avatar integration work. |

Legacy dashboards for these products remain untouched and linkable (existing
product surface — deleting them is not in scope either). What is forbidden is
NEW integration/build work and presenting these capabilities as available in
the studio.

**Note:** the older `docs/VIBE_OS_PLAN.md` §3.6 disposition matrix (ABSORB
music/storyboard/avatar) describes the *eventual* destination, not current
scope. The Codex plan's deferral governs until the founder lifts it.

## 3. What IS in scope (phases as approved)

- **Phase 2 — spine (write family):** operation records + idempotent turns;
  status computed from real records; Needs-you index; durable recovery so a
  mid-turn database hiccup can never lose user work (retries → outbox →
  reload-is-the-heal). *Evidence: commits `e0ecf5398`, `48e71639c`,
  `192de0e93`.*
- **Phase 3 — four-place shell:** persistent rail (Home / Project / Calendar /
  Library) + needs-you slide-over + workspace banner, inheriting the approved
  mockup vocabulary. *Evidence: commits `a78973e84`, `d0623d0c7`, `797d44980`.*
- **CalOS (distribute) read-side wiring** is in scope — it is a live legacy
  product, not deferred: calendar place + stage ScheduleView + connection
  health read from the real delivery queue. *Evidence: commits `604c4056e`,
  `6f0b9d93a`, `d9efaa4c5`.*
- **Design track (DV-1..3)** against the mockup, verified by MatrAIx persona
  columns. *Evidence: `docs/VIBE_OS_DESIGN_VALIDATION_TRACK.md`, MatrAIx
  scorecards (T2/T4/T5/T8 PASS; T3/T10 fix loops).*

## 4. The four persistence gaps (all verified real, all closed)

Verified against the codebase when the plan was pasted; all fixed by the spine
work above:

1. Conversation existed only in the client → now append-only
   `vibe_conversation_events` per project.
2. No idempotency → now `vibe_operations` state machine (one operationId per
   logical turn; in-flight/done refused with 409).
3. Status was inferred client-side → now computed from records
   (`computeProjectStatus`).
4. Mid-turn storage failure lost streamed work → now persist-before-send +
   durable outbox + drain-on-read.

## 5. Architecture rules that bind all studio work

- One conversation per project is the only command surface; the agent picks
  tools; the user never picks engines.
- Honesty spine: literal receipts, the 8 designed states, typed outcomes
  (done / needs-clarification / capability-gap), gates for spend/publish/
  destructive, errors never silent, nothing fake next to real data.
- AGENTS.md §11/§12: no false convergence claims; single owner for final form
  (planner ranks/asks — engines own output).
- Verification protocol per AGENTS.md Rule 14 (tsc/eslint/unit/simulated-user,
  twice-green; MatrAIx column for UI/mockup surfaces).

## 6. Change control

- Founder lifts a deferral explicitly, in writing, before any work on a
  deferred product begins.
- Every studio work session appends to `docs/VIBE_OS_WORK_LOG.md` (what, why,
  commit, verification status) BEFORE being reported as done.
