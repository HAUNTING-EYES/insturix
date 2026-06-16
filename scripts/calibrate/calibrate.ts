/**
 * YouTube Reference Video Calibration Pipeline
 *
 * Downloads YouTube videos, runs the full analysis stack (5-Track + Wav2Vec +
 * V-JEPA + Essentia + transcript), computes signals, scores overlays, and
 * feeds the Thompson Sampling bandits with calibration data.
 *
 * Usage:
 *   npx tsx scripts/calibrate/calibrate.ts                    # all videos in reference-videos.json
 *   npx tsx scripts/calibrate/calibrate.ts --url <yt-url>     # single video
 *   npx tsx scripts/calibrate/calibrate.ts --skip-download     # reuse downloaded videos in .calibration-temp
 *   npx tsx scripts/calibrate/calibrate.ts --local-file <mp4>  # calibrate one local video
 *   npx tsx scripts/calibrate/calibrate.ts --dry-run           # score but don't update bandits
 *
 * Env vars required: MONGODB_URI, GOOGLE_CLOUD_CREDENTIALS, GCS_BUCKET_NAME,
 *   MODAL_TOKEN_ID, MODAL_TOKEN_SECRET, GEMINI_API_KEY (or GOOGLE_API_KEY),
 *   FAL_AI_API_KEY (or FAL_KEY), XAI_API_KEY (optional, for Grok STT)
 */

import { execFileSync, spawnSync } from 'child_process';
import { existsSync, mkdirSync, readFileSync } from 'fs';
import { basename, dirname, extname, join, resolve } from 'path';
import { fileURLToPath, pathToFileURL } from 'url';
import { config } from 'dotenv';
import type { DecisionOutcome } from '../../lib/editron/services/decision-tracker';
import type { BanditContext } from '../../lib/editron/services/genre-parameter-bandit';
import {
  evaluateCalibrationWriteGate,
  formatCalibrationWriteGateDecision,
} from '../../lib/editron/services/calibration-write-gate';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const envPath = join(__dirname, '..', '..', '.env.local');
if (existsSync(envPath)) {
  config({ path: envPath });
  console.log('[Calibrate] Loaded env from .env.local');
}

// ── Stage 1: Download ──────────────────────────────────────────────

interface DownloadResult {
  localPath: string;
  gcsUri: string;
  signedUrl: string;
  durationMs: number;
  title: string;
}

interface CalibrationOptions {
  skipDownload?: boolean;
  dryRun?: boolean;
  allowBanditWrite?: boolean;
  tempDir?: string;
  localFile?: string;
  durationMs?: number;
}

interface VideoInfo {
  title: string;
  durationMs: number;
  cachedPath: string;
}

function sanitizeTitle(title: string): string {
  return (title || 'untitled').replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 60);
}

function getYoutubeInfo(url: string, tempDir: string): VideoInfo {
  // RELIABILITY FIX (calibration runner): yt-dlp `--dump-json` intermittently fails
  // mid-batch - YouTube throttles sequenced requests, and extraction is fragile without
  // a JS runtime. The same URL succeeds when retried in isolation, so a single transient
  // failure used to kill an otherwise-cached video (it took out documentary-explainer &
  // cold-documentary in a batch where MrBeast had just succeeded). Retry with a short
  // backoff before giving up; only throw if every attempt fails.
  const MAX_INFO_ATTEMPTS = 3;
  let infoJson = '';
  let lastInfoError: unknown = null;
  for (let attempt = 1; attempt <= MAX_INFO_ATTEMPTS; attempt += 1) {
    try {
      infoJson = execFileSync(
        'yt-dlp',
        ['--dump-json', '--no-download', url],
        { encoding: 'utf-8', maxBuffer: 10 * 1024 * 1024 },
      );
      break;
    } catch (error) {
      lastInfoError = error;
      console.warn(`[Calibrate] yt-dlp metadata attempt ${attempt}/${MAX_INFO_ATTEMPTS} failed for ${url}: ${error instanceof Error ? error.message : String(error)}`);
      if (attempt < MAX_INFO_ATTEMPTS) Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 2000); // sync backoff
    }
  }
  if (!infoJson) {
    throw new Error(`yt-dlp metadata failed after ${MAX_INFO_ATTEMPTS} attempts for ${url}: ${lastInfoError instanceof Error ? lastInfoError.message : String(lastInfoError)}`);
  }
  const info = JSON.parse(infoJson);
  const title = sanitizeTitle(info.title || 'untitled');
  return {
    title,
    durationMs: Math.round((info.duration || 0) * 1000),
    cachedPath: join(tempDir, `${title}.mp4`),
  };
}

async function detectLocalDurationMs(localPath: string): Promise<number> {
  try {
    const ffprobeOutput = execFileSync(
      'ffprobe',
      ['-v', 'error', '-show_entries', 'format=duration', '-of', 'default=noprint_wrappers=1:nokey=1', localPath],
      { encoding: 'utf-8', maxBuffer: 1024 * 1024 },
    ).trim();
    const durationSeconds = Number(ffprobeOutput);
    if (Number.isFinite(durationSeconds) && durationSeconds > 0) {
      return Math.round(durationSeconds * 1000);
    }
  } catch {
    // Fall through to Remotion's metadata reader.
  }

  try {
    const mediaUtils = await import('@remotion/media-utils') as {
      getVideoMetadata?: (src: string) => Promise<{ durationInSeconds?: number }>;
    };
    const metadata = await mediaUtils.getVideoMetadata?.(localPath);
    if (metadata?.durationInSeconds && Number.isFinite(metadata.durationInSeconds)) {
      return Math.round(metadata.durationInSeconds * 1000);
    }
  } catch {
    // The caller will throw a better actionable message below.
  }

  throw new Error(`Could not detect duration for ${localPath}. Pass --duration-ms <milliseconds>.`);
}

async function uploadCalibrationVideo(localPath: string, title: string, durationOverrideMs?: number): Promise<DownloadResult> {
  if (!existsSync(localPath)) {
    throw new Error(`Local calibration video not found: ${localPath}`);
  }

  const durationMs = durationOverrideMs && durationOverrideMs > 0
    ? durationOverrideMs
    : await detectLocalDurationMs(localPath);
  const fileBuffer = readFileSync(localPath);
  const { uploadToGCS, refreshSignedUrl } = await import('../../lib/editron/services/gcs-service');
  const uploadName = `${sanitizeTitle(title)}${extname(localPath) || '.mp4'}`;
  const gcsResult = await uploadToGCS(
    fileBuffer,
    'calibration',
    uploadName,
    'video/mp4',
  );
  const signed = await refreshSignedUrl(gcsResult.gcsPath);

  console.log(`[Calibrate] Uploaded local file: ${gcsResult.gcsPath} (${(fileBuffer.length / 1024 / 1024).toFixed(1)}MB, ${(durationMs / 1000).toFixed(1)}s)`);

  return {
    localPath,
    gcsUri: `gs://${process.env.GCS_BUCKET_NAME}/${gcsResult.gcsPath}`,
    signedUrl: signed.url,
    durationMs,
    title: sanitizeTitle(title),
  };
}

async function useCachedDownload(url: string, tempDir: string): Promise<DownloadResult> {
  if (!existsSync(tempDir)) mkdirSync(tempDir, { recursive: true });
  const info = getYoutubeInfo(url, tempDir);
  if (!existsSync(info.cachedPath)) {
    throw new Error(`Cached video missing for "${info.title}": ${info.cachedPath}. Run without --skip-download or pass --local-file.`);
  }
  console.log(`[Calibrate] Reusing cached download: ${info.cachedPath}`);
  const uploaded = await uploadCalibrationVideo(info.cachedPath, info.title);
  return { ...uploaded, durationMs: info.durationMs || uploaded.durationMs };
}

