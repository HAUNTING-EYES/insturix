/**
 * Video Understanding Service — Stage 3: Analyze Visual Setup
 *
 * Watches the full video via Gemini Vision and extracts HOLISTIC visual
 * observations that are stable across edits (don't change after cutting).
 *
 * Per creative doc v3 (intent:stage.analyze_visual_setup):
 *   "Scene classification, face detection, shot scale, lighting analysis
 *    on raw video keyframes — observations stable across edits."
 *
 * Does NOT decompose into scenes. Scene boundaries come from the transcript
 * (Stage 1) and signal executor (Path D). VU provides the visual CONTEXT
 * that modulates how those signals are interpreted.
 *
 * A professional editor's first watch: What's the setup? How many people?
 * What's the production quality? What shot types are available? What's the
 * visual tone? — NOT "here are 125 timestamped scenes."
 *
 * Cost: 1 Gemini call (~$0.03-0.05 — much less output than scene decomposition).
 */

import type { PipelineWarningCollector } from './pipeline-warnings';

// ─── Types ──────────────────────────────────────────────────────

export interface VisualSetup {
  environment: 'indoor-studio' | 'indoor-casual' | 'outdoor' | 'mixed' | 'screen-recording' | 'other';
  subjectCount: number;
  hasFace: boolean;
  dominantShotScale: 'close-up' | 'medium' | 'wide' | 'mix';
  availableShotTypes: string[];
  lightingQuality: 'professional' | 'natural-good' | 'natural-poor' | 'artificial' | 'mixed';
  productionQuality: 'professional' | 'prosumer' | 'casual' | 'low';
  colorTemperature: 'warm' | 'cool' | 'neutral' | 'mixed';
  hasBRoll: boolean;
  cameraMovement: 'static' | 'handheld' | 'tripod-pan' | 'tracking' | 'mixed';
  visualComplexity: number;
  backgroundDescription: string;
  notableVisualElements: string[];
}

export interface SyntheticScene {
  sceneIndex: number;
  startSec: number;
  endSec: number;
  sceneType: 'continuous' | 'montage' | 'talking-head' | 'text-card' | 'logo-reveal';
  descriptor: {
    narration: string;
    visualDescription: string;
    mood: string;
    cameraDirection: string;
    audioDescription: string;
    musicDescription: string;
    sfxDescription: string;
    editDirections: {
      transition: { type: string };
      pacing: string;
      onScreenText: string[];
    };
    durationSeconds: number;
  };
}

export interface SyntheticStoryboard {
  sourceVideoUrl: string;
  contentType: string;
  platform: string;
  title: string;
  overallMusicPrompt: string;
  globalEditDirections: {
    colorGrade: string;
    pacing: string;
    graphicsDensity: string;
    musicMood: string;
    narrativeArc: string;
  };
  /** Visual setup from Stage 3 — holistic observations stable across edits */
  visualSetup?: VisualSetup;
  scenes: SyntheticScene[];
  analyzedAt: string;
  /** Gemini file URI from VU upload — reusable by 5-Track to skip redundant CDN download */
  geminiFileUri?: string;
}

// ─── Main Entry ─────────────────────────────────────────────────

/**
 * Analyze a video and produce a SyntheticStoryboard.
 * Uses Gemini Vision to extract holistic visual context:
 * - Visual setup (environment, lighting, production quality, camera movement)
 * - Global edit directions (color grade, pacing, graphics density)
 * - Content type + platform detection
 *
 * When segmentContext is provided (post-cut), the prompt tells Gemini which
 * portions of the video will be in the final edit so it focuses its
 * analysis on what the viewer will actually see.
 *
 * @param videoUrl - Playable video URL (R2 CDN or GCS signed)
 * @param durationSec - Video duration in seconds (corrected by transcript if available)
 * @param userIntent - Optional hint ("gym promo for Instagram")
 * @param segmentContext - Optional post-cut segment info (kept count, duration, content type, ranges)
 */
