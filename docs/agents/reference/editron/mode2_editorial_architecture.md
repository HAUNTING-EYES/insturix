---
name: Mode 2 Editorial Pipeline — Repetition Intent Discriminator
description: Complete architecture for deterministic retake detection with intentional repetition protection. Research-backed (nobody else has solved this), adversarially tested against 54 profiles. Three implementation phases, each independently shippable.
type: project
last_updated: 2026-05-10
---
# Mode 2 Editorial Pipeline — Repetition Intent Discriminator

## The Problem (Why This Exists)

When a speaker repeats something, the system must decide: **RETAKE (cut) or INTENTIONAL (keep)?**

- **Retake:** Speaker tries to land a line, says it 3-6 times with slight variations → keep best, cut rest
- **Intentional:** Speaker deliberately repeats for emphasis, teaching, comedy, rhythm → keep ALL

No product, paper, patent, or open-source project solves this generally. We verified via exhaustive search (2026-05-10): Reddit, Google Scholar, arXiv, GitHub, patents, 8+ commercial products. The gap is real.

## What Failed (Decision History)

| Approach | What happened | Why it failed |
|----------|--------------|---------------|
| Gemini DUPLICATE_TAKE | 36 segments removed, 31 were valid content | Can't distinguish retake from different argument point in single-topic video |
| Keyword overlap (strategy 4) | Quality regression, overcutting | Matches topic words ("grocery", "internet") across different points |
| Context enrichment | Poisoned classifier | Raw footage starts with meta → Gemini infers wrong topic → cuts thesis |
| Compound regex rules | 106 false positives across 10 content types | "one more time" (coaching), "put this in" (cooking) — everyday English |
| 5-layer architecture (original) | 96 false positives, 3/54 safe | Disfluency detection has zero concept of intentional repetition |
| Cosine similarity alone | Catches paraphrases but also intentional repetition | No discriminator between retake and deliberate repeat |
| Prosodic performance/break model | Conceptually right but needs audio infra | Can't handle rapid-fire retakes (no pause between attempts) |

## The Solution: Completeness + Variation Discriminator

**Adversarially tested: 82% raw → 96.4% after 6 fixes → 52/54 profiles safe.**

When the best-take matcher finds a group of similar segments, the discriminator decides their fate:

### Signal 1: Completeness
- **COMPLETE:** segment ends with `.` `!` `?` — speaker finished the thought
- **INCOMPLETE:** segment ends with conjunction, comma, ellipsis, mid-word, or trails off

### Signal 2: Variation Type
- **IDENTICAL:** same words (Jaccard > 0.95 between instances)
- **ESCALATING:** each repetition ADDS words/concepts (strict superset or appended content)
- **REPHRASING:** same meaning, different words (Jaccard 0.3-0.8)

### Decision Matrix
| Completeness | Variation | Decision | Rationale |
|---|---|---|---|
| All COMPLETE + IDENTICAL | INTENTIONAL (keep all) | Deliberate emphasis — speaker chose to say the exact same thing |
| All COMPLETE + ESCALATING | INTENTIONAL (keep all) | Rhetorical building — "Run. Run harder. Run like your life depends on it." |
| Mixed (some INCOMPLETE) + REPHRASING | RETAKE (keep best) | Speaker trying to land it — incomplete versions are abandoned attempts |
| All COMPLETE + REPHRASING | AMBIGUOUS | Tiebreakers below |
| All INCOMPLETE | RETAKE (keep last/longest) | All failed attempts |

### AMBIGUOUS Tiebreakers
- Segments within 10s of each other → RETAKE (rapid-fire attempts)
- Segments separated by > 30s → KEEP both (different points in the argument)
- Word count varies by > 50% → KEEP both (likely elaboration, not retake)
- 10-30s gap (dead zone) → KEEP both (err toward preservation)