async function downloadVideo(url: string, tempDir: string): Promise<DownloadResult> {
  if (!existsSync(tempDir)) mkdirSync(tempDir, { recursive: true });

  console.log(`[Calibrate] Downloading: ${url}`);

  const info = getYoutubeInfo(url, tempDir);
  const { title, durationMs } = info;

  const outPath = info.cachedPath;
  if (!existsSync(outPath)) {
    execFileSync(
      'yt-dlp',
      ['-f', 'bestvideo[height<=1080][ext=mp4]+bestaudio[ext=m4a]/best[height<=1080][ext=mp4]/best', '--merge-output-format', 'mp4', '-o', outPath, url],
      { stdio: 'inherit', maxBuffer: 50 * 1024 * 1024 },
    );
  } else {
    console.log(`[Calibrate] Already downloaded: ${outPath}`);
  }

  console.log(`[Calibrate] Uploading to GCS...`);
  const uploaded = await uploadCalibrationVideo(outPath, title);
  return { ...uploaded, durationMs, title };
}

// ── Stage 2: Analyze ───────────────────────────────────────────────

interface AnalysisResult {
  fiveTrack: any;
  wav2vec: any;
  vjepa: any;
  essentia: any;
  transcript: { words: Array<{ word: string; startMs: number; endMs: number }>; transcript: string };
}

const REFERENCE_ANALYSIS_SEEDS = [42, 7, 99] as const;
const MIN_REFERENCE_CUT_SEPARATION_MS = 220;
const REFERENCE_CUT_ADAPTIVE_RATIO = 3;
const REFERENCE_CUT_MIN_SCDET_SCORE = 12;
const REFERENCE_CUT_WINDOW_FRAMES = 4;
const REFERENCE_CUT_LOCAL_DOMINANCE = 1.12;

export interface ReferenceSceneScore {
  timestampMs: number;
  score: number;
}

function stripJsonFence(text: string): string {
  const trimmed = text.trim();
  if (!trimmed.startsWith('```')) return trimmed;
  return trimmed.replace(/^```(?:json)?\n?/, '').replace(/\n?```$/, '').trim();
}

export function buildReferenceEditingAnalysisRequest(videoUri: string, durationMs: number, seed: number = 42) {
  const cleanUri = videoUri.trim();
  if (!cleanUri) {
    throw new Error('[Calibrate] Reference 5-Track analysis requires a video URI; refusing text-only calibration.');
  }

  return {
    contents: [{
      role: 'user',
      parts: [
        { fileData: { mimeType: 'video/mp4', fileUri: cleanUri } },
        {
          text: `Analyze this video for editing. Return JSON with: { "shots": [{"startMs": N, "endMs": N, "shotType": "...", "motionIntensity": 0-1}], "naturalCutPoints": [{"timestampMs": N, "reason": "..."}], "transitionTypes": [{"timestampMs": N, "type": "hard-cut|dissolve|whip-pan|fade"}] }. Video duration: ${durationMs}ms. Analyze the ACTUAL editing decisions - where cuts happen, what transitions are used, pacing patterns. Return only valid JSON.`,
        },
      ],
    }],
    generationConfig: {
      responseMimeType: 'application/json',
      seed,
      maxOutputTokens: 65536,
    },
  };
}

export function parseReferenceEditingAnalysisText(text: string): any {
  const parsed = JSON.parse(stripJsonFence(text || '{}'));
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new Error('reference analysis JSON must be an object');
  }
  return parsed;
}

export async function analyzeReferenceEditingWithGemini(model: any, videoUri: string, durationMs: number): Promise<any> {
  let lastError: unknown = null;

  for (const seed of REFERENCE_ANALYSIS_SEEDS) {
    try {
      const result = await model.generateContent(buildReferenceEditingAnalysisRequest(videoUri, durationMs, seed));
      const text = result.response.text()?.trim() || '{}';
      const fiveTrack = parseReferenceEditingAnalysisText(text);
      console.log(`[Calibrate] 5-Track: ${fiveTrack.shots?.length || 0} shots, ${fiveTrack.naturalCutPoints?.length || 0} cuts, ${fiveTrack.transitionTypes?.length || 0} transitions (seed=${seed})`);
      return fiveTrack;
    } catch (error: any) {
      lastError = error;
      console.warn(`[Calibrate] 5-Track attempt failed (seed=${seed}): ${error?.message || error}`);
    }
  }

  throw new Error(`[Calibrate] 5-Track reference analysis failed after ${REFERENCE_ANALYSIS_SEEDS.length} video-grounded attempts: ${lastError instanceof Error ? lastError.message : String(lastError)}`);
}

function uniqueSortedTimesMs(values: number[], minSeparationMs = MIN_REFERENCE_CUT_SEPARATION_MS): number[] {
  const sorted = values
    .filter((value) => Number.isFinite(value) && value > 0)
    .map((value) => Math.round(value))
    .sort((a, b) => a - b);
  const unique: number[] = [];
  for (const timestampMs of sorted) {
    const previous = unique[unique.length - 1] ?? Number.NEGATIVE_INFINITY;
    if (timestampMs - previous >= minSeparationMs) unique.push(timestampMs);
  }
  return unique;
}

export function buildDeterministicReferenceEditAnalysisFromSceneTimes(
  sceneTimesMs: number[],
  durationMs: number,
  source: string = 'deterministic-adaptive-cut-detect',
): any {
  const cutTimes = uniqueSortedTimesMs(sceneTimesMs)
    .filter((timestampMs) => timestampMs < durationMs - MIN_REFERENCE_CUT_SEPARATION_MS);
  const boundaries = [0, ...cutTimes, durationMs];
  const shots = boundaries.slice(0, -1).map((startMs, index) => ({
    startMs,
    endMs: boundaries[index + 1],
    shotType: 'measured',
    motionIntensity: 0.5,
    source,
  }));

  return {
    shots,
    naturalCutPoints: cutTimes.map((timestampMs) => ({
      timestampMs,
      reason: 'measured-hard-cut-spike',
      source,
      confidence: 0.9,
    })),
    transitionTypes: cutTimes.map((timestampMs) => ({
      timestampMs,
      type: 'hard-cut',
      source,
      confidence: 0.9,
    })),
    referenceEvidence: {
      source,
      measuredCutCount: cutTimes.length,
      measuredShotCount: shots.length,
    },
  };
}

export function parseFfmpegSceneDetectionOutput(output: string): number[] {
  const times: number[] = [];
  const regex = /pts_time:([0-9]+(?:\.[0-9]+)?)/g;
  let match: RegExpExecArray | null;
  while ((match = regex.exec(output)) !== null) {
    times.push(Number(match[1]) * 1000);
  }
  return uniqueSortedTimesMs(times);
}

