/**
 * 5-Layer Analysis Pipeline
 *
 * From the Editron Master Architecture brainstorm:
 *
 * Layer 1: Shot/Scene Detection (free, CPU — PySceneDetect/FFmpeg)
 * Layer 2: Optical Flow / Motion Analysis (cheap, CPU — per-frame motion vectors)
 * Layer 3: Audio Analysis (beats + transients + energy envelope + speech)
 * Layer 4: Semantic Keyframe Analysis (Gemini Vision on strategic frames)
 * Layer 5: Subject Tracking (lightweight ML between keyframes)
 *
 * Plus two parallel semantic tracks:
 * Track A: Speech Semantic Layer (Gemini Flash transcript classification)
 * Track C: Music Structure Layer (sections, tension curve, drops/builds)
 *
 * Analysis runs ONCE per asset on ingest. Results cached in MongoDB.
 * The Reactive Edit Engine reads all layers to generate frame-accurate
 * Edit Decision Lists.
 */

import { getDatabase, COLLECTIONS } from '@/lib/editron/db/mongodb';
import { ANALYSIS_MODEL_NAME } from '@/lib/editron/utils/gemini-model-factory';
import { TokenTracker, type TokenUsageMetadata } from '@/lib/editron/utils/token-tracker';
import {
  assertAssetAnalysisSourceBindingV2,
  FIVE_TRACK_ANALYSIS_VERSION_V2,
  getSourceBoundAnalysisV2,
  hashAssetAnalysisInputV2,
  saveSourceBoundAnalysisV2,
  type AssetAnalysisSourceBindingV2,
} from './asset-analysis-source-cache-v2';
import type { PipelineWarningCollector } from './pipeline-warnings';
import { waitForGeminiFileActive } from './gemini-file-active';

// ─── Gemini 429 Retry ───────────────────────────────────────────
// Gemini rate limits are transient. Exponential backoff (2s, 4s, 8s) recovers
// in ~14s worst case. Without this, 5/7 analyses fail in Mode 1 tests.

async function withRetry<T>(
  fn: () => Promise<T>,
  label: string,
  maxRetries: number = 3,
): Promise<T> {
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await fn();
    } catch (err: any) {
      const is429 = err?.status === 429 || err?.message?.includes('429') || err?.message?.includes('RESOURCE_EXHAUSTED');
      if (!is429 || attempt === maxRetries) throw err;
      const delayMs = Math.pow(2, attempt + 1) * 1000; // 2s, 4s, 8s
      console.warn(`[Analysis] ${label}: 429 rate limit, retrying in ${delayMs / 1000}s (attempt ${attempt + 1}/${maxRetries})`);
      await new Promise(r => setTimeout(r, delayMs));
    }
  }
  throw new Error('unreachable');
}

interface GeminiUsageCapture {
  tracker: TokenTracker;
  requestCount: number;
  missingUsageCount: number;
}

function createGeminiUsageCapture(): GeminiUsageCapture {
  return {
    tracker: new TokenTracker(ANALYSIS_MODEL_NAME),
    requestCount: 0,
    missingUsageCount: 0,
  };
}

function recordGeminiUsage(result: unknown, usageCapture?: GeminiUsageCapture): void {
  if (!usageCapture) return;
  usageCapture.requestCount += 1;

  const metadata = extractGeminiUsageMetadata(result);
  if (!metadata) {
    usageCapture.missingUsageCount += 1;
    return;
  }

  usageCapture.tracker.addUsage(metadata);
}

function extractGeminiUsageMetadata(result: unknown): TokenUsageMetadata | null {
  const root = asRecord(result);
  const response = asRecord(root?.response);
  const usage = asRecord(root?.usageMetadata) ?? asRecord(response?.usageMetadata);
  if (!usage) return null;

  const promptTokenCount = readNumber(usage.promptTokenCount ?? usage.inputTokenCount ?? usage.inputTokens);
  const candidatesTokenCount = readNumber(usage.candidatesTokenCount ?? usage.outputTokenCount ?? usage.outputTokens);
  const totalTokenCount = readNumber(usage.totalTokenCount ?? usage.totalTokens);
  return promptTokenCount || candidatesTokenCount || totalTokenCount
    ? { promptTokenCount, candidatesTokenCount, totalTokenCount }
    : null;
}

function buildGeminiProviderUsage(usageCapture: GeminiUsageCapture): FiveTrackProviderUsage | undefined {
  if (usageCapture.requestCount === 0) return undefined;
  const breakdown = usageCapture.tracker.getBreakdown();
  return {
    provider: 'google-gemini',
    model: ANALYSIS_MODEL_NAME,
    operation: 'video_analysis',
    inputTokens: positiveNumberOrUndefined(breakdown.input),
    outputTokens: positiveNumberOrUndefined(breakdown.output),
    totalTokens: positiveNumberOrUndefined(breakdown.total),
    requestCount: usageCapture.requestCount,
    missingUsageCount: usageCapture.missingUsageCount,
  };
}

function asRecord(value: unknown): Record<string, any> | null {
  return value && typeof value === 'object' ? value as Record<string, any> : null;
}

function readNumber(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0 ? value : undefined;
}

function positiveNumberOrUndefined(value: number): number | undefined {
  return Number.isFinite(value) && value > 0 ? value : undefined;
}

// ─── Types ───────────────────────────────────────────────────────

/** Layer 1: Shot boundaries */
export interface Shot {
  startFrame: number;
  endFrame: number;
  durationMs: number;
  /** Keyframe selected for semantic analysis */
  keyframeIndex?: number;
}

/** Layer 2: Per-segment motion data */
export interface MotionSegment {
  startFrame: number;
  endFrame: number;
  motionIntensity: number;       // 0-1
  cameraMotion: 'static' | 'pan-left' | 'pan-right' | 'tilt-up' | 'tilt-down' |
                'zoom-in' | 'zoom-out' | 'tracking' | 'handheld' | 'dolly';
  /** Direction of dominant motion (degrees, 0=right, 90=up) */
  motionDirection?: number;
}

/** Layer 3: Audio analysis */
export interface AudioAnalysis {
  beats: number[];               // Frame numbers
  transients: number[];          // Impact/accent frame numbers
  speechSegments: Array<{
    startMs: number;
    endMs: number;
    text: string;
  }>;
  silences: Array<{
    startMs: number;
    endMs: number;
    durationMs: number;
  }>;
  /** Per-second energy level (0-1) */
  energyCurve: Array<{ timestampMs: number; energy: number }>;
}

/** Layer 4: Semantic keyframe analysis (Gemini Vision) */
export interface FrameAnalysis {
  frame: number;
  timestampMs: number;
  description: string;
  subjects: Array<{
    label: string;
    boundingBox?: { x: number; y: number; w: number; h: number };
    confidence: number;
    isMainSubject: boolean;
  }>;
  shotType: 'wide' | 'medium' | 'close-up' | 'extreme-close-up' | 'unknown';
  cameraAngle: string;
  dominantColors: string[];
  colorTemperatureK?: number;
  brightness: number;            // 0-1
  moodScore: number;             // -1 to 1
  energyLevel: number;           // 0-1
  /** Editorial signals */
  naturalCutPoint: boolean;
  naturalCutReason?: string;
}

/** Layer 5: Subject tracking */
export interface SubjectTrackEntry {
  subjectId: string;
  label: string;
  category: 'person' | 'product' | 'object' | 'text' | 'logo' | 'animal';
  frames: Array<{
    frame: number;
    box: { x: number; y: number; w: number; h: number };
    confidence: number;
  }>;
  totalScreenTimeMs: number;
}

/** Track A: Speech semantic classification */
export interface SpeechSegment {
  startMs: number;
  endMs: number;
  startFrame: number;
  endFrame: number;
  text: string;
  contentType: ContentType;
  entities: Array<{
    type: 'number' | 'percentage' | 'currency' | 'name' | 'product' | 'concept' | 'action' | 'emotion';
    value: string;
    unit?: string;
    isGrowth?: boolean;
    comparisonTarget?: string;
  }>;
  /** Legacy field name. New analyses must use only "visual-explanation" or "none"; never a template/form label. */
  suggestedGraphicType: string;
  /** Semantic evidence fields for the downstream MG engine: value, label, name, title, body, from/to, items, etc. */
  suggestedGraphicData: Record<string, any>;
  confidence: number;
  keywordHighlights: Array<{ word: string; startMs: number; endMs: number; importance: WordImportance }>;
}

export type ContentType =
  | 'statistic' | 'claim' | 'question' | 'step_instruction'
  | 'story_moment' | 'cta' | 'transition_phrase' | 'emphasis'
  | 'comparison' | 'social_proof' | 'definition' | 'neutral';

export type WordImportance = 'normal' | 'keyword' | 'emphasis' | 'stat' | 'name';

/** Track C: Music structure */
export interface MusicStructure {
  bpm: number;
  key?: string;
  timeSignature?: string;
  sections: MusicSection[];
  /** Per-second energy (0-1) */
  energyCurve: Array<{ timestampMs: number; energy: number }>;
  /** Tension curve (0-1) — builds toward peaks, releases after */
  tensionCurve: Array<{ timestampMs: number; tension: number }>;
  drops: number[];               // Energy peak frames
  builds: number[];              // Pre-drop build frames
  breakdowns: number[];          // Low-energy frames
  stingers: number[];            // Musical accent frames
}

