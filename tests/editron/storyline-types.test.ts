import { describe, expect, it } from 'vitest';

import { makeScene, sceneId } from '@/lib/editron/storyline/scene';
import {
  renderTargetForAspect,
  type Storyline,
  type StorylineClip,
  validateStoryline,
} from '@/lib/editron/storyline/storyline';

describe('sceneId / makeScene', () => {
  it('sceneId is deterministic and content-addressed', () => {
    expect(sceneId('a.mp4', 0, 2)).toBe(sceneId('a.mp4', 0, 2));
    expect(sceneId('a.mp4', 0, 2)).not.toBe(sceneId('a.mp4', 0, 3));
    expect(sceneId('a.mp4', 0, 2)).not.toBe(sceneId('b.mp4', 0, 2));
  });

  it('makeScene derives durationSec, hasSpeech, and a content-addressed id', () => {
    const s = makeScene({
      source: 'a.mp4', startTime: 1, endTime: 4,
      objects: [], faces: [], detectedText: [], transcription: 'hello there',
    });
    expect(s.durationSec).toBe(3);
    expect(s.hasSpeech).toBe(true);
    expect(s.id).toBe(sceneId('a.mp4', 1, 4));
  });

  it('hasSpeech is false for empty/whitespace transcription', () => {
    const s = makeScene({
      source: 'a.mp4', startTime: 0, endTime: 2,
      objects: [], faces: [], detectedText: [], transcription: '   ',
    });
    expect(s.hasSpeech).toBe(false);
  });

  it('honors an explicit id and hasSpeech override', () => {
    const s = makeScene({
      id: 'fixed', hasSpeech: true, source: 'a.mp4', startTime: 0, endTime: 2,
      objects: [], faces: [], detectedText: [], transcription: '',
    });
    expect(s.id).toBe('fixed');
    expect(s.hasSpeech).toBe(true);
  });
});

describe('renderTargetForAspect', () => {
  it('pins standard dimensions per aspect and defaults fps 30', () => {
    expect(renderTargetForAspect('16:9')).toMatchObject({ width: 1920, height: 1080, fps: 30, container: 'mp4' });
    expect(renderTargetForAspect('9:16')).toMatchObject({ width: 1080, height: 1920 });
    expect(renderTargetForAspect('1:1')).toMatchObject({ width: 1080, height: 1080 });
    expect(renderTargetForAspect('16:9', 60).fps).toBe(60);
  });
});

describe('validateStoryline', () => {
  function clip(order: number, over: Partial<StorylineClip> = {}): StorylineClip {
    return { order, sourceRef: `r${order}`, source: `s${order}`, in: 0, out: 2, durationSec: 2, role: 'body', fit: 'contain', ...over };
  }
  function story(clips: StorylineClip[], over: Partial<Storyline> = {}): Storyline {
    const totalDurationSec = clips.reduce((a, c) => a + c.durationSec, 0);
    return { clips, renderTarget: renderTargetForAspect('16:9'), totalDurationSec, condensationRatio: 1, targetDurationSec: null, ...over };
  }

  it('accepts a well-formed storyline', () => {
    expect(validateStoryline(story([clip(0), clip(1)])).valid).toBe(true);
  });

  it('an empty storyline is valid (no viable scenes is not an error)', () => {
    expect(validateStoryline(story([])).valid).toBe(true);
  });

  it('rejects non-contiguous order', () => {
    const v = validateStoryline(story([clip(0), clip(2)]));
    expect(v.valid).toBe(false);
    expect(v.issues.some((i) => i.code === 'order_not_contiguous')).toBe(true);
  });

  it('rejects out <= in (the zero-length clip Edit Mind let through)', () => {
    const v = validateStoryline(story([clip(0, { in: 5, out: 5, durationSec: 0 })]));
    expect(v.issues.some((i) => i.code === 'nonpositive_duration')).toBe(true);
  });

  it('rejects below-min-duration clips', () => {
    const v = validateStoryline(story([clip(0, { in: 0, out: 0.1, durationSec: 0.1 })]));
    expect(v.issues.some((i) => i.code === 'below_min_duration')).toBe(true);
  });

  it('rejects a missing source ref', () => {
    const v = validateStoryline(story([clip(0, { sourceRef: '', source: '' })]));
    expect(v.issues.some((i) => i.code === 'missing_source')).toBe(true);
  });

  it('rejects a total-duration mismatch', () => {
    const v = validateStoryline(story([clip(0)], { totalDurationSec: 99 }));
    expect(v.issues.some((i) => i.code === 'total_duration_mismatch')).toBe(true);
  });

  it('flags a storyline that overruns its target', () => {
    const v = validateStoryline(story([clip(0, { out: 20, durationSec: 20 })], { targetDurationSec: 5 }));
    expect(v.issues.some((i) => i.code === 'over_target')).toBe(true);
  });
});
