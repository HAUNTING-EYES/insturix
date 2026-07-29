import { readFile, rm } from 'node:fs/promises';
import { nanoid } from 'nanoid';

import type { Overlay, SoundOverlay } from '@/components/editron/editor/version-7.0.0/types';
import { OverlayType } from '@/components/editron/editor/version-7.0.0/types';
import { withAtomicOverlayReceipt, withAtomicOverlayUpdateReceipt } from '@/lib/editron/engine/overlay-atomic-receipts';
import { getDatabase, COLLECTIONS } from '@/lib/editron/db/mongodb';
import { sampleAudioClip } from '@/lib/editron/services/media/analysis-service';
import { getTranscription } from '@/lib/editron/services/media/transcription-service';
import { segmentTimedSpeechPhrases } from '@/lib/editron/services/spoken-phrase-segmentation';
import { uploadMedia } from '@/lib/editron/services/upload-service';
import {
  getGeneratedNativeVideoReceiptIssue,
  resolveAudioRightsClaim,
  type AudioRightsContract,
} from '@/lib/editron/shared/render-request-payload';
import { ROW } from '@/lib/pipeline/scene-to-editron';
import {
  generateVoiceover,
  type GeneratedSpeechCapability,
  type SpeechSynthesisCapability,
} from '@/lib/pipeline/tts-service';
import { recordProviderCostEvent } from '@/lib/financials/provider-cost-events';

import {
  TerminalDubbingError,
  resolveChatDubbingSpeechCapability,
  type AudioSeparationReceipt,
  type ChatDubbingJob,
  type ChatDubbingProgress,
  type ChatDubbingStepResult,
  type DubbingAcceptableCompression,
  type DubbingFidelityCheck,
  type DubbingFidelityState,
  type DubbingMediaProgress,
  type DubbingPhraseProgress,
  type DubbingTranslationFidelityReceipt,
} from './chat-dubbing-job';

const PHRASES_PER_DELIVERY = 4;
const MAX_NATURAL_PLAYBACK_RATE = 1.25;
const MAX_TRANSLATION_REVISIONS = 2;
const TRANSLATION_SEEDS = [42, 7, 99] as const;
const FIDELITY_CHECKS = [
  'coreClaims',
  'entities',
  'quantities',
  'negation',
  'comparisons',
  'relationships',
  'certainty',
  'speakerIntent',
  'targetLanguage',
] as const satisfies readonly DubbingFidelityCheck[];
const ACCEPTABLE_COMPRESSIONS = [
  'removed-disfluency',
  'removed-filler',
  'removed-repetition',
  'condensed-syntax',
] as const satisfies readonly DubbingAcceptableCompression[];
const FIDELITY_STATES = [
  'preserved',
  'not-applicable',
  'changed',
  'uncertain',
] as const satisfies readonly DubbingFidelityState[];

export async function executeChatDubbingStep(job: ChatDubbingJob): Promise<ChatDubbingStepResult> {
  if (job.progress.stage === 'prepare') return prepareDubbing(job);
  if (job.progress.stage === 'separate') return separateBackground(job);
  if (job.progress.stage === 'voice') return generateVoiceChunk(job);
  if (job.progress.stage === 'commit') return commitDubbing(job);
  throw new TerminalDubbingError('invalid-dubbing-stage', `Unknown dubbing stage ${(job.progress as { stage?: unknown }).stage}.`);
}

export async function cleanupChatDubbingAssets(job: ChatDubbingJob): Promise<void> {
  await cleanupGeneratedAssets(job.userId, job.progress.generatedAssetIds ?? []);
}

async function cleanupGeneratedAssets(userId: string, rawAssetIds: string[]): Promise<void> {
  const assetIds = Array.from(new Set(rawAssetIds));
  if (assetIds.length === 0) return;
  const db = await getDatabase();
  const assets = await db.collection(COLLECTIONS.MEDIA_ASSETS).find({ userId, assetId: { $in: assetIds } }).toArray();
  const { deleteFromR2 } = await import('@/lib/editron/services/r2-service');
  const { deleteFromGCS } = await import('@/lib/editron/services/gcs-service');
  for (const asset of assets) {
    if (typeof asset.r2Key === 'string' && asset.r2Key) await deleteFromR2(asset.r2Key).catch(() => undefined);
    if (typeof asset.gcsPath === 'string' && asset.gcsPath) await deleteFromGCS(asset.gcsPath).catch(() => undefined);
  }
  await db.collection(COLLECTIONS.MEDIA_ASSETS).deleteMany({ userId, assetId: { $in: assetIds } });
}

