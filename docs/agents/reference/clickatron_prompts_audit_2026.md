# Clickatron Prompts Audit (2026)

This file contains all the raw system prompts and prompt-construction logic used by Clickatron. It serves as a historical record of all prompt engineering iterations and optimizations for models like Flux, Seedream, Nanobanana, Ideogram.

---

## What We Fixed in V11 (Dual-Engine Architecture)
- **Model-Aware Prompting:** Realized that we shouldn't force one architecture on both families of image models. V11 introduces a router (`isLlmImageModel`).
- **LLM Generators (Gemini, Nano Banana):** Get the highly structured XML `Creative Director` prompt (V7). These models parse XML perfectly and need the explicit structural rules.
- **Diffusion Generators (Flux, Ideogram):** Get the Natural Language Hybrid prompt (V10). These models hallucinate on XML and need caption-style keywords and plain text.

## What We Fixed in V10 (Hybrid Diffusion-Native Prompter)
- **Restored Brand Directives:** V9 stripped out the Brand Context and Creativity influence to stop hallucinations, but we realized those are critical for business use-cases. 
- **Natural Language Formatting:** Instead of using structural rules (like `Priority order:` or bullet points) which confused diffusion models, V10 uses continuous natural language captions ("Design instructions: Incorporate the following brand guidelines..."). This perfectly balances the V9 high-quality artistic enhancers with the necessary Brand and Text layout directives.

## What We Fixed in V9 (Diffusion-Native Style Enhancers)
- **Stripped Meta-Instructions:** Instructions like "Priority order 1, 2, 3" and "Think like a director" were being processed by Flux/Ideogram as literal subjects to draw, which triggered generic "UI/Presentation template" training data (leading to the blue Canva-style results).
- **Direct Keyword Steering:** Image models only understand *what* to draw and *how* it should look. Replaced abstract rules with comma-separated style tags (`award-winning professional graphic design, premium editorial aesthetics...`) that actually push the generation latent space away from generic templates.

## What We Fixed in V8 (Condensed Plain-Text Precedence)
- **Stripped XML Overhead:** Text-to-Image diffusion models (Flux, Ideogram) struggled to parse the heavy XML `<role>` and `<priority_order>` tags of V7, resulting in generic flat outputs.
- **Concise Directives:** Replaced the heavy XML structure with a highly condensed, plain-text priority list. It retains the same agency-grade instructions but formatted in a way diffusion models natively understand.

## What We Fixed in V7 (Professional Creative Director Architecture)
- **Agency-Grade Precedence:** Replaced the V6 Zero-Prompt with a highly structured Creative Director persona.
- **Explicit Hierarchy:** Enforced an absolute priority list: 1. User Prompt, 2. Brand Context, 3. Default Design Knowledge.
- **Design Principles:** Added explicit sections dictating visual quality, layout composition, text rendering, and typography hierarchy.
- **Internal Design Process:** Forced the model to internally plan its lighting, typography, and hierarchy before generating.

## What We Fixed in V6 (Zero Prompt / Context Only)
- **Stripped Precedence Architecture:** The V5 precedence engine proved too rigid/complex for image models, causing generation failures. 
- **Raw Context Engine:** We stripped all instructions, field-resolution logic, and text-rules. The system now only forwards the raw User Prompt, extracted Text Hierarchy, and Brand/Source Context directly to the model.

## What We Fixed in V5 (User-Override Precedence)
- **Field-Level Precedence:** Replaced the unconditional V4 `style_lock` overrides with a `<field_resolution>` block. 
- **Preserved User Intent:** The system now checks if the user explicitly provided a style, palette, headline, scene, or footer, and uses their verbatim input if so. Fallback defaults are only injected for unspecified fields.

## What We Fixed in V4 (Generalizing the Poster Override)
- **Removed Poster Restriction:** We removed the `isEventPosterRequest` flag so that *every* Clickatron generation benefits from the artistic structuring. Generic, boring photorealistic outputs have been entirely banned.
- **Universal Style Lock:** The style lock now universally enforces a "premium, highly artistic composition" with character elements, expressive colors, and thematic details, moving away from literal photo briefs.
- **Universal Text Hierarchy & Language Guard:** The rigid `Level 1 - 6` extraction and the non-English Language Guard are now standard for all requests, ensuring dates and titles are never dropped and text rendering stays safe.

## What We Fixed in V3 (Event Poster Override)
- **Generic photo output:** The user's literal event descriptions (e.g. "students donating blood") were treated as photography briefs. Added a **Style Lock** to force icon-based graphic design.
- **Missing Date/Venue text:** The model ignored dates/times because they weren't structured. Added **Auto Text-Hierarchy Extraction** to explicitly force Level 1 - 6 text fields in a rigid layout.
- **Garbled Non-Latin Text:** Added a **Language Guard** to reject non-English text from being rasterized in the image, redirecting it to overlay layers instead.

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

