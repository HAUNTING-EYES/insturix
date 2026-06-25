import { describe, expect, it } from 'vitest';
import { parseThumbnailVisualSignals } from '../../lib/shared/brand-vault-thumbnail-visual';

describe('parseThumbnailVisualSignals', () => {
  it('parses palette + dials from clean JSON and lowercases hex', () => {
    const s = parseThumbnailVisualSignals(
      '{"primary":"#1A2B3C","accent":"#FF6600","supporting":["#FFFFFF","#000000"],"minimalism":0.8,"contrastPreference":0.9,"expressiveness":0.3}',
    );
    expect(s).not.toBeNull();
    expect(s!.palette.primary).toBe('#1a2b3c');
    expect(s!.palette.accent).toBe('#ff6600');
    expect(s!.palette.supporting).toEqual(['#ffffff', '#000000']);
    expect(s!.visual.minimalism).toBe(0.8);
    expect(s!.visual.contrastPreference).toBe(0.9);
    expect(s!.visual.expressiveness).toBe(0.3);
  });

  it('strips ```json code fences the model sometimes adds', () => {
    const s = parseThumbnailVisualSignals('```json\n{"primary":"#123456"}\n```');
    expect(s?.palette.primary).toBe('#123456');
  });

  it('drops invalid hex and clamps out-of-range dials', () => {
    const s = parseThumbnailVisualSignals(
      '{"primary":"red","accent":"#GGGGGG","minimalism":1.7,"contrastPreference":-0.4}',
    );
    expect(s?.palette.primary).toBeUndefined();
    expect(s?.palette.accent).toBeUndefined();
    expect(s?.visual.minimalism).toBe(1);
    expect(s?.visual.contrastPreference).toBe(0);
  });

  it('dedupes supporting, excludes primary/accent, caps at 3', () => {
    const s = parseThumbnailVisualSignals(
      '{"primary":"#111111","supporting":["#111111","#222222","#222222","#333333","#444444","#555555"]}',
    );
    expect(s?.palette.supporting).toEqual(['#222222', '#333333', '#444444']);
  });

  it('returns null on garbage, empty object, or missing input', () => {
    expect(parseThumbnailVisualSignals('not json')).toBeNull();
    expect(parseThumbnailVisualSignals('{}')).toBeNull();
    expect(parseThumbnailVisualSignals('[1,2,3]')).toBeNull();
    expect(parseThumbnailVisualSignals(undefined)).toBeNull();
  });
});
