/**
 * Storyboard Prompt Builder
 *
 * Builds image-generation prompts from scene descriptors + style guide.
 * Designed for visual consistency across all storyboard frames.
 *
 * Image prompts describe STILL frames only — no camera movement.
 * Quality tokens are dynamic per art style, not hardcoded.
 */

import type { SceneDescriptor } from './schemas/storyboard';
import type { StyleGuide } from './schemas/storyboard';

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

/**
 * Build an image generation prompt for a storyboard scene.
 * Produces a STILL IMAGE prompt — no camera movement, no motion.
 * Quality tokens come from the LLM (scene.imageQualityTokens) when available,
 * falling back to style-mapped defaults.
 */
export function buildStoryboardPrompt(
  scene: SceneDescriptor,
  styleGuide?: StyleGuide,
  sceneIndex?: number,
  totalScenes?: number,
): string {
  const parts: string[] = [];

  // Core visual description — this is the most important part, placed FIRST
  // IP-adapter consistency depends on the visual content being prominent in the prompt.
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
    cleanVisual = cleanVisual
      .replace(/\b(dolly shot|camera pan|slow zoom|tracking shot|crane shot|steadicam shot|rack focus|whip pan|push[- ]in|pull[- ]back)\b/gi, '')
      .replace(/\b(camera|shot|slow|fast)\s+(dolly|pan|tilt|zoom|track|orbit|crane|steadicam|follow|whip)\w*\b/gi, '')
      .replace(/\s{2,}/g, ' ')
      .trim();

    if (cleanVisual.length > 3000) {
      parts.push(cleanVisual.substring(0, 3000));
    } else {
      parts.push(cleanVisual);
    }
  } else if (scene.narration) {
    parts.push(`Visual scene depicting: ${scene.narration.substring(0, 2000)}`);
  }

  // Character descriptions come second — they add specific visual detail
  if (styleGuide?.characterDescriptions) {
    const sceneText = ((scene.narration || '') + ' ' + (scene.visualDescription || '')).toLowerCase();
    for (const [name, desc] of Object.entries(styleGuide.characterDescriptions)) {
      if (sceneText.includes(name.toLowerCase())) {
        parts.push(`Character "${name}": ${desc}`);
      }
    }
  }

  // Environment notes
  if (styleGuide?.environmentNotes) {
    parts.push(`Environment: ${styleGuide.environmentNotes}`);
  }

  // Color palette (only when non-empty)
  if (styleGuide?.colorPalette && styleGuide.colorPalette.length > 0) {
    parts.push(styleGuide.colorPalette.join(', '));
  }

  // Consistency hint for multi-scene storyboards (kept short)
  if (totalScenes && totalScenes > 1) {
    parts.push(
      `Scene ${(sceneIndex ?? 0) + 1}/${totalScenes}, consistent style`,
    );
  }

  // Art style tokens — generic boilerplate, placed at the end
  if (styleGuide) {
    const artStyleKey = styleGuide.artStyle?.toLowerCase().replace(/\s+/g, '-');
    const artStylePrompt = artStyleKey && ART_STYLE_PROMPTS[artStyleKey];
    if (artStylePrompt) {
      parts.push(artStylePrompt);
    } else if (styleGuide.artStyle) {
      parts.push(`Art style: ${styleGuide.artStyle}`);
    }
  }

  // LLM-generated quality tokens (dynamic per art style) — placed at the end
  const sceneAny = scene as any;
  if (sceneAny.imageQualityTokens) {
    parts.push(sceneAny.imageQualityTokens);
  }

  return parts.join('. ').replace(/\.\./g, '.').replace(/\s{2,}/g, ' ');
}

/**
 * Build a negative prompt from style guide (things to avoid).
 */
export function buildNegativePrompt(styleGuide?: StyleGuide): string {
  const base = 'blurry, low quality, distorted, deformed, watermark, text overlay, logo, bad anatomy, extra limbs';
  if (styleGuide?.negativePrompt) {
    return `${base}, ${styleGuide.negativePrompt}`;
  }
  return base;
}
