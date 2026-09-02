# Vibe OS — Design-Validation Track (mockup + MatrAIx)

Status: 2026-09-02 · owner: design track (mockup `vibe-final-mockup.html` + `matraix/` harness)
Relation to the migration plan: runs **in parallel** with the code phases. Its output is
UI truth (labels, vocabulary, screen inventory) that Phases 3–7 must inherit — the same
way T1's vocabulary rule (§10 of the reference doc) now governs every status word.

## Why this track exists

The MatrAIx persona matrix (11 personas × 5 seeds × N surfaces, run by
`matraix/run-matraix.mjs` against screenshots of `vibe-final-mockup.html`) measures
whether real user archetypes correctly *understand* each surface. Wrong mental models =
trust breaks, even when the underlying system is correct. Full-matrix baseline
(2026-09-01, `matraix/results/full-matrix/scorecard.md`): T1/T4/T6/T7 PASS;
T2/T3/T5 FAIL on comprehension; T8/T10 untestable (screens don't exist); T4 slide-over
gap.

## Completed

- **T1 loop (find → fix → re-verify):** "Reel · LIVE" label + invisible approval gate
  fixed ("Reel · cutting", "asks you first"); vocabulary rule codified in reference doc §10;
  clean re-run. Method proven.
- **Copy-fix phase (2026-09-02):** question cards say "no rush — everything keeps working
  while you decide"; autonomy dial prints both rules (publishing always waits; project can
  only run stricter than workspace); assumption chips explain ask-vs-assume. Screens
  recaptured; T2/T3/T5 re-run in flight (`matraix/results/t2t3t5-v2`).

## Phase DV-2 — Assumptions review surface (approved 2026-09-02)

The chip copy now promises "every assumption is listed in project settings" — build it:

- New "Assumptions · this project" tier inside the project-settings drawer:
  every assumed value (9:16, :30, 30fps, −14 LUFS, fridays-heavy, …) with
  assumed-at timestamp, current value, tap-to-change, and "asked instead" history.
- Kills the worst T3 probe: "A week later, where would you check what was assumed?" (23/55 wrong).
- Re-verify: T3 column (55 cells).

## Phase DV-3 — The three unbuilt screens (approved 2026-09-02)

1. **T8 · production calendar** — the Calendar place for a production workspace
   (Dune): shoot days, dailies review, milestones per §16.1. Must stamp the active
   workspace identity ("you're in Dune's workspace — its settings, voice and credits
   apply") — the T8 trust breaks showed persona #1 confusion is *whose* rules apply
   after switching.
2. **T10 · setup interview** — brand-scan onboarding screen (§4.2/§16.5).
3. **T4 · needs-you slide-over** — rail badge + slide-over door (§16.3 option B);
   T4 passed on the Home card only.
- Re-verify: T8/T10 columns become UI-tested (gap flag lifted only when the screen
  exists); T4 full pass.

## Standing rules for the migration code phases

- Vocabulary §10 is law: activity verbs while working ("cutting", "generating"),
  "queued" while waiting, "shipped" once published, never "live" for on-stage status.
- Publishing approval must be visible at the point of scheduling ("asks you first").
- Question cards / decision requests must say work continues meanwhile (non-blocking).
- The autonomy dial must print its two invariants (publishing always waits;
  stricter-only overrides).
- Every new screen gets a MatrAIx column before it counts as passed; the harness
  resumes cleanly (`run-matraix.mjs` skips finished cells, `regrade-shard.mjs` for
  grade-only passes).
