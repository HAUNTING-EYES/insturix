import { hashCanonicalJsonV1 } from './contracts-v1';

export const STAGE25_PROPOSAL_RECONCILIATION_VERSION_V1 = 'EDITRON_OE_STAGE25_PROPOSAL_RECONCILIATION_V1' as const;

export interface Stage25ProjectTimebaseRefV1 {
  timebaseId: string;
  version: string;
}

export interface Stage25TickRangeV1 {
  timebase: Stage25ProjectTimebaseRefV1;
  startTick: string;
  endExclusiveTick: string;
}

export interface Stage25EffectRegionV1 {
  regionId: string;
  path: readonly string[];
  range?: Stage25TickRangeV1;
  identityRefs: readonly string[];
}

export interface Stage25ProposalV1 {
  schemaVersion: typeof STAGE25_PROPOSAL_RECONCILIATION_VERSION_V1;
  proposalId: string;
  projectId: string;
  baseProjectRevision: string;
  timebase: Stage25ProjectTimebaseRefV1;
  readSet: readonly Stage25EffectRegionV1[];
  writeSet: readonly Stage25EffectRegionV1[];
  evidenceRefs: readonly string[];
  targetPredicateIds: readonly string[];
  proposalHash: string;
}

export interface Stage25CoordinateTransformV1 {
  transformId: string;
  projectId: string;
  fromProjectRevision: string;
  toProjectRevision: string;
  pathPrefix: readonly string[];
  sourceRange: Stage25TickRangeV1;
  deltaTicks: string;
  preservedIdentityRefs: readonly string[];
  proofRefs: readonly string[];
  proofStatus: 'PASS';
  transformHash: string;
}

export interface Stage25ChangeSetReceiptV1 {
  schemaVersion: typeof STAGE25_PROPOSAL_RECONCILIATION_VERSION_V1;
  receiptId: string;
  projectId: string;
  actorKind: 'USER' | 'AGENT' | 'SYSTEM';
  beforeProjectRevision: string;
  afterProjectRevision: string;
  timebase: Stage25ProjectTimebaseRefV1;
  affectedRegions: readonly Stage25EffectRegionV1[];
  invalidatedArtifactRefs: readonly string[];
  coordinateTransforms: readonly Stage25CoordinateTransformV1[];
  receiptHash: string;
}

export interface Stage25RangeLockV1 {
  schemaVersion: typeof STAGE25_PROPOSAL_RECONCILIATION_VERSION_V1;
  lockId: string;
  projectId: string;
  status: 'ACTIVE';
  ownerActorId: string;
  reason: string;
  region: Stage25EffectRegionV1;
  lockHash: string;
}

export type Stage25ReconciliationDispositionV1 =
  | 'ELIGIBLE_AT_BASE'
  | 'ELIGIBLE_REBASED_DISJOINT'
  | 'ELIGIBLE_REBASED_WITH_TRANSFORM'
  | 'BLOCKED_CONFLICT'
  | 'BLOCKED_LOCK'
  | 'BLOCKED_STALE_EVIDENCE';

export interface Stage25ProposalReconciliationV1 {
  schemaVersion: typeof STAGE25_PROPOSAL_RECONCILIATION_VERSION_V1;
  authority: 'RESEARCH_ONLY_NO_PROJECT_MUTATION';
  evaluatedAt: string;
  proposalHash: string;
  currentProjectRevision: string;
  changeReceiptHashes: readonly string[];
  lockSetHash: string;
  disposition: Stage25ReconciliationDispositionV1;
  rebasedExpectedProjectRevision: string | null;
  projectedReadSet: readonly Stage25EffectRegionV1[];
  projectedWriteSet: readonly Stage25EffectRegionV1[];
  appliedTransformIds: readonly string[];
  conflictReceiptIds: readonly string[];
  blockingLockIds: readonly string[];
  staleEvidenceRefs: readonly string[];
  stateEffects: readonly [];
  assessmentHash: string;
}

export function buildStage25LockSetHashV1(input: {
  projectId: string;
  currentProjectRevision: string;
  locks: readonly Stage25RangeLockV1[];
}): string {
  return hashCanonicalJsonV1({
    schemaVersion: STAGE25_PROPOSAL_RECONCILIATION_VERSION_V1,
    projectId: input.projectId,
    currentProjectRevision: input.currentProjectRevision,
    lockHashes: [...input.locks].sort((left, right) => left.lockId < right.lockId ? -1 : left.lockId > right.lockId ? 1 : 0)
      .map(({ lockHash }) => lockHash),
  });
}

