# SaaS Explainer Final Level Plan - 2026-07-03

Status: binding master plan
Branch: `infrastructure-improvs-+Editron`
Target: Lovable/Insturix-level SaaS explainer craft, without copying either reference
Supersedes: the quality target of `Editron-SaaS-Explainer-Production-Plan-2026-07-02`; keeps its safety gates

## Executive Truth

The SaaS explainer lane is not complete.

The current system can create a project, generate a script, create `generated-scene` overlays, attach Brand Vault context, attach reference-style evidence, generate voiceover, preview/export motion, and avoid obvious prompt-text leaks. That is a technical floor. It is not the final product.

The bad output happened because the live render path is still a generic `generated-scene` renderer. The system has style/reference/context metadata, but it does not yet have the production motion engine required to express that metadata as premium SaaS video.

The final target is not "copy Lovable" and not "copy the Insturix intro." The target is the same level of craft:

- product-led opening within the first 3 seconds
- readable UI/product proof, not fake dashboard furniture
- multiple distinct animated scene families
- brand-specific typography, colors, logo, voice, pacing, and CTA
- polished Remotion motion with real easing, transitions, layered UI, and timing
- VO, captions, music, and SFX that drive the motion
- rendered MP4 proof, not metadata-only proof

## What "Generated Scene" Means

In this repo, a generated scene is a structured Editron overlay whose source of truth is a scene model. The LLM creates or influences the scene data; deterministic code renders it in Remotion.

That idea is correct. The current implementation is too shallow:

- it mostly renders the same app-shell/product-card layout with different copy
- it does not have a real SaaS motion rig library
- it does not use product screenshots/UI evidence as first-class visual inputs
- it does not synchronize visual moments to VO words
- it does not have a quality gate that can say "this still looks cheap"

So the fix is not to throw away generated scenes. The fix is to evolve generated scenes into a real SaaS film composer.

## Evidence From Current Repo

Current built pieces:

- `lib/editron/saas-explainer/generator.ts` resolves Brand Vault context, applies defaults, analyzes references, drafts script, parses scenes, builds generated-scene overlays, generates VO, and persists project metadata.
- `lib/editron/saas-explainer/structure-doctrine.ts` includes the default Lovable style reference and explicit no-copy boundaries.
- `lib/editron/reference-video/saas-reference-video-analyzer.ts` has the GLM 5-frame SaaS gate and 120-second evaluation cap.
- `lib/editron/reference-video/saas-reference-edit-dna.ts` maps accepted reference analysis into EditDNA.
- `lib/editron/freeform-glm/generate-scene.ts` already has a local GLM/Ollama freeform Remotion TSX generation and validation lane.
- `components/editron/editor/version-7.0.0/components/core/generated-scene-layer-content.tsx` renders the current generated-scene overlay in Remotion.
- `docs/agents/reference/general/phase_f_g_saas_motion.md` already explains that full SaaS video requires Phase F plus Phase G: screencast/product proof plus vector motion graphics/audio sync.
- `docs/agents/sessions/editron/Editron-SaaS-Explainer-Production-Plan-2026-07-02.md` already says generated-scene plus VO is not enough and must not be marked complete.

Important missing evidence:

- The repo references `D:\Insturix-Brain\01-Research\SaaS-Explainer-Video-Knowledge-Base-2026-06-27.md` and `D:\Insturix-Brain\02-Architecture\explainer-knowledge-graph.json`, but I do not see the full SaaS content bible/knowledge graph checked into this worktree.
- In-repo structure doctrine exists, but it is not yet an operational content system that drives every beat, claim, transition, and scene family.

## Root Cause Of The Bad Output

This is an architecture gap, not just a prompt gap.

Current producer:

- SaaS intake/generator produces script-derived scene descriptors and generic generated-scene overlays.

Current decision owners:

- Brand/default/reference context shapes prompt and metadata.
- `buildSaasGeneratedSceneOverlays` chooses scene family metadata and creates scene models.
- `GeneratedSceneLayerContent` owns the actual visible render.

Current source of truth:

- The generated-scene overlay model.

Current final consumer:

- Remotion preview/export renders the generic generated-scene component.

Why this cannot reach the reference bar yet:

