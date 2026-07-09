/**
 * scene-embedding - semantic (meaning-based) scene selection, replacing the brittle keyword
 * overlap in the default scorer. A clip's meaning is what's SAID *and* what's SHOWN, so the
 * embedding is MULTIMODAL: it fuses the transcript with the visual facts (visual mode,
 * on-screen text, action, caption). A silent b-roll clip therefore still matches "show the
 * product" on what it depicts, not just words it never spoke.
 *
 * Precompute pattern (the async/sync answer): embeddings are async network calls, but the
 * composer's SceneScorer is synchronous. So `embedScenes` computes every scene's vector ONCE
 * at the impure edge (inject the embedder), stashes it on `scene.embedding`, and the returned
 * `makeEmbeddingScorer` is a fast, PURE, sync scorer that just reads the vector and does
 * cosine math - the deterministic core stays sync. Same importance-spine + intent-blend as the
 * default scorer (shared weights, no drift); only the intent term changes from keyword overlap
 * to semantic similarity.
 *
 * NOTE: today the "multimodal" vector is a text embedding of a descriptor that FUSES the visual
 * signals. A true visual embedding (CLIP / V-JEPA vector over the frames) is the upgrade once
 * such vectors are stored - `embedScenes` is the seam for it (swap what gets embedded).
 */

import { IMPORTANCE_WEIGHT, INTENT_WEIGHT, type SceneScorer } from './compose';
import type { Scene } from './scene';

/** Complete a text into an embedding vector. Injected (app's Gemini embeddings in prod). */
export type SceneEmbed = (text: string) => Promise<number[]>;

function clamp01(n: number): number {
  return n < 0 ? 0 : n > 1 ? 1 : n;
}

/**
 * The MULTIMODAL descriptor embedded for a scene: what's said (transcript) fused with what's
 * shown (visual mode, action, on-screen text). This is what makes selection see visuals, not
 * just words. Empty parts are dropped; a fully-silent, feature-less clip yields ''.
 */
export function sceneEmbeddingText(scene: Scene): string {
  return [scene.transcription, scene.visualMode ?? '', scene.actionType ?? '', scene.description ?? '', ...scene.detectedText]
    .map((s) => (typeof s === 'string' ? s.trim() : ''))
    .filter((s) => s.length > 0)
    .join(' — '); // em-dash separator keeps distinct facts distinct for the embedder
}

/** Cosine similarity of two vectors, mapped to [0,1] (negative similarity = unrelated = 0).
 *  Mismatched/empty/zero vectors score 0. Pure. */
export function cosineSimilarity(a: readonly number[], b: readonly number[]): number {
  if (a.length === 0 || a.length !== b.length) return 0;
  let dot = 0;
  let na = 0;
  let nb = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    na += a[i] * a[i];
    nb += b[i] * b[i];
  }
  if (na === 0 || nb === 0) return 0;
  const c = dot / (Math.sqrt(na) * Math.sqrt(nb));
  return clamp01(c);
}

/**
 * Precompute each scene's multimodal embedding at the impure edge. Injected `embed`. A scene
 * whose embedding fails (or has no text to embed) is returned WITHOUT an embedding, so the
 * scorer falls back to importance for it. Returns new scenes; never throws.
 */
export async function embedScenes(scenes: readonly Scene[], embed: SceneEmbed): Promise<Scene[]> {
  const out: Scene[] = [];
  for (const scene of scenes) {
    const text = sceneEmbeddingText(scene);
    if (text.length === 0) {
      out.push(scene);
      continue;
    }
    try {
      const embedding = await embed(text);
      out.push(Array.isArray(embedding) && embedding.length > 0 ? { ...scene, embedding } : scene);
    } catch {
      out.push(scene);
    }
  }
  return out;
}

/**
 * A synchronous, pure SceneScorer that ranks on the fused importance spine blended with the
 * SEMANTIC similarity of the scene's precomputed embedding to the intent embedding - the same
 * shape as the default scorer, with cosine similarity replacing keyword overlap. When a scene
 * has no embedding (un-embedded) or there is no intent vector, it degrades to importance alone;
 * with neither, a neutral 0.5. Build the `intentEmbedding` once at the edge (embed the intent).
 */
export function makeEmbeddingScorer(intentEmbedding: readonly number[] | null): SceneScorer {
  const hasIntent = Array.isArray(intentEmbedding) && intentEmbedding.length > 0;
  return (scene: Scene): number => {
    const rel = hasIntent && scene.embedding && scene.embedding.length > 0
      ? cosineSimilarity(scene.embedding, intentEmbedding as number[])
      : null;
    const imp = scene.importance;
    if (typeof imp === 'number' && Number.isFinite(imp)) {
      const i = clamp01(imp);
      return rel === null ? i : clamp01(IMPORTANCE_WEIGHT * i + INTENT_WEIGHT * rel);
    }
    return rel === null ? 0.5 : rel;
  };
}