export function parseFfmpegSceneScoreOutput(output: string): ReferenceSceneScore[] {
  const samples: ReferenceSceneScore[] = [];
  let pendingScore: number | null = null;
  let pendingTimeSeconds: number | null = null;

  for (const line of output.split(/\r?\n/)) {
    const scoreMatch = line.match(/lavfi\.scd\.score[:=]\s*([0-9]+(?:\.[0-9]+)?)/);
    const timeMatch = line.match(/lavfi\.scd\.time[:=]\s*([0-9]+(?:\.[0-9]+)?)/);
    if (scoreMatch) pendingScore = Number(scoreMatch[1]);
    if (timeMatch) pendingTimeSeconds = Number(timeMatch[1]);
    if (
      pendingScore !== null
      && pendingTimeSeconds !== null
      && Number.isFinite(pendingScore)
      && Number.isFinite(pendingTimeSeconds)
    ) {
      samples.push({
        timestampMs: Math.round(pendingTimeSeconds * 1000),
        score: pendingScore,
      });
      pendingScore = null;
      pendingTimeSeconds = null;
    }
  }

  const byTimestamp = new Map<number, number>();
  for (const sample of samples) {
    if (!Number.isFinite(sample.timestampMs) || sample.timestampMs <= 0 || !Number.isFinite(sample.score)) continue;
    byTimestamp.set(sample.timestampMs, Math.max(byTimestamp.get(sample.timestampMs) ?? 0, sample.score));
  }

  return [...byTimestamp.entries()]
    .map(([timestampMs, score]) => ({ timestampMs, score }))
    .sort((a, b) => a.timestampMs - b.timestampMs);
}

export function classifyReferenceCutsFromSceneScores(
  samples: ReferenceSceneScore[],
  durationMs: number,
): number[] {
  const ordered = samples
    .filter((sample) => (
      Number.isFinite(sample.timestampMs)
      && sample.timestampMs > 0
      && sample.timestampMs < durationMs - MIN_REFERENCE_CUT_SEPARATION_MS
      && Number.isFinite(sample.score)
      && sample.score >= 0
    ))
    .sort((a, b) => a.timestampMs - b.timestampMs);

  const selectedTimes: number[] = [];
  let previousCutMs = Number.NEGATIVE_INFINITY;
  for (let index = 0; index < ordered.length; index += 1) {
    const current = ordered[index];
    if (current.score < REFERENCE_CUT_MIN_SCDET_SCORE) continue;
    if (current.timestampMs - previousCutMs < MIN_REFERENCE_CUT_SEPARATION_MS) continue;

    const previousScore = ordered[index - 1]?.score ?? 0;
    const nextScore = ordered[index + 1]?.score ?? 0;
    if (current.score < previousScore || current.score < nextScore) continue;

    let neighbourScoreTotal = 0;
    let neighbourCount = 0;
    for (let offset = -REFERENCE_CUT_WINDOW_FRAMES; offset <= REFERENCE_CUT_WINDOW_FRAMES; offset += 1) {
      if (offset === 0) continue;
      const neighbour = ordered[index + offset];
      if (!neighbour) continue;
      neighbourScoreTotal += neighbour.score;
      neighbourCount += 1;
    }

    const neighbourMean = neighbourCount > 0 ? neighbourScoreTotal / neighbourCount : 0;
    const adaptiveRatio = neighbourMean <= 0.001 ? 255 : current.score / neighbourMean;
    if (adaptiveRatio < REFERENCE_CUT_ADAPTIVE_RATIO) continue;

    const strongestImmediateNeighbour = Math.max(previousScore, nextScore, 0);
    if (
      strongestImmediateNeighbour > 0.001
      && current.score < strongestImmediateNeighbour * REFERENCE_CUT_LOCAL_DOMINANCE
    ) {
      continue;
    }

    selectedTimes.push(current.timestampMs);
    previousCutMs = current.timestampMs;
  }

  return uniqueSortedTimesMs(selectedTimes);
}

function cutTimesFromAnalysis(analysis: any): number[] {
  const cuts = Array.isArray(analysis?.naturalCutPoints) ? analysis.naturalCutPoints : [];
  return uniqueSortedTimesMs(cuts.map(readTimestampMs).filter((value: number | null): value is number => value !== null));
}

function detectReferenceEditingFromLocalVideo(localPath: string | undefined, durationMs: number): any | null {
  if (!localPath || !existsSync(localPath)) {
    console.warn('[Calibrate] Deterministic reference detection skipped: local video unavailable');
    return null;
  }

  const MAX_FFMPEG_ATTEMPTS = 3;
  let sceneScores: ReferenceSceneScore[] | null = null;
  for (let attempt = 1; attempt <= MAX_FFMPEG_ATTEMPTS; attempt += 1) {
    const result = spawnSync(
      'ffmpeg',
      [
        '-hide_banner',
        '-nostats',
        '-i',
        localPath,
        '-vf',
        'scdet=threshold=0,metadata=print:file=-',
        '-an',
        '-f',
        'null',
        '-',
      ],
      { encoding: 'utf-8', maxBuffer: 100 * 1024 * 1024 },
    );
    if (!result.error && result.status === 0) {
      sceneScores = parseFfmpegSceneScoreOutput(`${result.stdout || ''}\n${result.stderr || ''}`);
      break;
    }
    const reason = result.error ? result.error.message : `exit ${result.status}`;
    console.warn(`[Calibrate] FFmpeg adaptive scene-score attempt ${attempt}/${MAX_FFMPEG_ATTEMPTS} failed: ${reason}`);
    if (attempt < MAX_FFMPEG_ATTEMPTS) Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 2000);
  }

  if (!sceneScores) return null;
  const cutTimes = classifyReferenceCutsFromSceneScores(sceneScores, durationMs);
  const analysis = buildDeterministicReferenceEditAnalysisFromSceneTimes(
    cutTimes,
    durationMs,
    'deterministic-adaptive-cut-detect',
  );
  analysis.referenceEvidence = {
    ...analysis.referenceEvidence,
    scoreSampleCount: sceneScores.length,
    thresholdSelection: 'adaptive-spike-vs-plateau',
    adaptiveRatio: REFERENCE_CUT_ADAPTIVE_RATIO,
    minScore: REFERENCE_CUT_MIN_SCDET_SCORE,
    windowFrames: REFERENCE_CUT_WINDOW_FRAMES,
    localDominance: REFERENCE_CUT_LOCAL_DOMINANCE,
  };
  console.log(`[Calibrate] Deterministic reference selected ${analysis.naturalCutPoints.length} adaptive hard-cut spikes from ${sceneScores.length} frame scores`);
  return analysis;
}

export function mergeReferenceEditingEvidence(geminiFiveTrack: any, deterministicFiveTrack: any | null): any {
  if (!deterministicFiveTrack) {
    // CORRECTNESS FIX (calibration northstar): deterministic FFmpeg timing is the source
    // of truth. When it is unavailable (e.g. ffmpeg failed on every threshold after
    // retries), do NOT silently pass off Gemini's coarse, under-counted cut list as the
    // reference - that reintroduces the unreliable reference this change set exists to
    // remove (MrBeast fell back to 47 events / 1.8 cuts-min this way). Fail loud and tag
    // the evidence so the diagnostic report - and any future bandit gating - can see the
    // timing is Gemini-only and must NOT be trusted for tuning.
    console.warn('[Calibrate] WARNING: deterministic reference timing UNAVAILABLE - reference is Gemini-only and UNRELIABLE (not a measured cut source). Do not tune on this video.');
    return {
      ...geminiFiveTrack,
      referenceEvidence: {
        ...(geminiFiveTrack?.referenceEvidence || {}),
        timingSource: 'gemini-only',
        deterministicAvailable: false,
        reliable: false,
      },
    };
  }
  const semanticTransitions = Array.isArray(geminiFiveTrack?.transitionTypes)
    ? geminiFiveTrack.transitionTypes
    : [];
  const transitionTypes = deterministicFiveTrack.transitionTypes.map((transition: any) => {
    const measuredTimestamp = readTimestampMs(transition);
    const semanticMatch = semanticTransitions
      .map((semanticTransition: any) => ({
        transition: semanticTransition,
        distanceMs: Math.abs((readTimestampMs(semanticTransition) ?? Number.POSITIVE_INFINITY) - (measuredTimestamp ?? Number.NEGATIVE_INFINITY)),
      }))
      .filter((candidate: any) => Number.isFinite(candidate.distanceMs) && candidate.distanceMs <= 900)
      .sort((a: any, b: any) => a.distanceMs - b.distanceMs)[0]?.transition;
    const semanticType = normalizeTransitionType(semanticMatch?.type);
    return {
      ...transition,
      type: semanticMatch && semanticType !== 'unknown' ? semanticType : transition.type,
      semanticSource: semanticMatch ? 'gemini-vision' : undefined,
    };
  });

  return {
    ...geminiFiveTrack,
    shots: deterministicFiveTrack.shots,
    naturalCutPoints: deterministicFiveTrack.naturalCutPoints,
    transitionTypes,
    referenceEvidence: {
      ...(geminiFiveTrack?.referenceEvidence || {}),
      ...(deterministicFiveTrack.referenceEvidence || {}),
      semanticSource: 'gemini-vision',
      timingSource: deterministicFiveTrack.referenceEvidence?.source || 'deterministic-scene-detect',
      geminiShotCount: Array.isArray(geminiFiveTrack?.shots) ? geminiFiveTrack.shots.length : 0,
      geminiCutCount: Array.isArray(geminiFiveTrack?.naturalCutPoints) ? geminiFiveTrack.naturalCutPoints.length : 0,
    },
  };
}

