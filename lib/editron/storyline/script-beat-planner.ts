import type { ProductionBrief } from '../production-brief/production-brief';
import { buildOrderingDigest, type ClipDigest } from './ordering-digest';
import {
  SEAM_LINKS,
  type OrderingPlan,
  type OrderingValidation,
  type SeamLink,
  validateOrderingPlan,
} from './ordering-plan';
import type { Scene } from './scene';
import { cosineSimilarity, type SceneEmbed } from './scene-embedding';

type CompletePrompt = (prompt: string) => Promise<string>;

export type ScriptBeatCoverage = 'covered' | 'partial' | 'missing';
export type ScriptBeatPlanStatus = 'planned' | 'partial' | 'failed';

export interface ScriptUnit {
  id: string;
  text: string;
}

export interface ScriptBeat {
  id: string;
  unitIds: string[];
  scriptText: string;
  visualIntent: string;
  relationFromPrevious?: SeamLink;
}

export interface ScriptBeatAssignment {
  beatId: string;
  coverage: ScriptBeatCoverage;
  sceneIds: string[];
  evidence?: string;
  candidateCount: number;
  highestSimilarity: number | null;
}

export interface ScriptBeatPlanResult {
  status: ScriptBeatPlanStatus;
  units: ScriptUnit[];
  beats: ScriptBeat[];
  assignments: ScriptBeatAssignment[];
  selectedSceneIds: string[];
  plan?: OrderingPlan;
  validation?: OrderingValidation;
  rationale?: string;
  errors: string[];
  attempts: number;
  retrieval?: {
    beatCount: number;
    embeddedBeatCount: number;
    sceneCount: number;
    embeddedSceneCount: number;
    degraded: boolean;
  };
}

export interface PlanStorylineFromScriptArgs {
  scenes: readonly Scene[];
  script: string;
  brief: ProductionBrief;
  llm: CompletePrompt;
  queryEmbed: SceneEmbed;
  language?: string | null;
  minClipDurationSec?: number;
}

interface RawBeat {
  unitRefs?: unknown;
  visualIntent?: unknown;
  relationFromPrevious?: unknown;
}

interface RawAssignment {
  beatId?: unknown;
  coverage?: unknown;
  sceneRefs?: unknown;
  evidence?: unknown;
}

interface CandidateRow {
  ref: string;
  sceneId: string;
  similarity: number;
  digest: ClipDigest;
}

interface ParsedAssignments {
  assignments: ScriptBeatAssignment[];
  plan: OrderingPlan;
  validation: OrderingValidation;
  rationale?: string;
}

/** Operational prompt-size protection, not an editorial threshold. */
const MAPPING_PROMPT_CHAR_BUDGET = 60_000;
const MAX_AUDIT_TEXT = 600;

type SentenceSegmenter = {
  segment(input: string): Iterable<{ segment: string }>;
};

type SentenceSegmenterConstructor = new (
  locales?: string | string[],
  options?: { granularity: 'sentence' },
) => SentenceSegmenter;

function cleanText(value: unknown, max = MAX_AUDIT_TEXT): string | undefined {
  if (typeof value !== 'string') return undefined;
  const clean = value.trim().replace(/\s+/gu, ' ');
  return clean ? clean.slice(0, max) : undefined;
}

function parseObject(raw: string): Record<string, unknown> | null {
  const trimmed = raw.trim();
  const fenced = trimmed.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/u)?.[1] ?? trimmed;
  try {
    const parsed = JSON.parse(fenced) as unknown;
    return parsed !== null && typeof parsed === 'object' && !Array.isArray(parsed)
      ? parsed as Record<string, unknown>
      : null;
  } catch {
    return null;
  }
}

function fallbackSentenceSplit(script: string): string[] {
  const out: string[] = [];
  for (const paragraph of script.split(/\n+/u)) {
    const matches = paragraph.match(/[^.!?\u0964\u0965]+[.!?\u0964\u0965]*/gu);
    for (const match of matches ?? [paragraph]) {
      const text = match.trim();
      if (text) out.push(text);
    }
  }
  return out;
}

