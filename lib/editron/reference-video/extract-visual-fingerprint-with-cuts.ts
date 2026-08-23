/**
 * Full visual-fingerprint extractor (Master v1.1 §7.2) — the objective/subjective split made concrete.
 *
 * ONE reference → ONE VisualExtractionTarget, using the right tool per layer (Playbook §7):
 *   - CUTS (objective)    → detect-cuts-ffmpeg.ts on the downloaded/local file (frame-accurate).
 *   - everything else     → Gemini (extract-visual-fingerprint.ts): treatment, typography, structure,
 *                           graphics, performance, and the SUBJECTIVE decision families (zoom/speed/…).
 *
 * The merge strips any transition_* observation and splices in measured cuts,
 * so cut timing is single-sourced. Both branches consume the same validated
 * canonical source; the caller must supply its authorized local byte reader.
 */

import { detectCutsFfmpeg, cutsToDecisionStream, type FfmpegCutDetection } from './detect-cuts-ffmpeg';
import {
  extractVisualFingerprint,
  VisualFingerprintExtractionErrorV1,
  type GenerateVisual,
  type UploadVisualReference,
} from './extract-visual-fingerprint';
import type { FetchedReferenceVideo } from './fetch-reference-video';
import type { VisualExtractionTarget } from './fingerprint-eval';
import type { FingerprintDecision } from '@/lib/editron/types/edit-fingerprint';
import {
  assertCanonicalReferenceAnalysisSourceV1,
  type CanonicalReferenceAnalysisInputV1,
} from '@/lib/editron/services/reference-content-extractor';

export interface ExtractVisualWithCutsOptions {
  seed?: number;
  sceneThreshold?: number;
  /** Authorized exact-byte reader over the canonical registered source. */
  fetchFile?: (
    source: Readonly<CanonicalReferenceAnalysisInputV1['source']>,
  ) => Promise<FetchedReferenceVideo>;
  detectCuts?: (filePath: string) => Promise<FfmpegCutDetection>;
  extractSubjective?: (
    input: Readonly<CanonicalReferenceAnalysisInputV1>,
  ) => Promise<VisualExtractionTarget>;
  upload?: UploadVisualReference;
  generate?: GenerateVisual;
}

/**
 * Remove Gemini's (fabricated) transitions and splice in the deterministic ffmpeg cuts, time-sorted.
 * Pure — the testable core. Every other layer of `subjective` is preserved untouched.
 */
export function mergeCutsIntoVisual(subjective: VisualExtractionTarget, cutStream: FingerprintDecision[]): VisualExtractionTarget {
  const subjectiveNonTransition = (subjective.decisionStream ?? []).filter((d) => !d.family.startsWith('transition_'));
  const decisionStream = [...subjectiveNonTransition, ...cutStream].sort((a, b) => a.anchor.tMs - b.anchor.tMs);
  return { ...subjective, decisionStream };
}

/**
 * Extract the full visual fingerprint: deterministic cuts (ffmpeg) + subjective layers (Gemini),
 * merged. Fail-loud (either extractor's error propagates); the temp download is always cleaned up,
 * and never while ffmpeg is still reading it (allSettled waits for both before cleanup).
 */
export async function extractVisualFingerprintWithCuts(
  input: Readonly<CanonicalReferenceAnalysisInputV1> | string,
  opts: Readonly<ExtractVisualWithCutsOptions> = {},
): Promise<VisualExtractionTarget> {
  if (typeof input === 'string') {
    throw new VisualFingerprintExtractionErrorV1(
      'canonical_source_required',
      'Visual fingerprint extraction requires a scoped canonical reference receipt',
    );
  }
  assertCanonicalReferenceAnalysisSourceV1(input);
  const fetchFile = opts.fetchFile;
  if (!fetchFile) {
    throw new VisualFingerprintExtractionErrorV1(
      'canonical_media_reader_required',
      'Measured cuts require an authorized reader for the registered canonical source bytes',
    );
  }
  const detectCuts = opts.detectCuts ?? ((filePath: string) => detectCutsFfmpeg(filePath, { sceneThreshold: opts.sceneThreshold }));
  const extractSubjective = opts.extractSubjective ?? ((canonicalInput) => extractVisualFingerprint(
    canonicalInput,
    { seed: opts.seed, upload: opts.upload, generate: opts.generate },
  ));

  const fetched = await fetchFile(input.source);
  try {
    const [cutRes, subjRes] = await Promise.allSettled([
      detectCuts(fetched.filePath),
      extractSubjective(input),
    ]);
    if (cutRes.status === 'rejected') throw cutRes.reason;
    if (subjRes.status === 'rejected') throw subjRes.reason;
    return mergeCutsIntoVisual(subjRes.value, cutsToDecisionStream(cutRes.value.cuts));
  } finally {
    await fetched.cleanup();
  }
}