function summarizePrimitivePresence(vjepa: any): string {
  const segments = Array.isArray(vjepa?.segments) ? vjepa.segments : [];
  if (segments.length === 0) return 'no segments';
  const keys = ['motionVector', 'mainSubject', 'textBoxes', 'textCoverage', 'objectCount', 'faceCount', 'negativeSpace'];
  return keys.map((key) => {
    const count = segments.filter((segment: any) => segment.primitivePresence?.[key] === true).length;
    return `${key}=${((count / segments.length) * 100).toFixed(1)}%`;
  }).join(' ');
}

async function analyzeVideo(
  signedUrl: string,
  durationMs: number,
  title: string,
  gcsUri?: string,
  localPath?: string,
): Promise<AnalysisResult> {
  console.log(`\n[Calibrate] ═══ Analyzing: ${title} (${(durationMs / 1000).toFixed(0)}s) ═══`);

  const segmentDuration = 5000;
  const segmentCount = Math.ceil(durationMs / segmentDuration);
  const segments = Array.from({ length: segmentCount }, (_, i) => ({
    startMs: i * segmentDuration,
    endMs: Math.min((i + 1) * segmentDuration, durationMs),
  }));

  console.log(`[Calibrate] ${segments.length} segments (${segmentDuration / 1000}s each)`);

  // Run Modal endpoints in parallel
  const [wav2vec, vjepa, essentia] = await Promise.all([
    (async () => {
      console.log('[Calibrate] → Wav2Vec (vocal emotion)...');
      const { analyzeAudioWithWav2Vec } = await import('../../lib/editron/services/wav2vec-service');
      const result = await analyzeAudioWithWav2Vec(signedUrl, segments);
      console.log(`[Calibrate] ✓ Wav2Vec: ${result?.segments?.length || 0} segments`);
      return result;
    })(),
    (async () => {
      console.log('[Calibrate] → V-JEPA (visual significance)...');
      const { analyzeVideoWithVjepa } = await import('../../lib/editron/services/vjepa-service');
      const result = await analyzeVideoWithVjepa(signedUrl, segments);
      console.log(`[Calibrate] ✓ V-JEPA: ${result?.segments?.length || 0} segments`);
      console.log(`[Calibrate] V-JEPA primitives: ${summarizePrimitivePresence(result)}`);
      return result;
    })(),
    (async () => {
      console.log('[Calibrate] → Essentia (music analysis)...');
      const { analyzeMusicContent } = await import('../../lib/editron/services/music-analysis-service');
      const result = await analyzeMusicContent(signedUrl);
      console.log(`[Calibrate] ✓ Essentia: bpm=${result?.bpm || 'N/A'}, beats=${result?.beats?.length || 0}`);
      return result;
    })(),
  ]);

  // 5-Track via Gemini Vision (sequential — rate limited)
  console.log('[Calibrate] → 5-Track (Gemini Vision)...');
  console.log('[Calibrate] -> Deterministic reference edit detection (FFmpeg)...');
  const deterministicFiveTrack = detectReferenceEditingFromLocalVideo(localPath, durationMs);

  const { GoogleGenerativeAI } = await import('@google/generative-ai');
  const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY || '');
  const model = genAI.getGenerativeModel({ model: 'gemini-2.5-flash' });

  const referenceVideoUri = signedUrl || gcsUri || '';
  console.log(`[Calibrate] 5-Track reference video attached: ${referenceVideoUri.slice(0, 80)}${referenceVideoUri.length > 80 ? '...' : ''}`);
  const geminiFiveTrack = await analyzeReferenceEditingWithGemini(model, referenceVideoUri, durationMs);
  const fiveTrack = mergeReferenceEditingEvidence(geminiFiveTrack, deterministicFiveTrack);
  if (fiveTrack.referenceEvidence?.timingSource) {
    console.log(`[Calibrate] Reference timing source: ${fiveTrack.referenceEvidence.timingSource}; Gemini cuts=${fiveTrack.referenceEvidence.geminiCutCount}, measured cuts=${fiveTrack.referenceEvidence.measuredCutCount}`);
  }
  // Transcription via Grok STT directly (no MongoDB asset lookup needed for calibration)
  console.log('[Calibrate] → Transcription (Grok STT)...');
  let transcript = { words: [] as Array<{ word: string; startMs: number; endMs: number }>, transcript: '' };
  const xaiKey = process.env.XAI_API_KEY;
  if (xaiKey) {
    try {
      const formData = new FormData();
      // Send as binary file — GCS signed URLs return headers xAI can't detect format from.
      // The local file is already downloaded in Stage 1.
      const localFile = join(process.cwd(), '.calibration-temp', `${title}.mp4`);
      if (existsSync(localFile)) {
        const fileBytes = readFileSync(localFile);
        formData.append('file', new Blob([fileBytes], { type: 'video/mp4' }), `${title}.mp4`);
      } else {
        formData.append('url', signedUrl);
      }
      formData.append('language', 'en');
      formData.append('format', 'true');
      formData.append('diarize', 'true');

      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 180_000); // 180s for file upload
      const response = await fetch('https://api.x.ai/v1/stt', {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${xaiKey}` },
        body: formData,
        signal: controller.signal,
      });
      clearTimeout(timer);

      if (response.ok) {
        const data = await response.json();
        if (data.words?.length > 0) {
          transcript = {
            words: data.words.map((w: any) => ({
              word: w.text || '',
              startMs: Math.round((w.start || 0) * 1000),
              endMs: Math.round((w.end || 0) * 1000),
            })),
            transcript: data.text || data.words.map((w: any) => w.text).join(' '),
          };
        }
        console.log(`[Calibrate] ✓ Transcript: ${transcript.words.length} words via Grok STT`);
      } else {
        const body = await response.text().catch(() => '');
        console.warn(`[Calibrate] ✗ Grok STT ${response.status}: ${body.slice(0, 200)}`);
      }
    } catch (e: any) {
      console.warn(`[Calibrate] ✗ Transcription failed: ${e.message}`);
    }
  } else {
    console.log('[Calibrate] XAI_API_KEY not set, trying Whisper...');
  }

  // Fallback: Whisper on fal.ai (if Grok skipped or failed)
  if (transcript.words.length === 0) {
    try {
      const falKey = process.env.FAL_AI_API_KEY || process.env.FAL_KEY;
      if (falKey) {
        const { fal } = await import('@fal-ai/client');
        fal.config({ credentials: falKey });
        const whisperResult = await Promise.race([
          fal.subscribe('fal-ai/wizper', {
            input: { audio_url: signedUrl, task: 'transcribe', chunk_level: 'segment' },
            logs: false,
          }),
          new Promise<never>((_, reject) => setTimeout(() => reject(new Error('Whisper timeout (90s)')), 90_000)),
        ]);
        const data = whisperResult.data as any;
        if (data?.chunks?.length) {
          const words: typeof transcript.words = [];
          for (const chunk of data.chunks) {
            const segText = (chunk.text || '').trim();
            const segStart = (chunk.timestamp?.[0] || 0) * 1000;
            const segEnd = (chunk.timestamp?.[1] || 0) * 1000;
            for (const w of segText.split(/\s+/).filter(Boolean)) {
              const totalChars = segText.split(/\s+/).filter(Boolean).reduce((s: number, w: string) => s + w.length, 0);
              const dur = (w.length / totalChars) * (segEnd - segStart);
              words.push({ word: w, startMs: Math.round(segStart), endMs: Math.round(segStart + dur) });
              // Note: startMs is approximate (segment-level, not word-level)
            }
          }
          transcript = { words, transcript: data.text || words.map(w => w.word).join(' ') };
          console.log(`[Calibrate] ✓ Transcript: ${transcript.words.length} words via Whisper`);
        }
      }
    } catch (e: any) {
      console.warn(`[Calibrate] ✗ Whisper failed: ${e.message}`);
    }
  }

  // Fallback: Gemini transcription (always available — GEMINI_API_KEY is set)
  if (transcript.words.length === 0) {
    try {
      const apiKey = process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY;
      if (apiKey) {
        console.log('[Calibrate] Trying Gemini transcription...');
        const { GoogleGenerativeAI } = await import('@google/generative-ai');
        const genAI = new GoogleGenerativeAI(apiKey);
        const model = genAI.getGenerativeModel({ model: 'gemini-2.5-flash' });

        // Download a small chunk for transcription (first 5 min = enough for speech coverage signal)
        const dlCtrl = new AbortController();
        const dlTimer = setTimeout(() => dlCtrl.abort(), 60_000);
        const audioResp = await fetch(signedUrl, { signal: dlCtrl.signal });
        clearTimeout(dlTimer);
        const buffer = Buffer.from(await audioResp.arrayBuffer());
        const mimeType = audioResp.headers.get('content-type') || 'video/mp4';

        const result = await Promise.race([
          model.generateContent([
            { inlineData: { data: buffer.toString('base64'), mimeType } },
            { text: 'Transcribe this audio. Return JSON array: [{"word":"the_word","start":0.123,"end":0.456}]. Seconds as decimals. ALL spoken words. Return ONLY the JSON array.' },
          ]),
          new Promise<never>((_, reject) => setTimeout(() => reject(new Error('Gemini transcription timeout (120s)')), 120_000)),
        ]);

        let text = result.response.text()?.trim() || '';
        if (text.startsWith('```')) text = text.replace(/^```(?:json)?\n?/, '').replace(/\n?```$/, '').trim();
        const parsed = JSON.parse(text);
        if (Array.isArray(parsed) && parsed.length > 0) {
          transcript = {
            words: parsed.map((w: any) => ({
              word: String(w.word || ''),
              startMs: Math.round((w.start || 0) * 1000),
              endMs: Math.round((w.end || 0) * 1000),
            })).filter((w: any) => w.word.length > 0),
            transcript: parsed.map((w: any) => w.word).join(' '),
          };
          console.log(`[Calibrate] ✓ Transcript: ${transcript.words.length} words via Gemini`);
        }
      }
    } catch (e: any) {
      console.warn(`[Calibrate] ✗ Gemini transcription failed: ${e.message}`);
    }
  }

  return { fiveTrack, wav2vec, vjepa, essentia, transcript };
}

