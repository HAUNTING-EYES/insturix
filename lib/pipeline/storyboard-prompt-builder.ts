/**
 * Storyboard Prompt Builder
 *
 * Builds image-generation prompts from scene descriptors + style guide.
 * Designed for visual consistency across all storyboard frames.
 */

import type { SceneDescriptor } from './schemas/storyboard';
import type { StyleGuide } from './schemas/storyboard';

/** Map art-style identifiers to descriptive prompt tokens. */
const ART_STYLE_PROMPTS: Record<string, string> = {
  cinematic: 'cinematic film still, dramatic lighting, shallow depth of field, 35mm film look',
  photorealistic: 'photorealistic, ultra-detailed, DSLR photo, natural lighting',
  documentary: 'documentary photography, raw authentic look, natural light, grainy film texture',
  noir: 'film noir style, high contrast black and white, dramatic shadows, moody atmosphere',
  anime: 'anime illustration, manga art style, vibrant colors, detailed linework',
  cartoon: 'cartoon illustration, bold outlines, bright saturated colors, stylized characters',
  'comic-book': 'comic book art, graphic novel style, ink outlines, halftone dots, dynamic angles',
  'pixel-art': 'pixel art, retro 16-bit game aesthetic, clean pixel edges, limited palette',
  watercolor: 'watercolor painting, soft washes, organic textures, flowing pigments',
  'oil-painting': 'oil painting, rich impasto textures, classical composition, museum quality',
  sketch: 'pencil sketch, detailed linework, cross-hatching, hand-drawn illustration',
  'pop-art': 'pop art style, bold primary colors, Ben-Day dots, Roy Lichtenstein inspired',
  cyberpunk: 'cyberpunk aesthetic, neon glow, rain-slicked streets, holographic displays, dystopian',
  fantasy: 'fantasy concept art, epic composition, magical atmosphere, detailed world-building',
  horror: 'dark horror atmosphere, unsettling composition, eerie lighting, ominous shadows',
  '3d-render': '3D rendered, Octane render, volumetric lighting, subsurface scattering',
  isometric: 'isometric view, clean 3D illustration, flat shading, architectural precision',
  minimalist: 'minimalist design, flat illustration, clean lines, limited color palette, modern',
  collage: 'mixed media collage, layered textures, cut-paper aesthetic, eclectic composition',
  // Extended styles
  vaporwave: 'vaporwave aesthetic, retrowave, pastel neon colors, glitch art, 80s nostalgia, synthwave',
  steampunk: 'steampunk style, Victorian-era machinery, brass gears, copper pipes, industrial Gothic',
  gothic: 'dark Gothic art, cathedral architecture, ornate details, deep shadows, stained glass',
  'art-deco': 'Art Deco style, geometric patterns, gold and black, 1920s glamour, Gatsby-era elegance',
  surrealism: 'surrealist painting, dreamlike imagery, Salvador Dalí inspired, impossible geometry, melting forms',
  expressionism: 'German expressionism, distorted perspectives, bold angular shapes, intense emotion',
  'lo-fi': 'lo-fi aesthetic, warm grain, soft focus, cozy atmosphere, muted earth tones, nostalgic',
  grunge: 'grunge texture, gritty urban decay, distressed surfaces, raw underground aesthetic',
  pastel: 'soft pastel colors, dreamy atmosphere, gentle gradients, ethereal and delicate',
  'neon-noir': 'neon noir, rain-soaked streets, vibrant neon signs, dark urban atmosphere, Blade Runner inspired',
  vintage: 'vintage retro, faded film photography, warm color cast, 70s nostalgic tones, analog grain',
  ukiyo: 'ukiyo-e Japanese woodblock print, flat perspective, flowing lines, traditional Japanese art',
  'concept-art': 'concept art, entertainment design, matte painting, professional illustration, art station trending',
  claymation: 'claymation style, stop-motion clay figures, handmade texture, playful 3D, Wallace and Gromit aesthetic',
  storybook: 'children\'s storybook illustration, whimsical, warm and inviting, detailed hand-drawn, fairy tale',
  brutalist: 'brutalist design, raw concrete, stark geometry, industrial minimalism, monochromatic',
  'glitch-art': 'glitch art, data corruption aesthetic, pixel sorting, digital artifacts, VHS distortion',
  impressionist: 'impressionist painting, visible brushstrokes, light and movement, Monet-inspired, plein air',
};

