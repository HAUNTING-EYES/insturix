/**
 * Lane B orchestrator — one call that turns a spoken line into a moving, speaking
 * avatar shot: Chatterbox (cloned voice) → MEASURE → fit → Seedance (body to the
 * measured duration) → pad audio to align → Kling LipSync (mouth).
 *
 * Audio-first law: the shot length is bound to the MEASURED voice, never an estimate.
 * The shot is the unit (≤10s, the relip cap) — a line that overruns is returned as
 * `needs_fit` (rewrite/atempo) WITHOUT spending on body+relip. Longer speech is many
 * shots, stitched downstream in Editron.
 */

import {
  fitLineToShotBudget,
  measureWavDurationSec,
  padWavToSec,
  RELIP_MAX_SHOT_SEC,
  type FitDecision,
} from './avatar-audio-fit';
import { generateAvatarShot } from './generate-avatar-shot';
import { relipWithKling } from './avatar-relip';
import { stageAvatarReference } from './avatar-reference-staging';

export interface LaneBShotInput {
  avatarImageRefs: string[];
  /**
   * Optional: regenerate a top-tier, scene/wardrobe-staged, identity-locked reference
   * from `avatarImageRefs` before animating (Nano Banana). The biggest quality lever —
   * `scenePrompt` is the wardrobe/scene description.
   */
  stageReference?: { scenePrompt: string };
  /** Hosted voice sample for Chatterbox to clone. */
  voiceSampleUrl: string;
  lineText: string;
  motionPrompt?: string;
  resolution?: string;
  userId?: string;
  /** Defaults to the relip cap (10s). */
  shotBudgetSec?: number;
}

export interface LaneBShotResult {
  status: 'done' | 'needs_fit';
  fit: FitDecision;
  /** Present when status === 'done'. The final relipped speaking shot. */
  videoUrl?: string;
  durationSec?: number;
  /** The aligned cloned-voice audio (padded to the shot duration). */
  audioUrl?: string;
  /** The pre-relip Seedance body video (debug/inspection). */
  bodyVideoUrl?: string;
}

export interface LaneBDeps {
  /** Synthesize the cloned voice (Chatterbox). Returns a hosted WAV URL. */
  synthesizeVoice?: (input: { text: string; voiceSampleUrl: string; userId?: string }) => Promise<{ audioUrl: string }>;
  /** Fetch audio bytes for measurement + padding. */
  fetchAudioBytes?: (url: string) => Promise<Buffer>;
  /** Upload the aligned WAV, return a hosted URL. */
  uploadAudio?: (wav: Buffer, userId: string) => Promise<{ audioUrl: string }>;
  generateShot?: typeof generateAvatarShot;
  relip?: typeof relipWithKling;
  /** Measure the generated body video's real duration (moov atom). */
  measureVideoDurationSec?: (url: string) => Promise<number | null>;
  /** Stage a scene/wardrobe reference from the user's photos (Nano Banana). */
  stageReference?: typeof stageAvatarReference;
}