// ── Stage 3: Score ─────────────────────────────────────────────────

interface ScoringResult {
  signals: Record<string, number>;
  systemDecisions: Array<{ overlayId: string; score: number; category: string; outputValues: Record<string, any> }>;
  referencePatterns: {
    cutCount: number;
    cutsPerMinute: number;
    transitionTypes: Record<string, number>;
    avgShotDurationMs: number;
    specialTransitionCount: number;
    specialTransitionsPerMinute: number;
    hardCutRatio: number;
    transitionDominance: number;
    evidenceSource: string;
  };
}

const HARD_CUT_TYPES = new Set(['hard-cut', 'hard_cut', 'hardcut', 'cut', 'jump-cut', 'jump_cut']);

function normalizeTransitionType(value: unknown): string {
  const raw = typeof value === 'string' && value.trim().length > 0 ? value : 'unknown';
  return raw.trim().toLowerCase().replace(/_/g, '-');
}

function isHardCutType(value: unknown): boolean {
  return HARD_CUT_TYPES.has(normalizeTransitionType(value));
}

function readTimestampMs(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (!value || typeof value !== 'object') return null;
  const record = value as Record<string, unknown>;
  for (const key of ['timestampMs', 'timeMs', 'startMs']) {
    const timestamp = record[key];
    if (typeof timestamp === 'number' && Number.isFinite(timestamp)) return timestamp;
  }
  return null;
}

function uniqueTimestampCount(values: Array<number | null>, toleranceMs = 250): number {
  const sorted = values
    .filter((value): value is number => typeof value === 'number' && Number.isFinite(value))
    .sort((a, b) => a - b);
  let count = 0;
  let lastAccepted = Number.NEGATIVE_INFINITY;
  for (const timestamp of sorted) {
    if (timestamp - lastAccepted > toleranceMs) {
      count += 1;
      lastAccepted = timestamp;
    }
  }
  return count;
}

export function deriveReferencePatterns(fiveTrack: any, durationMs: number): ScoringResult['referencePatterns'] {
  const durationMinutes = Math.max(durationMs / 60000, 1 / 60);
  const naturalCuts = Array.isArray(fiveTrack?.naturalCutPoints) ? fiveTrack.naturalCutPoints : [];
  const transitions = Array.isArray(fiveTrack?.transitionTypes) ? fiveTrack.transitionTypes : [];
  const shots = Array.isArray(fiveTrack?.shots) ? fiveTrack.shots : [];

  const transitionCounts: Record<string, number> = {};
  for (const transition of transitions) {
    const type = normalizeTransitionType((transition as Record<string, unknown>)?.type);
    transitionCounts[type] = (transitionCounts[type] || 0) + 1;
  }

  const shotBoundaryTimes = shots
    .slice(1)
    .map((shot: any) => readTimestampMs({ timestampMs: shot?.startMs }));
  const transitionTimes = transitions.map(readTimestampMs);
  const naturalCutTimes = naturalCuts.map(readTimestampMs);
  const timestampEvidenceCount = uniqueTimestampCount([
    ...naturalCutTimes,
    ...transitionTimes,
    ...shotBoundaryTimes,
  ]);

  const evidenceCandidates = [
    { source: 'timestamp-union', count: timestampEvidenceCount },
    { source: 'transitionTypes', count: transitions.length },
    { source: 'shot-boundaries', count: Math.max(0, shots.length - 1) },
    { source: 'naturalCutPoints', count: naturalCuts.length },
  ].sort((a, b) => b.count - a.count);
  const selectedEvidence = evidenceCandidates[0] ?? { source: 'none', count: 0 };

  const specialTransitionCount = transitions.filter((transition: any) => !isHardCutType(transition?.type)).length;
  const hardCutCount = Math.max(0, selectedEvidence.count - specialTransitionCount);
  const dominantTransitionCount = Object.values(transitionCounts).reduce((max, count) => Math.max(max, count), 0);
  const avgShotDurationMs = shots.length > 0
    ? shots.reduce((sum: number, shot: any) => {
      const startMs = typeof shot?.startMs === 'number' ? shot.startMs : 0;
      const endMs = typeof shot?.endMs === 'number' ? shot.endMs : startMs;
      return sum + Math.max(0, endMs - startMs);
    }, 0) / shots.length
    : 0;

  return {
    cutCount: selectedEvidence.count,
    cutsPerMinute: selectedEvidence.count / durationMinutes,
    transitionTypes: transitionCounts,
    avgShotDurationMs,
    specialTransitionCount,
    specialTransitionsPerMinute: specialTransitionCount / durationMinutes,
    hardCutRatio: selectedEvidence.count > 0 ? hardCutCount / selectedEvidence.count : 0,
    transitionDominance: transitions.length > 0 ? dominantTransitionCount / transitions.length : 0,
    evidenceSource: selectedEvidence.source,
  };
}

