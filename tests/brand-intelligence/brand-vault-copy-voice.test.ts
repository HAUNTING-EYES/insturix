import { describe, expect, it } from 'vitest';
import { parseCopyVoiceSignals } from '../../lib/shared/brand-vault-copy-voice';

describe('parseCopyVoiceSignals', () => {
  it('parses voice dials + phrases from clean JSON', () => {
    const s = parseCopyVoiceSignals(
      '{"formality":0.2,"assertiveness":0.8,"warmth":0.6,"jargonDensity":0.1,"humor":0.7,"ctaDirectness":0.9,"recurringPhrases":["here is the thing","let us be real"]}',
    );
    expect(s).not.toBeNull();
    expect(s!.dials.formality).toBe(0.2);
    expect(s!.dials.assertiveness).toBe(0.8);
    expect(s!.dials.ctaDirectness).toBe(0.9);
    expect(s!.recurringPhrases).toEqual(['here is the thing', 'let us be real']);
  });

  it('strips ```json fences', () => {
    const s = parseCopyVoiceSignals('```json\n{"warmth":0.5}\n```');
    expect(s?.dials.warmth).toBe(0.5);
  });

  it('clamps out-of-range dials and ignores non-numeric', () => {
    const s = parseCopyVoiceSignals('{"formality":1.9,"assertiveness":-0.5,"warmth":"hot"}');
    expect(s?.dials.formality).toBe(1);
    expect(s?.dials.assertiveness).toBe(0);
    expect(s?.dials.warmth).toBeUndefined();
  });

  it('trims, dedupes, drops over-long, and caps phrases at 5', () => {
    const long = 'x'.repeat(200);
    const s = parseCopyVoiceSignals(
      `{"recurringPhrases":["  a  ","a","b","${long}","c","d","e","f"]}`,
    );
    // 'a' deduped, over-long dropped, capped at 5
    expect(s?.recurringPhrases).toEqual(['a', 'b', 'c', 'd', 'e']);
  });

  it('returns null on garbage, empty object, array, or missing input', () => {
    expect(parseCopyVoiceSignals('not json')).toBeNull();
    expect(parseCopyVoiceSignals('{}')).toBeNull();
    expect(parseCopyVoiceSignals('[1,2]')).toBeNull();
    expect(parseCopyVoiceSignals(undefined)).toBeNull();
  });
});
