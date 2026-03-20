/**
 * Scene-to-Editron Converter
 *
 * Converts SceneDescriptor arrays into Editron overlay arrays,
 * creating a timeline-ready project structure.
 *
 * IMPORTANT: All overlays MUST conform to Editron's BaseOverlay type which
 * requires: id, from, durationInFrames, row, left, top, width, height,
 * isDragging, rotation, type.  Text overlays need string-typed style values.
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
  /** Optional GCS asset ID — required so images survive save/load round-trips */
  assetId?: string;
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
  const imageMap = new Map<number, StoryboardImage>();
  if (storyboardImages) {
    for (const img of storyboardImages) {
      imageMap.set(img.sceneIndex, img);
    }
  }

  for (const scene of scenes) {
    const durationFrames = Math.round(scene.durationSeconds * fps);
    const sbImage = imageMap.get(scene.sceneIndex);

    if (sbImage) {
      // 1a. Storyboard image as background
      overlays.push({
        id: nextId(),
        type: 'image',
        from: currentFrame,
        durationInFrames: durationFrames,
        row: 3,
        left: 0,
        top: 0,
        width,
        height,
        isDragging: false,
        rotation: 0,
        src: sbImage.imageUrl,
        assetId: sbImage.assetId,
        styles: {
          opacity: 1,
          objectFit: 'cover',
        },
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
        row: 3,
        left: 0,
        top: 0,
        width,
        height,
        isDragging: false,
        rotation: 0,
        content: bgHtml,
        styles: {
          opacity: 1,
        },
      });
    }

    // 2. Scene title (top center, first 3 seconds of scene)
    const titleDuration = Math.min(Math.round(3 * fps), durationFrames);
    overlays.push({
      id: nextId(),
      type: 'text',
      from: currentFrame,
      durationInFrames: titleDuration,
      row: 1,
      left: Math.round(width * 0.1),
      top: Math.round(height * 0.08),
      width: Math.round(width * 0.8),
      height: Math.round(height * 0.12),
      isDragging: false,
      rotation: 0,
      content: scene.title,
      styles: {
        fontSize: '48',
        fontFamily: 'font-sans',
        fontWeight: '700',
        color: '#ffffff',
        backgroundColor: 'rgba(0,0,0,0.5)',
        fontStyle: 'normal',
        textDecoration: 'none',
        textAlign: 'center',
        textShadow: '0 2px 8px rgba(0,0,0,0.7)',
        opacity: 1,
        borderRadius: '12px',
        padding: '16px',
        animation: { enter: 'fade', exit: 'fade', duration: 15 },
      },
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

      const makeNarrationOverlay = (text: string, fromFrame: number, dur: number, label: string) => ({
        id: nextId(),
        type: 'text',
        from: fromFrame,
        durationInFrames: dur,
        row: 0,
        left: Math.round(width * 0.05),
        top: Math.round(height * 0.82),
        width: Math.round(width * 0.9),
        height: Math.round(height * 0.14),
        isDragging: false,
        rotation: 0,
        content: text,
        styles: {
          fontSize: '28',
          fontFamily: 'font-sans',
          fontWeight: '400',
          color: '#ffffff',
          backgroundColor: 'rgba(0,0,0,0.6)',
          fontStyle: 'normal',
          textDecoration: 'none',
          textAlign: 'center',
          opacity: 1,
          borderRadius: '8px',
          padding: '12px',
          animation: { enter: 'fade', exit: 'fade', duration: 10 },
        },
      });

      if (chunks.length <= 1) {
        const displayText =
          scene.narration.length > 140 ? scene.narration.substring(0, 137) + '...' : scene.narration;
        overlays.push(
          makeNarrationOverlay(displayText, currentFrame, durationFrames, `Narration: Scene ${scene.sceneIndex + 1}`),
        );
      } else {
        const framesPerChunk = Math.max(1, Math.floor(durationFrames / chunks.length));
        chunks.forEach((chunk, ci) => {
          overlays.push(
            makeNarrationOverlay(
              chunk,
              currentFrame + ci * framesPerChunk,
              ci === chunks.length - 1 ? durationFrames - ci * framesPerChunk : framesPerChunk,
              `Caption ${ci + 1}: Scene ${scene.sceneIndex + 1}`,
            ),
          );
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
