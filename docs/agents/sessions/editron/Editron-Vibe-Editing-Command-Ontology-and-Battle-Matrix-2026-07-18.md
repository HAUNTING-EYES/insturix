# Editron Vibe-Editing Command Ontology And Battle Matrix

**Date:** 2026-07-18
**Status:** Production test contract; deterministic chat suite green, live all-command proof blocked
**Scope:** Editron chat-to-edit only

## 1. Product North Star

Editron should behave like a vibe-editing environment: the user describes the outcome in ordinary language, supplies any relevant material, and the system turns that intent into a grounded, reversible edit.

The production flow is:

`user intent + project state + selected/cursor context + uploaded/reference material -> evidence resolution -> semantic editorial plan -> licensed tools -> canonical project mutation -> reload -> rendered pixel/audio proof -> receipt + undo`

The model is not allowed to invent timestamps, asset IDs, transcript matches, visual matches, beats, or rendered success. Vague creative requests go through the semantic editorial planner. Explicit mechanical requests may call the corresponding mechanical tool after reading or resolving the target.

## 2. Research-Backed User Command Surface

The command ontology below is based on current Editron capabilities plus established workflows documented by Adobe Premiere and Descript:

- Adobe text-based editing maps transcript selections and edits to the timeline: <https://helpx.adobe.com/uk/premiere/desktop/edit-projects/edit-video-using-text-based-editing/overview-of-text-based-editing.html>
- Adobe Media Intelligence supports natural-language visual search over clips and specific moments: <https://helpx.adobe.com/uk/premiere/desktop/organize-media/file-organization/media-intelligence-and-search-panel.html>
- Adobe Color Match uses a reference frame and face-aware color matching: <https://helpx.adobe.com/premiere/desktop/correct-color/add-color-effects/match-color-between-shots.html>
- Adobe Remix analyzes music structure to fit a requested duration: <https://helpx.adobe.com/premiere/desktop/add-audio-effects/apply-audio-effects/remix-audio-in-premiere.html>
- Adobe Generative Media accepts image/video references and places generated results into an editable timeline: <https://helpx.adobe.com/premiere/desktop/edit-projects/edit-with-generative-ai/generative-media-tool-faq.html>
- Descript's Underlord treats natural-language requests as project-scoped editing instructions, including captions, reframing, zooms, callouts, audio cleanup, translation, and document-to-video workflows: <https://help.descript.com/hc/en-us/articles/36803785502221-Underlord-beta-Your-AI-co-editor-in-Descript>
- Descript's filler-word workflow analyzes surrounding audio to avoid harsh cuts: <https://help.descript.com/hc/en-us/articles/10164806394509-Remove-filler-words>
- DaVinci Resolve IntelliScript matches a supplied script against transcripts across several selected clips, including contextual matches and alternate takes: <https://documents.blackmagicdesign.com/SupportNotes/DaVinci_Resolve_20_New_Features_Guide.pdf>
- Adobe Media Intelligence searches visual, audio, transcript, and metadata evidence together rather than treating filenames as clip understanding: <https://helpx.adobe.com/uk/premiere/desktop/organize-media/file-organization/search-for-media-using-ai-powered-media-intelligence.html>
- Runway's reference model lets a prompt address uploaded images, videos, and audio by stable labels: <https://help.runwayml.com/hc/en-us/articles/52963720640275-Using-reference-media-to-guide-your-generations>

### 2.1 Story And Intent

Users may ask Editron to:

- make a rough cut, tighten a story, preserve a speaker's meaning, or reorder scenes around a narrative;
- follow a supplied script, outline, brief, document, slide deck, mood board, or reference edit;
- use only relevant footage, preserve factual chronology, or prioritize a specific claim, product, person, or result;
- make the edit shorter, more restrained, more energetic, more premium, more humorous, or better suited to a platform;
- leave a family to AI while explicitly controlling another family, such as captions on and MG restrained.

### 2.2 Timeline And Dialogue

- Cut, trim, split, delete, close gaps, move, retime, reorder, extend, or shorten.
- Find a spoken phrase without a timestamp, including paraphrases and Hinglish/Devanagari.
- Remove false starts, filler, silence, repeated ideas, or a topic while preserving intelligibility.
- Rebuild a sequence from several uploaded clips against a script or editorial goal.
- Undo a single operation or the complete AI transaction, including project duration.

