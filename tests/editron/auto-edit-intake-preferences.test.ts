import { describe, expect, it } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';
import { buildAutoEditFromAssetPayload } from '@/components/editron/project/auto-edit-request';

describe('auto-edit intake preferences', () => {
  it('forwards every dialog preference to the from-asset request payload', () => {
    const payload = buildAutoEditFromAssetPayload({
      assetId: 'asset_pref_1',
      title: 'Preference test',
      brandId: ' brand_123 ',
      options: {
        platform: 'instagram',
        aspectRatio: '9:16',
        userIntent: '  talking-head reel with crisp captions  ',
        script: '  intro hook then proof  ',
        referenceVideoUrl: '  https://www.youtube.com/watch?v=dQw4w9WgXcQ  ',
        referenceAssetId: 'asset_ref_yt',
        editorialPreferences: {
          families: {
            captions: { mode: 'prefer', frequency: 0.8, intensity: 0.45 },
            motionGraphics: { mode: 'prefer', frequency: 1.4, intensity: -0.2 },
            transitions: { mode: 'off', frequency: 0.9, intensity: 0.9 },
          },
          pacing: { mode: 'prefer', intensity: 0.62 },
          musicPrompt: '  restrained piano, no vocals  ',
        },
      },
    });

    expect(payload).toEqual({
      assetId: 'asset_pref_1',
      title: 'Preference test',
      brandId: 'brand_123',
      platform: 'instagram',
      aspectRatio: '9:16',
      userIntent: 'talking-head reel with crisp captions',
      script: 'intro hook then proof',
      referenceVideoUrl: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
      referenceAssetId: 'asset_ref_yt',
      editorialPreferences: {
        families: {
          captions: { mode: 'prefer', frequency: 0.8, intensity: 0.45 },
          motionGraphics: { mode: 'prefer', frequency: 1, intensity: 0 },
          transitions: { mode: 'off' },
        },
        pacing: { mode: 'prefer', intensity: 0.62 },
        musicPrompt: 'restrained piano, no vocals',
      },
    });
  });

  it('keeps the settings visible by default so file selection asks for preferences', () => {
    const source = readFileSync(
      join(process.cwd(), 'components/editron/project/auto-edit-dialog.tsx'),
      'utf8',
    );
    const controlsSource = readFileSync(
      join(process.cwd(), 'components/editron/project/editorial-preference-controls.tsx'),
      'utf8',
    );

    expect(source).toContain('useState(true)');
    expect(source).toContain('Skip Preferences - Let AI Decide Everything');
    expect(source).toContain('Edit with These Settings');
    expect(source).toContain('EditorialPreferenceControls');
    expect(source).toContain('Reference video (match this style)');
    expect(source).toContain('referenceVideoUrl');
    expect(controlsSource).toContain('AI + brand');
    expect(controlsSource).toContain('Frequency');
    expect(controlsSource).toContain('Intensity');
    expect(controlsSource).not.toContain('Stats only');
    expect(controlsSource).not.toContain('Word-by-word');
  });
});
