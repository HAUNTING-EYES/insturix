import { describe, expect, it } from 'vitest';
import { parseVisualExtraction } from '@/lib/editron/reference-video/extract-visual-fingerprint';

describe('parseVisualExtraction', () => {
  it('maps a full valid response, dropping invalid fields', () => {
    const json = JSON.stringify({
      treatment: { saturate: 1.3, contrast: 1.1, bogus: 5 },
      typography: { textCase: 'upper', reveal: 'pop', position: 'center' },
      structure: { slots: [{ role: 'hook', startMs: 0, endMs: 3000 }, { role: 'bad' }] },
      graphics: { classes: ['kinetic-type', 5], density: 'heavy' },
      performance: { shotScales: ['mcu', 'zzz'], subjectPosition: 'center', cameraMotion: 'push_in' },
      decisionStream: [
        { family: 'zoom_punch', tMs: 1500, confidence: 0.8 },
        { family: 'not_a_family', tMs: 2000 }, // invalid family → dropped
        { family: 'sfx_impact' }, // missing tMs → dropped
      ],
    });

    const out = parseVisualExtraction(json);

    expect(out.treatment).toEqual({ saturate: 1.3, contrast: 1.1 }); // bogus (unknown key) dropped
    expect(out.typography).toEqual({ textCase: 'upper', reveal: 'pop', position: 'center' });
    expect(out.structure).toEqual({ slots: [{ role: 'hook', startMs: 0, endMs: 3000 }] }); // malformed slot dropped
    expect(out.graphics).toEqual({ classes: ['kinetic-type'], density: 'heavy' }); // non-string class dropped
    expect(out.performance).toEqual({ shotScales: ['mcu'], subjectPosition: 'center', cameraMotion: 'push_in' }); // 'zzz' dropped
    expect(out.decisionStream).toHaveLength(1);
    expect(out.decisionStream![0]).toEqual({
      family: 'zoom_punch',
      anchor: { kind: 'none', tMs: 1500 },
      params: {},
      confidence: 0.8,
    });
  });

  it('drops invalid enums and returns {} for non-JSON', () => {
    expect(parseVisualExtraction('no json here')).toEqual({});
    expect(parseVisualExtraction(JSON.stringify({ typography: { textCase: 'random' } })).typography).toBeUndefined();
  });

  it('extracts JSON embedded in markdown fences', () => {
    const out = parseVisualExtraction('```json\n{"graphics":{"classes":["callout"],"density":"minimal"}}\n```');
    expect(out.graphics).toEqual({ classes: ['callout'], density: 'minimal' });
  });
});