/**
 * Build an image generation prompt for a storyboard scene.
 * Injects style guide tokens for cross-scene consistency.
 */
export function buildStoryboardPrompt(
  scene: SceneDescriptor,
  styleGuide?: StyleGuide,
  sceneIndex?: number,
  totalScenes?: number,
): string {
  const parts: string[] = [];

  // Scene title for context
  if (scene.title) {
    parts.push(`Scene: "${scene.title}"`);
  }

  // Core visual description — this is the most important part for accuracy
  if (scene.visualDescription) {
    // Clean up markdown artifacts, sub-timestamps, hashtags, and noise
    const cleanVisual = scene.visualDescription
      .replace(/\*{1,2}/g, '')                          // markdown bold/italic
      .replace(/\[.*?\]\(.*?\)/g, '')                    // markdown links
      .replace(/\d{2}:\d{2}(?::\d{2})?[-–—]\d{2}:\d{2}(?::\d{2})?\s*:?\s*/g, '')  // sub-timestamps
      .replace(/#\w+/g, '')                              // hashtags
      .replace(/\(.*?trending.*?\)/gi, '')               // social media references
      .replace(/\s{2,}/g, ' ')                           // collapse whitespace
      .trim();
    // Summarize if too long — image models work best with focused prompts
    if (cleanVisual.length > 500) {
      parts.push(cleanVisual.substring(0, 500));
    } else {
      parts.push(cleanVisual);
    }
  } else if (scene.narration) {
    parts.push(`Visual scene depicting: ${scene.narration.substring(0, 200)}`);
  }

  // Camera direction
  if (scene.cameraDirection) {
    parts.push(`Camera: ${scene.cameraDirection}`);
  }

  // Mood
  if (scene.mood && scene.mood !== 'neutral') {
    parts.push(`Mood: ${scene.mood}`);
  }

  // Style guide injection for consistency
  if (styleGuide) {
    // Use detailed art style prompt instead of just the label
    const artStyleKey = styleGuide.artStyle?.toLowerCase().replace(/\s+/g, '-');
    const artStylePrompt = artStyleKey && ART_STYLE_PROMPTS[artStyleKey];
    if (artStylePrompt) {
      parts.push(artStylePrompt);
    } else if (styleGuide.artStyle) {
      parts.push(`Art style: ${styleGuide.artStyle}`);
    }

    if (styleGuide.colorPalette && styleGuide.colorPalette.length > 0) {
      parts.push(`Color palette: ${styleGuide.colorPalette.join(', ')}`);
    }
    if (styleGuide.characterDescriptions) {
      // Inject character descriptions relevant to this scene
      const sceneText = ((scene.narration || '') + ' ' + (scene.visualDescription || '')).toLowerCase();
      for (const [name, desc] of Object.entries(styleGuide.characterDescriptions)) {
        if (sceneText.includes(name.toLowerCase())) {
          parts.push(`Character "${name}": ${desc}`);
        }
      }
    }
    if (styleGuide.environmentNotes) {
      parts.push(`Environment: ${styleGuide.environmentNotes}`);
    }
  }

  // Consistency hint
  if (totalScenes && totalScenes > 1) {
    parts.push(
      `This is scene ${(sceneIndex ?? 0) + 1} of ${totalScenes}. Maintain consistent visual style, lighting, and character appearance across all scenes.`,
    );
  }

  // Quality markers
  parts.push('High quality, professional composition, masterful lighting');

  const prompt = parts.join('. ').replace(/\.\./g, '.');

  return prompt;
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
