import { describe, expect, it } from 'vitest';
import { extractJsonArray } from '@/lib/calos/llm-json';

/**
 * Guards the shared LLM-array extractor used by lib/calos/{planner, trends/gemini, trends/perplexity}
 * and lib/trends. The first block pins EXISTING behaviour; the second covers the object-wrapper
 * tolerance added after observing Perplexity Sonar reply {"trends":[...]} despite "array only".
 */
describe('extractJsonArray — existing behaviour (pins the CalOS consumers)', () => {
  it('parses a bare array', () => {
    expect(extractJsonArray('[{"a":1},{"a":2}]')).toEqual([{ a: 1 }, { a: 2 }]);
  });

  it('parses an array inside a ```json fence', () => {
    expect(extractJsonArray('```json\n[{"a":1}]\n```')).toEqual([{ a: 1 }]);
  });

  it('parses an array surrounded by prose', () => {
    expect(extractJsonArray('Here you go:\n[1,2,3]\nhope that helps')).toEqual([1, 2, 3]);
  });

  it('returns [] for empty, garbage, and non-array JSON', () => {
    expect(extractJsonArray('')).toEqual([]);
    expect(extractJsonArray('no json here')).toEqual([]);
    expect(extractJsonArray('{"a":1}')).toEqual([]);
    expect(extractJsonArray('[unclosed')).toEqual([]);
  });
});

describe('extractJsonArray — object-wrapper tolerance (the Sonar fix)', () => {
  it('unwraps {"trends": [...]}', () => {
    expect(extractJsonArray('{"trends":[{"title":"x"}]}')).toEqual([{ title: 'x' }]);
  });

  it('unwraps even when the object holds MORE than one array (previously returned [])', () => {
    expect(extractJsonArray('{"trends":[{"title":"x"}],"note":[1,2]}')).toEqual([{ title: 'x' }]);
  });

  it('prefers a known wrapper key over an earlier unrelated array', () => {
    expect(extractJsonArray('{"note":[1,2],"trends":[{"title":"x"}]}')).toEqual([{ title: 'x' }]);
  });

  it('falls back to the first array-valued field when no known key matches', () => {
    expect(extractJsonArray('{"whatever":[7,8]}')).toEqual([7, 8]);
  });

  it('returns [] for an object with no array (e.g. the Sonar refusal object)', () => {
    expect(extractJsonArray('{"error":"could not verify any trends"}')).toEqual([]);
  });
});