export async function analyzeVideo(
  videoUrl: string,
  durationSec: number,
  userIntent?: string,
  segmentContext?: {
    keptCount: number;
    totalKeptSec: number;
    contentType: string;
    keptRanges?: Array<{ startSec: number; endSec: number }>;
  },
  pipelineWarnings?: PipelineWarningCollector,
): Promise<SyntheticStoryboard | null> {
  // Use creative doc cached model — gives Gemini professional editing knowledge
  // Falls back to uncached analysis model on any cache failure
  const { getCreativeDocModel } = await import('@/lib/editron/utils/gemini-model-factory');

  try {
    // Download video → upload to Gemini Files API for vision analysis
    const fileUri = await uploadVideoToGemini(videoUrl);
    if (!fileUri) {
      console.warn('[VideoUnderstanding] Gemini upload failed, returning null');
      return null;
    }

    const model = await getCreativeDocModel();

    let contextBlocks = '';
    if (userIntent) {
      contextBlocks += `\n<user_intent>${userIntent}</user_intent>`;
    }
    if (segmentContext && segmentContext.keptCount > 0) {
      let editBlock = `\n<edit_context>This video has been edited. The final cut keeps ${segmentContext.keptCount} segments (${segmentContext.totalKeptSec}s of ${Math.round(durationSec)}s original). Content type: ${segmentContext.contentType}. Focus your visual assessment on the kept content — removed portions contain retakes, false starts, and dead air that the viewer will never see.`;
      if (segmentContext.keptRanges && segmentContext.keptRanges.length > 0) {
        editBlock += `\nKept time ranges: ${segmentContext.keptRanges.map(r => `${r.startSec}-${r.endSec}s`).join(', ')}${segmentContext.keptRanges.length < segmentContext.keptCount ? ` (showing first ${segmentContext.keptRanges.length} of ${segmentContext.keptCount})` : ''}`;
      }
      editBlock += '</edit_context>';
      contextBlocks += editBlock;
    }

    const prompt = `<role>You are a professional video editor watching ${segmentContext ? 'edited' : 'raw'} footage for the first time.</role>

<task>Understand the VISUAL SETUP of this ${Math.round(durationSec)}s footage — what kind of space, who's in it, how it's shot, what the production quality is. You are NOT breaking it into scenes. Scene boundaries come from the transcript, not from you.</task>
${contextBlocks}
<rules>
RULE 1 — Watch the ENTIRE video before answering.
RULE 2 — visualSetup describes what is STABLE across the footage — the room doesn't change, the lighting doesn't change, the number of people doesn't change. Report what persists.
RULE 3 — availableShotTypes: list ALL distinct shot framings you observe (close-up, medium, wide, over-shoulder, etc.)
RULE 4 — visualComplexity: 0.0 = static talking head with plain background, 1.0 = fast-moving multi-subject scene with complex background.
RULE 5 — hasBRoll: true ONLY if there are non-primary shots (cutaways, product shots, B-roll inserts). NOT if the speaker just moves.
RULE 6 — contentType and platform: infer from visual style, subjects, aspect ratio, length.
RULE 7 — Do NOT list scenes or timestamps. Do NOT transcribe speech. Just describe the visual setup.
RULE 8 — Return ONLY the JSON object. No markdown, no explanation.
</rules>

<output_format>
{
  "contentType": "tutorial|vlog|ad|interview|product-demo|sports|corporate|testimonial|music-video|documentary",
  "platform": "youtube|instagram|tiktok|linkedin|general",
  "title": "descriptive title for this content",
  "overallMusicPrompt": "mood and style for background music that fits this footage",
  "globalEditDirections": {
    "colorGrade": "warm|cool|neutral|cinematic|vibrant",
    "pacing": "fast|medium|slow",
    "graphicsDensity": "heavy|moderate|minimal",
    "musicMood": "one-line music mood description",
    "narrativeArc": "three-act|hook-value-cta|before-after|testimonial-arc|day-in-the-life"
  },
  "visualSetup": {
    "environment": "indoor-studio|indoor-casual|outdoor|mixed|screen-recording|other",
    "subjectCount": 1,
    "hasFace": true,
    "dominantShotScale": "close-up|medium|wide|mix",
    "availableShotTypes": ["medium-shot", "close-up"],
    "lightingQuality": "professional|natural-good|natural-poor|artificial|mixed",
    "productionQuality": "professional|prosumer|casual|low",
    "colorTemperature": "warm|cool|neutral|mixed",
    "hasBRoll": false,
    "cameraMovement": "static|handheld|tripod-pan|tracking|mixed",
    "visualComplexity": 0.3,
    "backgroundDescription": "what is behind the subject — one sentence",
    "notableVisualElements": ["props or objects that could be referenced in graphics"]
  },
  "briefSummary": "2-3 sentence summary of what this video is about and who the speaker/subject is"
}
</output_format>`;

    console.log(`[VideoUnderstanding] Analyzing ${durationSec}s video...`);

    const result = await model.generateContent([
      { fileData: { fileUri, mimeType: 'video/mp4' } },
      { text: prompt },
    ]);

    const text = result.response.text();
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      console.error('[VideoUnderstanding] No JSON in Gemini response');
      return null;
    }

    const parsed = JSON.parse(jsonMatch[0]);

    // Parse visual setup (Stage 3 — holistic observations, no scenes)
    const vs = parsed.visualSetup || {};
    const visualSetup: VisualSetup = {
      environment: vs.environment || 'other',
      subjectCount: typeof vs.subjectCount === 'number' ? vs.subjectCount : 1,
      hasFace: vs.hasFace !== false,
      dominantShotScale: vs.dominantShotScale || 'medium',
      availableShotTypes: Array.isArray(vs.availableShotTypes) ? vs.availableShotTypes : [],
      lightingQuality: vs.lightingQuality || 'natural-good',
      productionQuality: vs.productionQuality || 'casual',
      colorTemperature: vs.colorTemperature || 'neutral',
      hasBRoll: vs.hasBRoll === true,
      cameraMovement: vs.cameraMovement || 'static',
      visualComplexity: typeof vs.visualComplexity === 'number' ? Math.max(0, Math.min(1, vs.visualComplexity)) : 0.3,
      backgroundDescription: vs.backgroundDescription || '',
      notableVisualElements: Array.isArray(vs.notableVisualElements) ? vs.notableVisualElements : [],
    };

    const storyboard: SyntheticStoryboard = {
      sourceVideoUrl: videoUrl,
      contentType: parsed.contentType || 'video',
      platform: parsed.platform || 'general',
      title: parsed.title || 'Untitled',
      overallMusicPrompt: parsed.overallMusicPrompt || '',
      globalEditDirections: {
        colorGrade: parsed.globalEditDirections?.colorGrade || 'neutral',
        pacing: parsed.globalEditDirections?.pacing || 'medium',
        graphicsDensity: parsed.globalEditDirections?.graphicsDensity || 'minimal',
        musicMood: parsed.globalEditDirections?.musicMood || '',
        narrativeArc: parsed.globalEditDirections?.narrativeArc || 'three-act',
      },
      visualSetup,
      scenes: [],
      analyzedAt: new Date().toISOString(),
      geminiFileUri: fileUri || undefined,
    };

    console.log(`[VideoUnderstanding] Done: type=${storyboard.contentType}, platform=${storyboard.platform}, setup=${visualSetup.environment}/${visualSetup.dominantShotScale}/${visualSetup.productionQuality}`);
    return storyboard;

  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error(`[VideoUnderstanding] Analysis failed: ${msg}`);
    pipelineWarnings?.errorSwallowed('analysis', err instanceof Error ? err : new Error(String(err)), 'video understanding analysis');
    return null;
  }
}

