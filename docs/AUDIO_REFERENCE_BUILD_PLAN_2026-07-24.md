# Editron Audio + Reference — Build Plan & Handoff

**Status:** CEO + Eng + Design reviewed, architecture locked, BUILD-READY.
**Date:** 2026-07-24. **Branch:** `infrastructure-improvs-+Editron` (worktree `editron-worktree`, auto-deploys to Vercel PREVIEW).
**Source of truth for this doc:** three read-only code investigations (music intelligence, BGM/SFX quality, reference ingestion), all file:line-verified. Everything below is grounded in real code, not speculation.

> This is a build spec for a fresh agent. It assumes no prior conversation. Read it top to bottom, then execute **Lane A first**. Do not skip the "Constraints" or "Gotchas" sections — they are hard-won and will save you hours.

---

## 0. Mission

Editron's audio is its weakest layer. Fix the quality floor first, then build a **client-music** product (users pick their own track / a royalty-free library track / AI-generated as fallback), make cuts breathe with the music, and wire references into style. Ship in phased lanes, not one mega-PR.

**Two silent-failure risks that MUST be closed with tests (non-negotiable):**
1. An unlicensed/preview-only music track must NEVER reach the renderer (fail-loud).
2. "No music" (user preference) must produce ZERO music overlays on ALL paths (today it's wired to nothing — a live bug).

---

## 1. Current reality (verified — the "before")

### BGM
- Provider: fal.ai `cassetteai/music-generator` (`lib/pipeline/bgm-service.ts:77`). Duration clamped **10–180s** (`:95`); returned `durationMs` is "approximate", never reconciled (`:159`).
- Placement: ONE sound overlay spanning `from:0 → totalFrames` on every path (worker `app/api/internal/workers/pipeline/audio/route.ts:122-148`; chat `lib/editron/agent/tools.ts:5082-5268`; finalize `app/api/services/pipeline/storyboard/[id]/finalize/route.ts:1049,1172`).
- **W1 (HIGH): no loop.** Render emits a single `<Audio>` with NO `loop` prop (`components/editron/editor/version-7.0.0/components/overlays/captions/sound-layer-content.tsx:139-146`) while the tile spans the whole video. **Videos > 180s go silent after 3 min**; shorter videos go silent whenever the generated file is shorter than requested. The `bgm-service.ts:71` "timeline loops the audio" comment is FALSE.
- **W2 (HIGH): no LUFS normalization.** Fixed linear gain (`AUDIO_LEVELS.BGM_WITHOUT_VO=0.355`, energy-driven `lib/editron/services/bgm-mix-levels.ts:52` → −12..−6 dB). `PLATFORM_SPECS` LUFS targets (`lib/editron/constants/audio-standards.ts:58-110`) are DECLARED, never enforced. `quality-gate.ts:116-118` admits it uses a proxy from volume numbers, "Real LUFS requires waveform analysis (not available pre-render)". Two tracks at the same setting differ 6–10 dB perceived.
- **W3 (MED): music generated blind to the edit.** Tempo from mood/pacing tiers only (`bgm-service.ts:197-221`); the system then snaps cuts to the music (`alignCutsToBeats`), backwards from scoring to picture. No fade-in; tail fade fades at TILE end not AUDIO end (`sound-layer-content.tsx:30-33`).
- **Good, keep it:** the ducking engine is genuinely pro — frame-accurate sidechain, asymmetric ramps (`components/.../utils/audio-ducking.ts:43-107`).

### Music coverage / placement intelligence
- **NONE exists.** Every path = one full-span overlay. Auto-edit path has a binary whether (`lib/editron/services/genre-parameter-computer.ts:200-249` `computeBgmRecommendation`: `speechCoverage>0.7 && formality<0.6 && durationSec>30`; suppresses if source music present `:208`). Storyboard/finalize dispatches BGM **unconditionally** — even editorial `music:off` is ignored there (honored only at `director-agent.ts:1882`).
- **`musicPreference: 'none'|'subtle_bed'|'energetic'|'match_video'`** EXISTS as a stored type (`schemas/EditronPreferences.ts:11`, `lib/editron/data/edit-profile-types.ts:167`) and is **COMPLETELY UNWIRED** (zero consumers). This is the live "no music" bug.
- `audioTreatment` (`lib/editron/saas-explainer/audio-treatment.ts`, `vo|music_beat`) governs where NARRATION is silent, NOT where music goes.
- Editorial off-switch exists but only bites on the auto-edit path: `lib/editron/services/editorial-decision-policy.ts:105-118` (`music.mode==='off'`), consumed by `auto-bgm-decision.ts:63-105`, enforced only `director-agent.ts:1882`.

### Beat matching
- Narrow + picture-first. `alignCutsToBeats` (`lib/pipeline/scene-to-editron.ts:489-553`) nudges ONLY montage sub-shot interior boundaries ±0.5s (`SNAP_THRESHOLD = fps*0.5`), needs ≥2 video sub-shots/scene, image sub-shots skipped.
- Chat `sync_cuts_to_beats` (`lib/editron/agent/tools.ts:4790-5012`) SPLITS one overlay at beats.
- THREE beat-grid producers: worker (real onset `analyzeBeatsFull`, `app/api/internal/workers/pipeline/audio/route.ts:189-207`), finalize (**BPM heuristic** `detectBeats`, `.../finalize/route.ts:1085-1095`), chat (`app/api/services/editron/audio/analyze-beats/route.ts:116-125`, caches `beatAnalysis` on MediaAsset).
- **`regenerate_bgm` runs NO beat alignment after replacing music** — cuts stay on the old rhythm. No music-first path anywhere.

### SFX
- Two runtime sources: the measured, rights-cleared bundled catalog first, then Freesound CC0 as provider fallback. `isSFXLibraryAvailable()` (`lib/pipeline/sfx-library-service.ts:1030`) returns `true` only when at least one source can serve audio.
- The atomic form (`lib/editron/services/sfx-form.ts`) is genuinely good engineering, but acceptance ultimately gates on **title/tag string-match** (`:224` `tokenTitleMatches`, hard-reject `:248-250`), no audio content analysis; a metadata-light file BYPASSES the gate (`+0.22` bonus `:242`). Library miss on the "smart" paths (EDL `edl-executor.ts:2598`) → SILENCE.
- Chat `add_sfx` (`lib/editron/agent/tools.ts:5391-5528`) takes raw Freesound `results[0]`, NO gate.
- Computed `duckUnderSpeech` (`sfx-form.ts:649-655`) is DISCARDED — the executor never attaches `duckingConfig` to the SFX overlay (`edl-executor.ts:2672`).
- **Curated starter pack shipped:** `public/sfx/manifest.json` contains 29 human-approved CC0 assets across whoosh, impact, tick, pop, shimmer, ambience, and foley. Each entry carries content-addressed storage, an acoustic measurement, provenance, and a rights receipt.

### Ducking (a founder-challenged claim — verified verdict)
- VO/TTS overlays: ONE continuous duck across the whole overlay (`audio-ducking.ts:59-64`), no sentence gaps. **CONFIRMED weak.**
- Legacy native clips: full-clip duck. **CONFIRMED weak.**
- Native audio WITH transcription: DOES breathe at phrase level (750ms word-gap clusters, `lib/editron/services/native-audio-evidence.ts:24-132`, `MAX_SPEECH_GAP_MS=750`, `SPEECH_PAD_MS=120`). Word timings exist project-wide; the VO branch just doesn't use them.

### Reference ingestion
- Video-only style transfer (durable job `lib/editron/services/chat-reference-style-job.ts`, video-only `:162`), and it's a REINTERPRETATION: colorGrade dropped (`tools.ts:4585-4586`), transitions/fonts/MG are "observations, not renderer commands" (`:4536-4537`).
- Image/PDF/URL → text/metadata only (`chat-attachment-contract.ts:180-210`, `chat-reference-url-fetcher.ts:10-17`). MG styling takes ZERO user references (`lib/editron/motion-graphics/codegen/style/style-resolver.ts:43-53`).
- `referenceEditDNA` is a SEPARATE generation-time field (`app/api/internal/workers/video-analysis/route.ts:171-382,763`), not chat.

### Already fixed this session (do NOT redo)
- `regenerate_bgm` R2 validator: was rejecting every healthy R2-hosted track (required `gcsPath` which is null by design on R2). Fixed — now gates `url + assetId` only; `BGMResult.gcsPath` is `string|null` (commit `3bd83168`). **BGM regeneration now works on preview/prod.**
- Chat "keep-best" transactions: successful edits no longer destroyed by a failed sibling; no empty replies (commit `82791bb6`).

---

## 2. Decisions LOCKED (CEO + Eng + Design)

| # | Decision | Locked choice |
|---|----------|---------------|
| Strategy | Music model | **CLIENT-MUSIC SPINE** — source picker: your upload / royalty-free library (H) / AI-gen = FALLBACK |
| CEO-2 | Render/rights gate | **Flag + auto-swap** — preview plays picked track; export NEVER renders unlicensed; auto-swap a cleared library track or strip+flag |
| CEO-3..6 | Bets | music-first (C4), music library (H), reference→MG (G3), reference→match (G2) ALL accepted |
| Eng-1 | Music-first depth | **BOTH, phased**: phase-1 realign pass NOW, phase-2 true-authoring SCHEDULED (own eng review) |
| Eng-2 | Preview audio storage | **Upload-but-quarantine, SAFE-HARBOR variant** — access-locked to uploader, never served to others, auto-expire, takedown-ready, provenance recorded |
| Eng-3 | Coverage planner | **FULL** (none/sections/full), but wire `music:off` everywhere FIRST as the correctness fix |
| Design-A | Rights flag UX | **Explicit consent card at ADD-time** (not export): "reference, won't be in export → swap cleared / export no music / I have the license" |
| Design-B | Source picker | **AI one-click default** + a MANDATORY always-visible "use my own / browse library" affordance (not buried) |

---

## 3. Build lanes & order

```
Lane A (FLOOR, code)   ── build FIRST. Low risk, reuses existing seams. The audible jump.
Lane B (SFX harvest)   ┐ non-code, longest lead time. START DAY 1 in parallel.
Lane H (music library) ┘ (download → curate → normalize → tag → manifest)
Lane C (picker + gate) ── after A + B. Client-music UX + render-gate.
Lane D (music-first p2) ── true authoring (composer core). Later, own eng review.
Lane E (reference→style)── G1 verify + G2 match + G3 MG + G4 ingest. Each behind a Rule-35 eval harness.
```
**Launch A + B + E in parallel** (B non-code, E is a different subsystem). C waits on A+B. D later.
**⚠ CONFLICT:** Lanes A and C both touch the audio-overlay/render path (`edl-executor.ts`, render inputProps builders) — coordinate or sequence those edits.

---

## 4. LANE A — the floor (build this first, phased ≤5 files/phase)

Each phase: implement → `npx tsc --noEmit` (expect ~4 pre-existing errors in `.next/types/avatar-vault` + `tmp/`, none should be yours) → `npx eslint <files> --quiet` → `npx vitest run <test>` → commit path-scoped → push.

### A1. Audio conditioning service (NEW `lib/pipeline/audio-conditioning.ts`)
The single most important fix. One function every audio source flows through before the timeline:
```
conditionAudio({ buffer|url, targetFrames, fps, platform }) →
  decode (reuse audio-decode WASM — already used in app/api/internal/workers/pipeline/audio/route.ts:189)
  → measure real duration
  → loop OR trim to EXACTLY targetFrames  (equal-power crossfade at the loop point — no click/seam)
  → LUFS-normalize to PLATFORM_SPECS target (audio-standards.ts:58-110) via EBU R128 on the decoded PCM
  → sanity: not-silent, not-clipping
  → return conditioned asset + measured LUFS + wasLooped
```
- **HR1 FEASIBILITY SPIKE (do this before building on it):** prove ebur128-on-decoded-PCM measures within ±1 LU of a reference meter, pre-render. Search Layer-1 libs (a JS/WASM ebur128 or loudness lib). If it can't be done pre-render, escalate — do not silently ship the proxy.
- Wire into: pipeline audio worker (`app/api/internal/workers/pipeline/audio/route.ts`), finalize (both branches), `regenerate_bgm` (`tools.ts:5082-5268`), SFX placement, and the Lane-C user-track path.
- A2 fades: add a fade-IN; fix `applyTailFade` (`sound-layer-content.tsx:30-33`) to anchor at AUDIO end, not tile end.
- **Acceptance:** a 6-min video has continuous music start→end; two renders at the same setting land within ±1 LU; no silent tails.

### A-bug. Wire `music:off` / `musicPreference==='none'` EVERYWHERE (correctness fix — do early)
- Honor `musicPreference==='none'` AND editorial `music.mode==='off'` on ALL paths, including storyboard finalize (`.../finalize/route.ts:1049,1172` — today unconditional). Today `musicPreference` has ZERO consumers.
- **REGRESSION TEST (mandatory):** `'none'` → ZERO music overlays on all three paths.

### B2. Coverage planner (NEW `lib/editron/services/music-coverage-planner.ts`)
- Inputs: speech-coverage segments, energy arc, source-music detection, content type, `audioTreatment` beats, `musicPreference`. Output: `musicPlan { mode:'none'|'full'|'sections', sections:[{startFrame,endFrame,intent,energyTier}] }`.
- Query the CKG (`lib/editron/data/creative-knowledge-graph.json`) for genre music norms before hardcoding thresholds.
- Render already supports arbitrary sound overlays → section-scoped BGM is placement-only.
- **Rule-29 gate:** adversarially test across ≥8 content types (talking-head tutorial→none/subtle, ad→full, vlog→sections, doc→sections) BEFORE ship.

### C1. Beat-align on music change + widen scope (music-first phase 1)
- Extend `alignCutsToBeats` (`scene-to-editron.ts:489`) from montage-only → ALL cut boundaries (same ±0.5s + 1s-min-duration guards); fix the `isMontageSub` inconsistency (older `scenesToOverlays` builder never sets it); include image sub-shots.
- Run alignment on EVERY music change: after `regenerate_bgm`, set-as-bgm, library-pick (today `regenerate_bgm` runs none). Auto lane applies it; Director Mode offers it as a chip.
- Replace finalize's BPM-heuristic `detectBeats` with `analyzeBeatsFull` onset detection everywhere; store one grid on the BGM asset.
- Behind a feature flag.

### E1/E2. Ducking
- E1: sentence-gap VO ducking — reuse `deriveNativeAudioEvidence` clustering (`native-audio-evidence.ts:24-132`, 750ms/120ms) on the VO asset's word timings (persist word timings at TTS gen; transcribe once if absent). The render engine already supports N regions — region-derivation work only.
- E2: attach the already-computed `duckUnderSpeech` config to SFX overlays (`sfx-form.ts:649` → `edl-executor.ts:2672`, currently discarded); add SFX one-shots as duck sources for music.

### F5. Fail-loud
- Completed: `isSFXLibraryAvailable()` returns `false` only when both the bundled catalog is empty and `FREESOUND_API_KEY` is absent, so callers neither starve valid bundled assets nor reserve impossible provider work.

---

## 5. Architecture locks (for Lanes C/D/E)

### Render/rights gate (Lane C — fail-loud, single chokepoint)
- Add `musicRights: { source:'user-upload'|'library'|'generated'|'preview-only', userChoice:'swap'|'no-music'|'attested', licensed:bool }` to the sound overlay.
- Enforce in the render-inputProps assembly — the **cloudrun/render + chapter-renderer** pair (the SAME two builders the `isRendering` fix `81bb39b3` touched; grep for the inputProps construction there). Add `resolveRenderableAudio(overlay)`:
  - `preview-only` + `userChoice:'swap'` → substitute a vibe-matched cleared library track (needs Lane H); below confidence floor → strip + flag (NOT a random swap).
  - `preview-only` + `no-music` → strip.
  - `preview-only` unresolved reaching the assembler → **THROW `UnlicensedAudioInRenderError`**. Never silently render.
- Editor preview plays the real track; render substitutes server-side. **REGRESSION TEST (CRITICAL):** unlicensed track reaching the assembler throws; swap/strip paths correct.
- Auto-swap match signal: use a LOCAL audio-feature analyzer (bpm/energy/mood), NOT the Spotify audio-features API — avoid an OAuth dependency on a render-blocking path.

### Preview audio storage (quarantine, safe-harbor)
- Store `source:'preview-only'` uploads access-locked to the uploader ONLY, never served to another user / never searchable, auto-expiring, notice-and-takedown ready, provenance recorded. The safe-harbor posture is REQUIRED, not optional.

### Music-first phase 2 (Lane D, later, own eng review)
- Composer picks shot lengths FROM the beat grid (`director-agent`/composer core). Feature-flag + auto-fallback to the phase-1 realign on any beat-grid gap.

### Reference→style (Lane E — Rule-35 eval-gated)
- G1: seed the `durable-reference-asset` fixture; get the `reference-style-transfer` battle scenario GREEN (it has NEVER passed).
- G2 "match" mode: a `reinterpret|match` fidelity knob on `apply_reference_style`; `match` drives renderer commands (transitions/caption styles/MG density APPLIED, color grade extracted AND applied). Kills reference caveats 1+2.
- G3: VLM pass over reference frames/image → style tokens → new input to `style-resolver.ts:43-53` + designer moodboard (`design-session.ts:44`).
- G4: image → VLM tokens; PDF → brand tokens (reuse brand-vault extractors); URL → screenshot + VLM (reuse brand-vault website-scan machinery). Same token schema.
- **Rule 35 is a hard gate:** build the token-extraction EVAL HARNESS first, multi-seed F1 ≥0.85, NO VLM prompt deployed without a passing eval.

---

## 6. Spotify / licensed music (hard constraint)
Spotify & Apple Music API terms **FORBID rendering their catalog audio into an export.** Spotify = discovery + "make it feel like this" reference signal ONLY; its track NEVER touches the render. A real render-safe catalog is user-upload, the royalty-free library (H), or generation. Do not build a "render the Spotify track" path — it's not a bug, it's illegal.

---

## 7. SFX pack (Lane B) + music library (Lane H) — harvest sources
- **SFX:** Sonniss GameAudioGDC bundles (https://sonniss.com/gameaudiogdc/) — 30+GB/yr, royalty-free commercial, pro-grade, multiple years available. + Mixkit / Pixabay (free commercial, trendy tier). Optionally 2-3 Boom Library packs for a tone-matched signature core. AVOID: BBC sound archive (education-only, not client-safe).
- **Music:** Uppbeat / Mixkit-tier royalty-free (free commercial). Store license provenance per track (vet at INGEST, not at use).
- **Curation pipeline (both):** pick best-N per event-type/mood → run through the A1 conditioning (normalize, trim) → tag by ACTUAL audio features (SFX: `{eventTypes[], energy, durationMs, brightness, layerRole:riser|impact|oneshot|loop, trendTag}`; music: `{mood, bpm, energy, structure, genre}`) NOT filenames → write `public/sfx/manifest.json` + `public/music/manifest.json` (or R2 + a DB manifest).
- Selection engine: manifest-first, Freesound fallback; the title-match gate becomes moot for pack assets (we own the metadata).

---

## 8. Design specs (Lane C UI — calibrate to `design_system_v1`)
- **Rights = explicit consent card at add-time.** Non-cleared track added → card: consequence FIRST ("This is a reference — it plays here but won't be in your export"), then three choices [Swap in a cleared track that fits] / [Export without music] / [I have the license]. Save to `musicRights.userChoice`. No export surprise.
- **Picker = AI one-click default** (prominent "Generate music") + an ALWAYS-VISIBLE "Use my own / Browse library" secondary button (NOT a buried link/accordion — else the library dies undiscovered).
- **Coverage = a visible segmented control** None | Sections | Full ('None' reachable = the UX half of the music:off fix). 'Sections' shows span markers on the timeline.
- **Interaction state map (was fully unspecified — implement all):**
```
SURFACE          | LOADING            | EMPTY                  | ERROR                       | SUCCESS            | PARTIAL
AI generate      | progress + CANCEL  | —                      | provider fail→keep old BGM  | plays vs cut now   | conditioning: 'normalizing…'
Browse library   | skeleton rows      | WARM: 'Pick a vibe'    | load fail→retry inline      | preview on hover   | 'no match, fewer filters'
Rights consent   | instant card       | —                      | —                           | choice saved, badge| 'license'→attest checkbox
Swap@export      | 'finding a fit…'   | no match→silent+flag   | swap fail→export no music+note| swapped+note      | below-conf→offer manual
Reference attach | upload / 'reading' | 'Drop link/PDF/image'  | unsupported→named reason    | 'style captured'   | 'got text, no visuals'
```
- **Emotional arc:** picking music should feel like SCORING not paperwork — the chosen track previews AGAINST the real timeline immediately (hear the edit with music in the first 5 seconds, before commitment). The rights card reads as "we've got you covered", not "you did something wrong".
- Remaining design debt (not blocking): real visual mockups (run /design-review on the live picker post-build), mobile picker responsive spec.

---

## 9. Failure / risk registry
```
AREA                | FAILURE MODE                         | MITIGATION (must be in build)
Conditioning        | LUFS not measurable pre-render       | HR1 spike: ebur128 on decoded PCM; escalate if not
Conditioning        | loop seam click                      | equal-power crossfade; test <30s tracks
Music-first (C4)    | wrong-timed edit if authority buggy  | flag; auto-fallback to phase-1 realign on grid gap
Render gate         | unlicensed track leaks to export     | HARD fail-loud throw; both inputProps builders
Auto-swap           | bad vibe match worse than silence    | confidence floor; below → silent+flag not random
Reference (G2/3/4)  | VLM hallucinates → ugly output       | Rule-35 eval BEFORE prompt; multi-seed F1 gate
Music library (H)   | mis-licensed "royalty-free" track    | license provenance stored; vet at ingest
Coverage planner    | 'none' on content needing it         | Rule-29 ≥8 content-type adversarial test
Harvest (F/H)       | 30GB download stalls code lane       | PARALLEL from day 1; code never blocks on it
```

---

## 10. Test requirements (100% of new codepaths)
- `audio-conditioning`: golden-file loop-to-exact-length (47s→130s seamless), LUFS ±1 LU, silent/clip guard. (unit)
- **RENDER GATE `resolveRenderableAudio`: preview-only→swap; no-match→strip+flag; unresolved→THROWS. (unit, CRITICAL / regression-rule)**
- **`music:off` wiring: 'none'→ZERO overlays on all 3 paths. (unit, CRITICAL / regression)**
- coverage planner: Rule-29 matrix ≥8 content types. (eval/adversarial)
- beat-realign-all-cuts: boundaries snap; runs on music change. (unit + integration)
- auto-swap: below-confidence→silent+flag not random. (unit)
- sentence-gap VO ducking: 3 sentences→3 regions not 1. (unit)
- reference→style: Rule-35 eval harness BEFORE any VLM prompt. (eval, GATE)

---

## 11. Constraints (hard rules — violating any is a defect)
- **Push `origin` ONLY, never `haunting`.** Push: `git -c credential.helper='!gh auth git-credential' push origin infrastructure-improvs-+Editron`.
- **Shared worktree, shared index.** NEVER `git add -A` (Mongo URI footgun + sweeps other sessions' staged files). Stage explicit paths, then `git diff --cached --name-only` to confirm ONLY your files. For a file others also edit (e.g. `tools.ts`), check `git diff HEAD -- <file> | grep '^@@'` for foreign hunks BEFORE committing; if present, stage only your hunk via `git apply --cached <hunk.patch>`.
- Commit messages end with: `Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>` (or Codex's own attribution).
- eslint before pushing site code; internal `<a href>` must be `<Link>`.
- Phased execution ≤5 files/phase; verify (tsc + eslint + tests) each phase before the next.
- NEVER print `MONGODB_URI` or API keys. `scripts/` is a Mongo-URI footgun — never `git add scripts/` blindly.
- Never MVP; production-grade first pass. Fail loud, deterministic where possible.
- Query the CKG (`lib/editron/data/creative-knowledge-graph.json`) before hardcoding any creative threshold (dB, energy, timing).
- Rule 35 (prompt work): XML structure, data LAST, rules over examples, seed set, eval harness FIRST — NEVER deploy a prompt without a passing eval.

---

## 12. Gotchas (operational, hard-won)
- `regenerate_bgm` R2 validator + keep-best transactions already fixed this session (commits `3bd83168`, `82791bb6`) — don't redo.
- The render inputProps are built in TWO places (cloudrun/render + chapter-renderer). The `isRendering:true` fix (`81bb39b3`) had to touch both — the render-gate must too.
- The audio worker already decodes BGM via `audio-decode` WASM for beat detection (`app/api/internal/workers/pipeline/audio/route.ts:189`) — reuse that decoded buffer for conditioning, don't decode twice.
- Preview DB is `editron_prev` (NOT `insturix_preview`/prod). Preview env creds in `.env.local.vercel`. Live test pattern: `set -a; . <(grep -E '^(MONGODB_URI|EDITRON_MONGODB_DB_NAME|MONGODB_DB_NAME)=' .env.local.vercel); set +a; LIVE_MONGO=1 npx vitest run <test>`. Node probe: `NODE_PATH=<worktree>/node_modules node --env-file=.env.local.vercel <script.cjs>`.
- Full plan artifact with review history: `~/.gstack/projects/Insturix-Front-End/ceo-plans/2026-07-24-audio-and-reference-master-plan.md`.

---

## 13. Start here
1. Kick off Lane B + H harvest (non-code, longest lead) — download Sonniss + a royalty-free music set.
2. Build Lane A phase A1 (conditioning) — start with the HR1 LUFS feasibility spike, then the service, then wire `regenerate_bgm` first (it's the smallest consumer and already R2-fixed).
3. Then A-bug (music:off wiring + regression test), then B2 (coverage), C1 (beat-realign), E1/E2 (ducking), F5 (fail-loud).
4. Then Lane C (picker + render-gate) once A + the library (H) exist.

---

## 14. Verified implementation delta (2026-07-25)

This section records the post-plan audit and is the current execution ledger. It does not
retroactively relabel partial convergence as complete.

### Verified complete or substantially wired
- Generated BGM: CassetteAI/FAL generation, exact-duration conditioning, LUFS normalization,
  music coverage, beat analysis, ducking, durable rights, and render consumption.
- Uploaded BGM: user assignment, rights attestation, controlled derivative, beat analysis,
  coverage, durable receipt, and render consumption.
- `music:off`: zero-music behavior is covered across the production paths.
- Render rights gate: unresolved or unlicensed music cannot silently reach render assembly.
- Transition and MG SFX: semantic intent, catalog selection, atomic timing, overlay placement,
  rights metadata, and audit receipts exist.
- Partner discovery foundation: provider-neutral catalog contract, Epidemic server adapter,
  authenticated search route, explicit non-renderability, and mocked failure-contract tests.

### Verified partial or missing
- The bundled SFX manifest now contains 29 human-approved CC0 starter assets. This validates the
  ingest, review, publication, rights, selection, and rendered-mix path, but it is not the large
  labelled production corpus.
- Transition direction does not yet reach catalog ranking, and dissolve behavior is inconsistent
  between canonical and legacy mappings.
- MG lacks `stat-impact` and `exit-whoosh`; `entrance-pop` and `logo-reveal-sting` lose semantic
  precision before catalog selection.
- Computed SFX ducking/fade/loudness form is not fully consumed by Remotion.
- Epidemic entitlement/download, controlled ingest, and provider-license receipts remain absent;
  Soundstripe has no adapter yet.
- Export `swap` can remove unsafe music but cannot yet select a cleared replacement.
- A clean-master artifact plus platform-native track/timing/beat-entry handoff receipt is absent.

### Provider strategy
1. Export-safe partner catalog: Epidemic Sound Connect first; Soundstripe second where contract
   terms permit the required storage and delivery behavior.
2. Generated fallback: CassetteAI for unique music and its dedicated FAL sound-effect model for
   effects when the cleared catalog has no acceptable match.
3. Platform-native handoff: export a clean/no-BGM master plus track recommendation, timing window,
   and beat-entry marker. Instagram or TikTok performs the licensed chart-music attachment.
4. Spotify is reference/discovery input only. Spotify audio never enters a rendered export.

### Canonical SFX flow
`timeline event -> SfxIntent -> rights-cleared catalog -> semantic/quality selector -> atomic
timing and mix resolver -> overlay + audit receipt`

Catalog entries must carry event role, surface, energy, brightness, weight/material, duration,
transient/tail/loop properties, direction/motion speed, measured loudness/clipping, negative tags,
provider identity, license identity, and attribution requirements. Silence remains a valid result.

### Production phase ledger
1. P6A (done): canonical catalog contract, Epidemic adapter, authenticated search, mocked tests.
2. P6B (code complete, operationally gated): entitlement/download, controlled storage ingest,
   acoustic analysis, and durable `library-license` receipt exist. A live branch-scoped Epidemic
   search passed on 2026-07-28. Epidemic's API does not issue an agreement-ID credential:
   commercial and sublicensing rights come from the partner plan. The current
   `EPIDEMIC_SOUND_LICENSE_AGREEMENT_ID` is only Editron's internal operator-supplied audit
   reference, and must not be fabricated from the API key. Controlled production ingest remains
   fail-closed until the operator records a real partner-contract reference.
3. P6C (done): one-click AI choice plus visible upload/library picker using the existing assignment
   path.
4. P6D (partial): clean-master output and platform-native handoff receipt exist. Local-feature
   cleared auto-swap still needs a populated cleared catalog.
5. P7A-D (done): catalog contract, measured ingest, conditioning, human listening approval,
   publication tooling, semantic kinetic events, speech/density policy, fail-closed rights, and
   rendered SFX mix.
6. P7E (done): metadata-first FSD50K harvest. Pin the official version/checksums, retain the
   complete CC0 rights-eligible pool, preserve per-clip and dataset provenance, and report
   provisional role signals and gaps. Do not download the 24.7 GB audio archive in this phase.
7. P7F (pilot complete): P7F1 deterministically sampled a role-balanced, risk-free subset
   backed by FSD50K ground-truth labels, re-verifies each source as CC0 through the Freesound API,
   downloads HQ screening audio, and runs the production controlled-ingest acoustic gate. The first
   2026-07-28 real run selected 35 sources, retained 14 measured files, and exposed that raw provider
   peaks were being tested against the final `-1 dBTP` delivery ceiling before conditioning. The
   controlled ingest now decodes and conditions each recoverable source before enforcing final
   acoustic quality. A fresh battle run accepted all 35 conditioned sources across seven roles:
   every artifact is a 48 kHz WAV, every peak is at or below `-1 dBTP`, and every file matches its
   receipt hash and CC0 rights ID. Pinned CLAP embedded all 35 pilot sounds, found 34 clusters, and
   selected 34 representatives. Human review approved 29 exact files; no cluster member inherited
   approval from its representative.
8. P7G (starter complete): published the 29 approved CC0 files to controlled storage, wired the
   dedicated CassetteAI SFX fallback, and passed a zero-credit transition/MG/SFX Remotion canary.
   This proves the factory and runtime path, not production-sized inventory.
9. P8 (current; large labelled corpus): materialize the complete 19,873-item FSD50K CC0 pool from
   the official checksum-pinned 24.67 GB multipart archives into an offline curation workspace.
   Every candidate remains non-publishable until acoustic inspection, pinned embeddings,
   classification, near-duplicate clustering, and representative review are complete. Runtime
   vector retrieval and designed-source gaps such as risers and logo stings remain subsequent
   P8 phases.

### Locked open-ended SFX coverage model
Editron will not enumerate every editorial situation. A finite event-role enum is an indexing and
policy aid, not the creative universe. Selection composes surface, event, material, direction,
motion speed, energy, duration, speech context, and negative constraints. Audio embeddings provide
open-ended semantic retrieval over the rights-cleared pool; deterministic rules enforce rights,
quality, timing, and mix. If retrieval confidence is low, generation may supply a controlled
fallback. If neither lane clears its threshold, silence is the correct result.

FSD50K uploader titles/tags are untrusted provisional evidence. They may prioritize candidates but
can never become final production labels without acoustic inspection and embedding/classifier
evidence. The seed listening pack remains a pipeline QA fixture, not a production-sized catalog.
