# Alyzitron → BrandVault Signal Integration

## Objective

Connect Alyzitron to BrandVault so that media analysis continuously improves the user's creative profile.

Alyzitron should not store long-term learnings itself.

Its responsibility is to:

1. Analyze media.
2. Extract approved signals.
3. Update BrandVault.
4. Make those signals available to ThinkForge, Clickatron, and Editron.

---

# Core Principle

Alyzitron produces observations.

BrandVault stores learnings.

ThinkForge, Clickatron, and Editron consume learnings.

```text
Media
   ↓
Alyzitron Analysis (observes raw values)
   ↓
Signal Extraction (identifies candidates)
   ↓
BrandVault (accumulates & aggregates)
   ↓
ThinkForge / Clickatron / Editron (consume)
```

---

# Step 1 — Alyzitron Receives Brand Context

Before Gemini analysis begins, Alyzitron loads the brand profile context.

*   **Existing ThinkForge Alignment:** ThinkForge fetches Brand DNA via `resolveEffectiveBrandDNA(userId, projectId)` in `lib/thinkforge/services/db.ts` and formats it using `formatSystemBrief(ctx)` in `lib/thinkforge/context/fetchContextSources.ts`.
*   **Alyzitron Implementation:** Alyzitron will resolve the brand's active signal profile from MongoDB (`brand_signal_profile_records` collection) using `BrandVaultMongoRefineryStore.getLatestAcceptedProfile({ brandId, userId })` located in `lib/shared/brand-vault-mongo-store.ts`.

```text
Media
   ↓
BrandVault Context (Loaded via new integration file)
   ↓
Gemini Multimodal Analysis
```

Gemini now understands:
*   Who the user is (Brand voice, assertiveness, formality defaults).
*   What the brand represents (Palette, typography, design minimalism).
*   Existing content preferences and known strengths/weaknesses.

---

# Step 2 — Source Classification

Every analysis task must identify source ownership to determine the updating strategy.

Required field inside the task payload and MongoDB `analyses` collection:
```json
{
  "sourceType": "self | competitor | reference"
}
```

### Definitions & Actions:
*   **Self:** User's own content. Used to generate both constructive (+ value) and destructive (add to `avoid_signals`) feedback.
*   **Competitor:** External content being studied. Used to extract successful patterns (increase positive weights) and structural strengths.
*   **Reference:** General inspiration content. Used to extract neutral observations without heavily shifting the profile.

---

# Step 3 — Structured Analysis Output

Gemini continues producing the analysis JSON structure. We enrich the response schema to output signal observations.

**File to Change:** `lib/services/vertexAiService.ts` (Specifically the `responseSchema` and the `prompt` inside `analyzeVideoWithGemini`).

The updated response schema requires:
```json
{
  "analysis": { ... },
  "signalCandidates": {
    "strengths": ["string"],
    "weaknesses": ["string"],
    "patterns": ["string"]
  }
}
```

---

# Step 4 — Signal Decoder Layer

A dedicated decoder converts raw qualitative Gemini observations into schema-valid BrandVault signal updates.

**New File:** `lib/alyzitron/services/brand-vault-integration.ts`

```text
Gemini Analysis (signalCandidates)
      ↓
Signal Decoder (brand-vault-integration.ts)
      ↓
BrandVault Update (brand_signal_profile_records)
```

This ensures LLM output is parsed, filtered, and aggregated safely before mutating the user's permanent profile.

---

# Step 5 — Only Approved Signals Can Be Generated

BrandVault remains strictly schema-driven. No arbitrary signals are allowed.

The Decoder maps observations against the 47 creative signals defined in `lib/shared/signals/types.ts`, categorizing them into:
*   `CreativeSignals` (e.g., `logos_load`, `pacing_velocity`, `humor`, `formality`)
*   `VoiceSignals`
*   `VisualSignals`
*   `MotionSignals`

Any candidate observation that does not map to the approved schema is discarded.

---

# Step 6 — Constructive vs Destructive Learning

The update strategy in `brand-vault-integration.ts` depends on the `sourceType`:

### Self Content
*   Learn from strengths (increase signal weights) and weaknesses (add to `killList` or `avoid_signals`).
*   **Example:** If weaknesses contain `"Slow opening"`, update maps to:
    ```json
    { "avoid_signals": ["slow_hook"] }
    ```

### Competitor Content
*   Learn primarily from strengths (extract successful patterns).
*   **Example:** If competitor strengths contain `"Fast pacing"`, update maps to:
    ```json
    { "observed_high_performance_patterns": ["fast_pacing"] }
    ```

---

# Step 7 — Signal Confidence Layer

Every update records evidence:
```json
{
  "signal": "fast_pacing",
  "value": 0.84,
  "confidence": 0.91,
  "source": "competitor"
}
```
Updates are aggregated over time. A single video analysis should never shift a brand profile drastically; repeated observations across multiple videos establish high-confidence signals.

---

# Step 8 — Downstream Consumption

Once signals enter BrandVault, they are consumed across Insturix:
*   **ThinkForge:** Shapes hook creation, style matching, and CTA directness.
*   **Clickatron:** Dictates layouts, minimalism, and visual generation prompts.
*   **Editron:** Informs director pacing, transition sharpness, and visual rhythm.

---

# Target Files & Prompt Modifications

### 1. New Integration Helper File
*   **`lib/alyzitron/services/brand-vault-integration.ts`**
    *   Implements `fetchBrandVaultContext(userId, brandId)` to resolve the active `BrandSignalProfile`.
    *   Implements `decodeAndPushSignals(userId, brandId, candidates, sourceType)` to translate LLM candidate outputs into database updates.

### 2. Prompt Changes
*   **`lib/services/vertexAiService.ts` (`analyzeVideoWithGemini`):**
    *   Update prompt to inject `<brand_context>` and instruction blocks.
    *   Update `responseSchema` to include `signalCandidates: { strengths: string[], weaknesses: string[], patterns: string[] }`.
*   **`lib/alyzitron/chat/systemPrompt.ts` (`buildSystemPrompt`):**
    *   Update prompt to inject the resolved `BrandSignalProfile` context so the chat assistant is brand-aware.

### 3. Workflow Controllers to Modify
*   **`app/api/services/alyzitron/analyze/route.ts`:**
    *   Accept `brandId` and `sourceType` in request. Save to the database task document and forward in the QStash queue.
*   **`app/api/services/alyzitron/processor/route.ts`:**
    *   Fetch brand context prior to analysis.
    *   Pass context into `analyzeVideoWithGemini`.
    *   Call the decoder to push candidates to BrandVault upon successful analysis.

---

# Plan of Action (PoA)

1.  **Task Schema & Input Validation**
    *   Update MongoDB `analyses` task model to support optional `brandId` and `sourceType` (enum: `'self' | 'competitor' | 'reference'`).
    *   Modify `app/api/services/alyzitron/analyze/route.ts` to accept these fields in the POST body and save them.

2.  **Brand Vault Core Connection**
    *   Create `lib/alyzitron/services/brand-vault-integration.ts`.
    *   Write database hooks using `BrandVaultMongoRefineryStore` to load brand settings.
    *   Write the signal decoder mapping logic to decode strengths/weaknesses into approved signals matching the `lib/shared/signals/types.ts` schema.

3.  **Multimodal Analysis Enrichment**
    *   Update the schema and system instructions inside `lib/services/vertexAiService.ts`.
    *   Ensure the model compares visual/audio inputs against the resolved brand rules and outputs candidate observations in the structured JSON.

4.  **Processor Orchestration & Feedback Loop**
    *   Wire the brand-fetch and the decoder execution inside `app/api/services/alyzitron/processor/route.ts`.
    *   Ensure failures in the brand update step are caught gracefully (fail-open) so the core video analysis is not lost.

5.  **Brand-Aware Chat Assistant**
    *   Modify `lib/alyzitron/chat/systemPrompt.ts` to load the brand profile context and inject it into the conversation window system instructions.

6.  **Typechecking & Verification**
    *   Run `npx tsc --noEmit` and verify that no typescript errors are introduced.

Brand alognmnet in structure  