export interface MusicSection {
  startFrame: number;
  endFrame: number;
  startMs: number;
  endMs: number;
  type: 'intro' | 'verse' | 'build' | 'chorus' | 'drop' | 'breakdown' | 'bridge' | 'outro' | 'unknown';
  energyLevel: 'low' | 'medium' | 'high' | 'peak';
  prescribedCutFrequency: number;    // Seconds per cut
  prescribedTransition: string;
  prescribedEffects: string[];
}

export interface FiveTrackProviderUsage {
  provider: 'google-gemini';
  model: string;
  operation: 'video_analysis';
  inputTokens?: number;
  outputTokens?: number;
  totalTokens?: number;
  requestCount: number;
  missingUsageCount: number;
}

/** Full analysis result */
export interface AssetAnalysis {
  assetId: string;
  userId: string;
  status: 'pending' | 'processing' | 'complete' | 'failed';
  durationMs: number;
  analyzedAt: Date;
  providerUsage?: FiveTrackProviderUsage;

  // Layer 1: Shot boundaries
  shots: Shot[];

  // Layer 2: Motion (per-segment, not per-frame to keep storage manageable)
  motionSegments: MotionSegment[];
  motionPeaks: number[];           // Frame numbers of motion intensity peaks

  // Layer 3: Audio
  audio: AudioAnalysis | null;

  // Layer 4: Semantic keyframes
  keyframeAnalyses: FrameAnalysis[];

  // Layer 5: Subject tracking
  subjectTracks: SubjectTrackEntry[];

  // Track A: Speech semantic
  speechSegments: SpeechSegment[];

  /**
   * Phase C asset-centric flag (2026-04-21): true when the AI-gen clip's
   * audio contained speech despite the script intent being silent (empty
   * narration). Set by the Track A verification pass when Deepgram
   * transcription returns meaningful text on a silent-intent AI scene —
   * most commonly a Seedance native-audio hallucination. Downstream
   * consumers can use this to gate audio decisions: if true, treat the
   * clip as having unreliable native audio (candidate for muting or
   * Freesound ambient layering even though hasNativeAudio=true).
   */
  hasHallucinatedSpeech?: boolean;

  // Track C: Music structure
  musicStructure: MusicStructure | null;

  // Derived: Natural edit points
  naturalCutPoints: number[];      // Frame numbers
  audioSyncPoints: number[];       // Transients + beats combined

  // Confidence tracking (Phase 1B — added 2026-04-03)
  // Distinguishes real Gemini analysis from storyboard fallback defaults.
  // Consumers should check analysisQuality before making aggressive edit decisions.
  analysisQuality?: 'high' | 'medium' | 'low' | 'fallback';
  confidenceBreakdown?: {
    vision: number;   // 0.0-1.0 — keyframe analysis confidence
    motion: number;   // 0.0-1.0 — motion segment confidence
    audio: number;    // 0.0-1.0 — beat/transient detection confidence
    speech: number;   // 0.0-1.0 — speech classification confidence
    music: number;    // 0.0-1.0 — music structure confidence
  };
}

// ─── MongoDB ─────────────────────────────────────────────────────

const ANALYSIS_COLLECTION = 'asset_analyses';

export async function getAnalysis(assetId: string): Promise<AssetAnalysis | null> {
  const db = await getDatabase();
  return db.collection(ANALYSIS_COLLECTION).findOne({ assetId }) as any;
}

async function saveAnalysis(analysis: AssetAnalysis): Promise<void> {
  const db = await getDatabase();
  await db.collection(ANALYSIS_COLLECTION).updateOne(
    { assetId: analysis.assetId },
    { $set: analysis },
    { upsert: true },
  );
}

// ─── Gemini Files API Upload ─────────────────────────────────────

/**
 * Upload a video to Gemini Files API for Vision analysis.
 * Downloads from GCS signed URL → uploads to Gemini → returns fileUri.
 * Files are retained for 48 hours by Google.
 */
const GEMINI_EXTERNAL_URL_LIMIT = 100 * 1024 * 1024; // 100MB — Gemini fetches directly from URL

async function uploadToGeminiFiles(
  videoUrl: string,
  assetId: string,
): Promise<string | null> {
  const apiKey = process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY;
  if (!apiKey) {
    console.warn('[GeminiFiles] No API key set');
    return null;
  }

  try {
    // Check file size via HEAD request (no download needed)
    const headResp = await fetch(videoUrl, { method: 'HEAD' });
    const contentLength = Number(headResp.headers.get('content-length') || 0);
    const sizeMb = Math.round(contentLength / 1024 / 1024);

    // ── PATH A: External URL (≤100MB) ─────────────────────────────────
    // Gemini generateContent accepts public HTTPS URLs as file_uri.
    // Zero download, zero /tmp, zero upload. Gemini fetches directly.
    if (contentLength > 0 && contentLength <= GEMINI_EXTERNAL_URL_LIMIT) {
      console.log(`[GeminiFiles] External URL path: ${sizeMb}MB ≤ 100MB — passing CDN URL directly to Gemini (no download/upload)`);
      return videoUrl;
    }

    // ── PATH B: Files API upload (>100MB or unknown size) ─────────────
    // Stream to /tmp → upload to Gemini Files API → poll for ACTIVE.
    // CRITICAL: Stream instead of buffer to avoid OOM on 2048MB serverless functions.
    console.log(`[GeminiFiles] Files API path: ${sizeMb > 0 ? sizeMb + 'MB' : 'unknown size'} — streaming to disk + uploading to Gemini`);

    if (contentLength > 2 * 1024 * 1024 * 1024) {
      console.warn(`[GeminiFiles] Video too large (${sizeMb}MB), max 2GB`);
      return null;
    }

    const { GoogleAIFileManager } = await import('@google/generative-ai/server');
    const fileManager = new GoogleAIFileManager(apiKey);

    const os = await import('os');
    const path = await import('path');
    const fs = await import('fs');

    // Clean ALL video temp files — both gemini_* AND vu_* (from video-understanding-service).
    try {
      const tmpDir = os.tmpdir();
      const now = Date.now();
      for (const f of fs.readdirSync(tmpDir)) {
        if ((f.startsWith('gemini_') || f.startsWith('vu_')) && f.endsWith('.mp4')) {
          try {
            const stat = fs.statSync(path.join(tmpDir, f));
            if (now - stat.mtimeMs > 60000) fs.unlinkSync(path.join(tmpDir, f));
          } catch (err: unknown) { console.warn('[5Track] tmp cleanup failed:', err instanceof Error ? err.message : err); }
        }
      }
    } catch (err: unknown) { console.warn('[5Track] tmp dir scan failed:', err instanceof Error ? err.message : err); }

    const tmpPath = path.join(os.tmpdir(), `gemini_${assetId}_${Date.now()}.mp4`);

    try {
      // Stream download to disk — uses getReader() for Node 18+ compat
      // (Readable.fromWeb not available in all Vercel Node builds)
      const response = await fetch(videoUrl);
      if (!response.ok || !response.body) {
        console.error(`[GeminiFiles] Download failed: ${response.status}`);
        return null;
      }

      const writeStream = fs.createWriteStream(tmpPath);
      const reader = response.body.getReader();
      try {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          writeStream.write(Buffer.from(value));
        }
      } finally {
        reader.releaseLock();
      }
      await new Promise<void>((resolve, reject) => {
        writeStream.end(() => resolve());
        writeStream.on('error', reject);
      });

      const fileSize = fs.statSync(tmpPath).size;
      console.log(`[GeminiFiles] Streamed ${Math.round(fileSize / 1024)}KB to disk, uploading to Gemini...`);

      const uploadResult = await fileManager.uploadFile(tmpPath, {
        mimeType: 'video/mp4',
        displayName: `${assetId}.mp4`,
      });

      const fileUri = uploadResult?.file?.uri;
      const fileName = uploadResult?.file?.name;

      if (!fileUri) {
        console.error('[GeminiFiles] No URI in upload response');
        return null;
      }

      console.log(`[GeminiFiles] Uploaded: ${fileUri.substring(0, 80)}...`);

      const activation = await waitForGeminiFileActive({
        fileManager,
        fileName,
        initialState: uploadResult?.file?.state,
        label: 'GeminiFiles',
        fileSizeBytes: fileSize,
      });

      if (!activation.active) {
        console.error(`[GeminiFiles] Not ACTIVE after ${Math.round(activation.waitedMs / 1000)}s (state: ${activation.state ?? 'unknown'}, attempts=${activation.attempts}, reason=${activation.reason})`);
        return null;
      }
      return fileUri;
    } finally {
      try { fs.unlinkSync(tmpPath); } catch (err: unknown) { console.warn('[5Track] tmp file cleanup failed:', err instanceof Error ? err.message : err); }
    }
  } catch (err: any) {
    console.error(`[GeminiFiles] Failed: ${err.message}`);
    return null;
  }
}

// ─── Layer 1: Shot Detection ─────────────────────────────────────

