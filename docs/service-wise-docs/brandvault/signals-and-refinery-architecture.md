# BrandVault Signals and Refinery Architecture

BrandVault is the central creative intelligence and memory layer of Insturix. It aggregates raw observations from user actions, guidelines, scraping jobs, and media analysis into a standardized, schema-driven **BrandSignalProfile**. This document details the exact signal schema, trust/confidence levels, mathematical and keyword-based generation rules, and the lifecycle/review orchestration.

---

## 1. High-Level Concept

Downstream consumers (ThinkForge, Clickatron, and Editron) require a consistent, machine-readable vocabulary to customize content. BrandVault acts as the central refinery:

```text
Raw Observation Sources (Uploads, Websites, Scrapers, Alyzitron, Clickatron)
                             ↓
             Intake Candidates (Evidence logs)
                             ↓
                 BrandVault Refinery Engine
                             ↓
      Draft Profile (Review Required if low confidence/trust)
                             ↓ (User Approval)
        Accepted Active Profile (The Brand DNA)
                             ↓
           Downstream Rendering / Generation engines
```

---

## 2. BrandSignal Profile Schema

Every signal in the brand profile is encapsulated inside a `BrandSignal<T>` type, which couples the raw value with metadata indicating its pedigree.

### A. The Signal Wrapper (`BrandSignal<T>`)
Defined in `lib/shared/brand-signal-profile.ts`:
```typescript
export interface BrandSignal<T> {
  value: T;                         // The resolved value (string, number, array, HSL)
  confidence: number;               // Score from 0.0 to 1.0
  trustLevel: BrandSignalTrustLevel; // Source class trust level
  authorityClass: BrandSignalAuthorityClass; // Authority level
  evidenceIds: string[];            // Pointers to items in the evidence log
  fallbackReason?: string;          // Populated if using default values
}
```

### B. Trust & Authority Levels
*   **`BrandSignalTrustLevel`:** Indicates the reliability of the source.
    *   `manual_user_entry` (Highest trust)
    *   `uploaded_brand_guideline`
    *   `first_party_website`
    *   `connected_social_account`
    *   `public_social_page`
    *   `brand_api`
    *   `llm_inference` (Alyzitron / Clickatron observations)
    *   `fallback_default` (Lowest trust)
*   **`BrandSignalAuthorityClass`:** Represents how strict the signal is.
    *   `brand_fact` (E.g., Brand Name, hex colors)
    *   `brand_constraint` (E.g., Kill lists)
    *   `brand_preference` (E.g., Audiences)
    *   `voice_default` / `process_default` (Default values)
    *   `inferred_hint` (LLM/Rule inferences)
    *   `unsafe_or_untrusted` (Discarded/flagged items)

---

## 3. The 6 Core Signal Groups

The profile partitions creative guidelines into 6 distinct groups. Below are their paths, types, and logic:

### Group 1: Identity (`identity.*`)
*   `brandName` (`string`): The formal brand name.
*   `industry` (`string`): The primary business sector.
*   `category` (`string`): Sub-sector/focus.
*   `audience` (`string[]`): Array of target demographics.
*   `proofStyle` (`BrandProofStyle`): Inferred credential style:
    *   `testimonial` | `metrics` | `authority` | `community` | `demo` | `editorial` | `unknown`.

### Group 2: Color Palette (`palette.*`)
*   `primary` (`string`): Dominant brand color in Hex.
*   `accent` (`string`): Supporting accent color (optimized for visibility).
*   `neutrals` (`string[]`): Backgrounds and text surface colors (saturation < 12%).
*   `supporting` (`string[]`): Non-primary/non-accent branding colors.
*   `unsafeOnDark` (`string[]`): Brand colors with low contrast on dark backgrounds (contrast ratio < 3:1 against `#0b0b0f`).
*   `unsafeOnLight` (`string[]`): Brand colors with low contrast on light backgrounds (contrast ratio < 3:1 against `#ffffff`).
*   `contrastBias` (`number`): Weighted contrast preference based on colors.
*   `harmony` (`BrandPaletteHarmony`): The geometric relation of the colors:
    *   `monochromatic` | `analogous` | `complementary` | `split-complementary` | `triadic` | `tetradic` | `unknown`.

### Group 3: Typography (`typography.*`)
*   `raw` (`string`): Raw font family configuration name.
*   `category` (`string`): Classification:
    *   `serif` | `sans` | `slab` | `mono` | `display` | `mixed` | `unknown`.
*   `casingBias` (`string`): Text casing preference:
    *   `sentence` | `title` | `uppercase` | `lowercase` | `mixed` | `unknown`.

