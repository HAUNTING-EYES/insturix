import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { describe, expect, it } from 'vitest';

import {
  canonicalCommandHashV1,
  canonicalizeJsonV1,
  createTimelineRevisionRefV1,
  resolveOutcomeProofStatusV1,
  scopedReplayKeyV1,
  staleProjectRevisionOutcomeV1,
  staleTimelineResolutionOutcomeV1,
  timelineRevisionEqualsV1,
  transientSameCommandFailureOutcomeV1,
  unsafeUndoOutcomeV1,
  type ActorRefV1,
  type CoordinateSpaceV1,
  type ExternalReferenceV1,
  type PostCommandIRV1,
  type ProofObligationV1,
  type ProjectRevisionRefV1,
  type TransactionReceiptV1,
} from '@/lib/editron/if1/contracts-v1';
import { EDITRON_IF1_INTEGRATION_MANIFEST_V1 } from '@/lib/editron/if1/integration-manifest-v1';
import {
  projectRevisionRefFromProjectServiceReceiptV1,
  type ProjectServiceIF1RevisionIssuerV1,
} from '@/lib/editron/if1/project-service-adapter-v1';
import type { ProjectMutationReceiptV1 } from '@/lib/editron/services/project-service';

const actor = (actorId: string): ActorRefV1 => ({ schemaVersion: 1, kind: 'user', actorId });

const revision = (projectId: string, token: string): ProjectRevisionRefV1 => Object.freeze({
  schemaVersion: 1,
  projectId,
  issuer: { id: 'project-service', contractVersion: 1 },
  token,
}) as ProjectRevisionRefV1;

const coordinateSpace = (projectId: string): CoordinateSpaceV1 => ({
  schemaVersion: 1,
  kind: 'timeline-frame',
  timebase: { schemaVersion: 1, projectId, timebaseId: 'project-default', version: 'timebase-v1' },
});

const externalReferences: readonly ExternalReferenceV1[] = [
  { schemaVersion: 1, kind: 'external', locator: 'if3:brand-snapshot:opaque', version: 'r1' },
  { schemaVersion: 1, kind: 'external', locator: 'if2:media-asset:opaque', version: 'r8' },
];

function command(input: {
  readonly actorId: string;
  readonly projectId: string;
  readonly operationId: string;
  readonly expectedProjectRevision?: ProjectRevisionRefV1;
  readonly expectedTimelineRevision?: ReturnType<typeof createTimelineRevisionRefV1>;
  readonly parameters?: PostCommandIRV1['parameters'];
  readonly externalReferences?: readonly ExternalReferenceV1[];
  readonly proofRequirement?: PostCommandIRV1['proof']['requirement'];
  readonly obligations?: PostCommandIRV1['proof']['obligations'];
}): PostCommandIRV1 {
  const projectRevision = input.expectedProjectRevision ?? revision(input.projectId, 'r7');
  return {
    schemaVersion: 1,
    commandType: 'overlay.update',
    actor: actor(input.actorId),
    projectId: input.projectId,
    operationId: input.operationId,
    target: { schemaVersion: 1, kind: 'overlay-id', selector: 'overlay-17' },
    parameters: input.parameters ?? { content: 'Approved overlay content' },
    coordinateSpace: coordinateSpace(input.projectId),
    expectedProjectRevision: projectRevision,
    expectedTimelineRevision: input.expectedTimelineRevision ?? null,
    externalReferences: input.externalReferences ?? externalReferences,
    proof: {
      schemaVersion: 1,
      requirement: input.proofRequirement ?? 'required',
      obligations: input.obligations ?? [
        { schemaVersion: 1, obligationId: 'state', kind: 'core:state', required: true },
        { schemaVersion: 1, obligationId: 'visual', kind: 'render:visual', required: true },
      ],
    },
    failurePolicy: 'reject-with-zero-project-mutation',
  };
}

function projectServiceRevisionIssuer(): ProjectServiceIF1RevisionIssuerV1 {
  return {
    issueProjectRevisionRefV1(receipt) {
      return revision(receipt.projectId, `project-service-issued:${receipt.committedAt}`);
    },
  };
}

