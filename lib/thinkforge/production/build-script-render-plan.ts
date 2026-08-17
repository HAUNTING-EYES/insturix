import { AVATAR_RIG } from '@/lib/shared/capabilities';
import {
  parseScriptSidecarV2,
  SCRIPT_RENDER_PLAN_VERSION,
  type NarrativeBeatV2,
  type NarrativeLineV2,
  type NarrativeSceneV2,
  type ProviderRenderSegmentV2,
  type ScriptSidecarV2,
} from '@/lib/thinkforge/schemas/script-sidecar-v2';

export type ThinkForgeRenderPlanErrorCode =
  | 'beat-duration-unresolved'
  | 'scene-duration-conflict'
  | 'empty-spoken-line'
  | 'provider-segmentation-impossible';

export class ThinkForgeRenderPlanError extends Error {
  readonly code: ThinkForgeRenderPlanErrorCode;
  readonly sceneId: string;
  readonly beatId?: string;
  readonly lineId?: string;

  constructor(input: {
    code: ThinkForgeRenderPlanErrorCode;
    message: string;
    sceneId: string;
    beatId?: string;
    lineId?: string;
  }) {
    super(input.message);
    this.name = 'ThinkForgeRenderPlanError';
    this.code = input.code;
    this.sceneId = input.sceneId;
    this.beatId = input.beatId;
    this.lineId = input.lineId;
  }
}

export interface TechnicalRenderCapabilities {
  /** Verified ceiling for the selected on-camera lip-sync lane. */
  maxLipSyncDurationSeconds: number;
  /** Optional ceiling supplied after a voiceover visual provider is selected. */
  maxVoiceoverDurationSeconds?: number;
  /** Optional ceiling supplied after a non-speaking visual provider is selected. */
  maxVisualDurationSeconds?: number;
}

export const DEFAULT_TECHNICAL_RENDER_CAPABILITIES: TechnicalRenderCapabilities = {
  maxLipSyncDurationSeconds: AVATAR_RIG.relip.maxInputVideoSec,
};

function assertPositiveLimit(value: number | undefined, name: string): void {
  if (value !== undefined && (!Number.isFinite(value) || value <= 0)) {
    throw new Error(`${name} must be a positive finite duration.`);
  }
}

function beatDuration(scene: NarrativeSceneV2, beat: NarrativeBeatV2): number {
  if (beat.durationIntentSeconds !== undefined) return beat.durationIntentSeconds;
  if (scene.beats.length === 1 && scene.durationIntentSeconds !== undefined) {
    return scene.durationIntentSeconds;
  }
  throw new ThinkForgeRenderPlanError({
    code: 'beat-duration-unresolved',
    sceneId: scene.id,
    beatId: beat.id,
    message: `Beat "${beat.id}" needs an explicit duration before technical rendering can be planned.`,
  });
}

function validateSceneTiming(scene: NarrativeSceneV2, durations: number[]): void {
  if (scene.durationIntentSeconds === undefined) return;
  const total = durations.reduce((sum, duration) => sum + duration, 0);
  if (Math.abs(total - scene.durationIntentSeconds) <= 0.001) return;
  throw new ThinkForgeRenderPlanError({
    code: 'scene-duration-conflict',
    sceneId: scene.id,
    message: `Scene "${scene.id}" declares ${scene.durationIntentSeconds}s but its beats total ${total}s.`,
  });
}

function spokenWeight(line: NarrativeLineV2): number {
  return Math.max(1, line.text.trim().split(/\s+/u).filter(Boolean).length);
}

function allocateDurations(totalDuration: number, lines: NarrativeLineV2[]): number[] {
  const totalWeight = lines.reduce((sum, line) => sum + spokenWeight(line), 0);
  let assigned = 0;
  return lines.map((line, index) => {
    if (index === lines.length - 1) return totalDuration - assigned;
    const duration = totalDuration * (spokenWeight(line) / totalWeight);
    assigned += duration;
    return duration;
  });
}

function lineBoundaries(text: string): number[] {
  const boundaries: number[] = [];
  for (const match of text.matchAll(/\S+\s*/gu)) {
    boundaries.push((match.index ?? 0) + match[0].length);
  }
  if (boundaries.at(-1) !== text.length) boundaries.push(text.length);
  return [...new Set(boundaries.filter((offset) => offset > 0 && offset <= text.length))];
}

function splitLineSpans(
  line: NarrativeLineV2,
  partCount: number,
  sceneId: string,
  beatId: string,
): Array<{ lineId: string; startOffsetUtf16: number; endOffsetUtf16: number }> {
  if (line.text.length === 0) {
    throw new ThinkForgeRenderPlanError({
      code: 'empty-spoken-line',
      sceneId,
      beatId,
      lineId: line.id,
      message: `Spoken line "${line.id}" is empty and cannot be assigned to a render segment.`,
    });
  }
  if (partCount === 1) {
    return [{ lineId: line.id, startOffsetUtf16: 0, endOffsetUtf16: line.text.length }];
  }

  const availableBoundaries = lineBoundaries(line.text);
  if (availableBoundaries.length < partCount) {
    throw new ThinkForgeRenderPlanError({
      code: 'provider-segmentation-impossible',
      sceneId,
      beatId,
      lineId: line.id,
      message: `Line "${line.id}" cannot be split into ${partCount} non-empty provider segments without changing its text.`,
    });
  }

  const spans: Array<{ lineId: string; startOffsetUtf16: number; endOffsetUtf16: number }> = [];
  let start = 0;
  for (let partIndex = 1; partIndex < partCount; partIndex += 1) {
    const target = (line.text.length * partIndex) / partCount;
    const remainingParts = partCount - partIndex;
    const candidates = availableBoundaries.filter(
      (offset) => offset > start && availableBoundaries.filter((other) => other > offset).length >= remainingParts,
    );
    const end = candidates.reduce((best, offset) => (
      Math.abs(offset - target) < Math.abs(best - target) ? offset : best
    ), candidates[0]!);
    spans.push({ lineId: line.id, startOffsetUtf16: start, endOffsetUtf16: end });
    start = end;
  }
  spans.push({ lineId: line.id, startOffsetUtf16: start, endOffsetUtf16: line.text.length });
  return spans;
}

