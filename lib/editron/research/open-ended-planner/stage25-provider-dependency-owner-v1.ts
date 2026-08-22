import { applyFilterToProject, resolveKeyframeEditParams }
  from '../../agent/chat-visual-tools';
import { buildKeyframeMutationPatch }
  from '../../services/keyframe-mutation';
import { alignCutsToBeatsWithEvidence } from '../../../pipeline/scene-to-editron';
import { deepFreezeV1, hashCanonicalJsonV1 } from './contracts-v1';
import type { ProviderNativeToolExecutionV2R }
  from './provider-native-tool-episode-v2r';

type JsonRecord = Record<string, unknown>;

export const STAGE25_DEPENDENCY_OWNER_SNAPSHOT_VERSION_V1 =
  'EDITRON_STAGE25_DEPENDENCY_OWNER_SNAPSHOT_V1_1' as const;

export const STAGE25_DEPENDENCY_BEAT_PLAN_V1 = deepFreezeV1({
  schemaVersion: 'EDITRON_MEASURED_BEAT_PLAN_V2R_1',
  assetId: 'music-1', measuredEvidenceReceiptHash: 'a'.repeat(64),
  strongPeakFrames: [119, 239], finalStrongPeakFrame: 239,
});
export const STAGE25_DEPENDENCY_VISUAL_EVIDENCE_V1 = deepFreezeV1({
  overlayId: 42, targetFrame: 660, focalPoint: { x: 0.74, y: 0.5 },
  evidenceStrength: 0.92,
});
export const STAGE25_DEPENDENCY_BEAT_CONSTRAINTS_V1 = deepFreezeV1({
  maxSnapFrames: 8, minClipFrames: 20, maxConsecutiveBeatCuts: 4,
  protectedAudioRange: { startFrame: 0, endFrame: 90 },
  protectedBoundaryToleranceFrames: 3,
  sourceDurationFramesByAssetId: {
    'clip-a': 900, 'clip-b': 900, 'clip-c': 900,
  },
  requireSourceHandles: true,
});

export class Stage25ProviderDependencyOwnerV1 {
  private readonly before = buildProject();
  private current = clone(this.before);
  private readonly stages = new Set<string>();
  private readonly changedPaths = new Set<string>();
  private readonly trace: JsonRecord[] = [];

  /**
   * Restores this same isolated mutation owner after an intentional worker
   * interruption. The snapshot is accepted only when it matches a canonical
   * prefix rebuilt through the owner's existing resolvers and mutation paths.
   */
  static restore(snapshot: unknown): Stage25ProviderDependencyOwnerV1 {
    const candidate = requireRecord(snapshot, 'RESTORE_SNAPSHOT');
    verifySnapshotEnvelope(candidate);
    const mutationStages = stringArray(candidate.mutationStages, 'MUTATION_STAGES');
    const expected = new Stage25ProviderDependencyOwnerV1();
    expected.rebuildMutationPrefix(mutationStages);
    const expectedSnapshot = expected.snapshot();
    for (const field of [
      'beforeStateHash', 'afterStateHash', 'currentProjectRevision',
      'mutationStages', 'changedPaths', 'currentProject', 'stateEffects',
    ] as const) {
      if (!same(candidate[field], expectedSnapshot[field])) {
        fail(`RESTORE_${field.toUpperCase()}_MISMATCH`);
      }
    }
    const trace = validateRestoreTrace(
      candidate.trace,
      text(candidate.beforeStateHash),
      text(candidate.afterStateHash),
      mutationStages,
    );
    const restored = new Stage25ProviderDependencyOwnerV1();
    restored.current = clone(requireRecord(candidate.currentProject, 'CURRENT_PROJECT'));
    mutationStages.forEach((stage) => restored.stages.add(stage));
    stringArray(candidate.changedPaths, 'CHANGED_PATHS')
      .forEach((path) => restored.changedPaths.add(path));
    restored.trace.push(...clone(trace));
    return restored;
  }

