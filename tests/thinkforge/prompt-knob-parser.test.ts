import { describe, expect, it } from 'vitest';

import { buildThinkForgeEditorialPlan } from '@/lib/thinkforge/agents/editorial-plan';
import { KNOB_CASES } from '@/lib/thinkforge/intake/knob-parser-cases';
import { aggregateKnobEval, scoreKnobCases, tallyCase } from '@/lib/thinkforge/intake/knob-parser-eval';
import {
  buildKnobParserPrompt,
  buildKnobParserSystemInstruction,
  parseKnobResponse,
  parsePromptKnobs,
  parsePromptUnderstanding,
  parsePromptUnderstandingResponse,
  type RequestedKnobs,
} from '@/lib/thinkforge/intake/prompt-knob-parser';
import {
  resolveDeterministicOutputKnobs,
  resolveExplicitDurationStatement,
} from '@/lib/thinkforge/intake/explicit-output-knobs';
import { buildThinkForgeSourceLedger } from '@/lib/thinkforge/provenance/source-ledger';
import { assessScriptEvidenceSufficiency } from '@/lib/thinkforge/provenance/script-evidence-sufficiency';
import { createThinkForgeAuthoringRequest } from '@/lib/thinkforge/schemas/authoring-request';
import { createThinkForgeWriterContract } from '@/lib/thinkforge/schemas/document-contract';

const UNSPECIFIED_AUDIOVISUAL_INTENT = {
  audibleSpeech: 'unspecified',
  onCameraSpeech: 'unspecified',
  visiblePerson: 'unspecified',
  physicalCapture: 'unspecified',
} as const;

function resolvedPromptResponse(value: Record<string, unknown> = {}): string {
  return JSON.stringify({
    evidenceNarrativeIntent: 'creative',
    audiovisualIntent: UNSPECIFIED_AUDIOVISUAL_INTENT,
    ...value,
  });
}

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
    expect(p).toContain('"platform"?: tiktok | instagram-reels | youtube-shorts');
    expect(p).not.toContain('"platform"?: unspecified');
  });

  it('documents semantic self/avatar casting without forcing generic presenter requests', () => {
    const p = buildKnobParserPrompt('make me the on-camera host');
    expect(p).toContain('castingIntent');
    expect(p).toContain('accepted avatar');
    expect(p).toContain('identity');
  });

  it('keeps trusted intake policy free of named-format classification anchors', () => {
    const instruction = buildKnobParserSystemInstruction();

    for (const label of [
      'talking head',
      'product film',
      'documentary',
      'explainer',
      'brand film',
      'educational video',
      'promotional story',
      'hosted video',
      'founder style',
    ]) {
      expect(instruction.toLowerCase()).not.toContain(label);
    }
    expect(instruction).not.toMatch(/\b(?:ad|ugc)\b/i);
    expect(instruction).toContain('controlling basis');
    expect(instruction).toContain('non-authoritative metadata');
  });
});