function splitDuration(totalDuration: number, partCount: number): number[] {
  let assigned = 0;
  return Array.from({ length: partCount }, (_, index) => {
    if (index === partCount - 1) return totalDuration - assigned;
    const duration = totalDuration / partCount;
    assigned += duration;
    return duration;
  });
}

function lineSegmentKind(line: NarrativeLineV2): ProviderRenderSegmentV2['kind'] {
  return line.delivery === 'sync-dialogue' ? 'lip-sync' : 'voiceover';
}

function providerLimitForLine(
  line: NarrativeLineV2,
  capabilities: TechnicalRenderCapabilities,
): number | undefined {
  return line.delivery === 'sync-dialogue'
    ? capabilities.maxLipSyncDurationSeconds
    : capabilities.maxVoiceoverDurationSeconds;
}

function planBeatSegments(input: {
  scene: NarrativeSceneV2;
  beat: NarrativeBeatV2;
  durationSeconds: number;
  sceneIndex: number;
  beatIndex: number;
  capabilities: TechnicalRenderCapabilities;
}): ProviderRenderSegmentV2[] {
  const { scene, beat, durationSeconds, sceneIndex, beatIndex, capabilities } = input;
  const spokenLines = beat.lines.filter((line) => line.delivery !== 'on-screen-text');
  let segmentOrdinal = 0;
  const nextIdentity = () => {
    segmentOrdinal += 1;
    const stem = `${sceneIndex + 1}_${beatIndex + 1}_${segmentOrdinal}`;
    return { id: `render_segment_${stem}`, generationUnitId: `tf_render_${stem}` };
  };

  if (spokenLines.length === 0) {
    const maxDuration = capabilities.maxVisualDurationSeconds;
    const partCount = maxDuration ? Math.ceil(durationSeconds / maxDuration) : 1;
    return splitDuration(durationSeconds, partCount).map((duration) => ({
      ...nextIdentity(),
      kind: beat.lines.some((line) => line.delivery === 'on-screen-text') ? 'graphic' : 'visual',
      narrativeSceneId: scene.id,
      beatId: beat.id,
      lineSpans: [],
      durationSeconds: duration,
    }));
  }

  const lineDurations = allocateDurations(durationSeconds, spokenLines);
  return spokenLines.flatMap((line, lineIndex) => {
    const lineDuration = lineDurations[lineIndex]!;
    const maxDuration = providerLimitForLine(line, capabilities);
    const partCount = maxDuration ? Math.ceil(lineDuration / maxDuration) : 1;
    const spans = splitLineSpans(line, partCount, scene.id, beat.id);
    const durations = splitDuration(lineDuration, partCount);
    return spans.map((span, spanIndex) => ({
      ...nextIdentity(),
      kind: lineSegmentKind(line),
      narrativeSceneId: scene.id,
      beatId: beat.id,
      lineSpans: [span],
      durationSeconds: durations[spanIndex]!,
    }));
  });
}

/**
 * Adds provider-facing jobs without changing the authored acts, scenes, beats, or lines.
 * Existing plans are immutable inputs; provider-specific callers may pass narrower limits.
 */
export function attachTechnicalRenderPlan(
  input: unknown,
  capabilities: TechnicalRenderCapabilities = DEFAULT_TECHNICAL_RENDER_CAPABILITIES,
): ScriptSidecarV2 {
  assertPositiveLimit(capabilities.maxLipSyncDurationSeconds, 'maxLipSyncDurationSeconds');
  assertPositiveLimit(capabilities.maxVoiceoverDurationSeconds, 'maxVoiceoverDurationSeconds');
  assertPositiveLimit(capabilities.maxVisualDurationSeconds, 'maxVisualDurationSeconds');

  const sidecar = parseScriptSidecarV2(input);
  if (sidecar.renderPlan) return sidecar;

  const renderSegments: ProviderRenderSegmentV2[] = [];
  let sceneIndex = 0;
  sidecar.acts.forEach((act) => act.narrativeScenes.forEach((scene) => {
    const durations = scene.beats.map((beat) => beatDuration(scene, beat));
    validateSceneTiming(scene, durations);
    scene.beats.forEach((beat, beatIndex) => {
      renderSegments.push(...planBeatSegments({
        scene,
        beat,
        durationSeconds: durations[beatIndex]!,
        sceneIndex,
        beatIndex,
        capabilities,
      }));
    });
    sceneIndex += 1;
  }));

  return parseScriptSidecarV2({
    ...sidecar,
    renderPlan: {
      version: SCRIPT_RENDER_PLAN_VERSION,
      source: 'technical-planner',
      renderSegments,
    },
  });
}
