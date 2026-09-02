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
import {
  PROJECT_PROXY_SOURCE_BINDING_OWNER_V1,
} from '@/lib/editron/services/project-proxy-master-relink-contract-v1';
import { PROJECT_VIDEO_SOURCE_VERSION_PIN_OWNER_V1 }
  from '@/lib/editron/services/project-video-source-version-pin-v1';
import {
  ProjectMutationWriteError,
  ProjectProxySourceBindingBlockedErrorV1,
  projectService,
  type Project,
  type ProjectProxySourceBindingCommandV1,
  type ProjectRevisionV1,
} from '@/lib/editron/services/project-service';
import { buildVerifiedProxySourceV3FixtureV1 }
  from './helpers/verified-proxy-source-v3-fixture';

const persistence = vi.hoisted(() => ({
  assetFindOne: vi.fn(),
  collection: vi.fn(),
  getDatabase: vi.fn(),
  insertOne: vi.fn(),
  outboxFindOne: vi.fn(),
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

const PROJECT_ID = 'project-proxy-source-binding';
const REVISION: ProjectRevisionV1 = {
  schemaVersion: 1,
  value: 4,
  compatibilityUpdatedAt: '2026-08-31T09:04:00.000Z',
};

type VerifiedFixtureV1 = Awaited<
ReturnType<typeof buildVerifiedProxySourceV3FixtureV1>
>;

let fixture: VerifiedFixtureV1;
let driftFixture: VerifiedFixtureV1;

describe('ProjectService verified proxy source-binding owner V1', () => {
  beforeAll(async () => {
    fixture = await buildVerifiedProxySourceV3FixtureV1({
      tag: 'project-binding',
    });
    driftFixture = await buildVerifiedProxySourceV3FixtureV1({
      tag: 'project-binding',
      frameDurations: [
        '1500', '4500', '1500', '4500', '3000', '3000',
      ],
    });
    if (fixture.assetId !== driftFixture.assetId
      || fixture.verifiedBinding.bindingSha256
        === driftFixture.verifiedBinding.bindingSha256) {
      throw new Error('TEST_PROXY_BINDING_DRIFT_FIXTURE_INVALID');
    }
  });

  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-08-31T09:05:00.000Z'));
    persistence.assetFindOne.mockReset();
    persistence.collection.mockReset();
    persistence.getDatabase.mockReset();
    persistence.insertOne.mockReset().mockResolvedValue({ acknowledged: true });
    persistence.outboxFindOne.mockReset().mockResolvedValue(null);
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
      if (name === 'editron_project_render_snapshot_invalidation_outbox_v1') {
        return {
          findOne: persistence.outboxFindOne,
          insertOne: persistence.insertOne,
        };
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

  it('binds exact variable-cadence V3 proxy evidence through one project revision CAS', async () => {
    useStablePersistence(project());

    const captured = await projectService.captureMutationReceipts(() =>
      projectService.bindProjectOverlaysToVerifiedProxySourceV1(
        fixture.userId,
        PROJECT_ID,
        command(),
      ));

    expect(captured.value).toMatchObject({
      disposition: 'APPLIED',
      commitReceipt: {
        binding: {
          writerAuthority: PROJECT_PROXY_SOURCE_BINDING_OWNER_V1,
          projectId: PROJECT_ID,
          assetId: fixture.assetId,
          actorKind: 'SYSTEM',
          proxySourceVersionSha256:
            fixture.verifiedBinding.sourceVersionSha256,
          verifiedSourceBindingSha256:
            fixture.verifiedBinding.bindingSha256,
          proxyTimeMapReferenceSha256:
            fixture.proxyTimeMapReferenceSha256,
          projectRevision: {
            value: 5,
            compatibilityUpdatedAt: '2026-08-31T09:05:00.000Z',
          },
          overlays: [
            {
              overlayId: 10,
              timelineStartFrame: 0,
              timelineEndFrameExclusive: 2,
              proxySourceStartFrame: 0,
              proxySourceEndFrameExclusive: 2,
            },
            {
              overlayId: 20,
              timelineStartFrame: 2,
              timelineEndFrameExclusive: 4,
              proxySourceStartFrame: 2,
              proxySourceEndFrameExclusive: 6,
            },
          ],
        },
        mutationReceipt: { revision: { value: 5 } },
      },
      admissionReceipt: {
        disposition:
          'PROJECT_PROXY_SOURCE_BINDING_ADMITTED_AFTER_ASSET_REVALIDATION',
        projectId: PROJECT_ID,
        assetId: fixture.assetId,
        verifiedSourceBindingSha256:
          fixture.verifiedBinding.bindingSha256,
        proxyTimeMapReferenceSha256:
          fixture.proxyTimeMapReferenceSha256,
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
      userId: fixture.userId,
      projectRevision: 4,
      updatedAt: new Date(REVISION.compatibilityUpdatedAt),
    });
    expect(update.$inc).toEqual({ projectRevision: 1 });
    expect(update.$set.overlays).toHaveLength(2);
    for (const overlay of update.$set.overlays as ClipOverlay[]) {
      expect(overlay.sourceVersionPinV1).toMatchObject({
        writerAuthority: PROJECT_VIDEO_SOURCE_VERSION_PIN_OWNER_V1,
        projectId: PROJECT_ID,
        overlayId: overlay.id,
        assetId: fixture.assetId,
        sourceRole: 'PROXY',
        sourceVersionSha256:
          fixture.verifiedBinding.sourceVersionSha256,
        storageVersionSha256:
          fixture.verifiedBinding.storageVersionSha256,
        authority: {
          kind: 'PROJECT_PROXY_SOURCE_BINDING',
          bindingSha256:
            captured.value.commitReceipt.binding.bindingSha256,
          proxyTimeMapReferenceSha256:
            fixture.proxyTimeMapReferenceSha256,
        },
        issuedAt: '2026-08-31T09:05:00.000Z',
      });
    }
    expect(update.$set.proxySourceBindingsV1).toEqual([
      captured.value.commitReceipt.binding,
    ]);
  });

  it('returns the original binding receipt on idempotent redelivery', async () => {
    const before = project();
    useStablePersistence(before);
    const first = await projectService.bindProjectOverlaysToVerifiedProxySourceV1(
      fixture.userId,
      PROJECT_ID,
      command(),
    );
    if (first.disposition !== 'APPLIED') {
      throw new Error('TEST_EXPECTED_BINDING_APPLIED');
    }
    const committedSet = persistence.projectUpdateOne.mock.calls[0]![1].$set;
    persistence.projectFindOne.mockResolvedValue({
      ...before,
      ...committedSet,
      projectRevision: 5,
      updatedAt: committedSet.updatedAt,
    });
    persistence.projectUpdateOne.mockClear();

    const replay = await projectService.bindProjectOverlaysToVerifiedProxySourceV1(
      fixture.userId,
      PROJECT_ID,
      command(),
    );

    expect(replay).toMatchObject({
      disposition: 'UNCHANGED',
      commitReceipt: first.commitReceipt,
      admissionReceipt: {
        commitSha256: first.commitReceipt.commitSha256,
        bindingSha256: first.commitReceipt.binding.bindingSha256,
      },
    });
    expect(persistence.projectUpdateOne).not.toHaveBeenCalled();
  });

  it('blocks stale revisions and an active Director writer lease', async () => {
    useStablePersistence(project());
    await expect(projectService.bindProjectOverlaysToVerifiedProxySourceV1(
      fixture.userId,
      PROJECT_ID,
      command({
        expectedRevision: { ...REVISION, value: REVISION.value - 1 },
      }),
    )).rejects.toMatchObject({
      code: 'PROJECT_REVISION_CONFLICT',
      currentRevision: REVISION,
    });

    useStablePersistence(project({
      directorLock: true,
      directorLockAt: new Date('2026-08-31T09:04:30.000Z'),
    }));
    await expect(projectService.bindProjectOverlaysToVerifiedProxySourceV1(
      fixture.userId,
      PROJECT_ID,
      command(),
    )).rejects.toMatchObject({ code: 'PROJECT_REVISION_CONFLICT' });
    expect(persistence.projectUpdateOne).not.toHaveBeenCalled();
  });

  it('blocks missing, non-proxy, partial, or invalid binding history evidence', async () => {
    persistence.projectFindOne.mockResolvedValue(project());
    persistence.assetFindOne.mockResolvedValue(null);
    await expectBindingBlock('SOURCE_ASSET_NOT_FOUND');

    persistence.assetFindOne.mockResolvedValue({
      ...structuredClone(fixture.asset),
      isProxy: false,
    });
    await expectBindingBlock('VERIFIED_V3_PROXY_SOURCE_REQUIRED');

    const partial = structuredClone(fixture.asset) as Record<string, unknown>;
    delete partial.sourcePtsCadenceMapStateSha256V3;
    persistence.assetFindOne.mockResolvedValue(partial);
    await expectBindingBlock('VERIFIED_V3_PROXY_SOURCE_REQUIRED');

    persistence.projectFindOne.mockResolvedValue(project({
      proxySourceBindingsV1: [{}] as never,
    }));
    persistence.assetFindOne.mockResolvedValue(structuredClone(fixture.asset));
    await expectBindingBlock('BINDING_HISTORY_INVALID');
    expect(persistence.projectUpdateOne).not.toHaveBeenCalled();
  });

  it('blocks incomplete, conflicting, duplicate, out-of-range, and absent target ranges', async () => {
    const missingEnd = project();
    delete (missingEnd.overlays[0] as ClipOverlay).sourceEndFrame;
    useStablePersistence(missingEnd);
    await expectBindingBlock('SOURCE_RANGE_INCOMPLETE');

    const conflict = project();
    (conflict.overlays[0] as ClipOverlay).videoStartTime = 1;
    useStablePersistence(conflict);
    await expectBindingBlock('SOURCE_COORDINATE_CONFLICT');

    const duplicate = project();
    duplicate.overlays[1]!.id = duplicate.overlays[0]!.id;
    useStablePersistence(duplicate);
    await expectBindingBlock('TARGET_OVERLAY_IDENTITY_INVALID');

    const outOfRange = project();
    (outOfRange.overlays[1] as ClipOverlay).sourceEndFrame = 7;
    useStablePersistence(outOfRange);
    await expectBindingBlock('SOURCE_RANGE_INVALID');

    useStablePersistence(project({ overlays: [] }));
    await expectBindingBlock('TARGET_OVERLAYS_NOT_FOUND');
    expect(persistence.projectUpdateOne).not.toHaveBeenCalled();
  });

  it('blocks a valid V3 proxy change before CAS and emits no write', async () => {
    persistence.projectFindOne.mockResolvedValue(project());
    persistence.assetFindOne
      .mockResolvedValueOnce(structuredClone(fixture.asset))
      .mockResolvedValueOnce(structuredClone(driftFixture.asset));

    await expectBindingBlock('ASSET_CHANGED_BEFORE_COMMIT');
    expect(persistence.projectUpdateOne).not.toHaveBeenCalled();
  });

  it('does not report success after a post-CAS asset change or read outage', async () => {
    persistence.projectFindOne.mockResolvedValue(project());
    persistence.assetFindOne
      .mockResolvedValueOnce(structuredClone(fixture.asset))
      .mockResolvedValueOnce(structuredClone(fixture.asset))
      .mockResolvedValueOnce(structuredClone(driftFixture.asset));
    const changed = await projectService.bindProjectOverlaysToVerifiedProxySourceV1(
      fixture.userId,
      PROJECT_ID,
      command(),
    );
    expect(changed).toMatchObject({
      disposition: 'COMMITTED_REVALIDATION_REQUIRED',
      reason: 'ASSET_CHANGED_AFTER_COMMIT',
    });
    expect(changed).not.toHaveProperty('admissionReceipt');

    persistence.projectFindOne.mockResolvedValue(project());
    persistence.projectUpdateOne.mockClear();
    persistence.assetFindOne
      .mockReset()
      .mockResolvedValueOnce(structuredClone(fixture.asset))
      .mockResolvedValueOnce(structuredClone(fixture.asset))
      .mockRejectedValueOnce(new Error('TEST_ASSET_STORE_UNAVAILABLE'));
    const unavailable = await projectService
      .bindProjectOverlaysToVerifiedProxySourceV1(
      fixture.userId,
      PROJECT_ID,
      command(),
    );
    expect(unavailable).toMatchObject({
      disposition: 'COMMITTED_REVALIDATION_REQUIRED',
      reason: 'ASSET_REVALIDATION_UNAVAILABLE',
    });
    expect(unavailable).not.toHaveProperty('admissionReceipt');
    expect(persistence.projectUpdateOne).toHaveBeenCalledTimes(1);
  });

  it('keeps source pins immutable across generic client or worker-style saves', async () => {
    const before = project();
    useStablePersistence(before);
    const binding = await projectService
      .bindProjectOverlaysToVerifiedProxySourceV1(
        fixture.userId,
        PROJECT_ID,
        command(),
      );
    if (binding.disposition !== 'APPLIED') {
      throw new Error('TEST_EXPECTED_BINDING_APPLIED');
    }
    const committedSet = persistence.projectUpdateOne.mock.calls[0]![1].$set;
    const storedProject: Project = {
      ...before,
      ...committedSet,
      projectRevision: 5,
      updatedAt: committedSet.updatedAt,
    };
    const incoming = structuredClone(storedProject.overlays);
    const originalPin = (incoming[0] as ClipOverlay).sourceVersionPinV1;
    if (!originalPin) throw new Error('TEST_PROXY_PIN_MISSING');
    (incoming[0] as ClipOverlay).sourceVersionPinV1 = {
      ...originalPin,
      sourceRole: 'MASTER',
    } as ClipOverlay['sourceVersionPinV1'];
    delete (incoming[1] as ClipOverlay).sourceVersionPinV1;
    const injected = clip(30, 4, 0, 1);
    injected.sourceVersionPinV1 = originalPin;
    incoming.push(injected);

    persistence.projectFindOne.mockResolvedValue(
      structuredClone(storedProject),
    );
    persistence.projectUpdateOne.mockClear();
    await projectService.saveProjectWithReceipt(
      fixture.userId,
      PROJECT_ID,
      {
        overlays: incoming,
        aspectRatio: '16:9',
        playerDimensions: { width: 1920, height: 1080 },
        fps: 30,
        durationInFrames: 6,
      },
      {
        expectedRevision: {
          schemaVersion: 1,
          value: 5,
          compatibilityUpdatedAt: committedSet.updatedAt.toISOString(),
        },
        overlayAuthority: 'server',
      },
    );

    const saved = persistence.projectUpdateOne.mock.calls[0]![1]
      .$set.overlays as ClipOverlay[];
    expect(saved.find((overlay) => overlay.id === 10)?.sourceVersionPinV1)
      .toEqual(originalPin);
    expect(saved.find((overlay) => overlay.id === 20)?.sourceVersionPinV1)
      .toEqual((storedProject.overlays[1] as ClipOverlay).sourceVersionPinV1);
    expect(saved.find((overlay) => overlay.id === 30)?.sourceVersionPinV1)
      .toBeUndefined();
    expect(persistence.insertOne).toHaveBeenCalledOnce();
  });

  it('keeps generic project updates outside the protected binding field', async () => {
    await expect(projectService.updateProject(fixture.userId, PROJECT_ID, {
      proxySourceBindingsV1: [],
    })).rejects.toBeInstanceOf(ProjectMutationWriteError);
    expect(persistence.getDatabase).not.toHaveBeenCalled();
  });
});

function command(
  overrides: Partial<ProjectProxySourceBindingCommandV1> = {},
): ProjectProxySourceBindingCommandV1 {
  return {
    expectedRevision: REVISION,
    actorKind: 'SYSTEM',
    assetId: fixture.assetId,
    ...overrides,
  };
}

async function expectBindingBlock(
  reason: ProjectProxySourceBindingBlockedErrorV1['reason'],
): Promise<void> {
  await expect(projectService.bindProjectOverlaysToVerifiedProxySourceV1(
    fixture.userId,
    PROJECT_ID,
    command(),
  )).rejects.toMatchObject({
    code: 'PROJECT_PROXY_SOURCE_BINDING_BLOCKED',
    reason,
  });
}

function useStablePersistence(value: Project): void {
  persistence.projectFindOne.mockResolvedValue(structuredClone(value));
  persistence.assetFindOne.mockImplementation(async () =>
    structuredClone(fixture.asset));
}

function project(overrides: Partial<Project> = {}): Project {
  return {
    projectId: PROJECT_ID,
    userId: fixture.userId,
    name: 'Verified proxy source-binding project',
    overlays: clips(),
    aspectRatio: '16:9',
    playerDimensions: { width: 1920, height: 1080 },
    fps: 30,
    durationInFrames: 4,
    createdAt: new Date('2026-08-31T09:00:00.000Z'),
    updatedAt: new Date(REVISION.compatibilityUpdatedAt),
    projectRevision: REVISION.value,
    visibility: 'private',
    ...overrides,
  };
}

function clips(): ClipOverlay[] {
  return [clip(10, 0, 0, 2), clip(20, 2, 2, 6)];
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
    assetId: fixture.assetId,
    content: `asset:${fixture.assetId}`,
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