export function normalizeCutsPerMinuteToPacingVelocity(cutsPerMinute: number): number {
  if (!Number.isFinite(cutsPerMinute) || cutsPerMinute <= 0) return 0.25;
  if (cutsPerMinute <= 4) return 0.25 + (cutsPerMinute / 4) * 0.15;
  if (cutsPerMinute <= 8) return 0.4 + ((cutsPerMinute - 4) / 4) * 0.2;
  if (cutsPerMinute <= 18) return 0.62 + ((cutsPerMinute - 8) / 10) * 0.28;
  if (cutsPerMinute <= 30) return 0.9 + ((cutsPerMinute - 18) / 12) * 0.1;
  return 1;
}

export function applyReferencePacingSignals(
  signals: Record<string, number>,
  referencePatterns: ScoringResult['referencePatterns'],
): Record<string, number> {
  const observedPacing = normalizeCutsPerMinuteToPacingVelocity(referencePatterns.cutsPerMinute);
  const basePacing = Number.isFinite(signals.pacing_velocity) ? signals.pacing_velocity : 0.5;
  const blendedPacing = Math.max(0, Math.min(1, basePacing * 0.25 + observedPacing * 0.75));

  return {
    ...signals,
    pacing_velocity: blendedPacing,
    'personality.pacing_velocity': blendedPacing,
    rhythm_density: blendedPacing,
    'rhythm.density': blendedPacing,
    'structural.cumulative_edit_density': referencePatterns.cutsPerMinute,
    'structural.observed_edit_density': observedPacing,
  };
}

async function scoreVideo(
  analysis: AnalysisResult,
  durationMs: number,
): Promise<ScoringResult> {
  console.log(`\n[Calibrate] ═══ Scoring ═══`);

  const { buildSignalTimeline } = await import('../../lib/editron/services/signal-registry');
  const { scoreAllOverlays } = await import('../../lib/editron/engine/utility-scorer');
  const defs = (await import('../../lib/editron/engine/overlay-definitions.json')).default;
  const fps = 30;

  const rawFootage = {
    transcription: {
      segments: analysis.transcript.words.length > 0 ? [{
        text: analysis.transcript.transcript,
        startMs: analysis.transcript.words[0]?.startMs ?? 0,
        endMs: analysis.transcript.words[analysis.transcript.words.length - 1]?.endMs ?? durationMs,
        words: analysis.transcript.words,
      }] : [],
      words: analysis.transcript.words,
    },
    originalDurationMs: durationMs,
    silenceGaps: [],
    contentTypeDetection: { contentType: 'unknown', confidence: 0.5 },
  };

  const mockAnalyses = [{
    assetId: 'calibration',
    motionSegments: (analysis.fiveTrack.shots || []).map((s: any) => ({
      startFrame: Math.round(((s.startMs ?? 0) / 1000) * fps),
      endFrame: Math.round(((s.endMs ?? s.startMs ?? 0) / 1000) * fps),
      type: 'measured',
      intensity: s.motionIntensity ?? 0.5,
      startMs: s.startMs,
      endMs: s.endMs,
      motionIntensity: s.motionIntensity ?? 0.5,
      cameraMotion: { type: 'static' },
    })),
    keyframeAnalyses: (analysis.fiveTrack.shots || []).map((s: any) => ({
      frameNumber: Math.round(((s.startMs ?? 0) / 1000) * fps),
      timestampMs: s.startMs,
      shotType: s.shotType || 'medium',
      brightness: 0.5,
      colorDiversity: 0.5,
      energy: s.motionIntensity ?? 0.5,
    })),
    subjectTracks: [],
    speechSegments: analysis.transcript.words.length > 0 ? [{
      startMs: analysis.transcript.words[0].startMs,
      endMs: analysis.transcript.words[analysis.transcript.words.length - 1].endMs,
      text: analysis.transcript.transcript,
    }] : [],
    musicStructure: analysis.essentia ? {
      bpm: analysis.essentia.bpm,
      beats: analysis.essentia.beats || [],
      sections: analysis.essentia.sections || [],
      energyCurve: analysis.essentia.energyCurve || [],
    } : undefined,
  }];

  const timeline = buildSignalTimeline(
    mockAnalyses as any,
    rawFootage as any,
    [],
    fps,
    analysis.vjepa,
    analysis.wav2vec,
    analysis.essentia,
  );

  // Build averaged global signal snapshot (same as Director does)
  const gridFrames = Array.from(timeline.gridSignals.keys());
  const avgSignals: Record<string, number> = {};
  const avgCounts: Record<string, number> = {};
  for (const f of gridFrames) {
    const snap = timeline.gridSignals.get(f)!;
    for (const [k, v] of Object.entries(snap)) {
      if (typeof v === 'number' && isFinite(v)) {
        avgSignals[k] = (avgSignals[k] ?? 0) + v;
        avgCounts[k] = (avgCounts[k] ?? 0) + 1;
      }
    }
  }
  for (const k of Object.keys(avgSignals)) avgSignals[k] /= avgCounts[k];
  for (const [k, v] of Object.entries(timeline.globalSignals)) {
    if (typeof v === 'number' && isFinite(v)) avgSignals[k] = v;
  }
  // Bridge personality namespace
  if (avgSignals['content.formality'] !== undefined) avgSignals['formality'] = avgSignals['content.formality'];
  if (avgSignals['personality.enthusiasm'] !== undefined) avgSignals['enthusiasm'] = avgSignals['personality.enthusiasm'];
  if (avgSignals['personality.warmth'] !== undefined) avgSignals['warmth'] = avgSignals['personality.warmth'];
  if (avgSignals['personality.emotional_arousal'] !== undefined) avgSignals['emotional_arousal'] = avgSignals['personality.emotional_arousal'];
  if (avgSignals['personality.pacing_velocity'] !== undefined) avgSignals['pacing_velocity'] = avgSignals['personality.pacing_velocity'];
  if (avgSignals['personality.visceral_impact'] !== undefined) avgSignals['visceral_impact'] = avgSignals['personality.visceral_impact'];
  if (avgSignals['personality.visual_dependency'] !== undefined) avgSignals['visual_dependency'] = avgSignals['personality.visual_dependency'];
  if (avgSignals['personality.humor'] !== undefined) avgSignals['humor'] = avgSignals['personality.humor'];

  const referencePatterns = deriveReferencePatterns(analysis.fiveTrack, durationMs);
  const basePacing = avgSignals.pacing_velocity ?? 0.5;
  Object.assign(avgSignals, applyReferencePacingSignals(avgSignals, referencePatterns));
  console.log(`[Calibrate] Observed pacing: ${referencePatterns.cutsPerMinute.toFixed(1)} cuts/min -> pacing_velocity ${basePacing.toFixed(3)} to ${(avgSignals.pacing_velocity ?? 0).toFixed(3)}`);

  console.log('[Calibrate] Signals computed:');
  for (const key of ['formality', 'enthusiasm', 'warmth', 'emotional_arousal', 'pacing_velocity', 'visceral_impact', 'visual_dependency', 'humor']) {
    console.log(`  ${key}: ${(avgSignals[key] ?? 0).toFixed(3)}`);
  }

  // Score all overlays
  const allResults = scoreAllOverlays(defs as any, avgSignals);
  const systemDecisions = allResults.map(r => ({
    overlayId: r.overlayId,
    score: r.totalScore,
    category: r.category,
    outputValues: r.outputValues,
  }));
  console.log(`[Calibrate] Overlay decisions: ${systemDecisions.length} above minScore`);

  console.log(`[Calibrate] Reference patterns: ${referencePatterns.cutCount} edit events (${referencePatterns.evidenceSource}), ${referencePatterns.cutsPerMinute.toFixed(1)}/min, avg shot ${(referencePatterns.avgShotDurationMs / 1000).toFixed(1)}s`);
  console.log(`  Transitions: ${JSON.stringify(referencePatterns.transitionTypes)} special=${referencePatterns.specialTransitionCount} (${referencePatterns.specialTransitionsPerMinute.toFixed(1)}/min), hardCutRatio=${referencePatterns.hardCutRatio.toFixed(2)}`);

  return { signals: avgSignals, systemDecisions, referencePatterns };
}

