import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { describe, expect, it } from 'vitest';

import {
  canonicalCommandHashV1,
  createTimelineRevisionRefV1,
  resolveOutcomeProofStatusV1,
  scopedReplayKeyV1,
  staleProjectRevisionOutcomeV1,
  staleTimelineResolutionOutcomeV1,
  timelineRevisionEqualsV1,
  unsafeUndoOutcomeV1,
  type ActorRefV1,
  type ExternalReferenceV1,
  type PostCommandIRV1,
  type ProjectRevisionRefV1,
} from '@/lib/editron/if1/contracts-v1';
import { EDITRON_IF1_INTEGRATION_MANIFEST_V1 } from '@/lib/editron/if1/integration-manifest-v1';
import {
  createProjectServiceIf1RevisionAdapterV1,
  type ProjectServiceIF1RevisionOwnerV1,
} from '@/lib/editron/if1/project-service-adapter-v1';

const actor = (actorId: string): ActorRefV1 => ({ schemaVersion: 1, kind: 'user', actorId });
const nativeRevision = (value: number) => ({
  schemaVersion: 1 as const,
  value,
  compatibilityUpdatedAt: `2026-08-09T00:00:0${value}.000Z`,
});

function projectServiceRevisionOwner(): ProjectServiceIF1RevisionOwnerV1 {
  const revisions = new Map<string, ReturnType<typeof nativeRevision>>();
  return {
    issueProjectRevisionRefV1(native) {
      const reference: ProjectRevisionRefV1 = Object.freeze({
        schemaVersion: 1,
        token: `project-service-owned:${native.value}:${native.compatibilityUpdatedAt}`,
      }) as ProjectRevisionRefV1;
      revisions.set(reference.token, native);
      return reference;
    },
    decodeProjectRevisionRefV1(reference) {
      const native = revisions.get(reference.token);
      if (!native) throw new Error('Unknown ProjectRevisionRefV1 cannot be decoded outside ProjectService ownership.');
      return native;
    },
  };
}

function command(input: { actorId: string; projectId: string; operationId: string }): PostCommandIRV1 {
  return {
    schemaVersion: 1,
    commandType: 'overlay.update',
    actor: actor(input.actorId),
    projectId: input.projectId,
    operationId: input.operationId,
    target: { schemaVersion: 1, kind: 'overlay-id', selector: 'overlay-17' },
    parameters: { content: 'Approved overlay content' },
  };
}