async function prepareDubbing(job: ChatDubbingJob): Promise<ChatDubbingStepResult> {
  const speechCapability = resolveChatDubbingSpeechCapability(job);
  const transcription = await getTranscription(job.assetId, job.userId, { preferWordLevel: true });
  const sourceWords = transcription.words.filter((word) => {
    const startFrame = Math.round((word.startMs / 1000) * job.fps);
    const endFrame = Math.max(startFrame + 1, Math.round((word.endMs / 1000) * job.fps));
    return endFrame > job.sourceStartFrame && startFrame < job.sourceEndFrame;
  });
  if (sourceWords.length === 0) {
    throw new TerminalDubbingError('no-spoken-dialogue', 'The selected clip has no word-timed dialogue to dub.');
  }
  const beats = segmentTimedSpeechPhrases(sourceWords, {
    pauseBoundaryMs: 800,
    minimumStandaloneWords: 1,
  });
  if (beats.length === 0) throw new TerminalDubbingError('no-dubbing-phrases', 'No stable phrase windows could be derived from the selected dialogue.');
  const visiblePhrases: DubbingPhraseProgress[] = beats.map((beat, index) => {
    const sourceStartFrame = Math.round((beat.startMs / 1000) * job.fps);
    const sourceEndFrame = Math.max(sourceStartFrame + 1, Math.round((beat.endMs / 1000) * job.fps));
    return {
      index,
      sourceText: beat.line,
      translatedText: '',
      timelineStartFrame: job.timelineStartFrame + Math.max(0, sourceStartFrame - job.sourceStartFrame),
      timelineEndFrame: job.timelineStartFrame + Math.min(job.timelineEndFrame - job.timelineStartFrame, sourceEndFrame - job.sourceStartFrame),
      sourceStartMs: beat.startMs,
      sourceEndMs: beat.endMs,
    };
  }).filter((phrase) => phrase.timelineEndFrame > phrase.timelineStartFrame);
  const phrases = visiblePhrases.map((phrase, index) => ({
    ...phrase,
    deliveryEndFrame: Math.min(
      job.timelineEndFrame,
      Math.max(
        phrase.timelineEndFrame,
        visiblePhrases[index + 1]?.timelineStartFrame ?? job.timelineEndFrame,
      ),
    ),
  }));
  if (phrases.length === 0) throw new TerminalDubbingError('no-visible-dubbing-phrases', 'All speech fell outside the selected edited clip.');
  const translations = await translatePhrases(
    phrases.map((phrase) => ({
      id: phrase.index,
      text: phrase.sourceText,
      availableDurationMs: availablePhraseDurationMs(phrase, job.fps),
    })),
    speechCapability.displayName,
  );
  for (let index = 0; index < phrases.length; index += 1) {
    phrases[index].translatedText = translations[index].text;
    phrases[index].translationFidelity = translations[index].fidelity;
    phrases[index].translationRevision = 0;
  }
  return {
    status: 'continue',
    reason: `prepared-${phrases.length}-phrases`,
    progress: { ...job.progress, stage: 'separate', phrases, nextPhraseIndex: 0 },
  };
}

async function separateBackground(job: ChatDubbingJob): Promise<ChatDubbingStepResult> {
  let sampledPath: string | null = null;
  try {
    sampledPath = await sampleAudioClip({
      projectId: job.projectId,
      source: 'asset',
      assetId: job.assetId,
      startFrame: job.sourceStartFrame,
      endFrame: job.sourceEndFrame,
      fps: job.fps,
      userId: job.userId,
    });
    const background = await separateAndPersistBackground(job, sampledPath);
    return {
      status: 'continue',
      reason: 'background-stem-ready',
      progress: {
        ...job.progress,
        stage: 'voice',
        background,
        generatedAssetIds: appendUnique(job.progress.generatedAssetIds, background.assetId),
      },
    };
  } finally {
    if (sampledPath) await rm(sampledPath, { force: true }).catch(() => undefined);
  }
}

