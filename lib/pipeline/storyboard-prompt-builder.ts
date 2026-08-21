/**
 * Storyboard Prompt Builder
 *
 * Builds image-generation prompts from scene descriptors + style guide.
 * Designed for visual consistency across all storyboard frames.
 *
 * Image prompts describe STILL frames only — no camera movement.
 * Quality tokens are dynamic per art style, not hardcoded.
 *
 * Cinema hardware integration (camera body, lens, focal length, aperture/DoF)
 * is wired in via cinema-prompt-config. When no explicit CinemaSettings are
 * supplied, they are auto-derived from scene.mood + styleGuide.artStyle —
 * the same derivation used by the video pipeline worker.
 *
 * Prompt slot order follows §2.5 of creative-production-knowledge-v2:
 *   1. ENVIRONMENT + LIGHTING   — sets the world first
 *   2. SUBJECT + STATE          — who/what is in the scene
 *   3. COMPOSITION              — shot type and framing intent
 *   4. CAMERA BEHAVIOR          — n/a for stills; explicit comment preserved
 *   5. LENS + DEPTH             — cinema hardware (focal length, aperture, DoF)
 *   6. MOOD + AESTHETIC         — color palette, film stock, art style
 *   7. TECHNICAL QUALITY        — consistency, anti-artifact, scene index
 *   8. NEGATIVE PROMPT          — handled by buildNegativePrompt()
 */

import type { SceneDescriptor } from './schemas/storyboard';
import type { StyleGuide } from './schemas/storyboard';
import {
  type CinemaSettings,
  buildCinemaFragment,
  getCinemaSettingsFromContent,
} from '@/lib/editron/data/cinema-prompt-config';