### V2 (Current)
Clickatron dynamically constructs Text-to-Image prompts by assembling three blocks: Source Context, Brand Context, and Rules. 

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

<details>
<summary>V1 (Deprecated)</summary>

**Why Deprecated:** This baseline lacked strict enforcement of brand constraints over creative intents, and didn't prevent the model from inventing missing context fields. Replaced by V2.

**Baseline Rules (Always Present):**
> Use source and brand context for concept, composition, color, tone, audience fit, and overlay-safe negative space.
> Honor every brand hard constraint from the source context, and treat key claims as visual concepts to evoke through scene and composition, never as text to render.
> Do not invent logos, trademarks, mascots, product packs, or brand assets unless the prompt or reference images explicitly provide them.
> Do not render source IDs or internal metadata text in the thumbnail.

**When Text Rendering is OFF:** (Same as V2)

**When Text Rendering is ON:**
> If the source context supplies text-layer copy, render exactly that copy in the image — accurate spelling, brand-appropriate type, high contrast, balanced placement, overlay-safe margins.
> Render ONLY the supplied text-layer copy. If no copy is supplied, keep the image text-free — never invent extra words, captions, UI chrome, watermarks, or logo text.

</details>

---

## 4. Text-to-Image Generation (V11 Dual-Engine Architecture)
**Location:** `lib/clickatron/brand-prompt-context.ts` (applied to all T2I generations)

### V11 (Current: The Dual-Engine Router)
V11 introduces conditional routing based on the selected `modelId`. We no longer try to use a "one-size-fits-all" prompt. 

- If the model is an **LLM-based generator** (like Gemini or Nano Banana), it uses the **V7 XML Creative Director** prompt, which they parse perfectly.
- If the model is a **Diffusion generator** (like Flux, Ideogram, Midjourney), it uses the **V10 Hybrid Natural Language** prompt, preventing the XML-induced Canva hallucinations.

<details>
<summary>V10 (FAILED: Universal Hybrid Prompter)</summary>

**STATUS: FAILED ATTEMPT.** While V10 was perfect for Diffusion models (producing stunning photorealism without hallucinating Canva templates), it was sub-optimal for the LLM-based generators (Gemini/Nano Banana), which performed better with the strict XML hierarchy of V7.

```text
[User's Raw Prompt], award-winning professional graphic design, premium editorial aesthetics, masterpiece, striking visual hierarchy, high-end commercial quality, clean composition, deliberate negative space, highly detailed, non-generic, unique artistic layout

Text elements to incorporate seamlessly into the design:
[Parsed fields injected here]

Design instructions: Incorporate the following brand guidelines and contextual details naturally. The brand colors, tone, and visual identity should influence the final design without overriding the primary visual prompt. Maintain premium creativity and professional spacing.

[Source Context Block]
[Brand Context Block]
```
</details>

<details>
<summary>V9 (FAILED: Diffusion-Native Style Enhancers Only)</summary>

**STATUS: FAILED ATTEMPT.** While V9 successfully stopped the Canva-template hallucinations and produced beautiful images, it completely stripped away the directives to follow the Brand Context and maintain professional creativity, leading to disjointed brand identities.

```text
[User's Raw Prompt], [enhancers]
[Text Hierarchy]
[Context Blocks]
```
</details>

<details>
<summary>V8 (FAILED: Condensed Plain-Text Precedence)</summary>

**STATUS: FAILED ATTEMPT.** The plain-text rules (e.g. "Priority order: 1. User Prompt") were parsed by the diffusion models as literal presentation slides, resulting in generic blue corporate templates instead of artistic designs.

```text
You are Clickatron.
Generate premium marketing visuals.
...
```
</details>

<details>
<summary>V7 (FAILED: XML-Structured Creative Director)</summary>

**STATUS: FAILED ATTEMPT.** While the logic was perfect for an LLM, the heavy XML tags (`<role>`, `<priority_order>`) confused the diffusion T2I models (like Flux and Ideogram), causing them to fallback to generic, low-quality Canva-style templates.

```xml
<role>You are Clickatron, an expert AI creative director...</role>
<priority_order>1. USER PROMPT... 2. BRAND CONTEXT... 3. DEFAULT DESIGN KNOWLEDGE</priority_order>
<creative_principles>...</creative_principles>
<visual_quality>Aim for Behance, Pentagram, Apple Keynote...</visual_quality>
<composition>...</composition>
<typography>...</typography>
<text_rendering>...</text_rendering>
<brand>...</brand>
<creativity>...</creativity>
<negative_bias>...</negative_bias>
<final_goal>...</final_goal>
<internal_design_process>...</internal_design_process>

<user_explicit_content>
[User's Raw Prompt]
</user_explicit_content>
```
</details>

