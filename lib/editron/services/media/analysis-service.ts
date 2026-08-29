/**
 * Audio + Video Analysis Service
 *
 * - Audio sampling (timeline / asset)
 * - Silence + filler detection
 * - Timeline-frame conversion
 * - Video sampling + Gemini vision analysis
 */

import type {
  ContentAnalysis,
  AudioAnalysisOptions,
  SilenceGap,
  DetectedFiller,
  ProblematicSegment,
  TranscriptionWord,
} from "./types";

import { FILLER_WORDS, DEFAULTS } from "./types";
import { getTranscription } from "./transcription-service";

import { spawn } from "child_process";
import { renderMediaOnLambda } from "@remotion/lambda/client";

import fs from "fs/promises";
import path from "path";
import { nanoid } from "nanoid";

import { assetResolver } from "../asset-resolver";
import { assertRemotionSiteFresh } from "../remotion-site-version";
export { getFFmpegPath } from "./ffmpeg-runtime";
import { getFFmpegPath } from "./ffmpeg-runtime";

/* ====================================================== */
/* Helpers */
/* ====================================================== */

function framesToSeconds(frame: number, fps: number): number {
  return frame / fps;
}

async function tempFile(ext: string): Promise<string> {
  const dir = "/tmp/editron-media";
  await fs.mkdir(dir, { recursive: true });
  return path.join(dir, `${nanoid()}.${ext}`);
}

function resolveTimelineRemotionRenderConfig() {
  const functionName = process.env.REMOTION_LAMBDA_FUNCTION_NAME;
  const serveUrl = process.env.REMOTION_LAMBDA_SERVE_URL;
  if (!functionName) {
    throw new Error("REMOTION_LAMBDA_FUNCTION_NAME is not defined");
  }
  if (!serveUrl) {
    throw new Error("REMOTION_LAMBDA_SERVE_URL is not defined");
  }
  const freshness = assertRemotionSiteFresh({ serveUrl, env: process.env });
  if (freshness.reason === 'unverified_no_app_commit') {
    console.warn('[MediaAnalysis] Remotion site version could not be verified because app commit metadata is missing');
  }
  return {
    region: process.env.REMOTION_AWS_REGION as any,
    functionName,
    serveUrl,
  };
}

/* ====================================================== */
/* AUDIO SAMPLING */
/* ====================================================== */
export async function sampleAudioClip(params: {
  projectId: string;
  source: "timeline" | "asset";
  assetId?: string;
  assetUrl?: string;
  startFrame: number;
  endFrame: number;
  fps: number;
  userId: string;
  maxDurationSec?: number;
}): Promise<string> {
  const projectFps = params.fps || 30;
  const maxDurationSec = params.maxDurationSec ?? 300;

  const startSec = framesToSeconds(params.startFrame, projectFps);
  const durationSec = Math.min(
    framesToSeconds(params.endFrame - params.startFrame, projectFps),
    maxDurationSec,
  );

  /* ===============================
     TIMELINE PATH (Remotion)
     =============================== */
  if (params.source === "timeline") {
    const renderConfig = resolveTimelineRemotionRenderConfig();
    const { bucketName, renderId } = await renderMediaOnLambda({
      region: renderConfig.region,
      functionName: renderConfig.functionName,
      serveUrl: renderConfig.serveUrl,
      composition: "AudioSampler",
      inputProps: {
        projectId: params.projectId,
        startFrame: params.startFrame,
        endFrame: params.endFrame,
        fps: projectFps,
      },
      codec: "wav",
      audioCodec: "pcm-16",
      framesPerLambda: 1000,
    });

    return `s3://${bucketName}/${renderId}.wav`;
  }

  /* ===============================
     ASSET PATH (FFmpeg)
     =============================== */

  // Resolve asset URL
  let srcUrl = params.assetUrl;
  if (!srcUrl && params.assetId) {
    srcUrl = await assetResolver.resolveAssetUrl(
      params.assetId,
      params.userId,
    );
  }
  if (!srcUrl) {
    throw new Error("assetUrl or assetId is required for asset sampling");
  }

  // Download remote URLs for stability
  let inputPath = srcUrl;
  if (/^https?:\/\//i.test(srcUrl)) {
    const tmp = await tempFile("download");
    const res = await fetch(srcUrl);
    if (!res.ok) {
      throw new Error(`Failed to download audio: ${res.statusText}`);
    }
    const buffer = Buffer.from(await res.arrayBuffer());
    await fs.writeFile(tmp, buffer);
    inputPath = tmp;
  }

  const output = await tempFile("wav");

  const ffmpeg = getFFmpegPath();

  await new Promise<void>((resolve, reject) => {
    const ffArgs = [
      "-ss",
      String(startSec),
      "-t",
      String(durationSec),
      "-i",
      inputPath,
      "-vn",
      "-ac",
      "1",
      "-ar",
      "16000",
      "-acodec",
      "pcm_s16le",
      "-y",
      output,
    ];

    const ff = spawn(ffmpeg, ffArgs);

    let stderr = "";
    ff.stderr.on("data", (data) => {
      stderr += data.toString();
    });

    ff.on("exit", (code) => {
      if (code === 0) resolve();
      else reject(new Error(`FFmpeg failed (code ${code}): ${stderr}`));
    });
  });

  return output;
}

