import { describe, expect, it } from 'vitest';
import { resolveAtomicCaptionPresentation } from '@/lib/editron/services/caption-form';

describe('resolveAtomicCaptionPresentation', () => {
  it('lets signals choose high-energy caption form when the style hint is generic', () => {
    const form = resolveAtomicCaptionPresentation({
      requestedStyle: 'fancy',
      profileStyle: 'subtitle',
      genreParams: {
        formality: 0.28,
        energy_baseline: 0.86,
        pacing_tolerance: 4,
      },
    });

    expect(form.version).toBe('atomic-caption-form-v1');
    expect(form.source).toBe('signals');
    expect(form.style).toBe('hormozi');
    expect(form.displayMode).toBe('hormozi');
    expect(form.wordsPerGroup).toBe(3);
  });

  it('preserves explicit display mode atoms while still resolving style from signals', () => {
    const form = resolveAtomicCaptionPresentation({
      displayMode: 'word-by-word',
      genreParams: {
        formality: 0.65,
        energy_baseline: 0.3,
        pacing_tolerance: 8,
      },
    });

    expect(form.style).toBe('minimal');
    expect(form.displayMode).toBe('word-by-word');
    expect(form.wordsPerGroup).toBe(1);
  });

  it('demotes weak style hints below signal-selected display form', () => {
    const form = resolveAtomicCaptionPresentation({
      requestedStyle: 'word_by_word',
      genreParams: {
        formality: 0.7,
        energy_baseline: 0.45,
        pacing_tolerance: 8,
      },
    });

    expect(form.source).toBe('signals');
    expect(form.style).toBe('minimal');
    expect(form.displayMode).toBe('karaoke');
    expect(form.wordsPerGroup).toBe(6);
    expect(form.aesthetic).toEqual(expect.objectContaining({
      layout: 'balanced-lower',
      surface: 'transparent-shadow',
      maxWidthPx: 1120,
      maxHeightPx: 128,
      fontSizePx: 38,
    }));
  });

  it('keeps strong brand caption styles as compatibility hints', () => {
    const form = resolveAtomicCaptionPresentation({
      requestedStyle: 'mrbeast',
      genreParams: {
        formality: 0.8,
        energy_baseline: 0.2,
        pacing_tolerance: 9,
      },
    });

    expect(form.source).toBe('strong-style-hint');
    expect(form.style).toBe('mrbeast');
    expect(form.displayMode).toBe('subtitle');
    expect(form.aesthetic.surface).toBe('subtitle-panel');
  });
});
