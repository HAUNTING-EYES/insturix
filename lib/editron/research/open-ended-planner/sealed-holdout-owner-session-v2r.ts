import { deepFreezeV1, hashCanonicalJsonV1 } from './contracts-v1';
import { V2R_OPERATOR_CATALOG } from './operator-catalog-v2r';
import type { ProviderNativeToolExecutionV2R } from './provider-native-tool-episode-v2r';
import {
  assertSealedHoldoutCohortManifestV2R,
} from './sealed-holdout-cohort-v2r';

type JsonRecord = Record<string, unknown>;

export const SEALED_HOLDOUT_OWNER_SESSION_VERSION_V2R =
  'EDITRON_OE_SEALED_HOLDOUT_OWNER_SESSION_V2R_1' as const;

export interface SealedHoldoutOwnerSemanticPolicyV2R {
  version: string;
  operatorCatalog: Readonly<JsonRecord>;
  resolveVisualEdit?: (input: Readonly<{
    arguments: Readonly<JsonRecord>;
    observations: readonly Readonly<JsonRecord>[];
    evidenceRefs: readonly string[];
    project: Readonly<JsonRecord>;
    media: readonly Readonly<JsonRecord>[];
    currentProjectRevision: string;
  }>) => Readonly<JsonRecord>;
}

export interface SealedHoldoutOwnerManifestV2R {
  cases: readonly Readonly<{
    caseId: string;
    publicCase: Readonly<JsonRecord>;
    ownerOnly: Readonly<JsonRecord>;
  }>[];
}

export type SealedHoldoutOwnerManifestValidatorV2R = (
  candidate: unknown,
) => Readonly<SealedHoldoutOwnerManifestV2R>;

const READ_EVIDENCE_KINDS: Readonly<Record<string, readonly string[]>> = {
  read_project_file: ['PROJECT_REVISION', 'RIGHTS_POLICY', 'NARRATIVE', 'ASSET_MANIFEST'],
  get_timeline_view: ['TIMELINE', 'STALE_TIMELINE', 'CAPTION_STATE', 'AUTHORED_LAYOUT'],
  get_video_transcription: ['TRANSCRIPT'],
  find_transcript_moment: ['TRANSCRIPT'],
  find_visual_moment: ['VISUAL_WINDOWS', 'SOURCE_WINDOWS', 'REFERENCE_LAYOUT', 'FACE_TRACKS', 'SPATIAL_TRACK', 'VISUAL'],
  find_audio_moment: ['AUDIO', 'AUDIO_EVENTS', 'BEAT_GRID', 'TRANSCRIPT'],
  list_user_assets: ['ASSET_MANIFEST'],
  search_user_assets: ['ASSET_MANIFEST', 'SOURCE_WINDOWS'],
  inspect_user_asset: ['SOURCE_WINDOWS', 'VISUAL_WINDOWS', 'REFERENCE_LAYOUT', 'FACE_TRACKS', 'SPATIAL_TRACK', 'VISUAL'],
};

export class SealedHoldoutOwnerSessionV2R {
  private readonly caseId: string;
  private readonly project: Readonly<JsonRecord>;
  private readonly media: readonly Readonly<JsonRecord>[];
  private readonly evidence: readonly Readonly<JsonRecord>[];
  private readonly semanticPolicy?: Readonly<SealedHoldoutOwnerSemanticPolicyV2R>;
  private readonly operatorCatalog: Readonly<JsonRecord>;
  private readonly resolvedEvidenceRefs = new Set<string>();
  private readonly trace: JsonRecord[] = [];
  private currentRevision: string;
  private revisionKnown = true;

