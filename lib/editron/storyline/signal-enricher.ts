/**
 * signal-enricher - the narrative-signal seam (B1). Editron's SignalTimeline holds the
 * story-structure primitives (cta, topic boundaries, rhetorical questions, claim strength,
 * numbers/entities as event signals; narrative_pressure on the grid), but they live in the
 * EXECUTOR's per-asset timeline - the composer path only has Scene[]. This module carries
 * those signals ONTO the scenes so the ordering pass can reason with them.
 *
 * Why it matters: the SEQUENCING_MOVES (creative-doc-rules.ts) already reference these exact
 * signals in their `signalsFor` (entity_narrative_phase, composite_narrative_pressure,
 * entity_rhetorical_question, entity_cta, ...). Until now the digest never surfaced them, so
 * the moves asked for data that wasn't there. This closes that loop.
 *
 * `signal:entity.narrative_phase` is tagged NEEDS_CODE in the graph - it is DEFINED (position +
 * energy curve + topic_boundary + cta -> opening/build/climax/resolve/closing) but never
 * computed. This module computes it, per the graph's own recipe, as a PRIOR the ordering LLM
 * refines semantically (creative-doc-rules.ts:172).
 *
 * Design (matches the rest of the lane): pure, never throws, injected dependency. The heavy
 * SignalTimeline build stays in the executor's domain; `narrativeSourceFromTimeline` is the
 * thin bridge that turns a timeline the wirer already has into the narrow per-source input this
 * enricher needs. No LLM here (Rule 30: this is LOGIC that FEEDS the LLM). Absent signals stay
 * absent - a missing tag means "no signal", never a fabricated default (R2N).
 */

import type { ClaimStrength, NarrativePhase, Scene, SceneNarrative } from './scene';

const MS_PER_SEC = 1000;

/** Fraction of a source's peak energy at/above which a mid-arc scene is the climax.
 *  INVENTED-PLACEHOLDER (calibrate against real edits). */
export const DEFAULT_CLIMAX_ENERGY_FRACTION = 0.85;
/** First 15% of a source = opening; last 15% = closing. ← graph node entity.narrative_phase. */
const OPENING_POSITION = 0.15;
const CLOSING_POSITION = 0.85;

/** A narrative event lifted from a source's SignalTimeline, timestamped in that source's ms clock. */
export type NarrativeEventKind =
  | 'cta'
  | 'topic_boundary'
  | 'rhetorical_question'
  | 'claim_hedged'
  | 'claim_assertive'
  | 'number'
  | 'name'
  | 'emphasis';

export interface NarrativeSignalEvent {
  /** Absolute time in the SOURCE, milliseconds. */
  timestampMs: number;
  kind: NarrativeEventKind;
  /** The word/phrase behind the event (the entity for `name`, the stat for `number`). */
  context?: string;
}

/**
 * The narrative evidence for ONE source recording - what the enricher slices per scene window.
 * Produced from a real SignalTimeline by `narrativeSourceFromTimeline`, or hand-built in tests.
 */
export interface NarrativeSignalSource {
  events: readonly NarrativeSignalEvent[];
  /** Source total duration, ms. Falls back to the max scene end in that source when absent. */
  durationMs?: number;
  /** composite.narrative_pressure at a timestamp (ms) -> 0..1, or undefined if unknown. */
  pressureAt?: (timestampMs: number) => number | undefined;
}

export interface EnrichOptions {
  /** Per-source narrative signals, keyed by Scene.source. Absent -> phase/position only. */
  sources?: ReadonlyMap<string, NarrativeSignalSource>;
  /** Climax energy threshold as a fraction of the source's peak. */
  climaxEnergyFraction?: number;
}

// ─── helpers ──────────────────────────────────────────────────────────────────

function clamp01(n: number): number {
  if (!Number.isFinite(n)) return 0;
  return n < 0 ? 0 : n > 1 ? 1 : n;
}