/* ============================
   sampleVideoClip (service)
   - Supports both 'timeline'(Remotion) and 'asset'(FFmpeg) paths.
   - Produces a small sampled MP4 (1 FPS by default) suitable for Gemini.
   ============================ */

export async function sampleVideoClip(params: {
  projectId: string;
  source: "timeline" | "asset";
  assetId?: string;
  assetUrl?: string;
  startFrame: number;
  endFrame: number;
  fps: number;
  userId: string;
  targetSampleFps?: number;
  maxDurationSec?: number;
}): Promise<string> {
  const projectFps = params.fps || 30;
  const sampleFps = params.targetSampleFps ?? 1;
  const maxDurationSec = params.maxDurationSec ?? 120;

  const startSec = framesToSeconds(params.startFrame, projectFps);
  const durationSec = Math.min(
    framesToSeconds(params.endFrame - params.startFrame, projectFps),
    maxDurationSec,
  );

  /* ===============================
     TIMELINE PATH (Remotion)
     =============================== */
  if (params.source === "timeline") {
    const renderConfig = resolveTimelineRemotionRenderConfig();
    const { bucketName, renderId } = await renderMediaOnLambda({
      region: renderConfig.region,
      functionName: renderConfig.functionName,
      serveUrl: renderConfig.serveUrl,
      composition: "VisualSampler",
      inputProps: {
        projectId: params.projectId,
        startFrame: params.startFrame,
        endFrame: params.endFrame,
        fps: sampleFps,
        width: 640,
      },
      codec: "h264",
      audioCodec: null,
      framesPerLambda: 300,
    });

    return `s3://${bucketName}/${renderId}.mp4`;
  }

  /* ===============================
     ASSET PATH (FFmpeg)
     =============================== */

  // Resolve asset URL
  let srcUrl = params.assetUrl;
  if (!srcUrl && params.assetId) {
    srcUrl = await assetResolver.resolveAssetUrl(params.assetId, params.userId);
  }
  if (!srcUrl) {
    throw new Error("assetUrl or assetId is required for asset sampling");
  }

  // Download remote URLs for reliability
  let inputPath = srcUrl;
  if (/^https?:\/\//i.test(srcUrl)) {
    const tmp = await tempFile("download");
    const res = await fetch(srcUrl);
    if (!res.ok) {
      throw new Error(`Failed to download video: ${res.statusText}`);
    }
    const buffer = Buffer.from(await res.arrayBuffer());
    await fs.writeFile(tmp, buffer);
    inputPath = tmp;
  }

  const output = await tempFile("mp4");

  const ffmpeg = getFFmpegPath();

  await new Promise<void>((resolve, reject) => {
    const ffArgs = [
      "-ss",
      String(startSec),
      "-t",
      String(durationSec),
      "-i",
      inputPath,
      "-vf",
      `fps=${sampleFps},scale=640:-2`,
      "-an",
      "-crf",
      "28",
      "-preset",
      "veryfast",
      "-y",
      output,
    ];

    const ff = spawn(ffmpeg, ffArgs);

    let stderr = "";
    ff.stderr.on("data", (data) => {
      stderr += data.toString();
    });

    ff.on("exit", (code) => {
      if (code === 0) resolve();
      else reject(new Error(`FFmpeg failed (code ${code}): ${stderr}`));
    });
  });

  return output;
}

/* ====================================================== */
/* AUDIO ANALYSIS CORE (EXISTING) */
/* ====================================================== */