  constructor(input: {
    manifest: unknown;
    caseId: string;
    semanticPolicy?: Readonly<SealedHoldoutOwnerSemanticPolicyV2R>;
    manifestValidator?: SealedHoldoutOwnerManifestValidatorV2R;
  }) {
    const manifest = input.manifestValidator
      ? input.manifestValidator(input.manifest)
      : assertSealedHoldoutCohortManifestV2R(input.manifest);
    const taskCase = manifest.cases.find(({ caseId }) => caseId === input.caseId);
    if (!taskCase) fail(`SEALED_OWNER_CASE_MISSING:${input.caseId}`);
    this.caseId = taskCase.caseId;
    const publicCase = record(taskCase.publicCase);
    this.project = deepFreezeV1(record(publicCase.project));
    this.media = deepFreezeV1(records(publicCase.media));
    this.evidence = deepFreezeV1(records(record(taskCase.ownerOnly).evidence));
    this.semanticPolicy = input.semanticPolicy;
    this.operatorCatalog = input.semanticPolicy?.operatorCatalog ?? V2R_OPERATOR_CATALOG;
    this.currentRevision = text(this.project.expectedProjectRevision);
    const revisionEvidence = this.evidence.find(({ kind }) => kind === 'PROJECT_REVISION');
    const reportedCurrent = text(record(revisionEvidence?.value).currentRevision);
    if (reportedCurrent === 'UNKNOWN') this.revisionKnown = false;
    else if (reportedCurrent) this.currentRevision = reportedCurrent;
  }

  async execute(call: Readonly<{
    operatorId: string; arguments: Readonly<JsonRecord>; turn: number;
  }>): Promise<Readonly<ProviderNativeToolExecutionV2R>> {
    const beforeRevision = this.currentRevision;
    try {
      const operator = this.operator(call.operatorId);
      this.assertProjectBinding(call.operatorId, call.arguments, text(operator.kind));
      const execution = text(operator.kind) === 'READ'
        ? this.executeRead(call.operatorId, call.arguments)
        : text(operator.kind) === 'RESOLVER'
          ? this.executeResolver(call.operatorId, call.arguments)
          : text(operator.kind) === 'GENERATED_COMPOSITION'
            ? this.executeGenerated(call.operatorId, call.arguments)
            : this.executeMutation(call.operatorId, call.arguments, call.turn);
      this.trace.push({
        turn: call.turn, operatorId: call.operatorId, disposition: execution.disposition,
        argumentSha256: hashCanonicalJsonV1(call.arguments), beforeRevision,
        afterRevision: this.currentRevision, outputSha256: hashCanonicalJsonV1(execution.output),
      });
      return deepFreezeV1(execution);
    } catch (error) {
      const message = errorMessage(error);
      const conflictEvidenceIds = message.includes('REVISION_CONFLICT')
        ? this.evidence.filter(({ kind }) => kind === 'PROJECT_REVISION')
          .map(({ evidenceRef }) => text(evidenceRef))
        : [];
      conflictEvidenceIds.forEach((evidenceRef) => this.resolvedEvidenceRefs.add(evidenceRef));
      const disposition = message.includes('CONFLICT') ? 'CONFLICT'
        : message.includes('UNVERIFIABLE') || message.includes('EVIDENCE_')
          ? 'UNVERIFIABLE' : 'FAIL';
      this.trace.push({
        turn: call.turn, operatorId: call.operatorId, disposition,
        argumentSha256: hashCanonicalJsonV1(call.arguments), beforeRevision,
        afterRevision: this.currentRevision, error: message,
      });
      return deepFreezeV1({
        authority: 'RESEARCH_ISOLATED_NO_PROJECT_MUTATION' as const,
        disposition,
        output: {
          code: message.split(':', 1)[0] || 'SEALED_OWNER_EXECUTION_FAILED',
          message,
          details: { currentProjectRevision: this.revisionKnown ? this.currentRevision : 'UNKNOWN' },
        },
        evidenceIds: conflictEvidenceIds,
      });
    }
  }

  snapshot(): Readonly<JsonRecord> {
    return deepFreezeV1({
      version: SEALED_HOLDOUT_OWNER_SESSION_VERSION_V2R,
      authority: 'RESEARCH_ISOLATED_OPERATION_LOG_NO_PROJECT_MUTATION',
      caseId: this.caseId, currentProjectRevision: this.currentRevision,
      revisionKnown: this.revisionKnown,
      resolvedEvidenceRefs: [...this.resolvedEvidenceRefs].sort(compareUtf16),
      trace: clone(this.trace), stateEffects: [],
    });
  }

