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

/** Opaque IF2/IF3 carrier. Its fields disclose no domain schema. */
export interface ExternalReferenceV1 {
  readonly schemaVersion: 1;
  readonly kind: 'external';
  readonly locator: string;
  readonly version?: string;
}

declare const projectRevisionRefBrandV1: unique symbol;

/**
 * ProjectService alone issues and decodes this reference. Consumers may only
 * store, relay, and compare its identity; numeric counters and updatedAt stay
 * inside ProjectService.
 */
export type ProjectRevisionRefV1 = Readonly<{
  readonly schemaVersion: 1;
  readonly projectId: string;
  readonly issuer: {
    readonly id: 'project-service';
    readonly contractVersion: 1;
  };
  readonly token: string;
  readonly [projectRevisionRefBrandV1]: 'ProjectRevisionRefV1';
}>;

/**
 * Projection equality is project- and projection-owner-scoped. Its token is
 * semantic identity; basisProjectRevision records provenance only.
 */
export interface TimelineRevisionRefV1 {
  readonly schemaVersion: 1;
  readonly projectId: string;
  readonly projectionOwner: string;
  readonly projectionToken: string;
  readonly basisProjectRevision: ProjectRevisionRefV1;
}

/** Versioned, project-scoped identity for timeline-frame coordinates. */
export interface TimelineTimebaseRefV1 {
  readonly schemaVersion: 1;
  readonly projectId: string;
  readonly timebaseId: string;
  readonly version: string;
}

export interface CoordinateSpaceV1 {
  readonly schemaVersion: 1;
  readonly kind: 'timeline-frame';
  readonly timebase: TimelineTimebaseRefV1;
}

/** A range is frame-based only and always carries a versioned timebase. */
export interface TimelineFrameRangeV1 {
  readonly schemaVersion: 1;
  readonly coordinateSpace: CoordinateSpaceV1;
  readonly startFrame: number;
  readonly endFrameExclusive: number;
}

export type TargetSelectorV1 =
  | {
      readonly schemaVersion: 1;
      readonly kind: 'overlay-id' | 'project-field';
      readonly selector: string;
    }
  | {
      readonly schemaVersion: 1;
      readonly kind: 'timeline-range';
      readonly range: TimelineFrameRangeV1;
    };

export interface ResolvedTargetV1 {
  readonly schemaVersion: 1;
  readonly selector: TargetSelectorV1;
  readonly targetId: string;
  readonly resolvedAtProjectRevision: ProjectRevisionRefV1;
  readonly resolvedAtTimelineRevision?: TimelineRevisionRefV1;
}

export interface CanonicalCommandHashV1 {
  readonly schemaVersion: 1;
  readonly algorithm: 'sha-256';
  readonly canonicalization: 'editron-canonical-json-v1';
  readonly value: string;
}

export type CoreProofObligationKindV1 =
  | 'core:state'
  | 'core:reload'
  | 'core:target'
  | 'render:render'
  | 'render:visual'
  | 'render:audio'
  | 'semantic:semantic'
  | 'transaction:undo'
  | 'transaction:replay'
  | 'delivery:delivery';

/** Namespaced extensions remain possible without freezing IF2/IF3 internals. */
export type ProofObligationKindV1 = CoreProofObligationKindV1 | `${string}:${string}`;

export interface ProofObligationV1 {
  readonly schemaVersion: 1;
  readonly obligationId: string;
  readonly kind: ProofObligationKindV1;
  readonly required: boolean;
  readonly externalReferences?: readonly ExternalReferenceV1[];
}

export type OutcomeProofRequirementV1 = 'required' | 'not-required';

export interface OutcomeProofRequestV1 {
  readonly schemaVersion: 1;
  readonly requirement: OutcomeProofRequirementV1;
  readonly obligations: readonly ProofObligationV1[];
}

export type OutcomeProofStatusV1 = 'PASS' | 'FAIL' | 'UNVERIFIABLE';

