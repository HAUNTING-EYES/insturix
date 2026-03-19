/**
 * Scene-to-Editron Converter
 *
 * Converts SceneDescriptor arrays into Editron overlay arrays,
 * creating a timeline-ready project structure.
 *
 * Supports optional storyboard images — when provided, scenes get
 * image overlays instead of plain gradient backgrounds.
 */

import type { SceneDescriptor } from './schemas/storyboard';

interface EditronConvertOptions {
  fps: number;
  width: number;
  height: number;
}

export interface StoryboardImage {
  sceneIndex: number;
  imageUrl: string;
}

// Background gradient presets based on mood
const MOOD_GRADIENTS: Record<string, { from: string; to: string }> = {
  energetic: { from: '#ff6b35', to: '#f72585' },
  calm: { from: '#1a535c', to: '#4ecdc4' },
  serious: { from: '#1a1a2e', to: '#16213e' },
  playful: { from: '#7209b7', to: '#f72585' },
  somber: { from: '#2d3436', to: '#636e72' },
  neutral: { from: '#0f0c29', to: '#302b63' },
};

let overlayIdCounter = 1;

function nextId(): number {
  return overlayIdCounter++;
}

/**
 * Convert scenes into Editron overlays for a ready-to-edit project.
 *
 * For each scene creates:
 *  1. A background layer — storyboard image (if provided) OR gradient placeholder
 *  2. A TextOverlay with scene title (top center, first 2 seconds)
 *  3. A TextOverlay with narration positioned as lower-third caption
 *
 * @param scenes         Scene descriptors from script parser
 * @param options        FPS, width, height
 * @param storyboardImages  Optional array of storyboard images to place on timeline
 */
export function scenesToOverlays(
  scenes: SceneDescriptor[],
  options: EditronConvertOptions,
  storyboardImages?: StoryboardImage[],
): any[] {
  overlayIdCounter = 1; // reset for deterministic IDs
  const { fps, width, height } = options;
  const overlays: any[] = [];
  let currentFrame = 0;

  // Build a lookup map for storyboard images by scene index
  const imageMap = new Map<number, string>();
  if (storyboardImages) {
    for (const img of storyboardImages) {
      imageMap.set(img.sceneIndex, img.imageUrl);
    }
  }

  for (const scene of scenes) {
    const durationFrames = Math.round(scene.durationSeconds * fps);
    const imageUrl = imageMap.get(scene.sceneIndex);

    if (imageUrl) {
      // 1a. Storyboard image as background
      overlays.push({
        id: nextId(),
        type: 'image',
        from: currentFrame,
        durationInFrames: durationFrames,
        row: 2,
        width,
        height,
        x: 0,
        y: 0,
        src: imageUrl,
        name: `BG: ${scene.title}`,
        styles: { opacity: 1, objectFit: 'cover' },
      });
    } else {
      // 1b. Placeholder background (HTML scene overlay with gradient)
      const gradient = MOOD_GRADIENTS[scene.mood] || MOOD_GRADIENTS.neutral;
      const bgHtml = `<div style="width:100%;height:100%;background:linear-gradient(135deg,${gradient.from},${gradient.to});display:flex;align-items:center;justify-content:center;"><span style="color:rgba(255,255,255,0.15);font-size:48px;font-family:sans-serif;">Scene ${scene.sceneIndex + 1}</span></div>`;

      overlays.push({
        id: nextId(),
        type: 'html-scene',
        from: currentFrame,
        durationInFrames: durationFrames,
        row: 2,
        width,
        height,
        x: 0,
        y: 0,
        htmlContent: bgHtml,
        name: `BG: ${scene.title}`,
        styles: { opacity: 1 },
      });
    }

    // 2. Scene title (top center, first 2 seconds of scene)
    const titleDuration = Math.min(Math.round(2 * fps), durationFrames);
    overlays.push({
      id: nextId(),
      type: 'text',
      from: currentFrame,
      durationInFrames: titleDuration,
      row: 0,
      content: scene.title,
      x: width / 2,
      y: Math.round(height * 0.12),
      width: Math.round(width * 0.8),
      height: 80,
      styles: {
        fontSize: 56,
        fontFamily: 'font-league-spartan',
        color: '#FFFFFF',
        textAlign: 'center',
        animation: 'fade',
      },
      name: `Title: ${scene.title}`,
    });

    // 3. Narration text (lower-third, full scene duration)
    if (scene.narration) {
      // For captions: split into chunks that fit on screen (~15 words each)
      const words = scene.narration.split(/\s+/).filter(Boolean);
      const WORDS_PER_CHUNK = 15;
      const chunks: string[] = [];
      for (let i = 0; i < words.length; i += WORDS_PER_CHUNK) {
        chunks.push(words.slice(i, i + WORDS_PER_CHUNK).join(' '));
      }

      if (chunks.length <= 1) {
        // Single caption for short narration
        const displayText =
          scene.narration.length > 140 ? scene.narration.substring(0, 137) + '...' : scene.narration;

        overlays.push({
          id: nextId(),
          type: 'text',
          from: currentFrame,
          durationInFrames: durationFrames,
          row: 1,
          content: displayText,
          x: width / 2,
          y: Math.round(height * 0.82),
          width: Math.round(width * 0.85),
          height: 60,
          styles: {
            fontSize: 28,
            fontFamily: 'font-sans',
            color: '#FFFFFFDD',
            textAlign: 'center',
            animation: 'fade',
          },
          name: `Narration: Scene ${scene.sceneIndex + 1}`,
        });
      } else {
        // Multiple timed caption chunks across the scene duration
        const framesPerChunk = Math.max(1, Math.floor(durationFrames / chunks.length));
        chunks.forEach((chunk, ci) => {
          overlays.push({
            id: nextId(),
            type: 'text',
            from: currentFrame + ci * framesPerChunk,
            durationInFrames: ci === chunks.length - 1
              ? durationFrames - ci * framesPerChunk
              : framesPerChunk,
            row: 1,
            content: chunk,
            x: width / 2,
            y: Math.round(height * 0.82),
            width: Math.round(width * 0.85),
            height: 60,
            styles: {
              fontSize: 28,
              fontFamily: 'font-sans',
              color: '#FFFFFFDD',
              textAlign: 'center',
              animation: 'fade',
            },
            name: `Caption ${ci + 1}: Scene ${scene.sceneIndex + 1}`,
          });
        });
      }
    }

    currentFrame += durationFrames;
  }

  return overlays;
}

/**
 * Calculate total duration in frames from a scenes array.
 */
export function scenesToTotalFrames(scenes: SceneDescriptor[], fps: number): number {
  return scenes.reduce((sum, s) => sum + Math.round(s.durationSeconds * fps), 0);
}