async function _detectShots(videoUrl: string, durationMs: number, fps: number, usageCapture?: GeminiUsageCapture): Promise<Shot[]> {
  // Use Gemini Vision to detect scene changes (server-side PySceneDetect not available on Vercel)
  // This gives ~90% accuracy vs pixel-diff algorithms
  try {
    const apiKey = process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY;
    if (!apiKey) return [{ startFrame: 0, endFrame: Math.round(durationMs / 1000 * fps), durationMs }];

    // OLD: hardcoded gemini-2.5-flash. NEW: Gemma 4 via factory (with model-specific fallback).
    const { getAnalysisModel } = await import('@/lib/editron/utils/gemini-model-factory');
    const model = await getAnalysisModel();

    const result = await model.generateContent([
      {
        text: `<role>You are a professional video editor detecting shot boundaries.</role>

<task>Detect ALL shot/scene boundaries in this ${Math.round(durationMs / 1000)}s video at ${fps}fps.</task>

<rules>
RULE 1 — A "shot" = continuous camera take between two cuts.
RULE 2 — Be precise — every visual cut, dissolve, or transition is a boundary.
RULE 3 — Return ONLY a JSON array of objects, no markdown, no explanation.
</rules>

<output_format>[{"startFrame": 0, "endFrame": 150}, ...]</output_format>`,
      },
      { fileData: { mimeType: 'video/mp4', fileUri: videoUrl } },
    ]);

    recordGeminiUsage(result, usageCapture);
    const text = result.response.text();
    const jsonMatch = text.match(/\[[\s\S]*\]/);
    if (!jsonMatch) return [{ startFrame: 0, endFrame: Math.round(durationMs / 1000 * fps), durationMs }];

    const shots: Shot[] = JSON.parse(jsonMatch[0]).map((s: any) => ({
      ...s,
      durationMs: ((s.endFrame - s.startFrame) / fps) * 1000,
    }));

    console.log(`[Layer1] Detected ${shots.length} shots`);
    return shots.length > 0 ? shots : [{ startFrame: 0, endFrame: Math.round(durationMs / 1000 * fps), durationMs }];
  } catch (err: any) {
    console.error('[Layer1] Shot detection failed:', err.message);
    return [{ startFrame: 0, endFrame: Math.round(durationMs / 1000 * fps), durationMs }];
  }
}

// ─── Merged Analysis (W3 Optimization) ──────────────────────────

/**
 * Single Gemini Vision call that analyzes motion, keyframes, and subjects
 * in one structured prompt. Reduces 3 API calls to 1.
 *
 * Returns null if the merged call fails (caller falls back to individual calls).
 */
async function analyzeVideoComprehensive(
  fileUri: string,
  shots: Shot[],
  durationMs: number,
  usageCapture?: GeminiUsageCapture,
): Promise<{
  motion: { segments: MotionSegment[]; peaks: number[] };
  keyframes: FrameAnalysis[];
  subjects: SubjectTrackEntry[];
} | null> {
  const apiKey = process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY;
  if (!apiKey) return null;

  try {
    // OLD: hardcoded gemini-2.5-flash. NEW: Gemma 4 via factory (with model-specific fallback).
    const { getAnalysisModel } = await import('@/lib/editron/utils/gemini-model-factory');
    const model = await getAnalysisModel();

    const fps = 30;
    const totalFrames = Math.round((durationMs / 1000) * fps);

    const prompt = `<role>You are a professional video analyst performing comprehensive multi-track video analysis.</role>

<task>Analyze this ${Math.round(durationMs / 1000)}s video at ${fps}fps across three tracks: motion, keyframes, and subjects. Analyze 1 keyframe per second (${Math.max(3, Math.ceil(durationMs / 1000))} keyframes at timestamps: ${Array.from({ length: Math.max(3, Math.ceil(durationMs / 1000)) }, (_, i) => `${i}s`).join(', ')}).</task>

<rules>
RULE 1 — For each keyframe provide: frame number (at ${fps}fps), timestamp in milliseconds, description of what's visible, subjects with bounding boxes and confidence, shot type, camera angle, dominant colors, brightness (0-1), mood score (-1 to 1), energy level (0-1), and whether it's a natural cut point with a brief reason WHY.
RULE 2 — Identify all visible subjects with normalized bounding boxes (0-1 range).
RULE 3 — Detect camera motion type and intensity per segment.
RULE 4 — Mark motion intensity peaks (frames where motion changes significantly).
RULE 5 — Return ONLY valid JSON, no markdown.
</rules>

<output_format>
{
  "motion": {
    "segments": [
      {
        "startFrame": 0,
        "endFrame": ${totalFrames},
        "motionIntensity": 0.0-1.0,
        "cameraMotion": "static|pan-left|pan-right|zoom-in|zoom-out|tilt-up|tilt-down|tracking|dolly|handheld"
      }
    ],
    "peaks": [frame numbers where motion intensity peaks]
  },
  "keyframes": [
    {
      "frame": 0,
      "timestampMs": 0,
      "description": "What is visible in this moment",
      "subjects": [{"label": "person/object name", "confidence": 0.0-1.0}],
      "shotType": "wide|medium|close-up|extreme-close-up",
      "cameraAngle": "eye-level|low-angle|high-angle|overhead",
      "dominantColors": ["color1", "color2"],
      "brightness": 0.0-1.0,
      "moodScore": -1.0 to 1.0,
      "energyLevel": 0.0-1.0,
      "naturalCutPoint": true/false
    }
  ],
  "subjects": [
    {
      "frame": 0,
      "subjectId": "person_0",
      "label": "main subject",
      "boundingBox": {"x": 0-1, "y": 0-1, "width": 0-1, "height": 0-1},
      "confidence": 0.0-1.0
    }
  ]
}
</output_format>`;

    const result = await withRetry<{ response: { text: () => string } }>(
      () => model.generateContent([
        { fileData: { fileUri, mimeType: 'video/mp4' } },
        { text: prompt },
      ]),
      'merged_vision',
    );

    recordGeminiUsage(result, usageCapture);
    const text = result.response.text();
    // Extract JSON from response (may be wrapped in ```json ... ```)
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      console.warn('[Analysis] Merged: no JSON in response');
      return null;
    }

    const parsed = JSON.parse(jsonMatch[0]);

    // Validate and normalize each section
    const motionSegments: MotionSegment[] = (parsed.motion?.segments || []).map((s: any) => ({
      startFrame: s.startFrame || 0,
      endFrame: s.endFrame || totalFrames,
      motionIntensity: Math.min(1, Math.max(0, s.motionIntensity || 0.3)),
      cameraMotion: s.cameraMotion || 'static',
    }));

    const keyframes: FrameAnalysis[] = (parsed.keyframes || []).map((kf: any) => ({
      frame: kf.frame || 0,
      timestampMs: kf.timestampMs || 0,
      description: kf.description || '',
      subjects: (kf.subjects || []).map((s: any) => ({ label: s.label || '', confidence: s.confidence || 0.5 })),
      shotType: kf.shotType || 'medium',
      cameraAngle: kf.cameraAngle || 'eye-level',
      dominantColors: kf.dominantColors || [],
      brightness: kf.brightness || 0.6,
      moodScore: kf.moodScore || 0,
      energyLevel: kf.energyLevel || 0.3,
      naturalCutPoint: kf.naturalCutPoint || false,
    }));

    const subjects: SubjectTrackEntry[] = (parsed.subjects || []).map((s: any) => ({
      frame: s.frame || 0,
      subjectId: s.subjectId || 'unknown',
      label: s.label || 'unknown',
      boundingBox: s.boundingBox || { x: 0.3, y: 0.3, width: 0.4, height: 0.4 },
      confidence: s.confidence || 0.5,
    }));

    console.log(`[Analysis] Merged: ${motionSegments.length} motion, ${keyframes.length} keyframes, ${subjects.length} subjects`);

    return {
      motion: { segments: motionSegments, peaks: parsed.motion?.peaks || [] },
      keyframes,
      subjects,
    };
  } catch (err: any) {
    console.error(`[Analysis] Merged call failed: ${err.message}`);
    return null;
  }
}

// ─── Layer 2: Motion Analysis ────────────────────────────────────

async function analyzeMotion(videoUrl: string, shots: Shot[], durationMs: number, usageCapture?: GeminiUsageCapture): Promise<{
  segments: MotionSegment[];
  peaks: number[];
}> {
  try {
    const apiKey = process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY;
    if (!apiKey) return { segments: [], peaks: [] };

    // OLD: hardcoded gemini-2.5-flash. NEW: Gemma 4 via factory (with model-specific fallback).
    const { getAnalysisModel } = await import('@/lib/editron/utils/gemini-model-factory');
    const model = await getAnalysisModel();

    const result = await model.generateContent([
      {
        text: `<role>You are a professional video analyst specializing in camera motion detection.</role>

<task>Analyze camera motion for each of the ${shots.length} shots in this ${Math.round(durationMs / 1000)}s video.</task>

<rules>
RULE 1 — For each shot, classify motionIntensity (0.0-1.0, where 0=static, 1=rapid motion) and cameraMotion (static/pan-left/pan-right/tilt-up/tilt-down/zoom-in/zoom-out/tracking/handheld/dolly).
RULE 2 — Identify the top 5 frames with highest motion intensity (motion peaks).
RULE 3 — Return ONLY valid JSON, no markdown, no explanation.
</rules>

<output_format>
{
  "segments": [{"startFrame": 0, "endFrame": 150, "motionIntensity": 0.3, "cameraMotion": "static"}, ...],
  "peaks": [47, 180, 320, ...]
}
</output_format>`,
      },
      { fileData: { mimeType: 'video/mp4', fileUri: videoUrl } },
    ]);

    recordGeminiUsage(result, usageCapture);
    const text = result.response.text();
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) return { segments: [], peaks: [] };

    const parsed = JSON.parse(jsonMatch[0]);
    console.log(`[Layer2] ${parsed.segments?.length || 0} motion segments, ${parsed.peaks?.length || 0} peaks`);
    return { segments: parsed.segments || [], peaks: parsed.peaks || [] };
  } catch (err: any) {
    console.error('[Layer2] Motion analysis failed:', err.message);
    return { segments: [], peaks: [] };
  }
}

// ─── Layer 3: Audio Analysis ─────────────────────────────────────

