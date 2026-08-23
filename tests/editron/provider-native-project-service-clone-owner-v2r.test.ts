import { describe, expect, it, vi } from 'vitest';

import { hashCanonicalJsonV1 }
  from '@/lib/editron/research/open-ended-planner/contracts-v1';
import { createProviderNativeEpisodeResumeCheckpointV2R }
  from '@/lib/editron/research/open-ended-planner/provider-native-episode-resume-v2r';
import { createProviderNativeProjectServiceCloneOwnerV2R }
  from '@/lib/editron/research/open-ended-planner/provider-native-project-service-clone-owner-v2r';
import type { ProviderNativeToolExecutionV2R }
  from '@/lib/editron/research/open-ended-planner/provider-native-tool-episode-v2r';
import type { Project, ProjectRevisionV1 }
  from '@/lib/editron/services/project-service';

const USER_ID = 'user-1';
const PROJECT_ID = 'project-1';
const REVISION: ProjectRevisionV1 = {
  schemaVersion: 1,
  value: 7,
  compatibilityUpdatedAt: '2026-08-23T10:00:00.000Z',
};
const CHECKPOINT = createProviderNativeEpisodeResumeCheckpointV2R({
  route: {
    routeId: 'OPENAI_TERRA', provider: 'openai', model: 'gpt-5.6-terra',
    claimedModelIdentity: 'gpt-5.6-terra', reasoningMode: 'medium',
  },
  episodeId: 'proposal-episode-1',
  contextSha256: 'a'.repeat(64),
  toolSetSha256: 'b'.repeat(64),
  completedTurns: [{ turn: 1, marker: 'committed-prefix' }],
});

describe('ProjectService-backed provider-native proposal clone V2R', () => {
  it('executes only on the clone and finalizes a hash-bound changed-path receipt', async () => {
    const canonical = project();
    const loadProjectForMutation = vi.fn(async () => snapshot(canonical));
    const execute = vi.fn(async ({ project: clone }: { project: Project }) => {
      (clone.overlays[0].styles as Record<string, unknown>).opacity = 0.5;
      return ok({ receipt: { projectRevision: 'local-proposal-r1' } });
    });
    const owner = createProviderNativeProjectServiceCloneOwnerV2R({
      projectService: { loadProjectForMutation },
      isolatedOperatorOwner: { execute },
    });

    const resolved = await owner.resolve(scope());
    expect(resolved.currentRevision.projectRevision)
      .toMatch(/^project-revision-v1:[a-f0-9]{64}$/);
    expect(resolved.currentRevision.projectRevision)
      .toBe(resolved.isolatedClone.projectRevision);
    expect(resolved.currentRevision.readReceiptSha256).toMatch(/^[a-f0-9]{64}$/);
    const proposalRevisionBinding = resolved.isolatedClone.proposalRevisionBinding!;
    expect(proposalRevisionBinding).toMatchObject({
      authority: 'PROJECTSERVICE_ISOLATED_PROPOSAL_REVISION_BINDING',
      canonicalBaseProjectRevision: resolved.currentRevision.projectRevision,
      canonicalBaseStateSha256: resolved.isolatedClone.stateSha256,
      isolatedWorkingProjectRevision: resolved.currentRevision.projectRevision,
      isolatedWorkingStateSha256: resolved.isolatedClone.stateSha256,
    });
    const { bindingSha256, ...bindingMaterial } = proposalRevisionBinding;
    expect(bindingSha256).toBe(hashCanonicalJsonV1(bindingMaterial));

    await expect(resolved.isolatedClone.executeIsolated({
      operatorId: 'set_keyframes', arguments: { overlayId: 'overlay-1' }, turn: 1,
    })).resolves.toMatchObject({ disposition: 'OK' });
    expect((canonical.overlays[0].styles as Record<string, unknown>).opacity).toBe(1);

    const receipt = await resolved.isolatedClone.finalizeProposalReceipt?.();
    expect(receipt).toMatchObject({
      authority: 'PROJECTSERVICE_ISOLATED_PROPOSAL_NO_PROJECT_MUTATION',
      projectId: PROJECT_ID,
      baseProjectRevision: resolved.isolatedClone.projectRevision,
      baseStateSha256: resolved.isolatedClone.stateSha256,
      canonicalUnchanged: true,
      changedPaths: ['$.overlays[0].styles.opacity'],
    });
    expect(receipt?.finalStateSha256).not.toBe(receipt?.baseStateSha256);
    expect(receipt?.operationReceipts).toHaveLength(1);
    const { receiptSha256, ...material } = receipt!;
    expect(receiptSha256).toBe(hashCanonicalJsonV1(material));
    expect(loadProjectForMutation).toHaveBeenCalledTimes(4);
  });

  it('returns a structured conflict before execution when the canonical base is stale', async () => {
    const loadProjectForMutation = vi.fn()
      .mockResolvedValueOnce(snapshot(project()))
      .mockResolvedValueOnce(snapshot(project(revision(8))));
    const execute = vi.fn();
    const resolved = await createProviderNativeProjectServiceCloneOwnerV2R({
      projectService: { loadProjectForMutation }, isolatedOperatorOwner: { execute },
    }).resolve(scope());

    await expect(resolved.isolatedClone.executeIsolated({
      operatorId: 'cut_section', arguments: {}, turn: 1,
    })).resolves.toMatchObject({
      disposition: 'CONFLICT', output: { code: 'PROJECTSERVICE_PROPOSAL_BASE_STALE' },
    });
    expect(execute).not.toHaveBeenCalled();
    await expect(resolved.isolatedClone.finalizeProposalReceipt?.())
      .rejects.toThrow('PROJECTSERVICE_PROPOSAL_BASE_STALE');
  });

  it('discards a speculative clone mutation when the canonical project changes after execution', async () => {
    const canonical = project();
    const newer = project(revision(8));
    const loadProjectForMutation = vi.fn()
      .mockResolvedValueOnce(snapshot(canonical))
      .mockResolvedValueOnce(snapshot(canonical))
      .mockResolvedValueOnce(snapshot(newer));
    const resolved = await createProviderNativeProjectServiceCloneOwnerV2R({
      projectService: { loadProjectForMutation },
      isolatedOperatorOwner: { execute: async ({ project: clone }) => {
        clone.name = 'speculative';
        return ok({});
      } },
    }).resolve(scope());

    await expect(resolved.isolatedClone.executeIsolated({
      operatorId: 'update_title', arguments: {}, turn: 1,
    })).resolves.toMatchObject({
      disposition: 'CONFLICT', output: { code: 'PROJECTSERVICE_PROPOSAL_BASE_STALE' },
    });
    await expect(resolved.isolatedClone.finalizeProposalReceipt?.())
      .rejects.toThrow('PROJECTSERVICE_PROPOSAL_BASE_STALE');
  });

  it('rolls back failed operations and rejects clone identity forgery', async () => {
    const canonical = project();
    let attempt = 0;
    const resolved = await createProviderNativeProjectServiceCloneOwnerV2R({
      projectService: { loadProjectForMutation: async () => snapshot(canonical) },
      isolatedOperatorOwner: { execute: async ({ project: clone }) => {
        attempt += 1;
        if (attempt === 1) {
          clone.name = 'must-not-survive';
          return failure('FORM_UNVERIFIABLE');
        }
        expect(clone.name).toBe('Project');
        clone.projectId = 'forged-project';
        return ok({});
      } },
    }).resolve(scope());

    await expect(resolved.isolatedClone.executeIsolated({
      operatorId: 'first', arguments: {}, turn: 1,
    })).resolves.toMatchObject({ disposition: 'UNVERIFIABLE' });
    await expect(resolved.isolatedClone.executeIsolated({
      operatorId: 'second', arguments: {}, turn: 2,
    })).rejects.toThrow('PROJECTSERVICE_PROPOSAL_CLONE_IDENTITY_MUTATED');
  });

  it('rejects sparse stored state before exposing an isolated executor', async () => {
    const malformed = project();
    malformed.overlays = Array(2) as Project['overlays'];
    await expect(createProviderNativeProjectServiceCloneOwnerV2R({
      projectService: { loadProjectForMutation: async () => snapshot(malformed) },
      isolatedOperatorOwner: { execute: vi.fn() },
    }).resolve(scope())).rejects.toThrow('PROJECTSERVICE_PROPOSAL_STATE_SPARSE_ARRAY');
  });
});

