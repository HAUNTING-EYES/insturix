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
  suggestedGraphicType: string;
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

/** Full analysis result */
export interface AssetAnalysis {
  assetId: string;
  userId: string;
  status: 'pending' | 'processing' | 'complete' | 'failed';
  durationMs: number;
  analyzedAt: Date;

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

  // Track C: Music structure
  musicStructure: MusicStructure | null;

  // Derived: Natural edit points
  naturalCutPoints: number[];      // Frame numbers
  audioSyncPoints: number[];       // Transients + beats combined
}

// ─── MongoDB ─────────────────────────────────────────────────────

const ANALYSIS_COLLECTION = 'asset_analyses';

export async function getAnalysis(assetId: string): Promise<AssetAnalysis | null> {
  const db = await getDatabase();
  return db.collection(ANALYSIS_COLLECTION).findOne({ assetId }) as any;
}

export async function saveAnalysis(analysis: AssetAnalysis): Promise<void> {
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
async function uploadToGeminiFiles(
  videoUrl: string,
  assetId: string,
  durationMs: number,
): Promise<string | null> {
  const apiKey = process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY;
  if (!apiKey) {
    console.warn('[GeminiFiles] No API key set');
    return null;
  }

  try {
    // Download video from GCS signed URL
    console.log(`[GeminiFiles] Downloading video ${assetId} (${Math.round(durationMs / 1000)}s)...`);
    const response = await fetch(videoUrl);
    if (!response.ok) {
      console.error(`[GeminiFiles] Download failed: ${response.status}`);
      return null;
    }

    const buffer = Buffer.from(await response.arrayBuffer());
    const sizeKb = Math.round(buffer.length / 1024);
    console.log(`[GeminiFiles] Downloaded ${sizeKb}KB, uploading to Gemini...`);

    // Skip videos > 50MB (Gemini free tier practical limit for video)
    if (buffer.length > 50 * 1024 * 1024) {
      console.warn(`[GeminiFiles] Video too large (${sizeKb}KB), skipping`);
      return null;
    }

    // Upload via @google/generative-ai SDK — more reliable than manual multipart
    const { GoogleAIFileManager } = await import('@google/generative-ai/server');
    const fileManager = new GoogleAIFileManager(apiKey);

    // Write buffer to temp file (SDK needs a file path)
    const os = await import('os');
    const path = await import('path');
    const fs = await import('fs');
    const tmpPath = path.join(os.tmpdir(), `gemini_${assetId}_${Date.now()}.mp4`);

    try {
      fs.writeFileSync(tmpPath, buffer);
      console.log(`[GeminiFiles] Wrote temp file: ${tmpPath} (${sizeKb}KB)`);

      const uploadResult = await fileManager.uploadFile(tmpPath, {
        mimeType: 'video/mp4',
        displayName: `${assetId}.mp4`,
      });

      const fileUri = uploadResult?.file?.uri;
      const fileName = uploadResult?.file?.name;

      if (!fileUri) {
        console.error('[GeminiFiles] No URI in upload response:', JSON.stringify(uploadResult).substring(0, 300));
        return null;
      }

      console.log(`[GeminiFiles] Uploaded: ${fileUri.substring(0, 80)}...`);

      // Wait for ACTIVE state (Gemini processes the video)
      let fileState = uploadResult?.file?.state;
      let retries = 0;
      while (fileState !== 'ACTIVE' && retries < 15) {
        await new Promise(r => setTimeout(r, 2000));
        try {
          const checkResult = await fileManager.getFile(fileName!);
          fileState = checkResult?.state;
        } catch {} // Ignore check errors, keep polling
        retries++;
      }

      if (fileState !== 'ACTIVE') {
        console.error(`[GeminiFiles] File not ACTIVE after ${retries * 2}s (state: ${fileState}). Aborting.`);
        return null;
      }

      return fileUri;
    } finally {
      // Clean up temp file
      try { fs.unlinkSync(tmpPath); } catch {}
    }
  } catch (err: any) {
    console.error(`[GeminiFiles] Upload failed: ${err.message}`);
    return null;
  }
}

// ─── Layer 1: Shot Detection ─────────────────────────────────────

async function detectShots(videoUrl: string, durationMs: number, fps: number): Promise<Shot[]> {
  // Use Gemini Vision to detect scene changes (server-side PySceneDetect not available on Vercel)
  // This gives ~90% accuracy vs pixel-diff algorithms
  try {
    const apiKey = process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY;
    if (!apiKey) return [{ startFrame: 0, endFrame: Math.round(durationMs / 1000 * fps), durationMs }];

    const { GoogleGenerativeAI } = await import('@google/generative-ai');
    const genAI = new GoogleGenerativeAI(apiKey);
    const model = genAI.getGenerativeModel({ model: 'gemini-2.5-flash' });

    const result = await model.generateContent([
      {
        text: `Detect ALL shot/scene boundaries in this ${Math.round(durationMs / 1000)}s video at ${fps}fps.
A "shot" = continuous camera take between two cuts.
Return ONLY a JSON array of objects: [{"startFrame": 0, "endFrame": 150}, ...]
Be precise — every visual cut, dissolve, or transition is a boundary.`,
      },
      { fileData: { mimeType: 'video/mp4', fileUri: videoUrl } },
    ]);

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
): Promise<{
  motion: { segments: MotionSegment[]; peaks: number[] };
  keyframes: FrameAnalysis[];
  subjects: SubjectTrackEntry[];
} | null> {
  const apiKey = process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY;
  if (!apiKey) return null;

  try {
    const { GoogleGenerativeAI } = await import('@google/generative-ai');
    const genAI = new GoogleGenerativeAI(apiKey);
    const model = genAI.getGenerativeModel({ model: 'gemini-2.5-flash' });

    const fps = 30;
    const totalFrames = Math.round((durationMs / 1000) * fps);

    const prompt = `Analyze this video comprehensively. Return a JSON object with exactly these three sections:

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

Analyze at least 3 keyframes spread across the video. Identify all visible subjects. Detect camera motion type and intensity. Mark natural cut points. Return ONLY valid JSON, no markdown.`;

    const result = await model.generateContent([
      { fileData: { fileUri, mimeType: 'video/mp4' } },
      { text: prompt },
    ]);

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

async function analyzeMotion(videoUrl: string, shots: Shot[], durationMs: number): Promise<{
  segments: MotionSegment[];
  peaks: number[];
}> {
  try {
    const apiKey = process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY;
    if (!apiKey) return { segments: [], peaks: [] };

    const { GoogleGenerativeAI } = await import('@google/generative-ai');
    const genAI = new GoogleGenerativeAI(apiKey);
    const model = genAI.getGenerativeModel({ model: 'gemini-2.5-flash' });

    const result = await model.generateContent([
      {
        text: `Analyze camera motion for each shot in this ${Math.round(durationMs / 1000)}s video.
There are ${shots.length} shots. For each shot, classify:
- motionIntensity: 0.0-1.0 (0=static, 1=rapid motion)
- cameraMotion: static/pan-left/pan-right/tilt-up/tilt-down/zoom-in/zoom-out/tracking/handheld/dolly

Also identify the top 5 frames with highest motion intensity (motion peaks).

Return ONLY JSON:
{
  "segments": [{"startFrame": 0, "endFrame": 150, "motionIntensity": 0.3, "cameraMotion": "static"}, ...],
  "peaks": [47, 180, 320, ...]
}`,
      },
      { fileData: { mimeType: 'video/mp4', fileUri: videoUrl } },
    ]);

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
    const { detectBeats } = await import('./media/beat-detection-service');
    const beatResult = await detectBeats(audioUrl);

    const beats = beatResult?.beats || [];
    const bpm = beatResult?.bpm || 120;

    // Build energy curve from beat density (every 1s window)
    const windowMs = 1000;
    const energyCurve: AudioAnalysis['energyCurve'] = [];
    for (let t = 0; t < durationMs; t += windowMs) {
      const beatsInWindow = beats.filter((b: number) => b >= t && b < t + windowMs).length;
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
      beats: beats.map((b: number) => Math.round(b / 1000 * 30)), // Convert ms to frames
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
): Promise<FrameAnalysis[]> {
  try {
    const apiKey = process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY;
    if (!apiKey) return [];

    const { GoogleGenerativeAI } = await import('@google/generative-ai');
    const genAI = new GoogleGenerativeAI(apiKey);
    const model = genAI.getGenerativeModel({ model: 'gemini-2.5-flash' });

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
): Promise<SubjectTrackEntry[]> {
  try {
    const apiKey = process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY;
    if (!apiKey) return [];

    const { GoogleGenerativeAI } = await import('@google/generative-ai');
    const genAI = new GoogleGenerativeAI(apiKey);
    const model = genAI.getGenerativeModel({ model: 'gemini-2.5-flash' });

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

export async function classifySpeech(
  transcript: string,
  words: Array<{ word: string; startMs: number; endMs: number }>,
): Promise<SpeechSegment[]> {
  try {
    const apiKey = process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY;
    if (!apiKey || !transcript.trim()) return [];

    const { GoogleGenerativeAI } = await import('@google/generative-ai');
    const genAI = new GoogleGenerativeAI(apiKey);
    const model = genAI.getGenerativeModel({ model: 'gemini-2.5-flash' });

    const result = await model.generateContent(`Classify this video transcript into segments. Each segment is a continuous stretch of speech with the same content type.

TRANSCRIPT:
"${transcript}"

For each segment return:
- startMs, endMs (approximate from word positions)
- text: the segment text
- contentType: one of [statistic, claim, question, step_instruction, story_moment, cta, transition_phrase, emphasis, comparison, social_proof, definition, neutral]
- entities: [{type: "number"|"percentage"|"currency"|"name"|"product"|"concept"|"action"|"emotion", value: "...", unit?: "x"|"%"|"$", isGrowth?: true/false}]
- suggestedGraphicType: what visual should appear (animated-growth-chart, counter-animation, step-label, definition-card, cta-button, bold-statement-card, question-card, side-by-side-comparison, kinetic-text-highlight, or "none")
- suggestedGraphicData: {key: value} data for the graphic template
- confidence: 0-1
- keywordHighlights: [{word, importance: "normal"|"keyword"|"emphasis"|"stat"|"name"}] — the 3-5 most important words

Word timestamps for reference:
${words.slice(0, 50).map(w => `"${w.word}" ${w.startMs}ms`).join(', ')}${words.length > 50 ? '...' : ''}

Return ONLY a JSON array: [...]`);

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

export async function analyzeMusicStructure(
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

export async function runFullAnalysis(
  assetId: string,
  userId: string,
  options: {
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
  },
): Promise<AssetAnalysis> {
  const { videoUrl, audioUrl, durationMs, transcript, words, storyboardScene, sourceType = 'ai-generated' } = options;

  const isAIVideo = sourceType === 'ai-generated';
  const analysisStartMs = Date.now();
  const TIME_BUDGET_MS = 120_000; // 120s max — leaves 180s for Director execution within 300s Vercel limit
  const isOverBudget = () => Date.now() - analysisStartMs > TIME_BUDGET_MS;
  console.log(`[Analysis] Starting ${isAIVideo ? 'AI-video' : 'real-footage'} analysis for ${assetId} (${Math.round(durationMs / 1000)}s, budget: ${TIME_BUDGET_MS / 1000}s)`);

  // Check cache
  const cached = await getAnalysis(assetId);
  if (cached && cached.status === 'complete' &&
      Date.now() - new Date(cached.analyzedAt).getTime() < 7 * 24 * 60 * 60 * 1000) {
    console.log(`[Analysis] Using cached analysis for ${assetId}`);
    return cached;
  }

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

        // Upload video to Gemini Files API
        const t1 = traceStep('gemini_upload');
        let geminiFileUri: string | null = null;
        try {
          geminiFileUri = await uploadToGeminiFiles(videoUrl, assetId, durationMs);
          if (geminiFileUri) {
            t1.ok(`uri=${geminiFileUri.substring(0, 60)}...`);
          } else {
            t1.fail('returned null — check GCS URL accessibility or Gemini API key');
          }
        } catch (uploadErr: any) {
          t1.fail(uploadErr.message);
          console.error(`[Analysis] Upload failed:`, uploadErr.message);
        }

        if (geminiFileUri && !isOverBudget()) {
          // Merged Gemini Vision call for Layers 2+4+5
          const t2 = traceStep('merged_vision_analysis');
          try {
            const merged = await analyzeVideoComprehensive(geminiFileUri, shots, durationMs);
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

            // Fallback to individual calls
            const t3 = traceStep('fallback_individual_calls');
            try {
              const [motionResult, kfResult, subjectResult] = await Promise.allSettled([
                analyzeMotion(geminiFileUri, shots, durationMs),
                analyzeKeyframes(geminiFileUri, shots, durationMs),
                trackSubjects(geminiFileUri, [], durationMs),
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
    }
  } else {
    trace.push({ step: 'video_url', status: 'skipped: no videoUrl provided', durationMs: 0 });
  }

  // Log full trace for debugging
  console.log(`[Analysis] TRACE for ${assetId}:`, JSON.stringify(trace));

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
    }
  }

  // Track A: Speech semantic
  // AI videos: use storyboard narration (richest source — we wrote it)
  // Real footage: classify from transcription
  let speechSegments: SpeechSegment[] = [];
  if (storyboardScene?.narration && words) {
    // AI video path — classify the known narration (fastest, most accurate)
    speechSegments = await classifySpeech(storyboardScene.narration, words);
    console.log(`[TrackA] AI video: classified ${speechSegments.length} segments from storyboard narration`);
  } else if (transcript && words) {
    // Real footage path — classify from transcription
    speechSegments = await classifySpeech(transcript, words);
    console.log(`[TrackA] Real footage: classified ${speechSegments.length} segments from transcription`);
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
        bestSeg.suggestedGraphicType = ed.motionGraphicCue;
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
    musicStructure,
    naturalCutPoints,
    audioSyncPoints,
  };

  // Store diagnostic trace for debugging (accessible via debug panel)
  (analysis as any)._diagnosticTrace = trace;

  await saveAnalysis(analysis);

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
  return analysis;
}

/**
 * Analyze all video assets in a project.
 */
export async function analyzeProjectAssets(
  projectId: string,
  userId: string,
  /** Max time budget in ms. Analysis stops when exceeded. Default 120s. */
  timeBudgetMs: number = 120_000,
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
      await runFullAnalysis(assetId, userId, { videoUrl, durationMs });
      analyzed++;
    } catch (err: any) {
      console.error(`[Analysis] Failed ${assetId}:`, err.message);
      failed++;
    }
  }

  return { analyzed, cached, failed, timedOut };
}