async function analyzeAudio(audioUrl: string, durationMs: number): Promise<AudioAnalysis | null> {
  try {
    // Use existing beat detection
    // analyzeBeatsFull expects a decoded AudioBuffer, so we pass through as any.
    // If it fails (e.g. URL string instead of buffer), the catch returns null.
    const { analyzeBeatsFull } = await import('./media/beat-detection-service');
    const beatResult = await analyzeBeatsFull(audioUrl as any);

    const beats = beatResult?.beats || [];
    const bpm = beatResult?.bpm || 120;

    // Build energy curve from beat density (every 1s window)
    const windowMs = 1000;
    const energyCurve: AudioAnalysis['energyCurve'] = [];
    for (let t = 0; t < durationMs; t += windowMs) {
      const beatsInWindow = beats.filter((b: any) => {
        const timeMs = typeof b === 'number' ? b : b.timeMs;
        return timeMs >= t && timeMs < t + windowMs;
      }).length;
      const maxBeats = bpm / 60;
      energyCurve.push({
        timestampMs: t,
        energy: Math.min(beatsInWindow / Math.max(maxBeats, 1), 1),
      });
    }

    // Detect transients (energy peaks — frames where amplitude spikes)
    const transients: number[] = [];
    for (let i = 1; i < energyCurve.length - 1; i++) {
      const prev = energyCurve[i - 1].energy;
      const curr = energyCurve[i].energy;
      const next = energyCurve[i + 1].energy;
      if (curr > prev && curr > next && curr > 0.6) {
        transients.push(Math.round(energyCurve[i].timestampMs / 1000 * 30));
      }
    }

    console.log(`[Layer3] ${beats.length} beats, ${transients.length} transients, ${energyCurve.length} energy samples`);

    return {
      beats: beats.map((b: any) => Math.round((typeof b === 'number' ? b : b.timeMs) / 1000 * 30)), // Convert ms to frames
      transients,
      speechSegments: [], // Filled by Track A
      silences: [],       // Filled by Track A
      energyCurve,
    };
  } catch (err: any) {
    console.error('[Layer3] Audio analysis failed:', err.message);
    return null;
  }
}

// ─── Layer 4: Semantic Keyframe Analysis ─────────────────────────

async function analyzeKeyframes(
  videoUrl: string,
  shots: Shot[],
  durationMs: number,
  usageCapture?: GeminiUsageCapture,
): Promise<FrameAnalysis[]> {
  try {
    const apiKey = process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY;
    if (!apiKey) return [];

    // OLD: hardcoded gemini-2.5-flash. NEW: Gemma 4 via factory (with model-specific fallback).
    const { getAnalysisModel } = await import('@/lib/editron/utils/gemini-model-factory');
    const model = await getAnalysisModel();

    // Strategic frame selection: first + middle of each shot (max 30 frames)
    const targetFrames: number[] = [];
    for (const shot of shots.slice(0, 15)) {
      targetFrames.push(shot.startFrame);
      targetFrames.push(Math.floor((shot.startFrame + shot.endFrame) / 2));
    }

    const result = await model.generateContent([
      {
        text: `Analyze ${targetFrames.length} keyframes in this ${Math.round(durationMs / 1000)}s video.
Sample frames at approximately: ${targetFrames.slice(0, 10).join(', ')}${targetFrames.length > 10 ? '...' : ''} (at 30fps)

For each keyframe return:
- frame: frame number
- timestampMs: millisecond
- description: 1 sentence of what's happening
- subjects: [{label, confidence (0-1), isMainSubject}]
- shotType: wide/medium/close-up/extreme-close-up
- cameraAngle: eye-level/high-angle/low-angle/bird-eye/dutch
- dominantColors: [2-3 hex colors]
- brightness: 0.0-1.0
- moodScore: -1.0 to 1.0 (negative to positive)
- energyLevel: 0.0-1.0
- naturalCutPoint: true/false (is this a good place to cut?)
- naturalCutReason: why (if true)

Return ONLY a JSON array: [...]`,
      },
      { fileData: { mimeType: 'video/mp4', fileUri: videoUrl } },
    ]);

    recordGeminiUsage(result, usageCapture);
    const text = result.response.text();
    const jsonMatch = text.match(/\[[\s\S]*\]/);
    if (!jsonMatch) return [];

    const analyses = JSON.parse(jsonMatch[0]);
    console.log(`[Layer4] ${analyses.length} keyframes analyzed`);
    return analyses;
  } catch (err: any) {
    console.error('[Layer4] Keyframe analysis failed:', err.message);
    return [];
  }
}

// ─── Layer 5: Subject Tracking ───────────────────────────────────

async function trackSubjects(
  videoUrl: string,
  keyframeAnalyses: FrameAnalysis[],
  durationMs: number,
  usageCapture?: GeminiUsageCapture,
): Promise<SubjectTrackEntry[]> {
  try {
    const apiKey = process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY;
    if (!apiKey) return [];

    // OLD: hardcoded gemini-2.5-flash. NEW: Gemma 4 via factory (with model-specific fallback).
    const { getAnalysisModel } = await import('@/lib/editron/utils/gemini-model-factory');
    const model = await getAnalysisModel();

    // Extract unique subjects from keyframe analyses
    const knownSubjects = new Set<string>();
    for (const kf of keyframeAnalyses) {
      for (const s of (kf.subjects || [])) {
        if (s.isMainSubject || s.confidence > 0.7) knownSubjects.add(s.label);
      }
    }

    if (knownSubjects.size === 0) return [];

    const result = await model.generateContent([
      {
        text: `Track these subjects across the ${Math.round(durationMs / 1000)}s video:
${[...knownSubjects].join(', ')}

For each subject, provide 5 key appearances with normalized bounding boxes (0-1 coordinates):
Return JSON:
{
  "subjects": [{
    "subjectId": "person_0",
    "label": "man in blue suit",
    "category": "person",
    "frames": [{"frame": 30, "box": {"x": 0.3, "y": 0.2, "w": 0.4, "h": 0.6}, "confidence": 0.9}],
    "totalScreenTimeMs": 15000
  }]
}`,
      },
      { fileData: { mimeType: 'video/mp4', fileUri: videoUrl } },
    ]);

    recordGeminiUsage(result, usageCapture);
    const text = result.response.text();
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) return [];

    const parsed = JSON.parse(jsonMatch[0]);
    console.log(`[Layer5] Tracking ${parsed.subjects?.length || 0} subjects`);
    return parsed.subjects || [];
  } catch (err: any) {
    console.error('[Layer5] Subject tracking failed:', err.message);
    return [];
  }
}

// ─── Track A: Speech Semantic Classification ─────────────────────

async function classifySpeech(
  transcript: string,
  words: Array<{ word: string; startMs: number; endMs: number }>,
  usageCapture?: GeminiUsageCapture,
): Promise<SpeechSegment[]> {
  try {
    const apiKey = process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY;
    if (!apiKey || !transcript.trim()) return [];

    // OLD: hardcoded gemini-2.5-flash. NEW: Gemma 4 via factory (with model-specific fallback).
    const { getAnalysisModel } = await import('@/lib/editron/utils/gemini-model-factory');
    const model = await getAnalysisModel();

    const result = await model.generateContent(`<role>You are a professional transcript analyst specializing in content classification for video editing.</role>

<task>Classify this video transcript into segments. Each segment is a continuous stretch of speech with the same content type.</task>

<rules>
RULE 1 — For each segment return: startMs, endMs (approximate from word positions), text (the segment text), contentType, entities, suggestedGraphicType, suggestedGraphicData, confidence (0-1), and keywordHighlights.
RULE 2 — contentType must be one of: statistic, claim, question, step_instruction, story_moment, cta, transition_phrase, emphasis, comparison, social_proof, definition, neutral.
RULE 3 — entities: [{type: "number"|"percentage"|"currency"|"name"|"product"|"concept"|"action"|"emotion", value: "...", unit?: "x"|"%"|"$", isGrowth?: true/false}].
RULE 4 — suggestedGraphicType must be only "visual-explanation" or "none". NEVER output template/form labels such as animated-growth-chart, counter-animation, definition-card, side-by-side-comparison, kinetic-text-highlight, lower-third, callout, or stat-counter.
RULE 5 — suggestedGraphicData must contain semantic evidence only: {kind, text, value, label, name, title, body, quote, author, from, to, fromLabel, toLabel, relation, items}. Do not choose layout, color, motion, size, or template.
RULE 6 — keywordHighlights: [{word, importance: "normal"|"keyword"|"emphasis"|"stat"|"name"}] — the 3-5 most important words.
RULE 7 — Return ONLY a JSON array, no markdown, no explanation.
</rules>

<output_format>[{startMs, endMs, text, contentType, entities, suggestedGraphicType, suggestedGraphicData, confidence, keywordHighlights}, ...]</output_format>

<input_data>
TRANSCRIPT:
"${transcript}"

Word timestamps for reference:
${words.slice(0, 50).map(w => `"${w.word}" ${w.startMs}ms`).join(', ')}${words.length > 50 ? '...' : ''}
</input_data>`);

    recordGeminiUsage(result, usageCapture);
    const text = result.response.text();
    const jsonMatch = text.match(/\[[\s\S]*\]/);
    if (!jsonMatch) return [];

    const segments: SpeechSegment[] = JSON.parse(jsonMatch[0]).map((s: any) => ({
      ...s,
      startFrame: Math.round((s.startMs || 0) / 1000 * 30),
      endFrame: Math.round((s.endMs || 0) / 1000 * 30),
    }));

    console.log(`[TrackA] ${segments.length} speech segments classified`);
    return segments;
  } catch (err: any) {
    console.error('[TrackA] Speech classification failed:', err.message);
    return [];
  }
}