export function reconcileStage25ProposalV1(input: {
  evaluatedAt: string;
  proposal: Stage25ProposalV1;
  currentProjectRevision: string;
  changesSinceBase: readonly Stage25ChangeSetReceiptV1[];
  currentLocks: readonly Stage25RangeLockV1[];
  currentLockSetHash: string;
}): Readonly<Stage25ProposalReconciliationV1> {
  requireIsoTimestamp(input.evaluatedAt);
  validateProposal(input.proposal);
  const { proposal, changesSinceBase, currentLocks } = input;
  requireText(input.currentProjectRevision, 'CURRENT_PROJECT_REVISION');
  validateChangeChain(proposal, input.currentProjectRevision, changesSinceBase);
  validateLocks(proposal, input.currentProjectRevision, currentLocks, input.currentLockSetHash);

  let projectedReadSet = proposal.readSet.map(copyRegion);
  let projectedWriteSet = proposal.writeSet.map(copyRegion);
  const appliedTransformIds = new Set<string>();
  const conflictReceiptIds = new Set<string>();
  const staleEvidenceRefs = new Set<string>();

  // An overlapping change is rebaseable only through one writer-issued, proof-bound transform.
  for (const receipt of changesSinceBase) {
    for (const ref of receipt.invalidatedArtifactRefs) if (proposal.evidenceRefs.includes(ref)) staleEvidenceRefs.add(ref);
    const projectRegion = (region: Stage25EffectRegionV1): Stage25EffectRegionV1 => {
      if (!receipt.affectedRegions.some((changed) => stage25EffectRegionsIntersectV1(region, changed))) return region;
      const transforms = receipt.coordinateTransforms.filter((transform) => transformApplies(transform, region));
      if (transforms.length !== 1) {
        conflictReceiptIds.add(receipt.receiptId);
        return region;
      }
      appliedTransformIds.add(transforms[0].transformId);
      return shiftRegion(region, transforms[0]);
    };
    projectedReadSet = projectedReadSet.map(projectRegion);
    projectedWriteSet = projectedWriteSet.map(projectRegion);
  }

  const blockingLockIds = currentLocks
    .filter((lock) => projectedWriteSet.some((region) => stage25EffectRegionsIntersectV1(region, lock.region)))
    .map(({ lockId }) => lockId)
    .sort();
  const conflicts = [...conflictReceiptIds].sort();
  const stale = [...staleEvidenceRefs].sort();
  const disposition: Stage25ReconciliationDispositionV1 = conflicts.length
    ? 'BLOCKED_CONFLICT'
    : blockingLockIds.length ? 'BLOCKED_LOCK'
    : stale.length ? 'BLOCKED_STALE_EVIDENCE'
    : !changesSinceBase.length ? 'ELIGIBLE_AT_BASE'
    : appliedTransformIds.size ? 'ELIGIBLE_REBASED_WITH_TRANSFORM'
    : 'ELIGIBLE_REBASED_DISJOINT';
  const eligible = disposition.startsWith('ELIGIBLE_');
  const unsigned = {
    schemaVersion: STAGE25_PROPOSAL_RECONCILIATION_VERSION_V1,
    authority: 'RESEARCH_ONLY_NO_PROJECT_MUTATION' as const,
    evaluatedAt: input.evaluatedAt,
    proposalHash: proposal.proposalHash,
    currentProjectRevision: input.currentProjectRevision,
    changeReceiptHashes: changesSinceBase.map(({ receiptHash }) => receiptHash),
    lockSetHash: input.currentLockSetHash,
    disposition,
    rebasedExpectedProjectRevision: eligible ? input.currentProjectRevision : null,
    projectedReadSet,
    projectedWriteSet,
    appliedTransformIds: [...appliedTransformIds].sort(),
    conflictReceiptIds: conflicts,
    blockingLockIds,
    staleEvidenceRefs: stale,
    stateEffects: [] as const,
  };
  return Object.freeze({ ...unsigned, assessmentHash: hashCanonicalJsonV1(unsigned) });
}

function validateProposal(proposal: Stage25ProposalV1): void {
  if (proposal.schemaVersion !== STAGE25_PROPOSAL_RECONCILIATION_VERSION_V1
    || proposal.proposalHash !== hashWithout(proposal, 'proposalHash')) fail('PROPOSAL_HASH_INVALID');
  requireText(proposal.proposalId, 'PROPOSAL_ID'); requireText(proposal.projectId, 'PROJECT_ID');
  requireText(proposal.baseProjectRevision, 'BASE_PROJECT_REVISION'); validateTimebase(proposal.timebase);
  validateUniqueRegions([...proposal.readSet, ...proposal.writeSet], proposal.timebase);
  requireUniqueText(proposal.evidenceRefs, 'EVIDENCE_REFS'); requireUniqueText(proposal.targetPredicateIds, 'TARGET_PREDICATE_IDS');
}

