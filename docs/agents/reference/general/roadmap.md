# Editron Build Roadmap

## Guiding Principle
Every manual editing action that CAN be automated, MUST be automated.
Every automated action MUST be reviewable and overridable by a human.

---

## PHASE A — STABILITY & POLISH (Week 1)
*Fix everything that's broken before building new.*

| # | Item | Effort | Status |
|---|------|--------|--------|
| A1 | Rebuild transitions as real clip compositing (not HTML overlays) | 8h | TODO |
| | Two clips overlap → opacity/clipPath keyframes in overlap zone | | |
| | Dissolve, wipe, dip-to-black all use keyframe system | | |
| A1b | Motion graphics use LottieFiles (not raw HTML generation) | 4h | TODO |
| | auto_motion_graphics searches LottieFiles first | | |
| | Falls back to curated template DB, never raw HTML | | |
| A2 | Fix caption font scaling with box resize | 1h | TODO |
| A3 | Fix blank scenes on layer 2 (expired/failed video URLs) | 2h | TODO |
| A4 | Reduce AI chat back-and-forth (smarter intent, fewer questions) | 4h | TODO |
| A5 | Add keyframe editor UI (visual keyframe diamonds on timeline) | 8h | TODO |
| A6 | Add L-Cut/J-Cut UI (drag audio boundaries independently) | 4h | TODO |
| A7 | Add speed ramping UI (speed curve editor) | 4h | TODO |
| A8 | Editron UI simplification (clean timeline, minimal controls) | 8h | TODO |

**Total: ~32h**

---

## PHASE B — INTELLIGENCE BACKBONE (Weeks 2-3)
*The 5-Track Analysis + Reactive Edit Engine from master plan Sections 8-9.*
*This is the brain that makes everything else smart.*

| # | Item | Effort | Depends On |
|---|------|--------|------------|
| B1 | **5-Track Analysis Service** | 16h | — |
| | Track 1: Speech Semantic (word timestamps + sentiment) | | |
| | Track 2: Visual Content (Gemini Vision per 2s keyframe) | | |
| | Track 3: Music Structure (beat grid, sections, energy) | | |
| | Track 4: Motion/Rhythm (optical flow estimation) | | |
| | Track 5: Subject Tracking (bounding boxes per keyframe) | | |
| B2 | **Reactive Edit Engine** | 8h | B1 |
| | Edit Decision List from all 5 tracks | | |
| | Priority hierarchy: Speech > Music > Motion > Subject > Visual | | |
| | Frame-accurate cut decisions | | |
| B3 | **Cinematic Moment Detector** | 6h | B1 |
| | Multi-track peak combination for F1-style edits | | |
| | Energy peak → zoom punch, beat drop → whip pan, etc. | | |
| B4 | **Content-to-Graphic Map** | 4h | B1 |
| | 15 content types → auto-mapped graphic templates | | |
| | "Product mentioned" → callout, "Stat cited" → counter, etc. | | |

**Total: ~34h**

---

## PHASE C — ASSET-CENTRIC ARCHITECTURE (Weeks 4-8)
*From P10 analysis. Reduces generation cost 50%, enables long-form.*

| # | Item | Effort | Depends On |
|---|------|--------|------------|
| C1 | **Asset Library Panel UI** | 1 week | — |
| | Browse, preview, drag-to-timeline | | |
| | Thumbnail grid, duration badges, usage count | | |
| C2 | **Asset Analysis on Ingest** | 2 weeks | B1 |
| | Gemini Vision per 2s keyframe | | |
| | Auto-tag subjects, colors, mood, motion type | | |
| | text-embedding-004 for semantic search | | |
| C3 | **Segment Extraction UI** | 1 week | C1 |
| | Mark in/out points on asset preview | | |
| | Drag segment instances to timeline | | |
| C4 | **Semantic Segment Search** | 2 weeks | C2 |
| | "Find close-up of product" → best matching segment | | |
| | Director Agent uses search before generating new clips | | |
| | Absorbs P7E (script + footage auto-edit) | | |
| C5 | **Chapter-Based Rendering** | 3 weeks | — |
| | Break >10min into chapters at scene boundaries | | |
| | Parallel Lambda renders | | |
| | FFmpeg concatenation | | |
| | Unlocks 15min–3hr videos | | |