async function generateVoiceChunk(job: ChatDubbingJob): Promise<ChatDubbingStepResult> {
  const speechCapability = resolveChatDubbingSpeechCapability(job);
  const phrases = job.progress.phrases?.map((phrase) => ({ ...phrase })) ?? [];
  if (!job.progress.background || phrases.length === 0) {
    throw new TerminalDubbingError('incomplete-dubbing-progress', 'Background and translated phrases must exist before voice generation.');
  }
  const start = Math.max(0, job.progress.nextPhraseIndex ?? 0);
  const end = Math.min(phrases.length, start + PHRASES_PER_DELIVERY);
  const generatedAssetIds = [...(job.progress.generatedAssetIds ?? [])];
  const generatedThisStep = new Set<string>();
  try {
    for (let index = start; index < end; index += 1) {
      const phrase = phrases[index];
      if (phrase.voiceAssetId) continue;
      const availableDurationMs = availablePhraseDurationMs(phrase, job.fps);
      let translatedText = phrase.translatedText;
      let accepted = false;
      for (
        let revision = phrase.translationRevision ?? 0;
        revision <= MAX_TRANSLATION_REVISIONS;
        revision += 1
      ) {
        const voice = await generateVoiceover(translatedText, job.userId, {
          voice: speechCapability.voiceId,
          language: speechCapability.language,
          contentType: 'dialogue',
          mediaRole: 'dubbing',
        });
        assertGeneratedSpeechCapability(speechCapability, voice.generatedSpeechCapability);
        generatedThisStep.add(voice.audioAssetId);
        const requiredPlaybackRate = voice.durationMs / availableDurationMs;
        const outcome = Number.isFinite(requiredPlaybackRate)
          && requiredPlaybackRate > 0
          && requiredPlaybackRate <= MAX_NATURAL_PLAYBACK_RATE
          ? 'accepted'
          : 'rephrase';
        phrase.fitAttempts = [
          ...(phrase.fitAttempts ?? []),
          {
            revision,
            voiceDurationMs: voice.durationMs,
            availableDurationMs: round(availableDurationMs, 2),
            requiredPlaybackRate: round(requiredPlaybackRate, 4),
            outcome,
          },
        ];
        if (outcome === 'accepted') {
          phrase.translatedText = translatedText;
          phrase.translationRevision = revision;
          phrase.voiceAssetId = voice.audioAssetId;
          phrase.voiceUrl = voice.audioUrl;
          phrase.voiceDurationMs = voice.durationMs;
          phrase.playbackRate = round(Math.max(1, requiredPlaybackRate), 4);
          phrase.voiceAudioRights = voice.audioRights;
          phrase.generatedAudioReceipt = voice.generatedAudioReceipt;
          phrase.generatedSpeechCapability = voice.generatedSpeechCapability;
          generatedAssetIds.push(voice.audioAssetId);
          accepted = true;
          break;
        }

        await cleanupGeneratedAssets(job.userId, [voice.audioAssetId]);
        generatedThisStep.delete(voice.audioAssetId);
        if (revision >= MAX_TRANSLATION_REVISIONS) {
          throw new TerminalDubbingError(
            'unnatural-phrase-fit',
            `Phrase ${index + 1} still needs ${requiredPlaybackRate.toFixed(2)}x playback after ${revision} duration-aware translation revisions; maximum natural playback is ${MAX_NATURAL_PLAYBACK_RATE}x.`,
          );
        }
        const rewrite = await rewriteTranslationToFit({
          sourceText: phrase.sourceText,
          translatedText,
          targetLanguage: speechCapability.displayName,
          availableDurationMs,
          actualDurationMs: voice.durationMs,
          revision: revision + 1,
        });
        translatedText = rewrite.text;
        phrase.translationFidelity = rewrite.fidelity;
      }
      if (!accepted) throw new TerminalDubbingError('unnatural-phrase-fit', `Phrase ${index + 1} did not produce naturally fitted speech.`);
    }
  } catch (error) {
    await cleanupGeneratedAssets(job.userId, Array.from(generatedThisStep));
    throw error;
  }
  const nextPhraseIndex = end;
  return {
    status: 'continue',
    reason: nextPhraseIndex >= phrases.length ? 'voice-generation-complete' : `voice-progress-${nextPhraseIndex}-of-${phrases.length}`,
    progress: {
      ...job.progress,
      stage: nextPhraseIndex >= phrases.length ? 'commit' : 'voice',
      phrases,
      nextPhraseIndex,
      generatedAssetIds: Array.from(new Set(generatedAssetIds)),
    },
  };
}