function validateChangeChain(proposal: Stage25ProposalV1, currentRevision: string, receipts: readonly Stage25ChangeSetReceiptV1[]): void {
  const ids = new Set<string>(); let expectedBefore = proposal.baseProjectRevision;
  for (const receipt of receipts) {
    if (ids.has(receipt.receiptId)) fail('CHANGE_RECEIPT_DUPLICATED'); ids.add(receipt.receiptId);
    if (receipt.schemaVersion !== STAGE25_PROPOSAL_RECONCILIATION_VERSION_V1
      || receipt.projectId !== proposal.projectId || !sameTimebase(receipt.timebase, proposal.timebase)
      || receipt.beforeProjectRevision !== expectedBefore || receipt.beforeProjectRevision === receipt.afterProjectRevision
      || receipt.receiptHash !== hashWithout(receipt, 'receiptHash')) fail('CHANGE_RECEIPT_CHAIN_INVALID');
    requireText(receipt.receiptId, 'CHANGE_RECEIPT_ID'); requireText(receipt.afterProjectRevision, 'CHANGE_AFTER_REVISION');
    validateUniqueRegions(receipt.affectedRegions, proposal.timebase);
    requireUniqueText(receipt.invalidatedArtifactRefs, 'INVALIDATED_ARTIFACT_REFS');
    const transformIds = new Set<string>();
    for (const transform of receipt.coordinateTransforms) {
      if (transformIds.has(transform.transformId)) fail('COORDINATE_TRANSFORM_DUPLICATED'); transformIds.add(transform.transformId);
      validateTransform(transform, proposal, receipt);
    }
    expectedBefore = receipt.afterProjectRevision;
  }
  if (expectedBefore !== currentRevision || (currentRevision === proposal.baseProjectRevision) !== (receipts.length === 0)) fail('CHANGE_RECEIPT_CHAIN_INCOMPLETE');
}

function validateTransform(transform: Stage25CoordinateTransformV1, proposal: Stage25ProposalV1, receipt: Stage25ChangeSetReceiptV1): void {
  if (transform.projectId !== proposal.projectId || transform.fromProjectRevision !== receipt.beforeProjectRevision
    || transform.toProjectRevision !== receipt.afterProjectRevision || transform.proofStatus !== 'PASS'
    || transform.transformHash !== hashWithout(transform, 'transformHash')) fail('COORDINATE_TRANSFORM_INVALID');
  requireText(transform.transformId, 'TRANSFORM_ID'); validatePath(transform.pathPrefix);
  validateRange(transform.sourceRange, proposal.timebase);
  const delta = parseSignedTick(transform.deltaTicks, 'DELTA_TICKS');
  if (parseTick(transform.sourceRange.startTick, 'TRANSFORM_START') + delta < BigInt(0)) fail('COORDINATE_TRANSFORM_OUTPUT_RANGE_INVALID');
  requireUniqueText(transform.preservedIdentityRefs, 'PRESERVED_IDENTITIES'); requireUniqueText(transform.proofRefs, 'TRANSFORM_PROOF_REFS', true);
}

function validateLocks(proposal: Stage25ProposalV1, currentRevision: string, locks: readonly Stage25RangeLockV1[], expectedHash: string): void {
  const ids = new Set<string>();
  for (const lock of locks) {
    if (ids.has(lock.lockId)) fail('RANGE_LOCK_DUPLICATED'); ids.add(lock.lockId);
    if (lock.schemaVersion !== STAGE25_PROPOSAL_RECONCILIATION_VERSION_V1 || lock.projectId !== proposal.projectId
      || lock.status !== 'ACTIVE' || lock.lockHash !== hashWithout(lock, 'lockHash')) fail('RANGE_LOCK_INVALID');
    requireText(lock.lockId, 'LOCK_ID'); requireText(lock.ownerActorId, 'LOCK_OWNER'); requireText(lock.reason, 'LOCK_REASON');
    validateStage25EffectRegionV1(lock.region, proposal.timebase);
  }
  if (expectedHash !== buildStage25LockSetHashV1({ projectId: proposal.projectId, currentProjectRevision: currentRevision, locks })) fail('LOCK_SET_HASH_INVALID');
}