### 2.3 Visual Understanding And Asset Use

- Find moments by object, action, person, text, screen content, or semantic event.
- Inspect the current rendered frame, selected asset, or uploaded media.
- Search uploaded assets or stock footage, place the chosen result, or replace a scene with matching footage.
- Use user images or clips as B-roll, proof, overlays, reference material, or narrative scenes.
- Work on visual-only footage without pretending a junk transcript is evidence.

### 2.4 Text, Captions, Graphics, And Motion

- Add or edit titles, callouts, labels, captions, animated captions, stickers, HTML scenes, and scene text.
- Restyle all matching overlays or captions without changing their content/timing.
- Add motivated zoom, keyframes, speed ramps, fades, shake, or layer changes.
- Ask for MG only where the content is visually explainable; the system may decline an unworthy moment.
- Coordinate captions, MG, zoom, transition, SFX, and existing screen content rather than treating each family independently.

### 2.5 Color And Look

Users may ask for:

- automatic shot matching and white-balance/exposure consistency;
- a natural, cinematic, warm, cool, high-key, muted, or brand-aligned look;
- matching an attached still, image, video reference, or mood board while protecting skin tones and product colors;
- local correction of one selected clip or global consistency across the project.

Current Editron only exposes selected-overlay `apply_filter` plus style extraction/application. That is not a complete project-wide color-grading owner. A first-class look/color intent family and a shot-aware grade resolver remain product gaps.

### 2.6 Audio, Music, And SFX

- Analyze dialogue, pauses, beats, downbeats, energy, and silence.
- Clean speech, duck music, replace SFX, place an SFX on an exact resolved beat, or sync cuts to music.
- Use an uploaded song as first-class BGM, preserve a requested section, fit it to duration, or align montage rhythm to its structure.
- Request mood/instrumentation/vocal constraints for generated BGM.
- Require a clean skip when no suitable SFX or music candidate exists.

### 2.7 Delivery, Repurposing, And Accessibility

Expected vibe-editing requests also include aspect-ratio reframing, social cut-downs, chapters, alternate durations, translation, dubbing, accessibility captions, and export/render verification. These are not all represented by current live chat tools and must not be reported as complete.

### 2.8 The Vibe-Editing Request Grammar

Users will not speak in tool names. A production system must understand combinations of these request dimensions:

- **Scope:** this clip, selected overlays, visible range, current chapter, every matching shot, or the whole project.
- **Anchor:** timestamp, playhead/cursor, spoken phrase, semantic topic, visible object/action/text, beat/downbeat, scene boundary, or attached reference.
- **Operation:** find, explain, add, remove, replace, reorder, shorten, extend, restyle, grade, mix, synchronize, generate, repurpose, verify, undo, or compare.
- **Outcome:** clearer, tighter, calmer, faster, premium, humorous, documentary, platform-native, brand-consistent, or reference-consistent.
- **Constraint:** preserve words/order/product color/skin tone; do not cover faces; do not alter captions; use only uploaded media; skip if evidence or asset quality is weak.
- **Degree:** exact numeric value, subtle/strong relative change, low/medium/high preference, or "use your judgment."
- **Iteration:** "less than that," "keep the timing but change the look," "use the previous version," or "apply that treatment to the other shots."
- **Proof:** show the matched moments first, explain what changed, compare before/after, render-check the result, or leave the project untouched if any step fails.

The same intent can be explicit ("warm clip 12 by 300K"), semantic ("make the interview feel less clinical"), referential ("match this still"), deictic ("move this where my cursor is"), or compound ("tighten the pauses, keep the joke, then cut a 30-second vertical version"). Routing tests must cover all five forms.

### 2.9 Chat Material Roles

A file attached in chat is not self-describing. The user may intend it as:

- a script, transcript correction, outline, factual source, or legal constraint;
- a visual style reference, color reference, pacing reference, motion reference, or full reference edit;
- B-roll, primary footage, alternate take, logo, product image, still, diagram, or screen recording;
- dialogue, voice-over, room tone, music, SFX, or a beat/rhythm reference;
- a delivery specification, brand guide, platform brief, or review note.

