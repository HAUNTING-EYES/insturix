/**
 * Reference Content Extractor
 *
 * Legacy Match Edit compatibility extractor. It returns a schema-valid EditDNA
 * view plus a scene map from one provider observation, but requires separate
 * measured cut evidence and an exact canonical source receipt. It is not the
 * canonical EditFingerprint producer.
 */

import { createHash } from 'node:crypto';
import { z } from 'zod';

import type { ReferenceMaterializedMediaRegistrationReceiptV1 } from '@/lib/editron/reference-video/reference-materialized-media-registration-v1';
import { hashEditronCanonicalJsonV1 } from '@/lib/editron/services/canonical-json-v1';
import type { EditDNA } from './style-transfer-service';
import type { SceneDetectionResult } from './scene-detection-service';
import { uploadReferenceVideoToGemini } from './reference-gemini-upload-v1';

export { uploadReferenceVideoToGemini } from './reference-gemini-upload-v1';

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
  source: {
    referenceAssetId: string;
    bytesSha256: string;
    registrationReceiptSha256: string;
  };
}

export interface CanonicalReferenceAnalysisInputV1 {
  userId: string;
  orgId?: string;
  source: {
    referenceAssetId: string;
    videoUrl: string;
    sourceName: string;
    durationSec?: number;
    registration: Readonly<ReferenceMaterializedMediaRegistrationReceiptV1>;
  };
}

export interface ReferenceAnalysisDepsV1 {
  upload?: typeof uploadReferenceVideoToGemini;
  detectScenes?: (videoUrl: string) => Promise<SceneDetectionResult | null>;
  generate?: (fileUri: string, contentType: string, prompt: string) => Promise<string>;
}

export class ReferenceAnalysisErrorV1 extends Error {
  constructor(
    public readonly code:
      | 'canonical_identity_invalid'
      | 'model_response_invalid'
      | 'cut_evidence_unavailable',
    message: string,
  ) {
    super(message);
    this.name = 'ReferenceAnalysisErrorV1';
  }
}