describe('parseKnobResponse - happy path', () => {
  it('extracts a fully-specified object', () => {
    const r = parseKnobResponse('{"platform":"tiktok","targetDurationSec":30,"aspectRatio":"9:16","count":2}');
    expect(r).toEqual({ platform: 'tiktok', targetDurationSec: 30, aspectRatio: '9:16', count: 2 });
  });

  it('extracts nested requested output for the prompt-understanding shape', () => {
    const r = parseKnobResponse('{"requested":{"platform":"tiktok","targetDurationSec":30}}');
    expect(r).toEqual({ platform: 'tiktok', targetDurationSec: 30 });
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


describe('parsePromptUnderstandingResponse - semantic intake', () => {
  it('keeps output knobs and accepted self-casting intent', () => {
    const r = parsePromptUnderstandingResponse(resolvedPromptResponse({
      requested: { platform: 'youtube' },
      castingIntent: {
        requested: true,
        target: 'self',
        characterId: 'founder',
        characterName: 'Founder',
      },
    }));
    expect(r.status).toBe('resolved');
    expect(r.requested).toEqual({ platform: 'youtube' });
    expect(r.evidenceNarrativeIntent).toBe('creative');
    expect(r.castingIntent).toEqual({
      requested: true,
      target: 'self',
      characterId: 'founder',
      characterName: 'Founder',
    });
  });

  it('defaults a valid self-casting intent to the host character', () => {
    const r = parsePromptUnderstandingResponse(resolvedPromptResponse({
      castingIntent: { requested: true, target: 'self' },
    }));
    expect(r.castingIntent?.characterId).toBe('host');
    expect(r.castingIntent?.characterName).toBe('Host');
  });

  it('drops unrequested or non-self casting payloads', () => {
    expect(parsePromptUnderstandingResponse(resolvedPromptResponse({
      castingIntent: { requested: false, target: 'self' },
    })).castingIntent).toBeUndefined();
    expect(parsePromptUnderstandingResponse(resolvedPromptResponse({
      castingIntent: { requested: true, target: 'actor' },
    })).castingIntent).toBeUndefined();
  });

  it('accepts an explicit record-led treatment and marks malformed responses unavailable', () => {
    expect(parsePromptUnderstandingResponse(resolvedPromptResponse({
      evidenceNarrativeIntent: 'record_led',
    }))).toMatchObject({ status: 'resolved', evidenceNarrativeIntent: 'record_led' });
    expect(parsePromptUnderstandingResponse(resolvedPromptResponse({
      evidenceNarrativeIntent: 'unsupported',
    }))).toMatchObject({ status: 'unavailable' });
    expect(parsePromptUnderstandingResponse('not json at all'))
      .toMatchObject({ status: 'unavailable' });
  });

  it('keeps mixed audiovisual obligations independent and rejects contradictions', () => {
    const resolved = parsePromptUnderstandingResponse(resolvedPromptResponse({
      audiovisualIntent: {
        audibleSpeech: 'required',
        onCameraSpeech: 'forbidden',
        visiblePerson: 'unspecified',
        physicalCapture: 'unspecified',
      },
    }));
    expect(resolved).toMatchObject({
      status: 'resolved',
      audiovisualIntent: {
        audibleSpeech: 'required',
        onCameraSpeech: 'forbidden',
        visiblePerson: 'unspecified',
        physicalCapture: 'unspecified',
      },
    });

    const contradictory = parsePromptUnderstandingResponse(resolvedPromptResponse({
      audiovisualIntent: {
        audibleSpeech: 'forbidden',
        onCameraSpeech: 'required',
        visiblePerson: 'required',
        physicalCapture: 'unspecified',
      },
    }));
    expect(contradictory.status).toBe('unavailable');
  });

  it('does not turn a normal time-bounded brief into a record-led inquiry merely because it has factual material', () => {
    const userPrompt = 'Make a 5-minute YouTube brand film about our work. Our 2025 programme reached 91 students.';
    const authoringRequest = createThinkForgeAuthoringRequest({
      contentContract: createThinkForgeWriterContract('video_script'),
      platformSurface: { id: 'youtube' },
      publishingSurface: 'youtube_video',
      targetDurationSec: 300,
    });
    const sourceLedger = buildThinkForgeSourceLedger({ userPrompt });
    const creativePlan = buildThinkForgeEditorialPlan({
      userPrompt,
      authoringRequest,
      productionBrief: { output: { targetDurationSec: 300 } },
      sourceLedger,
      evidenceNarrativeIntent: 'creative',
    });
    const recordLedPlan = buildThinkForgeEditorialPlan({
      userPrompt,
      authoringRequest,
      productionBrief: { output: { targetDurationSec: 300 } },
      sourceLedger,
      evidenceNarrativeIntent: 'record_led',
    });

    expect(creativePlan.writerKind).toBe('script');
    expect(recordLedPlan.writerKind).toBe('script');
    if (creativePlan.writerKind !== 'script' || recordLedPlan.writerKind !== 'script') {
      throw new Error('Expected script editorial plan fixtures');
    }
    expect(creativePlan.execution.plan.evidenceNarrative).toMatchObject({
      selection: 'creative',
      mode: 'creative_without_authorized_evidence',
      sourceBoundary: 'source_only',
    });
    expect(assessScriptEvidenceSufficiency({
      editorialPlan: creativePlan.execution.plan,
      sourceLedger,
    })).toEqual({ status: 'not_applicable' });
    expect(recordLedPlan.execution.plan.evidenceNarrative).toMatchObject({
      selection: 'record_led',
      mode: 'source_bounded_inquiry',
      sourceBoundary: 'source_only',
    });
    expect(assessScriptEvidenceSufficiency({
      editorialPlan: recordLedPlan.execution.plan,
      sourceLedger,
    }).status).toBe('requires_additional_evidence');
  });

  it('turns an explicit no-speech constraint into a zero-word editorial contract', () => {
    const authoringRequest = createThinkForgeAuthoringRequest({
      contentContract: createThinkForgeWriterContract('video_script'),
      platformSurface: { id: 'youtube' },
      publishingSurface: 'youtube_video',
      targetDurationSec: 30,
    });
    const plan = buildThinkForgeEditorialPlan({
      userPrompt: 'Create a silent visual piece with no spoken words.',
      authoringRequest,
      productionBrief: { output: { targetDurationSec: 30 } },
      audiovisualIntent: {
        version: 1,
        audibleSpeech: 'forbidden',
        onCameraSpeech: 'forbidden',
        visiblePerson: 'unspecified',
        physicalCapture: 'unspecified',
      },
    });
    expect(plan.writerKind).toBe('script');
    if (plan.writerKind !== 'script') throw new Error('Expected script editorial plan fixture');
    expect(plan.execution.plan.audiovisualIntent.audibleSpeech).toBe('forbidden');
    expect(plan.execution.plan.narration).toMatchObject({
      mode: 'none',
      fullRuntimeMinimumSpokenWords: 0,
      fullRuntimeReferenceSpokenWords: 0,
      fullRuntimeComfortableMaximumSpokenWords: 0,
    });
  });

  it('does not require spoken-source evidence when a long record-led video forbids speech', () => {
    const userPrompt = [
      'Create a 7-minute record-led visual piece with no spoken words.',
      'Keep music and natural ambience. Our 2025 programme reached 91 students.',
    ].join(' ');
    const authoringRequest = createThinkForgeAuthoringRequest({
      contentContract: createThinkForgeWriterContract('video_script'),
      platformSurface: { id: 'youtube' },
      publishingSurface: 'youtube_video',
      targetDurationSec: 420,
    });
    const sourceLedger = buildThinkForgeSourceLedger({ userPrompt });
    const plan = buildThinkForgeEditorialPlan({
      userPrompt,
      authoringRequest,
      productionBrief: { output: { targetDurationSec: 420 } },
      sourceLedger,
      evidenceNarrativeIntent: 'record_led',
      audiovisualIntent: {
        version: 1,
        audibleSpeech: 'forbidden',
        onCameraSpeech: 'forbidden',
        visiblePerson: 'unspecified',
        physicalCapture: 'unspecified',
      },
    });

    expect(plan.writerKind).toBe('script');
    if (plan.writerKind !== 'script') throw new Error('Expected script editorial plan fixture');
    expect(plan.execution.plan.narration.mode).toBe('none');
    expect(plan.execution.plan.evidenceNarrative.mode).toBe('source_bounded_inquiry');
    expect(assessScriptEvidenceSufficiency({
      editorialPlan: plan.execution.plan,
      sourceLedger,
    })).toEqual({ status: 'not_applicable' });
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

  it('keeps exact user controls when the llm fails', async () => {
    const boom = async () => {
      throw new Error('model down');
    };
    expect(await parsePromptKnobs('a 20s vertical tiktok', boom)).toEqual({
      platform: 'tiktok',
      targetDurationSec: 20,
      aspectRatio: '9:16',
    });
    expect(await parsePromptKnobs('make it punchy', boom)).toEqual({});
  });

  it('lets mechanically proven values override a conflicting model extraction', async () => {
    const r = await parsePromptUnderstanding(
      'Create a 7-minute widescreen YouTube video.',
      echo(resolvedPromptResponse({
        requested: { platform: 'tiktok', targetDurationSec: 30, aspectRatio: '9:16', count: 2 },
      })),
    );
    expect(r.requested).toEqual({
      platform: 'youtube',
      targetDurationSec: 420,
      aspectRatio: '16:9',
      count: 2,
    });
  });

  it('returns parsed prompt understanding from the llm response', async () => {
    const r = await parsePromptUnderstanding('make me the host', echo(resolvedPromptResponse({
      castingIntent: { requested: true, target: 'self' },
    })));
    expect(r).toEqual({
      status: 'resolved',
      requested: {},
      evidenceNarrativeIntent: 'creative',
      audiovisualIntent: { version: 1, ...UNSPECIFIED_AUDIOVISUAL_INTENT },
      castingIntent: { requested: true, target: 'self', characterId: 'host', characterName: 'Host' },
    });
  });

  it('preserves deterministic knobs but fails semantic understanding closed when the llm fails', async () => {
    const r = await parsePromptUnderstanding('Create a 30-second vertical video.', async () => {
      throw new Error('model unavailable');
    });
    expect(r).toMatchObject({
      status: 'unavailable',
      requested: { targetDurationSec: 30, aspectRatio: '9:16' },
      audiovisualIntent: { version: 1, ...UNSPECIFIED_AUDIOVISUAL_INTENT },
    });
  });

  it.each([
    ['Spanish label', 'Quiero un documental experimental sobre nuestra marca.'],
    ['Hindi label', 'हमारे उत्पाद के लिए एक सिनेमाई विज्ञापन बनाओ।'],
    ['Japanese label', 'これはプロダクトフィルムです。'],
    ['unusual invented form', 'Create a chlorophyll opera for our launch.'],
  ])('does not post-classify a label-only %s request', async (_caseName, userPrompt) => {
    const result = await parsePromptUnderstanding(
      userPrompt,
      async () => resolvedPromptResponse(),
    );

    expect(result).toEqual({
      status: 'resolved',
      requested: {},
      evidenceNarrativeIntent: 'creative',
      audiovisualIntent: { version: 1, ...UNSPECIFIED_AUDIOVISUAL_INTENT },
    });
  });
});

describe('deterministic output knob extraction', () => {
  it.each([
    ['7 min video', 420, '7-minute'],
    ['a 1.5 hour documentary', 5400, '90-minute'],
    ['half an hour feature', 1800, '30-minute'],
    ['seven-minute explainer', 420, '7-minute'],
    ['90 seconds', 90, '90-second'],
  ])('parses exact duration %s', (prompt, seconds, label) => {
    expect(resolveExplicitDurationStatement(prompt)).toEqual({
      targetDurationSec: seconds,
      durationLabel: label,
    });
  });

  it('does not turn bounds, mood, or unrelated numbers into exact duration', () => {
    expect(resolveExplicitDurationStatement('under a minute')).toBeNull();
    expect(resolveExplicitDurationStatement('around 7 minutes')).toBeNull();
    expect(resolveExplicitDurationStatement('between 5 and 7 minutes')).toBeNull();
    expect(resolveExplicitDurationStatement('a 5-7 minute video')).toBeNull();
    expect(resolveExplicitDurationStatement('give me 7 ideas')).toBeNull();
    expect(resolveExplicitDurationStatement('make it short and punchy')).toBeNull();
  });

  it('keeps an exact total while ignoring a bounded segment duration', () => {
    expect(resolveExplicitDurationStatement(
      'Make a 7-minute video with every on-camera beat under 10 seconds.',
    )).toEqual({ targetDurationSec: 420, durationLabel: '7-minute' });
  });

  it('leaves conflicting exact durations to semantic intake', () => {
    expect(resolveExplicitDurationStatement(
      'Make a 7-minute master and a 30-second cutdown.',
    )).toBeNull();
  });

  it('distinguishes a target platform from platforms mentioned as the topic', () => {
    expect(resolveDeterministicOutputKnobs(
      'Write a LinkedIn post comparing YouTube workflows.',
    )).toEqual({ platform: 'linkedin' });
    expect(resolveDeterministicOutputKnobs(
      'Write a post about Instagram trends.',
    )).toEqual({});
  });

  it('does not confuse visual subject words with an aspect-ratio instruction', () => {
    expect(resolveDeterministicOutputKnobs(
      'Create a portrait of the founder in a landscape studio.',
    )).toEqual({});
    expect(resolveDeterministicOutputKnobs(
      'Create a vertical TikTok video.',
    )).toEqual({ platform: 'tiktok', aspectRatio: '9:16' });
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