The intake must preserve the declared role and source provenance. Analysis may suggest a role, but it must not silently reinterpret a script as on-screen copy, a reference video as footage to publish, or a supplied song as disposable analysis-only media.

## 3. Current Tool Truth

The canonical registry currently contains **59** tools:

- **55 live chat tools**;
- **4 shadow-authority tools filtered from chat:** `add_motion_graphic`, `add_transition`, `auto_edit_from_script`, and `auto_motion_graphics`.

Those four tools remain compatibility/runtime code, but cannot count as chat coverage. Vague MG, transition, zoom, caption, SFX, music, pacing, and script-led requests must pass through grounded semantic intent and the existing family owners.

The battle matrix now contains **73 journeys**. Its focused contract derives live tools from registry metadata and fails if any live tool lacks a required journey or if any filtered tool enters a required journey.

This proves inventory coverage only. It does **not** prove that Gemini selects the correct tool, that the tool mutates the right project, or that the rendered result looks/sounds correct.

Every live handler now also has deterministic executable coverage through either an existing direct/integration contract or the focused July 18 gap-closing suites. The last previously uncovered handlers were exercised through the real `createTools(...)` factory: timeline splitting/style sync/gap closure, transcription/caption refresh, clip analysis, scene regeneration/style extraction, SFX replacement, stock search, and user-footage replacement. This proves handler behavior at mocked external boundaries. It still does not replace live model routing or rendered proof.

## 4. Confirmed Product Gaps

### 4.1 Chat Attachments

The current stream route accepts message, project/session IDs, selection/client context, operation ID, and visual evidence. The current chat composer has text input and send. There is no production attachment envelope for arbitrary documents, PDFs, scripts, images, videos, audio, or reference edits supplied inside chat.

Required production contract:

- server-owned attachment IDs, MIME/type, storage address, ownership, provenance, and extraction status;
- user-declared role such as script, factual source, visual reference, style reference, B-roll, logo, music, or constraint;
- extracted text/OCR/transcript/visual/audio evidence addressed back to the source;
- explicit prompt context saying what was successfully understood and what failed;
- no raw multi-megabyte attachment in the chat request;
- project-scoped authorization, deletion, and retention.

### 4.2 Project-Wide Color Grading

`apply_filter` is an explicit clip-level mechanical tool, not a complete color workflow. Production color intent needs:

- shot/reference analysis;
- exposure, white balance, contrast, saturation, skin-tone, and product-color constraints;
- shot-to-shot consistency;
- reference-strength and brand-taste context;
- per-shot decisions with a global consistency pass;
- rendered before/after frame proof.

### 4.3 Missing Or Partial Vibe Commands

- arbitrary chat attachments and reference ingestion;
- project-wide reference-driven color grading;
- translation/dubbing and language-version workflows;
- automatic aspect-ratio reframing and platform cut-downs as first-class chat jobs;
- complete multi-asset script/story execution through every downstream visual/audio owner;
- a single live suite that runs all journeys on disposable fixtures.

### 4.4 Confirmed Command Correctness Gaps

- Clip visual/audio analysis now has one source-to-edited coordinate contract (`1893189a`). Asset sampling uses source-media frames, receipts and findings use edited-timeline frames, explicit ranges are clamped to the selected clip, and ambiguous multi-clip requests fail instead of sampling the first clip. Direct regressions cover moved audio, moved/trimmed video, explicit asset/range targeting, unknown assets, and ambiguous requests.
- `apply_style` currently returns a reference-derived action plan containing follow-up chat prompts. It does not itself execute those actions as one atomic, verified style transaction. It is planner-complete, not end-to-end style-application complete.
- `use_matching_footage` now targets either an exact manual/uploaded overlay id or a unique generated scene (`00211b6c`). It owner-checks the replacement asset, requires video media, resets stale source trims, and rejects conflicting or ambiguous targets before mutation.
- The older SFX/stock/user-footage handlers return legacy success shapes that the shared wrapper normalizes into a nested payload. The outer envelope is valid and mutations are proven, but these handlers should eventually adopt the canonical envelope directly to simplify model receipts and downstream inspection.

