/**
 * Reference Content Extractor
 *
 * Extends the existing EditDNA extraction to ALSO return a contentMap
 * (scene-by-scene breakdown of the reference video's content).
 *
 * Single Gemini call → EditDNA + contentMap. No additional cost vs.
 * the existing style-transfer flow.
 *
 * Per EDITRON_MATCH_EDIT_PLAN.md Phase 1.
 */

import type { EditDNA } from './style-transfer-service';
import { waitForGeminiFileActive } from './gemini-file-active';

// ─── Types (per Plan Phase 1) ───────────────────────────────────

export interface ReferenceScene {
  index: number;
  startApproxSec: number;
  endApproxSec: number;
  description: string;
  keyVisuals: string[];
  narrationSummary: string;
  isCritical: boolean;
}

export interface ReferenceAnalysis {
  dna: EditDNA;
  contentMap: ReferenceScene[];
}

// ─── Combined Prompt ────────────────────────────────────────────

const COMBINED_PROMPT = `<role>You are a professional video editor analyzing a reference video.</role>

<task>Extract TWO things in a SINGLE JSON response: the video's Editing Style (EditDNA) and a scene-by-scene Content Map.</task>

<rules>
RULE 1 — EditDNA (editing fingerprint) must include:
  - cutRhythm: { avgCutsPerMinute, pattern (steady|fast-slow-fast|building|random), avgClipDuration }
  - transitions: { dominant (hard_cut|fade|wipe|zoom_punch|slide), frequency (0-100%) }
  - colorGrade: { temperature (warm|cool|neutral), saturation (high|normal|desaturated), contrast (high|normal|low), dominantColors (hex[]) }
  - textStyle: { fontWeight (light|normal|bold|extra-bold), position (center|lower_third|top|varied), animation (fade|slide|pop|typewriter|none), frequency (heavy|moderate|minimal) }
  - musicStyle: { tempo (slow|medium|fast), genre (string), energyLevel (low|medium|high) }
  - pacing: { overall (slow|medium|fast), hookSpeed (fast|medium), mainSpeed (slow|medium|fast) }
  - graphicsDensity: heavy|moderate|minimal
RULE 2 — Content Map: for each distinct scene/segment provide:
  - index (0-based)
  - startApproxSec / endApproxSec
  - description (one sentence: who/what, what's happening)
  - keyVisuals (2-3 brief visual descriptors)
  - narrationSummary (quote or paraphrase of speech, empty if silent)
  - isCritical (true if this scene carries a core message that can't be skipped)
RULE 3 — Return ONLY valid JSON. No markdown. No explanation.
</rules>

<output_format>
{
  "editDNA": { cutRhythm, transitions, colorGrade, textStyle, musicStyle, pacing, graphicsDensity },
  "contentMap": [ { index, startApproxSec, endApproxSec, description, keyVisuals, narrationSummary, isCritical } ]
}
</output_format>`;

// ─── Main Entry ─────────────────────────────────────────────────

/**
 * Extract EditDNA + contentMap from a reference video in 1 Gemini call.
 * Uses Gemini Files API for video upload (same as video-understanding-service).
 */
