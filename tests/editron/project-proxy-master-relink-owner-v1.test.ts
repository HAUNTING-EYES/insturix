import {
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from 'vitest';

import {
  OverlayType,
  type ClipOverlay,
} from '@/components/editron/editor/version-7.0.0/types';
import type { AudioRightsContract }
  from '@/lib/editron/shared/render-request-payload';
import { hashEditronCanonicalJsonV1 }
  from '@/lib/editron/services/canonical-json-v1';
import {
  resolveMediaProxyMasterExactBoundariesV1,
  type MediaProxyMasterExactBoundaryResolutionReceiptV1,
} from '@/lib/editron/services/media-proxy-master-exact-boundary-resolver-v1';
import {
  createProjectProxySourceBindingV1,
  type ProjectProxySourceBindingOverlayV1,
} from '@/lib/editron/services/project-proxy-master-relink-contract-v1';
import {
  createProjectVideoSourceVersionPinV1,
  PROJECT_VIDEO_SOURCE_VERSION_PIN_OWNER_V1,
} from '@/lib/editron/services/project-video-source-version-pin-v1';
import {
  ProjectMutationWriteError,
  ProjectProxyMasterRelinkBlockedErrorV1,
  projectService,
  type Project,
  type ProjectProxyMasterRelinkCommandV1,
  type ProjectRevisionV1,
  type ProjectTimelineRangeCutLockV1,
} from '@/lib/editron/services/project-service';
import {
  buildMediaProxyMasterExactBoundaryFixtureV1,
  type MediaProxyMasterExactBoundaryFixtureV1,
} from './helpers/media-proxy-master-exact-boundary-fixture';

const persistence = vi.hoisted(() => ({
  assetFindOne: vi.fn(),
  collection: vi.fn(),
  getDatabase: vi.fn(),
  projectFindOne: vi.fn(),
  projectUpdateOne: vi.fn(),
}));

vi.mock('@/lib/editron/db/mongodb', () => ({
  COLLECTIONS: {
    PROJECTS: 'editron_prev.projects',
    MEDIA_ASSETS: 'mediaAssets',
  },
  connectToDatabase: vi.fn(),
  getDatabase: persistence.getDatabase,
}));
vi.mock('@/lib/editron/services/asset-resolver', () => ({
  assetResolver: {
    resolveProjectAssets: vi.fn(async (overlays) => overlays),
    stripUrlsForLLM: vi.fn((overlays) => overlays),
  },
}));
vi.mock('@/lib/services/orgMemberService', () => ({
  orgMemberService: { isMember: vi.fn() },
}));
vi.mock('@/lib/shared/project-links', () => ({
  removeProjectFromLinks: vi.fn(),
}));
vi.mock('@/lib/services/org-wallet-flag', () => ({
  isOrgWalletBillingEnabled: vi.fn(() => false),
}));

const PROJECT_ID = 'project-proxy-master-relink';
const REVISION: ProjectRevisionV1 = {
  schemaVersion: 1,
  value: 7,
  compatibilityUpdatedAt: '2026-08-31T10:04:30.000Z',
};

let fixture: MediaProxyMasterExactBoundaryFixtureV1;
let boundaryResolution: MediaProxyMasterExactBoundaryResolutionReceiptV1;
let userId: string;
let assetId: string;

describe('ProjectService proxy/master relink owner V1', () => {
  beforeAll(async () => {
    fixture = await buildMediaProxyMasterExactBoundaryFixtureV1({
      tag: 'project-relink-offset',
      cadence: 'OFFSET',
    });
    userId = String(fixture.asset.userId);
    assetId = String(fixture.asset.assetId);
    const result = await resolveMediaProxyMasterExactBoundariesV1({
      activeMappingState: fixture.activeMappingState,
      proxyBoundaryOrdinals: ['0', '2', '4'],
      resolutionPolicy: {
        policyVersion: 'project-relink-boundaries-v1',
        maxBoundaryQueries: 10,
        maxBatchReads: 10,
        maxTotalArtifactBytes: 16 * 1024 * 1024,
      },
      reader: {
        async read(reference) {
          const stored = fixture.objects.get(reference.objectKey);
          if (!stored) throw new Error('TEST_PRIVATE_OBJECT_MISSING');
          return structuredClone(stored);
        },
      },
      resolvedAt: new Date('2026-08-31T10:06:00.000Z'),
    });
    if (result.disposition !== 'EXACT_PROXY_BOUNDARIES_RESOLVED') {
      throw new Error(`TEST_BOUNDARY_RESOLUTION_FAILED:${result.reason}`);
    }
    boundaryResolution = result;
  });

  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-08-31T10:07:00.000Z'));
    persistence.assetFindOne.mockReset();
    persistence.collection.mockReset();
    persistence.getDatabase.mockReset();
    persistence.projectFindOne.mockReset();
    persistence.projectUpdateOne.mockReset();
    persistence.projectUpdateOne.mockResolvedValue({
      matchedCount: 1,
      modifiedCount: 1,
    });
    persistence.collection.mockImplementation((name: string) => {
      if (name === 'mediaAssets') {
        return { findOne: persistence.assetFindOne };
      }
      return {
        findOne: persistence.projectFindOne,
        updateOne: persistence.projectUpdateOne,
      };
    });
    persistence.getDatabase.mockResolvedValue({
      collection: persistence.collection,
    });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('revision-CAS relinks exact non-identity source boundaries and persists pending invalidation plus rollback evidence', async () => {
    const before = project();
    useStablePersistence(before);

    const captured = await projectService.captureMutationReceipts(() =>
      projectService.relinkProjectProxyToQualifiedMasterV1(
        userId,
        PROJECT_ID,
        command(),
      ));

    expect(captured.value).toMatchObject({
      disposition: 'APPLIED',
      commitReceipt: {
        state: {
          projectId: PROJECT_ID,
          assetId,
          proxySourceVersionSha256:
            fixture.qualification.relation.proxy.sourceVersionSha256,
          masterSourceVersionSha256:
            fixture.qualification.relation.master.sourceVersionSha256,
          projectBindingRevalidation:
            'SATISFIED_BY_PROJECT_DOCUMENT_CAS',
          downstreamInvalidation: { status: 'PENDING_OWNER_EXECUTION' },
          rollback: {
            status: 'AVAILABLE_FROM_RELINK_STATE',
            restoresProxyCoordinates: true,
          },
          overlayChanges: [
            {
              overlayId: 10,
              proxySourceStartFrame: 0,
              proxySourceEndFrameExclusive: 2,
              masterSourceStartFrame: 0,
              masterSourceEndFrameExclusive: 1,
            },
            {
              overlayId: 20,
              proxySourceStartFrame: 2,
              proxySourceEndFrameExclusive: 4,
              masterSourceStartFrame: 1,
              masterSourceEndFrameExclusive: 4,
            },
          ],
        },
        mutationReceipt: { revision: { value: 8 } },
      },
    });
    expect(captured.receipts).toEqual([
      captured.value.commitReceipt.mutationReceipt,
    ]);
    expect(persistence.assetFindOne).toHaveBeenCalledTimes(3);
    expect(persistence.projectUpdateOne).toHaveBeenCalledTimes(1);
    const [filter, update] = persistence.projectUpdateOne.mock.calls[0]!;
    expect(filter).toMatchObject({
      projectId: PROJECT_ID,
      userId,
      projectRevision: 7,
      updatedAt: new Date(REVISION.compatibilityUpdatedAt),
    });
    expect(update.$inc).toEqual({ projectRevision: 1 });
    expect(update.$set.overlays).toHaveLength(2);
    expect(update.$set.overlays[0]).toMatchObject({
      id: 10,
      from: 0,
      durationInFrames: 2,
      sourceStartFrame: 0,
      sourceEndFrame: 1,
      videoStartTime: 0,
    });
    expect(update.$set.overlays[1]).toMatchObject({
      id: 20,
      from: 2,
      durationInFrames: 2,
      sourceStartFrame: 1,
      sourceEndFrame: 4,
      videoStartTime: 1,
    });
    for (const overlay of update.$set.overlays as ClipOverlay[]) {
      expect(overlay.sourceVersionPinV1).toMatchObject({
        writerAuthority: PROJECT_VIDEO_SOURCE_VERSION_PIN_OWNER_V1,
        projectId: PROJECT_ID,
        overlayId: overlay.id,
        assetId,
        sourceRole: 'MASTER',
        sourceVersionSha256:
          fixture.qualification.relation.master.sourceVersionSha256,
        storageVersionSha256:
          fixture.qualification.relation.master.storageVersionSha256,
        authority: {
          kind: 'PROJECT_PROXY_MASTER_RELINK',
          relinkStateSha256:
            captured.value.commitReceipt.state.stateSha256,
          relationSha256:
            captured.value.commitReceipt.state.relationSha256,
          activeMappingStateSha256:
            captured.value.commitReceipt.state.activeMappingStateSha256,
        },
        issuedAt: '2026-08-31T10:07:00.000Z',
      });
    }
    expect(update.$set.proxyMasterRelinkStatesV1).toEqual([
      captured.value.commitReceipt.state,
    ]);
  });

  it('returns the original receipt on idempotent redelivery without another write', async () => {
    const before = project();
    useStablePersistence(before);
    const first = await projectService.relinkProjectProxyToQualifiedMasterV1(
      userId,
      PROJECT_ID,
      command(),
    );
    if (first.disposition !== 'APPLIED') {
      throw new Error('TEST_EXPECTED_FIRST_RELINK');
    }
    const committedSet = persistence.projectUpdateOne.mock.calls[0]![1].$set;
    persistence.projectFindOne.mockResolvedValue({
      ...before,
      ...committedSet,
      projectRevision: 8,
      updatedAt: committedSet.updatedAt,
    });
    persistence.projectUpdateOne.mockClear();

    const replay = await projectService.relinkProjectProxyToQualifiedMasterV1(
      userId,
      PROJECT_ID,
      command(),
    );

    expect(replay).toEqual({
      disposition: 'UNCHANGED',
      commitReceipt: first.commitReceipt,
    });
    expect(persistence.projectUpdateOne).not.toHaveBeenCalled();
  });

  it('blocks stale project revisions before the project CAS', async () => {
    useStablePersistence(project());
    await expect(projectService.relinkProjectProxyToQualifiedMasterV1(
      userId,
      PROJECT_ID,
      command({
        expectedRevision: {
          ...REVISION,
          value: REVISION.value - 1,
        },
      }),
    )).rejects.toMatchObject({
      code: 'PROJECT_REVISION_CONFLICT',
      currentRevision: REVISION,
    });
    expect(persistence.projectUpdateOne).not.toHaveBeenCalled();
  });

  it('blocks missing, stale, and post-activation proxy source bindings', async () => {
    useStablePersistence(project({ includeBinding: false }));
    await expectRelinkBlock('SOURCE_BINDING_NOT_FOUND');

    const staleRevision = {
      ...REVISION,
      compatibilityUpdatedAt: '2026-08-31T10:04:00.000Z',
    };
    useStablePersistence(project({ bindingRevision: staleRevision }));
    await expectRelinkBlock('SOURCE_BINDING_STALE_OR_MISMATCHED');

    const postActivationRevision = {
      ...REVISION,
      compatibilityUpdatedAt: '2026-08-31T10:05:30.000Z',
    };
    useStablePersistence(project({
      revision: postActivationRevision,
      bindingRevision: postActivationRevision,
    }));
    await expectRelinkBlock('SOURCE_BINDING_STALE_OR_MISMATCHED', {
      expectedRevision: postActivationRevision,
    });

    useStablePersistence(project({
      bindingTimeMapReferenceSha256: '0'.repeat(64),
    }));
    await expectRelinkBlock('SOURCE_BINDING_STALE_OR_MISMATCHED');
    expect(persistence.projectUpdateOne).not.toHaveBeenCalled();
  });

  it('blocks incomplete source ranges and conflicting legacy start aliases', async () => {
    const missingEnd = project();
    delete (missingEnd.overlays[0] as ClipOverlay).sourceEndFrame;
    useStablePersistence(missingEnd);
    await expectRelinkBlock('SOURCE_RANGE_INCOMPLETE');

    const aliasesConflict = project();
    (aliasesConflict.overlays[0] as ClipOverlay).videoStartTime = 1;
    useStablePersistence(aliasesConflict);
    await expectRelinkBlock('SOURCE_COORDINATE_CONFLICT');
    expect(persistence.projectUpdateOne).not.toHaveBeenCalled();
  });

  it('blocks missing or tampered proxy source pins before relink', async () => {
    const missing = project();
    delete (missing.overlays[0] as ClipOverlay).sourceVersionPinV1;
    useStablePersistence(missing);
    await expectRelinkBlock('SOURCE_PIN_MISSING_OR_INVALID');

    const tampered = project();
    const pin = (tampered.overlays[0] as ClipOverlay).sourceVersionPinV1;
    if (!pin) throw new Error('TEST_PROXY_PIN_MISSING');
    (tampered.overlays[0] as ClipOverlay).sourceVersionPinV1 = {
      ...pin,
      assetId: 'asset-tampered',
    };
    useStablePersistence(tampered);
    await expectRelinkBlock('SOURCE_PIN_MISSING_OR_INVALID');
    expect(persistence.projectUpdateOne).not.toHaveBeenCalled();
  });

  it('blocks forged boundary evidence and invalid playable-audio rights', async () => {
    useStablePersistence(project());
    const forged = structuredClone(boundaryResolution);
    (forged.resolvedBoundaries[1] as { masterBoundaryOrdinal: string })
      .masterBoundaryOrdinal = '2';
    await expectRelinkBlock('BOUNDARY_EVIDENCE_INVALID', {
      boundaryResolution: forged,
    });

    persistence.projectFindOne.mockResolvedValue(project());
    persistence.assetFindOne.mockResolvedValue({
      ...asset(),
      audioRights: { ...rights(), licensed: false },
    });
    await expectRelinkBlock('AUDIO_RIGHTS_REQUIRED_OR_INVALID');
    expect(persistence.projectUpdateOne).not.toHaveBeenCalled();
  });

  it('honors an active overlapping timeline lock', async () => {
    useStablePersistence(project({ locks: [activeLock()] }));
    await expect(projectService.relinkProjectProxyToQualifiedMasterV1(
      userId,
      PROJECT_ID,
      command(),
    )).rejects.toMatchObject({
      code: 'PROJECT_TIMELINE_RANGE_LOCKED',
      blockingLockIds: ['timeline-cut-lock_123456789012345678'],
    });
    expect(persistence.projectUpdateOne).not.toHaveBeenCalled();
  });

  it('blocks an audio-rights change before CAS and never writes', async () => {
    persistence.projectFindOne.mockResolvedValue(project());
    persistence.assetFindOne
      .mockResolvedValueOnce(asset())
      .mockResolvedValueOnce(asset({
        audioRights: rights('2026-08-31T10:04:31.000Z'),
      }));

    await expectRelinkBlock('ASSET_CHANGED_BEFORE_COMMIT');
    expect(persistence.projectUpdateOne).not.toHaveBeenCalled();
  });

  it('does not report success when the asset changes or becomes unavailable after commit', async () => {
    persistence.projectFindOne.mockResolvedValue(project());
    persistence.assetFindOne
      .mockResolvedValueOnce(asset())
      .mockResolvedValueOnce(asset())
      .mockResolvedValueOnce(asset({
        audioRights: rights('2026-08-31T10:04:31.000Z'),
      }));
    await expect(projectService.relinkProjectProxyToQualifiedMasterV1(
      userId,
      PROJECT_ID,
      command(),
    )).resolves.toMatchObject({
      disposition: 'COMMITTED_REVALIDATION_REQUIRED',
      reason: 'ASSET_CHANGED_AFTER_COMMIT',
    });

    persistence.projectFindOne.mockResolvedValue(project());
    persistence.projectUpdateOne.mockClear();
    persistence.assetFindOne
      .mockReset()
      .mockResolvedValueOnce(asset())
      .mockResolvedValueOnce(asset())
      .mockRejectedValueOnce(new Error('TEST_ASSET_STORE_UNAVAILABLE'));
    await expect(projectService.relinkProjectProxyToQualifiedMasterV1(
      userId,
      PROJECT_ID,
      command(),
    )).resolves.toMatchObject({
      disposition: 'COMMITTED_REVALIDATION_REQUIRED',
      reason: 'ASSET_REVALIDATION_UNAVAILABLE',
    });
    expect(persistence.projectUpdateOne).toHaveBeenCalledTimes(1);
  });

  it('blocks every generic project-update path from forging binding or relink state', async () => {
    await expect(projectService.updateProject(userId, PROJECT_ID, {
      proxySourceBindingsV1: [],
    })).rejects.toBeInstanceOf(ProjectMutationWriteError);
    await expect(projectService.saveProjectWithReceipt(
      userId,
      PROJECT_ID,
      {
        overlays: [],
        aspectRatio: '16:9',
        playerDimensions: { width: 1920, height: 1080 },
      },
      {
        expectedRevision: REVISION,
        projectUpdates: { proxyMasterRelinkStatesV1: [] },
      },
    )).rejects.toBeInstanceOf(ProjectMutationWriteError);
    expect(persistence.getDatabase).not.toHaveBeenCalled();
  });
});

function command(
  overrides: Partial<ProjectProxyMasterRelinkCommandV1> = {},
): ProjectProxyMasterRelinkCommandV1 {
  return {
    expectedRevision: REVISION,
    actorKind: 'SYSTEM',
    assetId,
    boundaryResolution,
    ...overrides,
  };
}

async function expectRelinkBlock(
  reason: ProjectProxyMasterRelinkBlockedErrorV1['reason'],
  overrides: Partial<ProjectProxyMasterRelinkCommandV1> = {},
): Promise<void> {
  await expect(projectService.relinkProjectProxyToQualifiedMasterV1(
    userId,
    PROJECT_ID,
    command(overrides),
  )).rejects.toMatchObject({
    code: 'PROJECT_PROXY_MASTER_RELINK_BLOCKED',
    reason,
  });
}

function useStablePersistence(value: Project): void {
  persistence.projectFindOne.mockResolvedValue(structuredClone(value));
  persistence.assetFindOne.mockImplementation(async () =>
    structuredClone(asset()));
}

function project(options: Readonly<{
  includeBinding?: boolean;
  revision?: ProjectRevisionV1;
  bindingRevision?: ProjectRevisionV1;
  bindingTimeMapReferenceSha256?: string;
  locks?: ProjectTimelineRangeCutLockV1[];
}> = {}): Project {
  const revision = options.revision ?? REVISION;
  const bindingRevision = options.bindingRevision ?? revision;
  const baseOverlays = clips();
  const sourceBinding = options.includeBinding === false
    ? null
    : createProjectProxySourceBindingV1({
        projectId: PROJECT_ID,
        assetId,
        actorKind: 'SYSTEM',
        proxySourceVersionSha256:
          fixture.qualification.relation.proxy.sourceVersionSha256,
        verifiedSourceBindingSha256: hashEditronCanonicalJsonV1({
          kind: 'TEST_VERIFIED_PROXY_SOURCE_BINDING',
          proxyTimeMap: fixture.qualification.mapping.proxyTimeMap,
        }),
        proxyTimeMapReferenceSha256:
          options.bindingTimeMapReferenceSha256
            ?? hashEditronCanonicalJsonV1(
              fixture.qualification.mapping.proxyTimeMap,
            ),
        projectRevision: bindingRevision,
        overlays: bindingOverlays(baseOverlays),
        boundAt: new Date(bindingRevision.compatibilityUpdatedAt),
      });
  const overlays = sourceBinding
    ? baseOverlays.map((overlay) => ({
        ...overlay,
        sourceVersionPinV1: createProjectVideoSourceVersionPinV1({
          projectId: PROJECT_ID,
          overlayId: overlay.id,
          assetId,
          sourceRole: 'PROXY',
          sourceVersionSha256:
            fixture.qualification.relation.proxy.sourceVersionSha256,
          storageVersionSha256:
            fixture.qualification.relation.proxy.storageVersionSha256,
          authority: {
            kind: 'PROJECT_PROXY_SOURCE_BINDING',
            bindingSha256: sourceBinding.bindingSha256,
            proxyTimeMapReferenceSha256:
              sourceBinding.proxyTimeMapReferenceSha256,
          },
          issuedAt: new Date(sourceBinding.boundAt),
        }),
      }))
    : baseOverlays;
  return {
    projectId: PROJECT_ID,
    userId,
    name: 'Proxy/master relink project',
    overlays,
    aspectRatio: '16:9',
    playerDimensions: { width: 1920, height: 1080 },
    fps: 30,
    durationInFrames: 4,
    createdAt: new Date('2026-08-31T10:00:00.000Z'),
    updatedAt: new Date(revision.compatibilityUpdatedAt),
    projectRevision: revision.value,
    ...(sourceBinding
      ? { proxySourceBindingsV1: [sourceBinding] }
      : {}),
    ...(options.locks ? { timelineRangeCutLocks: options.locks } : {}),
    visibility: 'private',
  };
}

function clips(): ClipOverlay[] {
  return [clip(10, 0, 0, 2), clip(20, 2, 2, 4)];
}

function clip(
  id: number,
  from: number,
  sourceStartFrame: number,
  sourceEndFrame: number,
): ClipOverlay {
  return {
    id,
    type: OverlayType.VIDEO,
    assetId,
    content: `asset:${assetId}`,
    from,
    durationInFrames: 2,
    sourceStartFrame,
    sourceEndFrame,
    videoStartTime: sourceStartFrame,
    height: 1080,
    width: 1920,
    left: 0,
    top: 0,
    row: 0,
    rotation: 0,
    isDragging: false,
    styles: { opacity: 1 },
  };
}

function bindingOverlays(
  overlays: readonly ClipOverlay[],
): ProjectProxySourceBindingOverlayV1[] {
  return overlays.map((overlay) => ({
    overlayId: overlay.id,
    timelineStartFrame: overlay.from,
    timelineEndFrameExclusive: overlay.from + overlay.durationInFrames,
    proxySourceStartFrame: overlay.sourceStartFrame!,
    proxySourceEndFrameExclusive: overlay.sourceEndFrame!,
    sourceStartFrameWasExplicit: true,
    sourceEndFrameWasExplicit: true,
    videoStartTimeWasExplicit: true,
  }));
}

function asset(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    ...structuredClone(fixture.asset),
    audioRights: rights(),
    ...overrides,
  };
}

function rights(
  attestedAt = '2026-08-31T10:04:00.000Z',
): AudioRightsContract {
  return {
    mediaRole: 'native-video',
    source: 'user-upload',
    userChoice: 'attested',
    licensed: true,
    evidence: {
      kind: 'user-attestation',
      sourceAssetId: assetId,
      attestationVersion: 'audio-rights-attestation-v1',
      attestedAt,
      attestedBy: userId,
    },
  };
}

function activeLock(): ProjectTimelineRangeCutLockV1 {
  return {
    schemaVersion: 1,
    lockId: 'timeline-cut-lock_123456789012345678',
    actorKind: 'AGENT',
    frameRange: { startFrame: 1, endFrame: 3 },
    acquiredAt: '2026-08-31T10:06:30.000Z',
    expiresAt: '2026-08-31T10:08:00.000Z',
  };
}