// ─── Track C: Music Structure ────────────────────────────────────

async function analyzeMusicStructure(
  audioUrl: string,
  beats: number[],
  bpm: number,
  durationMs: number,
): Promise<MusicStructure | null> {
  try {
    // Build energy curve from beat density
    const windowMs = 1000;
    const energyCurve: MusicStructure['energyCurve'] = [];
    for (let t = 0; t < durationMs; t += windowMs) {
      const beatsInWindow = beats.filter(b => b >= t && b < t + windowMs).length;
      const maxBeats = bpm / 60;
      energyCurve.push({
        timestampMs: t,
        energy: Math.min(beatsInWindow / Math.max(maxBeats, 1), 1),
      });
    }

    // Build tension curve: tension rises when energy increases, peaks at drops
    const tensionCurve: MusicStructure['tensionCurve'] = [];
    let runningTension = 0;
    for (let i = 0; i < energyCurve.length; i++) {
      const energy = energyCurve[i].energy;
      const prevEnergy = i > 0 ? energyCurve[i - 1].energy : energy;
      const energyDelta = energy - prevEnergy;

      // Tension builds when energy increases, releases on drops
      if (energyDelta > 0) {
        runningTension = Math.min(1, runningTension + energyDelta * 1.5);
      } else if (energyDelta < 0) {
        runningTension = Math.max(0, runningTension + energyDelta * 2); // Faster release
      } else {
        runningTension *= 0.95; // Slow decay during stable energy
      }

      tensionCurve.push({ timestampMs: energyCurve[i].timestampMs, tension: runningTension });
    }

    // Detect drops (energy > 0.7 preceded by build)
    const drops: number[] = [];
    const builds: number[] = [];
    const breakdowns: number[] = [];
    for (let i = 2; i < energyCurve.length; i++) {
      const e = energyCurve[i].energy;
      const prev = energyCurve[i - 1].energy;
      const prevPrev = energyCurve[i - 2].energy;

      if (e > 0.7 && prev < 0.5 && prevPrev < 0.5) {
        drops.push(Math.round(energyCurve[i].timestampMs / 1000 * 30));
        if (i >= 4) builds.push(Math.round(energyCurve[i - 3].timestampMs / 1000 * 30));
      }
      if (e < 0.3 && prev > 0.5) {
        breakdowns.push(Math.round(energyCurve[i].timestampMs / 1000 * 30));
      }
    }

    // Stingers: beat-aligned high-energy moments
    const stingers = beats
      .filter(b => {
        const nearestEnergy = energyCurve.find(e => Math.abs(e.timestampMs - b) < windowMs);
        return nearestEnergy && nearestEnergy.energy > 0.8;
      })
      .map(b => Math.round(b / 1000 * 30))
      .slice(0, 20);

    // Build sections with editorial prescriptions
    const sections: MusicSection[] = [];
    let sectionStart = 0;
    let currentType: MusicSection['type'] = 'intro';

    for (let i = 0; i < energyCurve.length; i++) {
      const e = energyCurve[i].energy;
      let newType: MusicSection['type'] = currentType;

      if (i < energyCurve.length * 0.1) newType = 'intro';
      else if (i > energyCurve.length * 0.9) newType = 'outro';
      else if (e > 0.7) newType = 'drop';
      else if (e > 0.5) newType = 'chorus';
      else if (e > 0.3) newType = 'verse';
      else newType = 'breakdown';

      if (newType !== currentType || i === energyCurve.length - 1) {
        const endMs = energyCurve[i].timestampMs;
        const startMs = energyCurve[sectionStart]?.timestampMs || 0;

        // Prescribe editing parameters per section type
        const prescription = SECTION_PRESCRIPTIONS[currentType];

        sections.push({
          startFrame: Math.round(startMs / 1000 * 30),
          endFrame: Math.round(endMs / 1000 * 30),
          startMs,
          endMs,
          type: currentType,
          energyLevel: e > 0.7 ? 'peak' : e > 0.5 ? 'high' : e > 0.3 ? 'medium' : 'low',
          prescribedCutFrequency: prescription.cutFrequency,
          prescribedTransition: prescription.transition,
          prescribedEffects: prescription.effects,
        });

        sectionStart = i;
        currentType = newType;
      }
    }

    console.log(`[TrackC] ${sections.length} sections, ${drops.length} drops, ${builds.length} builds, ${stingers.length} stingers`);

    return {
      bpm,
      sections,
      energyCurve,
      tensionCurve,
      drops,
      builds,
      breakdowns,
      stingers,
    };
  } catch (err: any) {
    console.error('[TrackC] Music structure failed:', err.message);
    return null;
  }
}

/** Editorial prescriptions per music section type */
const SECTION_PRESCRIPTIONS: Record<string, { cutFrequency: number; transition: string; effects: string[] }> = {
  intro:     { cutFrequency: 4,   transition: 'dissolve',    effects: [] },
  verse:     { cutFrequency: 3,   transition: 'hard-cut',    effects: [] },
  build:     { cutFrequency: 1.5, transition: 'hard-cut',    effects: ['zoom-punch'] },
  chorus:    { cutFrequency: 2,   transition: 'hard-cut',    effects: ['zoom-punch'] },
  drop:      { cutFrequency: 0.5, transition: 'zoom-punch',  effects: ['zoom-punch', 'glitch', 'speed-ramp'] },
  breakdown: { cutFrequency: 5,   transition: 'dissolve',    effects: ['slow-motion'] },
  bridge:    { cutFrequency: 3,   transition: 'soft-cut',    effects: [] },
  outro:     { cutFrequency: 5,   transition: 'dissolve',    effects: ['fade'] },
  unknown:   { cutFrequency: 3,   transition: 'hard-cut',    effects: [] },
};

// ─── Full Pipeline ───────────────────────────────────────────────

const FPS = 30;

/**
 * Run complete 5-layer analysis on an asset.
 * All layers run in parallel where possible. Results cached in MongoDB.
 */
/**
 * Storyboard metadata from ThinkForge — pre-classified data for AI videos.
 * When available, this REPLACES Layer 1 (no shots to detect — 1 clip = 1 shot)
 * and ENRICHES Track A (narration already has intent, no need to re-classify).
 */
export interface StoryboardMetadata {
  sceneIndex: number;
  narration: string;
  visualDescription: string;
  mood: string;
  audioDescription?: string;
  cameraDirection?: string;
  editDirections?: {
    transition?: { type: string; durationMs?: number };
    filterPresetId?: string;
    pacing?: string;
    sfxCue?: string;
    motionGraphicCue?: string;
    cameraRig?: string;
  };
}

export type FullAnalysisOptions = Readonly<{
  videoUrl?: string;
  audioUrl?: string;
  durationMs: number;
  transcript?: string;
  words?: Array<{ word: string; startMs: number; endMs: number }>;
  /** For AI videos from ThinkForge — pre-classified scene data */
  storyboardScene?: StoryboardMetadata;
  /** 'ai-generated' skips shot detection, uses storyboard metadata.
   *  'real-footage' runs full pipeline including clip matching. */
  sourceType?: 'ai-generated' | 'real-footage';
  /** Pre-existing Gemini file URI from VideoUnderstanding — avoids redundant CDN download + upload */
  geminiFileUri?: string;
  /** Exact ProjectService-authenticated source bytes and analysis-input identity. */
  sourceBindingV2?: AssetAnalysisSourceBindingV2;
}>;

export function createFiveTrackAnalysisInputSha256V2(
  options: FullAnalysisOptions,
): string {
  return hashAssetAnalysisInputV2({
    schemaVersion: 2,
    kind: 'EDITRON_FIVE_TRACK_ANALYSIS_INPUT_V2',
    durationMs: options.durationMs,
    sourceType: options.sourceType ?? 'ai-generated',
    transcript: options.transcript ?? null,
    words: options.words ?? null,
    storyboardScene: options.storyboardScene ?? null,
    videoUrlAvailable: typeof options.videoUrl === 'string'
      && options.videoUrl.length > 0,
    audioUrlAvailable: typeof options.audioUrl === 'string'
      && options.audioUrl.length > 0,
    geminiFileUriAvailable: typeof options.geminiFileUri === 'string'
      && options.geminiFileUri.length > 0,
  });
}

