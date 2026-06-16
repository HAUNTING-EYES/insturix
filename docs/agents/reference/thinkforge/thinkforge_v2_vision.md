---
name: ThinkForge V2 Vision — Editron-Ready Structured Output
description: ThinkForge V2 (branch thinkforge-enhancementsV2) is NOT just a script editor. Goal — every script written in ThinkForge is natively structured to feed Editron with maximum signal. Even if user never exports, the structure aids Editron when they do later.
type: project
originSessionId: 45c272f8-170c-4dbd-9bd6-ff62dd01241f
---
# ThinkForge V2 — The Editron-Ready Authoring Vision

**Branch:** `thinkforge-enhancementsV2`
**Sprint scope:** ThinkForge ONLY. Do NOT touch editron/pipeline directly this sprint.
**Date set:** 2026-04-26

## The Core Insight

ThinkForge today produces scripts that the export-for-editron route post-processes (LLM parser → quality gate → fallback) to extract structure. That's backwards. The structure should exist NATIVELY in the script as authored — not be reverse-engineered at export time.

## Two Modes ThinkForge V2 Must Serve

### Mode 1: Script-to-Editron Direct (AI video pipeline)
User intends to make video via Editron's AI pipeline. Their script in ThinkForge must already contain everything Editron needs:
- Scene boundaries (explicit, not inferred from regex)
- Per-scene narration vs visualDescription vs editorial metadata (separated by block type, not concatenated)
- Per-scene subjects/entities (named, tagged) — currently MISSING (audit C4)
- Per-scene duration intent (with durationWasExplicit flag set at authoring time)
- Editorial directives (mood, transitions, on-screen text, motion graphics) — first-class blocks, not free text
- Brand DNA injected during authoring — not lost at export (audit H5)

### Mode 2: Script-as-Reference (live shoot or hybrid)
User writes the script in ThinkForge but shoots video themselves OR uses partial AI fill. Even here, the same structured output makes their script:
- Ready for the storyboard sketch feature (rough shoot guide)
- Ready for calendar trend updates (niche-aware revisions)
- Ready to send to Editron later if they decide to mix in AI clips

## Operational Translation of the Vision

| Today | V2 Target |
|---|---|
| Script is rich text (Tiptap blocks: header/paragraph/action/why/example) | Script is rich text + STRUCTURED scene blocks with typed slots: narration, visualDescription, subjects[], duration, editorial metadata |
| Editorial headers ("Emotional Target:", "Instrumentation:") detected via regex AT EXPORT and rerouted to rawProductionNotes | Editorial headers are a FIRST-CLASS block type at authoring time. No regex needed. |
| LLM parser extracts subjects globally (characterDescriptions) | Authoring agents tag subjects per scene as the script is generated |
| Brand DNA stored in /brand-dna route, never reaches export | Brand DNA is a context source for ALL agents (script-author, refinement, etc.) and travels with the export payload |
| Quality gate at export rejects garbage | Quality gate at AUTHORING — block-level Zod schemas reject malformed input before save |
| suggestedProfileCategory inferred at export by LLM | Profile category SUGGESTED during authoring (script-coherence-agent) and revisable in UI |
| onScreenText extracted at export | onScreenText is a typed block authored by user |

## Existing Features Per User (Reference Anchors)

User mentioned these are in-process or planned:
- **Calendar with trend updates** — calendar that surfaces trending content for the user's niche, prompting script revisions. (Implementation: `app/api/services/thinkforge/content-planning/`)
- **Storyboard sketch** — rough sketch view of how to SHOOT the video (not for AI gen, for live shoot guidance). (`components/dashboard/ThinkForge/StoryboardingMode.tsx` — verify wiring)
- **Brand DNA / DataBank** — knowledge captured per project. (`/brand-dna`, `/databank`)
- **Multi-document syncing** — cross-doc-sync exists for screenplay → VFX brief, etc. (`lib/thinkforge/services/cross-doc-sync.ts`)

## V2 Sprint Direction (Not yet committed — confirm before building)

Suggested ordering:
1. **Block-type formalization** — define a SceneBlock and EditorialBlock as first-class Tiptap node types alongside the existing action/why/example blocks. Wire them through tiptap-to-thinkforge mappers.
2. **Subjects-per-scene tagging** — script-author-agent emits subjects[] inline. Add UI affordance for user to confirm/edit.
3. **Brand DNA flow** — fetch brand DNA in script-author-agent context assembly. Persist into export payload.
4. **Authoring-time validation** — Zod schemas on save (/script/save, /script/blocks). Block-level validation before storage.
5. **Open-bug squash** — fix the "opening previous project always starts new script" bug (separate memory file: thinkforge_open_bugs.md)
6. **Calendar + storyboard wiring audit** — verify these in-progress features are still functional or need revival.

## Out of Scope This Sprint
- Anything in `lib/editron/` or `app/api/services/pipeline/`
- The 13-step Director Agent
- Profile detection refactor (move-before-finalize)
- BGM/SFX workers
