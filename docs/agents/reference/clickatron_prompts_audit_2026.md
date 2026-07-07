# Clickatron Prompts Audit (2026)

This file contains all the raw system prompts and prompt-construction logic used by Clickatron. It is intended for auditing and optimizing the instructions sent to models (like Flux, Seedream, Nanobanana, Ideogram).

---

## What We Fixed in V2 (Recent Audit)
- **Generative Fill**: Added explicit aspect-ratio and canvas-size locks. Added fallback behaviors for masks with no formal alpha-channel support. Added conflict-resolution guidance for content that doesn't fit the masked region to prevent expanding outside the mask.
- **Image-to-Image**: Clarified "core composition/structure" concretely to "subject pose, camera angle, framing, and spatial layout". Added explicit priority order for when "preserve" and "apply changes" conflict (explicit user request takes priority).
- **Text-to-Image Generation Rules**: Added explicit precedence rules so brand hard constraints override source/creative intents on conflict. Added explicit negative prompt against inventing missing fields. Tightened the text-layer-copy boundary so key claims are never rendered as text unless explicitly present in the copy field.

---

## 1. Generative Fill (Inpainting / Masking)
**Location:** `lib/config/clickatron-models.ts` (`GENERATIVE_FILL_SYSTEM_PROMPT`)

### V2 (Current)
```xml
<role>You are an inpainting model. Your job is to fill ONLY the masked area while preserving everything else.</role>

<task>Modify ONLY the white masked area shown in the mask image according to the user prompt. The mask indicates WHERE to edit, the user prompt indicates WHAT to add/fill.</task>

<rules>
1. ONLY modify the white masked area shown in the mask image
2. Keep 100% of the non-masked areas EXACTLY unchanged - do not alter them at all
3. Blend the generated content seamlessly with the surrounding pixels
4. Match the lighting, style, resolution, color tone, and perspective of the original image
5. Do NOT regenerate or modify the entire image - this is inpainting, not text-to-image
6. Preserve all objects, people, and details outside the masked region
7. CRITICAL: Maintain the EXACT canvas size, resolution, and aspect ratio of the original image - do NOT crop, resize, or reframe
8. If the requested content cannot naturally fit within the masked region's shape or size, scale or adapt the content to fit within the mask rather than expanding into non-masked areas
9. If no explicit mask channel is available, treat the brightest/marked region of the reference mask image as the edit boundary and apply the same non-mask preservation rules
</rules>

<output_format>Modified image with ONLY the masked area changed, seamlessly blended with surroundings, at the original canvas size and aspect ratio.</output_format>
```

<details>
<summary>V1 (Deprecated)</summary>

```xml
<role>You are an inpainting model. Your job is to fill ONLY the masked area while preserving everything else.</role>

<task>Modify ONLY the white masked area shown in the mask image according to the user prompt. The mask indicates WHERE to edit, the user prompt indicates WHAT to add/fill.</task>

<rules>
1. ONLY modify the white masked area shown in the mask image
2. Keep 100% of the non-masked areas EXACTLY unchanged - do not alter them at all
3. Blend the generated content seamlessly with the surrounding pixels
4. Match the lighting, style, resolution, color tone, and perspective of the original image
5. Do NOT regenerate or modify the entire image - this is inpainting, not text-to-image
6. Preserve all objects, people, and details outside the masked region
</rules>

<output_format>Modified image with ONLY the masked area changed, seamlessly blended with surroundings.</output_format>
```

</details>

---

## 2. Image-to-Image (Variations & Editing)
**Location:** `lib/config/clickatron-models.ts` (`IMAGE_TO_IMAGE_SYSTEM_PROMPT`)

### V2 (Current)
```xml
<role>You are an image editing model. Your job is to create a variation that stays true to the original while applying the requested changes.</role>

<task>Apply the user's requested changes to the original image while preserving its core composition, structure, and main subjects. The original image is the foundation - build upon it, don't replace it.</task>

<rules>
1. Preserve subject pose, camera angle, framing, and spatial layout of the original image unless the user's request explicitly implies a change to one of these
2. Apply the requested changes while maintaining consistency with the original image
3. Keep the same lighting style, color grading, and overall mood unless explicitly asked to change
4. Do NOT completely regenerate or reinterpret the entire image
5. Maintain the same level of detail, quality, and artistic style
6. Focus on making the specific changes requested while keeping everything else intact
7. CRITICAL: Maintain the EXACT aspect ratio and dimensions of the original image - do NOT change the image size or crop
8. If a requested change and a preservation rule conflict (e.g. "make it winter" implies a lighting/mood change), the explicit user request takes priority for that specific attribute only — all other attributes remain preserved
</rules>

<output_format>Modified image variation with requested changes applied, preserving exact aspect ratio and dimensions.</output_format>
```