function validateUniqueRegions(regions: readonly Stage25EffectRegionV1[], timebase: Stage25ProjectTimebaseRefV1): void {
  const ids = new Set<string>();
  for (const region of regions) { if (ids.has(region.regionId)) fail('EFFECT_REGION_DUPLICATED'); ids.add(region.regionId); validateStage25EffectRegionV1(region, timebase); }
}
export function validateStage25EffectRegionV1(region: Stage25EffectRegionV1, timebase: Stage25ProjectTimebaseRefV1): void {
  requireText(region.regionId, 'REGION_ID'); validatePath(region.path); requireUniqueText(region.identityRefs, 'IDENTITY_REFS');
  if (region.range) validateRange(region.range, timebase);
}
function validateRange(range: Stage25TickRangeV1, timebase: Stage25ProjectTimebaseRefV1): void {
  if (!sameTimebase(range.timebase, timebase)) fail('RANGE_TIMEBASE_INVALID');
  const start = parseTick(range.startTick, 'RANGE_START'); const end = parseTick(range.endExclusiveTick, 'RANGE_END');
  if (end <= start) fail('RANGE_ORDER_INVALID');
}
function validateTimebase(timebase: Stage25ProjectTimebaseRefV1): void { requireText(timebase.timebaseId, 'TIMEBASE_ID'); requireText(timebase.version, 'TIMEBASE_VERSION'); }
function validatePath(path: readonly string[]): void { if (!path.length || path.some((part) => !part.trim() || part === '.' || part === '..' || part.includes('*'))) fail('PROJECT_PATH_INVALID'); }

export function stage25EffectRegionsIntersectV1(left: Stage25EffectRegionV1, right: Stage25EffectRegionV1): boolean {
  if (!pathsIntersect(left.path, right.path)) return false;
  if (!left.range || !right.range) return true;
  if (!sameTimebase(left.range.timebase, right.range.timebase)) fail('INTERSECTION_TIMEBASE_DRIFT');
  return parseTick(left.range.startTick, 'LEFT_START') < parseTick(right.range.endExclusiveTick, 'RIGHT_END')
    && parseTick(right.range.startTick, 'RIGHT_START') < parseTick(left.range.endExclusiveTick, 'LEFT_END');
}
function pathsIntersect(left: readonly string[], right: readonly string[]): boolean { return isPrefix(left, right) || isPrefix(right, left); }
function isPrefix(prefix: readonly string[], value: readonly string[]): boolean { return prefix.length <= value.length && prefix.every((part, index) => value[index] === part); }
function transformApplies(transform: Stage25CoordinateTransformV1, region: Stage25EffectRegionV1): boolean {
  if (!region.range || !isPrefix(transform.pathPrefix, region.path) || !sameTimebase(transform.sourceRange.timebase, region.range.timebase)) return false;
  const covers = parseTick(transform.sourceRange.startTick, 'TRANSFORM_START') <= parseTick(region.range.startTick, 'REGION_START')
    && parseTick(transform.sourceRange.endExclusiveTick, 'TRANSFORM_END') >= parseTick(region.range.endExclusiveTick, 'REGION_END');
  return covers && region.identityRefs.every((ref) => transform.preservedIdentityRefs.includes(ref));
}
function shiftRegion(region: Stage25EffectRegionV1, transform: Stage25CoordinateTransformV1): Stage25EffectRegionV1 {
  if (!region.range) fail('TRANSFORM_RANGE_MISSING');
  const delta = parseSignedTick(transform.deltaTicks, 'DELTA_TICKS');
  const start = parseTick(region.range.startTick, 'SHIFT_START') + delta; const end = parseTick(region.range.endExclusiveTick, 'SHIFT_END') + delta;
  if (start < BigInt(0) || end <= start) fail('TRANSFORM_OUTPUT_RANGE_INVALID');
  return { ...region, range: { ...region.range, startTick: start.toString(), endExclusiveTick: end.toString() } };
}
function copyRegion(region: Stage25EffectRegionV1): Stage25EffectRegionV1 { return { ...region, path: [...region.path], identityRefs: [...region.identityRefs], ...(region.range ? { range: { ...region.range, timebase: { ...region.range.timebase } } } : {}) }; }
function sameTimebase(left: Stage25ProjectTimebaseRefV1, right: Stage25ProjectTimebaseRefV1): boolean { return left.timebaseId === right.timebaseId && left.version === right.version; }
function hashWithout<T extends object>(value: T, field: keyof T): string { const unsigned = { ...value }; delete unsigned[field]; return hashCanonicalJsonV1(unsigned); }
function parseTick(value: string, label: string): bigint { if (!/^(0|[1-9]\d*)$/.test(value)) fail(`${label}_INVALID`); return BigInt(value); }
function parseSignedTick(value: string, label: string): bigint { if (!/^-?(0|[1-9]\d*)$/.test(value) || value === '-0') fail(`${label}_INVALID`); return BigInt(value); }
function requireUniqueText(values: readonly string[], label: string, requireOne = false): void { if ((requireOne && !values.length) || values.some((value) => !value.trim()) || new Set(values).size !== values.length) fail(`${label}_INVALID`); }
function requireText(value: string, label: string): void { if (!value.trim()) fail(`${label}_INVALID`); }
function requireIsoTimestamp(value: string): void { if (new Date(value).toISOString() !== value) fail('EVALUATED_AT_INVALID'); }
function fail(message: string): never { throw new Error(`STAGE25_RECONCILIATION_${message}`); }