/** Exact, ordered script atoms. The model groups these; it cannot omit or rewrite them. */
export function segmentScriptUnits(script: string, language?: string | null): ScriptUnit[] {
  const normalized = script.replace(/\r\n?/gu, '\n').trim();
  if (!normalized) return [];

  const Segmenter = (Intl as unknown as { Segmenter?: SentenceSegmenterConstructor }).Segmenter;
  let pieces: string[] = [];
  if (Segmenter) {
    try {
      pieces = Array.from(new Segmenter(language || undefined, { granularity: 'sentence' }).segment(normalized))
        .map((part) => part.segment.trim())
        .filter(Boolean);
    } catch {
      pieces = [];
    }
  }
  if (pieces.length === 0) pieces = fallbackSentenceSplit(normalized);
  return pieces.map((text, index) => ({ id: `u${index}`, text }));
}

function extractionPrompt(units: readonly ScriptUnit[], language?: string | null): string {
  return `<role>You are a factual video-planning analyst. Group an exact script into ordered semantic beats. You do not choose graphics, edits, transitions, or templates.</role>

<output_schema>
{"beats":[{"unitRefs":["u0"],"visualIntent":"observable footage evidence that could express this beat","relationFromPrevious":"therefore|but|and-then|meanwhile|null"}]}
</output_schema>

<rules>
- Use every unitRef exactly once, in the original order.
- Never rewrite, translate, omit, or invent script content.
- visualIntent describes evidence to look for; it must not claim that footage exists.
- Keep the source language and natural code-mixing (${language ?? 'language unknown'}).
- relationFromPrevious is a semantic story relation, not a visual transition. Use null for the first beat.
- Return JSON only.
</rules>

<script_units>
${JSON.stringify(units)}
</script_units>`;
}

function parseBeats(raw: string, units: readonly ScriptUnit[]): { beats?: ScriptBeat[]; errors: string[] } {
  const parsed = parseObject(raw);
  if (!parsed || !Array.isArray(parsed.beats)) return { errors: ['response.beats is not an array'] };

  const byId = new Map(units.map((unit, index) => [unit.id, { unit, index }]));
  const seen = new Set<string>();
  const beats: ScriptBeat[] = [];
  let lastUnitIndex = -1;

  for (const value of parsed.beats as RawBeat[]) {
    if (!value || !Array.isArray(value.unitRefs) || value.unitRefs.length === 0) {
      return { errors: ['every beat must contain at least one unitRef'] };
    }
    const unitIds: string[] = [];
    for (const refValue of value.unitRefs) {
      if (typeof refValue !== 'string') return { errors: ['unitRef must be a string'] };
      const entry = byId.get(refValue);
      if (!entry) return { errors: [`unknown unitRef ${refValue}`] };
      if (seen.has(refValue)) return { errors: [`duplicate unitRef ${refValue}`] };
      if (entry.index <= lastUnitIndex) return { errors: [`unitRef ${refValue} is out of script order`] };
      seen.add(refValue);
      unitIds.push(refValue);
      lastUnitIndex = entry.index;
    }

    const visualIntent = cleanText(value.visualIntent);
    if (!visualIntent) return { errors: ['every beat needs a non-empty visualIntent'] };
    const relationValue = value.relationFromPrevious;
    const relation = typeof relationValue === 'string' && (SEAM_LINKS as readonly string[]).includes(relationValue)
      ? relationValue as SeamLink
      : undefined;
    if (relationValue != null && relation === undefined) {
      return { errors: [`invalid relationFromPrevious ${String(relationValue)}`] };
    }

    const scriptText = unitIds.map((id) => byId.get(id)!.unit.text).join(' ');
    const beat: ScriptBeat = {
      id: `b${beats.length}`,
      unitIds,
      scriptText,
      visualIntent,
    };
    if (beats.length > 0 && relation) beat.relationFromPrevious = relation;
    beats.push(beat);
  }

  if (seen.size !== units.length) {
    const omitted = units.filter((unit) => !seen.has(unit.id)).map((unit) => unit.id);
    return { errors: [`script units omitted: ${omitted.join(', ')}`] };
  }
  return beats.length > 0 ? { beats, errors: [] } : { errors: ['no script beats returned'] };
}

function sceneHasSemanticEvidence(scene: Scene): boolean {
  return Boolean(
    scene.transcription.trim()
    || scene.description?.trim()
    || scene.detectedText.length > 0
    || scene.objects.length > 0
    || scene.visualMode
    || scene.actionType,
  );
}