function scope() {
  return {
    tenantId: 'tenant-1', userId: USER_ID, projectId: PROJECT_ID, checkpoint: CHECKPOINT,
  };
}

function snapshot(value: Project) {
  return { project: structuredClone(value), revision: revision(value.projectRevision ?? 0) };
}

function revision(value: number): ProjectRevisionV1 {
  return {
    ...REVISION,
    value,
    compatibilityUpdatedAt: `2026-08-23T10:00:0${value - 7}.000Z`,
  };
}

function project(projectRevision = REVISION): Project {
  return {
    projectId: PROJECT_ID, userId: USER_ID, name: 'Project',
    overlays: [{
      id: 'overlay-1', type: 'text', startFrame: 0, endFrame: 60,
      styles: { opacity: 1 },
    } as unknown as Project['overlays'][number]],
    aspectRatio: '16:9', playerDimensions: { width: 1920, height: 1080 },
    fps: 30, durationInFrames: 60,
    createdAt: new Date('2026-08-23T09:00:00.000Z'),
    updatedAt: new Date(projectRevision.compatibilityUpdatedAt),
    projectRevision: projectRevision.value, visibility: 'private',
  };
}

function ok(output: Record<string, unknown>): Readonly<ProviderNativeToolExecutionV2R> {
  return {
    authority: 'RESEARCH_ISOLATED_NO_PROJECT_MUTATION', disposition: 'OK', output, evidenceIds: [],
  };
}

function failure(code: string): Readonly<ProviderNativeToolExecutionV2R> {
  return {
    authority: 'RESEARCH_ISOLATED_NO_PROJECT_MUTATION', disposition: 'UNVERIFIABLE',
    output: { code, message: 'The isolated owner could not prove the requested form.' },
    evidenceIds: [],
  };
}
