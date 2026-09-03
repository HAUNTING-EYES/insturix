/**
 * §17 Phase 5 storyboard planning (pure): turn free text into pipeline
 * SceneDescriptors — or say the beats are missing. Same honesty rule as
 * carousels: scene copy comes from the USER; a storyboard ask without
 * per-scene beats asks for them.
 */

export interface PlannedScene {
  sceneIndex: number;
  narration: string;
  visualDescription: string;
  /** technical default (a beat length), not authored copy */
  durationSeconds: number;
}

export const STORYBOARD_MIN_SCENES = 2;
export const STORYBOARD_MAX_SCENES = 20;
const DEFAULT_BEAT_SECONDS = 4;

const SCENE_LINE = /(?:^|\n)\s*(?:scene\s*)?#?\s*(\d{1,2})\s*[.:)\-—]\s*([^\n]+)/gi;

export function storyboardIntent(text: string): boolean {
  return /\bstoryboard\w*\b/i.test(text);
}

export type StoryboardPlan = { scenes: PlannedScene[] } | { need: "scene_beats" };

export function planStoryboardScenes(text: string): StoryboardPlan {
  const seen = new Map<number, string>();
  for (const m of text.matchAll(SCENE_LINE)) {
    const index = Number(m[1]);
    const body = m[2].trim();
    if (!Number.isInteger(index) || index < 1 || index > STORYBOARD_MAX_SCENES || body.length < 3) continue;
    seen.set(index, body);
  }
  const ordered = [...seen.entries()].sort((a, b) => a[0] - b[0]).slice(0, STORYBOARD_MAX_SCENES);
  const scenes = ordered.map(([index, body], i) => ({
    sceneIndex: i,
    narration: body,
    visualDescription: body,
    durationSeconds: DEFAULT_BEAT_SECONDS,
  }));
  if (scenes.length >= STORYBOARD_MIN_SCENES) return { scenes };
  return { need: "scene_beats" };
}