async function rankCandidates(
  beats: readonly ScriptBeat[],
  scenes: readonly Scene[],
  queryEmbed: SceneEmbed,
): Promise<{
  candidates: Map<string, CandidateRow[]>;
  embeddedBeatCount: number;
  embeddedSceneCount: number;
}> {
  const digests = buildOrderingDigest(scenes);
  const rows = new Map<string, CandidateRow[]>();
  let embeddedBeatCount = 0;
  for (const beat of beats) {
    let query: number[] = [];
    try {
      query = await queryEmbed(`${beat.scriptText}\nVisual evidence sought: ${beat.visualIntent}`);
    } catch {
      query = [];
    }
    if (query.length > 0) embeddedBeatCount += 1;
    const ranked = scenes
      .map((scene, index): CandidateRow | null => {
        if (!sceneHasSemanticEvidence(scene)) return null;
        const similarity = scene.embedding && query.length > 0
          ? cosineSimilarity(scene.embedding, query)
          : 0;
        return { ref: digests[index].ref, sceneId: scene.id, similarity, digest: digests[index] };
      })
      .filter((row): row is CandidateRow => row !== null)
      .sort((a, b) => b.similarity - a.similarity
        || (b.digest.importance ?? -1) - (a.digest.importance ?? -1)
        || a.ref.localeCompare(b.ref));
    rows.set(beat.id, ranked);
  }
  return {
    candidates: rows,
    embeddedBeatCount,
    embeddedSceneCount: scenes.filter((scene) => Boolean(scene.embedding?.length)).length,
  };
}

function candidateForPrompt(row: CandidateRow): Record<string, unknown> {
  const d = row.digest;
  return {
    ref: row.ref,
    source: d.source,
    durationSec: d.durationSec,
    similarity: Math.round(row.similarity * 1000) / 1000,
    importance: d.importance,
    transcript: d.transcript,
    visualMode: d.visualMode,
    actionType: d.actionType,
    visualDescription: d.visualDescription,
    subjects: d.subjects,
    onScreenText: d.onScreenText,
  };
}

function packCandidates(
  beats: readonly ScriptBeat[],
  ranked: ReadonlyMap<string, CandidateRow[]>,
): Map<string, CandidateRow[]> {
  const packed = new Map<string, CandidateRow[]>();
  const baseChars = JSON.stringify(beats).length;
  const perBeatBudget = Math.max(1, Math.floor((MAPPING_PROMPT_CHAR_BUDGET - baseChars) / Math.max(1, beats.length)));
  for (const beat of beats) {
    const selected: CandidateRow[] = [];
    let used = 0;
    for (const row of ranked.get(beat.id) ?? []) {
      const cost = JSON.stringify(candidateForPrompt(row)).length;
      if (selected.length > 0 && used + cost > perBeatBudget) break;
      selected.push(row);
      used += cost;
    }
    packed.set(beat.id, selected);
  }
  return packed;
}

function assignmentPrompt(
  beats: readonly ScriptBeat[],
  candidates: ReadonlyMap<string, CandidateRow[]>,
  targetDurationSec?: number | null,
): string {
  const input = beats.map((beat) => ({
    beat,
    candidates: (candidates.get(beat.id) ?? []).map(candidateForPrompt),
  }));
  return `<role>You are a grounded multi-asset video editor. Map ordered script beats to observed clip evidence. You choose footage, not graphics, styles, or transitions.</role>

<output_schema>
{"assignments":[{"beatId":"b0","coverage":"covered|partial|missing","sceneRefs":["c0"],"evidence":"specific observed transcript or visual fact"}],"rationale":"one concise explanation"}
</output_schema>

<rules>
- Return exactly one assignment for every beatId, in beat order.
- Use only sceneRefs listed under that beat. Never invent footage.
- A sceneRef may appear once in the whole response.
- Preserve chronological order when selecting multiple scenes from the same source.
- covered/partial requires at least one sceneRef and concrete observed evidence.
- missing requires an empty sceneRefs array. Missing is better than a false match.
- The selected duration must not exceed ${typeof targetDurationSec === 'number' && targetDurationSec > 0 ? `${targetDurationSec}s` : 'the available material'}.
- Return JSON only.
</rules>

<beat_candidates>
${JSON.stringify(input)}
</beat_candidates>`;
}