async function commitDubbing(job: ChatDubbingJob): Promise<ChatDubbingStepResult> {
  const phrases = job.progress.phrases ?? [];
  const background = job.progress.background;
  if (
    !background
    || !background.audioRights
    || !background.audioSeparationReceipt
    || phrases.length === 0
    || phrases.some((phrase) =>
      !phrase.voiceAssetId
      || !phrase.voiceUrl
      || !phrase.playbackRate
      || !phrase.voiceAudioRights
      || !phrase.generatedAudioReceipt
      || !phrase.generatedSpeechCapability
    )
  ) {
    throw new TerminalDubbingError(
      'incomplete-dubbing-assets',
      'All phrase audio, generated-audio provenance, and the background stem are required before commit.',
    );
  }
  const db = await getDatabase();
  const project = await db.collection(COLLECTIONS.PROJECTS).findOne({ projectId: job.projectId, userId: job.userId });
  if (!project) throw new TerminalDubbingError('project-not-found', 'Project disappeared before dubbing commit.');
  const overlays = Array.isArray(project.overlays) ? project.overlays as Overlay[] : [];
  const selectedIndex = overlays.findIndex((overlay) => String(overlay.id) === job.overlayId);
  if (selectedIndex < 0) throw new TerminalDubbingError('dubbing-target-missing', 'Selected video overlay disappeared before commit.');
  const nextId = nextOverlayId(overlays);
  let id = nextId;
  const updatedSelected = withAtomicOverlayUpdateReceipt(overlays[selectedIndex], {
    styles: { ...(overlays[selectedIndex].styles ?? {}), volume: 0 },
  } as Partial<Overlay>, {
    source: 'chat-dubbing-worker',
    intent: 'replace-source-dialogue',
    reason: 'original mixed audio muted after separated background and aligned translated dialogue were prepared',
  });
  const backgroundOverlay = stampDubbingSound({
    id: id++,
    from: job.timelineStartFrame,
    durationInFrames: job.timelineEndFrame - job.timelineStartFrame,
    row: ROW.SFX,
    assetId: background.assetId,
    src: background.url,
    content: background.url,
    audioRights: background.audioRights,
    styles: {
      volume: 0.9,
      duckingConfig: { enabled: true, duckLevel: 0.1, rampDownMs: 180, rampUpMs: 350, lookAheadMs: 100 },
    } as SoundOverlay['styles'],
    metadata: {
      isDubbingBackgroundStem: true,
      dubbingJobId: job._id,
      sourceOverlayId: job.overlayId,
      audioSeparationReceipt: background.audioSeparationReceipt,
    },
  }, 'preserve-separated-background');
  const voiceOverlays = phrases.map((phrase) => stampDubbingSound({
    id: id++,
    from: phrase.timelineStartFrame,
    durationInFrames: Math.min(
      (phrase.deliveryEndFrame ?? phrase.timelineEndFrame) - phrase.timelineStartFrame,
      Math.max(1, Math.ceil(((phrase.voiceDurationMs! / phrase.playbackRate!) / 1000) * job.fps)),
    ),
    row: ROW.VOICEOVER,
    assetId: phrase.voiceAssetId!,
    src: phrase.voiceUrl!,
    content: phrase.voiceUrl!,
    playbackRate: phrase.playbackRate,
    audioRights: phrase.voiceAudioRights,
    styles: { volume: 0.9 },
    metadata: {
      isVoiceover: true,
      isDubbedDialogue: true,
      dubbingJobId: job._id,
      phraseIndex: phrase.index,
      sourceText: phrase.sourceText,
      translatedText: phrase.translatedText,
      targetLanguage: phrase.generatedSpeechCapability!.language,
      generatedSpeechCapability: phrase.generatedSpeechCapability,
      sourceOverlayId: job.overlayId,
    },
  }, 'phrase-aligned-translated-dialogue'));
  const nextOverlays = overlays.map((overlay, index) => index === selectedIndex ? updatedSelected : overlay).concat(backgroundOverlay, ...voiceOverlays);
  const now = new Date();
  const result = await db.collection(COLLECTIONS.PROJECTS).updateOne(
    { projectId: job.projectId, userId: job.userId, updatedAt: project.updatedAt },
    {
      $set: {
        overlays: nextOverlays,
        'intelligence.lastDubbingJob': {
          jobId: job._id,
          overlayId: job.overlayId,
          targetLanguage: job.targetLanguage,
          speechCapability: resolveChatDubbingSpeechCapability(job),
          phraseCount: phrases.length,
          backgroundAssetId: background.assetId,
          audioSeparationReceipt: background.audioSeparationReceipt,
          voiceAssetIds: phrases.map((phrase) => phrase.voiceAssetId),
          committedAt: now,
        },
        updatedAt: now,
      },
    },
  );
  if (result.modifiedCount !== 1) {
    throw new TerminalDubbingError('project-concurrent-write', 'Project changed before dubbing could be committed; generated assets were not attached.');
  }
  return {
    status: 'completed',
    result: {
      overlayId: job.overlayId,
      targetLanguage: job.targetLanguage,
      speechCapability: resolveChatDubbingSpeechCapability(job),
      phraseCount: phrases.length,
      backgroundAssetId: background.assetId,
      voiceAssetIds: phrases.map((phrase) => phrase.voiceAssetId),
      audioOverlayIds: [backgroundOverlay.id, ...voiceOverlays.map((overlay) => overlay.id)],
    },
  };
}

function assertGeneratedSpeechCapability(
  expected: SpeechSynthesisCapability,
  actual: GeneratedSpeechCapability | undefined,
): asserts actual is GeneratedSpeechCapability {
  const matchesPrimary = actual?.provider === expected.provider
    && actual.model === expected.model
    && actual.voiceId === expected.voiceId
    && actual.fallbackUsed === false;
  const matchesFallback = Boolean(
    expected.fallback
    && actual?.provider === expected.fallback.provider
    && actual.model === expected.fallback.model
    && actual.voiceId === expected.fallback.voiceId
    && actual.fallbackUsed === true,
  );
  if (!actual || actual.language !== expected.language || (!matchesPrimary && !matchesFallback)) {
    throw new TerminalDubbingError(
      'dubbing-speech-capability-mismatch',
      'Generated speech did not match the pinned dubbing language/provider/voice contract.',
    );
  }
}

