/**
 * Full visual-fingerprint extractor (Master v1.1 §7.2) — the objective/subjective split made concrete.
 *
 * ONE reference → ONE VisualExtractionTarget, using the right tool per layer (Playbook §7):
 *   - CUTS (objective)    → detect-cuts-ffmpeg.ts on the downloaded/local file (frame-accurate).
 *   - everything else     → Gemini (extract-visual-fingerprint.ts): treatment, typography, structure,
 *                           graphics, performance, and the SUBJECTIVE decision families (zoom/speed/…).
 *
 * The merge STRIPS any transition_* Gemini still emits (it's told not to, but the parser is permissive)
 * and splices in the deterministic cuts, so cuts are single-sourced. Gemini reads the URL directly;
 * ffmpeg needs bytes, so fetchReferenceVideoFile downloads a URL / passes a local upload through.
 *
 * NOTE: the default subjective extractor sends `reference` to Gemini as a fileUri, so it requires a
 * URL. Subjective extraction from a LOCAL upload needs a Gemini Files-API upload (deferred) — inject
 * `extractSubjective` for that case. All three steps are injected seams so this is testable offline.
 */

import { detectCutsFfmpeg, cutsToDecisionStream, type FfmpegCutDetection } from './detect-cuts-ffmpeg';
import { extractVisualFingerprint } from './extract-visual-fingerprint';
import { fetchReferenceVideoFile, type FetchedReferenceVideo } from './fetch-reference-video';
import type { VisualExtractionTarget } from './fingerprint-eval';
import type { FingerprintDecision } from '@/lib/editron/types/edit-fingerprint';

export interface ExtractVisualWithCutsOptions {
  seed?: number;
  sceneThreshold?: number;
  // Injection seams — real defaults for production; overridden in tests + the future local-upload path.
  fetchFile?: (reference: string) => Promise<FetchedReferenceVideo>;
  detectCuts?: (filePath: string) => Promise<FfmpegCutDetection>;
  extractSubjective?: (reference: string) => Promise<VisualExtractionTarget>;
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
  reference: string,
  opts: ExtractVisualWithCutsOptions = {},
): Promise<VisualExtractionTarget> {
  const fetchFile = opts.fetchFile ?? fetchReferenceVideoFile;
  const detectCuts = opts.detectCuts ?? ((filePath: string) => detectCutsFfmpeg(filePath, { sceneThreshold: opts.sceneThreshold }));
  const extractSubjective = opts.extractSubjective ?? ((ref: string) => extractVisualFingerprint(ref, { seed: opts.seed }));

  const fetched = await fetchFile(reference);
  try {
    const [cutRes, subjRes] = await Promise.allSettled([detectCuts(fetched.filePath), extractSubjective(reference)]);
    if (cutRes.status === 'rejected') throw cutRes.reason;
    if (subjRes.status === 'rejected') throw subjRes.reason;
    return mergeCutsIntoVisual(subjRes.value, cutsToDecisionStream(cutRes.value.cuts));
  } finally {
    await fetched.cleanup();
  }
}