/** Map art-style identifiers to descriptive prompt tokens for image generation. */
const ART_STYLE_PROMPTS: Record<string, string> = {
  cinematic: 'cinematic film still, 35mm Kodak film stock, anamorphic lens, shallow depth of field, professional color grade',
  photorealistic: 'photorealistic, ultra-detailed DSLR photograph, natural lighting, sharp focus, RAW photo',
  documentary: 'documentary photography, raw authentic candid shot, natural available light, subtle film grain',
  noir: 'film noir still, high contrast black and white, deep dramatic shadows, venetian blind light patterns',
  anime: 'anime key visual, studio quality cel animation, clean precise linework, vibrant saturated colors, detailed background art',
  cartoon: 'cartoon illustration, bold clean outlines, bright saturated flat colors, stylized proportions, expressive',
  'comic-book': 'comic book panel art, graphic novel, bold ink outlines, halftone dot shading, dynamic composition',
  'pixel-art': 'pixel art, retro 16-bit game aesthetic, clean pixel edges, limited color palette, dithering patterns',
  watercolor: 'watercolor painting, wet-on-wet technique, organic pigment bleeding, visible paper texture, luminous translucent washes',
  'oil-painting': 'oil painting, rich impasto brushwork, classical composition, museum gallery quality, visible canvas texture',
  sketch: 'detailed pencil sketch, expressive linework, cross-hatching shading, hand-drawn illustration on paper',
  'pop-art': 'pop art, bold primary colors, Ben-Day dots pattern, Roy Lichtenstein inspired, flat graphic style',
  cyberpunk: 'cyberpunk scene, neon-drenched atmosphere, holographic displays, rain-slicked reflective surfaces, dystopian tech',
  fantasy: 'fantasy concept art, epic composition, magical atmospheric lighting, rich detailed world-building',
  horror: 'horror still, desaturated cold tones, heavy vignette, unsettling negative space, ominous shadows',
  '3d-render': '3D rendered, Octane render quality, volumetric lighting, subsurface scattering, ray-traced reflections',
  isometric: 'isometric view, clean 3D illustration, flat geometric shading, precise architectural lines',
  minimalist: 'minimalist design, flat vector illustration, clean geometric lines, limited restrained palette',
  collage: 'mixed media collage, layered cut-paper textures, eclectic composition, tactile handmade quality',
  vaporwave: 'vaporwave aesthetic, pastel neon gradients, retro CRT glow, 80s nostalgia, chrome reflections',
  steampunk: 'steampunk illustration, ornate Victorian brass machinery, copper patina, intricate gear mechanisms',
  gothic: 'dark Gothic art, cathedral architecture, ornate stone details, deep shadows, stained glass light',
  'art-deco': 'Art Deco illustration, bold geometric patterns, gold and black palette, 1920s glamour, symmetrical design',
  surrealism: 'surrealist painting, dreamlike impossible imagery, melting forms, Dalí-inspired, vivid strange beauty',
  expressionism: 'expressionist painting, distorted angular forms, bold emotional brushstrokes, intense saturated colors',
  'lo-fi': 'lo-fi aesthetic, warm analog grain, soft diffused focus, muted earth tones, cozy nostalgic warmth',
  grunge: 'grunge texture, gritty urban decay, distressed weathered surfaces, raw underground aesthetic',
  pastel: 'soft pastel palette, dreamy ethereal atmosphere, gentle gradients, delicate luminous quality',
  'neon-noir': 'neon noir scene, rain-soaked streets, vivid neon sign reflections, dark urban atmosphere, moody contrast',
  vintage: 'vintage photograph, faded warm color cast, 70s analog film tones, light leaks, nostalgic grain',
  ukiyo: 'ukiyo-e Japanese woodblock print style, flat perspective, flowing organic lines, traditional color palette',
  'concept-art': 'concept art, professional entertainment design, detailed matte painting, polished illustration',
  claymation: 'claymation still, handmade clay figures, visible fingerprint textures, playful 3D stop-motion look',
  storybook: 'children\'s storybook illustration, whimsical warmth, inviting hand-drawn detail, fairy tale charm',
  brutalist: 'brutalist design, raw exposed concrete, stark geometric forms, industrial minimalism, high contrast',
  'glitch-art': 'glitch art, data corruption aesthetic, pixel sorting artifacts, chromatic aberration, digital distortion',
  impressionist: 'impressionist painting, visible expressive brushstrokes, captured light and atmosphere, Monet-inspired',
  'action-blockbuster': 'action movie still, explosive cinematic lighting, wide-angle distortion, dynamic frozen moment',
  'sci-fi': 'science fiction concept art, futuristic advanced technology, volumetric atmospheric lighting, epic scale',
  thriller: 'thriller movie still, cold desaturated color grade, tense claustrophobic framing, David Fincher aesthetic',
  western: 'western film still, golden hour desert light, rugged dusty landscape, anamorphic lens warmth',
  'war-film': 'war film still, gritty realism, smoke and debris atmosphere, desaturated muted palette',
  superhero: 'superhero concept art, dynamic heroic composition, vivid saturated colors, dramatic rim lighting, Marvel style',
  'rom-com': 'romantic film still, warm golden soft lighting, beautiful bokeh, intimate warm framing',
  'indie-film': 'indie film still, natural available light, intimate quiet framing, muted earth tones, A24 aesthetic',
  'motion-graphics': 'flat design illustration, clean vector shapes, bold geometric composition, modern typography',
  architectural: 'architectural visualization, precise technical rendering, clean lines, dramatic vanishing point perspective',
};

function buildSemanticEditorialIntentFragment(
  intent: NonNullable<SceneDescriptor['editorialIntent']>,
): string | undefined {
  if (intent.visualEvents.length === 0) return undefined;

  const eventFragments = intent.visualEvents.map((event) => [
    `Visual job: ${event.audienceJob}.`,
    `Meaning to make legible: ${event.visualThesis}.`,
    `Relationship to narration: ${event.audioRelationship}.`,
    `Narrative timing: ${event.timingNote}.`,
    ...(event.continuityNotes.length > 0
      ? [`Continuity requirements: ${event.continuityNotes.join(' ')}`]
      : []),
    ...(event.brandConstraints.length > 0
      ? [`Brand constraints: ${event.brandConstraints.join(' ')}`]
      : []),
    ...(event.accessibilityRequirements.length > 0
      ? [`Accessibility requirements: ${event.accessibilityRequirements.join(' ')}`]
      : []),
  ].join(' '));

  return [
    `Editorial intent for this scene: ${intent.narrativePurpose}.`,
    ...eventFragments,
  ].join(' ');
}