async function translatePhrases(
  input: Array<{ id: number; text: string; availableDurationMs: number }>,
  targetLanguage: string,
): Promise<Array<{ text: string; fidelity: DubbingTranslationFidelityReceipt }>> {
  const { getGenAI } = await import('@/lib/editron/utils/gemini-model-factory');
  const genAI = await getGenAI();
  const schema = {
    type: 'OBJECT',
    properties: {
      phrases: {
        type: 'ARRAY',
        items: {
          type: 'OBJECT',
          properties: { id: { type: 'INTEGER' }, text: { type: 'STRING' } },
          required: ['id', 'text'],
        },
      },
    },
    required: ['phrases'],
  } as const;
  let lastError: unknown;
  for (const seed of TRANSLATION_SEEDS) {
    try {
      const model = genAI.getGenerativeModel({
        model: 'gemini-2.5-flash',
        generationConfig: { temperature: 0, seed, maxOutputTokens: 8192, responseMimeType: 'application/json', responseSchema: schema },
      });
      const response = await model.generateContent(`Translate each spoken phrase faithfully into natural ${targetLanguage} for professional video dubbing.
This first pass owns meaning, not timing. Do not shorten or omit meaning to fit a duration; measured synthesis and a separately verified rewrite own timing adaptation later.
Preserve every factual claim, entity, quantity, negation, comparison, relationship, certainty level, and speaker intent.
Remove verbal stutters, filler, false starts, and redundant repeated syntax when they carry no meaning. This delivery cleanup is not an omission.
Concise equivalent phrasing is allowed; adding, censoring, contradicting, or merging semantic claims is forbidden.
Keep one-to-one phrase IDs and return JSON only.
${JSON.stringify({ phrases: input.map(({ id, text }) => ({ id, text })) })}`);
      const parsed = JSON.parse(response.response.text()) as { phrases?: Array<{ id?: unknown; text?: unknown }> };
      const byId = new Map((parsed.phrases ?? []).map((item) => [Number(item.id), typeof item.text === 'string' ? item.text.trim() : '']));
      const translated = input.map((item) => byId.get(item.id) ?? '');
      if (translated.some((text) => !text)) throw new Error('translation-cardinality-or-empty-text');
      const fidelity = await verifyTranslationFidelities(
        input.map((item, index) => ({
          id: item.id,
          sourceText: item.text,
          translatedText: translated[index],
        })),
        targetLanguage,
        seed,
      );
      const failure = formatFidelityFailures(fidelity);
      if (failure) throw new Error(`initial-translation-semantic-drift:${failure}`);
      return translated.map((text, index) => ({ text, fidelity: fidelity[index] }));
    } catch (error) { lastError = error; }
  }
  throw new TerminalDubbingError(
    'initial-translation-failed',
    lastError instanceof Error ? lastError.message : 'Translation failed.',
  );
}

async function rewriteTranslationToFit(input: {
  sourceText: string;
  translatedText: string;
  targetLanguage: string;
  availableDurationMs: number;
  actualDurationMs: number;
  revision: number;
}): Promise<{ text: string; fidelity: DubbingTranslationFidelityReceipt }> {
  const { getGenAI } = await import('@/lib/editron/utils/gemini-model-factory');
  const genAI = await getGenAI();
  const maximumVoiceDurationMs = input.availableDurationMs * MAX_NATURAL_PLAYBACK_RATE;
  const requiredReductionPercent = Math.max(
    1,
    Math.ceil((1 - (maximumVoiceDurationMs / input.actualDurationMs)) * 100),
  );
  const schema = {
    type: 'OBJECT',
    properties: { text: { type: 'STRING' } },
    required: ['text'],
  } as const;
  let lastError: unknown;
  for (const seed of TRANSLATION_SEEDS) {
    try {
      const model = genAI.getGenerativeModel({
        model: 'gemini-2.5-flash',
        generationConfig: {
          temperature: 0,
          seed: seed + input.revision,
          maxOutputTokens: 2048,
          responseMimeType: 'application/json',
          responseSchema: schema,
        },
      });
      const response = await model.generateContent(`Rewrite this ${input.targetLanguage} dubbing line so it can be spoken naturally within ${Math.round(input.availableDurationMs)}ms.
The current synthesized line lasts ${Math.round(input.actualDurationMs)}ms, so reduce spoken duration by at least ${requiredReductionPercent}%.
Preserve every factual claim, entity, quantity, negation, comparison, relationship, certainty level, and speaker intent from the source.
Remove verbal stutters, filler, false starts, and redundant repeated syntax when they carry no meaning. This delivery cleanup is not an omission.
Use concise natural speech; do not add, censor, contradict, or merge semantic claims.
Return JSON only.
${JSON.stringify({ sourceText: input.sourceText, currentTranslation: input.translatedText })}`);
      const parsed = JSON.parse(response.response.text()) as { text?: unknown };
      const rewritten = typeof parsed.text === 'string' ? parsed.text.trim() : '';
      if (!rewritten || normalizedText(rewritten) === normalizedText(input.translatedText)) {
        throw new Error('duration-aware-translation-unchanged-or-empty');
      }
      const [fidelity] = await verifyTranslationFidelities(
        [{ id: 0, sourceText: input.sourceText, translatedText: rewritten }],
        input.targetLanguage,
        seed + input.revision,
      );
      const failure = formatFidelityFailures([fidelity]);
      if (failure) throw new Error(`duration-aware-translation-semantic-drift:${failure}`);
      return { text: rewritten, fidelity };
    } catch (error) {
      lastError = error;
    }
  }
  throw new TerminalDubbingError(
    'duration-aware-translation-failed',
    lastError instanceof Error ? lastError.message : 'Translation could not be adapted to the measured phrase window.',
  );
}

