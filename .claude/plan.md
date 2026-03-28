# Phase B Hardening + Phase C Full + Cross-Service Brain Design

## What We Know Now

### Phase B (Intelligence) — Status: WIRED but FRAGILE
The entire pipeline is connected: 5-Track Analysis → Reactive Edit Engine → EDL → Executor → Director.
**However**, the whole thing is wrapped in a single try-catch (line 94-200 of director-agent.ts). If ANY step fails, the ENTIRE intelligence layer is skipped silently. This is the "C1" audit issue.

**Current flow:**
1. Director loads overlays
2. Step 1.5: analyze → EDL → execute (non-fatal catch)
3. Steps 2-13: profile-based actions (transitions, captions, etc.)

**Problems to fix:**
- **Silent failure**: If Gemini returns an error, analysis returns null, EDL gets empty array, executor does nothing — user gets a "dumb" edit with no intelligence
- **No asset analysis for real footage**: Only AI-generated scenes (with storyboard) get meaningful analysis. Real uploaded footage gets bare-bones Gemini Vision
- **content-graphic-map.ts is dead code**: Should be deleted (Track A handles graphics now)
- **EDL graphic templates are basic**: Just a blur box with text. No variety in callout/counter/lower-third styles
- **No EDL inspection UI**: User can't see what intelligence decided or override it

### Phase C (Asset-Centric) — Status: BACKEND 60% DONE, UI 0%
Surprisingly, a lot exists:
- MediaAsset model + MongoDB collection ✅
- GCS upload flow (signed URLs) ✅
- Asset resolver + URL proxy ✅
- CDN resolve endpoint ✅
- IndexedDB browser cache ✅
- List API (`/api/services/editron/media/list`) ✅
- Chapter renderer (code exists) ✅

**Missing:**
- **Asset Library Panel UI** (C1) — the frontend panel
- **Analysis on ingest** (C2) — auto-analyze uploaded assets
- **Segment extraction** (C3) — in/out points on video
- **Semantic search** (C4) — "find close-up" → best match
- **Chapter rendering wiring** (C5) — UI + Director integration

---

## The Plan — 3 Tracks

### Track 1: Phase B Hardening (2 days)

**B-FIX-1: Make analysis failures granular, not all-or-nothing**
- Currently: one try-catch wraps everything. If analysis fails for asset 3 of 4, all intelligence is lost.
- Fix: Wrap each asset's analysis individually. Track which succeeded vs failed. Run EDL on whatever we got.
- File: `lib/editron/agent/director-agent.ts` lines 131-165

**B-FIX-2: Better error reporting**
- Add structured logging: `[Director] Asset ${assetId}: analysis SUCCESS (cached) | FAILED: ${reason}`
- Surface analysis results in the Director's SSE progress stream so the user sees "Analyzed 3/4 scenes, 1 failed (no video URL)"
- File: `lib/editron/agent/director-agent.ts`

**B-FIX-3: Richer graphic templates in EDL Executor**
- Current: All graphics are the same blur-box-with-text
- Add 5 distinct templates: stat-counter (animated number), callout (arrow + label), lower-third (name/title bar), quote-card (styled quote), keyword-highlight (bold pop)
- Each template has entrance animation (slide, fade, scale) + auto-sizing
- File: `lib/editron/services/edl-executor.ts` applyGraphic()

**B-FIX-4: Delete dead code**
- Remove `lib/editron/services/content-graphic-map.ts` — replaced by Track A
- Clean up any imports referencing it

**B-FIX-5: Add EDL summary to Director result**
- Return `edlSummary: { totalDecisions, executed, skipped, byType: { transition: 3, zoom: 2, graphic: 4 } }` in Director response
- Frontend can display this in the quality review panel

### Track 2: Phase C — Asset-Centric Architecture (2 weeks)

**C1: Asset Library Panel (3 days)**
- New component: `components/editron/editor/version-7.0.0/components/asset-library/asset-library-panel.tsx`
- Grid view with thumbnails, file type icons, duration badges
- Search/filter by type (video, audio, image)
- Click to preview (video plays inline, audio plays, image zooms)
- Drag-to-timeline: DnD from panel → timeline creates overlay at drop position
- Upload button: triggers existing GCS upload flow
- Tab in sidebar alongside SFX Library, Transitions, LottieFiles
- Uses existing `/api/services/editron/media/list` endpoint