### Group 4: Visual Style (`visual.*` - Scores from `0.0` to `1.0`)
*   `minimalism`: Clean layout preference.
*   `densityTolerance`: Information packing preference (high values favor dashboards).
*   `dataVizAffinity`: Density of charts/graphs/technical elements.
*   `expressiveness`: Bold/creator/playful elements vs. restrained premium styles.
*   `geometryTendency`: Angular/geometric shapes vs. soft/organic contours.
*   `decorationTolerance`: Playful styling layers and textures.
*   `cornerRadiusBias`: Softness/rounding of cards, panels, and frames.
*   `layoutSymmetry`: Corporate/structured symmetry vs. casual offsets.
*   `contrastPreference`: Choice of high-impact contrast ratios.

### Group 5: Motion Graphics (`motion.*` - Scores from `0.0` to `1.0`)
*   `motionEnergy`: Energy and velocity level of transitions/entries.
*   `overshootTolerance`: Elasticity, bounce, and spring-back parameters.
*   `transitionSharpness`: Cut velocity and sharpness of scene changes.
*   `rhythmRegularity`: Alignment of edits to visual grids or music loops.

### Group 6: Voice and Copy (`voice.*`)
*   `assertiveness` (`number`): Confident/direct tone vs. soft/neutral.
*   `warmth` (`number`): Friendliness and empathy level.
*   `jargonDensity` (`number`): Density of technical or industry-specific vocabulary.
*   `humor` (`number`): Irreverent/playful tone vs. serious/enterprise.
*   `defaultFormality` (`number`): Corporate structure vs. casual phrasing.
*   `ctaDirectness` (`number`): Immediate/sales-driven CTA vs. soft/educational.
*   `recurringPhrases` (`string[]`): Phrasing templates.
*   `killList` (`string[]`): Restrained words/phrases prohibited in scripting.
*   `hookArchetypes` (`string[]`): Approved hook templates.

---

## 4. Refinery & Generation Processing Logic

BrandVault uses algebraic and semantic keyword-matching rules to transform raw profiles into actionable settings.

### A. Keyword Keyword-Scoring Engine (`score` helper)
For visual, motion, and voice metrics, the system calculates score values using the frequency of matched keywords within a source string:
```typescript
function score(text: string, positive: string[], negative: string[]): number {
  const lower = text.toLowerCase();
  const pos = positive.filter((word) => lower.includes(word)).length;
  const neg = negative.filter((word) => lower.includes(word)).length;
  return clamp01(0.5 + pos * 0.15 - neg * 0.15);
}
```
*   **Visual Minimalism positive markers:** `['minimal', 'clean', 'simple', 'premium', 'luxury']` vs **negatives:** `['loud', 'maximal', 'busy']`.
*   **Voice Assertiveness positive markers:** `['bold', 'direct', 'confident', 'sharp']` vs **negatives:** `['soft', 'gentle']`.

### B. Color Math & Palette Inferences
1.  **Luminance & Contrast Ratio:** Calculated using the W3C luminance formulas:
    $$\text{Luminance } (Y) = 0.2126 \cdot R_{linear} + 0.7152 \cdot G_{linear} + 0.0722 \cdot B_{linear}$$
    $$\text{Contrast Ratio} = \frac{Y_{light} + 0.05}{Y_{dark} + 0.05}$$
2.  **Harmony Detection:** Mapped by converting hex values to HSL and analyzing the absolute circular difference between the primary and accent hues:
    *   $\text{Diff} < 25^\circ$: `monochromatic`
    *   $25^\circ \le \text{Diff} < 70^\circ$: `analogous`
    *   $100^\circ < \text{Diff} < 130^\circ$: `triadic`
    *   $130^\circ < \text{Diff} \le 150^\circ$: `split-complementary`
    *   $150^\circ < \text{Diff} < 210^\circ$: `complementary`

---

## 5. Lifecycle and Review Flow

A BrandSignalProfile is not mutated in-place; it utilizes a ledger-based **append-only document lifecycle** to guarantee review control:

1.  **Ingestion & Staging:** Refinery jobs (website crawling, guideline parses, Alyzitron analysis, Clickatron edits) produce **BrandEvidenceCandidate** sets.
2.  **Draft Profiler:** `createBrandSignalProfileDraft(...)` merges new candidates with the old accepted settings, generating a new `draft` record.
3.  **Review Check (`review.required`):** A draft profile automatically flags `review.required = true` if:
    *   It contains validation errors or warnings.
    *   The confidence values fall below `0.55` (non-actionable threshold).
    *   The evidence comes from low-trust sources (inferences, scraper lists).
4.  **Commit Gates:**
    *   **`acceptDraft(...)`**: Marks the draft as `accepted` (active) and updates older active profiles to `superseded`.
    *   **`rejectDraft(...)`**: Rejects the draft and records the rejection reason.