- Reference analysis produces coarse style evidence, not renderable motion choreography.
- Brand Vault context is present, but the renderer consumes only a fraction of it.
- Scene families exist as labels/branches, but not as cinematic product-demo rigs.
- There is no product visual evidence pack that forces real screenshots, UI states, logos, product text, and claims into the render.
- There is no audio-marker engine that times visual events to VO emphasis.
- The quality gate verifies "not blank/readable/contract valid" more than "this is a premium SaaS launch video."

## Gap Inventory

1. Content doctrine gap

The SaaS structure doctrine exists, but the full content bible/knowledge graph is not in this worktree as a load-bearing artifact. We need an in-repo, machine-readable SaaS video content bible that covers hooks, problem framing, demo beats, proof moments, comparison, CTA, pacing, claim rules, and anti-patterns.

2. Reference analysis gap

The GLM analyzer validates SaaS references and extracts style signals, but the output is flattened into coarse EditDNA. It does not yet produce scene-by-scene motion grammar, UI treatment rules, beat structure, transition motifs, or "do not copy" similarity constraints for the final director.

3. Brand Vault consumption gap

Brand Vault context is resolved and injected, including colors, fonts, logos, product images, motion, and voice. But final render output does not yet treat those as mandatory visual assets and motion constraints.

4. Product evidence gap

SaaS explainers cannot look premium if the system has no real product UI evidence. Product URL, Brand Vault screenshots, logo assets, product images, UI vocabulary, and proof claims must become a dedicated evidence pack.

5. Director gap

There is no SaaS Director that turns Brand Vault + product evidence + content bible + reference style into a storyboard with rig choices, asset requirements, narration markers, visual proof, and render gates.

6. Renderer gap

The current generated-scene renderer is too generic. It needs a real Remotion-based SaaS motion layer: vector UI primitives, device/browser frames, product panels, stat/proof cards, workspace surfaces, notification/collaboration elements, logo stings, and high-quality transitions.

7. GLM production gap

Freeform GLM Remotion generation exists, but it is local/Ollama oriented and not wired into the SaaS explainer lane. Production needs a ZAI/GLM API client, context caching, validator repair loop, sandboxed render proof, and hard separation between creative proposal and shipped output.

8. Audio timing gap

Voiceover generation exists. Brand-influenced voice exists. But visuals are not timed to word-level emphasis. Reference-level SaaS video needs VO markers to trigger UI changes, highlights, notification entrances, stats, transitions, and CTA.

9. Captions/music/SFX gap

Narration exists, but reference-level output needs validated captions, BGM ducking, restrained SFX, rig-specific sound signatures, and audio mix checks.

10. Quality gate gap

Current gates can prevent some broken output, but they cannot reliably reject a video that is technically moving yet aesthetically weak. The rendered quality gate must inspect pixels, motion deltas, text fit, product proof, visual variety, brand adherence, audio sync, and prompt leakage.

11. Website UX gap

User POV should not be "upload a video for a SaaS explainer." The main path is Brand Vault first, with optional product URL, optional brief/script, optional reference video, and optional product screenshots. Reference video is style evidence, not required footage.

12. Export parity gap

Preview proof is not enough. Remotion Lambda export must use the same renderer, and every renderer change needs export proof from the active serve URL.

## Single Master Execution Sequence

### Phase 0 - Lock The Target And Stop False Completion

Outcome:

- The system never presents a generic generated-scene plus VO as a finished SaaS explainer.
- Existing `draft_ready` behavior remains until premium render gates pass.

Acceptance:

- Any output without product visual proof, captions, VO readiness, render proof, and quality gate pass remains draft.
- Visible prompt/source-map/internal model text is always blocked.
- Project metadata explains exactly why the render is draft.

### Phase 1 - Bring The SaaS Content Bible Into The Repo

Outcome:

- A real in-repo content doctrine exists, not just prompt text.

Build:

- `docs/agents/reference/general/saas_explainer_video_content_bible.md`
- `lib/editron/data/saas-explainer-knowledge-graph.json`
- parser helpers that expose beat families, proof rules, claim rules, CTA patterns, pacing shapes, and anti-patterns

Acceptance:

