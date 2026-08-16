import type { PostWriterResult } from '../../lib/thinkforge/agents/post-writer-agent';
import type { ScriptWriterResult } from '../../lib/thinkforge/agents/script-writer-agent';
import { getAntiAiConstraintBundle } from '../../lib/thinkforge/data/writing-graph-query';
import type { ThinkForgeAuthoringRequest } from '../../lib/thinkforge/schemas/authoring-request';
import { countUnicodeWords } from '../../lib/thinkforge/text/unicode-text';

export type WriterPath = 'post' | 'script';
export type GroundingFact = string | readonly string[];
export type WriterEvalSuite = 'core' | 'heldout';

export interface WriterEvalCriteria {
  groundingFloor?: number;
  requiredCharacterNames?: readonly string[];
  requiredLanguageCodes?: readonly string[];
  maximumSpokenWords?: number;
}

export interface WriterEvalCase {
  id: number;
  suite?: WriterEvalSuite;
  name: string;
  documentType: string;
  projectSummary: string;
  userPrompt: string;
  systemBrief?: string;
  expectedPath: WriterPath;
  grounding?: readonly GroundingFact[];
  criteria: WriterEvalCriteria;
}

export interface WriterEvalScoreResult {
  passed: number;
  total: number;
  ratio: number;
  checks: Record<string, boolean | string>;
}

export interface WriterEvalGroundingResult {
  coverage: number;
  present: string[];
  missing: string[];
  total: number;
}

export interface WriterEvalScores {
  structural: WriterEvalScoreResult;
  structured: WriterEvalScoreResult;
  quality: WriterEvalScoreResult;
  grounding: WriterEvalGroundingResult;
  combinedRatio: number;
}

const ANTI_AI_CONSTRAINTS = getAntiAiConstraintBundle();
if (ANTI_AI_CONSTRAINTS.constraints.length === 0) {
  throw new Error(
    'No Anti-AI constraints loaded from writing-knowledge graph. Refusing to score with an empty oracle.',
  );
}

const AI_FILLER = ANTI_AI_CONSTRAINTS.fillerPatterns.map((definition) => ({
  regex: new RegExp(definition.pattern, 'i'),
  label: definition.label,
}));

const CTA_ACTION_PATTERN = new RegExp(
  '(?:\\b(ask|apply|book|buy|call|claim|comment|contact|dm|donate|discover|download|get|join|'
  + 'learn more|message|register|reply|repost|reserve|save|schedule|send|share|shop|sign ?up|'
  + 'tag|try|visit|watch)\\b|inscr[i\\u00ed]bete|registrate|reg[i\\u00ed]strate|'
  + '[u\\u00fa]nete|reserva|compra|visita|env[i\\u00ed]a|manda|escr[i\\u00ed]benos|'
  + 'comenta|comparte)',
  'i',
);
const INTERNAL_LEAK_PATTERN = /(?:tf_untrusted_data|source[_ -]?ledger|signal[_ -]?trace|system prompt|hidden json)/i;
const GENERIC_CTA_PATTERN = /(?:what do you think|thoughts|agree|right)\??$/i;
const HASHTAG_PATTERN = /#[\p{L}\p{M}\p{N}_]+/gu;
const EXACT_HASHTAG_PATTERN = /^#[\p{L}\p{M}\p{N}_]+$/u;
const EMOJI_PATTERN = /\p{Extended_Pictographic}/gu;

function makeScorer() {
  const checks: Record<string, boolean | string> = {};
  let passed = 0;
  let total = 0;
  return {
    check(name: string, condition: boolean) {
      total += 1;
      checks[name] = condition;
      if (condition) passed += 1;
    },
    annotate(name: string, value: string) {
      checks[name] = value;
    },
    result(): WriterEvalScoreResult {
      return { passed, total, ratio: total > 0 ? passed / total : 0, checks };
    },
  };
}

function normalizeFact(text: string): string {
  return text
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLocaleLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
}

export function writerEvalGroundingFactLabel(fact: GroundingFact): string {
  return typeof fact === 'string' ? fact : fact[0] ?? '';
}

function groundingFactVariants(fact: GroundingFact): readonly string[] {
  return typeof fact === 'string' ? [fact] : fact;
}

function finalContentLine(content: string): string {
  return content
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line.length > 0 && !/^#[\p{L}\p{M}\p{N}_]+$/u.test(line))
    .at(-1) ?? '';
}

function hasCta(content: string): boolean {
  const closing = finalContentLine(content);
  return closing.includes('?') || CTA_ACTION_PATTERN.test(closing);
}

