import { describe, expect, it } from 'vitest';

import { resolveSoundPlaybackRate } from '@/components/editron/editor/version-7.0.0/components/overlays/captions/sound-layer-content';

describe('sound playback-rate rendering contract', () => {
  it('preserves valid Remotion audio playback rates', () => {
    expect(resolveSoundPlaybackRate(0.75)).toBe(0.75);
    expect(resolveSoundPlaybackRate(1)).toBe(1);
    expect(resolveSoundPlaybackRate(1.35)).toBe(1.35);
    expect(resolveSoundPlaybackRate(16)).toBe(16);
  });

  it.each([undefined, null, 0, -1, Number.NaN, Number.POSITIVE_INFINITY, 16.01])(
    'protects legacy renders from invalid rate %s',
    (value) => {
      expect(resolveSoundPlaybackRate(value)).toBe(1);
    },
  );
});