/** First finite 0..1 energy signal on the scene, or the window pressure, else undefined. */
function sceneEnergy(scene: Scene, pressure: number | undefined): number | undefined {
  const candidates = [scene.importance, scene.vocalEnergy, scene.vocalArousal, pressure];
  for (const c of candidates) {
    if (typeof c === 'number' && Number.isFinite(c)) return clamp01(c);
  }
  return undefined;
}

/** Events whose timestamp falls inside [startMs, endMs). Pure; tolerant of bad inputs. */
function eventsInWindow(
  events: readonly NarrativeSignalEvent[],
  startMs: number,
  endMs: number,
): NarrativeSignalEvent[] {
  if (!(endMs > startMs)) return [];
  const out: NarrativeSignalEvent[] = [];
  for (const e of events) {
    if (typeof e?.timestampMs !== 'number' || !Number.isFinite(e.timestampMs)) continue;
    if (e.timestampMs >= startMs && e.timestampMs < endMs) out.push(e);
  }
  return out;
}

/** Average narrative_pressure across a few probes in the window, or undefined. */
function windowPressure(source: NarrativeSignalSource | undefined, startMs: number, endMs: number): number | undefined {
  if (!source?.pressureAt || !(endMs > startMs)) return undefined;
  const probes = [startMs, (startMs + endMs) / 2, endMs - 1];
  let sum = 0;
  let n = 0;
  for (const t of probes) {
    const v = source.pressureAt(t);
    if (typeof v === 'number' && Number.isFinite(v)) {
      sum += clamp01(v);
      n += 1;
    }
  }
  return n > 0 ? sum / n : undefined;
}

/**
 * The window-local narrative tags for one scene (everything that does NOT need cross-scene
 * context). `position` and `phase` are filled by the cross-scene pass.
 */
function windowNarrative(scene: Scene, source: NarrativeSignalSource | undefined): SceneNarrative {
  const startMs = scene.startTime * MS_PER_SEC;
  const endMs = scene.endTime * MS_PER_SEC;
  const evs = source ? eventsInWindow(source.events, startMs, endMs) : [];

  const n: SceneNarrative = {};
  if (evs.some((e) => e.kind === 'cta')) n.cta = true;
  if (evs.some((e) => e.kind === 'topic_boundary')) n.topicBoundary = true;
  if (evs.some((e) => e.kind === 'rhetorical_question')) n.rhetoricalQuestion = true;
  if (evs.some((e) => e.kind === 'number')) n.statistic = true;

  // claim strength: assertive dominates hedged when both are present in the window.
  let claim: ClaimStrength | undefined;
  if (evs.some((e) => e.kind === 'claim_assertive')) claim = 'assertive';
  else if (evs.some((e) => e.kind === 'claim_hedged')) claim = 'hedged';
  if (claim) n.claimStrength = claim;

  const entities = uniqueNonEmpty(evs.filter((e) => e.kind === 'name').map((e) => e.context));
  if (entities.length > 0) n.entities = entities;

  const pressure = windowPressure(source, startMs, endMs);
  if (pressure !== undefined) n.pressure = round2(pressure);

  return n;
}