export async function analyzeContent(
  assetId: string,
  userId: string,
  options: AudioAnalysisOptions = {},
): Promise<ContentAnalysis> {
  const {
    silenceThresholdMs = DEFAULTS.SILENCE_THRESHOLD_MS,
    detectFillers = true,
  } = options;

  const transcription = await getTranscription(assetId, userId);

  const silenceGaps = detectSilenceGaps(
    transcription.words,
    silenceThresholdMs,
  );

  const fillerWords = detectFillers
    ? detectFillerWords(transcription.words)
    : [];

  const problematicSegments = identifyProblematicSegments(
    silenceGaps,
    fillerWords,
  );

  const totalSilenceMs = silenceGaps.reduce((s, g) => s + g.durationMs, 0);
  const potentialSavingsMs = problematicSegments.reduce(
    (s, p) => s + (p.endMs - p.startMs),
    0,
  );

  return {
    silences: silenceGaps,
    fillers: fillerWords,
    silenceGaps,
    fillerWords,
    problematicSegments,
    summary: {
      totalSilenceMs,
      totalFillerWords: fillerWords.length,
      problematicCount: problematicSegments.length,
      potentialSavingsMs,
    },
  };
}

/* ====================================================== */
/* GEMINI HELPERS */
/* ====================================================== */