export interface OutcomeProofObservationV1 {
  readonly obligationId: string;
  readonly status: OutcomeProofStatusV1;
  readonly externalReferences?: readonly ExternalReferenceV1[];
}

export interface OutcomeProofV1 {
  readonly schemaVersion: 1;
  readonly status: OutcomeProofStatusV1;
  readonly observations: readonly OutcomeProofObservationV1[];
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
  readonly operationId: string;
  readonly target: TargetSelectorV1;
  readonly parameters: CanonicalJsonValueV1;
  readonly coordinateSpace: CoordinateSpaceV1 | null;
  readonly expectedProjectRevision: ProjectRevisionRefV1 | null;
  /** Resolution precondition only; it is never a second persistence CAS. */
  readonly expectedTimelineRevision: TimelineRevisionRefV1 | null;
  readonly externalReferences: readonly ExternalReferenceV1[];
  readonly proof: OutcomeProofRequestV1;
  readonly failurePolicy: 'reject-with-zero-project-mutation';
}

export interface CheckpointRefV1 {
  readonly schemaVersion: 1;
  readonly checkpointId: string;
  readonly projectId: string;
}

/** The undo request binds an original receipt, checkpoint, and CAS precondition. */
export interface UndoReferenceV1 {
  readonly schemaVersion: 1;
  readonly originalReceiptId: string;
  readonly checkpoint: CheckpointRefV1;
  readonly expectedCurrentProjectRevision: ProjectRevisionRefV1;
}

export type RetryDispositionV1 =
  | 'never'
  | 'after-reload'
  | 'after-reresolve'
  | 'transient-same-command';

export type TransactionOutcomeV1 =
  | { readonly kind: 'applied'; readonly retryDisposition: 'never' }
  | {
      readonly kind: 'stale-project-revision';
      readonly expected: ProjectRevisionRefV1;
      readonly current: ProjectRevisionRefV1;
      readonly zeroMutation: true;
      readonly retryDisposition: 'after-reload';
    }
  | {
      readonly kind: 'stale-timeline-resolution';
      readonly expected: TimelineRevisionRefV1;
      readonly current: TimelineRevisionRefV1;
      readonly zeroMutation: true;
      readonly retryDisposition: 'after-reresolve';
    }
  | {
      readonly kind: 'transient-executor-failure';
      readonly zeroMutation: true;
      readonly retryDisposition: 'transient-same-command';
    }
  | {
      readonly kind: 'unsafe-undo';
      readonly code: 'unsafe-undo';
      readonly ownerCode: 'CHECKPOINT_RESTORE_UNSAFE_UNDO';
      readonly zeroMutation: true;
      readonly retryDisposition: 'never';
    };

export interface TransactionReceiptV1 {
  readonly schemaVersion: 1;
  readonly receiptId: string;
  readonly operationId: string;
  readonly actor: ActorRefV1;
  readonly projectId: string;
  readonly commandHash: CanonicalCommandHashV1;
  readonly outcome: TransactionOutcomeV1;
  readonly beforeProjectRevision: ProjectRevisionRefV1 | null;
  /** Never carries a conflict's current revision. */
  readonly afterProjectRevision: ProjectRevisionRefV1 | null;
  /** Set only when an owner returns a current revision for a conflict. */
  readonly currentProjectRevision: ProjectRevisionRefV1 | null;
  readonly beforeTimelineRevision: TimelineRevisionRefV1 | null;
  readonly afterTimelineRevision: TimelineRevisionRefV1 | null;
  readonly beforeCheckpoint: CheckpointRefV1 | null;
  readonly undoReference: UndoReferenceV1 | null;
  readonly changedPaths: readonly string[];
  readonly proofRequirement: OutcomeProofRequirementV1;
  readonly proof: OutcomeProofV1 | null;
}