async function verifyTranslationFidelities(
  input: Array<{
    id: number;
    sourceText: string;
    translatedText: string;
  }>,
  targetLanguage: string,
  seed: number,
): Promise<DubbingTranslationFidelityReceipt[]> {
  const { getGenAI } = await import('@/lib/editron/utils/gemini-model-factory');
  const genAI = await getGenAI();
  const checkProperties = Object.fromEntries(
    FIDELITY_CHECKS.map((check) => [
      check,
      { type: 'STRING', enum: [...FIDELITY_STATES] },
    ]),
  );
  const schema = {
    type: 'OBJECT',
    properties: {
      results: {
        type: 'ARRAY',
        items: {
          type: 'OBJECT',
          properties: {
            id: { type: 'INTEGER' },
            checks: {
              type: 'OBJECT',
              properties: checkProperties,
              required: [...FIDELITY_CHECKS],
            },
            acceptableCompression: {
              type: 'ARRAY',
              items: { type: 'STRING', enum: [...ACCEPTABLE_COMPRESSIONS] },
            },
          },
          required: ['id', 'checks', 'acceptableCompression'],
        },
      },
    },
    required: ['results'],
  } as const;
  const model = genAI.getGenerativeModel({
    model: 'gemini-2.5-flash',
    generationConfig: {
      temperature: 0,
      seed: seed + 1000,
      maxOutputTokens: 4096,
      responseMimeType: 'application/json',
      responseSchema: schema,
    },
  });
  const response = await model.generateContent(`Judge semantic fidelity for each ${targetLanguage} dubbing candidate at the proposition level.
For every check return preserved, not-applicable, changed, or uncertain.
Use not-applicable only when the source has no information in that category. Use preserved when it exists and survives faithfully, changed when it is omitted/added/contradicted/materially softened, and uncertain when evidence is insufficient.
coreClaims covers all asserted propositions. entities covers people, places, organizations, products, and named things. quantities covers numbers and measurable amounts.
negation, comparisons, relationships, and certainty must preserve their original direction and strength. speakerIntent covers advice, question, command, promise, warning, and other communicative purpose.
targetLanguage means the candidate is natural ${targetLanguage}; it is always applicable, so return preserved, changed, or uncertain for that check.
Do not penalize removing stutters, filler words, false starts, self-corrections, or redundant repetition when they add no proposition. Record those only in acceptableCompression.
Do not judge acoustic tone, pacing, or vocal performance; those belong to the speech-rendering contract, not textual semantic fidelity.
Any omitted, added, contradicted, or materially softened semantic claim must make its relevant check false.
Return exactly one result for every input id and JSON only.
${JSON.stringify({ items: input })}`);
  const parsed = JSON.parse(response.response.text()) as { results?: unknown };
  const rawResults = Array.isArray(parsed.results) ? parsed.results : [];
  const byId = new Map(
    rawResults
      .filter((item): item is Record<string, unknown> => Boolean(item) && typeof item === 'object')
      .map((item) => [Number(item.id), item]),
  );
  return input.map((item) => parseFidelityReceipt(byId.get(item.id)));
}

