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

---

## Example: Golden Standard V5 User Prompt

This is an example of a highly-structured, explicit user prompt that successfully overrides the fallback defaults using the V5 Precedence Engine. Because the user explicitly defined the visual style, color palette, negative constraints, and layout, the `<field_resolution>` block correctly identifies these and suppresses the flat-illustration defaults, resulting in a premium, cinematic poster as intended.

```text
You are the Creative Director of Pentagram designing the flagship campaign poster for NSS JIIT.

This should NOT look like an AI-generated poster, Canva template, or stock event flyer.

The final result should resemble an award-winning university awareness campaign that could be featured on Behance or Awwwards.

━━━━━━━━━━━━━━━━━━━━━━
BRAND
━━━━━━━━━━━━━━━━━━━━━━

Organisation:
NSS JIIT

Brand Personality:
Modern
Youth-driven
Purpose-first
Trustworthy
Bold
Minimal
Premium

Audience:
College students (18–24)

━━━━━━━━━━━━━━━━━━━━━━
VISUAL STYLE
━━━━━━━━━━━━━━━━━━━━━━

Editorial poster design

Swiss typography

Nike campaign energy

Apple keynote cleanliness

Behance Featured

Modern NGO campaign

Ultra premium

Magazine cover quality

Hyper-realistic

━━━━━━━━━━━━━━━━━━━━━━
COLOR PALETTE
━━━━━━━━━━━━━━━━━━━━━━

Pure White

Medical Red

Deep Crimson

Soft Warm Gray

Black

Small metallic highlights

━━━━━━━━━━━━━━━━━━━━━━
COMPOSITION
━━━━━━━━━━━━━━━━━━━━━━

Use a strong editorial grid.

One dominant hero.

Large negative space.

Clear visual hierarchy.

No clutter.

No decorative elements unless they reinforce the concept.

Viewer attention should immediately land on the hero object, then headline, then event information.

━━━━━━━━━━━━━━━━━━━━━━
HERO VISUAL
━━━━━━━━━━━━━━━━━━━━━━

A realistic blood donation bag suspended in the center.

The blood inside subtly forms the silhouette of a human heart.

The IV tube naturally flows across the composition, becoming part of the layout.

Small floating blood droplets.

Soft cinematic lighting.

Premium reflections.

Photorealistic materials.

Subtle medical environment hints.

No cartoon illustrations.

No clipart.

━━━━━━━━━━━━━━━━━━━━━━
TYPOGRAPHY
━━━━━━━━━━━━━━━━━━━━━━

The headline should dominate the composition.

Use huge bold condensed typography.

Headline:

BLOOD
DONATION
DRIVE

The text should interact naturally with the hero object.

Some letters may overlap behind the blood bag to create depth.

Premium spacing.

Strong hierarchy.

━━━━━━━━━━━━━━━━━━━━━━
EVENT DETAILS
━━━━━━━━━━━━━━━━━━━━━━

17 August 2026

9:00 AM – 4:00 PM

TV Room above JIIT Dispensary

Organised by NSS JIIT

Keep these small and clean inside a structured information panel.

━━━━━━━━━━━━━━━━━━━━━━
LOGO PLACEMENT
━━━━━━━━━━━━━━━━━━━━━━

NSS JIIT logo

Top-left

Small

Respect safe margins.

Never overpower the headline.

━━━━━━━━━━━━━━━━━━━━━━
LIGHTING
━━━━━━━━━━━━━━━━━━━━━━

Soft studio lighting.

Subtle volumetric rays.

Gentle shadows.

Photographic realism.

Premium color grading.

━━━━━━━━━━━━━━━━━━━━━━
MOOD
━━━━━━━━━━━━━━━━━━━━━━

Confident

Hopeful

Human

Modern

Trustworthy

━━━━━━━━━━━━━━━━━━━━━━
NEGATIVE PROMPT
━━━━━━━━━━━━━━━━━━━━━━

Avoid:

Canva template layouts

Stock-photo appearance

Generic NGO flyer aesthetics

Flat vector graphics

Cartoon illustrations

Overcrowded composition

Random decorative icons

Medical cross clipart

Poor typography

Unreadable text

Bad anatomy

Malformed hands

Plastic-looking materials

Low resolution

Watermarks

AI-generated faces

━━━━━━━━━━━━━━━━━━━━━━
QUALITY TARGET
━━━━━━━━━━━━━━━━━━━━━━

The final poster should look like it was designed by a professional creative agency, not generated by AI.

Scrolling users should stop within two seconds because of the strong visual hierarchy, premium typography, and cinematic hero image.
```