export async function runFullAnalysis(
  assetId: string,
  userId: string,
  options: FullAnalysisOptions,
  pipelineWarnings?: PipelineWarningCollector,
): Promise<AssetAnalysis> {
  const { videoUrl, audioUrl, durationMs, transcript, words, storyboardScene, sourceType = 'ai-generated', geminiFileUri: preloadedFileUri } = options;
  const sourceBindingV2 = options.sourceBindingV2
    ? assertAssetAnalysisSourceBindingV2(options.sourceBindingV2)
    : null;
  if (sourceBindingV2
    && (sourceBindingV2.assetId !== assetId || sourceBindingV2.userId !== userId)) {
    throw new Error('FIVE_TRACK_ANALYSIS_SOURCE_BINDING_SCOPE_MISMATCH');
  }
  if (sourceBindingV2
    && sourceBindingV2.analysisInputSha256
      !== createFiveTrackAnalysisInputSha256V2(options)) {
    throw new Error('FIVE_TRACK_ANALYSIS_SOURCE_BINDING_INPUT_MISMATCH');
  }

  const isAIVideo = sourceType === 'ai-generated';
  const analysisStartMs = Date.now();
  const TIME_BUDGET_MS = 120_000; // 120s max — leaves 180s for Director execution within 300s Vercel limit
  const isOverBudget = () => Date.now() - analysisStartMs > TIME_BUDGET_MS;
  console.log(`[Analysis] Starting ${isAIVideo ? 'AI-video' : 'real-footage'} analysis for ${assetId} (${Math.round(durationMs / 1000)}s, budget: ${TIME_BUDGET_MS / 1000}s)`);

  // Bound V2 entries are immutable and include exact source + material input identity.
  // Only unbound legacy callers retain the historical 7-day/version cache policy.
  const ANALYSIS_VERSION = FIVE_TRACK_ANALYSIS_VERSION_V2; // v1=original 3-keyframe, v2=dense 1-per-second + confidence
  const sourceBoundCached = sourceBindingV2
    ? await getSourceBoundAnalysisV2<AssetAnalysis>(sourceBindingV2)
    : null;
  if (sourceBoundCached) {
    const quality = (sourceBoundCached as any).analysisQuality || 'unknown';
    console.log(`[Analysis] Using exact source-bound cache v${ANALYSIS_VERSION} for ${assetId} (quality=${quality})`);
    (sourceBoundCached as AssetAnalysis & { _analysisCacheHit?: boolean })._analysisCacheHit = true;
    return sourceBoundCached;
  }
  const legacyCached = sourceBindingV2 ? null : await getAnalysis(assetId);
  if (legacyCached && legacyCached.status === 'complete' &&
      Date.now() - new Date(legacyCached.analyzedAt).getTime() < 7 * 24 * 3600 * 1000) {
    const cachedVersion = (legacyCached as any).analysisVersion || 1;
    if (cachedVersion >= ANALYSIS_VERSION) {
      const quality = (legacyCached as any).analysisQuality || 'unknown';
      console.log(`[Analysis] Using cached analysis v${cachedVersion} for ${assetId} (quality=${quality})`);
      (legacyCached as AssetAnalysis & { _analysisCacheHit?: boolean })._analysisCacheHit = true;
      return legacyCached;
    }
    console.log(`[Analysis] Cache STALE for ${assetId}: v${cachedVersion} < v${ANALYSIS_VERSION}, re-analyzing with updated logic`);
  }

  const geminiUsageCapture = createGeminiUsageCapture();

  // Layer 1: Shot detection
  // AI videos: each clip IS one shot (skip detection)
  // Real footage: each uploaded clip IS one shot (skip internal detection)
  // Shot detection only matters when we stitch clips on the timeline — handled by the Reactive Edit Engine
  const shots: Shot[] = [{
    startFrame: 0,
    endFrame: Math.round(durationMs / 1000 * FPS),
    durationMs,
  }];

  // Layers 2-5: REAL video analysis via Gemini Files API
  let motion: { segments: MotionSegment[]; peaks: number[] } = { segments: [], peaks: [] };
  let audioData: AudioAnalysis | null = null;
  let keyframeData: FrameAnalysis[] = [];
  let subjectData: SubjectTrackEntry[] = [];

  // ─── DIAGNOSTIC TRACE — tracks exactly where analysis fails ───
  const trace: { step: string; status: string; durationMs: number; error?: string }[] = [];
  const traceStep = (step: string) => {
    const start = Date.now();
    return {
      ok: (detail?: string) => trace.push({ step, status: detail || 'ok', durationMs: Date.now() - start }),
      fail: (err: string) => trace.push({ step, status: 'FAILED', durationMs: Date.now() - start, error: err }),
      skip: (reason: string) => trace.push({ step, status: `skipped: ${reason}`, durationMs: Date.now() - start }),
    };
  };

  if (videoUrl) {
    try {
      const t0 = traceStep('budget_check');
      if (isOverBudget()) {
        t0.skip(`exceeded before video upload (${Math.round((Date.now() - analysisStartMs) / 1000)}s)`);
        console.warn(`[Analysis] Time budget exceeded before video upload`);
      } else {
        t0.ok();

        // Upload video to Gemini Files API (skip if VU already uploaded)
        const t1 = traceStep('gemini_upload');
        let geminiFileUri: string | null = preloadedFileUri || null;
        if (geminiFileUri) {
          t1.ok(`reused VU uri=${geminiFileUri.substring(0, 60)}...`);
        } else {
          try {
            geminiFileUri = await uploadToGeminiFiles(videoUrl, assetId);
            if (geminiFileUri) {
              t1.ok(`uri=${geminiFileUri.substring(0, 60)}...`);
            } else {
              t1.fail('returned null — check GCS URL accessibility or Gemini API key');
            }
          } catch (uploadErr: any) {
            t1.fail(uploadErr.message);
            console.error(`[Analysis] Upload failed:`, uploadErr.message);
            pipelineWarnings?.errorSwallowed('analysis', uploadErr instanceof Error ? uploadErr : new Error(String(uploadErr)), 'Gemini file upload');
          }
        }

        if (geminiFileUri && !isOverBudget()) {
          // Merged Gemini Vision call for Layers 2+4+5
          const t2 = traceStep('merged_vision_analysis');
          try {
            const merged = await analyzeVideoComprehensive(geminiFileUri, shots, durationMs, geminiUsageCapture);
            if (merged) {
              motion = merged.motion;
              keyframeData = merged.keyframes;
              subjectData = merged.subjects;
              t2.ok(`motion=${motion.segments.length}, keyframes=${keyframeData.length}, subjects=${subjectData.length}`);
            } else {
              t2.fail('analyzeVideoComprehensive returned null');
            }
          } catch (mergeErr: any) {
            t2.fail(mergeErr.message);
            console.warn(`[Analysis] Merged analysis failed: ${mergeErr.message}, trying individual calls`);
            pipelineWarnings?.errorSwallowed('analysis', mergeErr instanceof Error ? mergeErr : new Error(String(mergeErr)), 'merged vision analysis (L2+L4+L5)');

            // Fallback to individual calls
            const t3 = traceStep('fallback_individual_calls');
            try {
              const [motionResult, kfResult, subjectResult] = await Promise.allSettled([
                analyzeMotion(geminiFileUri, shots, durationMs, geminiUsageCapture),
                analyzeKeyframes(geminiFileUri, shots, durationMs, geminiUsageCapture),
                trackSubjects(geminiFileUri, [], durationMs, geminiUsageCapture),
              ]);
              const motionOk = motionResult.status === 'fulfilled';
              const kfOk = kfResult.status === 'fulfilled';
              const subOk = subjectResult.status === 'fulfilled';
              if (motionOk) motion = motionResult.value;
              if (kfOk) keyframeData = kfResult.value;
              if (subOk) subjectData = subjectResult.value;
              t3.ok(`motion=${motionOk}, keyframes=${kfOk}, subjects=${subOk}`);
            } catch (fallbackErr: any) {
              t3.fail(fallbackErr.message);
              pipelineWarnings?.errorSwallowed('analysis', fallbackErr instanceof Error ? fallbackErr : new Error(String(fallbackErr)), 'fallback individual vision calls');
            }
          }

          console.log(`[Analysis] Gemini Vision: motion=${motion.segments.length}, keyframes=${keyframeData.length}, subjects=${subjectData.length}`);
        } else if (!geminiFileUri) {
          // Already traced above
        } else {
          const tBudget = traceStep('post_upload_budget');
          tBudget.skip('budget exceeded after upload');
        }
      }
    } catch (err: any) {
      const tOuter = traceStep('outer_catch');
      tOuter.fail(err.message);
      console.error(`[Analysis] Video analysis failed: ${err.message}`);
      pipelineWarnings?.errorSwallowed('analysis', err instanceof Error ? err : new Error(String(err)), 'video analysis outer');
    }
  } else {
    trace.push({ step: 'video_url', status: 'skipped: no videoUrl provided', durationMs: 0 });
  }

  // Enrich with storyboard metadata if available (supplements Vision, doesn't replace)
  // Even with Vision analysis, storyboard data adds intent context (what was MEANT to happen)
  if (storyboardScene) {
    // If Vision didn't return motion data, use storyboard as minimum
    if (motion.segments.length === 0 && storyboardScene.cameraDirection) {
      const cameraDir = storyboardScene.cameraDirection.toLowerCase();
      const motionMap: Record<string, MotionSegment['cameraMotion']> = {
        'push in': 'zoom-in', 'zoom in': 'zoom-in', 'pull out': 'zoom-out',
        'zoom out': 'zoom-out', 'pan left': 'pan-left', 'pan right': 'pan-right',
        'tilt up': 'tilt-up', 'tilt down': 'tilt-down', 'tracking': 'tracking',
        'steadicam': 'tracking', 'dolly': 'dolly', 'handheld': 'handheld',
        'static': 'static', 'orbit': 'tracking', 'whip': 'pan-right',
      };
      let cam: MotionSegment['cameraMotion'] = 'static';
      let intensity = 0.3;
      for (const [kw, mt] of Object.entries(motionMap)) {
        if (cameraDir.includes(kw)) { cam = mt; intensity = cameraDir.includes('slow') ? 0.3 : 0.5; break; }
      }
      motion = { segments: [{ startFrame: 0, endFrame: shots[0].endFrame, motionIntensity: intensity, cameraMotion: cam }], peaks: [] };
    }

    // If Vision didn't return keyframes, use storyboard description
    if (keyframeData.length === 0 && storyboardScene.visualDescription) {
      keyframeData = [{
        frame: 0, timestampMs: 0,
        description: storyboardScene.visualDescription,
        subjects: [], shotType: 'medium', cameraAngle: 'eye-level',
        dominantColors: [], brightness: 0.6,
        moodScore: 0, energyLevel: 0.3, naturalCutPoint: false,
      }];
    }
  }

  // Layer 3: Audio analysis (independent of video — uses audio URL directly)
  if (audioUrl) {
    try {
      audioData = await analyzeAudio(audioUrl, durationMs);
    } catch (err: any) {
      console.warn(`[Layer3] Audio analysis failed: ${err.message}`);
      pipelineWarnings?.errorSwallowed('analysis', err instanceof Error ? err : new Error(String(err)), 'Layer 3 audio analysis');
    }
  }

  // Track A: Speech semantic
  //
  // Phase C asset-centric verification pass (2026-04-21, Option F):
  //
  // BEFORE this change, AI-gen clips with `storyboardScene.narration === ""`
  // (silent-intent brand ads, b-roll, montages) skipped speech classification
  // entirely — the code trusted "script said silent, clip is silent." But
  // native-audio video models (Seedance 1.5/2.0) hallucinate speech when
  // people are visible in frame, regardless of the prompt constraint. That
  // hallucinated speech:
  //   (a) was NOT detected — speechSegments stayed empty
  //   (b) got CHOPPED when duration-capping clipped the end frame mid-word
  //   (c) confused downstream SFX decisions (filter thought clip had clean
  //       native audio worth keeping; actually had random speech)
  //
  // Asset-centric fix (per user's Phase C vision): for every AI-gen clip
  // with silent script intent, VERIFY against the actual audio by
  // transcribing the generated clip. If transcription returns meaningful
  // text, flag hallucination and populate speechSegments so downstream
  // intelligence can react. This closes the "what the script asked for"
  // vs "what the model actually produced" gap the user flagged.
  //
  // Cost: +1 Deepgram call per AI-gen clip (~$0.001, +2-5s latency).
  // Trivial relative to the quality win.
  //
  // Gated by:
  //   - isAIVideo (real-footage path uses existing transcript-in branch)
  //   - !narration.trim() (scenes with intended dialogue go narration path)
  //   - videoUrl present (need source to transcribe)
  //   - Deepgram configured (graceful skip if not)
  //   - Time budget (isOverBudget skips to respect 120s cap)
  let speechSegments: SpeechSegment[] = [];
  let hasHallucinatedSpeech = false;

  if (isAIVideo && !storyboardScene?.narration?.trim() && videoUrl) {
    try {
      const { transcribeMedia, isDeepgramConfigured } = await import(
        './deepgram-service'
      );
      if (isDeepgramConfigured() && !isOverBudget()) {
        console.log(
          `[TrackA] Asset-centric verification: transcribing AI-gen clip ${assetId} (script intent: silent)`,
        );
        const t = await transcribeMedia(videoUrl);
        const transcriptText = (t.transcript || '').trim();
        // Threshold: >10 chars of non-trivial text AND >2 words = real speech,
        // not a spurious "uh" / "hmm" single-word match from noise.
        if (transcriptText.length > 10 && t.words.length > 2) {
          hasHallucinatedSpeech = true;
          const wordsForSpeech = t.words.map((w) => ({
            word: w.word,
            startMs: w.startMs,
            endMs: w.endMs,
          }));
          speechSegments = await classifySpeech(transcriptText, wordsForSpeech, geminiUsageCapture);
          console.warn(
            `[TrackA] HALLUCINATED SPEECH detected in AI-gen clip ${assetId}: ` +
            `script intent was silent but audio transcribed to "${transcriptText.substring(0, 100)}...". ` +
            `Populated ${speechSegments.length} speechSegments so downstream cut placement + audio gating can avoid mid-speech boundaries. ` +
            `Likely Seedance 1.5/2.0 native-audio hallucination from visible subjects.`,
          );
        } else {
          console.log(
            `[TrackA] AI-gen clip ${assetId} verified silent (transcript: "${transcriptText}", words: ${t.words.length})`,
          );
        }
      } else if (!isDeepgramConfigured()) {
        console.log(
          `[TrackA] Asset-centric verification skipped for ${assetId}: Deepgram not configured`,
        );
      } else {
        console.log(
          `[TrackA] Asset-centric verification skipped for ${assetId}: over 120s analysis budget`,
        );
      }
    } catch (err: any) {
      console.warn(
        `[TrackA] Transcription verification failed for ${assetId}: ${err.message}. ` +
        `Proceeding without hallucination flag — downstream will treat as silent.`,
      );
      pipelineWarnings?.errorSwallowed('analysis', err instanceof Error ? err : new Error(String(err)), 'Track A transcription verification');
    }
  }

  // Fallback to existing narration/transcript paths if verification didn't
  // populate anything (script has narration, or transcript was pre-supplied
  // by the caller for real-footage clips).
  if (speechSegments.length === 0) {
    if (storyboardScene?.narration && words) {
      // AI video path — classify the known narration (fastest, most accurate)
      speechSegments = await classifySpeech(storyboardScene.narration, words, geminiUsageCapture);
      console.log(`[TrackA] AI video: classified ${speechSegments.length} segments from storyboard narration`);
    } else if (transcript && words) {
      // Real footage path — classify from transcription supplied by caller
      speechSegments = await classifySpeech(transcript, words, geminiUsageCapture);
      console.log(`[TrackA] Real footage: classified ${speechSegments.length} segments from transcription`);
    }
  }

  // Enrich with storyboard edit directions if available
  if (storyboardScene?.editDirections && speechSegments.length > 0) {
    const ed = storyboardScene.editDirections;
    // Apply script-specified transition to the first segment
    if (ed.transition && speechSegments[0]) {
      speechSegments[0] = {
        ...speechSegments[0],
        contentType: speechSegments[0].contentType === 'neutral' ? 'transition_phrase' : speechSegments[0].contentType,
      };
    }
    // Apply motion graphic cue if specified
    if (ed.motionGraphicCue && speechSegments.length > 0) {
      const bestSeg = speechSegments.find(s => s.contentType !== 'neutral') || speechSegments[0];
      if (bestSeg && !bestSeg.suggestedGraphicType) {
        bestSeg.suggestedGraphicType = 'visual-explanation';
        bestSeg.suggestedGraphicData = {
          ...(bestSeg.suggestedGraphicData || {}),
          kind: bestSeg.suggestedGraphicData?.kind || 'free-text',
          text: bestSeg.suggestedGraphicData?.text || ed.motionGraphicCue,
        };
      }
    }
  }

  // Track C: Music structure (needs beats from Layer 3)
  const beats = audioData?.beats || [];
  const musicStructure = beats.length > 0
    ? await analyzeMusicStructure(audioUrl || '', beats.map(b => b / FPS * 1000), 120, durationMs)
    : null;

  // Fill audio silences from speech segments
  if (audioData && speechSegments.length > 0) {
    audioData.speechSegments = speechSegments.map(s => ({
      startMs: s.startMs,
      endMs: s.endMs,
      text: s.text,
    }));
  }

  // Derive natural edit points
  const naturalCutPoints: number[] = [
    ...keyframeData.filter(kf => kf.naturalCutPoint).map(kf => kf.frame),
    ...motion.peaks,
    ...(musicStructure?.drops || []),
  ].sort((a, b) => a - b);

  const audioSyncPoints = [
    ...(audioData?.beats || []),
    ...(audioData?.transients || []),
    ...(musicStructure?.stingers || []),
  ].sort((a, b) => a - b);

  // Phase 1B: Determine analysis quality and confidence breakdown
  // This tells downstream consumers how much to trust each data layer.
  // Gemini data → high confidence. Storyboard fallback → 0 confidence.
  const visionConfidence = keyframeData.length >= 3 ? 0.9 : keyframeData.length > 0 ? 0.5 : 0.0;
  const motionConfidence = motion.segments.length > 0 && motion.peaks.length > 0 ? 0.8
    : motion.segments.length > 0 ? 0.4 : 0.0;
  const audioConfidence = audioData && audioData.beats.length > 0 ? 0.85 : 0.0;
  const speechConfidence = speechSegments.length > 0 ? 0.85 : 0.0;
  const musicConfidence = musicStructure ? 0.7 : 0.0;

  const avgConfidence = [visionConfidence, motionConfidence, audioConfidence, speechConfidence, musicConfidence]
    .reduce((sum, c) => sum + c, 0) / 5;
  const analysisQuality: AssetAnalysis['analysisQuality'] =
    avgConfidence >= 0.6 ? 'high'
    : avgConfidence >= 0.3 ? 'medium'
    : avgConfidence > 0 ? 'low'
    : 'fallback';

  console.log(`[Analysis] Quality for ${assetId}: ${analysisQuality} (avg=${avgConfidence.toFixed(2)}, vision=${visionConfidence}, motion=${motionConfidence}, audio=${audioConfidence}, speech=${speechConfidence}, music=${musicConfidence})`);

  const providerUsage = buildGeminiProviderUsage(geminiUsageCapture);

  const analysis: AssetAnalysis = {
    assetId,
    userId,
    status: 'complete',
    durationMs,
    analyzedAt: new Date(),
    shots,
    motionSegments: motion.segments,
    motionPeaks: motion.peaks,
    audio: audioData,
    keyframeAnalyses: keyframeData,
    subjectTracks: subjectData,
    speechSegments,
    hasHallucinatedSpeech, // Phase C asset-centric flag — see Track A verification block above
    musicStructure,
    naturalCutPoints,
    audioSyncPoints,
    analysisQuality,
    confidenceBreakdown: {
      vision: visionConfidence,
      motion: motionConfidence,
      audio: audioConfidence,
      speech: speechConfidence,
      music: musicConfidence,
    },
  };

  if (providerUsage) {
    analysis.providerUsage = providerUsage;
  }

  // Store version + diagnostic trace
  (analysis as any).analysisVersion = ANALYSIS_VERSION;
  (analysis as any)._diagnosticTrace = trace;

  const persistedAnalysis = sourceBindingV2
    ? await saveSourceBoundAnalysisV2<AssetAnalysis>(sourceBindingV2, analysis)
    : analysis;
  if (!sourceBindingV2) await saveAnalysis(analysis);

  const layerResults = [
    shots.length > 0 ? `L1:${shots.length}shots` : null,
    motion.segments.length > 0 ? `L2:${motion.segments.length}segments` : null,
    audioData ? `L3:${audioData.beats.length}beats` : null,
    keyframeData.length > 0 ? `L4:${keyframeData.length}keyframes` : null,
    subjectData.length > 0 ? `L5:${subjectData.length}subjects` : null,
    speechSegments.length > 0 ? `TrackA:${speechSegments.length}segments` : null,
    musicStructure ? `TrackC:${musicStructure.sections.length}sections` : null,
  ].filter(Boolean);

  console.log(`[Analysis] Complete: ${layerResults.join(', ')}`);
  return persistedAnalysis;
}