// ── Stage 4: Feed Bandits ──────────────────────────────────────────

async function feedBandits(
  scoring: ScoringResult,
  label: string,
  dryRun: boolean,
  allowBanditWrite: boolean,
): Promise<void> {
  console.log(`\n[Calibrate] ═══ Feeding Bandits ${dryRun ? '(DRY RUN)' : ''} ═══`);

  // Compare system decisions against reference patterns
  const outcomes: Array<{ technique: string; reason: string; outcome: 'kept' | 'removed'; thresholdIds: string[] }> = [];

  // Pacing calibration: compare system's pacing signals against reference cuts/min
  const refCPM = scoring.referencePatterns.cutsPerMinute;
  const systemPacing = scoring.signals['pacing_velocity'] ?? 0.5;
  const pacingAligned = (refCPM > 8 && systemPacing > 0.6) || (refCPM < 4 && systemPacing < 0.4) || (refCPM >= 4 && refCPM <= 8 && systemPacing >= 0.3 && systemPacing <= 0.7);
  outcomes.push({
    technique: 'pacing',
    reason: 'energy_peak',
    outcome: pacingAligned ? 'kept' : 'removed',
    thresholdIds: ['speech-coverage-threshold', 'time-since-cut-density-threshold'],
  });

  // Transition calibration: does system pick special transitions only when the
  // reference style actually uses them at meaningful density?
  const refTransitions = scoring.referencePatterns.transitionTypes;
  const systemTransitions = scoring.systemDecisions.filter(d => d.category === 'transition');
  const refSpecialRatio = scoring.referencePatterns.cutCount > 0
    ? scoring.referencePatterns.specialTransitionCount / scoring.referencePatterns.cutCount
    : 0;
  const expectsSpecialTransitions = scoring.referencePatterns.specialTransitionsPerMinute >= 0.75 || refSpecialRatio >= 0.08;
  const systemHasSpecialTransition = systemTransitions.length > 0;
  const referenceIsHardCutDominant = (refTransitions['hard-cut'] || 0) > 0 && scoring.referencePatterns.hardCutRatio >= 0.7;
  outcomes.push({
    technique: 'transition',
    reason: 'visual_peak',
    outcome: expectsSpecialTransitions
      ? (systemHasSpecialTransition ? 'kept' : 'removed')
      : (!systemHasSpecialTransition || referenceIsHardCutDominant ? 'kept' : 'removed'),
    thresholdIds: ['visual-change-threshold', 'low-motion-visual-threshold'],
  });

  // Music sync calibration: if reference has music, do signals detect it?
  const hasRefMusic = scoring.signals['audio.music_beat'] !== undefined;
  const essentiaDetected = (scoring.signals['audio.bpm'] ?? 0) > 0;
  if (hasRefMusic || essentiaDetected) {
    outcomes.push({
      technique: 'beat-sync',
      reason: 'music_beat',
      outcome: essentiaDetected ? 'kept' : 'removed',
      thresholdIds: ['min-beat-density-bpm', 'sparse-rhythm-bpm'],
    });
  }

  // MG property calibration: do overlay scores produce reasonable output?
  const mgDecisions = scoring.systemDecisions.filter(d => d.category === 'mg-property');
  const fontSize = mgDecisions.find(d => d.overlayId === 'mg.typography.font_size')?.outputValues?.fontSize as number;
  if (fontSize) {
    const reasonable = fontSize >= 48 && fontSize <= 160;
    outcomes.push({
      technique: 'graphic',
      reason: 'energy_peak',
      outcome: reasonable ? 'kept' : 'removed',
      thresholdIds: ['mg-element-count-limit', 'content-shape-significance'],
    });
  }

  // Animation calibration: does the system pick appropriate entrance for this content?
  const entranceWinner = scoring.systemDecisions
    .filter(d => d.overlayId.startsWith('mg.animation.entrance_') && d.overlayId !== 'mg.animation.entrance_speed')
    .sort((a, b) => b.score - a.score)[0];
  if (entranceWinner) {
    const formalContent = (scoring.signals['formality'] ?? 0) > 0.6;
    const isPop = entranceWinner.overlayId.includes('pop');
    const animAppropriate = !(formalContent && isPop);
    outcomes.push({
      technique: 'graphic',
      reason: 'vocal_emphasis',
      outcome: animAppropriate ? 'kept' : 'removed',
      thresholdIds: ['enthusiasm-scale-pulse-trigger', 'warmth-breathe-trigger'],
    });
  }

  console.log(`[Calibrate] Outcomes: ${outcomes.filter(o => o.outcome === 'kept').length} kept, ${outcomes.filter(o => o.outcome === 'removed').length} removed`);
  for (const o of outcomes) {
    console.log(`  ${o.outcome === 'kept' ? '✓' : '✗'} ${o.technique}/${o.reason} → ${o.outcome} (thresholds: ${o.thresholdIds.join(', ')})`);
  }

  if (dryRun) {
    console.log('[Calibrate] DRY RUN — skipping bandit update');
    return;
  }

  const writeGate = evaluateCalibrationWriteGate({ dryRun, allowBanditWrite });
  if (!writeGate.allowed) {
    throw new Error(`[Calibrate] ${formatCalibrationWriteGateDecision(writeGate)}`);
  }
  console.log(`[Calibrate] ${formatCalibrationWriteGateDecision(writeGate)}`);

  // Feed to threshold bandit
  try {
    const { loadThresholdBanditState, updateThresholdBandit, saveThresholdBanditState } = await import('../../lib/editron/services/threshold-bandit');

    const userId = `calibration-${label}`;
    let state = await loadThresholdBanditState(userId);
    if (!state) {
      state = { userId, totalOutcomes: 0, arms: new Map(), lastUpdated: Date.now() };
    }

    const speechCov = scoring.signals['content.speech_coverage'] ?? scoring.signals['speech.coverage'] ?? 0;
    const durationS = scoring.signals['video.duration_s'] ?? 60;
    const context: BanditContext = {
      contentType: label,
      speechCoverageBucket: speechCov > 0.6 ? 'high' : speechCov > 0.3 ? 'medium' : 'low',
      durationBucket: durationS > 300 ? 'long' : durationS > 60 ? 'medium' : 'short',
      platform: 'youtube',
    };

    const banditOutcomes: DecisionOutcome[] = outcomes.map((o, index) => ({
      snapshotId: `calibration-${label}-${index}-${o.technique}-${o.reason}`,
      technique: o.technique,
      reason: o.reason,
      outcome: o.outcome as 'kept' | 'modified' | 'removed',
      originalFrame: 0,
      signalContext: scoring.signals,
    }));

    updateThresholdBandit(state, banditOutcomes, context);
    await saveThresholdBanditState(state);
    console.log(`[Calibrate] Bandit updated: ${state.totalOutcomes} total outcomes for ${userId}`);
  } catch (banditErr: any) {
    console.error(`[Calibrate] Bandit update failed: ${banditErr.message}`);
  }
}