export async function extractReferenceAnalysis(
  videoUrl: string,
  userId: string,
  sourceName?: string,
): Promise<ReferenceAnalysis> {
  // Kick off deterministic cut detection (Modal ffmpeg worker) in PARALLEL with the Gemini upload+call
  // below — the worker downloads the URL itself, so it OVERLAPS rather than adds latency (matters for
  // the 120s Vercel budget). Never throws; null ⇒ keep Gemini's (fabricated) cut estimate + log loudly.
  const sceneService = await import('./scene-detection-service');
  const scenesPromise = sceneService.detectScenesRemote(videoUrl).catch(() => null);

  // Upload to Gemini Files API
  const fileUri = await uploadReferenceVideoToGemini(videoUrl);

  const { getAnalysisModel } = await import('@/lib/editron/utils/gemini-model-factory');
  const model = await getAnalysisModel();

  console.log(`[RefExtractor] Analyzing reference: ${sourceName || videoUrl.substring(0, 60)}...`);

  const result = await model.generateContent([
    { fileData: { fileUri, mimeType: 'video/mp4' } },
    { text: COMBINED_PROMPT },
  ]);

  const text = result.response.text();
  const jsonMatch = text.match(/\{[\s\S]*\}/);
  if (!jsonMatch) {
    throw new Error('Gemini returned no JSON for reference analysis');
  }

  const parsed = JSON.parse(jsonMatch[0]);

  // Normalize EditDNA
  const { nanoid } = await import('nanoid');
  const profileId = `style_${nanoid(12)}`;
  const dna: EditDNA = {
    profileId,
    sourceName: sourceName || 'Reference Video',
    sourceUrl: videoUrl,
    cutRhythm: {
      avgCutsPerMinute: Number(parsed.editDNA?.cutRhythm?.avgCutsPerMinute) || 10,
      pattern: parsed.editDNA?.cutRhythm?.pattern || 'steady',
      avgClipDuration: Number(parsed.editDNA?.cutRhythm?.avgClipDuration) || 3,
    },
    transitions: {
      dominant: parsed.editDNA?.transitions?.dominant || 'hard_cut',
      frequency: Number(parsed.editDNA?.transitions?.frequency) || 30,
    },
    colorGrade: {
      temperature: parsed.editDNA?.colorGrade?.temperature || 'neutral',
      saturation: parsed.editDNA?.colorGrade?.saturation || 'normal',
      contrast: parsed.editDNA?.colorGrade?.contrast || 'normal',
      dominantColors: parsed.editDNA?.colorGrade?.dominantColors || [],
    },
    textStyle: {
      fontWeight: parsed.editDNA?.textStyle?.fontWeight || 'normal',
      position: parsed.editDNA?.textStyle?.position || 'lower_third',
      animation: parsed.editDNA?.textStyle?.animation || 'fade',
      frequency: parsed.editDNA?.textStyle?.frequency || 'moderate',
    },
    musicStyle: {
      tempo: parsed.editDNA?.musicStyle?.tempo || 'medium',
      genre: parsed.editDNA?.musicStyle?.genre || 'cinematic',
      energyLevel: parsed.editDNA?.musicStyle?.energyLevel || 'medium',
    },
    pacing: {
      overall: parsed.editDNA?.pacing?.overall || 'medium',
      hookSpeed: parsed.editDNA?.pacing?.hookSpeed || 'fast',
      mainSpeed: parsed.editDNA?.pacing?.mainSpeed || 'medium',
    },
    graphicsDensity: parsed.editDNA?.graphicsDensity || 'moderate',
  };

  // Override the LLM's fabricated cut rhythm with deterministic ffmpeg cuts (objective/subjective split).
  // Gemini scores F1 0.66 on cut timing; the worker is ground truth. Degrade + log if it's unavailable.
  const scenes = await scenesPromise;
  const cutOverride = scenes ? sceneService.cutDetectionToCutRhythm(scenes) : null;
  if (cutOverride) {
    const geminiCpm = dna.cutRhythm.avgCutsPerMinute;
    dna.cutRhythm.avgCutsPerMinute = cutOverride.avgCutsPerMinute;
    dna.cutRhythm.avgClipDuration = cutOverride.avgClipDuration;
    dna.pacing.overall = cutOverride.pacingOverall;
    dna.pacing.mainSpeed = cutOverride.pacingOverall;
    console.log(`[RefExtractor] Deterministic cuts: ${scenes!.cuts.length} → ${cutOverride.avgCutsPerMinute.toFixed(1)}/min (Gemini said ${geminiCpm.toFixed(1)}), pacing=${cutOverride.pacingOverall}`);
  } else {
    console.warn('[RefExtractor] ⚠️ Deterministic scene-detect unavailable — keeping Gemini cut estimate (may be fabricated)');
  }

  // Normalize contentMap
  const contentMap: ReferenceScene[] = (parsed.contentMap || []).map((s: any, i: number) => ({
    index: s.index ?? i,
    startApproxSec: Number(s.startApproxSec) || 0,
    endApproxSec: Number(s.endApproxSec) || 0,
    description: s.description || '',
    keyVisuals: Array.isArray(s.keyVisuals) ? s.keyVisuals : [],
    narrationSummary: s.narrationSummary || '',
    isCritical: s.isCritical === true,
  }));

  console.log(`[RefExtractor] Done: ${contentMap.length} scenes, pacing=${dna.pacing.overall}, transitions=${dna.transitions.dominant}`);

  return { dna, contentMap };
}