<details>
<summary>V6 (Deprecated: Zero Prompt)</summary>

**STATUS: ABANDONED.** Stripping all instructions successfully proved that the V5 logic was the root cause of the hallucination bugs, but relying entirely on zero-prompt context left the model with no baseline for premium design quality.

```xml
[User's Raw Prompt]
<extracted_text_hierarchy>...</extracted_text_hierarchy>
[Context Blocks]
```
</details>

<details>
<summary>V5 (FAILED: Field-Level Precedence)</summary>

**STATUS: FAILED ATTEMPT.** The structured `<field_resolution>` rules were too restrictive and confused the image models during actual generations. 

**See the complete failed V5 architecture:** [`clickatron_v5_failed_precedence_architecture.md`](./clickatron_v5_failed_precedence_architecture.md)
</details>

<details>
<summary>V4 (Deprecated: Universal Artistic Restructuring)</summary>

**Why Deprecated:** The `style_lock` and layout templates were applied *unconditionally*, meaning if a user explicitly asked for a specific non-illustration style (like "realistic photography"), the system forcefully overrode them with a flat design. Replaced by V5.

The `isEventPosterRequest` restriction was lifted. The system now parses text hierarchy and enforces artistic style locks on ALL generations to prevent generic photorealistic outputs.

```xml
<role>You are an expert graphic design generator creating a bold, modern, and highly artistic composition.</role>

<style_lock>
This is a premium, highly artistic graphic-design composition, not a boring or generic photograph. Regardless of how the user describes the scene, render it as:
- A visually pleasing, highly artistic flat/vector-style illustration or bold graphic design, NOT photorealistic photography.
- Incorporate engaging character elements, expressive colors, and rich thematic details that align with the brand and context.
- Use bold gradients, dynamic layouts, and solid-color typography to create an engaging visual weight.
- A textured or stylistic background (paper texture, subtle pattern, or solid color field) rather than a literal environment/location.
- If the user's prompt explicitly describes literal photographic people/scenes, treat this as a description of the MOOD and SUBJECT MATTER to evoke through artistic iconography, character elements, and composition, not as a literal photo brief.
- Strictly adhere to the provided brand colors and contrast cautions to ensure absolute visual harmony.
</style_lock>

<text_hierarchy>
[Parsed fields injected here: LEVEL 1 (org), LEVEL 2 (title), LEVEL 4 (date), etc. If empty, instruct not to invent.]
</text_hierarchy>

<language_guard>
Render text in English only, exactly as provided in <text_hierarchy>, regardless of what script the user's original request used or implied. If the user's request included non-English text, do not attempt to render it as image text — flag it for the editable text-overlay layer instead, and use English-language visual/iconographic elements only.
Do not alter spelling, dates, numbers, or capitalization from what was supplied.
</language_guard>

<brand_context>
[... brand identity, typography, visual directives, color cautions ...]
</brand_context>

<clickatron_generation_rules>
[... baseline rules + text handling rules from V2 ...]
</clickatron_generation_rules>

<layout_rules>
- Maintain high contrast between text and background at every text zone
- Keep a consistent color palette across illustrations, typography, and background (strictly adhering to the specified brand context)
- Ensure character elements and visual metaphors are central to the composition, making it visually striking and far from boring
- Do not add generic stock-photo-style people, watermarks, or unrelated decorative elements
</layout_rules>

<clickatron_thumbnail_request>
[User's core visual prompt]
</clickatron_thumbnail_request>

<output_format>A single flat-design artistic image, portrait orientation, with all specified text rendered exactly and legibly, in the described graphic-design style.</output_format>
```
</details>

<details>
<summary>V3 (Deprecated: Event Poster Specific)</summary>

**Why Deprecated:** Hardcoded style override was applied only to "poster" keywords, missing many general requests that also suffered from generic outputs. Eventually generalized to V4 (and then fixed in V5).

Triggered dynamically ONLY if `isEventPosterRequest` matched.