- The generator can cite the doctrine version in project metadata.
- Every scene family maps to explicit content rules.
- If evidence is missing for proof/comparison/social proof, the director downgrades or asks for assets instead of inventing claims.

### Phase 2 - Reference Interpreter V2

Outcome:

- Lovable/default references and user-provided MP4/YouTube references become style intelligence, not templates.

Build:

- Preserve the current 5-frame SaaS gate.
- If accepted, analyze up to the first 120 seconds.
- Extract: pacing map, scene family sequence, transition grammar, UI density, typography behavior, product-proof holds, camera rhythm, color treatment, CTA style, audio/motion relationship, and no-copy boundaries.
- Cache the analysis by source fingerprint, script, and brand context.

Acceptance:

- Lovable is used as a default style benchmark when user provides no reference.
- Uploaded Insturix/Lovable-style references influence craft only.
- Analyzer output explicitly says what may transfer and what must not transfer.

### Phase 3 - Brand/Product Evidence Pack

Outcome:

- Brand Vault becomes the default source of product, visual, voice, and proof inputs.

Build:

- `SaasProductEvidencePack` from Brand Vault + product URL + optional user screenshots.
- Include: product name, positioning, audience, colors, fonts, logo assets, product screenshots, UI terms, proof claims, CTA language, motion taste, voice style, missing fields.

Acceptance:

- User can start from Brand Vault only when enough accepted evidence exists.
- Missing product screenshots or proof are explicit, not silently faked.
- Synthetic UI mode is allowed only when labeled and gated as lower confidence.

### Phase 4 - SaaS Director And Storyboard Planner

Outcome:

- A single director owns the storyboard before rendering.

Build:

- `lib/editron/saas-explainer/director.ts`
- Inputs: intake, content bible, reference interpreter, product evidence pack, Brand Vault voice/motion signals.
- Output: storyboard scenes with scene family, goal, proof source, asset requirements, narration segment, marker intents, transition intent, quality constraints, and fallback behavior.

Acceptance:

- At least 5 distinct scene families for a 60-90 second SaaS explainer unless duration makes that impossible.
- Director can explain every claim and visual with source evidence.
- Director never owns final keyframes or render implementation; it owns intent and constraints.

### Phase 5 - Remotion SaaS Motion Engine V1

Outcome:

- Generated scenes become premium product-demo scenes, not generic cards.

Build:

- A composable Remotion scene engine for SaaS explainers.
- Initial high-quality forms:
  - product-led hero/workspace reveal
  - workflow orchestration/demo path
  - feature zoom/callout with real UI evidence
  - proof/stat burst or comparison
  - collaboration/notification/presence moment
  - CTA/logo outro
- Shared primitives:
  - browser/device frame
  - product screenshot surface
  - app sidebar/topbar/table/card primitives
  - animated cursor/callout/highlight
  - logo lockup
  - caption-safe lower lane
  - stat/proof card
  - transition wrappers

Acceptance:

- Each form has distinct composition, hierarchy, motion, and transitions.
- Text fits title-safe areas and never breaks mid-word.
- Brand color, fonts, logo, product visuals, and motion taste are visible.
- Every scene has meaningful motion, not a still frame with VO.

### Phase 6 - GLM Creative Codegen Lane, Production Safe

Outcome:

- GLM can help with aesthetics and custom variants without becoming a trusted unchecked code executor.

Build:

- ZAI/GLM API client for production.
- Context cache containing: content bible, brand/product evidence, reference style tokens, allowed Remotion APIs, existing primitives, examples, validator rules, and no-copy constraints.
- Candidate TSX/scene-variant generation using existing freeform validators as a base.
- Deterministic validators for parseability, safe APIs, Remotion imports, size limits, no network/runtime secrets, trace ownership, no prompt text, title-safe text, motion requirements, and source-map preservation.
- Render sandbox proof before a generated variant can become selectable.

Acceptance:

- Validators do not judge beauty or creativity; they enforce safety, contract, readability, and renderability.
- Failed GLM output repairs once or twice, then falls back to deterministic engine.
- No raw model code ships without validation and rendered proof.

### Phase 7 - VO, Captions, Music, SFX, And Marker Sync

Outcome:

- Audio drives the picture.

Build:

- Word/phrase marker extraction from VO transcript.
- Emphasis markers from words, syntax, brand voice, and reference pacing.
- Scene events aligned to markers: UI reveal, notification, stat count, highlight, transition, CTA.
- Captions as real validated caption tracks.
- Brand/reference-influenced BGM selection and ducking.
- Restrained rig-specific SFX with cacheable sound signatures.

Acceptance:

- At least one visual event per major VO beat.
- Captions never collide with product proof.
- Music and SFX support VO instead of competing with it.
- Voice profile reflects Brand Vault voice signals by default.

### Phase 8 - Rendered Quality Gate V2

Outcome:

- The system rejects "technically valid but ugly" output.

Build checks:

- static-frame/motion-delta detection
- prompt/internal-text leakage
- readable UI text at 1080p
- title-safe and caption-safe zones
- product evidence visible
- scene family variety
- brand color/font/logo adherence
- reference-style alignment without copying
- VO/caption/visual marker alignment
- empty shell/fake-dashboard detection
- export-vs-preview parity

Acceptance:

- Completion requires passing metadata gates and rendered gates.
- Failed renders get actionable issue codes and artifact links.
- A human review sample is required until automated rubric confidence is proven.

### Phase 9 - Website UX

Outcome:

- The website flow matches how a user actually wants to create a SaaS explainer.

User POV:

1. Pick brand from Brand Vault.
2. Optional: paste product URL.
3. Optional: add/edit brief or script.
4. Optional: upload/paste reference video for style.
5. Optional: add screenshots if Brand Vault/product URL lacks UI evidence.
6. Click generate.
7. See storyboard/preview, warnings, and editable scenes.
8. Export when rendered gate passes.

Acceptance:

- No required "upload a video" step for SaaS explainer creation.
- Brand Vault auto-fills product brief, colors, logo, fonts, motion, voice, audience, and proof context.
- UI asks for missing evidence only when needed.

### Phase 10 - Export Parity And Production Rollout

Outcome:

- Preview and final MP4 match.

Acceptance:

- Remotion Lambda serve bundle is redeployed for renderer changes.
- Full MP4 export is sampled before quality claims.
- Production env uses ZAI/GLM API, not Ollama.
- Credits are charged only for stages that actually run and refunded for failed paid generation.
- Logs store project id, doctrine version, reference cache key, evidence pack coverage, rendered gate result, and export artifact.

## Final Acceptance Bar

A SaaS explainer is complete only when a Brand Vault-first request can produce an export-verified MP4 that passes all of these:

- 60-90 second target works, with shorter/longer variants supported.
- Product/brand visible in the first 3 seconds.
- At least 5 distinct animated scene families unless duration is too short.
- No single-still video.
- No prompt text, model text, source-map text, or placeholder instructions visible.
- Real product UI evidence is used, or synthetic mode is clearly marked and lower confidence.
- Brand Vault colors, fonts, logo, product language, voice, CTA, and motion taste are used by default.
- Captions are validated and readable.
- VO markers drive visual events.
- Music and SFX are mixed under VO.
- Text fits all containers at 16:9 and 9:16.
- Rendered frame samples prove motion, readability, and product proof.
- Exported MP4 matches preview.
- Reference videos influence craft, not copied layouts/assets/claims.

## First Implementation Slice

The next build should not be another generic renderer tweak. It should produce one honest benchmark sample:

1. Commit this final plan.
2. Add the in-repo SaaS content bible and machine-readable knowledge graph.
3. Build `SaasProductEvidencePack` from Brand Vault plus product URL/screenshots.
4. Build `SaasDirector` that outputs a storyboard with evidence and marker intents.
5. Implement a small but polished Remotion SaaS Motion Engine V1 with 4-6 forms.
6. Use Insturix Brand Vault data and the uploaded Insturix/Lovable references as style benchmarks.
7. Render a full MP4 and show frame samples plus the MP4.
8. Judge it against this plan before calling it good.

The target output at the end of this plan is a bespoke SaaS launch/product explainer with the craft level of Lovable and the uploaded Insturix intro: high-polish product motion, brand-authentic visuals, clean VO timing, premium transitions, readable UI, and real product proof. It must not copy their layouts, words, logos, screens, or proprietary assets.
