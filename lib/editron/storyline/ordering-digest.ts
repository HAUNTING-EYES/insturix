/**
 * ordering-digest - turn picked Scenes into the compact per-clip TEXT the narrative-ordering
 * LLM reads. The model never sees raw video (Rule 30: language in, language out); it sees a
 * digest - the transcript (the primary narrative content) plus the signals already on the
 * Scene (importance, visual mode, vocal arousal/valence, action, on-screen text).
 *
 * Refs: the LLM echoes clip refs back in its ordering, so we give each clip a SHORT stable
 * label ("c0", "c1", ...) instead of the 64-char sha256 Scene id - short labels are far more
 * reliable for a model to copy without corruption. `resolveRef` maps a label back to the real
 * Scene id when we build the OrderingPlan from the LLM's response.
 *
 * Pure, deterministic. Transcript is trimmed to bound tokens. Only fields the Scene actually
 * carries are emitted (no fabrication); absent signals are simply omitted from the line.
 */

import type { ClaimStrength, NarrativePhase, Scene } from './scene';

/** Max transcript characters per clip in the digest (token budget). INVENTED-PLACEHOLDER. */
export const MAX_TRANSCRIPT_CHARS = 320;

export interface ClipDigest {
  /** Short label the LLM uses/echoes ("c0", "c1", ...). */
  ref: string;
  /** The real Scene id this label resolves to (for building the OrderingPlan). */
  sceneId: string;
  source: string;
  durationSec: number;
  transcript: string;
  importance?: number;
  visualMode?: string;
  actionType?: string;
  vocalArousal?: number;
  vocalValence?: string;
  onScreenText?: string[];
  visualDescription?: string;
  subjects?: string[];
  // --- narrative structure (from the signal-enricher; drives the SEQUENCING_MOVES) ---
  phase?: NarrativePhase;
  pressure?: number;
  cta?: boolean;
  topicBoundary?: boolean;
  rhetoricalQuestion?: boolean;
  claimStrength?: ClaimStrength;
  statistic?: boolean;
  entities?: string[];
}

function trimTranscript(text: string): string {
  const t = text.trim().replace(/\s+/g, ' ');
  if (t.length <= MAX_TRANSCRIPT_CHARS) return t;
  return `${t.slice(0, MAX_TRANSCRIPT_CHARS - 1).trimEnd()}…`;
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

/** Build one clip digest from a Scene + its short label. Pure. */
export function buildClipDigest(scene: Scene, ref: string): ClipDigest {
  const d: ClipDigest = {
    ref,
    sceneId: scene.id,
    source: scene.source,
    durationSec: round2(scene.durationSec),
    transcript: trimTranscript(scene.transcription),
  };
  if (typeof scene.importance === 'number') d.importance = round2(scene.importance);
  if (scene.visualMode) d.visualMode = scene.visualMode;
  if (scene.actionType) d.actionType = scene.actionType;
  if (typeof scene.vocalArousal === 'number') d.vocalArousal = round2(scene.vocalArousal);
  if (scene.vocalValence) d.vocalValence = scene.vocalValence;
  if (scene.detectedText.length > 0) d.onScreenText = scene.detectedText.slice();
  if (scene.description?.trim()) d.visualDescription = scene.description.trim().slice(0, 600);
  if (scene.objects.length > 0) d.subjects = scene.objects.slice(0, 12);

  const n = scene.narrative;
  if (n) {
    if (n.phase) d.phase = n.phase;
    if (typeof n.pressure === 'number') d.pressure = round2(n.pressure);
    if (n.cta) d.cta = true;
    if (n.topicBoundary) d.topicBoundary = true;
    if (n.rhetoricalQuestion) d.rhetoricalQuestion = true;
    if (n.claimStrength) d.claimStrength = n.claimStrength;
    if (n.statistic) d.statistic = true;
    if (n.entities && n.entities.length > 0) d.entities = n.entities.slice();
  }
  return d;
}

/**
 * Build the digest for a whole picked set. Labels are assigned in input order (c0, c1, ...),
 * so the mapping is stable and deterministic. Pure.
 */
export function buildOrderingDigest(scenes: readonly Scene[]): ClipDigest[] {
  return scenes.map((scene, i) => buildClipDigest(scene, `c${i}`));
}

/** Map a label ("c3") back to its real Scene id. Returns undefined for an unknown label. */
export function resolveRef(digests: readonly ClipDigest[], ref: string): string | undefined {
  return digests.find((d) => d.ref === ref)?.sceneId;
}

/** ref -> sceneId map for translating an LLM ordering (labels) into an OrderingPlan (ids). */
export function refToSceneIdMap(digests: readonly ClipDigest[]): Map<string, string> {
  const m = new Map<string, string>();
  for (const d of digests) m.set(d.ref, d.sceneId);
  return m;
}

/**
 * Compact one-line summary of a clip's narrative signals (phase, tension, cta, ...), or null when
 * the clip carries none. Shared by the eval formatter and the runtime ordering prompt so the model
 * sees the SAME narrative evidence the SEQUENCING_MOVES reference. Only present signals are shown.
 */
export function narrativeLine(d: ClipDigest): string | null {
  const parts: string[] = [];
  if (d.phase) parts.push(`phase:${d.phase}`);
  if (d.pressure !== undefined) parts.push(`tension ${d.pressure}`);
  if (d.cta) parts.push('cta');
  if (d.topicBoundary) parts.push('topic-start');
  if (d.rhetoricalQuestion) parts.push('question');
  if (d.claimStrength) parts.push(`${d.claimStrength}-claim`);
  if (d.statistic) parts.push('stat');
  const line = parts.length > 0 ? `narrative: ${parts.join(' | ')}` : null;
  if (d.entities && d.entities.length > 0) {
    const ents = `entities: ${d.entities.join(', ')}`;
    return line ? `${line}\n${ents}` : ents;
  }
  return line;
}

/**
 * Render the digest as the compact text block the prompt puts LAST (data-last, Rule 35).
 * One clip per stanza; a signal line (only the signals that exist) then the transcript.
 * Language-neutral: the transcript is emitted verbatim in its source language (incl. Hinglish).
 */
export function formatDigestForPrompt(digests: readonly ClipDigest[]): string {
  return digests
    .map((d) => {
      const sig: string[] = [`${d.durationSec}s`];
      if (d.importance !== undefined) sig.push(`importance ${d.importance}`);
      if (d.visualMode) sig.push(d.visualMode);
      if (d.actionType) sig.push(`action:${d.actionType}`);
      if (d.vocalArousal !== undefined || d.vocalValence) {
        sig.push(`vocal:${d.vocalArousal ?? '?'}/${d.vocalValence ?? '?'}`);
      }
      const lines = [`[${d.ref}] ${sig.join(' | ')}`];
      const narrative = narrativeLine(d);
      if (narrative) lines.push(narrative);
      if (d.visualDescription) lines.push(`visual: ${d.visualDescription}`);
      if (d.subjects && d.subjects.length > 0) lines.push(`subjects: ${d.subjects.join(', ')}`);
      if (d.onScreenText && d.onScreenText.length > 0) lines.push(`on-screen: ${d.onScreenText.join(', ')}`);
      lines.push(`transcript: ${d.transcript || '(no speech)'}`);
      return lines.join('\n');
    })
    .join('\n\n');
}