/**
 * Analyze all video assets in a project.
 */
export async function analyzeProjectAssets(
  projectId: string,
  userId: string,
  /** Max time budget in ms. Analysis stops when exceeded. Default 120s. */
  timeBudgetMs: number = 120_000,
  pipelineWarnings?: PipelineWarningCollector,
): Promise<{ analyzed: number; cached: number; failed: number; timedOut: boolean }> {
  const startMs = Date.now();
  const db = await getDatabase();
  const project = await db.collection(COLLECTIONS.PROJECTS).findOne({ projectId, userId }) as any;
  if (!project) throw new Error('Project not found');

  const videoOverlays = (project.overlays || []).filter((o: any) => o.type === 'video');
  let analyzed = 0, cached = 0, failed = 0;
  let timedOut = false;

  for (const overlay of videoOverlays) {
    // F10.2: Check time budget before each analysis
    const elapsed = Date.now() - startMs;
    if (elapsed > timeBudgetMs) {
      console.warn(`[Analysis] Time budget exceeded (${Math.round(elapsed / 1000)}s > ${Math.round(timeBudgetMs / 1000)}s). ${videoOverlays.length - analyzed - cached - failed} assets skipped.`);
      timedOut = true;
      break;
    }

    const assetId = overlay.assetId;
    if (!assetId) continue;

    try {
      const existing = await getAnalysis(assetId);
      if (existing?.status === 'complete') { cached++; continue; }

      const asset = await db.collection(COLLECTIONS.MEDIA_ASSETS).findOne({ assetId }) as any;
      const videoUrl = asset?.cachedUrl || overlay.src || overlay.content;
      if (!videoUrl) { failed++; continue; }

      const durationMs = (overlay.durationInFrames / 30) * 1000;
      await runFullAnalysis(assetId, userId, { videoUrl, durationMs }, pipelineWarnings);
      analyzed++;
    } catch (err: any) {
      console.error(`[Analysis] Failed ${assetId}:`, err.message);
      pipelineWarnings?.errorSwallowed('analysis', err instanceof Error ? err : new Error(String(err)), `asset analysis ${assetId}`);
      failed++;
    }
  }

  return { analyzed, cached, failed, timedOut };
}