  private executeRead(operatorId: string, args: Readonly<JsonRecord>): ProviderNativeToolExecutionV2R {
    const selected = this.selectEvidence(operatorId, strings(args.evidenceIds));
    const observations = selected.map(publicEvidence);
    const evidence = { authority: 'OWNER_RESOLVED_EVIDENCE', observations };
    if (!selected.length && !['read_project_file', 'get_timeline_view', 'list_user_assets', 'search_user_assets'].includes(operatorId)) {
      fail(`SEALED_OWNER_EVIDENCE_UNAVAILABLE:${operatorId}`);
    }
    selected.forEach((entry) => this.resolvedEvidenceRefs.add(text(entry.evidenceRef)));
    let output: JsonRecord;
    if (['list_user_assets', 'search_user_assets'].includes(operatorId)) {
      output = { assets: clone(this.media), evidence };
    } else {
      const result = {
        project: this.project, observations,
        overlayIdentityMap: buildOverlayIdentityMap(observations),
      };
      output = { result, evidence };
      if (operatorId === 'find_visual_moment') {
        output = {
          ...output, overlayId: 0, targetFrame: deriveTargetFrame(observations),
          focalPoint: deriveFocalPoint(observations),
          evidenceStrength: deriveEvidenceStrength(observations),
        };
      }
    }
    return ok(output, selected.map((entry) => text(entry.evidenceRef)));
  }

  private executeResolver(operatorId: string, args: Readonly<JsonRecord>): ProviderNativeToolExecutionV2R {
    const evidenceRefs = strings(args.evidenceIds);
    this.assertResolvedEvidence(evidenceRefs);
    const observations = this.evidence
      .filter((entry) => !evidenceRefs.length || evidenceRefs.includes(text(entry.evidenceRef)))
      .map(publicEvidence);
    const common = {
      projectId: args.projectId, expectedProjectRevision: this.currentRevision,
      evidenceIds: evidenceRefs,
    };
    let proposedOperation: JsonRecord;
    if (operatorId === 'resolve_transcript_edit') {
      proposedOperation = { targetOperatorId: 'cut_section', arguments: {
        ...common, targetRange: requireResolvedRange(observations),
      } };
    } else if (operatorId === 'resolve_user_asset_overlay') {
      if (!this.resolvedEvidenceRefs.size) fail('SEALED_OWNER_EVIDENCE_UNRESOLVED');
      proposedOperation = { targetOperatorId: 'add_overlay', arguments: {
        projectId: args.projectId, expectedProjectRevision: this.currentRevision,
        assetId: args.assetId, targetRange: args.targetRange,
        ...(args.constraints ? { constraints: args.constraints } : {}),
      } };
    } else if (operatorId === 'resolve_visual_edit') {
      const intent = record(args.intent);
      proposedOperation = this.semanticPolicy?.resolveVisualEdit
        ? this.semanticPolicy.resolveVisualEdit({
          arguments: args, observations, evidenceRefs,
          project: this.project, media: this.media,
          currentProjectRevision: this.currentRevision,
        })
        : intent.action === 'cut_range'
        ? { targetOperatorId: 'cut_section', arguments: {
            ...common, targetRange: requireResolvedRange(observations),
          } }
        : intent.action === 'inspect'
          ? { targetOperatorId: 'find_visual_moment', arguments: {
              projectId: args.projectId, query: intent.query, evidenceIds: evidenceRefs,
            } }
          : fail(`SEALED_OWNER_RESOLVER_FORM_UNVERIFIABLE:${operatorId}`);
    } else {
      fail(`SEALED_OWNER_RESOLVER_FORM_UNVERIFIABLE:${operatorId}`);
    }
    return ok({ proposedOperation, evidence: { observations } }, evidenceRefs);
  }

  private executeGenerated(operatorId: string, args: Readonly<JsonRecord>): ProviderNativeToolExecutionV2R {
    this.assertResolvedEvidence(strings(args.evidenceIds));
    this.assertKnownAssets(strings(args.assetIds));
    this.assertRange(args.targetRange);
    return ok({
      codeBundle: { status: 'NOT_COMPILED', operatorId, inputSha256: hashCanonicalJsonV1(args) },
      renderContract: { status: 'PENDING_SANDBOX', projectMutation: 'NONE' },
      cueMap: [],
      proofPlan: { required: ['compile', 'bounded-render', 'visual', 'continuity'], status: 'NOT_RUN' },
    }, strings(args.evidenceIds));
  }

