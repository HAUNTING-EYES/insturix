# Task: Implement Multi-Model Support for Musitron

## Objective
Update the Musitron Music Generator to support multiple AI models, giving users more control over the generated music's style and capabilities. This involves changes to both the frontend UI and the backend API route.

## Prerequisites
*   **Dependency**: This task MUST be started **only after** `MUSITRON_MIGRATION_TASK.md` is completed and merged.
*   **Context**: The backend will no longer be the Python Monolith; it will be a Next.js API Route Processor powered by QStash.

## Branching
*   **Checkout**: `feature/new-musitron-backend` (or `main` if migration is merged)
*   **New Branch**: `feature/musitron-multi-model`

## Requirements

### 1. Frontend Updates (`components/dashboard/Musitron/MusicGenerator.tsx`)
Currently, the form allows selecting Title, Style, Duration, Instrumental, and Lyrics.

**Action Items:**
1.  **Add Model Selector**:
    *   Add a dropdown (Select component) to choose between the following models:
        *   **Stable Audio 2.5**
        *   **Sonauto V2**
        *   **MiniMax Music V2**
    *   **Default**: Select a sensible default (e.g., Sonauto V2).

2.  **Display Model Descriptions**:
    *   When a model is selected, display its specific description dynamically below the selector.
    *   **Descriptions directly from requirements**:
        *   **Stable Audio 2.5**: "Best for video background music; generates high-quality, structured instrumental tracks (up to 3 minutes) with distinct intro/outro sections in seconds."
        *   **Sonauto V2**: "Best for viral hits; creates full songs with the most realistic, expressive vocals and lyrics, controllable via BPM and customizable text."
        *   **MiniMax Music V2**: "Best for complex compositions; excels at high-fidelity instrumentals and multi-language vocals that rival human performances, ideal for audiophiles."

3.  **Dynamic Form Constraints**:
    *   **Stable Audio 2.5**:
        *   **Lyrics**: NOT Supported. Hide the Lyrics input field.
        *   **Instrumental**: Forced to `true`. Disable the "Instrumental Only" switch (visual state should be checked).
        *   **Max Duration**: 180 seconds. Update validation logic.
    *   **Sonauto V2**:
        *   **Lyrics**: Supported. Show Lyrics input if `Instrumental` is false.
        *   **Max Duration**: 180 seconds (Recommended). Update validation logic.
    *   **MiniMax Music V2**:
        *   **Lyrics**: Supported. Show Lyrics input if `Instrumental` is false.
        *   **Max Duration**: 180 seconds. Update validation logic.

### 2. Backend Updates
Since the backend is now migrated to **Next.js + QStash**, you need to update both the **Producer** and the **Processor**.

**Model IDs**:
*   Stable Audio 2.5: `fal-ai/stable-audio/v2.5`
*   Sonauto V2: `fal-ai/sonauto/v2/text-to-music`
*   MiniMax Music V2: `fal-ai/minimax-music/v2`

**A. Update Producer (`app/api/services/musitron/generate/route.ts`)**
1.  **Validation**: Update Zod schema to accept a `model` string. Ensure it matches one of the valid Model IDs.
2.  **QStash Payload**: Pass the selected `model` in the JSON payload published to QStash.

**B. Update Processor (`app/api/services/musitron/processor/route.ts`)**
1.  **Input Parsing**: Extract `model` from the incoming request body.
2.  **Fal AI Call**:
    *   Update the `fal.subscribe` / `fal.realtime` call to use the dynamic `model` ID instead of the hardcoded `fal-ai/ace-step`.
    *   **Parameter Mapping**:
        *   Different models might expect slightly different parameter names (e.g. `prompt` vs `lyrics`). Use your judgement or check *Resources* below to map the generic `style`/`lyrics` inputs to the specific model's expected arguments.
        *   *Stable Audio 2.5*: Expects `prompt`, `seconds`. (No lyrics).
        *   *Sonauto/MiniMax*: Expect `prompt`, `lyrics`, `seconds`.

### 3. Verification & Safety
*   **Prod Safe**: Ensure all new inputs are validated.
*   **Consistency**: Match the existing design system (Zinc/Black colors, Lucide icons).
*   **Test**: 
    *   Select Stable Audio 2.5 -> Verify Lyrics hide, Instrumental locks.
    *   Select Sonauto -> Verify Lyrics appear.
    *   Submit a request and verify via logs/network tab that the correct `model` ID is sent to the API.

## Resources
*   **Model Details**: Check [fal.ai](https://fal.ai) for technical specifics on input arguments if further parameter tuning is needed (e.g. mapping `style` to `prompt`). For now, treat `style` as the main prompt.