function parseAssignments(
  raw: string,
  beats: readonly ScriptBeat[],
  candidates: ReadonlyMap<string, CandidateRow[]>,
  scenes: readonly Scene[],
  brief: ProductionBrief,
  minClipDurationSec?: number,
): { parsed?: ParsedAssignments; errors: string[] } {
  const obj = parseObject(raw);
  if (!obj || !Array.isArray(obj.assignments)) return { errors: ['response.assignments is not an array'] };

  const rawByBeat = new Map<string, RawAssignment>();
  for (const value of obj.assignments as RawAssignment[]) {
    const beatId = typeof value?.beatId === 'string' ? value.beatId : undefined;
    if (!beatId) return { errors: ['assignment beatId is missing'] };
    if (rawByBeat.has(beatId)) return { errors: [`duplicate assignment for ${beatId}`] };
    rawByBeat.set(beatId, value);
  }

  const usedRefs = new Set<string>();
  const assignments: ScriptBeatAssignment[] = [];
  const plan: OrderingPlan = { order: [] };
  const selectedById = new Map<string, Scene>();

  for (const beat of beats) {
    const value = rawByBeat.get(beat.id);
    if (!value) return { errors: [`missing assignment for ${beat.id}`] };
    const coverage = value.coverage;
    if (coverage !== 'covered' && coverage !== 'partial' && coverage !== 'missing') {
      return { errors: [`invalid coverage for ${beat.id}`] };
    }
    if (!Array.isArray(value.sceneRefs) || value.sceneRefs.some((ref) => typeof ref !== 'string')) {
      return { errors: [`sceneRefs for ${beat.id} must be a string array`] };
    }
    const refs = value.sceneRefs as string[];
    if (coverage === 'missing' && refs.length > 0) return { errors: [`missing beat ${beat.id} cannot select scenes`] };
    if (coverage !== 'missing' && refs.length === 0) return { errors: [`${coverage} beat ${beat.id} must select a scene`] };

    const allowed = new Map((candidates.get(beat.id) ?? []).map((row) => [row.ref, row]));
    const evidence = cleanText(value.evidence);
    if (coverage !== 'missing' && !evidence) return { errors: [`${beat.id} needs concrete evidence`] };
    const sceneIds: string[] = [];
    for (const ref of refs) {
      if (usedRefs.has(ref)) return { errors: [`sceneRef ${ref} is reused`] };
      const row = allowed.get(ref);
      if (!row) return { errors: [`sceneRef ${ref} was not offered for ${beat.id}`] };
      usedRefs.add(ref);
      sceneIds.push(row.sceneId);
      const scene = scenes.find((candidate) => candidate.id === row.sceneId);
      if (scene) selectedById.set(scene.id, scene);
      const item = { sourceRef: row.sceneId, reason: evidence };
      if (plan.order.length > 0 && sceneIds.length === 1 && beat.relationFromPrevious) {
        Object.assign(item, { linkFromPrev: beat.relationFromPrevious });
      }
      plan.order.push(item);
    }

    const ranked = candidates.get(beat.id) ?? [];
    assignments.push({
      beatId: beat.id,
      coverage,
      sceneIds,
      ...(evidence ? { evidence } : {}),
      candidateCount: ranked.length,
      highestSimilarity: ranked.length > 0 ? Math.round(ranked[0].similarity * 1000) / 1000 : null,
    });
  }
  if (rawByBeat.size !== beats.length) return { errors: ['response contains unknown beat assignments'] };
  if (plan.order.length === 0) return { errors: ['no grounded scenes selected for the script'] };

  const selectedScenes = plan.order
    .map((item) => selectedById.get(item.sourceRef))
    .filter((scene): scene is Scene => Boolean(scene));
  const validation = validateOrderingPlan(plan, selectedScenes, {
    targetDurationSec: brief.output.targetDurationSec,
    durationToleranceSec: 0,
    minClipDurationSec,
  });
  if (!validation.valid) return { errors: validation.issues.map((issue) => `${issue.code}: ${issue.message}`) };

  const rationale = cleanText(obj.rationale);
  if (rationale) plan.rationale = rationale;
  return { parsed: { assignments, plan, validation, rationale }, errors: [] };
}

