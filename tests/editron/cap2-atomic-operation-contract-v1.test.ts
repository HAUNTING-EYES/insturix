import { describe, expect, it } from 'vitest';

import {
  parseCap2AtomicOperationV1,
  parseCap2CatalogV1,
} from '@/lib/editron/research/capability-census/cap2-atomic-operation-contract-v1';

const codeRef = (role: string, symbol = 'owner') => ({
  path: 'lib/editron/example.ts',
  symbol,
  role,
});

const projectClasses = () => [
  { projectClass: 'SHORT_FORM', status: 'UNCERTIFIED', evidenceRefs: [] },
  { projectClass: 'AGENCY', status: 'UNCERTIFIED', evidenceRefs: [] },
  { projectClass: 'LONG_FORM', status: 'UNCERTIFIED', evidenceRefs: [] },
  { projectClass: 'FILM_POST', status: 'UNCERTIFIED', evidenceRefs: [] },
];

const closedSchema = (properties: Record<string, Record<string, unknown>>, required: string[]) => ({
  type: 'object',
  additionalProperties: false,
  properties,
  required,
});

function readOperation(): Record<string, unknown> {
  return {
    operatorId: 'project.read',
    version: '1.0.0',
    family: 'project',
    kind: 'READ',
    aliases: { usage: 'RETRIEVAL_ONLY', values: ['read project'] },
    support: {
      implementationStatus: 'LIVE',
      certificationStatus: 'UNCERTIFIED',
      plannerEligibility: 'READ_ONLY',
      reason: 'Observed read path; production proof remains uncertified.',
      projectClasses: projectClasses(),
    },
    surfaces: {
      manualUi: false,
      chat: true,
      director: false,
      worker: false,
      api: true,
      entrypoints: [codeRef('ENTRYPOINT', 'readProject')],
      parityStatus: 'AGENT_ONLY',
      parityReason: 'No manual action is required for this read operation.',
    },
    owners: {
      ownerDisposition: 'VERIFIED',
      decisionOwner: codeRef('DECISION_OWNER', 'readProject'),
      proofOwner: codeRef('PROOF_OWNER', 'verifyProjectRead'),
      finalConsumers: [codeRef('CONSUMER', 'plannerEnvelope')],
    },
    contract: {
      inputSchema: closedSchema({
        projectId: { type: 'string' },
        expectedRevision: { type: 'string' },
      }, ['projectId', 'expectedRevision']),
      outputSchema: closedSchema({
        projectSnapshot: { type: 'object' },
      }, ['projectSnapshot']),
      coordinateDomains: ['NONE'],
      resolverHandoff: {
        disposition: 'NOT_REQUIRED',
        inputBinding: 'No form resolver is used for a read.',
        outputBinding: 'Returns a revision-bound project projection.',
      },
    },
    effects: {
      reads: [{ refType: 'PROJECT_PATH', selector: '$', coordinateDomain: 'NONE' }],
      writes: [],
      requires: [{ refType: 'POLICY', selector: 'tenant-project-access', coordinateDomain: 'NONE' }],
      produces: [{ refType: 'EVIDENCE', selector: 'project-snapshot', coordinateDomain: 'NONE' }],
      invalidates: [],
      stateEffects: [],
    },
    execution: {
      mutationPath: [],
      revisionSemantics: 'READ_PINNED',
      concurrencySemantics: 'READ_ONLY',
      idempotencySemantics: 'NOT_APPLICABLE',
      failClosed: true,
      failureDispositions: ['CONFLICT', 'UNVERIFIABLE'],
    },
    verification: {
      deterministicValidators: [codeRef('VALIDATOR', 'verifyProjectRevision')],
      proofObligations: [{
        kind: 'state',
        version: '1.0.0',
        requirement: 'Bind the returned state to the requested project revision.',
      }],
      proofDispositions: ['PASS', 'FAIL', 'UNVERIFIABLE'],
      scorecardThresholds: ['revision identity exact'],
    },
    recovery: {
      undo: 'NOT_APPLICABLE',
      redo: 'NOT_APPLICABLE',
      replay: 'NOT_APPLICABLE',
      reproducibilityBindings: ['operator version', 'project revision'],
    },
    policy: {
      rights: 'Project access scope only.',
      privacy: 'Tenant-scoped fields only.',
      egress: 'No model egress in the owner.',
      promptInjection: 'No untrusted text is executed.',
      network: 'Internal project storage only.',
    },
    resources: {
      latencyClass: 'INTERACTIVE',
      computeClass: 'SERVER_CPU',
      limits: { maximumProjectDocuments: 1 },
    },
    evidenceRefs: [codeRef('EVIDENCE', 'readProject')],
  };
}

