import { describe, expect, it } from 'vitest';

import type { ProductionBrief } from '@/lib/editron/production-brief/production-brief';
import { composeDeliverables, deliverableBriefs } from '@/lib/editron/storyline/deliverables';
import { makeScene, type Scene, type SceneInput } from '@/lib/editron/storyline/scene';

function scene(over: Partial<SceneInput> = {}): Scene {
  return makeScene({ source: 'a', startTime: 0, endTime: 6, objects: [], faces: [], detectedText: [], transcription: 'talk', ...over });
}
function base(): ProductionBrief {
  return {
    output: { platform: 'youtube', targetDurationSec: null, aspectRatio: '16:9', count: 1, format: 'auto-edit' },
    brand: null, entryPoint: 'upload', sourceDurationSec: 120,
    resolution: { fieldConfidence: {}, confirmed: [], inferred: [] },
  };
}

describe('deliverableBriefs', () => {
  it('applies each spec to the base with invariants (platform cascades aspect+duration)', () => {
    const out = deliverableBriefs(base(), [
      { platform: 'tiktok', targetDurationSec: 15 },
      { platform: 'youtube' },
    ]);
    expect(out).toHaveLength(2);
    expect(out[0].brief.output.platform).toBe('tiktok');
    expect(out[0].brief.output.aspectRatio).toBe('9:16'); // cascaded from platform
    expect(out[0].brief.output.targetDurationSec).toBe(15);
    expect(out[1].brief.output.platform).toBe('youtube');
    expect(out[1].brief.output.aspectRatio).toBe('16:9');
  });

  it('auto-derives a label from platform + duration when none is given', () => {
    const out = deliverableBriefs(base(), [{ platform: 'tiktok', targetDurationSec: 15 }, { label: 'Hero cut' }]);
    expect(out[0].label).toBe('tiktok-15s');
    expect(out[1].label).toBe('Hero cut');
  });

  it('empty specs -> a single deliverable from the base', () => {
    const out = deliverableBriefs(base(), []);
    expect(out).toHaveLength(1);
    expect(out[0].brief.output.platform).toBe('youtube');
  });
});

describe('composeDeliverables - one project, many cuts', () => {
  const scenes = [
    scene({ source: 'a', createdAt: 100 }),
    scene({ source: 'b', createdAt: 200 }),
    scene({ source: 'c', createdAt: 300 }),
  ];

  it('★ composes a vertical 15s reel AND a 16:9 full cut from the SAME scenes', () => {
    const out = composeDeliverables(scenes, base(), [
      { label: 'reel', platform: 'tiktok', targetDurationSec: 15 },
      { label: 'full', platform: 'youtube' },
    ]);
    expect(out.map((d) => d.label)).toEqual(['reel', 'full']);
    expect(out[0].storyline.renderTarget).toMatchObject({ width: 1080, height: 1920 }); // 9:16
    expect(out[0].storyline.totalDurationSec).toBeLessThanOrEqual(15);
    expect(out[1].storyline.renderTarget).toMatchObject({ width: 1920, height: 1080 }); // 16:9
    expect(out[1].storyline.totalDurationSec).toBe(18); // full: all three 6s scenes
  });

  it('empty specs -> one deliverable (the base), valid storyline', () => {
    const out = composeDeliverables(scenes, base(), []);
    expect(out).toHaveLength(1);
    expect(out[0].storyline.clips.length).toBe(3);
  });
});