  private executeMutation(
    operatorId: string, args: Readonly<JsonRecord>, turn: number,
  ): ProviderNativeToolExecutionV2R {
    if (!this.revisionKnown) fail(`SEALED_OWNER_REVISION_UNVERIFIABLE:${operatorId}`);
    if (!this.resolvedEvidenceRefs.size) fail(`SEALED_OWNER_EVIDENCE_UNRESOLVED:${operatorId}`);
    this.assertResolvedEvidence(strings(args.evidenceIds));
    if (typeof args.assetId === 'string') this.assertKnownAssets([args.assetId]);
    this.assertRange(args.targetRange);
    const beforeRevision = this.currentRevision;
    this.currentRevision = `OE-HOLD-${hashCanonicalJsonV1({
      authority: 'RESEARCH_ISOLATED_WRITER_REVISION_V2R', beforeRevision,
      operatorId, arguments: args, turn,
    })}`;
    const receipt = {
      status: 'PASS', projectRevision: this.currentRevision,
      proof: {
        authority: 'RESEARCH_CLONE_OPERATION_LOG_ONLY', operatorId,
        acceptedArgumentsSha256: hashCanonicalJsonV1(args), renderedProof: 'NOT_RUN',
      },
    };
    if (operatorId === 'cut_section') {
      const range = record(args.targetRange);
      const beforeDurationInFrames = number(this.project.durationFrames);
      const removed = number(range.endFrame) - number(range.startFrame);
      return ok({
        receipt,
        timelineCoordinateTransform: {
          schemaVersion: 'EDITRON_TIMELINE_RANGE_CUT_COORDINATE_TRANSFORM_V1',
          beforeDurationInFrames, afterDurationInFrames: beforeDurationInFrames - removed,
          removedRange: range, shiftAfterRemovedRangeFrames: -removed,
          mapRule: 'HALF_OPEN_REMOVE_AND_SHIFT_LEFT_V1',
        },
        splitChildren: [],
      }, strings(args.evidenceIds));
    }
    if (operatorId === 'sync_cuts_to_beats') {
      return ok({ receipt, result: { ...record(args.beatPlan), status: 'ACCEPTED_FOR_PROOF' } }, strings(args.evidenceIds));
    }
    return ok({ receipt }, strings(args.evidenceIds));
  }

  private operator(operatorId: string): JsonRecord {
    const operator = records(this.operatorCatalog.operators)
      .find((entry) => entry.operatorId === operatorId);
    if (!operator || operator.compilerEligibility === 'NOT_COMPILABLE') {
      fail(`SEALED_OWNER_OPERATOR_FORBIDDEN:${operatorId}`);
    }
    return operator;
  }

  private assertProjectBinding(operatorId: string, args: Readonly<JsonRecord>, kind: string): void {
    if (args.projectId !== this.project.projectId) fail(`SEALED_OWNER_PROJECT_CONFLICT:${operatorId}`);
    if (args.expectedProjectRevision !== undefined
      && args.expectedProjectRevision !== this.currentRevision) {
      fail(`SEALED_OWNER_REVISION_CONFLICT:${operatorId}`);
    }
    if (!this.revisionKnown && kind !== 'READ') fail(`SEALED_OWNER_REVISION_UNVERIFIABLE:${operatorId}`);
  }

  private selectEvidence(operatorId: string, requested: readonly string[]): JsonRecord[] {
    if (requested.some((ref) => !this.evidence.some((entry) => entry.evidenceRef === ref))) {
      fail(`SEALED_OWNER_EVIDENCE_REF_UNKNOWN:${operatorId}`);
    }
    const kinds = READ_EVIDENCE_KINDS[operatorId] ?? [];
    return this.evidence.filter((entry) => kinds.includes(text(entry.kind))
      && (!requested.length || requested.includes(text(entry.evidenceRef))));
  }

  private assertResolvedEvidence(refs: readonly string[]): void {
    if (refs.some((ref) => !this.resolvedEvidenceRefs.has(ref))) {
      fail('SEALED_OWNER_EVIDENCE_UNRESOLVED');
    }
  }

  private assertKnownAssets(assetIds: readonly string[]): void {
    const known = new Set(this.media.map(({ assetId }) => text(assetId)));
    if (assetIds.some((assetId) => !known.has(assetId))) fail('SEALED_OWNER_ASSET_UNKNOWN');
  }

  private assertRange(value: unknown): void {
    if (value === undefined) return;
    const range = record(value);
    const start = number(range.startFrame);
    const end = number(range.endFrame);
    if (start < 0 || end <= start || end > number(this.project.durationFrames)) {
      fail('SEALED_OWNER_RANGE_INVALID');
    }
  }
}

