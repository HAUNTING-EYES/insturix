import { describe, expect, it } from 'vitest';

import { KNOB_CASES } from '@/lib/thinkforge/intake/knob-parser-cases';
import { aggregateKnobEval, scoreKnobCases, tallyCase } from '@/lib/thinkforge/intake/knob-parser-eval';
import {
  buildKnobParserPrompt,
  parseKnobResponse,
  parsePromptKnobs,
  type RequestedKnobs,
} from '@/lib/thinkforge/intake/prompt-knob-parser';

describe('buildKnobParserPrompt', () => {
  it('has the required XML sections with data (the request) LAST', () => {
    const p = buildKnobParserPrompt('a 30s tiktok');
    for (const tag of ['<role>', '<rules>', '<output_format>', '<user_request>']) {
      expect(p).toContain(tag);
    }
    expect(p.indexOf('<user_request>')).toBeGreaterThan(p.indexOf('<output_format>'));
  });

  it('states the conservative rule and embeds the user request verbatim', () => {
    const p = buildKnobParserPrompt('make it snappy');
    expect(p).toMatch(/OMIT|LEAVE IT OUT|omit/);
    expect(p).toContain('make it snappy');
  });

  it('lists the valid platform enum values (not "unspecified")', () => {
    const p = buildKnobParserPrompt('x');
    expect(p).toContain('tiktok');
    expect(p).toContain('youtube-shorts');
    expect(p).not.toContain('unspecified');
  });
});

describe('parseKnobResponse - happy path', () => {
  it('extracts a fully-specified object', () => {
    const r = parseKnobResponse('{"platform":"tiktok","targetDurationSec":30,"aspectRatio":"9:16","count":2}');
    expect(r).toEqual({ platform: 'tiktok', targetDurationSec: 30, aspectRatio: '9:16', count: 2 });
  });

  it('strips a ```json fence', () => {
    const r = parseKnobResponse('```json\n{"platform":"youtube"}\n```');
    expect(r).toEqual({ platform: 'youtube' });
  });

  it('normalizes + dedupes + lowercases language lists', () => {
    const r = parseKnobResponse('{"voiceLanguages":["HI"," hi ","en"],"captionLanguages":["EN"]}');
    expect(r.voiceLanguages).toEqual(['hi', 'en']);
    expect(r.captionLanguages).toEqual(['en']);
  });
});

describe('parseKnobResponse - conservative / never-throws (the safety net)', () => {
  it('empty object stays empty (nothing hallucinated)', () => {
    expect(parseKnobResponse('{}')).toEqual({});
  });

  it('malformed JSON -> {} (never throws)', () => {
    expect(parseKnobResponse('not json at all')).toEqual({});
    expect(parseKnobResponse('')).toEqual({});
    expect(parseKnobResponse('{"platform":')).toEqual({});
  });

  it('a JSON array or primitive -> {}', () => {
    expect(parseKnobResponse('[1,2,3]')).toEqual({});
    expect(parseKnobResponse('42')).toEqual({});
    expect(parseKnobResponse('null')).toEqual({});
  });

  it('drops an invalid platform value', () => {
    expect(parseKnobResponse('{"platform":"snapchat"}')).toEqual({});
    expect(parseKnobResponse('{"platform":"unspecified"}')).toEqual({});
  });

  it('drops an invalid aspect ratio', () => {
    expect(parseKnobResponse('{"aspectRatio":"3:2"}')).toEqual({});
  });

  it('drops non-positive / non-finite / non-number duration', () => {
    expect(parseKnobResponse('{"targetDurationSec":0}')).toEqual({});
    expect(parseKnobResponse('{"targetDurationSec":-5}')).toEqual({});
    expect(parseKnobResponse('{"targetDurationSec":"30"}')).toEqual({});
  });

  it('coerces count to a positive int, drops 0/negative/NaN (does NOT default to 1)', () => {
    expect(parseKnobResponse('{"count":2.7}')).toEqual({ count: 2 });
    expect(parseKnobResponse('{"count":0}')).toEqual({});
    expect(parseKnobResponse('{"count":-1}')).toEqual({});
    expect(parseKnobResponse('{"count":"two"}')).toEqual({});
  });

  it('ignores unknown keys and never emits intent/style', () => {
    const r = parseKnobResponse('{"platform":"tiktok","intent":"punchy","style":{"x":1},"foo":9}');
    expect(r).toEqual({ platform: 'tiktok' });
    expect('intent' in r).toBe(false);
    expect('style' in r).toBe(false);
  });

  it('drops empty language/deliverable lists', () => {
    expect(parseKnobResponse('{"voiceLanguages":[],"deliverables":["  "]}')).toEqual({});
  });
});