function parseFidelityReceipt(raw: Record<string, unknown> | undefined): DubbingTranslationFidelityReceipt {
  const rawChecks = raw?.checks && typeof raw.checks === 'object'
    ? raw.checks as Record<string, unknown>
    : null;
  const valid = Boolean(rawChecks)
    && FIDELITY_CHECKS.every((check) =>
      typeof rawChecks?.[check] === 'string'
      && FIDELITY_STATES.includes(rawChecks[check] as DubbingFidelityState),
    );
  const checks = Object.fromEntries(
    FIDELITY_CHECKS.map((check) => [
      check,
      valid ? rawChecks?.[check] as DubbingFidelityState : 'uncertain',
    ]),
  ) as Record<DubbingFidelityCheck, DubbingFidelityState>;
  const changedChecks = valid
    ? FIDELITY_CHECKS.filter((check) => checks[check] === 'changed')
    : [];
  const uncertainChecks = valid
    ? FIDELITY_CHECKS.filter((check) =>
      checks[check] === 'uncertain'
      || (check === 'targetLanguage' && checks[check] === 'not-applicable'),
    )
    : [];
  const issueCodes = valid
    ? [...changedChecks, ...uncertainChecks]
    : ['judge-invalid'] as const;
  const acceptableCompression = Array.isArray(raw?.acceptableCompression)
    ? raw.acceptableCompression.filter(
      (value): value is DubbingAcceptableCompression =>
        typeof value === 'string'
        && ACCEPTABLE_COMPRESSIONS.includes(value as DubbingAcceptableCompression),
    )
    : [];
  return {
    version: 'editron-dubbing-translation-fidelity-v1',
    outcome: !valid || uncertainChecks.length > 0
      ? 'uncertain'
      : changedChecks.length > 0
        ? 'drift'
        : 'faithful',
    checks,
    issueCodes: [...issueCodes],
    acceptableCompression,
    judgeModel: 'gemini-2.5-flash',
  };
}

function formatFidelityFailures(receipts: DubbingTranslationFidelityReceipt[]): string | null {
  const failures = receipts.flatMap((receipt, index) =>
    receipt.outcome === 'faithful'
      ? []
      : [`phrase-${index + 1}-${receipt.outcome}-${receipt.issueCodes.join('+') || 'unknown'}`],
  );
  return failures.length > 0 ? failures.join(';').slice(0, 400) : null;
}

async function separateAndPersistBackground(job: ChatDubbingJob, sampledPath: string): Promise<DubbingMediaProgress> {
  const sourceAudioRights = await loadDubbingSourceAudioRights(job);
  const audioRights: AudioRightsContract = {
    ...sourceAudioRights,
    mediaRole: 'other',
  };
  const { fal } = await import('@fal-ai/client');
  const key = process.env.FAL_AI_API_KEY || process.env.FAL_KEY;
  if (!key) throw new TerminalDubbingError('fal-key-missing', 'FAL credentials are required for vocal separation.');
  fal.config({ credentials: key });
  const buffer = await readFile(sampledPath);
  const audioUrl = await fal.storage.upload(new File([buffer], `${job._id}.wav`, { type: 'audio/wav' }));
  const startedAt = Date.now();
  try {
    const response = await fal.subscribe('fal-ai/demucs', {
      input: { audio_url: audioUrl, model: 'mdx_extra', stems: ['vocals', 'other'], output_format: 'wav' },
      logs: false,
    });
    const data = (response as { data?: Record<string, unknown>; requestId?: string }).data ?? response as unknown as Record<string, unknown>;
    const stemUrl = fileUrl(data.other);
    if (!stemUrl) throw new Error('Demucs returned no non-vocal background stem.');
    const stemResponse = await fetch(stemUrl);
    if (!stemResponse.ok) throw new Error(`Background stem download failed: ${stemResponse.status}`);
    const stem = Buffer.from(await stemResponse.arrayBuffer());
    const assetId = `dub_bed_${nanoid(12)}`;
    const uploaded = await uploadMedia(stem, job.userId, `${assetId}.wav`, 'audio/wav', { customAssetId: assetId });
    const durationMs = Math.round(((job.timelineEndFrame - job.timelineStartFrame) / job.fps) * 1000);
    const createdAt = new Date();
    const vendorRequestId = (response as { requestId?: string }).requestId;
    const audioSeparationReceipt: AudioSeparationReceipt = {
      version: 'editron-audio-separation-receipt-v1',
      provider: 'fal-ai',
      model: 'fal-ai/demucs:mdx_extra',
      operation: 'preserve-non-vocal-background',
      stem: 'other',
      sourceAssetId: job.assetId,
      derivativeAssetId: assetId,
      jobId: job._id,
      createdAt: createdAt.toISOString(),
      ...(vendorRequestId ? { vendorRequestId } : {}),
    };
    await (await getDatabase()).collection(COLLECTIONS.MEDIA_ASSETS).updateOne(
      { assetId, userId: job.userId },
      {
        $set: {
          projectId: job.projectId,
          type: 'audio',
          source: sourceAudioRights.source,
          cachedUrl: uploaded.signedUrl,
          gcsPath: uploaded.gcsPath,
          r2Key: uploaded.r2Key,
          urlExpiresAt: uploaded.urlExpiresAt ?? new Date('2099-12-31T00:00:00.000Z'),
          durationMs,
          audioDurationMs: durationMs,
          parentAssetId: job.assetId,
          assignmentStatus: 'attached',
          audioRights,
          audioSeparationReceipt,
          updatedAt: createdAt,
        },
        $setOnInsert: {
          assetId,
          userId: job.userId,
          filename: `${assetId}.wav`,
          size: uploaded.size,
          contentType: uploaded.contentType,
          uploadedAt: createdAt,
        },
      },
      { upsert: true },
    );
    await recordProviderCostEvent({
      idempotencyKey: `${job._id}:demucs`,
      status: 'success',
      userId: job.userId,
      projectId: job.projectId,
      service: 'editron',
      action: 'dialogue_dubbing',
      provider: 'fal-ai',
      model: 'fal-ai/demucs:mdx_extra',
      operation: 'audio_source_separation',
      vendorRequestId,
      units: { mediaSeconds: durationMs / 1000, bytesIn: buffer.length, bytesOut: stem.length, functionMs: Date.now() - startedAt },
    });
    return {
      assetId,
      url: uploaded.signedUrl,
      r2Key: uploaded.r2Key,
      gcsPath: uploaded.gcsPath,
      audioRights,
      audioSeparationReceipt,
    };
  } catch (error) {
    await recordProviderCostEvent({
      idempotencyKey: `${job._id}:demucs:failed:${job.failureCount}`,
      status: 'failed',
      userId: job.userId,
      projectId: job.projectId,
      service: 'editron',
      action: 'dialogue_dubbing',
      provider: 'fal-ai',
      model: 'fal-ai/demucs:mdx_extra',
      operation: 'audio_source_separation',
      units: { mediaSeconds: (job.timelineEndFrame - job.timelineStartFrame) / job.fps, bytesIn: buffer.length, functionMs: Date.now() - startedAt },
    });
    throw error;
  }
}

