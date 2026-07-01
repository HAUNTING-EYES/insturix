# Editron SaaS Explainer Production Plan - 2026-07-02

This is the binding plan for the SaaS explainer lane. It exists because the first live output proved the pipeline could create a project and render an MP4, but the result was not a production SaaS explainer. Moving cards plus voiceover is a technical floor, not the target.

## Current Truth

- Users should start from Brand Vault, a product URL or product brief, an optional script, and an optional SaaS reference video.
- Users should not upload main footage just to create a SaaS explainer.
- Preview and export now both support frame-driven generated-scene motion, but that only proves the renderer is not frozen.
- Current generated scenes can still look like generic dashboard furniture.
- The system must not mark a SaaS explainer complete just because a generated-scene overlay and voiceover exist.
- Remotion Lambda export uses a separate serve bundle. Any renderer change must redeploy the Remotion site before export proof is valid.

## Current Implementation Status

- Overall plan: incomplete.
- Phase 1 is the active branch scope.
- Existing rendered MP4 proof shows motion can export, but it is not quality proof.
- Completion can only be claimed after the gates in this document pass.

## Product Target

A finished SaaS explainer must feel product-led and brand-led:

1. Brand Vault supplies the default product, voice, visual, motion, logo, color, typography, audience, and proof context.
2. The user can override the brief, script, reference, and duration, but should not have to fill a form manually when Brand Vault is accepted.
3. Reference videos are accepted only when the sampled frames look like SaaS/product-demo content.
4. The final timeline contains multiple scene families, not one generic dashboard shell.
5. Voiceover, captions, pacing, motion, and visual proof agree with the brand and reference style.
6. Weak output is saved as a draft with machine-readable reasons, not presented as complete.

## Non-Negotiables

- Do not call placeholder generated scenes complete.
- Do not show prompt text, source-map language, or internal model labels in visible overlays.
- Do not call shared downstream plumbing a complete system unless producer, authority, source of truth, and consumer are verified in code.
- Do not let GLM or any LLM own final render code. Models may propose style facts, scene intent, copy, and references; deterministic validators and Remotion renderers own shipped output.
- Do not tune against one screenshot or one Insturix output.
- Do not let preview and Lambda export drift.

## Production Phases

### Phase 1 - Completion Gate Honesty

Goal: stop calling weak generated-scene output complete.

Acceptance:
- A generated-scene overlay requires explicit product-specific visual proof metadata before `autoEditStatus` can be `complete`.
- Prompt-like visible text remains blocked.
- Missing voiceover and missing captions remain blocked.
- Generic scenes can still be saved, but only as `draft_ready`.
- Tests prove a voiceover-ready generic scene is still not complete.

### Phase 2 - Brand Vault Default Contract

Goal: Brand Vault becomes the first source of truth for SaaS explainer defaults.

Acceptance:
- Accepted profile populates product positioning, visual identity, palette, logo evidence, typography, motion taste, narrative taste, voice taste, proof claims, audience, and known missing inputs.
- Missing Brand Vault fields stay explicit in `brandContext.missingInputs`.
- UI shows Brand Vault as the default source and only asks for overrides.
- Tests prove the generator prompt and generated-scene metadata receive the rich Brand Vault context.

### Phase 3 - SaaS Scene Family Planner

Goal: replace one generic generated-scene shape with product-led scene families.

Required families:
- hook
- problem
- workflow demo
- feature demo
- proof or metric
- comparison
- social proof or testimonial when evidence exists
- CTA
- logo outro

Acceptance:
- Planner emits family, evidence source, visual goal, product UI state, motion intent, and copy role per scene.
- No scene family may invent claims or product capabilities without Brand Vault, script, URL, or reference evidence.
- Generated-scene renderer can render families differently without using an LLM at render time.

### Phase 4 - Reference Video Analysis

Goal: reference video becomes style evidence, not a template.

Acceptance:
- MP4 and supported YouTube URLs are accepted.
- Five frames are sampled first for SaaS validation.
- If validation passes, analyze up to 120 seconds.
- Extract pacing, UI density, camera rhythm, transition style, caption style, typography behavior, palette behavior, proof-screen hold time, and motion energy.
- Non-SaaS references fail before credits or project creation.
- Reference analysis is cached and persisted on the Editron project.

### Phase 5 - Product Visual Evidence

Goal: output stops looking like fake app cards.

Acceptance:
- Product URL or Brand Vault assets provide screenshots, logo, product terms, and UI evidence when available.
- Generated UI states must map back to a source: screenshot, site section, Brand Vault evidence, script fact, or explicit user brief.
- If no product visual evidence exists, scenes remain draft and ask for product screenshots or accept clearly labeled synthetic demo mode.

### Phase 6 - Voice, Captions, Music, and SFX

Goal: audio becomes brand-influenced and timing-aware.

Acceptance:
- Voice profile uses Brand Vault voice signals plus reference pacing.
- Captions are generated as validated caption tracks, not narration text overlays.
- BGM and SFX selection uses brand/reference energy and avoids spam.
- Voiceover failures do not masquerade as complete output.

### Phase 7 - Rendered Quality Gate

Goal: judge the actual rendered pixels and audio timing.

Acceptance:
- Sample rendered frames from the final timeline, not just metadata.
- Detect static output, prompt-text leakage, unreadable text, weak product evidence, empty UI shells, caption collision, and low motion delta.
- Persist gate result with artifact links and issue codes.
- Completion requires passing deterministic metadata gates and rendered evidence gates.

### Phase 8 - Export Parity

Goal: preview and MP4 export must match.

Acceptance:
- Every renderer change includes Remotion Lambda site redeploy for the tested scope.
- Tests or operator checklist record the active `REMOTION_LAMBDA_SERVE_URL`.
- A real exported MP4 is sampled before claiming video output quality.

## Immediate Work Order

1. Phase 1: completion gate honesty.
2. Phase 2: Brand Vault default contract.
3. Phase 3: scene family planner.
4. Phase 4: reference video analyzer hardening.
5. Phase 5: product visual evidence.
6. Phase 7: rendered quality gate.
7. Phase 8: export parity automation.

## Completion Definition

The SaaS explainer plan is complete only when a Brand Vault-only request for an accepted brand can produce a multi-scene, product-specific, reference-influenced, voiceover-ready, captioned, export-verified MP4 that passes metadata and rendered quality gates. Until then the lane is partial.