describe('parsePromptKnobs - impure edge with injected llm', () => {
  const echo = (payload: string) => async () => payload;

  it('returns parsed knobs from the llm response', async () => {
    const r = await parsePromptKnobs('a 20s tiktok', echo('{"platform":"tiktok","targetDurationSec":20}'));
    expect(r).toEqual({ platform: 'tiktok', targetDurationSec: 20 });
  });

  it('blank prompt -> {} without calling the llm', async () => {
    let called = false;
    const spy = async () => {
      called = true;
      return '{"platform":"tiktok"}';
    };
    expect(await parsePromptKnobs('   ', spy)).toEqual({});
    expect(called).toBe(false);
  });

  it('llm throwing -> {} (never throws, safe fallback)', async () => {
    const boom = async () => {
      throw new Error('model down');
    };
    expect(await parsePromptKnobs('a 20s tiktok', boom)).toEqual({});
  });
});

describe('knob-parser-eval scorer', () => {
  it('a perfect match scores precision/recall 1 and zero hallucinations', () => {
    const expected: RequestedKnobs = { platform: 'tiktok', targetDurationSec: 30 };
    const report = scoreKnobCases([{ produced: { ...expected }, expected }]);
    expect(report.totalHallucinations).toBe(0);
    expect(report.cleanCaseRate).toBe(1);
    expect(report.perField.platform.precision).toBe(1);
    expect(report.perField.platform.recall).toBe(1);
  });

  it('an invented knob counts as a hallucination (fp), tanking precision', () => {
    const t = tallyCase({ platform: 'tiktok' }, {});
    expect(t.platform.falsePositive).toBe(true);
    const report = aggregateKnobEval([t]);
    expect(report.totalHallucinations).toBe(1);
    expect(report.cleanCaseRate).toBe(0);
    expect(report.perField.platform.precision).toBe(0);
  });

  it('a miss is a false negative (recall drops) but NOT a hallucination', () => {
    const t = tallyCase({}, { platform: 'youtube' });
    expect(t.platform.falseNegative).toBe(true);
    expect(t.platform.falsePositive).toBe(false);
    const report = aggregateKnobEval([t]);
    expect(report.totalHallucinations).toBe(0);
    expect(report.perField.platform.recall).toBe(0);
  });

  it('wrong value (right field) is BOTH a false positive and false negative', () => {
    const t = tallyCase({ platform: 'tiktok' }, { platform: 'youtube' });
    expect(t.platform.truePositive).toBe(false);
    expect(t.platform.falsePositive).toBe(true);
    expect(t.platform.falseNegative).toBe(true);
  });

  it('array fields compare order-independently', () => {
    const t = tallyCase({ voiceLanguages: ['en', 'hi'] }, { voiceLanguages: ['hi', 'en'] });
    expect(t.voiceLanguages.truePositive).toBe(true);
  });
});

describe('cases fixture integrity', () => {
  it('has unique ids and is weighted toward hallucination traps', () => {
    const ids = KNOB_CASES.map((c) => c.id);
    expect(new Set(ids).size).toBe(ids.length);
    const emptyExpected = KNOB_CASES.filter((c) => Object.keys(c.expected).length === 0).length;
    expect(emptyExpected).toBeGreaterThanOrEqual(3);
  });
});