describe('Editron IF1 freeze candidate', () => {
  it('round-trips an opaque ProjectRevision only through the ProjectService adapter', () => {
    const native = nativeRevision(7);
    const adapter = createProjectServiceIf1RevisionAdapterV1(projectServiceRevisionOwner());
    const reference = adapter.referenceFromReceipt({
      schemaVersion: 1,
      projectId: 'project-1',
      revision: native,
      committedAt: '2026-08-09T00:00:07.000Z',
    });

    expect(reference).toEqual({ schemaVersion: 1, token: expect.stringMatching(/^project-service-owned:/) });
    expect(reference).not.toHaveProperty('value');
    expect(reference).not.toHaveProperty('compatibilityUpdatedAt');
    expect(adapter.nativeRevisionForProjectService(reference)).toEqual(native);
    expect(() => adapter.nativeRevisionForProjectService({ schemaVersion: 1, token: 'forged' } as ProjectRevisionRefV1)).toThrow(/cannot be decoded/);
  });

  it('hashes UI and chat-equivalent command intent identically', () => {
    const ui = command({ actorId: 'user-ui', projectId: 'project-ui', operationId: 'ui-op' });
    const chat = command({ actorId: 'user-chat', projectId: 'project-chat', operationId: 'chat-op' });

    expect(canonicalCommandHashV1(ui)).toEqual(canonicalCommandHashV1(chat));
  });

  it('keeps actor and project isolation outside hash-based replay authority', () => {
    const first = command({ actorId: 'user-a', projectId: 'project-a', operationId: 'retry-1' });
    const second = command({ actorId: 'user-b', projectId: 'project-b', operationId: 'retry-1' });
    const hash = canonicalCommandHashV1(first);

    expect(hash).toEqual(canonicalCommandHashV1(second));
    expect(scopedReplayKeyV1({ actor: first.actor, projectId: first.projectId, operationId: 'retry-1', commandHash: hash }))
      .not.toEqual(scopedReplayKeyV1({ actor: second.actor, projectId: second.projectId, operationId: 'retry-1', commandHash: hash }));

    const sameActorInOtherOrganization: ActorRefV1 = {
      ...first.actor,
      organizationId: 'org-b',
    };
    expect(scopedReplayKeyV1({ actor: first.actor, projectId: first.projectId, operationId: 'retry-1', commandHash: hash }))
      .not.toEqual(scopedReplayKeyV1({ actor: sameActorInOtherOrganization, projectId: first.projectId, operationId: 'retry-1', commandHash: hash }));
  });

  it('defines timeline equality by projection token and retains project revision as provenance', () => {
    const adapter = createProjectServiceIf1RevisionAdapterV1(projectServiceRevisionOwner());
    const basisOne = adapter.referenceFromReceipt({ schemaVersion: 1, projectId: 'project-1', revision: nativeRevision(1), committedAt: '2026-08-09T00:00:01.000Z' });
    const basisTwo = adapter.referenceFromReceipt({ schemaVersion: 1, projectId: 'project-1', revision: nativeRevision(2), committedAt: '2026-08-09T00:00:02.000Z' });
    const sameProjection = { overlays: [{ id: 'overlay-17', from: 0, to: 90 }] };
    const first = createTimelineRevisionRefV1({ semanticProjection: sameProjection, basisProjectRevision: basisOne });
    const second = createTimelineRevisionRefV1({ semanticProjection: sameProjection, basisProjectRevision: basisTwo });
    const changed = createTimelineRevisionRefV1({
      semanticProjection: { overlays: [{ id: 'overlay-17', from: 0, to: 91 }] },
      basisProjectRevision: basisTwo,
    });

    expect(timelineRevisionEqualsV1(first, second)).toBe(true);
    expect(timelineRevisionEqualsV1(first, changed)).toBe(false);
  });

  it('represents stale project, stale timeline, and unsafe undo as zero-mutation outcomes', () => {
    const adapter = createProjectServiceIf1RevisionAdapterV1(projectServiceRevisionOwner());
    const expectedProject = adapter.referenceFromReceipt({ schemaVersion: 1, projectId: 'project-1', revision: nativeRevision(3), committedAt: '2026-08-09T00:00:03.000Z' });
    const currentProject = adapter.referenceFromReceipt({ schemaVersion: 1, projectId: 'project-1', revision: nativeRevision(4), committedAt: '2026-08-09T00:00:04.000Z' });
    const expectedTimeline = createTimelineRevisionRefV1({ semanticProjection: { cut: 1 }, basisProjectRevision: expectedProject });
    const currentTimeline = createTimelineRevisionRefV1({ semanticProjection: { cut: 2 }, basisProjectRevision: currentProject });

    expect(staleProjectRevisionOutcomeV1(expectedProject, currentProject)).toMatchObject({
      kind: 'stale-project-revision', zeroMutation: true, retryDisposition: 'RELOAD_PROJECT_AND_REPLAN',
    });
    expect(staleTimelineResolutionOutcomeV1(expectedTimeline, currentTimeline)).toMatchObject({
      kind: 'stale-timeline-resolution', zeroMutation: true, retryDisposition: 'RELOAD_TIMELINE_AND_RESOLVE',
    });
    expect(unsafeUndoOutcomeV1()).toEqual({
      kind: 'unsafe-undo',
      code: 'unsafe-undo',
      ownerCode: 'CHECKPOINT_RESTORE_UNSAFE_UNDO',
      zeroMutation: true,
      retryDisposition: 'UNSAFE_UNDO',
    });
  });

  it('treats missing required proof as UNVERIFIABLE and proof-not-required separately', () => {
    expect(resolveOutcomeProofStatusV1({ required: true })).toBe('UNVERIFIABLE');
    expect(resolveOutcomeProofStatusV1({ required: true, observed: 'PASS' })).toBe('PASS');
    expect(resolveOutcomeProofStatusV1({ required: false })).toBe('NOT_REQUIRED');
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
      unmigratedProjectWriters: ['Director lock metadata', 'chat render-proof metadata', 'MG child paths'],
    });
  });
});