export async function buildLaneBSpeakingShot(input: LaneBShotInput, deps: LaneBDeps = {}): Promise<LaneBShotResult> {
  if (!input.avatarImageRefs.length) throw new Error('Lane B needs at least one avatar reference image.');
  if (!input.lineText.trim()) throw new Error('Lane B needs a non-empty line to speak.');

  const budget = Math.min(input.shotBudgetSec ?? RELIP_MAX_SHOT_SEC, RELIP_MAX_SHOT_SEC);
  const userId = input.userId ?? 'avatar-lane-b';
  const synthesizeVoice = deps.synthesizeVoice ?? defaultSynthesizeVoice;
  const fetchAudioBytes = deps.fetchAudioBytes ?? defaultFetchAudioBytes;
  const uploadAudio = deps.uploadAudio ?? defaultUploadAudio;
  const generateShot = deps.generateShot ?? generateAvatarShot;
  const relip = deps.relip ?? relipWithKling;
  const measureVideoDurationSec = deps.measureVideoDurationSec ?? defaultMeasureVideoDurationSec;
  const stageReference = deps.stageReference ?? stageAvatarReference;

  // 1. Clone voice + read the line.
  const { audioUrl: rawAudioUrl } = await synthesizeVoice({ text: input.lineText, voiceSampleUrl: input.voiceSampleUrl, userId });

  // 2. MEASURE the real VO duration (never estimate).
  const rawWav = await fetchAudioBytes(rawAudioUrl);
  const measuredSec = measureWavDurationSec(rawWav);
  if (measuredSec === null) {
    throw new Error('Lane B could not measure the synthesized voice duration (not a parseable WAV). Fix the synth output; do not estimate.');
  }

  // 3. Fit to the shot budget. If it does not fit, stop BEFORE spending on body+relip.
  const fit = fitLineToShotBudget(measuredSec, budget);
  if (fit.action !== 'ok') {
    return { status: 'needs_fit', fit, audioUrl: rawAudioUrl };
  }

  // 4. Generate the body to a duration >= the measured voice. The body model may snap
  //    to its own options (Kling i2v = 5s or 10s), so we align the voice to what it
  //    ACTUALLY produced (step 5), not to the request. Native audio (if any) is
  //    discarded — the voice arrives at the relip step.
  // Optionally regenerate a top-tier scene/wardrobe reference from the user's photos
  // before animating — a cleaner reference is the biggest quality lever (less drift on
  // camera moves, cleaner mouth for relip).
  const bodyRefs = input.stageReference
    ? [(await stageReference({ sourceImageUrls: input.avatarImageRefs, scenePrompt: input.stageReference.scenePrompt })).imageUrl]
    : input.avatarImageRefs;

  const requestSec = Math.min(Math.max(Math.ceil(measuredSec), 4), budget);
  const body = await generateShot({
    avatarImageRefs: bodyRefs,
    motionPrompt: input.motionPrompt,
    durationSec: requestSec,
    resolution: input.resolution ?? '1080p',
  });

  // 5. The body's ACTUAL length — measure the file, fall back to the adapter's report.
  const bodySec = (await measureVideoDurationSec(body.videoUrl)) ?? body.durationSec;
  if (bodySec + 0.05 < measuredSec) {
    // Body came out shorter than the voice — padding can't fix it without cutting
    // words. Fail loud rather than clip the line.
    throw new Error(`Body shot (${bodySec}s) is shorter than the voice (${measuredSec}s) — would cut words. Shorten the line.`);
  }

  // 6. Pad the voice with silence to EXACTLY the body length (audio-first alignment),
  //    then relip the mouth onto the cloned voice.
  const alignedWav = padWavToSec(rawWav, bodySec);
  const { audioUrl: alignedAudioUrl } = await uploadAudio(alignedWav, userId);
  const relipped = await relip({
    videoUrl: body.videoUrl,
    audioUrl: alignedAudioUrl,
    videoDurationSec: bodySec,
    audioDurationSec: bodySec,
  });

  return {
    status: 'done',
    fit,
    videoUrl: relipped.videoUrl,
    durationSec: bodySec,
    audioUrl: alignedAudioUrl,
    bodyVideoUrl: body.videoUrl,
  };
}

// ─── Default implementations (real services; all injectable for tests) ─────────

const defaultSynthesizeVoice: NonNullable<LaneBDeps['synthesizeVoice']> = async ({ text, voiceSampleUrl, userId }) => {
  const { createDefaultChatterboxClient } = await import('./avatar-chatterbox-client');
  const client = createDefaultChatterboxClient();
  const result = await client.synthesize({
    text,
    voiceReference: { sourceType: 'uploaded_voice_sample', url: voiceSampleUrl },
    userId,
  });
  return { audioUrl: result.audioUrl };
};

const defaultFetchAudioBytes: NonNullable<LaneBDeps['fetchAudioBytes']> = async (url) => {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`Lane B failed to fetch audio (HTTP ${response.status}) from ${url}.`);
  return Buffer.from(await response.arrayBuffer());
};

const defaultUploadAudio: NonNullable<LaneBDeps['uploadAudio']> = async (wav, userId) => {
  const { uploadMedia } = await import('@/lib/editron/services/upload-service');
  const result = await uploadMedia(wav, userId, 'avatar-lane-b-voice.wav', 'audio/wav');
  return { audioUrl: result.signedUrl };
};

const defaultMeasureVideoDurationSec: NonNullable<LaneBDeps['measureVideoDurationSec']> = async (url) => {
  const { extractMP4Duration } = await import('@/lib/editron/services/mp4-duration-service');
  return extractMP4Duration(url);
};
