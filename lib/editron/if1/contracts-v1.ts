/**
 * Editron Interface Freeze 1 (IF1).
 *
 * This is a vocabulary-only boundary. It neither admits commands nor writes
 * projects. Existing runtime owners remain authoritative until each path is
 * deliberately migrated through an owner adapter.
 */

import { createHash } from 'node:crypto';

export type CanonicalJsonValueV1 =
  | null
  | boolean
  | number
  | string
  | readonly CanonicalJsonValueV1[]
  | { readonly [key: string]: CanonicalJsonValueV1 };

export interface ActorRefV1 {
  readonly schemaVersion: 1;
  readonly kind: 'user' | 'service' | 'worker';
  readonly actorId: string;
  readonly organizationId?: string;
}

/** Opaque IF2/IF3 carrier. Its `kind` and `locator` disclose no domain schema. */
export interface ExternalReferenceV1 {
  readonly schemaVersion: 1;
  readonly kind: 'external';
  readonly locator: string;
  readonly version?: string;
}

declare const projectRevisionRefBrandV1: unique symbol;

/**
 * Consumers may compare or relay this token, but only ProjectService may issue
 * or decode it. Numeric counters and updatedAt stay local.
 */
export type ProjectRevisionRefV1 = Readonly<{
  readonly schemaVersion: 1;
  readonly token: string;
  readonly [projectRevisionRefBrandV1]: 'ProjectRevisionRefV1';
}>;

export interface TimelineRevisionRefV1 {
  readonly schemaVersion: 1;
  /** Equality of this token means semantic projection equality. */
  readonly projectionToken: string;
  /** Provenance only. It is not a timeline persistence-CAS token. */
  readonly basisProjectRevision: ProjectRevisionRefV1;
}

export interface CoordinateSpaceV1 {
  readonly schemaVersion: 1;
  readonly timebase: {
    readonly kind: 'frames';
    readonly framesPerSecond: number;
  };
}

/** A frame range is always paired with its versioned coordinate space. */
export interface TimelineFrameRangeV1 {
  readonly schemaVersion: 1;
  readonly coordinateSpace: CoordinateSpaceV1;
  readonly startFrame: number;
  readonly endFrameExclusive: number;
}

export interface TargetSelectorV1 {
  readonly schemaVersion: 1;
  readonly kind: 'overlay-id' | 'project-field' | 'timeline-range';
  readonly selector: string;
  readonly range?: TimelineFrameRangeV1;
}

export interface ResolvedTargetV1 {
  readonly schemaVersion: 1;
  readonly selector: TargetSelectorV1;
  readonly targetId: string;
  readonly resolvedAtProjectRevision: ProjectRevisionRefV1;
  readonly resolvedAtTimelineRevision?: TimelineRevisionRefV1;
}

export interface CanonicalCommandHashV1 {
  readonly schemaVersion: 1;
  readonly algorithm: 'sha256';
  readonly canonicalization: 'editron-command-json-v1';
  readonly value: string;
}

/**
 * Cross-entry intent. Authorization, replay ownership, and persistence remain
 * outside this structure with the existing authenticated project owners.
 */
export interface PostCommandIRV1 {
  readonly schemaVersion: 1;
  readonly commandType: string;
  readonly actor: ActorRefV1;
  readonly projectId: string;
  readonly target: TargetSelectorV1;
  readonly parameters: CanonicalJsonValueV1;
  readonly coordinateSpace?: CoordinateSpaceV1;
  readonly expectedProjectRevision?: ProjectRevisionRefV1;
  readonly expectedTimelineRevision?: TimelineRevisionRefV1;
  readonly operationId?: string;
}

export interface CheckpointRefV1 {
  readonly schemaVersion: 1;
  readonly checkpointId: string;
  readonly projectId: string;
}

export interface UndoReferenceV1 {
  readonly schemaVersion: 1;
  readonly checkpoint: CheckpointRefV1;
  /** Writer-issued R_after required by Phase 2C restore safety. */
  readonly expectedCurrentProjectRevision: ProjectRevisionRefV1;
}

export interface ProofObligationV1 {
  readonly schemaVersion: 1;
  readonly obligationId: string;
  readonly required: boolean;
  readonly externalReferences?: readonly ExternalReferenceV1[];
}

export interface OutcomeProofRequestV1 {
  readonly schemaVersion: 1;
  readonly transactionId: string;
  readonly obligations: readonly ProofObligationV1[];
}

export type OutcomeProofStatusV1 = 'PASS' | 'FAIL' | 'UNVERIFIABLE' | 'NOT_REQUIRED';

export interface OutcomeProofV1 {
  readonly schemaVersion: 1;
  readonly obligationId: string;
  readonly status: OutcomeProofStatusV1;
  readonly externalReferences?: readonly ExternalReferenceV1[];
}

export type RetryDispositionV1 =
  | 'DO_NOT_RETRY'
  | 'RELOAD_PROJECT_AND_REPLAN'
  | 'RELOAD_TIMELINE_AND_RESOLVE'
  | 'UNSAFE_UNDO';

export type TransactionOutcomeV1 =
  | { readonly kind: 'applied'; readonly retryDisposition: 'DO_NOT_RETRY' }
  | {
      readonly kind: 'stale-project-revision';
      readonly expected: ProjectRevisionRefV1;
      readonly current: ProjectRevisionRefV1;
      readonly zeroMutation: true;
      readonly retryDisposition: 'RELOAD_PROJECT_AND_REPLAN';
    }
  | {
      readonly kind: 'stale-timeline-resolution';
      readonly expected: TimelineRevisionRefV1;
      readonly current: TimelineRevisionRefV1;
      readonly zeroMutation: true;
      readonly retryDisposition: 'RELOAD_TIMELINE_AND_RESOLVE';
    }
  | {
      readonly kind: 'unsafe-undo';
      readonly code: 'unsafe-undo';
      readonly ownerCode: 'CHECKPOINT_RESTORE_UNSAFE_UNDO';
      readonly zeroMutation: true;
      readonly retryDisposition: 'UNSAFE_UNDO';
    };

