/**
 * Storyboard Prompt Builder
 *
 * Builds image-generation prompts from scene descriptors + style guide.
 * Designed for visual consistency across all storyboard frames.
 */

import type { SceneDescriptor } from './schemas/storyboard';
import type { StyleGuide } from './schemas/storyboard';

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

  // Core visual description
  if (scene.visualDescription) {
    parts.push(scene.visualDescription);
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
    if (styleGuide.artStyle) {
      parts.push(`Art style: ${styleGuide.artStyle}`);
    }
    if (styleGuide.colorPalette && styleGuide.colorPalette.length > 0) {
      parts.push(`Color palette: ${styleGuide.colorPalette.join(', ')}`);
    }
    if (styleGuide.characterDescriptions) {
      // Inject character descriptions relevant to this scene
      for (const [name, desc] of Object.entries(styleGuide.characterDescriptions)) {
        if (scene.narration?.toLowerCase().includes(name.toLowerCase()) ||
            scene.visualDescription?.toLowerCase().includes(name.toLowerCase())) {
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
  parts.push('High quality, cinematic composition, professional lighting');

  const prompt = parts.join('. ').replace(/\.\./g, '.');

  return prompt;
}

/**
 * Build a negative prompt from style guide (things to avoid).
 */
export function buildNegativePrompt(styleGuide?: StyleGuide): string {
  const base = 'blurry, low quality, distorted, deformed, watermark, text overlay, logo';
  if (styleGuide?.negativePrompt) {
    return `${base}, ${styleGuide.negativePrompt}`;
  }
  return base;
}
