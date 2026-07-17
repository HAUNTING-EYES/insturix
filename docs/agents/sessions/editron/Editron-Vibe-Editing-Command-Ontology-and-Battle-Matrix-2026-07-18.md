# Editron Vibe-Editing Command Ontology And Battle Matrix

**Date:** 2026-07-18
**Status:** Production test contract; live all-command proof pending
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

## 3. Current Tool Truth

The canonical registry currently contains **59** tools:

- **55 live chat tools**;
- **4 shadow-authority tools filtered from chat:** `add_motion_graphic`, `add_transition`, `auto_edit_from_script`, and `auto_motion_graphics`.

Those four tools remain compatibility/runtime code, but cannot count as chat coverage. Vague MG, transition, zoom, caption, SFX, music, pacing, and script-led requests must pass through grounded semantic intent and the existing family owners.

The battle matrix now contains **73 journeys**. Its focused contract derives live tools from registry metadata and fails if any live tool lacks a required journey or if any filtered tool enters a required journey.

This proves inventory coverage only. It does **not** prove that Gemini selects the correct tool, that the tool mutates the right project, or that the rendered result looks/sounds correct.

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
- Existing chat regression suite and focused matrix tests are green.

### Not Yet Completed

- Disposable fixture factory for all eight fixture profiles.
- Live-provider execution of all 73 journeys.
- Rendered evidence for every mutating journey.
- Chat attachment contract/UI/ingestion.
- Project-wide color-grading family.
- Translation/dubbing/reframing/repurposing command owners.

No future status report may say “the entire chat-to-edit system is battle tested” until the live journey report has zero missing scenarios and every applicable proof level above is attached.