function repairPrompt(stage: 'beat extraction' | 'scene assignment', original: string, errors: readonly string[], prior: string): string {
  return `${original}\n\n<repair>
Your previous ${stage} response was invalid.
Errors: ${JSON.stringify(errors)}
Previous response: ${prior.slice(0, 12_000)}
Return one corrected JSON object using the same schema. Do not explain.
</repair>`;
}

function failed(
  units: ScriptUnit[],
  beats: ScriptBeat[],
  errors: string[],
  attempts: number,
): ScriptBeatPlanResult {
  return { status: 'failed', units, beats, assignments: [], selectedSceneIds: [], errors, attempts };
}

/**
 * Build a grounded, auditable script-to-footage plan. The model groups exact script units and
 * proposes mappings; deterministic code owns reference validity, chronology, uniqueness, and
 * duration. An authoritative script never silently degrades into unrelated chronological order.
 */
export async function planStorylineFromScript(args: PlanStorylineFromScriptArgs): Promise<ScriptBeatPlanResult> {
  const units = segmentScriptUnits(args.script, args.language);
  if (units.length === 0) return failed([], [], ['script is empty'], 0);
  if (args.scenes.length === 0) return failed(units, [], ['no analyzed scenes are available'], 0);

  let attempts = 0;
  const beatPrompt = extractionPrompt(units, args.language);
  let beatRaw: string;
  try {
    attempts += 1;
    beatRaw = await args.llm(beatPrompt);
  } catch (error) {
    return failed(units, [], [`beat extraction failed: ${error instanceof Error ? error.message : String(error)}`], attempts);
  }
  let parsedBeats = parseBeats(beatRaw, units);
  if (!parsedBeats.beats) {
    try {
      attempts += 1;
      beatRaw = await args.llm(repairPrompt('beat extraction', beatPrompt, parsedBeats.errors, beatRaw));
      parsedBeats = parseBeats(beatRaw, units);
    } catch (error) {
      return failed(units, [], [`beat extraction repair failed: ${error instanceof Error ? error.message : String(error)}`], attempts);
    }
  }
  if (!parsedBeats.beats) return failed(units, [], parsedBeats.errors, attempts);

  const beats = parsedBeats.beats;
  const retrieval = await rankCandidates(beats, args.scenes, args.queryEmbed);
  const packed = packCandidates(beats, retrieval.candidates);
  const mapPrompt = assignmentPrompt(beats, packed, args.brief.output.targetDurationSec);
  let assignmentRaw: string;
  try {
    attempts += 1;
    assignmentRaw = await args.llm(mapPrompt);
  } catch (error) {
    return failed(units, beats, [`scene assignment failed: ${error instanceof Error ? error.message : String(error)}`], attempts);
  }
  let parsedAssignments = parseAssignments(
    assignmentRaw,
    beats,
    packed,
    args.scenes,
    args.brief,
    args.minClipDurationSec,
  );
  if (!parsedAssignments.parsed) {
    try {
      attempts += 1;
      assignmentRaw = await args.llm(repairPrompt('scene assignment', mapPrompt, parsedAssignments.errors, assignmentRaw));
      parsedAssignments = parseAssignments(
        assignmentRaw,
        beats,
        packed,
        args.scenes,
        args.brief,
        args.minClipDurationSec,
      );
    } catch (error) {
      return failed(units, beats, [`scene assignment repair failed: ${error instanceof Error ? error.message : String(error)}`], attempts);
    }
  }
  if (!parsedAssignments.parsed) return failed(units, beats, parsedAssignments.errors, attempts);

  const result = parsedAssignments.parsed;
  const status: ScriptBeatPlanStatus = result.assignments.every((assignment) => assignment.coverage === 'covered')
    ? 'planned'
    : 'partial';
  return {
    status,
    units,
    beats,
    assignments: result.assignments,
    selectedSceneIds: result.plan.order.map((item) => item.sourceRef),
    plan: result.plan,
    validation: result.validation,
    rationale: result.rationale,
    errors: [],
    attempts,
    retrieval: {
      beatCount: beats.length,
      embeddedBeatCount: retrieval.embeddedBeatCount,
      sceneCount: args.scenes.length,
      embeddedSceneCount: retrieval.embeddedSceneCount,
      degraded: retrieval.embeddedBeatCount < beats.length || retrieval.embeddedSceneCount < args.scenes.length,
    },
  };
}