describe('Editron IF1 freeze candidate', () => {
  it('exposes an opaque ProjectService-issued revision without a public raw decoder', () => {
    const receipt = {
      schemaVersion: 1,
      projectId: 'project-1',
      revision: { schemaVersion: 1, value: 7, compatibilityUpdatedAt: '2026-08-09T00:00:07.000Z' },
      committedAt: '2026-08-09T00:00:07.000Z',
    } as ProjectMutationReceiptV1;
    const reference = projectRevisionRefFromProjectServiceReceiptV1(projectServiceRevisionIssuer(), receipt);

    expect(reference).toEqual({
      schemaVersion: 1,
      projectId: 'project-1',
      issuer: { id: 'project-service', contractVersion: 1 },
      token: 'project-service-issued:2026-08-09T00:00:07.000Z',
    });
    expect(reference).not.toHaveProperty('value');
    expect(reference).not.toHaveProperty('compatibilityUpdatedAt');
    expect(readFileSync(resolve(process.cwd(), 'lib/editron/if1/project-service-adapter-v1.ts'), 'utf8'))
      .not.toMatch(/decodeProjectRevisionRefV1|nativeRevisionForProjectService/);
  });

  it('hashes UI and chat parity through Unicode-normalized canonical command material', () => {
    const projectId = 'project-1';
    const expectedProjectRevision = revision(projectId, 'r7');
    const ui = command({
      actorId: 'user-ui',
      projectId,
      operationId: 'ui-op',
      expectedProjectRevision,
      parameters: { content: 'Cafe\u0301' },
    });
    const chat = command({
      actorId: 'user-chat',
      projectId,
      operationId: 'chat-op',
      expectedProjectRevision,
      parameters: { content: 'Café' },
      externalReferences: [...externalReferences].reverse(),
      obligations: [
        { schemaVersion: 1, obligationId: 'visual', kind: 'render:visual', required: true },
        { schemaVersion: 1, obligationId: 'state', kind: 'core:state', required: true },
      ],
    });

    expect(canonicalCommandHashV1(ui)).toEqual(canonicalCommandHashV1(chat));
    const collidingKeys = { 'e\u0301': 1, '\u00e9': 2 };
    expect(() => canonicalizeJsonV1(collidingKeys)).toThrow(
      'IF1 canonical JSON rejects keys that collide after NFC normalization.',
    );
  });

  it('hashes project, expected revisions, external references, and proof policy', () => {
    const first = command({ actorId: 'user-a', projectId: 'project-a', operationId: 'op-a' });
    const differentExpectedRevision = command({
      actorId: 'user-a',
      projectId: 'project-a',
      operationId: 'op-b',
      expectedProjectRevision: revision('project-a', 'r8'),
    });
    const differentProject = command({ actorId: 'user-a', projectId: 'project-b', operationId: 'op-c' });
    const differentExternalReference = command({
      actorId: 'user-a',
      projectId: 'project-a',
      operationId: 'op-d',
      externalReferences: [{ schemaVersion: 1, kind: 'external', locator: 'if3:other', version: 'r1' }],
    });
    const differentProofPolicy = command({
      actorId: 'user-a',
      projectId: 'project-a',
      operationId: 'op-e',
      proofRequirement: 'not-required',
    });

    expect(canonicalCommandHashV1(first)).toEqual(expect.objectContaining({
      algorithm: 'sha-256', canonicalization: 'editron-canonical-json-v1', value: expect.stringMatching(/^sha256:/),
    }));
    expect(canonicalCommandHashV1(first)).not.toEqual(canonicalCommandHashV1(differentExpectedRevision));
    expect(canonicalCommandHashV1(first)).not.toEqual(canonicalCommandHashV1(differentProject));
    expect(canonicalCommandHashV1(first)).not.toEqual(canonicalCommandHashV1(differentExternalReference));
    expect(canonicalCommandHashV1(first)).not.toEqual(canonicalCommandHashV1(differentProofPolicy));
  });

  it('scopes replay protection to the actor and project even when canonical intent is equal', () => {
    const first = command({ actorId: 'user-a', projectId: 'project-a', operationId: 'retry-1' });
    const sameProjectOtherActor = command({ actorId: 'user-b', projectId: 'project-a', operationId: 'retry-1' });
    const hash = canonicalCommandHashV1(first);

    expect(hash).toEqual(canonicalCommandHashV1(sameProjectOtherActor));
    expect(scopedReplayKeyV1({ actor: first.actor, projectId: first.projectId, operationId: first.operationId, commandHash: hash }))
      .not.toEqual(scopedReplayKeyV1({ actor: sameProjectOtherActor.actor, projectId: sameProjectOtherActor.projectId, operationId: sameProjectOtherActor.operationId, commandHash: hash }));
  });

  it('uses project-scoped timebases and project-scoped projection identity', () => {
    const basisOne = revision('project-1', 'r1');
    const basisTwo = revision('project-1', 'r2');
    const sameProjection = { overlays: [{ id: 'overlay-17', from: 0, to: 90 }] };
    const first = createTimelineRevisionRefV1({
      projectId: 'project-1', projectionOwner: 'project-service', semanticProjection: sameProjection, basisProjectRevision: basisOne,
    });
    const second = createTimelineRevisionRefV1({
      projectId: 'project-1', projectionOwner: 'project-service', semanticProjection: sameProjection, basisProjectRevision: basisTwo,
    });
    const otherProject = createTimelineRevisionRefV1({
      projectId: 'project-2', projectionOwner: 'project-service', semanticProjection: sameProjection, basisProjectRevision: revision('project-2', 'r1'),
    });
    const range = {
      schemaVersion: 1,
      coordinateSpace: coordinateSpace('project-1'),
      startFrame: 0,
      endFrameExclusive: 90,
    } as const;

    expect(range.coordinateSpace.timebase).toEqual({
      schemaVersion: 1, projectId: 'project-1', timebaseId: 'project-default', version: 'timebase-v1',
    });
    expect(timelineRevisionEqualsV1(first, second)).toBe(true);
    expect(timelineRevisionEqualsV1(first, otherProject)).toBe(false);
    expect(first.projectionToken).not.toEqual(otherProject.projectionToken);
    expect(canonicalCommandHashV1(command({
      actorId: 'user-a',
      projectId: 'project-1',
      operationId: 'timeline-op-a',
      expectedProjectRevision: revision('project-1', 'r9'),
      expectedTimelineRevision: first,
    }))).toEqual(canonicalCommandHashV1(command({
      actorId: 'user-b',
      projectId: 'project-1',
      operationId: 'timeline-op-b',
      expectedProjectRevision: revision('project-1', 'r9'),
      expectedTimelineRevision: second,
    })));
  });

  it('defines stale, transient, and unsafe-undo retry dispositions with zero mutation', () => {
    const expectedProject = revision('project-1', 'r3');
    const currentProject = revision('project-1', 'r4');
    const expectedTimeline = createTimelineRevisionRefV1({
      projectId: 'project-1', projectionOwner: 'project-service', semanticProjection: { cut: 1 }, basisProjectRevision: expectedProject,
    });
    const currentTimeline = createTimelineRevisionRefV1({
      projectId: 'project-1', projectionOwner: 'project-service', semanticProjection: { cut: 2 }, basisProjectRevision: currentProject,
    });

    expect(staleProjectRevisionOutcomeV1(expectedProject, currentProject)).toMatchObject({
      kind: 'stale-project-revision', zeroMutation: true, retryDisposition: 'after-reload',
    });
    expect(staleTimelineResolutionOutcomeV1(expectedTimeline, currentTimeline)).toMatchObject({
      kind: 'stale-timeline-resolution', zeroMutation: true, retryDisposition: 'after-reresolve',
    });
    expect(transientSameCommandFailureOutcomeV1()).toEqual({
      kind: 'transient-executor-failure', zeroMutation: true, retryDisposition: 'transient-same-command',
    });
    expect(unsafeUndoOutcomeV1()).toEqual({
      kind: 'unsafe-undo',
      code: 'unsafe-undo',
      ownerCode: 'CHECKPOINT_RESTORE_UNSAFE_UNDO',
      zeroMutation: true,
      retryDisposition: 'never',
    });
  });

  it('keeps PASS, FAIL, and UNVERIFIABLE distinct and never synthesizes not-required success', () => {
    const extensionObligation: ProofObligationV1 = {
      schemaVersion: 1,
      obligationId: 'accessibility',
      kind: 'if4:accessibility',
      required: true,
    };

    expect(resolveOutcomeProofStatusV1({ requirement: 'required' })).toBe('UNVERIFIABLE');
    expect(resolveOutcomeProofStatusV1({ requirement: 'required', observed: 'PASS' })).toBe('PASS');
    expect(resolveOutcomeProofStatusV1({ requirement: 'required', observed: 'FAIL' })).toBe('FAIL');
    expect(resolveOutcomeProofStatusV1({ requirement: 'not-required' })).toBeNull();
    expect(extensionObligation.kind).toBe('if4:accessibility');
  });

  it('keeps before/after/current revision, undo, checkpoint, and proof observability distinct', () => {
    const before = revision('project-1', 'r7');
    const current = revision('project-1', 'r8');
    const beforeTimeline = createTimelineRevisionRefV1({
      projectId: 'project-1', projectionOwner: 'project-service', semanticProjection: { overlay: 'before' }, basisProjectRevision: before,
    });
    const receipt: TransactionReceiptV1 = {
      schemaVersion: 1,
      receiptId: 'receipt-1',
      operationId: 'operation-1',
      actor: actor('user-1'),
      projectId: 'project-1',
      commandHash: canonicalCommandHashV1(command({ actorId: 'user-1', projectId: 'project-1', operationId: 'operation-1' })),
      outcome: staleProjectRevisionOutcomeV1(before, current),
      beforeProjectRevision: before,
      afterProjectRevision: null,
      currentProjectRevision: current,
      beforeTimelineRevision: beforeTimeline,
      afterTimelineRevision: null,
      beforeCheckpoint: { schemaVersion: 1, checkpointId: 'checkpoint-1', projectId: 'project-1' },
      undoReference: {
        schemaVersion: 1,
        originalReceiptId: 'receipt-0',
        checkpoint: { schemaVersion: 1, checkpointId: 'checkpoint-0', projectId: 'project-1' },
        expectedCurrentProjectRevision: before,
      },
      changedPaths: [],
      proofRequirement: 'required',
      proof: { schemaVersion: 1, status: 'UNVERIFIABLE', observations: [] },
    };

    expect(receipt.afterProjectRevision).toBeNull();
    expect(receipt.currentProjectRevision).toEqual(current);
    expect(receipt.beforeTimelineRevision).toEqual(beforeTimeline);
    expect(receipt.undoReference?.originalReceiptId).toBe('receipt-0');
  });

  it('uses only opaque ExternalReferenceV1 carriers and forbids Session A runtime imports', () => {
    const externalReference = {
      schemaVersion: 1,
      kind: 'external',
      locator: 'if3:brand-snapshot:opaque',
    } satisfies ExternalReferenceV1;
    expect(Object.keys(externalReference).sort()).toEqual(['kind', 'locator', 'schemaVersion']);

    const productionSources = [
      'lib/editron/if1/contracts-v1.ts',
      'lib/editron/if1/project-service-adapter-v1.ts',
    ].map((path) => readFileSync(resolve(process.cwd(), path), 'utf8'));
    for (const source of productionSources) {
      expect(source).not.toMatch(/mutation-gate-v0|mutationSpineV0|editron_project_mutation_operations|CapabilityRegistryEntryV1|ExecutionGraphV1|MediaAssetRef|BrandSnapshotRef|EvidenceRef|CoverageState/i);
    }
  });

  it('publishes an honest candidate manifest rather than a project-wide migration claim', () => {
    expect(EDITRON_IF1_INTEGRATION_MANIFEST_V1).toMatchObject({
      baseSha: '7e9b4dd7ff60beeef2b6dfff4038ca367164cb65',
      migrationStatus: 'contract-freeze-candidate',
      externalBoundary: 'ExternalReferenceV1',
      ownerBoundaryPorts: ['ProjectServiceIF1RevisionIssuerV1'],
      unmigratedProjectWriters: ['Director lock metadata', 'chat render-proof metadata', 'MG child paths'],
    });
  });
});