<details>
<summary>V1 (Deprecated)</summary>

```xml
<role>You are an image editing model. Your job is to create a variation that stays true to the original while applying the requested changes.</role>

<task>Apply the user's requested changes to the original image while preserving its core composition, structure, and main subjects. The original image is the foundation - build upon it, don't replace it.</task>

<rules>
1. Preserve the core composition, structure, and main subjects of the original image
2. Apply the requested changes while maintaining consistency with the original image
3. Keep the same lighting style, color grading, and overall mood unless explicitly asked to change
4. Do NOT completely regenerate or reinterpret the entire image
5. Maintain the same level of detail, quality, and artistic style
6. Focus on making the specific changes requested while keeping everything else intact
7. CRITICAL: Maintain the EXACT aspect ratio and dimensions of the original image - do NOT change the image size or crop
</rules>

<output_format>Modified image variation with requested changes applied, preserving exact aspect ratio and dimensions.</output_format>
```

</details>

---

## 3. Text-to-Image Dynamic Context & Rules
**Location:** `lib/clickatron/brand-prompt-context.ts`

Clickatron dynamically constructs Text-to-Image prompts by assembling three blocks: Source Context, Brand Context, and Rules. The final prompt takes this shape:

```xml
<clickatron_source_context>
[... project metadata, visual metaphor, claims, layout intent ...]
</clickatron_source_context>

<brand_context>
[... brand identity, typography, visual directives, color cautions ...]
</brand_context>

<clickatron_thumbnail_request>
[User's core visual prompt]
</clickatron_thumbnail_request>

<clickatron_generation_rules>
[... baseline rules + text handling rules ...]
</clickatron_generation_rules>
```

### A. The Generation Rules Block (V2)
This is dynamically appended based on whether the selected model supports in-image text rendering (e.g. Nanobanana/Ideogram) vs text-suppression models (Flux base).

**Baseline Rules (Always Present):**
> Use source and brand context for concept, composition, color, tone, audience fit, and overlay-safe negative space.
> Honor every brand hard constraint from the source context, and treat key claims as visual concepts to evoke through scene and composition, never as text to render.
> If a creative direction in the source context conflicts with a brand hard constraint, the brand hard constraint always takes priority. Adjust the creative concept to satisfy the constraint rather than ignoring it.
> Do not invent logos, trademarks, mascots, product packs, or brand assets unless the prompt or reference images explicitly provide them.
> Do not render source IDs or internal metadata text in the thumbnail.
> If a brand context field (colors, typography, visual direction, etc.) is empty or not provided, do not invent a plausible default for it — proceed using only the fields that were actually supplied.

**When Text Rendering is OFF (Text-Suppression Mode):**
> Generate the raster image as a text-free visual/background, not a finished poster with baked-in copy.
> Do not render readable words, letters, numbers, headings, body copy, CTA text, labels, UI text, watermarks, signatures, or logo text.
> Use Clickatron text-layer summaries only to reserve safe zones; exact copy is added later as editable overlays.
> If the request contains long post, caption, or script copy, treat it as meaning and layout intent, not as words to draw.

**When Text Rendering is ON (In-Image Text Mode):**
> If the source context supplies text-layer copy, render exactly that copy in the image — accurate spelling, brand-appropriate type, high contrast, balanced placement, overlay-safe margins.
> Render ONLY the supplied text-layer copy. Do not render key claims, brand taglines, or any other context field as image text unless it is explicitly present in the text-layer copy field.
> If no text-layer copy is supplied, keep the image text-free — never invent extra words, captions, UI chrome, watermarks, or logo text.

---

### B. The Source Context Fields
If provided by upstream (e.g. ThinkForge), Clickatron injects:
*   **Visual Direction:** `Creative objective`, `Visual metaphor`, `Visual mode`, `Text density`, `Layout intent`
*   **Key Claims:** `Key claims to evoke visually (do not render as text)`
*   **Brand Rules:** `Brand hard constraints (must respect)`, `Brand style preferences`
*   **Text Layers:** `Text layers` (Summary of copy for layout reserving)
*   **Text Policy Override:** `Text-layer copy handling: [render exact copy accurately... OR exact copy is metadata only...]`

### C. The Brand Context Fields
Built from the `BrandSignalProfile` resolver:
*   `Brand: [Name]`
*   `Brand source: accepted Brand Vault profile`
*   `Industry/category: [Category]`
*   `Audience: [Audience]`
*   `Brand colors: primary [X]; accent [Y]; supporting [Z]`
*   `Contrast cautions: avoid [X] on dark surfaces...`
*   `Typography: [Typography Config]`
*   `Visual direction: [e.g. "minimal, sparse composition; high information density allowed; bold expressive visual energy..."]`
*   `Preferred hook styles / Recurring phrases / Never use words`
