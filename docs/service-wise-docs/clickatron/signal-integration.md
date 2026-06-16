# Clickatron → BrandVault Signal Integration

## 1. Objective

Integrate Clickatron with BrandVault to enable the continuous learning of a brand's visual identity. By capturing user prompt iterations, edit actions, and the final committed image design characteristics, Insturix dynamically updates the user's permanent **BrandSignalProfile** (specifically the Visual and Palette tiers) without manual configuration.

---

## 2. Core Principle: User Edits as Correction Signals

The final image alone only tells us *what* was created. The **entire session history** (the delta between initial generation and final commit) tells us *why* it was changed, indicating explicit correction preferences.

```text
Initial Generation (Base Canvas)
      ↓ (User edit prompt: "Make the background dark blue, keep it minimal")
Edit 1 (Refinement)
      ↓ (User edit prompt: "Soften the corners of the logo box")
Edit 2 (Final Refinement)
      ↓ (User commits asset)
Committed Asset (Final Image)
```

By analyzing this transition sequence, the system infers:
*   **Minimalism & Density:** If the user repeatedly strips elements ("remove clutter", "keep background plain"), the brand's `visual.minimalism` value increases and `visual.densityTolerance` decreases.
*   **Color Palette Bias:** If the user changes colors ("change red to neon blue"), it records a destructive signal for red and a constructive update for the HSL values of neon blue.
*   **Geometry & Corner Radius:** If the user specifies shape changes ("make corners rounded/soft"), the `visual.cornerRadiusBias` updates to `'soft'`.

---

## 3. Step-by-Step Integration Flow

### Step 1 — Clickatron Receives Brand Context
Before image generation or editing starts, Clickatron loads the active brand profile context.
*   **Existing Path:** `resolveClickatronBrandContextBlock()` in `lib/clickatron/brand-prompt-context.ts` resolves `UnifiedBrand` and formats it using `buildBrandContextBlock` to insert `<brand_context>` in the prompt.
*   **BrandVault Integration:** Clickatron will resolve the active `BrandSignalProfile` from MongoDB (`brand_signal_profile_records` collection) using `BrandVaultMongoRefineryStore.getLatestAcceptedProfile({ brandId, userId })` located in `lib/shared/brand-vault-mongo-store.ts`.

### Step 2 — Queue-Based Background Trigger
Upon committing an image (triggered via `POST /api/services/clickatron/session/[id]/commit/route.ts`), the system schedules an asynchronous learning job via Upstash QStash targeting the brand learning worker:
*   **Worker URL:** `POST /api/internal/workers/brand-learning`
*   **Payload:**
    ```json
    {
      "service": "clickatron",
      "sessionId": "[id]",
      "userId": "[userId]",
      "brandId": "[brandId]"
    }
    ```
*   **Worker Handler:** `app/api/internal/workers/brand-learning/route.ts` routes the payload based on `service === 'clickatron'` to the new signal decoder.

### Step 3 — Semantic Sequence Analyzer (LLM Text Analysis)
*   **Location:** Executed inside `lib/clickatron/services/brand-vault-integration.ts`.
*   **Input:** The sequence of prompts in the session timeline: `[prompt_1, prompt_2, ..., prompt_committed]` fetched from the `clickatron_sessions` collection.
*   **Analysis:** Gemini evaluates the linguistic deltas using system instructions defined in `lib/clickatron/prompts/visual-audit-prompts.ts` to identify requested changes.
*   **Outputs:** Candidate corrections (e.g. `cornerRadiusBias: 'soft'`, `minimalism: +10`).

### Step 4 — Multimodal Visual Profiler (Gemini Vision)
*   **Location:** Executed inside `lib/clickatron/services/brand-vault-integration.ts`.
*   **Input:** The final high-resolution committed image url + final prompt.
*   **Analysis:** Gemini Vision performs an aesthetic audit of the raster image using prompts defined in `lib/clickatron/prompts/visual-audit-prompts.ts`.
*   **Outputs:**
    *   **Palette Extraction:** Identifies primary, accent, and neutral colors in HSL format.
    *   **Visual Parameters:** Computes aesthetic scores (minimalism, geometry preference, layout symmetry).

### Step 5 — Schema Verification & Intake
*   **Validation:** All extracted signal candidates are validated against the schemas in `lib/shared/brand-signal-profile.ts` and `lib/shared/brand-signal-lifecycle.ts` to ensure compatibility.
*   **Persistence:** The validated candidates are converted to `BrandEvidenceCandidate` objects and committed to the database using `BrandVaultMongoRefineryStore` (`brand_signal_profile_records` and `brand_signal_profile_events` collections).

---

## 4. BrandVault Schema Field Mapping

Clickatron maps extracted visual candidates into the following `BrandSignalProfile` visual and palette parameters:

| BrandVault Field | Value Type | Ingestion Rule |
|---|---|---|
| `visual.minimalism` | Number (0-1) | Determined by layout complexity and requests for simplicity. |
| `visual.densityTolerance` | Number (0-1) | Screen space utilization and text overlay footprint. |
| `visual.cornerRadiusBias` | `'sharp' \| 'soft' \| 'none'` | Derived from instructions like "round corners" or "sharp border". |
| `visual.geometryTendency` | `'organic' \| 'geometric' \| 'hybrid'` | Composition of shapes detected (curves vs. sharp lines). |
| `palette.primary` | HSL string | Dominant tone detected in the committed raster image. |
| `palette.accent` | HSL string | High-contrast visual accents/highlights detected. |

---

## 5. Target Files & Prompt Modifications

### 1. New Integration File
*   **`lib/clickatron/services/brand-vault-integration.ts`**
    *   Implements `processSessionSignalJob(sessionId, userId, brandId)`: Coordinates fetching the session history, calling the semantic edit decoder, executing the Gemini Vision multimodal profiler, converting results to `BrandEvidenceCandidate` formats, and pushing them to `BrandVaultMongoRefineryStore`.

### 2. Prompt Changes
*   **`lib/clickatron/prompts/visual-audit-prompts.ts` (New Prompt File):**
    *   Defines structured Gemini prompt schemas for both the **Semantic Edit Decoder** and the **Multimodal Visual Profiler** to ensure clean JSON signal candidates.

### 3. Workflow Controllers to Modify
*   **`app/api/services/clickatron/session/[id]/commit/route.ts`:**
    *   Dispatches QStash job payload to the internal brand learning endpoint upon variation commit.
*   **`app/api/internal/workers/brand-learning/route.ts`:**
    *   Integrates `case 'clickatron'` inside the POST worker route to call `processSessionSignalJob(...)`.

---

## 6. Plan of Action (PoA)

1.  **Staging Task Model Verification:**
    *   Ensure Clickatron session data (`clickatron_sessions` or task schemas) retains the prompt sequence history.
2.  **Define Visual Audit Prompts & Schemas:**
    *   Write `lib/clickatron/prompts/visual-audit-prompts.ts` containing the structural instruction prompts for Gemini.
3.  **Implement Clickatron BrandVault Integration Service:**
    *   Write `lib/clickatron/services/brand-vault-integration.ts` using `BrandVaultMongoRefineryStore` to persist the extracted candidate results.
4.  **Connect Internal Learner Worker:**
    *   Modify `app/api/internal/workers/brand-learning/route.ts` to route Clickatron tasks to the integration service.
5.  **Wire Up Session Commit Event:**
    *   Update `app/api/services/clickatron/session/[id]/commit/route.ts` to trigger the background QStash job.
6.  **Typechecking & Validation:**
    *   Run `npx tsc --noEmit` to verify type safety and ensure all imports/schemas match `lib/shared/signals/types.ts`.
