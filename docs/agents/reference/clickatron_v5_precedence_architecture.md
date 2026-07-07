# Clickatron — V5: User-Override Precedence Architecture

## Problem (Why V3/V4 was Deprecated)
V3/V4 (the "hardened" event poster prompt / general artistic prompt) was built on the assumption that user input is *always* weak, so it injected `style_lock`, generic `text_hierarchy` fallbacks, and icon-vocabulary defaults **unconditionally** — with language like "regardless of what the user says." 

That was correct for weak inputs but actively destructive for strong, explicit, well-structured user prompts (e.g., an "editorial/cinematic" brief with a specific color palette). The system overrode the user's own style, palette, headline, and scene instructions with generic defaults.

**Root cause:** Fallback logic was implemented as override logic. There was no field-level check for "did the user already specify this field explicitly?" before the hardening layer injected its defaults.

---

## The V5 Solution: Field-Level Precedence

V5 introduces a `<field_resolution>` block that instructs the LLM to perform a field-by-field check **before** generating:

```
FOR EACH field in [style, color_palette, headline, scene_description, footer_details, typography]:
  IF user_prompt explicitly specifies this field:
    → use the user's value directly (light cleanup/structuring only — do not reinterpret, replace, or override)
  ELSE:
    → apply the hardened fallback/default for this field (style_lock, generic hierarchy, icon vocabulary, etc.)
```

This is a true per-field check. If a user specifies the style and palette explicitly but leaves the footer vague, the system respects the style and palette while applying fallback defaults only to the footer.

---

## V5 Assembled Prompt Output

**Location:** `lib/clickatron/brand-prompt-context.ts`

```xml
<role>You are a graphic design generator creating a bold, modern event poster.</role>

<field_resolution>
Before generating, determine for EACH of the following whether the user's request explicitly specified it:
- Visual style (e.g. "editorial", "realistic", "cinematic", "illustration", "flat design")
- Color palette
- Headline text
- Scene/subject description
- Footer details (date, time, venue, organiser)
- Typography direction
- Explicit negative constraints (e.g. "avoid AI faces", "avoid stock-photo look", "avoid overcrowded layouts")

For any field the user explicitly specified: use their value as the authoritative source. Do not substitute it with a default, template, or "safer" alternative under any circumstance.
For any field the user left unspecified or vague: apply the fallback defaults below.
</field_resolution>

<fallback_defaults use_only_if_field_unspecified="true">
- Style fallback: flat/vector graphic-design illustration with icon-based visual metaphors
- Palette fallback: derive from brand_context; if brand_context also empty, use 2-3 high-contrast colors appropriate to the event category
- Headline fallback: "[Org Name] presents: [Event Name]"
- Scene fallback: icon-based composition representing the event category
- Footer fallback: omit any sub-field not supplied — do not invent date/time/venue placeholders
</fallback_defaults>

<user_explicit_content>
User's visual prompt:
[Injected user prompt]

Extracted text fields from metadata:
[Injected parsed text hierarchy or "None"]
</user_explicit_content>

<negative_constraints>
Always carry forward any explicit "avoid" list from the user verbatim — these are hard constraints, never optional style suggestions.
</negative_constraints>

<brand_context>
[unchanged — used only to fill gaps in palette/typography if user did not specify]
</brand_context>

<clickatron_generation_rules>
[baseline rules + text rules]
</clickatron_generation_rules>

<canvas_and_layout>
Maintain clear hierarchy and legible text placement, but do not impose the flat-illustration layout template if the user's specified style is photographic/editorial/cinematic — layout conventions should match the chosen style, not override it.
</canvas_and_layout>

<language_guard>
Render text in English only, exactly as the user specified — no spelling/date/number changes. If non-English script was requested, redirect to overlay layer instead of attempting to render it as image text.
</language_guard>

<output_format>A single image matching the resolved style, palette, and text exactly as specified above.</output_format>
```

---

## Comparison to Prior Versions

| Field | V3/V4 behavior | V5 behavior |
|---|---|---|
| **Style** | `style_lock` always forced a flat illustration/graphic design | Fallback only applies if user didn't specify a style |
| **Text** | Generic `text_hierarchy` template always injected | User's actual headline/footer text passed through verbatim when given |
| **Palette** | Always pulled from internal default or brand_context | User's explicit palette wins outright |
| **Scene/Icons**| Icon-vocabulary auto-selected by category | Only used to fill in *scene description* if the user didn't describe it |
| **Avoid List** | Treated as inherited from internal design rules | User's own "avoid" list is carried through as a hard constraint |