export interface IntegrationManifestV1 {
  readonly schemaVersion: 1;
  readonly artifactId: string;
  readonly baseSha: string;
  readonly contractVersion: 'if1-v1';
  readonly ownedFiles: readonly string[];
  readonly ownerBoundaryPorts: readonly string[];
  readonly externalBoundary: 'ExternalReferenceV1';
  readonly prohibitedRuntimeAuthorities: readonly string[];
  readonly unmigratedProjectWriters: readonly string[];
  readonly migrationStatus: 'contract-freeze-candidate';
  readonly rollback: { readonly kind: 'git-revert'; readonly target: 'artifact-commit' };
}

function compareCanonicalStringsV1(left: string, right: string): number {
  return left === right ? 0 : left < right ? -1 : 1;
}

/**
 * Stable JSON serialization for IF1 hashing. Strings and object keys are NFC
 * normalized, keys use code-unit ordering, and normalization collisions fail.
 */
export function canonicalizeJsonV1(value: CanonicalJsonValueV1): string {
  if (value === null || typeof value === 'boolean') return JSON.stringify(value);
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) throw new Error('IF1 canonical JSON rejects non-finite numbers.');
    return Object.is(value, -0) ? '0' : JSON.stringify(value);
  }
  if (typeof value === 'string') return JSON.stringify(value.normalize('NFC'));
  if (Array.isArray(value)) return `[${value.map(canonicalizeJsonV1).join(',')}]`;

  const entries = Object.entries(value)
    .map(([key, entryValue]) => [key.normalize('NFC'), entryValue] as const)
    .sort(([left], [right]) => compareCanonicalStringsV1(left, right));
  for (let index = 1; index < entries.length; index += 1) {
    if (entries[index - 1][0] === entries[index][0]) {
      throw new Error('IF1 canonical JSON rejects keys that collide after NFC normalization.');
    }
  }
  return `{${entries.map(([key, entryValue]) => `${JSON.stringify(key)}:${canonicalizeJsonV1(entryValue)}`).join(',')}}`;
}

function canonicalizeExternalReferencesV1(
  references: readonly ExternalReferenceV1[],
): readonly CanonicalJsonValueV1[] {
  return references
    .map((reference) => ({
      schemaVersion: reference.schemaVersion,
      kind: reference.kind,
      locator: reference.locator,
      version: reference.version ?? null,
    }) as CanonicalJsonValueV1)
    .sort((left, right) => compareCanonicalStringsV1(canonicalizeJsonV1(left), canonicalizeJsonV1(right)));
}

function canonicalizeProofRequestV1(request: OutcomeProofRequestV1): CanonicalJsonValueV1 {
  const obligations = request.obligations
    .map((obligation) => ({
      schemaVersion: obligation.schemaVersion,
      obligationId: obligation.obligationId,
      kind: obligation.kind,
      required: obligation.required,
      externalReferences: canonicalizeExternalReferencesV1(obligation.externalReferences ?? []),
    }) as CanonicalJsonValueV1)
    .sort((left, right) => compareCanonicalStringsV1(canonicalizeJsonV1(left), canonicalizeJsonV1(right)));
  return { schemaVersion: request.schemaVersion, requirement: request.requirement, obligations };
}

function canonicalizeTimelineRevisionPreconditionV1(
  reference: TimelineRevisionRefV1 | null,
): CanonicalJsonValueV1 {
  if (reference === null) return null;
  return {
    schemaVersion: reference.schemaVersion,
    projectId: reference.projectId,
    projectionOwner: reference.projectionOwner,
    projectionToken: reference.projectionToken,
  };
}

/**
 * Hashes replay-relevant command intent independently of adapter JSON shape.
 * Actor and operation ID scope replay separately; project and expected state
 * are part of the command identity.
 */