/**
 * Build an image generation prompt for a storyboard scene.
 * Produces a STILL IMAGE prompt — no camera movement, no motion.
 *
 * Slot order follows §2.5 of creative-production-knowledge-v2:
 *   1. ENVIRONMENT + LIGHTING
 *   2. SUBJECT + STATE
 *   3. COMPOSITION
 *   4. CAMERA BEHAVIOR   (still image — omitted; reserved slot)
 *   5. LENS + DEPTH
 *   6. MOOD + AESTHETIC
 *   7. TECHNICAL QUALITY
 *   8. NEGATIVE PROMPT   (see buildNegativePrompt)
 *
 * @param cinemaSettings - Explicit cinema hardware settings (camera, lens, focal
 *   length, aperture). When omitted, auto-derived from scene.mood + styleGuide.artStyle
 *   via getCinemaSettingsFromContent — the same derivation used by the video worker.
 *   Pass `null` to explicitly disable cinema hardware injection.
 */
export function buildStoryboardPrompt(
  scene: SceneDescriptor,
  styleGuide?: StyleGuide,
  sceneIndex?: number,
  totalScenes?: number,
  cinemaSettings?: CinemaSettings | null,
): string {
  const parts: string[] = [];

  // ── SLOT 1: ENVIRONMENT + LIGHTING ──────────────────────────────────────
  // Must come first — establishes the world the subject inhabits.
  // IP-adapter consistency and lighting coherence both benefit from the
  // environment being the first thing the model processes.
  if (styleGuide?.environmentNotes) {
    parts.push(`Environment: ${styleGuide.environmentNotes}`);
  }

  // ── SLOT 2: SUBJECT + STATE ──────────────────────────────────────────────
  // Core visual description — who/what is in the scene and their state.
  // "State" (expression, posture, position) is safer than "action" for stills:
  // complex actions produce uncanny anatomy failures (§2.5 Artifact Prevention).
  if (scene.visualDescription) {
    // Clean up markdown artifacts and noise
    let cleanVisual = scene.visualDescription
      .replace(/\*{1,2}/g, '')
      .replace(/\[.*?\]\(.*?\)/g, '')
      .replace(/\d{2}:\d{2}(?::\d{2})?[-–—]\d{2}:\d{2}(?::\d{2})?\s*:?\s*/g, '')
      .replace(/#\w+/g, '')
      .replace(/\(.*?trending.*?\)/gi, '')
      .replace(/\s{2,}/g, ' ')
      .trim();

    // Strip camera movement phrases — only match explicit camera direction terms,
    // not standalone words like "follow", "track", "pan", "crane", "zoom" that
    // could be part of legitimate scene descriptions.
    // Still image — no motion; movement language confuses image models.
    cleanVisual = cleanVisual
      .replace(/\b(dolly shot|camera pan|slow zoom|tracking shot|crane shot|steadicam shot|rack focus|whip pan|push[- ]in|pull[- ]back)\b/gi, '')
      .replace(/\b(camera|shot|slow|fast)\s+(dolly|pan|tilt|zoom|track|orbit|crane|steadicam|follow|whip)\w*\b/gi, '')
      .replace(/\s{2,}/g, ' ')
      .trim();

    parts.push(cleanVisual.length > 3000 ? cleanVisual.substring(0, 3000) : cleanVisual);
  } else if (scene.narration) {
    // ONLY use narration as a last resort — extract visual hints, not the full text.
    // Narration is spoken words, NOT visual description. Using it raw produces
    // collages/multi-frame images because the model tries to depict sequential narrative.
    const visualHint = scene.narration.substring(0, 300).replace(/["\n]/g, ' ');
    parts.push(`Scene context: ${visualHint}`);
  }

  // V3 passes semantic intent, not final form. The existing Editron graph still
  // resolves composition, motion, overlays, and timeline implementation later.
  if (scene.editorialIntent) {
    const semanticIntent = buildSemanticEditorialIntentFragment(scene.editorialIntent);
    if (semanticIntent) parts.push(semanticIntent);
  }

  // Character descriptions — additional subject definition, matched by name occurrence
  if (styleGuide?.characterDescriptions) {
    const sceneText = ((scene.narration || '') + ' ' + (scene.visualDescription || '')).toLowerCase();
    for (const [name, desc] of Object.entries(styleGuide.characterDescriptions)) {
      if (sceneText.includes(name.toLowerCase())) {
        parts.push(`Character "${name}": ${desc}`);
      }
    }
  }

  // ── SLOT 3: COMPOSITION ──────────────────────────────────────────────────
  // Fix 27: Cultural visual grammar — composition varies by art style/region.
  // Bollywood → center framing, vibrant. Nordic → negative space, muted.
  // Japanese → asymmetry, ma (間). Default → rule of thirds.
  const artKey = styleGuide?.artStyle?.toLowerCase() || '';
  const culturalComposition: Record<string, string> = {
    'bollywood': 'center-framed composition, vibrant saturated colors, symmetrical staging',
    'anime': 'asymmetric composition, dynamic diagonals, dramatic perspective, manga panel energy',
    'ukiyo-e': 'asymmetric balance, deliberate negative space (間/ma), flat perspective layering',
    'nordic': 'expansive negative space, muted desaturated tones, isolated subjects, minimalist framing',
    'wes-anderson': 'perfect bilateral symmetry, centered subjects, pastel palette, planimetric framing',
    'arabic-calligraphy': 'ornate geometric framing, intricate border patterns, center-weighted composition',
  };
  const matchedComposition = Object.entries(culturalComposition).find(([key]) => artKey.includes(key));
  parts.push(matchedComposition ? matchedComposition[1] : 'rule of thirds composition, professional framing');

  // ── SLOT 4: CAMERA BEHAVIOR ──────────────────────────────────────────────
  // Reserved slot — intentionally empty for still image prompts.
  // Camera movement tokens are suppressed (see SLOT 2 cleanup above) because
  // movement language causes video-model artifacts in image generators.
  // For VIDEO prompt generation, populate this slot with movement + motivation
  // language from §2.5 Camera Movements (push-in, pan, orbit, etc.).

  // ── SLOT 5: LENS + DEPTH ─────────────────────────────────────────────────
  // Cinema hardware: camera body, lens type, focal length, aperture/DoF.
  // Placed immediately after composition because lens properties directly
  // determine how the composition reads (compression, DOF, field of view).
  // Significantly improves prompt adherence in Flux, SDXL, and Imagen models.
  //
  // Priority:
  //   1. Explicit CinemaSettings from caller (profile-aware callers, e.g. storyboard-queue)
  //   2. Auto-derived from scene.mood + styleGuide.artStyle (same as video worker)
  //   3. Disabled when cinemaSettings === null (caller opted out)
  if (cinemaSettings !== null) {
    const resolvedCinema: CinemaSettings =
      cinemaSettings ??
      getCinemaSettingsFromContent(
        (scene as any).mood ?? undefined,
        styleGuide?.artStyle ?? undefined,
      );
    const cinemaFragment = buildCinemaFragment(resolvedCinema);
    if (cinemaFragment) {
      parts.push(cinemaFragment);
    }
  }

  // ── SLOT 6: MOOD + AESTHETIC ─────────────────────────────────────────────
  // Color palette (only when non-empty) — sets the color temperature and
  // emotional register of the frame.
  if (styleGuide?.colorPalette && styleGuide.colorPalette.length > 0) {
    parts.push(styleGuide.colorPalette.join(', '));
  }

  // Art style tokens — film stock feel, rendering aesthetic, genre signature.
  // Generic boilerplate placed at the end of the mood block so the palette
  // tokens above anchor the specific color intent before the style description
  // adds its own color/look language.
  if (styleGuide) {
    const artStyleKey = styleGuide.artStyle?.toLowerCase().replace(/\s+/g, '-');
    const artStylePrompt = artStyleKey && ART_STYLE_PROMPTS[artStyleKey];
    if (artStylePrompt) {
      parts.push(artStylePrompt);
    } else if (styleGuide.artStyle) {
      parts.push(`Art style: ${styleGuide.artStyle}`);
    }
  }

  // ── SLOT 7: TECHNICAL QUALITY ────────────────────────────────────────────
  // Consistency constraints, anti-artifact tokens, and quality signals.
  // Grouped at the end so they act as a final "filter" over the creative
  // intent established in slots 1–6, not as early constraints on the world.
  parts.push('consistent lighting, no exposure variation');

  // Prevent AI from generating legible text — text is added as overlays in post
  parts.push('no visible text, no signs with legible writing, no watermarks');

  // Consistency hint for multi-scene storyboards (kept short)
  if (totalScenes && totalScenes > 1) {
    parts.push(`Scene ${(sceneIndex ?? 0) + 1}/${totalScenes}, consistent style`);
  }

  // LLM-generated quality tokens (dynamic per art style, from scene descriptor)
  const sceneAny = scene as any;
  if (sceneAny.imageQualityTokens) {
    parts.push(sceneAny.imageQualityTokens);
  }

  // ── SLOT 8: NEGATIVE PROMPT ──────────────────────────────────────────────
  // Handled separately by buildNegativePrompt() — passed to the image model
  // as a distinct negative_prompt parameter, not appended here.

  return parts.join('. ').replace(/\.\./g, '.').replace(/\s{2,}/g, ' ');
}

/**
 * Convenience wrapper — builds a storyboard prompt with EXPLICIT cinema settings.
 * Use this when the caller already has a resolved CinemaSettings object (e.g., derived
 * from an edit-profile ID in storyboard-queue-service).
 *
 * Equivalent to: buildStoryboardPrompt(scene, styleGuide, idx, total, cinemaSettings)
 */
export function buildStoryboardPromptWithCinema(
  scene: SceneDescriptor,
  cinemaSettings: CinemaSettings,
  styleGuide?: StyleGuide,
  sceneIndex?: number,
  totalScenes?: number,
): string {
  return buildStoryboardPrompt(scene, styleGuide, sceneIndex, totalScenes, cinemaSettings);
}

/**
 * Build a negative prompt from style guide (things to avoid).
 * Corresponds to §2.5 SLOT 8 — passed as a separate parameter to the image
 * model, never appended to the positive prompt built by buildStoryboardPrompt().
 */
export function buildNegativePrompt(styleGuide?: StyleGuide): string {
  const base = [
    // Core quality
    'blurry, low quality, low resolution, pixelated, distorted, deformed, disfigured',
    // Anatomy (Flux/SDXL common failures)
    'bad anatomy, extra limbs, extra fingers, fused fingers, missing fingers, merged hands',
    // Text artifacts (major Flux failure mode — generates random text)
    'watermark, text overlay, logo, subtitles, random text, letters, words on image',
    // Multi-frame/collage artifacts (Flux generates panels instead of single images)
    'duplicate subject, mirror image, perfect symmetry',
    'collage, split screen, multiple panels, grid layout, side by side, tiled',
    'comic strip, diptych, triptych, before and after, storyboard sequence',
    // Uncanny valley
    'plastic skin, mannequin-like, uncanny valley, wax figure',
    // Overprocessing (SDXL/Flux HDR tendency)
    'HDR glow, oversaturated, mobile game aesthetic',
    // Framing artifacts
    'border, frame, vignette, picture frame',
  ].join(', ');

  if (styleGuide?.negativePrompt) {
    return `${base}, ${styleGuide.negativePrompt}`;
  }
  return base;
}