---

## 6. Actionability and Downstream Retrieval

When downstream tools resolve settings (using `resolveEffectiveBrandDNA(userId, brandId)`), they filter out non-actionable signals.

The effective effect weight of a signal is computed dynamically:
```typescript
export function getBrandSignalEffectWeight(signal: BrandSignal<unknown>, minConfidence = 0.55): number {
  if (signal.trustLevel === 'fallback_default' || signal.authorityClass === 'unsafe_or_untrusted') return 0;
  if (signal.confidence < minConfidence) return 0;
  
  const trustWeight = signal.trustLevel === 'manual_user_entry' || 
                      signal.trustLevel === 'uploaded_brand_guideline' ? 1.0 : 0.75;
                      
  return clamp01(((signal.confidence - minConfidence) / (1 - minConfidence)) * trustWeight);
}
```
If `effectWeight > 0`, the downstream generators (e.g. ThinkForge prompts, Clickatron visual overlays, Editron dials) apply the brand's rules; otherwise, they fall back to global platform defaults (e.g., standard YouTube pacing rules).

---

## 7. Downstream Signal Execution & World Models (Editron & ThinkForge)

Downstream subsystems consume the refined signals in two distinct ways: prompt-level injection (ThinkForge/Clickatron) and frame-level multi-source weighting (Editron).

### A. ThinkForge Context & World-Building
ThinkForge uses the active `BrandSignalProfile` to shape script structure:
1.  **Context Injection:** Injects a structured `<brand_context>` block directly into agents (e.g., Script Author, Discovery Agent) to lock specific tones, assertiveness, and terminology (e.g., enforcing the `voice.killList` to suppress AI boilerplate words).
2.  **World-Building Bibles:** Integrates with the `world_bible` blueprint which maps rules, history, and physical constraints of a creative universe, establishing narrative consistency before scriptwriting begins.

### B. Editron Deep Signal Runtime
Editron has a frame-by-frame signal engine that modulates the pacing and intensity of video editing techniques (e.g., zoom depth, transition rate, sound effects volume). It operates across four integration phases defined in `lib/editron/services/moment-weight-service.ts`:

#### Phase 0: Text & Heuristic Foundation
*   Establishes base segment weights from Gemini transcript analysis (creative intent output) and flat pacing rules (e.g., higher weights in the hook and CTA zones).

#### Phase 1: Thompson Sampling Bandit Learning
*   Updates dialing parameters dynamically using **Gaussian Thompson Sampling** (`lib/editron/services/genre-parameter-bandit.ts`).
*   Learns user adjustments per context (content type, platform) based on a reward feedback loop that scores completed projects on quality metrics, rendering rates, and publication actions.

#### Phase 2: Multimodal GPU World Models (Live)
Editron integrates two deep self-supervised models to replace simple heuristics with semantic understanding:

1.  **V-JEPA 2 (Video Joint Embedding Predictive Architecture):**
    *   Developed by Meta and deployed on Modal GPU (`modal/vjepa_visual.py`).
    *   **Visual Significance:** Evaluates spatial-temporal embeddings to measure divergence between adjacent frames.
    *   **Motion Intensity:** Computes learned optical flow (replacing basic pixel RMS change heuristics).
    *   **Action Classification:** Identifies physical actions (e.g., gesturing, demonstrating, writing).
    *   **Primitive Tracking:** Calculates exact coordinates ($x, y$, width, height) of the main subject and maps screen negative space (`negativeSpaceTop/Right/Bottom/Left`) to align graphics and overlays safely.
2.  **Wav2Vec 2.0:**
    *   Processes vocal audio tracks to extract emotion intensity, valence, emphasis peaks, stress, and filler word confidence.
3.  **Grok Speaker Diarization:**
    *   Extracts speaker counts and transitions, emitting transition events (`speech.speaker_change`) to handle cuts between speakers in interview formats.

##### The Phase 2 Weight Synthesis Formula:
At each moment in the video, the final weight is blended dynamically:
$$\text{Final Weight} = \text{Gemini (Creative Intent)} \cdot 0.50 + \text{V-JEPA (Visual Significance)} \cdot 0.30 + \text{Wav2Vec (Vocal Emotion)} \cdot 0.20 + \text{Thompson Bandit Adjustment}$$

#### Phase 3: Symbolic Regression & Predictive World Model (Planned)
*   **EML (Symbolic Regression):** Formulates mathematical editing laws using published metrics, overriding weight inputs.
*   **JEPA World Model:** An advanced edit-planning model designed to forecast "if I apply this cut, the emotional and narrative response will be X" *before* rendering the video, optimizing pacing ahead of physical execution.