function scoreAntiAiAndLeakage(content: string, scorer: ReturnType<typeof makeScorer>): void {
  const filler = AI_FILLER.filter((entry) => entry.regex.test(content));
  scorer.check('no_ai_filler', filler.length === 0);
  if (filler.length > 0) scorer.annotate('filler_details', filler.map((entry) => entry.label).join(', '));
  scorer.check('no_internal_leakage', !INTERNAL_LEAK_PATTERN.test(content));
}

function scorePostStructural(
  result: PostWriterResult,
  request: ThinkForgeAuthoringRequest,
): WriterEvalScoreResult {
  const scorer = makeScorer();
  const controls = request.postControls;
  if (!controls) throw new Error('Post eval request omitted postControls');

  scorer.check('no_scene_headings', !/#{1,3}\s*scene\s*\d/i.test(result.content));
  scorer.check('no_visual_labels', !/\*\*Visual\s*:/i.test(result.content));
  scorer.check('no_voiceover_labels', !/\*\*(?:VO|Narration)\s*:/i.test(result.content));
  scorer.check('no_h1_title', !result.content.startsWith('# '));
  scorer.check('hashtags_not_in_body', (result.content.match(HASHTAG_PATTERN) ?? []).length === 0);

  if (controls.hashtags.preference === 'none') {
    scorer.check('hashtag_control', result.hashtags.length === 0);
  } else if (controls.hashtags.preference === 'exact') {
    scorer.check(
      'hashtag_control',
      JSON.stringify(result.hashtags) === JSON.stringify(controls.hashtags.values ?? []),
    );
  } else {
    scorer.check('hashtag_control', result.hashtags.every((tag) => EXACT_HASHTAG_PATTERN.test(tag)));
  }

  const ctaPresent = hasCta(result.content);
  scorer.check(
    'cta_control',
    controls.cta.preference === 'none' ? !ctaPresent : controls.cta.preference === 'editorial' || ctaPresent,
  );
  if (controls.cta.action) {
    scorer.check('cta_action_preserved', normalizeFact(result.content).includes(normalizeFact(controls.cta.action)));
  }
  if (controls.cta.destination) {
    scorer.check('cta_destination_preserved', result.content.includes(controls.cta.destination));
  }

  const emojiCount = (result.content.match(EMOJI_PATTERN) ?? []).length;
  scorer.check(
    'emoji_control',
    controls.emoji.preference === 'none'
      ? emojiCount === 0
      : controls.emoji.preference === 'editorial' || emojiCount <= 2,
  );
  scoreAntiAiAndLeakage(result.content, scorer);
  return scorer.result();
}

function scriptScenes(result: ScriptWriterResult) {
  return result.sidecar.acts.flatMap((act) => act.narrativeScenes);
}

function scriptSpokenLines(result: ScriptWriterResult) {
  return scriptScenes(result)
    .flatMap((scene) => scene.beats)
    .flatMap((beat) => beat.lines)
    .filter((line) => line.delivery !== 'on-screen-text' && line.text.trim().length > 0);
}

function scoreScriptStructural(result: ScriptWriterResult): WriterEvalScoreResult {
  const scorer = makeScorer();
  const scenes = scriptScenes(result);
  const beats = scenes.flatMap((scene) => scene.beats);
  scorer.check('has_narrative_hierarchy', result.sidecar.acts.length > 0 && scenes.length > 0 && beats.length > 0);
  scorer.check('has_spoken_content', scriptSpokenLines(result).length > 0);
  scorer.check('has_visual_direction', beats.every((beat) => Boolean(beat.visualIntent?.description.trim())));
  scoreAntiAiAndLeakage(result.content, scorer);
  return scorer.result();
}

function languageMatches(actual: string, expected: string): boolean {
  const normalizedActual = actual.toLocaleLowerCase();
  const normalizedExpected = expected.toLocaleLowerCase();
  return normalizedActual === normalizedExpected
    || normalizedActual.startsWith(`${normalizedExpected}-`)
    || normalizedExpected.startsWith(`${normalizedActual}-`);
}

function scoreStructured(
  result: PostWriterResult | ScriptWriterResult,
  testCase: WriterEvalCase,
): WriterEvalScoreResult {
  const scorer = makeScorer();
  if (testCase.expectedPath === 'post') {
    const post = result as PostWriterResult;
    const hasVisualHandoff = Boolean(
      post.clickatron.singleImagePrompt
      || post.clickatron.carouselDeck?.slides.length
      || post.clickatron.carouselPrompts?.length,
    );
    scorer.check('violations_empty', post.contentAnalysis.violations.length === 0);
    scorer.check('clickatron_handoff_present', hasVisualHandoff);
    scorer.check('platform_metadata_present', post.metadata.platform.trim().length > 0);
    return scorer.result();
  }

  const script = result as ScriptWriterResult;
  const scenes = scriptScenes(script);
  const spokenLines = scriptSpokenLines(script);
  scorer.check('scene_prompts_match_scenes', script.visualMetadata.scenePrompts.length === scenes.length);
  scorer.check('motion_info_present', script.visualMetadata.motionInfo.trim().length > 0);
  if (testCase.criteria.requiredCharacterNames) {
    const actualNames = script.sidecar.characters.map((character) => normalizeFact(character.name));
    for (const requiredName of testCase.criteria.requiredCharacterNames) {
      scorer.check(
        `character_present:${requiredName}`,
        actualNames.includes(normalizeFact(requiredName)),
      );
    }
  }
  if (testCase.criteria.requiredLanguageCodes) {
    for (const languageCode of testCase.criteria.requiredLanguageCodes) {
      scorer.check(
        `language_present:${languageCode}`,
        script.metadata.voiceLanguages.some((actual) => languageMatches(actual, languageCode)),
      );
    }
  }
  if (testCase.criteria.maximumSpokenWords !== undefined) {
    const spokenWords = countUnicodeWords(spokenLines.map((line) => line.text).join(' '));
    scorer.check(
      `spoken_words_max:${testCase.criteria.maximumSpokenWords}`,
      spokenWords <= testCase.criteria.maximumSpokenWords,
    );
  }
  return scorer.result();
}

function scoreQuality(
  result: PostWriterResult | ScriptWriterResult,
  request: ThinkForgeAuthoringRequest,
  testCase: WriterEvalCase,
): WriterEvalScoreResult {
  const scorer = makeScorer();
  if (testCase.expectedPath === 'post') {
    const post = result as PostWriterResult;
    const closing = finalContentLine(post.content);
    scorer.check('substantive_content', countUnicodeWords(post.content) >= 3);
    scorer.check(
      'cta_discipline',
      request.postControls?.cta.preference === 'none'
        ? !hasCta(post.content)
        : !GENERIC_CTA_PATTERN.test(closing),
    );
    return scorer.result();
  }

  const script = result as ScriptWriterResult;
  const scenes = scriptScenes(script);
  const beats = scenes.flatMap((scene) => scene.beats);
  scorer.check('visual_intent_complete', beats.every((beat) => Boolean(beat.visualIntent)));
  scorer.check('shot_intent_complete', beats.every((beat) => Boolean(beat.shotIntent)));
  scorer.check('beat_channel_semantics', beats.every((beat) => {
    const hasSpeech = beat.lines.some((line) => (
      line.delivery !== 'on-screen-text' && line.text.trim().length > 0
    ));
    if (beat.kind === 'visual' || beat.kind === 'transition') return !hasSpeech;
    if (beat.kind === 'voiceover' || beat.kind === 'dialogue') return hasSpeech;
    return true;
  }));
  scorer.check(
    'exact_runtime',
    request.targetDurationSec !== undefined
      && Math.abs(script.metadata.estimatedTimeSeconds - request.targetDurationSec) <= 0.001,
  );
  return scorer.result();
}

export function scoreWriterEvalGrounding(
  content: string,
  testCase: WriterEvalCase,
): WriterEvalGroundingResult {
  const facts = testCase.grounding ?? [];
  if (facts.length === 0) return { coverage: 1, present: [], missing: [], total: 0 };
  const haystack = normalizeFact(content);
  const present: string[] = [];
  const missing: string[] = [];
  for (const fact of facts) {
    const label = writerEvalGroundingFactLabel(fact);
    const matched = groundingFactVariants(fact).some((variant) => (
      haystack.includes(normalizeFact(variant))
    ));
    if (matched) present.push(label);
    else missing.push(label);
  }
  return { coverage: present.length / facts.length, present, missing, total: facts.length };
}

export function scoreThinkForgeWriterEval(input: {
  result: PostWriterResult | ScriptWriterResult;
  testCase: WriterEvalCase;
  authoringRequest: ThinkForgeAuthoringRequest;
  routedCorrectly: boolean;
}): WriterEvalScores {
  const { result, testCase, authoringRequest, routedCorrectly } = input;
  const structural = testCase.expectedPath === 'post'
    ? scorePostStructural(result as PostWriterResult, authoringRequest)
    : scoreScriptStructural(result as ScriptWriterResult);
  const structured = scoreStructured(result, testCase);
  const quality = scoreQuality(result, authoringRequest, testCase);
  const grounding = scoreWriterEvalGrounding(result.content, testCase);
  const groundingFloor = testCase.criteria.groundingFloor;
  const passed = structural.passed
    + structured.passed
    + (routedCorrectly ? 1 : 0)
    + (groundingFloor !== undefined && grounding.coverage >= groundingFloor ? 1 : 0);
  const total = structural.total + structured.total + 1 + (groundingFloor !== undefined ? 1 : 0);

  return {
    structural,
    structured,
    quality,
    grounding,
    combinedRatio: total > 0 ? passed / total : 0,
  };
}