function uniqueNonEmpty(list: readonly (string | undefined)[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of list) {
    const s = typeof raw === 'string' ? raw.trim() : '';
    if (s.length === 0 || seen.has(s)) continue;
    seen.add(s);
    out.push(s);
  }
  return out;
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

/**
 * Story-arc phase per the graph recipe (entity.narrative_phase): cta or late position -> closing;
 * early position -> opening; otherwise use energy shape (peak -> climax, rising -> build, falling
 * -> resolve). With no energy signal, bucket by position only (never fabricate a climax).
 */
function computePhase(
  position: number | undefined,
  cta: boolean,
  energy: number | undefined,
  prevEnergy: number | undefined,
  sourceMaxEnergy: number | undefined,
  climaxFraction: number,
): NarrativePhase | undefined {
  if (cta) return 'closing';
  if (position === undefined) {
    // Position unknown: only an energy peak is trustworthy; otherwise leave unset.
    if (energy !== undefined && sourceMaxEnergy && sourceMaxEnergy > 0 && energy >= climaxFraction * sourceMaxEnergy) {
      return 'climax';
    }
    return undefined;
  }
  if (position >= CLOSING_POSITION) return 'closing';
  if (position < OPENING_POSITION) return 'opening';

  // mid-arc: prefer energy shape
  if (energy !== undefined) {
    if (sourceMaxEnergy && sourceMaxEnergy > 0 && energy >= climaxFraction * sourceMaxEnergy) return 'climax';
    if (prevEnergy !== undefined) return energy >= prevEnergy ? 'build' : 'resolve';
    return 'build'; // rising into the arc by default when there's no predecessor to compare
  }
  // no energy: split the mid-arc by position
  return position < 0.5 ? 'build' : 'resolve';
}

// ─── main ───────────────────────────────────────────────────────────────────

/**
 * Enrich each scene with its narrative report card. Pure; never throws. Scenes are grouped by
 * source so position and energy shape are computed WITHIN each recording (a source's own arc),
 * which is the only place chronological order is real before the composer reorders anything.
 * Returns NEW scene objects (input is not mutated).
 */
export function enrichScenes(scenes: readonly Scene[], opts?: EnrichOptions): Scene[] {
  if (scenes.length === 0) return [];
  const sources = opts?.sources;
  const climaxFraction = opts?.climaxEnergyFraction ?? DEFAULT_CLIMAX_ENERGY_FRACTION;

  // Group by source, in chronological order (by startTime) within each source.
  const bySource = new Map<string, Scene[]>();
  for (const s of scenes) {
    const arr = bySource.get(s.source);
    if (arr) arr.push(s);
    else bySource.set(s.source, [s]);
  }

  // Per scene: window-local narrative + energy + position; computed once, indexed by scene id.
  const partial = new Map<string, { narrative: SceneNarrative; energy: number | undefined; position: number | undefined }>();
  const phaseById = new Map<string, NarrativePhase | undefined>();

  for (const [source, group] of bySource) {
    const ordered = [...group].sort((a, b) => a.startTime - b.startTime);
    const src = sources?.get(source);
    const durationMs = resolveDurationMs(src, ordered);

    // Pass A: window signals + energy + position for each scene in this source.
    const energies: (number | undefined)[] = [];
    for (const scene of ordered) {
      const narrative = windowNarrative(scene, src);
      const midMs = ((scene.startTime + scene.endTime) / 2) * MS_PER_SEC;
      const position = durationMs > 0 && Number.isFinite(midMs) ? clamp01(midMs / durationMs) : undefined;
      if (position !== undefined) narrative.position = round2(position);
      const energy = sceneEnergy(scene, narrative.pressure);
      energies.push(energy);
      partial.set(scene.id, { narrative, energy, position });
    }

    // Pass B: phase from position + energy shape (needs the source's peak + each predecessor).
    const definedEnergies = energies.filter((e): e is number => e !== undefined);
    const sourceMaxEnergy = definedEnergies.length > 0 ? Math.max(...definedEnergies) : undefined;
    ordered.forEach((scene, i) => {
      const p = partial.get(scene.id)!;
      const prevEnergy = i > 0 ? energies[i - 1] : undefined;
      const phase = computePhase(p.position, p.narrative.cta === true, p.energy, prevEnergy, sourceMaxEnergy, climaxFraction);
      phaseById.set(scene.id, phase);
    });
  }

  // Assemble: attach narrative (with phase) to a NEW scene object; drop an empty narrative.
  return scenes.map((scene) => {
    const p = partial.get(scene.id);
    if (!p) return scene;
    const phase = phaseById.get(scene.id);
    if (phase) p.narrative.phase = phase;
    return Object.keys(p.narrative).length > 0 ? { ...scene, narrative: p.narrative } : scene;
  });
}

/** Source duration in ms: explicit if given, else the max scene end in the group. */
function resolveDurationMs(src: NarrativeSignalSource | undefined, group: readonly Scene[]): number {
  if (typeof src?.durationMs === 'number' && Number.isFinite(src.durationMs) && src.durationMs > 0) {
    return src.durationMs;
  }
  let maxEnd = 0;
  for (const s of group) {
    if (Number.isFinite(s.endTime) && s.endTime > maxEnd) maxEnd = s.endTime;
  }
  return maxEnd * MS_PER_SEC;
}

// ─── bridge: SignalTimeline -> NarrativeSignalSource ───────────────────────────

/**
 * The narrow shape of a SignalTimeline this bridge reads. A STRUCTURAL SUBSET of the executor's
 * `SignalTimeline` (signal-registry.ts) - the real timeline is assignable to this without an
 * import, keeping the composition lane free of executor-tree coupling (same isolation the
 * scene-adapter uses). `gridSignals` values carry `timestampMs` + namespaced signal keys.
 */
export interface TimelineLike {
  eventSignals: ReadonlyArray<{ timestampMs: number; signal: string; value: number | boolean | string; context?: string }>;
  gridSignals: ReadonlyMap<number, Record<string, unknown>>;
}

/** Map a SignalTimeline event `signal` string to our narrative event kind (or null to drop it). */
function mapEventKind(signal: string, value: number | boolean | string): NarrativeEventKind | null {
  switch (signal) {
    case 'entity.cta':
      return 'cta';
    case 'entity.topic_boundary':
      return 'topic_boundary';
    case 'entity.rhetorical_question':
      return 'rhetorical_question';
    case 'entity.number':
      return 'number';
    case 'entity.name':
      return 'name';
    case 'speech.emphasis_word':
      return 'emphasis';
    case 'entity.claim_strength':
      return value === 'assertive' ? 'claim_assertive' : value === 'hedged' ? 'claim_hedged' : null;
    default:
      return null;
  }
}

/**
 * Build the per-source `NarrativeSignalSource` from a real SignalTimeline. Pure. Reads the
 * narrative event signals and the `composite.narrative_pressure` grid; `pressureAt` returns the
 * nearest grid sample's pressure. This is the one place that knows the timeline's signal keys.
 */
export function narrativeSourceFromTimeline(timeline: TimelineLike): NarrativeSignalSource {
  const events: NarrativeSignalEvent[] = [];
  for (const e of timeline.eventSignals ?? []) {
    if (typeof e?.timestampMs !== 'number' || !Number.isFinite(e.timestampMs)) continue;
    const kind = mapEventKind(e.signal, e.value);
    if (!kind) continue;
    events.push({ timestampMs: e.timestampMs, kind, context: typeof e.context === 'string' ? e.context : undefined });
  }

  // Sorted pressure samples for nearest-neighbour lookup.
  const pressureSamples: Array<{ t: number; v: number }> = [];
  let maxT = 0;
  for (const snap of timeline.gridSignals?.values() ?? []) {
    const t = snap['timestampMs'];
    if (typeof t !== 'number' || !Number.isFinite(t)) continue;
    if (t > maxT) maxT = t;
    const p = snap['composite.narrative_pressure'];
    if (typeof p === 'number' && Number.isFinite(p)) pressureSamples.push({ t, v: clamp01(p) });
  }
  pressureSamples.sort((a, b) => a.t - b.t);

  const pressureAt = pressureSamples.length > 0
    ? (timestampMs: number): number | undefined => nearestSample(pressureSamples, timestampMs)
    : undefined;

  return { events, durationMs: maxT > 0 ? maxT : undefined, pressureAt };
}

/** Nearest-neighbour lookup over sorted {t,v} samples. Pure. */
function nearestSample(samples: readonly { t: number; v: number }[], timestampMs: number): number | undefined {
  if (samples.length === 0 || !Number.isFinite(timestampMs)) return undefined;
  let best = samples[0];
  let bestDist = Math.abs(samples[0].t - timestampMs);
  for (let i = 1; i < samples.length; i++) {
    const d = Math.abs(samples[i].t - timestampMs);
    if (d < bestDist) {
      best = samples[i];
      bestDist = d;
    } else if (samples[i].t > timestampMs && d > bestDist) {
      break; // sorted: distance only grows once we pass the target
    }
  }
  return best.v;
}