// ── Orchestrator ───────────────────────────────────────────────────

async function calibrateVideo(
  url: string,
  label: string,
  options: CalibrationOptions,
): Promise<void> {
  const tempDir = options.tempDir || join(process.cwd(), '.calibration-temp');
  const startTime = Date.now();

  console.log(`\n${'═'.repeat(60)}`);
  console.log(`[Calibrate] Video: ${label}`);
  console.log(`[Calibrate] Source: ${options.localFile || url}`);
  console.log(`${'═'.repeat(60)}`);

  // Stage 1: Download
  let download: DownloadResult;
  if (options.localFile) {
    const localPath = resolve(options.localFile);
    const title = label === 'manual' ? sanitizeTitle(basename(localPath, extname(localPath))) : label;
    download = await uploadCalibrationVideo(localPath, title, options.durationMs);
  } else if (options.skipDownload) {
    console.log('[Calibrate] Reusing cached download (--skip-download)');
    download = await useCachedDownload(url, tempDir);
  } else {
    download = await downloadVideo(url, tempDir);
  }

  // Stage 2: Analyze
  const analysis = await analyzeVideo(download.signedUrl, download.durationMs, download.title || label, download.gcsUri, download.localPath);

  // Stage 3: Score
  const scoring = await scoreVideo(analysis, download.durationMs);

  // Stage 4: Feed Bandits
  await feedBandits(scoring, label, options.dryRun || false, options.allowBanditWrite === true);

  const elapsed = ((Date.now() - startTime) / 1000).toFixed(0);
  console.log(`\n[Calibrate] ✓ Complete: ${label} in ${elapsed}s`);
}

// ── CLI Entry Point ────────────────────────────────────────────────

function argValue(args: string[], name: string): string | undefined {
  const index = args.indexOf(name);
  return index >= 0 ? args[index + 1] : undefined;
}

function parsePositiveInteger(value: string | undefined, name: string): number | undefined {
  if (value === undefined) return undefined;
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed <= 0) {
    throw new Error(`Invalid ${name} value: ${value}`);
  }
  return parsed;
}

function shuffleInPlace<T>(items: T[]): T[] {
  for (let i = items.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [items[i], items[j]] = [items[j], items[i]];
  }
  return items;
}

function printHelp(): void {
  console.log(`
Editron calibration

Usage:
  pnpm calibrate:editron
  pnpm calibrate:editron:auto
  pnpm calibrate:editron -- --url <youtube-url> --label <label>
  pnpm calibrate:editron -- --labels energetic-vlog,tech-review-premium --limit 2
  pnpm calibrate:editron -- --local-file ".calibration-temp/10_Things_Iman_Gadzhi_Can_t_Live_Without_2024.mp4" --label energetic-vlog --dry-run

Options:
  --dry-run              Score and print outcomes without updating bandits
  --allow-bandit-write   Permit threshold-bandit writes after rendered evidence review
  --skip-download        Reuse cached .calibration-temp video for configured YouTube URLs
  --url <url>            Calibrate one YouTube URL
  --local-file <path>    Calibrate one local video file
  --label <label>        Label for single URL/local-file runs
  --labels <a,b,c>       Calibrate only selected reference-video labels
  --limit <n>            Process at most n configured videos
  --max-videos <n>       Alias for --limit
  --shuffle              Shuffle configured videos before applying --limit
  --duration-ms <ms>     Override local video duration when ffprobe/metadata detection is unavailable
  --temp-dir <path>      Calibration cache directory; default .calibration-temp
`);
}

async function main() {
  const args = process.argv.slice(2);
  if (args.includes('--help') || args.includes('-h')) {
    printHelp();
    return;
  }

  const dryRun = args.includes('--dry-run');
  const allowBanditWrite = args.includes('--allow-bandit-write');
  const skipDownload = args.includes('--skip-download');
  const singleUrl = argValue(args, '--url') ?? null;
  const localFile = argValue(args, '--local-file');
  const label = argValue(args, '--label') || 'manual';
  const tempDir = argValue(args, '--temp-dir') || join(process.cwd(), '.calibration-temp');
  const durationMsArg = argValue(args, '--duration-ms');
  const durationMs = durationMsArg ? Number(durationMsArg) : undefined;
  const limit = parsePositiveInteger(argValue(args, '--limit') ?? argValue(args, '--max-videos'), '--limit');
  const selectedLabels = new Set(
    (argValue(args, '--labels') || '')
      .split(/[,\s]+/)
      .map((item) => item.trim())
      .filter(Boolean),
  );
  const shuffle = args.includes('--shuffle');

  if (durationMsArg && (!durationMs || !Number.isFinite(durationMs))) {
    throw new Error(`Invalid --duration-ms value: ${durationMsArg}`);
  }

  if (localFile) {
    await calibrateVideo('', label, { dryRun, allowBanditWrite, localFile, durationMs, tempDir });
    return;
  }

  if (singleUrl) {
    await calibrateVideo(singleUrl, label, { dryRun, allowBanditWrite, skipDownload, tempDir });
    return;
  }

  const configPath = join(__dirname, 'reference-videos.json');
  const config = JSON.parse(readFileSync(configPath, 'utf-8'));
  let videos = config.videos.filter((v: any) => v.url && v.url.length > 0);
  if (selectedLabels.size > 0) {
    videos = videos.filter((v: any) => selectedLabels.has(v.label));
  }
  if (shuffle) {
    videos = shuffleInPlace([...videos]);
  }
  if (limit !== undefined) {
    videos = videos.slice(0, limit);
  }

  if (videos.length === 0) {
    console.error('[Calibrate] No videos selected. Check scripts/calibrate/reference-videos.json, --labels, and --limit.');
    process.exit(1);
  }

  console.log(`[Calibrate] Processing ${videos.length} reference videos (dryRun=${dryRun}, allowBanditWrite=${allowBanditWrite}, skipDownload=${skipDownload}, shuffle=${shuffle}, tempDir=${tempDir})`);

  let completed = 0;
  let failed = 0;
  for (const video of videos) {
    try {
      await calibrateVideo(video.url, video.label, { dryRun, allowBanditWrite, skipDownload, tempDir });
      completed += 1;
    } catch (err: any) {
      failed += 1;
      console.error(`[Calibrate] FAILED: ${video.label} — ${err.message}`);
    }
  }

  console.log(`\n${'═'.repeat(60)}`);
  console.log(`[Calibrate] All done. ${completed}/${videos.length} videos completed, ${failed} failed.`);
}

const isCli = process.argv[1]
  ? import.meta.url === pathToFileURL(resolve(process.argv[1])).href
  : false;

if (isCli) {
  main()
    .then(() => process.exit(0))
    .catch(err => {
      console.error('[Calibrate] Fatal:', err);
      process.exit(1);
    });
}
