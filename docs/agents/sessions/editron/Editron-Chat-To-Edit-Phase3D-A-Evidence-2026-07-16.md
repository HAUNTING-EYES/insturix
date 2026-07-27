# Editron Chat-To-Edit Phase 3D-A Evidence - 2026-07-16

## Scope

This slice implements the semantic intent compiler and owner-dispatch seam for project-wide and targeted editorial requests. It does not claim the Phase 2 script recomposition dispatch is complete; that is Phase 3D-B.

## Verified Root Cause

`lib/editron/agent/agent-graph.ts` gave the chat model direct request-to-form recipes and exposed four shadow-authority tools:

- `add_motion_graphic`
- `auto_motion_graphics`
- `add_transition`
- `auto_edit_from_script`

Those tools bypassed the canonical multimodal evidence plane or let the chat model choose concrete compatibility forms. Director already owned the real signal-ranked family planning path, so adding another planner would have duplicated authority.

## Production Change

`apply_editorial_intent` now captures:

- goal;
- project, selection, or moment scope;
- target reference without requiring timestamps;
- constraints;
- requested strength;
- interpretation uncertainty;
- family-level auto/off/prefer policy;
- optional music direction, notes, and script.

The contract has no MG type, transition type, SFX token, caption style, keyframe recipe, or animation preset field.

Project-wide intent dispatches to `executeDirectorPlan`, preserving the real Director and unified planner as decision owner. Targeted intent retrieves canonical transcript, visual, OCR, spatial, motion, vocal, music, and source-to-cut evidence. Safe candidates become signal-source decisions and are licensed by `planUnifiedDecisionBundleFromCandidates`; `executeEDL` remains the final family/form consumer.

Weak evidence or high interpretation uncertainty is advisory and cannot mutate. Every attempt persists a bounded record in `editron_chat_intent_audits` with intent, evidence candidates, missing modalities, rejection reasons, owner, observed mutation, and policy version.

## Compatibility Boundary

Chat filters the four shadow-authority tools only in `createAgent`. `createTools` is unchanged, so Director and the narrow direct-tool API retain their existing compatibility paths. This is partial convergence by design, not a claim that legacy tools are globally deleted.

Targeted transition candidates carry `hard-cut` only as the existing neutral compatibility hint at the planner/renderer edge. The prompt and semantic intent contract cannot choose a visual transition form. Targeted SFX sends role/timing evidence with `sfxType: none`; the current SFX preflight keeps it evidence-only rather than guessing a sound token.

## Verification

`tests/editron/chat-editorial-intent-tools.test.ts` proves:

- the full intent contract survives normalization;
- no renderer-form fields enter the intent;
- chat-only legacy authority is filtered without changing the shared tool factory;
- project-wide intent reaches Director;
- weak targeted evidence does not mutate;
- MG, zoom, captions, transitions, and SFX receive grounded jobs/evidence;
- strong MG evidence becomes executable through the unified planner without Creative Brief authority;
- scripts dispatch only to the Phase 2 owner dependency;
- hidden prompt recipes are absent.

Focused result: 8/8 tests passed. Focused ESLint passed.

## Honest Remaining Phase 3D Work

Phase 3D-B must implement the default `phase2-script-planner` dispatch by extracting/reusing the existing Storyline-to-timeline materializer. Until then, script intent fails loudly with `phase2-script-recomposition-dispatch-not-yet-wired`; it never falls back to the legacy single-video editor.