const ModelResponseSchema = z.object({
  editDNA: z.object({
    cutRhythm: z.object({
      avgCutsPerMinute: z.number().finite().nonnegative(),
      pattern: z.enum(['steady', 'fast-slow-fast', 'building', 'random']),
      avgClipDuration: z.number().finite().positive(),
    }).strict(),
    transitions: z.object({
      dominant: z.enum(['hard_cut', 'fade', 'wipe', 'zoom_punch', 'slide']),
      frequency: z.number().finite().min(0).max(100),
    }).strict(),
    colorGrade: z.object({
      temperature: z.enum(['warm', 'cool', 'neutral']),
      saturation: z.enum(['high', 'normal', 'desaturated']),
      contrast: z.enum(['high', 'normal', 'low']),
      dominantColors: z.array(z.string().regex(/^#[0-9a-f]{6}$/i)).max(12),
    }).strict(),
    textStyle: z.object({
      fontWeight: z.enum(['light', 'normal', 'bold', 'extra-bold']),
      position: z.enum(['center', 'lower_third', 'top', 'varied']),
      animation: z.enum(['fade', 'slide', 'pop', 'typewriter', 'none']),
      frequency: z.enum(['heavy', 'moderate', 'minimal']),
    }).strict(),
    musicStyle: z.object({
      tempo: z.enum(['slow', 'medium', 'fast']),
      genre: z.string().trim().min(1).max(160),
      energyLevel: z.enum(['low', 'medium', 'high']),
    }).strict(),
    pacing: z.object({
      overall: z.enum(['slow', 'medium', 'fast']),
      hookSpeed: z.enum(['fast', 'medium']),
      mainSpeed: z.enum(['slow', 'medium', 'fast']),
    }).strict(),
    graphicsDensity: z.enum(['heavy', 'moderate', 'minimal']),
  }).strict(),
  contentMap: z.array(z.object({
    index: z.number().int().nonnegative(),
    startApproxSec: z.number().finite().nonnegative(),
    endApproxSec: z.number().finite().positive(),
    description: z.string().trim().min(1).max(1_000),
    keyVisuals: z.array(z.string().trim().min(1).max(240)).max(12),
    narrationSummary: z.string().max(2_000),
    isCritical: z.boolean(),
  }).strict()).min(1).max(5_000),
}).strict();

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
  input: CanonicalReferenceAnalysisInputV1,
  deps: ReferenceAnalysisDepsV1 = {},
): Promise<ReferenceAnalysis> {
  const { source, userId } = input;
  assertCanonicalSource(input);

  // Objective cut evidence and subjective model observation run in parallel.
  // Missing cut evidence is fatal; model-authored timing is never substituted.
  const sceneService = await import('./scene-detection-service');
  const scenesPromise = (deps.detectScenes ?? sceneService.detectScenesRemote)(source.videoUrl);

  const upload = deps.upload ?? uploadReferenceVideoToGemini;
  const fileUri = await upload(source.videoUrl, source.registration.contentType);
  const generate = deps.generate ?? generateReferenceObservation;
  const text = await generate(fileUri, source.registration.contentType, COMBINED_PROMPT);

  const jsonMatch = text.match(/\{[\s\S]*\}/);
  if (!jsonMatch) {
    throw new ReferenceAnalysisErrorV1('model_response_invalid', 'Reference model returned no JSON');
  }
  let raw: unknown;
  try {
    raw = JSON.parse(jsonMatch[0]);
  } catch {
    throw new ReferenceAnalysisErrorV1('model_response_invalid', 'Reference model returned malformed JSON');
  }
  const parsedResult = ModelResponseSchema.safeParse(raw);
  if (!parsedResult.success) {
    throw new ReferenceAnalysisErrorV1('model_response_invalid', 'Reference model response violated its schema');
  }
  const parsed = parsedResult.data;
  validateContentMap(parsed.contentMap, source.durationSec);

  const scenes = await scenesPromise;
  const cutOverride = scenes ? sceneService.cutDetectionToCutRhythm(scenes) : null;
  if (!cutOverride) {
    throw new ReferenceAnalysisErrorV1(
      'cut_evidence_unavailable',
      'Measured reference cut evidence is unavailable',
    );
  }

  const profileId = `style_${createHash('sha256')
    .update(`${userId}|${source.registration.receiptSha256}|${text}`)
    .digest('hex')
    .slice(0, 12)}`;
  const dna: EditDNA = {
    profileId,
    sourceName: source.sourceName,
    sourceAssetId: source.referenceAssetId,
    cutRhythm: {
      ...parsed.editDNA.cutRhythm,
      avgCutsPerMinute: cutOverride.avgCutsPerMinute,
      avgClipDuration: cutOverride.avgClipDuration,
    },
    transitions: parsed.editDNA.transitions,
    colorGrade: parsed.editDNA.colorGrade,
    textStyle: parsed.editDNA.textStyle,
    musicStyle: parsed.editDNA.musicStyle,
    pacing: {
      ...parsed.editDNA.pacing,
      overall: cutOverride.pacingOverall,
      mainSpeed: cutOverride.pacingOverall,
    },
    graphicsDensity: parsed.editDNA.graphicsDensity,
  };

  return {
    dna,
    contentMap: parsed.contentMap,
    source: {
      referenceAssetId: source.referenceAssetId,
      bytesSha256: source.registration.bytesSha256,
      registrationReceiptSha256: source.registration.receiptSha256,
    },
  };
}

function assertCanonicalSource(input: CanonicalReferenceAnalysisInputV1): void {
  const { source, userId } = input;
  const { receiptSha256, ...receiptMaterial } = source.registration;
  const ownerMatches = source.registration.mediaOwner.type === 'USER'
    ? source.registration.mediaOwner.userId === userId
    : Boolean(input.orgId && source.registration.mediaOwner.orgId === input.orgId);
  if (!userId.trim()
    || !source.referenceAssetId.trim()
    || source.registration.assetId !== source.referenceAssetId
    || source.registration.provenance.role !== 'SOURCE'
    || !ownerMatches
    || !/^[a-f0-9]{64}$/.test(source.registration.bytesSha256)
    || !/^[a-f0-9]{64}$/.test(receiptSha256)
    || hashEditronCanonicalJsonV1(receiptMaterial) !== receiptSha256) {
    throw new ReferenceAnalysisErrorV1(
      'canonical_identity_invalid',
      'Canonical reference identity or registration receipt is invalid',
    );
  }
}

function validateContentMap(
  contentMap: ReadonlyArray<ReferenceScene>,
  durationSec: number | undefined,
): void {
  let priorStart = -1;
  for (const scene of contentMap) {
    if (scene.endApproxSec <= scene.startApproxSec || scene.startApproxSec < priorStart) {
      throw new ReferenceAnalysisErrorV1('model_response_invalid', 'Reference content map is not ordered');
    }
    if (durationSec !== undefined && scene.endApproxSec > durationSec + 1) {
      throw new ReferenceAnalysisErrorV1('model_response_invalid', 'Reference content map exceeds source duration');
    }
    priorStart = scene.startApproxSec;
  }
}

async function generateReferenceObservation(
  fileUri: string,
  contentType: string,
  prompt: string,
): Promise<string> {
  const { getAnalysisModel } = await import('@/lib/editron/utils/gemini-model-factory');
  const model = await getAnalysisModel();
  const result = await model.generateContent([
    { fileData: { fileUri, mimeType: contentType } },
    { text: prompt },
  ]);
  return result.response.text();
}