function ok(output: JsonRecord, evidenceIds: readonly string[]): ProviderNativeToolExecutionV2R {
  return { authority: 'RESEARCH_ISOLATED_NO_PROJECT_MUTATION', disposition: 'OK', output, evidenceIds };
}
function publicEvidence(entry: Readonly<JsonRecord>): JsonRecord { return { evidenceRef: entry.evidenceRef, kind: entry.kind, binding: entry.binding, value: clone(entry.value) }; }
function buildOverlayIdentityMap(value: unknown): JsonRecord { const refs = [...collectStringsForKeys(value, new Set(['overlayId', 'outgoingOverlayId', 'incomingOverlayId', 'returnOverlayId', 'logoOverlayId', 'middleOverlayId']))].sort(compareUtf16); return Object.fromEntries(refs.map((ref, index) => [ref, index])); }
function deriveTargetFrame(value: unknown): number { return findNumberForKeys(value, ['boundaryFrame', 'targetFrame', 'revealFrame']) ?? findNumberArrayForKey(value, 'trackFrames')?.[0] ?? findRangePair(value)?.[0] ?? 0; }
function deriveFocalPoint(value: unknown): JsonRecord { const centres = findNumberArrayForKey(value, 'centersX'); return { x: centres?.[0] ?? 0.5, y: 0.5 }; }
function deriveEvidenceStrength(value: unknown): number { return findNumberForKeys(value, ['confidence']) ?? 1; }
function requireResolvedRange(value: unknown): { startFrame: number; endFrame: number } { const pair = findRangePair(value); if (!pair) fail('SEALED_OWNER_RANGE_EVIDENCE_UNVERIFIABLE'); return { startFrame: pair[0], endFrame: pair[1] }; }
function findRangePair(value: unknown): [number, number] | null { if (Array.isArray(value) && value.length === 2 && value.every(Number.isSafeInteger) && value[1] > value[0]) return value as [number, number]; if (Array.isArray(value)) { for (const child of value) { const found = findRangePair(child); if (found) return found; } } else if (isRecord(value)) { for (const child of Object.values(value)) { const found = findRangePair(child); if (found) return found; } } return null; }
function findNumberForKeys(value: unknown, keys: readonly string[]): number | null { if (!isRecord(value) && !Array.isArray(value)) return null; if (isRecord(value)) { for (const key of keys) if (typeof value[key] === 'number') return value[key] as number; for (const child of Object.values(value)) { const found = findNumberForKeys(child, keys); if (found !== null) return found; } } else for (const child of value) { const found = findNumberForKeys(child, keys); if (found !== null) return found; } return null; }
function findNumberArrayForKey(value: unknown, key: string): number[] | null { if (isRecord(value) && Array.isArray(value[key]) && (value[key] as unknown[]).every((entry) => typeof entry === 'number')) return value[key] as number[]; for (const child of isRecord(value) ? Object.values(value) : Array.isArray(value) ? value : []) { const found = findNumberArrayForKey(child, key); if (found) return found; } return null; }
function collectStringsForKeys(value: unknown, keys: ReadonlySet<string>, found = new Set<string>()): Set<string> { if (isRecord(value)) for (const [key, child] of Object.entries(value)) { if (keys.has(key) && typeof child === 'string') found.add(child); collectStringsForKeys(child, keys, found); } else if (Array.isArray(value)) value.forEach((child) => collectStringsForKeys(child, keys, found)); return found; }
function errorMessage(error: unknown): string { return error instanceof Error ? error.message : 'Unknown sealed owner error'; }
function fail(code: string): never { throw new Error(code); }
function isRecord(value: unknown): value is JsonRecord { return Boolean(value) && typeof value === 'object' && !Array.isArray(value); }
function record(value: unknown): JsonRecord { return isRecord(value) ? value : {}; }
function records(value: unknown): JsonRecord[] { return Array.isArray(value) ? value.filter(isRecord) : []; }
function strings(value: unknown): string[] { return Array.isArray(value) ? value.filter((entry): entry is string => typeof entry === 'string') : []; }
function text(value: unknown): string { return typeof value === 'string' ? value : ''; }
function number(value: unknown): number { return typeof value === 'number' && Number.isFinite(value) ? value : 0; }
function compareUtf16(left: string, right: string): number { return left < right ? -1 : left > right ? 1 : 0; }
function clone<T>(value: T): T { return structuredClone(value); }
