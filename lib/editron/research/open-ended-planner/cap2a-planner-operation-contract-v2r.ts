import {
  parseCap2AtomicOperationV1,
  type Cap2AtomicOperationV1,
} from '../capability-census/cap2-atomic-operation-contract-v1';

export const CAP2A_PLANNER_OPERATION_CONTRACT_VERSION_V2R =
  'EDITRON_CAP2A_PLANNER_OPERATION_CONTRACT_V2R_1' as const;

type Cap2ExecutionV1 = Cap2AtomicOperationV1['execution'];

export type Cap2aPlannerOperationV2R = Omit<Cap2AtomicOperationV1, 'execution'> & {
  execution: Omit<Cap2ExecutionV1, 'revisionSemantics'> & {
    revisionSemantics: Cap2ExecutionV1['revisionSemantics'] | 'UNSAFE_NONE';
  };
};

type UnknownRecord = Record<string, unknown>;

function isRecord(value: unknown): value is UnknownRecord {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function invalidUnsafeRevision(message: string): never {
  throw new TypeError(`Invalid V2R unsafe revision declaration: ${message}`);
}

/**
 * Preserves every frozen CAP2 V1 invariant while representing an audited live
 * writer that has no safe revision contract. The validation surrogate is never
 * exposed; UNSAFE_NONE remains present in the returned, hash-bound dossier.
 */
export function parseCap2aPlannerOperationV2R(value: unknown): Cap2aPlannerOperationV2R {
  if (!isRecord(value) || !isRecord(value.execution)
    || value.execution.revisionSemantics !== 'UNSAFE_NONE') {
    return parseCap2AtomicOperationV1(value);
  }

  const parsed = parseCap2AtomicOperationV1({
    ...value,
    execution: { ...value.execution, revisionSemantics: 'PROPOSAL_ONLY' },
  });
  if (!['MUTATE', 'GENERATE', 'DELIVER'].includes(parsed.kind)) {
    invalidUnsafeRevision('UNSAFE_NONE is valid only for a state-changing operation.');
  }
  if (parsed.support.implementationStatus === 'MISSING') {
    invalidUnsafeRevision('a missing implementation cannot claim a live unsafe writer.');
  }
  if (parsed.support.certificationStatus === 'CERTIFIED'
    || parsed.support.plannerEligibility === 'PRODUCTION_ELIGIBLE') {
    invalidUnsafeRevision('an unsafe writer cannot be certified or production eligible.');
  }

  return {
    ...parsed,
    execution: { ...parsed.execution, revisionSemantics: 'UNSAFE_NONE' },
  };
}
