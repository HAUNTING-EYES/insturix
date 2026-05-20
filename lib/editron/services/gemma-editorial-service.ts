/**
 * Gemma Editorial Service — Deterministic KEEP/CUT Classification
 *
 * Calls the fine-tuned Gemma 4 model on Modal for transcript segment
 * classification. Replaces the non-deterministic Gemini Flash editorial
 * intent classifier with a deterministic, self-hosted model.
 *
 * Determinism: Same transcript segments -> same KEEP/CUT decisions, every run.
 * Achieved via: temperature 0, FP32, fixed seed, self-hosted weights.
 *
 * Fallback: If Modal endpoint is unavailable, returns null and the pipeline
 * falls through to the existing Gemini-based editorial intent detector.
 *
 * Endpoint: POST {GEMMA_EDITORIAL_URL}/classify
 * Auth: Modal token (MODAL_TOKEN_ID + MODAL_TOKEN_SECRET)
 */

import type { TranscriptSegment, SilenceRemovalAction } from './raw-footage-processor';

export interface GemmaEditorialResult {
  keepIndices: number[];
  cutIndices: number[];
  removals: SilenceRemovalAction[];
  processingTimeMs: number;
}

const ENDPOINT_URL = process.env.GEMMA_EDITORIAL_URL
  || 'https://insturix--gemma-editorial-editorialclassifier-classify.modal.run';

const TIMEOUT_MS = 60_000;

/**
 * Classify transcript segments using the fine-tuned Gemma model.
 * Returns null if the service is unavailable (pipeline uses Gemini fallback).
 */
export async function classifyWithGemma(
  segments: TranscriptSegment[],
): Promise<GemmaEditorialResult | null> {
  if (segments.length < 5) return null;

  const tokenId = process.env.MODAL_TOKEN_ID;
  const tokenSecret = process.env.MODAL_TOKEN_SECRET;
  if (!tokenId || !tokenSecret) {
    console.warn('[GemmaEditorial] MODAL_TOKEN_ID/SECRET not set — skipping');
    return null;
  }

  const start = Date.now();

  try {
    const payload = {
      segments: segments.map(s => ({
        index: s.index,
        text: s.text,
      })),
    };

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), TIMEOUT_MS);

    const response = await fetch(ENDPOINT_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Token ${tokenId}:${tokenSecret}`,
      },
      body: JSON.stringify(payload),
      signal: controller.signal,
    });

    clearTimeout(timeout);

    if (!response.ok) {
      console.warn(`[GemmaEditorial] Modal returned ${response.status}: ${response.statusText}`);
      return null;
    }

    const data = await response.json();

    if (!data.decisions || !Array.isArray(data.decisions)) {
      console.warn('[GemmaEditorial] Invalid response format');
      return null;
    }

    const keepIndices: number[] = [];
    const cutIndices: number[] = [];
    const removals: SilenceRemovalAction[] = [];

    for (const decision of data.decisions) {
      if (decision.decision === 'KEEP') {
        keepIndices.push(decision.index);
      } else {
        cutIndices.push(decision.index);
        const seg = segments.find(s => s.index === decision.index);
        if (seg) {
          removals.push({
            startMs: seg.startMs,
            endMs: seg.endMs,
            action: 'remove',
            reason: 'meta-discard' as any,
          });
        }
      }
    }

    const elapsed = Date.now() - start;
    console.log(`[GemmaEditorial] ${segments.length} segments -> ${keepIndices.length} KEEP, ${cutIndices.length} CUT (${elapsed}ms, deterministic)`);

    return { keepIndices, cutIndices, removals, processingTimeMs: elapsed };
  } catch (err: any) {
    const elapsed = Date.now() - start;
    if (err.name === 'AbortError') {
      console.warn(`[GemmaEditorial] Timeout after ${elapsed}ms — falling back to Gemini`);
    } else {
      console.warn(`[GemmaEditorial] Failed: ${err.message} — falling back to Gemini`);
    }
    return null;
  }
}