### 6 Heuristic Fixes (from adversarial testing)
1. **Dead zone default:** 10-30s gap with no clear signal → KEEP (preservation > aggression)
2. **Escalating retake:** ESCALATING + <10s + Jaccard >0.80 → RETAKE (improved retake, not rhetoric)
3. **Restraint profile override:** Minimalist/luxury profile + IDENTICAL → AMBIGUOUS (don't keep duplicates in restraint aesthetic)
4. **Semantic polarity:** If seg2 NEGATES/CONTRADICTS seg1 → NARRATIVE_PIVOT (always KEEP)
5. **Exclamatory exemption:** All segments end with "!" + gaming/event content → KEEP (hype building)
6. **AI content artifact:** Full AI mode + IDENTICAL + different scene indices → RETAKE (AI generation duplication)

## Research Findings (2026-05-10)

### Industry State
- **Gling:** Transcript similarity + "bad take detection" (proprietary). 96.7% safety score but 22.5% filler remains.
- **TimeBolt:** Jaccard + edit distance. "Keep last take" hard rule. 91% accuracy scripted.
- **Descript:** "Remove Retakes" feature, undisclosed algorithm. Transcript-first editing.
- **Phantom Editor:** Sends audio to Gemini 2.5 Flash. 95% rough cut accuracy claimed.
- **AutoCut:** Premiere plugin. "Precise" and "fast" modes. Optional reference script.
- **ALL products assume repetition = bad.** None classify intent.

### Academic State
- Levelt (1983): Foundational repair model (reparandum → interregnum → repair). 959 repairs analyzed.
- Switchboard corpus: 1M words annotated for disfluency. Repetitions = 50% of all disfluencies. NO intent labels.
- Dubremetz & Nivre (2018): Rhetorical figure detection (epanaphora/epiphora). >50% precision. Key quote: "detecting repetition is easy; detecting only those with rhetorical effect is difficult."
- Hindi/Bangla reduplication papers (2024-2025): ONLY papers asking "is this repetition intentional?" — 85% F1 but narrow to morphological reduplication.
- **No dataset exists labeled with {retake, rhetorical, pedagogical, comedic, musical}.**

### Audio Signals (Unused in Industry)
- Confident speech: higher F0 range, mean amplitude, amplitude range (Nature 2020)
- Repairs: pitch reset, energy drop, lengthening before interruption point
- Intentional repetition: maintains/builds energy across repetitions
- **Nobody uses prosody for retake intent classification.** Untapped signal.

### The Gap We're Filling
The problem decomposes into 5 sub-problems with solutions in different fields:
1. Detecting repetition occurred → SOLVED (NLP)
2. Detecting disfluency structure → SOLVED (ACNN/BiLSTM-CRF, F1 91%)
3. Detecting rhetorical figures → PARTIAL (>50% precision)
4. Detecting prosodic confidence → SOLVED in isolation
5. **Classifying repetition INTENT → UNSOLVED (our contribution)**

## Implementation Plan — 3 Phases

### Phase 1: Text-Only Discriminator (P0 — NOW)
**Coverage: 52/54 profiles. Effort: 3-4 days. Dependencies: None.**

New file: `lib/editron/services/repetition-intent-discriminator.ts`

Pipeline reorder:
```
1. Transcribe (Grok STT / Whisper)
2. Detect silences
3. Detect fillers
3.5. Detect content type (MOVED EARLIER — needs words + duration only)
4. Segment transcript
4.5. Editorial intent (Gemini — meta-commentary ONLY)
4.75. Intra-segment splitting (SHIPPED — f3a54213)
5. Best-take detection WITH discriminator (USES content type for profile-specific behavior)
7. Build removal plan
```

The discriminator receives each retake-candidate group from `detectBestTakes()` and returns a decision. If INTENTIONAL → group is disbanded, all segments kept. If RETAKE → existing scoring picks the best, rest are cut.

Content-type detection is moved to Step 3.5 (safe — it only needs `transcription.words` and `videoDurationSec`, both available from Step 1).

**Verification plan:**
- Unit test: 10 hand-crafted groups (5 retake, 5 intentional) → verify correct decision
- Integration test: Run on proj_ZyF9IKnLsk5U (the Hank Green video) → verify grocery store is caught, thesis is kept
- Adversarial: Already tested against 54 profiles (96.4% after fixes)

### Phase 2: Grok STT + Speaker Diarization (P1 — next)
**Coverage: +1 profile (53/54). Effort: 2-3 days. Dependencies: Fix Grok STT 400 error.**

Changes:
- `transcription-service.ts`: Grok STT as primary with `diarize=true`, Whisper as fallback
- `TranscriptionWord` type: already has `speaker?: number` field
- Discriminator: if group contains segments from DIFFERENT speakers → INTENTIONAL (not a retake — different people agreeing/echoing)

The Grok STT 400 error ("Could not detect audio format from file header") is caused by R2 presigned URLs not serving correct content-type headers. Fix: pipe the audio through with explicit content-type, or use the raw R2 object URL.

### Phase 3: Prosodic Analysis (P2 — future)
**Coverage: +1 profile (54/54). Effort: 1-2 weeks. Dependencies: Modal GPU service.**

New Modal service: `modal/prosodic_analyzer.py`
- Input: audio segment (wav/mp3)
- Output: { energy_rms, f0_mean, f0_slope, speech_rate, confidence_score }
- Libraries: librosa + parselmouth (both well-established, no custom training)

Discriminator integration:
- For AMBIGUOUS decisions: if energy INCREASES across repetitions → INTENTIONAL (building)
- For COMPLETE+IDENTICAL: if emotional delivery differs → RETAKE (acting takes, different emotion)
- For all decisions: add confidence boost from prosodic consistency

## Stable Baseline (Current State as of 2026-05-10)

### Commits Shipped This Session
| SHA | What | Status |
|-----|------|--------|
| `2e34d8f3` | Bleed-through Fix 1 (case 6 videoStartTime) + Fix 2 (snap-only overlaps) | ✅ Deployed |
| `0b297b5f` | Revert context enrichment (poisoned meta-heavy openings) | ✅ Deployed |
| `f3a54213` | 3 immediate fixes (intra-segment split, editorial intent protection, false-start punctuation) | ✅ Deployed |

### What the System Does Now (Stable)
- Gemini editorial intent: meta-commentary classification (non-deterministic, ±10 segments)
- Mechanical best-take: Jaccard + prefix + false start + single-word repeat (deterministic)
- Intra-segment splitting: catches rapid-fire retakes within one segment (deterministic)
- Editorial intent protection: Gemini CONTENT (confidence ≥ 0.85) prevents best-take cutting
- False-start punctuation: complete sentences (`.!?`) are not false starts
- Silence removal: merge consecutive + case 6 videoStartTime fix + snap-only overlaps

### What the System Does NOT Do (Gaps)
- Cannot distinguish intentional repetition from paraphrased retakes (grocery store x3 survives OR thesis gets cut)
- Cannot use speaker identity for decisions (Grok STT diarization not wired)
- Cannot use audio/prosodic signals for intent detection
- Gemini meta classification is non-deterministic (±10 segments per run)

### Known Acceptable Trade-offs
- Grocery store x3: will reduce to x1 once discriminator ships (Phase 1)
- Meta at opening: Gemini sometimes misses "That was me editing a video" — acceptable until prosodic analysis (Phase 3) provides stable meta detection
- Gemini non-determinism on meta: reduced impact because Layers 2-3 (deterministic) handle retakes/disfluencies, leaving Gemini with fewer decisions

## Thresholds and Sources

| Threshold | Value | Source |
|-----------|-------|--------|
| Intra-segment Jaccard | 0.5 | Lower than inter-segment (0.6) — phrases within one segment share more context words |
| Intra-segment window | 6 words | Average retake phrase length in Hank Green test data |
| Min words to check (intra) | 15 | Segments under 15 words rarely contain multiple attempts |
| Completeness detection | `/[.!?]$/` | Standard sentence-final punctuation in English |
| IDENTICAL threshold | Jaccard > 0.95 | Near-exact match (allows minor transcription variance) |
| ESCALATING detection | Each rep is strict superset OR word count increases monotonically | Definition of rhetorical building |
| AMBIGUOUS → RETAKE time | < 10s | Retakes happen rapidly; argument points are spaced |
| AMBIGUOUS → KEEP time | > 30s | Points minutes apart are never retakes |
| Dead zone (10-30s) | Default KEEP | Err toward preservation (Rule: easier to cut later than recover) |
| Escalating retake override | Escalating + <10s + Jaccard >0.80 | High word overlap despite escalation = improved retake, not rhetoric |
| Editorial intent protection | confidence >= 0.85 | High-confidence CONTENT should not be overridden by mechanical matching |

## NEXT: LLM Protection Architecture (agreed 2026-05-10)

### The Insight
Claude reads the full transcript and instantly knows what's essential. The system classifies 248 fragments in isolation and misses the argument. The fix: **LLM for PROTECTION (what must stay), rules for CUTTING (what should go).**

### The Architecture
```
Step 1: FULL transcript → ONE Gemini call (~3500 tokens)
  → "Identify the 10-15 ESSENTIAL segments: thesis, key arguments, 
     punchlines, conclusion. These are PROTECTED."
  → Returns: protectedSegmentIndices[]

Step 2: Deterministic rules handle cutting:
  → Silence removal (VAD)
  → Filler removal (keyword)
  → Disfluency/stutter detection (intra-segment splitter)
  → Retake detection (best-take + discriminator)
  → Meta detection (editorial intent — REDUCED scope, essentials excluded)

Step 3: Protection override:
  → protectedSegmentIndices are NEVER cut by any rule
  → Even if editorial intent says META_DISCARD — protection wins
```

### Why This Works
- LLM makes ~15 decisions (protection), not 248 (classification)
- Fewer decisions = less non-determinism
- If LLM misses a protection → slightly shorter video (not broken argument)
- If LLM over-protects → extra content stays (viewer doesn't notice)
- Rules handle mechanical patterns deterministically
- LLM handles MEANING (argument structure) which rules can't

### Why Current Approach Fails
- 248 individual "CONTENT or META?" decisions at temperature 0.1
- Each decision is independent — no argument-level understanding
- Thesis can be classified as META on one run and CONTENT on the next
- Batches of 60 segments miss long-range context (thesis at seg 35, conclusion at seg 193)

### Implementation Notes
- Full transcript IS available: `rawFootageAnalysis.transcription.transcript` (single string)
- `rawFootageAnalysis.segments[]` has text + timestamps
- Existing `protectedIndices` in `detectBestTakes()` already accepts protected segments
- The new LLM call can run BEFORE editorial intent (Step 4.25)
- Editorial intent (Step 4.5) still runs but essentials are excluded from META_DISCARD candidates
- Cost: ONE extra Gemini Flash call per video (~$0.001 for 3500 tokens)

### Relationship to Existing Code
- `editorial-intent-detector.ts` STAYS but scope narrows further
- `repetition-intent-discriminator.ts` STAYS — handles retake vs intentional
- NEW: `argument-structure-protector.ts` or similar — the ONE LLM call for essentials
- `raw-footage-processor.ts` wires protectedIndices from BOTH editorial intent AND argument protector

## Adversarial Test Records

### Completeness+Variation Discriminator (2026-05-10)
- Tested: 56 scenarios across 54 profiles (7 categories)
- Raw accuracy: 82.1% (46/56 correct)
- After 6 heuristic fixes: 96.4% (54/56 correct)
- Remaining 2 failures: A-08 (acting takes — needs audio emotion), C-09 (podcast — needs diarization)
- Average damage on failures: 6.9/10

### Context Enrichment (2026-05-10, KILLED)
- Tested: 12 scenarios across 10+ content types
- Result: 11/12 better or neutral, 1/12 worse (meta-heavy opening)
- In practice: the 1 failure was catastrophic (cut thesis statement)
- Decision: REVERTED. Meta-heavy openings are common in raw footage.

### Compound Regex Rules (2026-05-10, KILLED)
- Tested: 10 content types, 4 rules
- Result: 106 false positives, every rule had damage-10 failures
- Decision: KILLED. Everyday English phrases can't be used as meta markers.

### 5-Layer Architecture Original (2026-05-10, REDESIGNED)
- Tested: 54 profiles
- Result: 96 false positives, 30 damage-8+, 3/54 profiles safe
- Root cause: Layer 2 (disfluency) has no concept of intentional repetition
- Decision: REDESIGNED with discriminator as the intent classifier

### Retake Detector Current System (2026-05-10)
- Tested: 54 profiles by adversarial agent that read actual code
- Found: intra-segment blindness, no editorial intent wire, false-start kills rhetoric
- All 3 issues FIXED in commit f3a54213