async function loadDubbingSourceAudioRights(job: ChatDubbingJob): Promise<AudioRightsContract> {
  const sourceAsset = await (await getDatabase()).collection(COLLECTIONS.MEDIA_ASSETS).findOne({
    assetId: job.assetId,
    userId: job.userId,
    type: 'video',
  });
  const claim = sourceAsset ? resolveAudioRightsClaim(sourceAsset) : null;
  const rights = claim?.rights;
  if (
    !sourceAsset
    || claim?.issue
    || !rights
    || !rights.licensed
    || rights.mediaRole !== 'native-video'
    || rights.evidence?.sourceAssetId !== job.assetId
  ) {
    throw new TerminalDubbingError(
      'source-audio-rights-unverified',
      claim?.issue ?? 'The selected video lacks stored, licensed native-audio rights.',
    );
  }
  if (rights.source === 'generated') {
    const receiptIssue = getGeneratedNativeVideoReceiptIssue(
      sourceAsset.generatedVideoReceipt,
      {
        assetId: job.assetId,
        licenseId: rights.evidence?.licenseId,
      },
    );
    if (receiptIssue) {
      throw new TerminalDubbingError(
        'source-audio-rights-unverified',
        `The selected generated video has invalid native-audio provenance: ${receiptIssue}`,
      );
    }
  }
  return rights;
}

function stampDubbingSound(
  input: Partial<SoundOverlay>
    & Pick<SoundOverlay, 'id' | 'from' | 'durationInFrames' | 'row' | 'assetId' | 'src' | 'content' | 'styles'>
    & { metadata?: Record<string, unknown> },
  intent: string,
): SoundOverlay {
  return withAtomicOverlayReceipt({
    type: OverlayType.SOUND,
    left: 0,
    top: 0,
    width: 200,
    height: 40,
    isDragging: false,
    rotation: 0,
    _workerAdded: true,
    ...input,
  } as SoundOverlay, {
    source: 'chat-dubbing-worker',
    intent,
    reason: 'durable dubbing job produced grounded audio for the selected canonical timeline window',
  });
}

function fileUrl(value: unknown): string | null {
  if (typeof value === 'string' && /^https?:\/\//i.test(value)) return value;
  if (value && typeof value === 'object' && typeof (value as { url?: unknown }).url === 'string') return (value as { url: string }).url;
  return null;
}
function availablePhraseDurationMs(phrase: DubbingPhraseProgress, fps: number): number {
  const deliveryEndFrame = phrase.deliveryEndFrame ?? phrase.timelineEndFrame;
  return Math.max(1, ((deliveryEndFrame - phrase.timelineStartFrame) / fps) * 1000);
}
function normalizedText(value: string): string { return value.trim().replace(/\s+/g, ' ').toLocaleLowerCase(); }
function nextOverlayId(overlays: Overlay[]) { return Math.max(0, ...overlays.map((overlay) => Number(overlay.id)).filter(Number.isFinite)) + 1; }
function appendUnique(values: string[] | undefined, value: string) { return Array.from(new Set([...(values ?? []), value])); }
function round(value: number, digits: number) { const scale = 10 ** digits; return Math.round(value * scale) / scale; }
