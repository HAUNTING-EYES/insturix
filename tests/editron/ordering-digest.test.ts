import { describe, expect, it } from 'vitest';

import {
  buildClipDigest,
  buildOrderingDigest,
  formatDigestForPrompt,
  MAX_TRANSCRIPT_CHARS,
  refToSceneIdMap,
  resolveRef,
} from '@/lib/editron/storyline/ordering-digest';
import { makeScene, type Scene, type SceneInput } from '@/lib/editron/storyline/scene';

function scene(over: Partial<SceneInput> = {}): Scene {
  return makeScene({
    source: 'a.mp4', startTime: 0, endTime: 4,
    objects: [], faces: [], detectedText: [], transcription: 'hello world',
    ...over,
  });
}

describe('buildOrderingDigest', () => {
  it('assigns c0, c1, ... labels mapped to real scene ids', () => {
    const scenes = [scene({ source: 'a' }), scene({ source: 'b' })];
    const digest = buildOrderingDigest(scenes);
    expect(digest.map((d) => d.ref)).toEqual(['c0', 'c1']);
    expect(digest[0].sceneId).toBe(scenes[0].id);
    expect(digest[1].sceneId).toBe(scenes[1].id);
  });

  it('emits ONLY signals that exist (no fabrication)', () => {
    const bare = buildClipDigest(scene({ transcription: 'x' }), 'c0');
    expect(bare.importance).toBeUndefined();
    expect(bare.visualMode).toBeUndefined();
    expect(bare.vocalArousal).toBeUndefined();

    const rich = buildClipDigest(
      scene({ importance: 0.82, visualMode: 'talking-head', vocalArousal: 0.6, vocalValence: 'positive', actionType: 'gesturing', detectedText: ['Revenue'] }),
      'c0',
    );
    expect(rich.importance).toBe(0.82);
    expect(rich.visualMode).toBe('talking-head');
    expect(rich.vocalArousal).toBe(0.6);
    expect(rich.onScreenText).toEqual(['Revenue']);
  });

  it('trims a long transcript to the token budget with an ellipsis', () => {
    const long = 'word '.repeat(200); // ~1000 chars
    const d = buildClipDigest(scene({ transcription: long }), 'c0');
    expect(d.transcript.length).toBeLessThanOrEqual(MAX_TRANSCRIPT_CHARS);
    expect(d.transcript.endsWith('…')).toBe(true);
  });

  it('★ preserves a Hinglish transcript verbatim (multilingual, not cleaned up)', () => {
    const d = buildClipDigest(scene({ transcription: 'yaar is phone ka कैमरा best hai' }), 'c0');
    expect(d.transcript).toBe('yaar is phone ka कैमरा best hai');
  });
});

describe('formatDigestForPrompt', () => {
  it('renders a compact stanza per clip: signal line, optional on-screen, transcript', () => {
    const digest = buildOrderingDigest([
      scene({ transcription: 'the hook', importance: 0.9, visualMode: 'talking-head', detectedText: ['SALE'] }),
    ]);
    const text = formatDigestForPrompt(digest);
    expect(text).toContain('[c0] 4s | importance 0.9 | talking-head');
    expect(text).toContain('on-screen: SALE');
    expect(text).toContain('transcript: the hook');
  });

  it('marks a silent clip explicitly', () => {
    const text = formatDigestForPrompt(buildOrderingDigest([scene({ transcription: '' })]));
    expect(text).toContain('transcript: (no speech)');
  });
});

describe('ref resolution', () => {
  it('resolveRef + refToSceneIdMap map labels back to scene ids', () => {
    const scenes = [scene({ source: 'a' }), scene({ source: 'b' })];
    const digest = buildOrderingDigest(scenes);
    expect(resolveRef(digest, 'c1')).toBe(scenes[1].id);
    expect(resolveRef(digest, 'nope')).toBeUndefined();
    expect(refToSceneIdMap(digest).get('c0')).toBe(scenes[0].id);
  });
});
