# Clickatron Model Roster Update (2026 Lean Profile)

This report outlines the implementation of the updated 2026 Clickatron Model Roster as requested. The integration prioritizes the leaner, specialized set of state-of-the-art models for maximum quality and cost-efficiency.

## 1. Implemented Models (Lean Roster)
The following models have been set up and activated in `lib/config/clickatron-models.ts` with their required constraints, prompt policies, and endpoints. All models leverage Fal.ai APIs.

### Default General (Text-to-Image)
*   **Model ID**: `fal-ai/bytedance/seedream/v5/lite/text-to-image`
*   **Role**: Strong all-rounder for general imagery.
*   **Cost Efficiency**: $0.035

### Budget / Bulk Carousel (Text-to-Image)
*   **Model ID**: `fal-ai/flux-2/flash`
*   **Role**: Extremely cheap, high-quality text-to-image with crisp text rendering.
*   **Cost Efficiency**: $0.005/MP (pennies compared to nanobanana pro)

### Premium Text-to-Image (In-Image Text)
*   **Model ID**: `fal-ai/nano-banana-pro`
*   **Role**: Best typography and quality when needed.
*   **Cost Efficiency**: $0.15

### Typography / Logos (Text-to-Image)
*   **Model IDs**: `fal-ai/ideogram/v3` & `fal-ai/recraft-v3`
*   **Role**: Explicitly built for rendering text, wordmarks, and logos in raster.
*   **Cost Efficiency**: $0.03–$0.04

### Subject-Preserving Edit (Image-to-Image)
*   **Model ID**: `fal-ai/flux-kontext/dev`
*   **Role**: Cheapest and best editor for preserving character/subject context.
*   **Cost Efficiency**: $0.025/MP

### Brand Multi-Ref Compose (Sketch-to-Edit / Composite)
*   **Model IDs**: `fal-ai/bytedance/seedream/v5/lite/edit` (Value) & `fal-ai/nano-banana-pro/edit` (Quality)
*   **Role**: Designed for multi-ref brand editing.

### Generative Fill (Mask / Inpainting)
*   **Model ID**: `fal-ai/flux-pro/v1/fill` (True generative fill with masks)
*   **Model ID**: `fal-ai/flux-lora/inpainting` (Budget/cheap alternative)

### Premium Base T2I
*   **Model ID**: `fal-ai/flux-2-pro`
*   **Role**: Studio-grade general imagery.

---

## 2. Deprecated & Commented-Out Models
To remove technical debt and enforce the lean roster, the following models have been fully commented out from the active `CLICKATRON_MODELS` registry:

*   `fal-ai/imagen4/preview`
*   `fal-ai/bytedance/seedream/v4/text-to-image` and `/edit`
*   `fal-ai/bytedance/seedream/v4.5/text-to-image` and `/edit`
*   `fal-ai/nano-banana` and `/edit`
*   `fal-ai/gemini-3-pro-image-preview`
*   `wan/v2.6/image-to-image`
*   `fal-ai/stable-diffusion-inpainting`

## 3. Structural Changes
1. **Registry Updated**: `lib/config/clickatron-models.ts` now exclusively exposes the 11 targeted models. 
2. **Payload Generation Refactored**: The `generateModelPayload()` utility has been simplified and re-routed. New switch cases natively resolve `recraft-v3`, `flux-2/flash`, `ideogram/v3`, and others to map Fal parameters effectively.
3. **Defaults Swapped**: `DEFAULT_CLICKATRON_TEXT_TO_IMAGE_MODEL_ID` is now pointing to `fal-ai/bytedance/seedream/v5/lite/text-to-image`.