## 5. Battle Fixture Profiles

No single project can safely prove every command. Destructive commands and provider-dependent commands require disposable, purpose-built fixtures:

1. **Speech-led multilingual:** word timings, English, Roman Hinglish, Devanagari, paraphrases, silence, filler, captions.
2. **Visual-only:** actions, objects, OCR, scene changes, stillness, no trustworthy speech.
3. **Music-led montage:** uploaded BGM, beat grid, downbeats, cuts, speed, fades, ducking, SFX.
4. **Mixed talking head + B-roll:** subject placement, captions, MG, zoom, asset replacement, collision checks.
5. **Multi-asset story:** several videos, images, logo, script, narrative reorder, unused-asset rejection.
6. **Existing generated scene:** HTML scene/sticker creation, in-place revision, regeneration, layer ordering.
7. **Failure fixture:** unavailable provider, missing asset, invalid selection, interrupted request, retry, rollback.
8. **Isolation pair:** two projects under one user to prove chat and mutation isolation.

Each fixture must declare required preconditions: overlay types and IDs, uploaded assets, transcript/language, beat evidence, selection/playhead context, and provider availability.

## 6. Absolute Proof Levels

A journey is complete only when every applicable level passes:

1. **Inventory:** the required live tool is registered and exposed.
2. **Routing:** the real model receives the prompt and chooses the licensed tool chain.
3. **Grounding:** transcript/visual/audio/asset references resolve to canonical evidence before mutation.
4. **Mutation:** Mongo before/after proves the intended state change and no unrelated change.
5. **Reload:** the editor reload shows the same canonical state.
6. **Render:** actual pixels/audio prove visibility, timing, readability, sync, and absence of collisions or silence regressions.
7. **Safety:** undo, retry idempotency, partial-failure rollback, and project isolation pass.

Read-only journeys must prove zero mutation. A tool call without its postcondition is a failure. Metadata-only quality review cannot replace rendered proof.

## 7. Execution Status

### Completed

- Canonical registry exposure truth.
- All 55 live tools represented in at least one explicit battle journey.
- Filtered legacy authority cannot satisfy the matrix.
- Deterministic harness contract covers Mongo, UI reload, render evidence, postconditions, rollback, and isolation semantics.
- Disposable fixture preparation maps every journey to a speech, visual/multi-asset, audio, mixed, or generated-scene source and seeds selection, multilingual timing, or asset aliases where required.
- The full chat-focused regression suite is green: 22 files, 187 tests.
- All 15 handlers that lacked direct literal behavioral coverage now have executable contracts through the real tool factory. Provider calls are mocked only at the external boundary; project reads, handler decisions, and mutations use the live implementations.
- The provider/asset contracts prove SFX replacement preserves timing, stock searches are read-only across video and image branches, and user-footage swaps preserve scene timing/geometry while failing without a valid target.
- Nested CSS-style tool arguments are normalized before schema validation, and a recovered schema retry no longer poisons an otherwise successful atomic transaction (`b610a724`).

### Not Yet Completed

- Independent failure and isolation-pair fixtures; current preparation covers five source profiles and scenario-specific failure/isolation setup still needs live orchestration.
- Live-provider execution of all 73 journeys.
- Rendered evidence for every mutating journey.
- Atomic execution of `apply_style`, rather than returning a plan for a later model turn.
- Chat attachment contract/UI/ingestion.
- Project-wide color-grading family.
- Translation/dubbing/reframing/repurposing command owners.

### Current Live Blockers

- The current preview Gemini key returns `429` because prepaid credits are depleted. Provider routing cannot be called live-proven while this persists.
- The first preview deployment containing `b610a724` was killed by Vercel build OOM. Its redeploy is now `Ready`, the branch alias resolves to it, and the authenticated Editron tab has been hard-refreshed before retrying live journeys.
- One authenticated `explicit-text` journey exposed the nested-style/retry-rollback defect. That root cause is fixed and regression-tested, but the same journey still requires fresh preview proof after the Gemini credit blocker clears.

No future status report may say “the entire chat-to-edit system is battle tested” until the live journey report has zero missing scenarios and every applicable proof level above is attached.