  async execute(call: Readonly<{
    operatorId: string; arguments: Readonly<JsonRecord>; turn: number;
  }>): Promise<Readonly<ProviderNativeToolExecutionV2R>> {
    const beforeStateHash = hashCanonicalJsonV1(this.current);
    try {
      const output = this.executeChecked(call.operatorId, call.arguments);
      this.trace.push({
        turn: call.turn, operatorId: call.operatorId, disposition: 'OK',
        argumentHash: hashCanonicalJsonV1(call.arguments),
        outputHash: hashCanonicalJsonV1(output), beforeStateHash,
        afterStateHash: hashCanonicalJsonV1(this.current),
      });
      return deepFreezeV1({
        authority: 'RESEARCH_ISOLATED_NO_PROJECT_MUTATION' as const,
        disposition: 'OK' as const, output,
        evidenceIds: evidenceIds(call.operatorId),
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'UNKNOWN_OWNER_FAILURE';
      const disposition = message.includes('REVISION') ? 'CONFLICT' as const : 'FAIL' as const;
      this.trace.push({
        turn: call.turn, operatorId: call.operatorId, disposition,
        argumentHash: hashCanonicalJsonV1(call.arguments), beforeStateHash,
        afterStateHash: hashCanonicalJsonV1(this.current), error: message,
      });
      return deepFreezeV1({
        authority: 'RESEARCH_ISOLATED_NO_PROJECT_MUTATION' as const,
        disposition, output: { code: message.split(':')[0], message },
        evidenceIds: [] as const,
      });
    }
  }

  snapshot(): Readonly<JsonRecord> {
    const material = {
      snapshotVersion: STAGE25_DEPENDENCY_OWNER_SNAPSHOT_VERSION_V1,
      authority: 'RESEARCH_ISOLATED_CLONE_ONLY',
      beforeStateHash: hashCanonicalJsonV1(this.before),
      afterStateHash: hashCanonicalJsonV1(this.current),
      currentProjectRevision: text(this.current.projectRevision),
      mutationStages: [...this.stages].sort(compareUtf16),
      changedPaths: [...this.changedPaths].sort(compareUtf16),
      currentProject: clone(this.current), trace: clone(this.trace),
      stateEffects: [] as const,
    };
    return deepFreezeV1({
      ...material,
      snapshotSha256: hashCanonicalJsonV1(material),
    });
  }

  private rebuildMutationPrefix(stages: readonly string[]): void {
    const key = [...stages].sort(compareUtf16).join('|');
    if (!['', 'SYNC', 'KEYFRAMES|SYNC', 'FILTER|KEYFRAMES|SYNC'].includes(key)) {
      fail('RESTORE_STAGE_PREFIX_INVALID');
    }
    if (stages.includes('SYNC')) {
      this.executeChecked('sync_cuts_to_beats', {
        projectId: 'project-42', expectedProjectRevision: 'R42',
        overlayIds: [1, 2, 3], beatPlan: STAGE25_DEPENDENCY_BEAT_PLAN_V1,
        beatSyncConstraints: STAGE25_DEPENDENCY_BEAT_CONSTRAINTS_V1,
      });
    }
    if (stages.includes('KEYFRAMES')) {
      const resolution = this.executeChecked('resolve_keyframe_edit', {
        projectId: 'project-42', expectedProjectRevision: 'R43', overlayId: 42,
        targetFrame: 660, focalPoint: { x: 0.74, y: 0.5 },
        evidenceStrength: 0.92,
        intent: {
          direction: 'in', durationFrames: 60, scaleDelta: 0.08,
          replaceExistingScaleKeyframes: true,
        },
      });
      const operation = requireRecord(resolution.proposedOperation, 'RESTORE_OPERATION');
      this.executeChecked('set_keyframes', {
        projectId: 'project-42', expectedProjectRevision: 'R43',
        ...requireRecord(operation.arguments, 'RESTORE_OPERATION_ARGUMENTS'),
      });
    }
    if (stages.includes('FILTER')) {
      this.executeChecked('apply_filter', {
        projectId: 'project-42', expectedProjectRevision: 'R44', overlayId: 42,
        targetRange: { startFrame: 600, endFrame: 720 },
        effectPlan: { filterIntent: 'warmer', replaceExistingFilter: false },
      });
    }
  }

  private executeChecked(operatorId: string, args: Readonly<JsonRecord>): JsonRecord {
    this.requireProject(args);
    if (operatorId === 'find_audio_moment') return this.findAudio(args);
    if (operatorId === 'find_visual_moment') return this.findVisual(args);
    if (operatorId === 'sync_cuts_to_beats') return this.syncCuts(args);
    if (operatorId === 'resolve_keyframe_edit') return this.resolveKeyframes(args);
    if (operatorId === 'set_keyframes') return this.setKeyframes(args);
    if (operatorId === 'apply_filter') return this.applyFilter(args);
    throw new Error(`OPERATOR_NOT_OWNED:${operatorId}`);
  }

  private findAudio(args: Readonly<JsonRecord>): JsonRecord {
    if (!text(args.query).trim()) throw new Error('AUDIO_QUERY_MISSING');
    return {
      result: STAGE25_DEPENDENCY_BEAT_PLAN_V1,
      evidence: { evidenceId: 'EV-A', status: 'MEASURED_OWNER_EVIDENCE' },
    };
  }

  private findVisual(args: Readonly<JsonRecord>): JsonRecord {
    if (!text(args.query).trim()) throw new Error('VISUAL_QUERY_MISSING');
    return {
      result: { candidate: 'product-reveal', range: { startFrame: 600, endFrame: 720 } },
      evidence: { evidenceId: 'EV-V', status: 'VISUALLY_VERIFIED' },
      ...STAGE25_DEPENDENCY_VISUAL_EVIDENCE_V1,
    };
  }

  private syncCuts(args: Readonly<JsonRecord>): JsonRecord {
    this.requireRevision(args, 'R42');
    this.requireNotRun('SYNC');
    if (!same(args.beatPlan, STAGE25_DEPENDENCY_BEAT_PLAN_V1)
      || !same(args.beatSyncConstraints, STAGE25_DEPENDENCY_BEAT_CONSTRAINTS_V1)
      || !same(args.overlayIds, [1, 2, 3])) throw new Error('SYNC_CAUSAL_INPUT_INVALID');
    const overlays = this.current.overlays as JsonRecord[];
    const result = alignCutsToBeatsWithEvidence(
      overlays,
      STAGE25_DEPENDENCY_BEAT_PLAN_V1.strongPeakFrames
        .map((frame) => ({ frame, isDownbeat: true })),
      30,
      {
        ...STAGE25_DEPENDENCY_BEAT_CONSTRAINTS_V1,
        protectedBoundaryFrames: [90],
      },
    );
    if (result.snappedCount !== 2
      || !same(result.changes.map(({ alignedFrame }) => alignedFrame), [119, 239])) {
      throw new Error('SYNC_OWNER_RESULT_UNEXPECTED');
    }
    this.advance('SYNC', 'R43', [
      'overlays[1].durationInFrames', 'overlays[2].from',
      'overlays[2].durationInFrames', 'overlays[3].from',
    ]);
    return { receipt: receipt('R43'), result };
  }

  private resolveKeyframes(args: Readonly<JsonRecord>): JsonRecord {
    this.requireRevision(args, 'R43');
    const visual = STAGE25_DEPENDENCY_VISUAL_EVIDENCE_V1;
    if (args.overlayId !== visual.overlayId || args.targetFrame !== visual.targetFrame
      || args.evidenceStrength !== visual.evidenceStrength
      || !same(args.focalPoint, visual.focalPoint)) throw new Error('VISUAL_CAUSAL_INPUT_INVALID');
    const intent = record(args.intent);
    const plan = resolveKeyframeEditParams(this.current, {
      overlayId: visual.overlayId, targetFrame: visual.targetFrame,
      direction: intent.direction === 'out' ? 'out' : 'in',
      durationFrames: number(intent.durationFrames) || undefined,
      scaleDelta: number(intent.scaleDelta) || undefined,
      replaceExistingScaleKeyframes: intent.replaceExistingScaleKeyframes === true,
      evidenceModality: 'visual', evidenceStrength: visual.evidenceStrength,
      focalPoint: visual.focalPoint,
    });
    if (plan.status !== 'ready' || !plan.useWith?.set_keyframes) {
      throw new Error(`KEYFRAME_FORM_NOT_READY:${plan.status}`);
    }
    const { property: _property, ...argumentsForOwner } = plan.useWith.set_keyframes;
    return {
      proposedOperation: { targetOperatorId: 'set_keyframes', arguments: argumentsForOwner },
      evidence: { evidenceId: 'EV-FORM', owner: 'resolveKeyframeEditParams' },
    };
  }

  private setKeyframes(args: Readonly<JsonRecord>): JsonRecord {
    this.requireRevision(args, 'R43');
    this.requireNotRun('KEYFRAMES');
    const overlay = this.overlay(42);
    const patch = buildKeyframeMutationPatch({
      overlay, property: 'scale',
      keyframes: records(args.keyframes) as Array<{
        frame: number; value: number; easing: 'linear' | 'ease-in' | 'ease-out' | 'ease-in-out';
      }>,
      focalPoint: record(args.focalPoint) as { x: number; y: number },
    });
    Object.assign(overlay, patch.patch);
    this.advance('KEYFRAMES', 'R44', [
      'overlays[42].keyframeTracks[scale]', 'overlays[42].styles.transformOrigin',
    ]);
    return { receipt: receipt('R44') };
  }

  private applyFilter(args: Readonly<JsonRecord>): JsonRecord {
    this.requireRevision(args, 'R44');
    this.requireNotRun('FILTER');
    if (!same(args.targetRange, { startFrame: 600, endFrame: 720 })
      || record(args.effectPlan).filterIntent !== 'warmer') {
      throw new Error('FILTER_TARGET_OR_INTENT_INVALID');
    }
    const plan = applyFilterToProject(this.current, {
      overlayId: 42, filterIntent: 'warmer', replaceExistingFilter: false,
    });
    if (plan.status !== 'changed' || plan.updates.length !== 1) {
      throw new Error(`FILTER_OWNER_NOT_CHANGED:${plan.status}`);
    }
    Object.assign(this.overlay(42), { styles: plan.updates[0].nextStyles });
    this.advance('FILTER', 'R45', ['overlays[42].styles.filter']);
    return { receipt: receipt('R45') };
  }

  private requireProject(args: Readonly<JsonRecord>): void {
    if (args.projectId !== 'project-42') throw new Error('PROJECT_ID_INVALID');
  }
  private requireRevision(args: Readonly<JsonRecord>, expected: string): void {
    if (args.expectedProjectRevision !== expected
      || this.current.projectRevision !== expected) throw new Error('REVISION_CONFLICT');
  }
  private requireNotRun(stage: string): void {
    if (this.stages.has(stage)) throw new Error(`MUTATION_REPEATED:${stage}`);
  }
  private overlay(id: number): JsonRecord {
    return (this.current.overlays as JsonRecord[]).find((entry) => entry.id === id)
      ?? fail(`OVERLAY_NOT_FOUND:${id}`);
  }
  private advance(stage: string, revision: string, paths: readonly string[]): void {
    this.current.projectRevision = revision; this.stages.add(stage);
    paths.forEach((path) => this.changedPaths.add(path));
  }
}

function buildProject(): JsonRecord { return { projectId: 'project-42', projectRevision: 'R42', durationInFrames: 720, overlays: [
  { id: 1, type: 'video', row: 0, from: 0, durationInFrames: 116, assetId: 'clip-a', sourceStartFrame: 0, videoStartTime: 0 },
  { id: 2, type: 'video', row: 0, from: 116, durationInFrames: 120, assetId: 'clip-b', sourceStartFrame: 30, videoStartTime: 30 },
  { id: 3, type: 'video', row: 0, from: 236, durationInFrames: 124, assetId: 'clip-c', sourceStartFrame: 30, videoStartTime: 30 },
  { id: 42, type: 'video', row: 1, from: 600, durationInFrames: 120, assetId: 'product', sourceStartFrame: 0, videoStartTime: 0, styles: {}, contentSignals: { visual_significance: 0.92 } },
] }; }
function receipt(projectRevision: string): JsonRecord { return { status: 'PASS', projectRevision, proof: { status: 'NOT_RUN' } }; }
function evidenceIds(operatorId: string): string[] { return operatorId.includes('audio') || operatorId === 'sync_cuts_to_beats' ? ['EV-A'] : operatorId.includes('visual') || operatorId.includes('keyframe') || operatorId === 'set_keyframes' || operatorId === 'apply_filter' ? ['EV-V'] : []; }
function clone<T>(value: T): T { return structuredClone(value); }
function same(left: unknown, right: unknown): boolean { return hashCanonicalJsonV1(left) === hashCanonicalJsonV1(right); }
function isRecord(value: unknown): value is JsonRecord { return Boolean(value) && typeof value === 'object' && !Array.isArray(value); }
function record(value: unknown): JsonRecord { return isRecord(value) ? value : {}; }
function records(value: unknown): JsonRecord[] { return Array.isArray(value) ? value.filter(isRecord) : []; }
function text(value: unknown): string { return typeof value === 'string' ? value : ''; }
function number(value: unknown): number { return typeof value === 'number' && Number.isFinite(value) ? value : 0; }
function compareUtf16(left: string, right: string): number { return left < right ? -1 : left > right ? 1 : 0; }
function requireRecord(value: unknown, code: string): JsonRecord {
  return isRecord(value) ? value : fail(code);
}
function stringArray(value: unknown, code: string): string[] {
  if (!Array.isArray(value) || value.some((entry) => typeof entry !== 'string')) {
    fail(code);
  }
  return [...value] as string[];
}
function verifySnapshotEnvelope(snapshot: JsonRecord): void {
  if (snapshot.snapshotVersion !== STAGE25_DEPENDENCY_OWNER_SNAPSHOT_VERSION_V1
    || snapshot.authority !== 'RESEARCH_ISOLATED_CLONE_ONLY'
    || !Array.isArray(snapshot.stateEffects) || snapshot.stateEffects.length !== 0) {
    fail('RESTORE_ENVELOPE_INVALID');
  }
  const material = { ...snapshot };
  delete material.snapshotSha256;
  if (!isSha256(snapshot.snapshotSha256)
    || snapshot.snapshotSha256 !== hashCanonicalJsonV1(material)) {
    fail('RESTORE_SNAPSHOT_HASH_MISMATCH');
  }
}
function validateRestoreTrace(
  value: unknown,
  beforeStateHash: string,
  afterStateHash: string,
  mutationStages: readonly string[],
): JsonRecord[] {
  if (!Array.isArray(value)) fail('RESTORE_TRACE_INVALID');
  const trace = value.map((entry) => requireRecord(entry, 'RESTORE_TRACE_ENTRY_INVALID'));
  const expectedMutations = mutationStages.includes('FILTER')
    ? ['sync_cuts_to_beats', 'set_keyframes', 'apply_filter']
    : mutationStages.includes('KEYFRAMES')
      ? ['sync_cuts_to_beats', 'set_keyframes']
      : mutationStages.includes('SYNC') ? ['sync_cuts_to_beats'] : [];
  let priorTurn = 0;
  let priorStateHash = beforeStateHash;
  const actualMutations: string[] = [];
  for (const entry of trace) {
    const turn = number(entry.turn);
    const operatorId = text(entry.operatorId);
    if (!Number.isSafeInteger(turn) || turn <= priorTurn
      || !OWNED_OPERATOR_IDS.has(operatorId)
      || !['OK', 'FAIL', 'CONFLICT'].includes(text(entry.disposition))
      || !isSha256(entry.argumentHash)
      || !isSha256(entry.beforeStateHash) || !isSha256(entry.afterStateHash)
      || entry.beforeStateHash !== priorStateHash) {
      fail('RESTORE_TRACE_CHAIN_INVALID');
    }
    const mutating = MUTATING_OPERATOR_IDS.has(operatorId)
      && entry.disposition === 'OK';
    if (!mutating && entry.afterStateHash !== entry.beforeStateHash) {
      fail('RESTORE_TRACE_READ_MUTATED_STATE');
    }
    if (mutating) actualMutations.push(operatorId);
    if (entry.disposition === 'OK' && !isSha256(entry.outputHash)) {
      fail('RESTORE_TRACE_OUTPUT_HASH_INVALID');
    }
    priorTurn = turn;
    priorStateHash = text(entry.afterStateHash);
  }
  if (priorStateHash !== afterStateHash || !same(actualMutations, expectedMutations)) {
    fail('RESTORE_TRACE_MUTATION_PREFIX_MISMATCH');
  }
  return trace;
}
function isSha256(value: unknown): value is string {
  return typeof value === 'string' && /^[a-f0-9]{64}$/.test(value);
}
const OWNED_OPERATOR_IDS = new Set([
  'find_audio_moment', 'find_visual_moment', 'sync_cuts_to_beats',
  'resolve_keyframe_edit', 'set_keyframes', 'apply_filter',
]);
const MUTATING_OPERATOR_IDS = new Set([
  'sync_cuts_to_beats', 'set_keyframes', 'apply_filter',
]);
function fail(code: string): never { throw new Error(`STAGE25_DEPENDENCY_OWNER_${code}`); }