// ─── Smart Clip Selection ──────────────────────────────────────────

/**
 * Select the best segment of a video clip to show for a given target duration.
 *
 * Instead of always showing the FIRST N seconds of a 10s clip, this analyzes
 * the 5-Track data to find the segment with the most appropriate content.
 *
 * Content-type aware selection:
 * - Action/energetic/montage → highest motion density (where things happen)
 * - Beauty/product/food → lowest motion density (smoothest, most stable)
 * - Talking head → most centered subject with stable framing
 * - Default → motion peaks biased toward first half (natural video structure)
 *
 * @param analysis - 5-Track analysis result for the video clip
 * @param targetDurationFrames - How long to SHOW this clip (in frames)
 * @param fps - Frames per second
 * @param contentHint - Optional hint about what content type this is
 * @returns startFrame (in frames) — where in the source clip to begin playback
 */
/**
 * Minimal slop-range interface for selectBestSegment scoring.
 *
 * Structurally compatible with `SlopFlag` from asset-briefing.ts (which also has
 * these fields). Defined locally to avoid a circular import (asset-briefing.ts
 * already imports from this file).
 */
export interface SlopRange {
  startFrame: number;
  endFrame: number;
  severity: 'high' | 'medium' | 'low';
}

export function selectBestSegment(
  analysis: AssetAnalysis,
  targetDurationFrames: number,
  fps: number = 30,
  contentHint?: 'action' | 'beauty' | 'talking-head' | 'default',
  slopRanges?: SlopRange[],
): number {
  const totalFrames = Math.round(analysis.durationMs / 1000 * fps);

  // If the target is longer than or equal to the clip, start from the beginning
  if (targetDurationFrames >= totalFrames) return 0;

  // If no motion data AND no slop ranges, fall back to start
  const segments = analysis.motionSegments || [];
  const peaks = analysis.motionPeaks || [];
  const hasSlop = slopRanges && slopRanges.length > 0;
  if (segments.length === 0 && peaks.length === 0 && !hasSlop) return 0;

  // Determine selection strategy from content hint or analysis
  const strategy = contentHint || inferContentStrategy(analysis);

  // Score each possible starting frame (step by 5 frames for efficiency)
  const step = 5;
  const maxStart = totalFrames - targetDurationFrames;
  let bestStart = 0;
  let bestScore = -Infinity;

  for (let start = 0; start <= maxStart; start += step) {
    const end = start + targetDurationFrames;
    const score = scoreSegment(start, end, segments, peaks, strategy, totalFrames, slopRanges);
    if (score > bestScore) {
      bestScore = score;
      bestStart = start;
    }
  }

  return bestStart;
}

/**
 * Infer content strategy from analysis data.
 */
function inferContentStrategy(
  analysis: AssetAnalysis,
): 'action' | 'beauty' | 'talking-head' | 'default' {
  const subjects = analysis.subjectTracks || [];
  const personSubject = subjects.find(s => s.category === 'person' && s.totalScreenTimeMs > analysis.durationMs * 0.5);
  if (personSubject) return 'talking-head';

  const avgMotion = (analysis.motionSegments || []).reduce((sum, s) => sum + s.motionIntensity, 0) / Math.max(1, analysis.motionSegments?.length || 1);
  if (avgMotion > 0.5) return 'action';
  if (avgMotion < 0.15) return 'beauty';

  return 'default';
}

/**
 * Score a candidate segment based on content strategy.
 *
 * When `slopRanges` are provided (from asset-briefing's detectSlop), windows
 * overlapping with AI artifacts are heavily penalized — higher severity =
 * larger penalty. This makes the selection double as a slop-avoidance pass:
 * the returned "best window" is simultaneously high motion + low slop.
 */
function scoreSegment(
  startFrame: number,
  endFrame: number,
  segments: MotionSegment[],
  peaks: number[],
  strategy: 'action' | 'beauty' | 'talking-head' | 'default',
  totalFrames: number,
  slopRanges?: SlopRange[],
): number {
  const peaksInSegment = peaks.filter(p => p >= startFrame && p < endFrame).length;

  let motionSum = 0;
  let motionCount = 0;
  for (const seg of segments) {
    const overlapStart = Math.max(startFrame, seg.startFrame);
    const overlapEnd = Math.min(endFrame, seg.endFrame);
    if (overlapStart < overlapEnd) {
      const overlapFraction = (overlapEnd - overlapStart) / (seg.endFrame - seg.startFrame);
      motionSum += seg.motionIntensity * overlapFraction;
      motionCount++;
    }
  }
  const avgMotion = motionCount > 0 ? motionSum / motionCount : 0;

  // Bias toward earlier segments (natural video structure)
  const positionBias = 1 - (startFrame / totalFrames) * 0.3;

  // Slop penalty — windows overlapping with AI artifacts are heavily downgraded
  // so the "best" window naturally avoids slop while still favoring motion/peaks.
  // Severity weights tuned so a 1-frame high-severity slop overwhelms small
  // motion/peak gains; medium/low slop discourages but doesn't always dominate.
  let slopPenalty = 0;
  if (slopRanges && slopRanges.length > 0) {
    const windowFrames = Math.max(1, endFrame - startFrame);
    for (const flag of slopRanges) {
      const overlapStart = Math.max(startFrame, flag.startFrame);
      const overlapEnd = Math.min(endFrame, flag.endFrame);
      if (overlapStart < overlapEnd) {
        const overlapFrames = overlapEnd - overlapStart;
        const overlapFraction = overlapFrames / windowFrames;
        const severityWeight = flag.severity === 'high' ? 30 : flag.severity === 'medium' ? 15 : 5;
        slopPenalty += severityWeight * overlapFraction;
      }
    }
  }

  let baseScore: number;
  switch (strategy) {
    case 'action':
      baseScore = peaksInSegment * 10 + avgMotion * 5 + positionBias;
      break;

    case 'beauty':
      baseScore = -avgMotion * 10 - peaksInSegment * 5 + positionBias;
      break;

    case 'talking-head': {
      const centerBias = 1 - Math.abs(((startFrame + endFrame) / 2) / totalFrames - 0.5) * 2;
      baseScore = -avgMotion * 5 + centerBias * 3 + positionBias;
      break;
    }

    default:
      baseScore = peaksInSegment * 3 + avgMotion * 2 + positionBias * 2;
      break;
  }

  return baseScore - slopPenalty;
}
