/**
 * Scene-to-Editron Converter
 *
 * Converts SceneDescriptor arrays into Editron overlay arrays,
 * creating a timeline-ready project structure.
 */

import type { SceneDescriptor } from './schemas/storyboard';

interface EditronConvertOptions {
  fps: number;
  width: number;
  height: number;
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
 *  1. An HtmlSceneOverlay as placeholder background (gradient based on mood)
 *  2. A TextOverlay with narration positioned as lower-third caption
 *  3. A TextOverlay with scene title (top center, first 2 seconds)
 */
export function scenesToOverlays(
  scenes: SceneDescriptor[],
  options: EditronConvertOptions,
): any[] {
  overlayIdCounter = 1; // reset for deterministic IDs
  const { fps, width, height } = options;
  const overlays: any[] = [];
  let currentFrame = 0;

  for (const scene of scenes) {
    const durationFrames = Math.round(scene.durationSeconds * fps);
    const gradient = MOOD_GRADIENTS[scene.mood] || MOOD_GRADIENTS.neutral;

    // 1. Placeholder background (HTML scene overlay)
    const bgHtml = `<div style="width:100%;height:100%;background:linear-gradient(135deg,${gradient.from},${gradient.to});display:flex;align-items:center;justify-content:center;"><span style="color:rgba(255,255,255,0.15);font-size:48px;font-family:sans-serif;">Scene ${scene.sceneIndex + 1}</span></div>`;

    overlays.push({
      id: nextId(),
      type: 'html-scene',
      from: currentFrame,
      durationInFrames: durationFrames,
      row: 2, // behind text layers
      width,
      height,
      x: 0,
      y: 0,
      htmlContent: bgHtml,
      name: `BG: ${scene.title}`,
      styles: { opacity: 1 },
    });

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
      // Truncate for display — captions will be proper later
      const displayText =
        scene.narration.length > 120 ? scene.narration.substring(0, 117) + '...' : scene.narration;

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