```xml
<role>You are a graphic design generator creating a bold, modern event poster.</role>

<style_lock>
This is a graphic-design poster, not a photograph. Regardless of how the user describes the scene, render it as:
- Flat/vector-style illustration or bold graphic design, NOT photorealistic photography
- Icon-based visual metaphors instead of literal photographic scenes (e.g. represent "blood donation" with a stylized blood drop, donation bag icon, medical cross, heartbeat/EKG line — NOT a photo-style rendering of people mid-procedure)
- Bold gradient or solid-color typography as the dominant visual element, occupying 40-60% of visual weight
- A textured or simple background (paper texture, subtle pattern, or solid color field) rather than a literal environment/location
- If the user's prompt explicitly describes literal photographic people/scenes, treat this as a description of the MOOD and SUBJECT MATTER to evoke through icons and composition, not as a literal photo brief
</style_lock>

<text_hierarchy>
[Parsed fields injected here: LEVEL 1 (org), LEVEL 2 (title), LEVEL 4 (date), etc. If empty, instruct not to invent.]
</text_hierarchy>

<language_guard>
Render text in English only, exactly as provided in <text_hierarchy>, regardless of what script the user's original request used or implied. If the user's request included non-English text, do not attempt to render it as image text — flag it for the editable text-overlay layer instead, and use English-language visual/iconographic elements only.
Do not alter spelling, dates, numbers, or capitalization from what was supplied.
</language_guard>

<brand_context>
[... brand identity, typography, visual directives, color cautions ...]
</brand_context>

<layout_rules>
- Reserve top ~15% for Level 1 text, middle ~50% for the icon/illustration composition and Level 2 title, bottom ~30% for Level 4-6 text
- Maintain high contrast between text and background at every text zone
- Keep a consistent color palette across icons, typography, and background (2-3 colors max, as specified in brand/user context)
- Do not add stock-photo-style people, watermarks, or unrelated decorative elements not implied by the event category
</layout_rules>

<clickatron_thumbnail_request>
[User's core visual prompt]
</clickatron_thumbnail_request>

<output_format>A single flat-design poster image, portrait orientation, with all specified text rendered exactly and legibly, in the described graphic-design style.</output_format>
```

</details>

---

## 5. Image-to-Image & Generative Fill (Diffusion-Native Refactor)
**Location:** `lib/config/clickatron-models.ts` 

Prior to V11, the `GENERATIVE_FILL_SYSTEM_PROMPT` and `IMAGE_TO_IMAGE_SYSTEM_PROMPT` used XML tags (e.g., `<role>`, `<rules>`, `<task>`). Because these operations rely entirely on Diffusion models (Flux Inpainting, Ideogram, Seedream Edit), the models hallucinated the XML tags as literal text, attempting to render Canva-like templates into the user's images. 

### Current Diffusion-Native Prompts (V11 Standard)
These have been rewritten as pure natural language prose with comma-separated keywords and plain-text lists.

**Generative Fill (Inpainting):**
```text
Inpainting instructions: You are performing a precise generative fill. Modify ONLY the masked area according to the user request. Keep 100% of the non-masked areas EXACTLY unchanged. 

CRITICAL RULES:
- Blend the new content seamlessly with the surrounding pixels.
- Match the lighting, style, color tone, and perspective of the original image perfectly.
- Do NOT regenerate or modify the entire image. This is localized inpainting.
- Preserve all original objects, people, and details outside the masked region.
- Maintain the EXACT original canvas size, resolution, and aspect ratio. Do not crop or reframe.
- Scale or adapt the new content to fit naturally within the mask boundaries without bleeding into unmasked areas.
- Do not render these instructions as text in the image.
```

**Image-to-Image (Edit):**
```text
Image-to-image editing instructions: Create a variation that applies the requested changes while staying true to the original foundation. Do not replace the original image entirely.

CRITICAL RULES:
- Preserve the subject pose, camera angle, framing, and spatial layout unless the request explicitly changes them.
- Keep the same lighting style, color grading, and overall mood unless explicitly asked to alter them.
- Do NOT completely regenerate or reinterpret the entire image.
- Maintain the original level of detail, quality, and artistic style.
- Maintain the EXACT aspect ratio and dimensions of the original image. Do not change the image size or crop.
- If a requested change conflicts with preservation (e.g. "make it winter" implies lighting changes), the explicit request takes priority for that attribute only. Everything else must remain preserved.
- Do not render these instructions as text in the image.
```

### Aspect Ratio Physical & Compositional Fix (2026-07-08)
1. **Physical Fix**: Standard Flux models (`fal-ai/flux-kontext/dev` & `fal-ai/flux-pro/v1/fill`) were ignoring the UI-selected Aspect Ratio and defaulting to Fal AI's default (e.g., 1024x1024). Fixed by ensuring `image_size: { width, height }` is explicitly passed in `generateModelPayload`.
2. **Compositional Fix**: Even when physical canvas sizes were correct, Diffusion/LLM models often composed subjects blindly (e.g., centering a square subject in a 16:9 canvas). A hard constraint is now dynamically injected into V7/V10 prompts via `buildClickatronGenerationPrompt`:
   > *CRITICAL LAYOUT RULE: The final image will be generated at a [ratio] aspect ratio. You MUST compose the layout, typography, and focal point specifically to fit a [ratio] canvas.*