| C6 | **CDN + Caching Infrastructure** | 2 weeks | — |
| | Cloud CDN (or Cloudflare R2) in front of GCS | | |
| | Browser-side IndexedDB cache for active project assets | | |
| | Proxy endpoint that refreshes signed URLs transparently | | |
| | Presigned download URLs, not streaming URLs | | |
| | Eliminates: URL expiry breaks, network fetch on every play, no caching | | |
| | Reference: Frame.io (S3+CloudFront), Descript (S3+IndexedDB), CapCut (CDN+WASM) | | |

**Total: ~11 weeks**

---

## PHASE D — PROFESSIONAL GRADE (Quarter 2)
*Features that match DaVinci Resolve capability.*

| # | Item | Effort | Depends On |
|---|------|--------|------------|
| D1 | **True Dissolve Transition** | 4h | A5 (keyframes) |
| | Overlapping clips with opacity crossfade keyframes | | |
| D2 | **Real Color Grading** | 24h | — |
| | Lift/Gamma/Gain wheels | | |
| | HSL secondary correction | | |
| | LUT import (.cube files) | | |
| | Scopes: waveform, vectorscope, histogram | | |
| D3 | **Multi-Track Audio Effects** | 20h | — |
| | Per-track EQ (3-band), compression, noise reduction | | |
| | Reverb, de-esser for voiceover tracks | | |
| D4 | **Subject Tracking + Motion-Locked Overlays** | 6 weeks | B1, C2 |
| | Gemini Vision bounding boxes per keyframe | | |
| | Interpolated position track between samples | | |
| | Overlay reads tracked position each frame | | |
| D5 | **Masking** | 16h | — |
| | Shape-based mask on any video layer | | |
| | Picture-in-picture, product isolation | | |
| D6 | **Reference Video Style Transfer (full)** | 12h | B1 |
| | yt-dlp download | | |
| | Gemini Vision analysis (cuts, color, text, pacing) | | |
| | Output: Style Profile JSON → custom Edit Profile | | |
| D7 | **Script + Footage Auto-Edit (full)** | 16h | C4 |
| | Transcript alignment to script scenes | | |
| | Best-take selector per scene | | |
| | Jump cut smoothing (B-roll or subtle zoom) | | |

**Total: ~Quarter 2 full**

---

## PHASE E — SCALE & DISTRIBUTION (Quarter 3)
*Long-form content, multi-platform, enterprise.*

| # | Item | Effort |
|---|------|--------|
| E1 | 3-hour video support (chapter architecture operational) | 8h |
| E2 | Multi-platform auto-reformat (16:9 → 9:16 → 1:1 intelligent crop) | 12h |
| E3 | Batch project processing (queue of briefs → parallel production) | 8h |
| E4 | Team collaboration (multi-user project editing) | 20h |
| E5 | Version control for projects (branching, merge) | 16h |
| E6 | Export to social platforms (direct publish API) | 8h |

---

## DEPENDENCY GRAPH

```
Phase A (Stability)
  └── A5 (Keyframe UI) ──→ D1 (True Dissolve)

Phase B (Intelligence)
  ├── B1 (5-Track) ──→ B2 (Reactive Engine) ──→ B3 (Cinematic Detector)
  ├── B1 ──→ B4 (Content-to-Graphic Map)
  ├── B1 ──→ C2 (Asset Analysis)
  ├── B1 ──→ D4 (Subject Tracking)
  └── B1 ──→ D6 (Style Transfer)

Phase C (Asset-Centric)
  ├── C1 (Library UI) ──→ C3 (Segment Extraction)
  ├── C2 (Analysis) ──→ C4 (Semantic Search) ──→ D7 (Auto-Edit)
  └── C5 (Chapter Rendering) — independent

Phase D (Professional)
  └── All items independent except dependencies noted above

Phase E (Scale)
  └── Depends on C5 (Chapter Rendering) for long-form
```

---

## WHAT TO BUILD NEXT (Decision Framework)

If user wants **better video quality NOW** → Phase A (fix bugs + UI)
If user wants **smarter AI editing** → Phase B (5-Track + Reactive Engine)
If user wants **lower costs + longer videos** → Phase C (Asset-Centric)
If user wants **DaVinci-level features** → Phase D (grading, effects, tracking)
If user wants **enterprise scale** → Phase E (long-form, multi-platform)

**Recommended order: A → B → C → D → E**
(Fix what's broken → Make it smart → Make it efficient → Make it professional → Make it scale)