const MAX_GEMINI_REFERENCE_BYTES = 2 * 1024 * 1024 * 1024;
const GEMINI_FILES_UPLOAD_URL = 'https://generativelanguage.googleapis.com/upload/v1beta/files';

export async function uploadReferenceVideoToGemini(videoUrl: string): Promise<string> {
  const apiKey = process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY;
  if (!apiKey) throw new Error('Gemini API key is not configured');

  const response = await fetch(videoUrl);
  if (!response.ok || !response.body) {
    throw new Error(`Reference video download failed with HTTP ${response.status}`);
  }

  const declaredSize = Number(response.headers.get('content-length') ?? 0);
  if (!Number.isSafeInteger(declaredSize) || declaredSize <= 0) {
    throw new Error(
      'Reference video source did not provide a valid Content-Length; import it into the Media Library before style transfer',
    );
  }
  if (Number.isFinite(declaredSize) && declaredSize > MAX_GEMINI_REFERENCE_BYTES) {
    throw new Error('Reference video exceeds the Gemini Files API 2GB limit');
  }

  const { GoogleAIFileManager } = await import('@google/generative-ai/server');
  let downloadedBytes = 0;
  const sizeGuard = new TransformStream<Uint8Array, Uint8Array>({
    transform(chunk, controller) {
      downloadedBytes += chunk.byteLength;
      if (downloadedBytes > MAX_GEMINI_REFERENCE_BYTES) {
        throw new Error('Reference video exceeds the Gemini Files API 2GB limit');
      }
      controller.enqueue(chunk);
    },
  });

  const startResponse = await fetch(`${GEMINI_FILES_UPLOAD_URL}?key=${encodeURIComponent(apiKey)}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Goog-Upload-Protocol': 'resumable',
      'X-Goog-Upload-Command': 'start',
      'X-Goog-Upload-Header-Content-Length': String(declaredSize),
      'X-Goog-Upload-Header-Content-Type': 'video/mp4',
    },
    body: JSON.stringify({
      file: { display_name: `editron-reference-${Date.now()}.mp4` },
    }),
  });
  if (!startResponse.ok) {
    throw new Error(`Gemini resumable upload initialization failed with HTTP ${startResponse.status}`);
  }
  const uploadUrl = startResponse.headers.get('x-goog-upload-url');
  if (!uploadUrl) throw new Error('Gemini resumable upload returned no upload URL');

  const uploadResponse = await fetch(uploadUrl, {
    method: 'POST',
    headers: {
      'Content-Length': String(declaredSize),
      'Content-Type': 'video/mp4',
      'X-Goog-Upload-Offset': '0',
      'X-Goog-Upload-Command': 'upload, finalize',
    },
    body: response.body.pipeThrough(sizeGuard),
    duplex: 'half',
  } as RequestInit & { duplex: 'half' });
  if (!uploadResponse.ok) {
    throw new Error(`Gemini reference upload failed with HTTP ${uploadResponse.status}`);
  }
  if (downloadedBytes !== declaredSize) {
    throw new Error(
      `Reference video byte count did not match Content-Length (${downloadedBytes}/${declaredSize})`,
    );
  }

  const uploadResult = await uploadResponse.json() as {
    file?: { uri?: string; name?: string; state?: string };
  };
  const fileUri = uploadResult.file?.uri;
  if (!fileUri) throw new Error('Gemini Files API returned no file URI');

  const fileManager = new GoogleAIFileManager(apiKey);
  const activation = await waitForGeminiFileActive({
    fileManager,
    fileName: uploadResult.file?.name,
    initialState: uploadResult.file?.state,
    label: 'RefExtractor',
    fileSizeBytes: downloadedBytes,
  });
  if (!activation.active) {
    throw new Error(
      `Gemini reference file did not become ACTIVE (state=${activation.state ?? 'unknown'}, reason=${activation.reason ?? 'unknown'})`,
    );
  }
  return fileUri;
}
