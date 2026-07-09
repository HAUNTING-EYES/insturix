import { describe, expect, it } from 'vitest';

import { buildSyncDataFromSignalCurves, sanitizeMotionGraphicContent } from '../../components/editron/editor/version-7.0.0/components/overlays/motion-graphic/motion-graphic-layer-content';

describe('motion graphic layer content sanitization', () => {
  it('preserves primitive arrays required by data-viz MG recipes', () => {
    const sanitized = sanitizeMotionGraphicContent({
      values: [12, 19, 31, 47],
      labels: ['Q1', 'Q2', 'Q3', 'Q4'],
      value: '47%',
      active: true,
      nested: { unsafe: true },
      mixedUnsafe: [1, { nope: true }],
      emptyArray: [],
    });

    expect(sanitized).toEqual({
      values: [12, 19, 31, 47],
      labels: ['Q1', 'Q2', 'Q3', 'Q4'],
      value: '47%',
      active: true,
    });
  });
});
describe('motion graphic layer beat sync data', () => {
  it('derives beat sync timestamps from sparse serialized beat curves', () => {
    const beatLevel = new Array(60).fill(0);
    beatLevel[2] = 0.2;
    beatLevel[3] = 0.7;
    beatLevel[4] = 0.25;
    beatLevel[30] = 0.25;

    const syncData = buildSyncDataFromSignalCurves({ beat_level: beatLevel }, 60, 30);

    expect(syncData?.beatTimesMs).toEqual([100, 1000]);
  });

  it('does not invent beat sync from constant snapshot music beat evidence', () => {
    const syncData = buildSyncDataFromSignalCurves({ music_beat: new Array(60).fill(1) }, 60, 30);

    expect(syncData).toBeUndefined();
  });
});