function mutationOperation(): Record<string, unknown> {
  const operation = structuredClone(readOperation()) as Record<string, any>;
  operation.operatorId = 'timeline.trim';
  operation.family = 'timeline';
  operation.kind = 'MUTATE';
  operation.support.plannerEligibility = 'ISOLATED_PROPOSAL_ONLY';
  operation.surfaces.manualUi = true;
  operation.surfaces.parityStatus = 'SHARED_OWNER';
  operation.surfaces.parityReason = 'Manual and agent surfaces delegate to the same owner.';
  operation.owners.mutationOwner = codeRef('MUTATION_OWNER', 'trimTimelineRange');
  operation.owners.persistenceOwner = codeRef('PERSISTENCE_OWNER', 'ProjectService');
  operation.effects.writes = [{
    refType: 'TIMELINE_RANGE',
    selector: 'selected-range',
    coordinateDomain: 'PROJECT_TIMEBASE',
  }];
  operation.execution.mutationPath = [codeRef('MUTATION_OWNER', 'trimTimelineRange')];
  operation.execution.revisionSemantics = 'PROJECT_CAS';
  operation.execution.concurrencySemantics = 'RANGE_DISJOINT';
  operation.execution.idempotencySemantics = 'REQUIRED';
  operation.recovery.undo = 'SUPPORTED';
  operation.recovery.replay = 'UNAVAILABLE';
  return operation;
}

function catalog(operation = readOperation()): Record<string, unknown> {
  return {
    artifactType: 'EditronAtomicCapabilityCatalogV1',
    schemaVersion: 1,
    authority: 'RESEARCH_CENSUS_NO_RUNTIME_MUTATION',
    catalogStatus: 'FROZEN_CURRENT_TRUTH',
    sourceBinding: {
      branch: 'infrastructure-improvs-+Editron',
      commit: '0'.repeat(40),
      sourceSnapshotHash: 'a'.repeat(64),
      generatedAt: '2026-08-17T12:00:00.000Z',
    },
    declaredOperationCount: 1,
    sourceCounts: [{
      sourceId: 'chat-registry',
      observedCount: 66,
      evidenceRefs: [codeRef('EVIDENCE', 'CHAT_TOOL_REGISTRY')],
    }],
    unresolvedSourceIds: [],
    operations: [operation],
  };
}

describe('CAP-2 atomic operation contract v1', () => {
  it('accepts closed read and mutation records without certifying either', () => {
    expect(parseCap2AtomicOperationV1(readOperation()).support.certificationStatus).toBe('UNCERTIFIED');
    expect(parseCap2AtomicOperationV1(mutationOperation()).support.plannerEligibility).toBe('ISOLATED_PROPOSAL_ONLY');
  });

  it('rejects open or internally inconsistent input schemas', () => {
    const open = structuredClone(readOperation()) as Record<string, any>;
    open.contract.inputSchema.additionalProperties = true;
    expect(() => parseCap2AtomicOperationV1(open)).toThrow();

    const missingProperty = structuredClone(readOperation()) as Record<string, any>;
    missingProperty.contract.inputSchema.required.push('missingField');
    expect(() => parseCap2AtomicOperationV1(missingProperty)).toThrow(/absent from properties/);
  });

  it('rejects aliases that can masquerade as executable IDs', () => {
    const operation = structuredClone(readOperation()) as Record<string, any>;
    operation.aliases.values.push(operation.operatorId);
    expect(() => parseCap2AtomicOperationV1(operation)).toThrow(/alias cannot duplicate/);
  });

  it('requires all four project-class certification dispositions', () => {
    const operation = structuredClone(readOperation()) as Record<string, any>;
    operation.support.projectClasses.pop();
    expect(() => parseCap2AtomicOperationV1(operation)).toThrow(/all project classes/);
  });

  it('keeps PASS, FAIL and UNVERIFIABLE distinct', () => {
    const operation = structuredClone(readOperation()) as Record<string, any>;
    operation.verification.proofDispositions = ['PASS', 'FAIL'];
    expect(() => parseCap2AtomicOperationV1(operation)).toThrow(/PASS, FAIL and UNVERIFIABLE/);
  });

  it('rejects production eligibility without live certification and owner convergence', () => {
    const operation = structuredClone(readOperation()) as Record<string, any>;
    operation.support.plannerEligibility = 'PRODUCTION_ELIGIBLE';
    expect(() => parseCap2AtomicOperationV1(operation)).toThrow(/production eligibility/);
  });

  it('rejects mutating records without a real mutation and persistence path', () => {
    const operation = structuredClone(mutationOperation()) as Record<string, any>;
    delete operation.owners.persistenceOwner;
    operation.execution.mutationPath = [];
    expect(() => parseCap2AtomicOperationV1(operation)).toThrow(/mutating operations require/);
  });

  it('rejects duplicate operation identities and false source-completeness claims', () => {
    const duplicate = structuredClone(catalog()) as Record<string, any>;
    duplicate.operations.push(structuredClone(duplicate.operations[0]));
    duplicate.declaredOperationCount = 2;
    expect(() => parseCap2CatalogV1(duplicate)).toThrow(/must be unique/);

    const unresolved = structuredClone(catalog()) as Record<string, any>;
    unresolved.unresolvedSourceIds = ['manual-ui'];
    expect(() => parseCap2CatalogV1(unresolved)).toThrow(/frozen catalog/);
  });

  it('rejects an operation count that does not match the frozen rows', () => {
    const value = structuredClone(catalog()) as Record<string, any>;
    value.declaredOperationCount = 40;
    expect(() => parseCap2CatalogV1(value)).toThrow(/declared operation count/);
  });
});
