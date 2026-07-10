/**
 * coverage - answer "do we have footage of THIS moment?" with CONVICTION. When a user asks for
 * a specific shot ("the moment she opens the box"), the system must say yes/no honestly - never
 * claim a shot it doesn't have, never miss one it does. This is the core of the multi-asset
 * feasibility program and the "request-coverage" planner action.
 *
 * The rule that earns conviction: we say "we HAVE it" only when we can point at a specific scene
 * AND a vision check confirms that scene's frame actually depicts the request. A high retrieval
 * score alone can be wrong (looks close, isn't) - so the verify step gates the claim. Below the
 * bar, or unconfirmed, we say "we DON'T have it" (honest gap -> request-coverage), and borderline
 * matches are reported as PARTIAL ("close, not exact"), never a fake binary.
 *
 * Two injected impurities keep it testable + provider-neutral: the query embedding (precomputed
 * at the edge, cosine-matched against scenes' multimodal embeddings) and `verify` (a VLM looks at
 * the candidate frame). Pure otherwise; never throws.
 */

import { cosineSimilarity } from './scene-embedding';
import type { Scene } from './scene';

/** A moment the user asks for, with its precomputed embedding (embed the text at the edge). */
export interface CoverageQuery {
  text: string;
  embedding?: readonly number[] | null;
}

export type CoverageVerdict = 'have' | 'partial' | 'missing';

/** Vision confirmation: does this scene's frame actually depict the request? Injected (a VLM). */
export type CoverageVerify = (query: CoverageQuery, scene: Scene) => Promise<{ confirmed: boolean; note?: string }>;

export interface CoverageCandidate {
  scene: Scene;
  similarity: number; // 0..1 retrieval score
  confirmed: boolean; // vision-verified the frame depicts the request (false until verified)
  note?: string;
}

export interface CoverageResult {
  verdict: CoverageVerdict;
  /** The evidence backing a have/partial verdict: best scene + score + confirmation. */
  best?: CoverageCandidate;
  /** Ranked candidates considered (top-k), for transparency. */
  candidates: CoverageCandidate[];
  /** Grounded, human-readable statement of the verdict (cites the evidence). */
  statement: string;
}

// --- thresholds. INVENTED-PLACEHOLDER (calibrate on real requests). ---
// Conviction is vision CONFIRMATION, not an embedding score: a confirmed frame = HAVE regardless
// of similarity (the embedding only RETRIEVES candidates to verify; the VLM is the authority).
// PARTIAL_SIMILARITY is the floor separating "close but unconfirmed" from "missing".
export const PARTIAL_SIMILARITY = 0.4;
export const DEFAULT_TOP_K = 3; // how many top candidates to vision-verify

function timecode(sec: number): string {
  const s = Math.max(0, Math.round(sec));
  const m = Math.floor(s / 60);
  return `${m}:${String(s % 60).padStart(2, '0')}`;
}

/** Short grounded description of what a scene shows, for the statement. */
function sceneEvidence(scene: Scene): string {
  const what = scene.visualMode || scene.description || (scene.transcription ? `"${scene.transcription.slice(0, 60)}"` : 'a shot');
  return `${what} at ${timecode(scene.startTime)}`;
}

function rank(query: CoverageQuery, scenes: readonly Scene[]): CoverageCandidate[] {
  const q = query.embedding;
  const hasQ = Array.isArray(q) && q.length > 0;
  return scenes
    .map((scene) => ({
      scene,
      similarity: hasQ && scene.embedding && scene.embedding.length > 0 ? cosineSimilarity(scene.embedding, q as number[]) : 0,
      confirmed: false as boolean,
    }))
    .sort((a, b) => b.similarity - a.similarity);
}

/**
 * Assess whether the footage covers the requested moment, with conviction. Ranks scenes by
 * multimodal similarity, VISION-VERIFIES the top candidates, and returns a grounded verdict:
 *   have    - a candidate is confirmed AND scores >= HAVE_SIMILARITY (point at the frame).
 *   partial - a candidate scores >= PARTIAL_SIMILARITY but isn't confirmed at the have bar
 *             (close, not exact - offer it, don't claim it).
 *   missing - nothing clears the bar (honest gap -> the user should film it).
 * Async only through the injected `verify`. Never throws.
 */
export async function assessCoverage(
  query: CoverageQuery,
  scenes: readonly Scene[],
  verify: CoverageVerify,
  opts?: { topK?: number; partialSimilarity?: number },
): Promise<CoverageResult> {
  const partialBar = opts?.partialSimilarity ?? PARTIAL_SIMILARITY;
  const topK = opts?.topK ?? DEFAULT_TOP_K;

  const ranked = rank(query, scenes);
  if (ranked.length === 0) {
    return { verdict: 'missing', candidates: [], statement: `We don't have any footage for "${query.text}" — you'd need to film it.` };
  }

  // Vision-verify the top-k (bounded), so a "have" claim always rests on a confirmed frame.
  const head = ranked.slice(0, topK);
  for (const cand of head) {
    try {
      const v = await verify(query, cand.scene);
      cand.confirmed = v.confirmed;
      cand.note = v.note;
    } catch {
      cand.confirmed = false; // an unverifiable candidate can never back a "have"
    }
  }

  // Conviction = vision confirmation. ANY confirmed frame means HAVE (best = highest-sim confirmed);
  // the embedding score only ordered which candidates got verified, it never grants a HAVE by itself.
  const confirmed = head.filter((c) => c.confirmed).sort((a, b) => b.similarity - a.similarity);
  const topByScore = head[0];

  if (confirmed.length > 0) {
    const best = confirmed[0];
    return {
      verdict: 'have',
      best,
      candidates: ranked,
      statement: `Yes — we have "${query.text}": ${sceneEvidence(best.scene)}.`,
    };
  }
  if (topByScore.similarity >= partialBar) {
    return {
      verdict: 'partial',
      best: topByScore,
      candidates: ranked,
      statement: `We have something close to "${query.text}" but not an exact match: ${sceneEvidence(topByScore.scene)}. Use it, or film the exact shot.`,
    };
  }
  return {
    verdict: 'missing',
    candidates: ranked,
    statement: `We don't have a shot of "${query.text}" — you'd need to film it.`,
  };
}