**C2: Asset Analysis on Ingest (4 days)**
- After upload completes → trigger 5-Track analysis in background
- Use QStash worker (like video gen worker) to avoid blocking upload response
- New endpoint: `app/api/internal/workers/asset-analysis/route.ts`
- Store analysis result in `asset_analyses` collection (same as existing)
- Add `analysisStatus: 'pending' | 'analyzing' | 'complete' | 'failed'` to MediaAsset
- Auto-tag: content type, subjects, energy level, shot type
- Add `tags: string[]` and `semanticEmbedding: number[]` to MediaAsset schema
- Use Gemini `textEmbedding` for semantic vectors
- Asset Library Panel shows analysis status badge (spinning → green check)

**C3: Segment Extraction (3 days)**
- In Asset Library detail view: video player with in/out markers
- Drag handles on mini-timeline to set start/end
- "Save Segment" button creates a child asset referencing parent + time range
- Segments appear in Asset Library as sub-items under parent
- When dragged to timeline, overlay uses `startFrom` + `endAt` from segment
- Schema: add `parentAssetId`, `segmentStart`, `segmentEnd` to MediaAsset

**C4: Semantic Search (3 days)**
- Search box in Asset Library: natural language query
- Backend: embed query with Gemini → cosine similarity against `semanticEmbedding`
- Return ranked results with confidence scores
- Director Agent integration: before video generation step, query "do we have existing footage matching this scene description?"
- If match found with confidence > 0.8 → use existing asset instead of generating
- Cost savings: skip $0.60 fal.ai video gen call per reusable scene

**C5: Chapter Rendering UI (2 days)**
- For projects > 3 minutes: auto-suggest chapter mode
- UI toggle: "Render as chapters" in render dialog
- Progress shows per-chapter status (rendering, complete, failed)
- Uses existing `chapter-renderer.ts` backend
- Director Agent: if chapter mode, process each chapter independently

### Track 3: Cross-Service Brain Compatibility (1 day — design + interfaces)

**Goal:** Make the Intelligence backbone (5-Track + EDL + Executor) a reusable module that other Insturix services can plug into.

**Design:**
```
Universal Analysis Interface:
  analyzeContent(input: ContentInput): Promise<ContentAnalysis>

ContentInput =
  | { type: 'video', url: string, metadata?: any }    // Editron
  | { type: 'image', url: string, metadata?: any }    // Clickatron
  | { type: 'text', content: string, metadata?: any } // ThinkForge
  | { type: 'audio', url: string, metadata?: any }    // Musitron
  | { type: 'webpage', url: string, metadata?: any }  // Alyzitron

ContentAnalysis = {
  contentType: string,
  subjects: Subject[],
  sentiment: SentimentScore,
  topics: string[],
  energy: number,
  embedding: number[],        // For semantic search across services
  serviceSpecific: any,       // Editron: 5-track, Clickatron: composition, etc.
}
```

**What this enables:**
- ThinkForge writes a script → brain knows what visual assets exist (from Clickatron/Editron)
- Alyzitron analyzes a competitor video → brain extracts style for Editron to apply
- Clickatron generates thumbnail → brain checks it matches the Editron video's mood
- Musitron generates music → brain knows the video's pacing to match BPM
- Brand DNA Vault (CTO's vision) = stored ContentAnalysis across all projects

**Implementation:** Create `lib/shared/universal-analysis.ts` as an interface layer. Each service implements its own adapter. For now, Editron's adapter wraps 5-Track Analysis. Other services get stub adapters that return minimal analysis.

---

## Execution Order

```
Day 1-2:  Track 1 (Phase B hardening) — all 5 fixes
Day 3-5:  C1 (Asset Library Panel) + C2 start (worker setup)
Day 6-8:  C2 complete (analysis + tagging) + C3 (segments)
Day 9-11: C4 (semantic search + Director integration)
Day 12:   C5 (chapter rendering UI)
Day 13:   Track 3 (cross-service interface design + Editron adapter)
Day 14:   Full integration test + adversarial audit
```

## What This Unlocks

After all 3 tracks:
1. **Director is smarter**: No more silent failures, richer graphics, visible decisions
2. **Users upload their own footage**: Logo, B-roll, intros — all draggable to timeline
3. **AI reuses existing assets**: "Close-up of product" → searches library before generating new video ($0.60 saved per reuse)
4. **Long-form possible**: Chapter rendering UI for videos > 3 min
5. **Cross-service foundation**: Any future Insturix service can query the brain
6. **Brand DNA Vault ready**: Universal analysis = stored brand intelligence per user