export function canonicalCommandHashV1(command: PostCommandIRV1): CanonicalCommandHashV1 {
  const material: CanonicalJsonValueV1 = {
    schemaVersion: command.schemaVersion,
    commandType: command.commandType,
    projectId: command.projectId,
    target: command.target as unknown as CanonicalJsonValueV1,
    coordinateSpace: (command.coordinateSpace ?? null) as unknown as CanonicalJsonValueV1,
    parameters: command.parameters,
    expectedProjectRevision: (command.expectedProjectRevision ?? null) as unknown as CanonicalJsonValueV1,
    expectedTimelineRevision: canonicalizeTimelineRevisionPreconditionV1(command.expectedTimelineRevision),
    externalReferences: canonicalizeExternalReferencesV1(command.externalReferences),
    proof: canonicalizeProofRequestV1(command.proof),
    failurePolicy: command.failurePolicy,
  };
  return {
    schemaVersion: 1,
    algorithm: 'sha-256',
    canonicalization: 'editron-canonical-json-v1',
    value: `sha256:${createHash('sha256').update(canonicalizeJsonV1(material)).digest('hex')}`,
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
  readonly projectId: string;
  readonly projectionOwner: string;
  readonly semanticProjection: CanonicalJsonValueV1;
  readonly basisProjectRevision: ProjectRevisionRefV1;
}): TimelineRevisionRefV1 {
  if (input.basisProjectRevision.projectId !== input.projectId) {
    throw new Error('TimelineRevisionRefV1 projectId must match its ProjectRevision provenance.');
  }
  const projectionIdentity: CanonicalJsonValueV1 = {
    projectId: input.projectId,
    projectionOwner: input.projectionOwner,
    semanticProjection: input.semanticProjection,
  };
  return {
    schemaVersion: 1,
    projectId: input.projectId,
    projectionOwner: input.projectionOwner,
    projectionToken: `timeline-v1:${createHash('sha256')
      .update(canonicalizeJsonV1(projectionIdentity))
      .digest('hex')}`,
    basisProjectRevision: input.basisProjectRevision,
  };
}

export function timelineRevisionEqualsV1(
  left: TimelineRevisionRefV1,
  right: TimelineRevisionRefV1,
): boolean {
  return left.projectId === right.projectId
    && left.projectionOwner === right.projectionOwner
    && left.projectionToken === right.projectionToken;
}

export function staleProjectRevisionOutcomeV1(
  expected: ProjectRevisionRefV1,
  current: ProjectRevisionRefV1,
): Extract<TransactionOutcomeV1, { kind: 'stale-project-revision' }> {
  return { kind: 'stale-project-revision', expected, current, zeroMutation: true, retryDisposition: 'after-reload' };
}

export function staleTimelineResolutionOutcomeV1(
  expected: TimelineRevisionRefV1,
  current: TimelineRevisionRefV1,
): Extract<TransactionOutcomeV1, { kind: 'stale-timeline-resolution' }> {
  return { kind: 'stale-timeline-resolution', expected, current, zeroMutation: true, retryDisposition: 'after-reresolve' };
}

export function transientSameCommandFailureOutcomeV1(): Extract<TransactionOutcomeV1, { kind: 'transient-executor-failure' }> {
  return { kind: 'transient-executor-failure', zeroMutation: true, retryDisposition: 'transient-same-command' };
}

export function unsafeUndoOutcomeV1(): Extract<TransactionOutcomeV1, { kind: 'unsafe-undo' }> {
  return {
    kind: 'unsafe-undo',
    code: 'unsafe-undo',
    ownerCode: 'CHECKPOINT_RESTORE_UNSAFE_UNDO',
    zeroMutation: true,
    retryDisposition: 'never',
  };
}

/** A not-required policy has no proof result; it is never a passing proof. */
export function resolveOutcomeProofStatusV1(input: {
  readonly requirement: OutcomeProofRequirementV1;
  readonly observed?: OutcomeProofStatusV1;
}): OutcomeProofStatusV1 | null {
  if (input.requirement === 'not-required') return null;
  return input.observed ?? 'UNVERIFIABLE';
}