// ─── Gemini Files Upload ────────────────────────────────────────

async function uploadVideoToGemini(videoUrl: string): Promise<string | null> {
  const apiKey = process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY;
  if (!apiKey) {
    console.warn('[VideoUnderstanding] No Gemini API key');
    return null;
  }

  const EXTERNAL_URL_LIMIT = 100 * 1024 * 1024; // 100MB

  try {
    // Check file size via HEAD (no download)
    const headResp = await fetch(videoUrl, { method: 'HEAD' });
    const contentLength = Number(headResp.headers.get('content-length') || 0);
    const sizeMb = Math.round(contentLength / 1024 / 1024);

    // PATH A: ≤100MB — pass CDN URL directly to Gemini (zero download/disk/upload)
    if (contentLength > 0 && contentLength <= EXTERNAL_URL_LIMIT) {
      console.log(`[VideoUnderstanding] External URL path: ${sizeMb}MB — passing CDN URL directly`);
      return videoUrl;
    }

    // PATH B: >100MB — Files API upload (stream to disk → upload → poll)
    // CRITICAL: Stream to /tmp instead of buffering in RAM to avoid OOM on 2048MB functions
    console.log(`[VideoUnderstanding] Files API path: ${sizeMb > 0 ? sizeMb + 'MB' : 'unknown'} — streaming to disk + uploading`);

    if (contentLength > 2 * 1024 * 1024 * 1024) {
      console.warn(`[VideoUnderstanding] Too large (${sizeMb}MB), max 2GB`);
      return null;
    }

    const { GoogleAIFileManager } = await import('@google/generative-ai/server');
    const fileManager = new GoogleAIFileManager(apiKey);

    const os = await import('os');
    const path = await import('path');
    const fs = await import('fs');

    // Clean orphaned temp files (>60s old)
    try {
      const now = Date.now();
      for (const f of fs.readdirSync(os.tmpdir())) {
        if ((f.startsWith('vu_') || f.startsWith('gemini_')) && f.endsWith('.mp4')) {
          try {
            const stat = fs.statSync(path.join(os.tmpdir(), f));
            if (now - stat.mtimeMs > 60000) fs.unlinkSync(path.join(os.tmpdir(), f));
          } catch (err: unknown) { console.warn('[VideoUnderstanding] orphan tmp cleanup failed:', err instanceof Error ? err.message : err); }
        }
      }
    } catch (err: unknown) { console.warn('[VideoUnderstanding] tmp dir scan failed:', err instanceof Error ? err.message : err); }

    const tmpPath = path.join(os.tmpdir(), `vu_${Date.now()}.mp4`);

    try {
      // Stream download to disk — peak RAM usage is just the chunk buffer (~64KB)
      // Uses for-await iteration on Web ReadableStream (Node 18+ compatible,
      // avoids Readable.fromWeb which isn't available in all Node builds)
      const response = await fetch(videoUrl);
      if (!response.ok || !response.body) {
        console.error(`[VideoUnderstanding] Download failed: ${response.status}`);
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
      console.log(`[VideoUnderstanding] Streamed ${Math.round(fileSize / 1024)}KB to disk, uploading to Gemini...`);

      const uploadResult = await fileManager.uploadFile(tmpPath, {
        mimeType: 'video/mp4',
        displayName: `video-understanding-${Date.now()}.mp4`,
      });

      const fileUri = uploadResult?.file?.uri;
      if (!fileUri) return null;

      let state = uploadResult?.file?.state;
      const fileName = uploadResult?.file?.name;
      let retries = 0;
      while (state !== 'ACTIVE' && retries < 30) {
        await new Promise(r => setTimeout(r, 3000));
        try {
          const check = await fileManager.getFile(fileName!);
          state = check?.state;
        } catch (err: unknown) { console.warn('[VideoUnderstanding] getFile poll failed:', err instanceof Error ? err.message : err); }
        retries++;
      }

      if (state !== 'ACTIVE') {
        console.error(`[VideoUnderstanding] File not ACTIVE after ${retries * 3}s (state=${state})`);
        return null;
      }

      return fileUri;
    } finally {
      try { fs.unlinkSync(tmpPath); } catch (err: unknown) { console.warn('[VideoUnderstanding] tmp cleanup failed:', err instanceof Error ? err.message : err); }
    }
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error(`[VideoUnderstanding] Failed: ${msg}`);
    return null;
  }
}