export interface TransactionReceiptV1 {
  readonly schemaVersion: 1;
  readonly transactionId: string;
  readonly actor: ActorRefV1;
  readonly projectId: string;
  readonly commandHash: CanonicalCommandHashV1;
  readonly outcome: TransactionOutcomeV1;
  readonly projectRevisionAfter?: ProjectRevisionRefV1;
}

export interface IntegrationManifestV1 {
  readonly schemaVersion: 1;
  readonly artifactId: string;
  readonly baseSha: string;
  readonly contractVersion: 'if1-v1';
  readonly ownedFiles: readonly string[];
  readonly runtimeAdapters: readonly string[];
  readonly externalBoundary: 'ExternalReferenceV1';
  readonly prohibitedRuntimeAuthorities: readonly string[];
  readonly unmigratedProjectWriters: readonly string[];
  readonly migrationStatus: 'contract-freeze-candidate';
  readonly rollback: { readonly kind: 'git-revert'; readonly target: 'artifact-commit' };
}

/** Stable, versioned JSON serialization used before hashing IF1 command intent. */
export function canonicalizeJsonV1(value: CanonicalJsonValueV1): string {
  if (value === null || typeof value === 'boolean' || typeof value === 'number' || typeof value === 'string') {
    if (typeof value === 'number' && !Number.isFinite(value)) {
      throw new Error('IF1 canonical JSON rejects non-finite numbers.');
    }
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) return `[${value.map(canonicalizeJsonV1).join(',')}]`;
  const entries = Object.entries(value)
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([key, entryValue]) => `${JSON.stringify(key)}:${canonicalizeJsonV1(entryValue)}`);
  return `{${entries.join(',')}}`;
}

/** Actor, project, operation, and expected revision are intentionally not hash authority. */
export function canonicalCommandHashV1(command: PostCommandIRV1): CanonicalCommandHashV1 {
  const material: CanonicalJsonValueV1 = {
    commandType: command.commandType,
    coordinateSpace: (command.coordinateSpace ?? null) as unknown as CanonicalJsonValueV1,
    parameters: command.parameters,
    schemaVersion: command.schemaVersion,
    target: command.target as unknown as CanonicalJsonValueV1,
  };
  return {
    schemaVersion: 1,
    algorithm: 'sha256',
    canonicalization: 'editron-command-json-v1',
    value: createHash('sha256').update(canonicalizeJsonV1(material)).digest('hex'),
  };
}

/** A replay key is scoped data, never authentication or authorization. */
export function scopedReplayKeyV1(input: {
  readonly actor: ActorRefV1;
  readonly projectId: string;
  readonly operationId: string;
  readonly commandHash: CanonicalCommandHashV1;
}): string {
  return canonicalizeJsonV1({
    actorId: input.actor.actorId,
    actorKind: input.actor.kind,
    commandHash: input.commandHash.value,
    organizationId: input.actor.organizationId ?? null,
    operationId: input.operationId,
    projectId: input.projectId,
    schemaVersion: 1,
  });
}

export function createTimelineRevisionRefV1(input: {
  readonly semanticProjection: CanonicalJsonValueV1;
  readonly basisProjectRevision: ProjectRevisionRefV1;
}): TimelineRevisionRefV1 {
  return {
    schemaVersion: 1,
    projectionToken: `timeline-v1:${createHash('sha256')
      .update(canonicalizeJsonV1(input.semanticProjection))
      .digest('hex')}`,
    basisProjectRevision: input.basisProjectRevision,
  };
}

export function timelineRevisionEqualsV1(
  left: TimelineRevisionRefV1,
  right: TimelineRevisionRefV1,
): boolean {
  return left.projectionToken === right.projectionToken;
}

export function staleProjectRevisionOutcomeV1(
  expected: ProjectRevisionRefV1,
  current: ProjectRevisionRefV1,
): Extract<TransactionOutcomeV1, { kind: 'stale-project-revision' }> {
  return { kind: 'stale-project-revision', expected, current, zeroMutation: true, retryDisposition: 'RELOAD_PROJECT_AND_REPLAN' };
}

export function staleTimelineResolutionOutcomeV1(
  expected: TimelineRevisionRefV1,
  current: TimelineRevisionRefV1,
): Extract<TransactionOutcomeV1, { kind: 'stale-timeline-resolution' }> {
  return { kind: 'stale-timeline-resolution', expected, current, zeroMutation: true, retryDisposition: 'RELOAD_TIMELINE_AND_RESOLVE' };
}

export function unsafeUndoOutcomeV1(): Extract<TransactionOutcomeV1, { kind: 'unsafe-undo' }> {
  return {
    kind: 'unsafe-undo',
    code: 'unsafe-undo',
    ownerCode: 'CHECKPOINT_RESTORE_UNSAFE_UNDO',
    zeroMutation: true,
    retryDisposition: 'UNSAFE_UNDO',
  };
}

export function resolveOutcomeProofStatusV1(input: {
  readonly required: boolean;
  readonly observed?: Exclude<OutcomeProofStatusV1, 'NOT_REQUIRED'>;
}): OutcomeProofStatusV1 {
  if (!input.required) return 'NOT_REQUIRED';
  return input.observed ?? 'UNVERIFIABLE';
}
