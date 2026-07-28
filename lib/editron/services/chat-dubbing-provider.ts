import { readFile, rm } from 'node:fs/promises';
import { nanoid } from 'nanoid';

import type { Overlay, SoundOverlay } from '@/components/editron/editor/version-7.0.0/types';
import { OverlayType } from '@/components/editron/editor/version-7.0.0/types';
import { withAtomicOverlayReceipt, withAtomicOverlayUpdateReceipt } from '@/lib/editron/engine/overlay-atomic-receipts';
import { getDatabase, COLLECTIONS } from '@/lib/editron/db/mongodb';
import { sampleAudioClip } from '@/lib/editron/services/media/analysis-service';
import { getTranscription } from '@/lib/editron/services/media/transcription-service';
import { segmentNarrativeBeats } from '@/lib/editron/services/narrative-beat-producer';
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
  type DubbingMediaProgress,
  type DubbingPhraseProgress,
} from './chat-dubbing-job';

const PHRASES_PER_DELIVERY = 4;
const MIN_NATURAL_PLAYBACK_RATE = 0.8;
const MAX_NATURAL_PLAYBACK_RATE = 1.25;
const TRANSLATION_SEEDS = [42, 7, 99] as const;

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
  const beats = segmentNarrativeBeats(sourceWords);
  if (beats.length === 0) throw new TerminalDubbingError('no-dubbing-phrases', 'No stable phrase windows could be derived from the selected dialogue.');
  const translations = await translatePhrases(
    beats.map((beat, index) => ({ id: index, text: beat.line })),
    speechCapability.displayName,
  );
  const phrases: DubbingPhraseProgress[] = beats.map((beat, index) => {
    const sourceStartFrame = Math.round((beat.startMs / 1000) * job.fps);
    const sourceEndFrame = Math.max(sourceStartFrame + 1, Math.round((beat.endMs / 1000) * job.fps));
    return {
      index,
      sourceText: beat.line,
      translatedText: translations[index],
      timelineStartFrame: job.timelineStartFrame + Math.max(0, sourceStartFrame - job.sourceStartFrame),
      timelineEndFrame: job.timelineStartFrame + Math.min(job.timelineEndFrame - job.timelineStartFrame, sourceEndFrame - job.sourceStartFrame),
      sourceStartMs: beat.startMs,
      sourceEndMs: beat.endMs,
    };
  }).filter((phrase) => phrase.timelineEndFrame > phrase.timelineStartFrame);
  if (phrases.length === 0) throw new TerminalDubbingError('no-visible-dubbing-phrases', 'All speech fell outside the selected edited clip.');
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
  const generatedThisStep: string[] = [];
  try {
    for (let index = start; index < end; index += 1) {
      const phrase = phrases[index];
      if (phrase.voiceAssetId) continue;
      const voice = await generateVoiceover(phrase.translatedText, job.userId, {
        voice: speechCapability.voiceId,
        language: speechCapability.language,
        contentType: 'dialogue',
        mediaRole: 'dubbing',
      });
      assertGeneratedSpeechCapability(speechCapability, voice.generatedSpeechCapability);
      generatedThisStep.push(voice.audioAssetId);
      const targetDurationMs = ((phrase.timelineEndFrame - phrase.timelineStartFrame) / job.fps) * 1000;
      const playbackRate = voice.durationMs / targetDurationMs;
      if (!Number.isFinite(playbackRate) || playbackRate < MIN_NATURAL_PLAYBACK_RATE || playbackRate > MAX_NATURAL_PLAYBACK_RATE) {
        throw new TerminalDubbingError(
          'unnatural-phrase-fit',
          `Phrase ${index + 1} needs ${playbackRate.toFixed(2)}x playback; allowed natural range is ${MIN_NATURAL_PLAYBACK_RATE}-${MAX_NATURAL_PLAYBACK_RATE}.`,
        );
      }
      phrase.voiceAssetId = voice.audioAssetId;
      phrase.voiceUrl = voice.audioUrl;
      phrase.voiceDurationMs = voice.durationMs;
      phrase.playbackRate = round(playbackRate, 4);
      phrase.voiceAudioRights = voice.audioRights;
      phrase.generatedAudioReceipt = voice.generatedAudioReceipt;
      phrase.generatedSpeechCapability = voice.generatedSpeechCapability;
      generatedAssetIds.push(voice.audioAssetId);
    }
  } catch (error) {
    await cleanupGeneratedAssets(job.userId, generatedThisStep);
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
    durationInFrames: phrase.timelineEndFrame - phrase.timelineStartFrame,
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

async function translatePhrases(input: Array<{ id: number; text: string }>, targetLanguage: string): Promise<string[]> {
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
      const response = await model.generateContent(`Translate each phrase to ${targetLanguage}. Preserve factual meaning, names, numbers, tone, and one-to-one phrase IDs. Do not summarize, censor, add, or merge. Return JSON only.\n${JSON.stringify({ phrases: input })}`);
      const parsed = JSON.parse(response.response.text()) as { phrases?: Array<{ id?: unknown; text?: unknown }> };
      const byId = new Map((parsed.phrases ?? []).map((item) => [Number(item.id), typeof item.text === 'string' ? item.text.trim() : '']));
      const translated = input.map((item) => byId.get(item.id) ?? '');
      if (translated.some((text) => !text)) throw new Error('translation-cardinality-or-empty-text');
      return translated;
    } catch (error) { lastError = error; }
  }
  throw lastError instanceof Error ? lastError : new Error('Translation failed.');
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
function nextOverlayId(overlays: Overlay[]) { return Math.max(0, ...overlays.map((overlay) => Number(overlay.id)).filter(Number.isFinite)) + 1; }
function appendUnique(values: string[] | undefined, value: string) { return Array.from(new Set([...(values ?? []), value])); }
function round(value: number, digits: number) { const scale = 10 ** digits; return Math.round(value * scale) / scale; }