async function sendAudioToGemini(params: {
  audioFilePath: string;
  prompt?: string;
}): Promise<{
  silences: Array<{ start: number; end: number }>;
  fillers: Array<{ word: string; time: number }>;
  summary: string;
}> {
  // OLD: hardcoded gemini-2.5-flash. NEW: Gemma 4 via factory.
  const { getGenAI, ANALYSIS_MODEL_NAME } = await import('@/lib/editron/utils/gemini-model-factory');
  const genAI = await getGenAI();
  const model = genAI.getGenerativeModel({
    model: ANALYSIS_MODEL_NAME,
    generationConfig: {
      temperature: 0.2,
      maxOutputTokens: 2048,
    },
  });

  // Read audio file as base64
  const audioBuffer = await fs.readFile(params.audioFilePath);
  const base64Audio = audioBuffer.toString("base64");

  const prompt =
    params.prompt ||
    `<role>You are a professional audio editor analyzing this audio clip for editing purposes.</role>

<task>Detect silence gaps, filler words, and summarize the audio content.</task>

<rules>
RULE 1 — Audio duration is ≤ 120 seconds. Timestamps are in seconds from the start of this clip.
RULE 2 — Be aggressive: prefer false positives over missing issues.
RULE 3 — Silence Gaps: detect gaps longer than 2 seconds. Return start and end times in seconds. Be precise with timestamps.
RULE 4 — Filler Words: detect "um", "uh", "like", "you know", "so", "actually", "basically", "literally". Return exact word and timestamp in seconds. Include natural speech hesitations.
RULE 5 — Summary: brief description of what's being said. Note the speaker's tone and pacing.
RULE 6 — Do NOT return empty arrays unless absolutely nothing is found.
RULE 7 — Observe only what you actually hear.
RULE 8 — Return ONLY valid JSON (no markdown, no explanation).
RULE 9 — If nothing found, return empty arrays but always provide a summary.
</rules>

<output_format>
{
  "silences": [
    {"start": 5.2, "end": 8.1},
    {"start": 15.7, "end": 18.3}
  ],
  "fillers": [
    {"word": "um", "time": 12.5},
    {"word": "like", "time": 23.8}
  ],
  "summary": "Brief description of audio content and speaker delivery"
}
</output_format>`;

  try {
    const result = await model.generateContent([
      {
        inlineData: {
          mimeType: "audio/wav",
          data: base64Audio,
        },
      },
      { text: prompt },
    ]);

    const response = await result.response;
    const text = response.text();

    // Parse JSON response (handle markdown fences)
    let cleanText = text.trim();
    if (cleanText.startsWith("```json")) {
      cleanText = cleanText.replace(/```json\n?/gi, "").replace(/```\n?/g, "");
    } else if (cleanText.startsWith("```")) {
      cleanText = cleanText.replace(/```\n?/g, "");
    }

    const parsed = JSON.parse(cleanText);

    return {
      silences: Array.isArray(parsed.silences) ? parsed.silences : [],
      fillers: Array.isArray(parsed.fillers) ? parsed.fillers : [],
      summary: parsed.summary || "No summary provided by AI",
    };
  } catch (error: any) {
    console.error("[GEMINI-AUDIO] Error details:", {
      message: error?.message,
      status: error?.status,
      statusText: error?.statusText,
    });

    throw new Error(`Gemini audio analysis failed: ${error?.message || 'Unknown error'}`, { cause: error });
  }
}

export async function sendVideoToGemini(params: {
  filePath: string;
  prompt?: string;
}): Promise<{
  sceneChanges: number[];
  deadVisualRanges: Array<[number, number]>;
  gestures: string[];
  onScreenText: string[];
  summary: string;
  theme: string;
}> {
  // OLD: hardcoded gemini-2.5-flash. NEW: Gemma 4 via factory.
  const { getGenAI, ANALYSIS_MODEL_NAME } = await import('@/lib/editron/utils/gemini-model-factory');
  const genAI = await getGenAI();
  const model = genAI.getGenerativeModel({
    model: ANALYSIS_MODEL_NAME,
    generationConfig: {
      temperature: 0.2,
      maxOutputTokens: 2048,
    },
  });

  const videoBuffer = await fs.readFile(params.filePath);
  const base64Video = videoBuffer.toString("base64");

  const ext = params.filePath.split(".").pop()?.toLowerCase();
  const mimeType =
    ext === "webm"
      ? "video/webm"
      : ext === "mov"
        ? "video/quicktime"
        : "video/mp4";

  const prompt =
    params.prompt ||
    `<role>You are a professional video editor analyzing a video sampled at EXACTLY 1 FPS.</role>

<task>Detect scene changes, dead visual ranges, gestures, and on-screen text in this video.</task>

<rules>
RULE 1 — Frame index = second index (frame 0 = 0s, frame 10 = 10s). Video duration ≤ 120 seconds.
RULE 2 — Be aggressive: prefer false positives over missing events.
RULE 3 — Scene changes: detect cuts, shot changes, camera movement, lighting shifts.
RULE 4 — Dead visual ranges: detect static, boring, repetitive segments.
RULE 5 — Gestures: detect any visible human or object motion.
RULE 6 — On-screen text: detect any readable or partially readable text.
RULE 7 — Do NOT return empty arrays unless absolutely nothing changes.
RULE 8 — Observe only what is visible.
RULE 9 — Return ONLY valid JSON (no markdown, no explanation).
</rules>

<output_format>
{
  "sceneChanges": [2, 6, 14],
  "deadVisualRanges": [[8, 12]],
  "gestures": ["person turns head at frame 3"],
  "onScreenText": ["Welcome - frame 0"],
  "summary": "Brief description of subject and activity",
  "theme": "tutorial|promo|story|demo|other"
}
</output_format>`;

  try {
    const result = await model.generateContent([
      {
        inlineData: {
          mimeType,
          data: base64Video,
        },
      },
      { text: prompt },
    ]);

    const raw = result.response.text().trim();
    const clean = raw.replace(/```json|```/g, "").trim();
    const parsed = JSON.parse(clean);

    return {
      sceneChanges: parsed.sceneChanges || [],
      deadVisualRanges: parsed.deadVisualRanges || [],
      gestures: parsed.gestures || [],
      onScreenText: parsed.onScreenText || [],
      summary: parsed.summary || "No summary available",
      theme: parsed.theme || "other",
    };
  } catch (error: any) {
    console.error("[GEMINI-VIDEO] Error:", error);
    throw new Error(`Gemini video analysis failed: ${error?.message || 'Unknown error'}`, { cause: error });
  }
}

/* ====================================================== */
/* NEW: AUDIO ANALYSIS WITH GEMINI */
/* ====================================================== */

export async function analyzeClipAudioService(params: {
  projectId: string;
  userId: string;
  source: "timeline" | "asset";
  assetId?: string;
  timelineStartFrame?: number;
  startFrame: number;
  endFrame: number;
  fps: number;
}): Promise<{
  summary: {
    totalSilenceMs: number;
    totalFillerWords: number;
    potentialSavingsMs: number;
  };
  silenceGapsFrames: Array<{ startFrame: number; endFrame: number }>;
  fillers: Array<{ word: string; frame: number }>;
  problematicFrames: Array<{
    startFrame: number;
    endFrame: number;
    description: string;
  }>;
}> {
  // 1) Sample audio
  const audioFilePath = await sampleAudioClip({
    projectId: params.projectId,
    source: params.source,
    assetId: params.assetId,
    startFrame: params.startFrame,
    endFrame: params.endFrame,
    fps: params.fps,
    userId: params.userId,
  });

  // 2) Send to Gemini with proper prompt
  const geminiResult = await sendAudioToGemini({
    audioFilePath,
  });

  // 3) Convert seconds to timeline frames
  const outputStartFrame = params.timelineStartFrame ?? params.startFrame;
  const toFrame = (sec: number) =>
    outputStartFrame + Math.round(sec * params.fps);

  // 4) Process silences
  const silenceGapsFrames = geminiResult.silences.map((s) => ({
    startFrame: toFrame(s.start),
    endFrame: toFrame(s.end),
  }));

  // 5) Process fillers
  const fillers = geminiResult.fillers.map((f) => ({
    word: f.word,
    frame: toFrame(f.time),
  }));

  // 6) Build problematic frame ranges
  const silenceProblems = silenceGapsFrames.map((gap) => {
    const durationSec = (gap.endFrame - gap.startFrame) / params.fps;
    return {
      startFrame: gap.startFrame,
      endFrame: gap.endFrame,
      description: `${durationSec.toFixed(1)}s silence`,
    };
  });

  const fillerProblems = fillers.map((f) => ({
    startFrame: f.frame,
    endFrame: f.frame + Math.round(0.3 * params.fps), // 300ms window
    description: `Filler word: "${f.word}"`,
  }));

  const problematicFrames = [...silenceProblems, ...fillerProblems].sort(
    (a, b) => a.startFrame - b.startFrame,
  );

  // 7) Calculate summary metrics
  const totalSilenceMs = geminiResult.silences.reduce(
    (sum, s) => sum + (s.end - s.start) * 1000,
    0,
  );

  const potentialSavingsMs = totalSilenceMs + fillers.length * 300;

  return {
    summary: {
      totalSilenceMs: Math.round(totalSilenceMs),
      totalFillerWords: fillers.length,
      potentialSavingsMs: Math.round(potentialSavingsMs),
    },
    silenceGapsFrames,
    fillers,
    problematicFrames,
  };
}

/* ====================================================== */
/* Utilities */
/* ====================================================== */

function detectSilenceGaps(
  words: TranscriptionWord[],
  thresholdMs: number,
): SilenceGap[] {
  const gaps: SilenceGap[] = [];

  for (let i = 0; i < words.length - 1; i++) {
    const gapMs = words[i + 1].startMs - words[i].endMs;

    if (gapMs >= thresholdMs) {
      gaps.push({
        startMs: words[i].endMs,
        endMs: words[i + 1].startMs,
        durationMs: gapMs,
        beforeWord: words[i].word,
        afterWord: words[i + 1].word,
      });
    }
  }

  return gaps;
}

function detectFillerWords(words: TranscriptionWord[]): DetectedFiller[] {
  return words
    .filter((w) =>
      FILLER_WORDS.includes(w.word.toLowerCase().replace(/[.,!?]/g, "") as any),
    )
    .map((w) => ({
      word: w.word,
      startMs: w.startMs,
      endMs: w.endMs,
      hasSurroundingSilence: false,
      totalGapMs: w.endMs - w.startMs,
    }));
}

function identifyProblematicSegments(
  silenceGaps: SilenceGap[],
  fillers: DetectedFiller[],
): ProblematicSegment[] {
  return silenceGaps.map((g) => ({
    startMs: g.startMs,
    endMs: g.endMs,
    reason: "long_silence" as const,
    severity:
      g.durationMs > 5000
        ? ("high" as const)
        : g.durationMs > 3000
          ? ("medium" as const)
          : ("low" as const),
    description: `${(g.durationMs / 1000).toFixed(1)}s silence`,
  }));
}

/* ====================================================== */
/* Timeline Conversion */
/* ====================================================== */

export function analysisToTimelineFrames(
  analysis: ContentAnalysis,
  clipFrom: number,
  videoStartTime: number,
  fps: number,
) {
  const msToFrame = (ms: number) =>
    clipFrom + Math.round(((ms - videoStartTime * 1000) / 1000) * fps);

  return {
    ...analysis,
    silenceGapsFrames: analysis.silenceGaps.map((g) => ({
      startFrame: msToFrame(g.startMs),
      endFrame: msToFrame(g.endMs),
    })),
    problematicFrames: analysis.problematicSegments.map((p) => ({
      startFrame: msToFrame(p.startMs),
      endFrame: msToFrame(p.endMs),
      description: p.description,
    })),
  };
}
