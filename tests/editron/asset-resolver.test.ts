import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

import { hashEditronCanonicalJsonV1 } from "@/lib/editron/services/canonical-json-v1";
import { assertMediaSourceVersionV1 } from "@/lib/editron/services/media-source-version-v1";
import {
  createProjectVideoSourceVersionPinV1,
  type ProjectVideoSourceVersionPinV1,
} from "@/lib/editron/services/project-video-source-version-pin-v1";
import {
  buildMediaProxyMasterExactBoundaryFixtureV1,
  type MediaProxyMasterExactBoundaryFixtureV1,
} from "./helpers/media-proxy-master-exact-boundary-fixture";

const mocks = vi.hoisted(() => ({
  collection: vi.fn(),
  find: vi.fn(),
  findOne: vi.fn(),
  toArray: vi.fn(),
  updateMany: vi.fn(),
  updateOne: vi.fn(),
  refreshSignedUrl: vi.fn(),
}));

vi.mock("@/lib/editron/db/mongodb", () => ({
  COLLECTIONS: { MEDIA_ASSETS: "media_assets" },
  getDatabase: vi.fn(async () => ({
    collection: mocks.collection,
  })),
}));

vi.mock("@/lib/editron/services/gcs-service", () => ({
  refreshSignedUrl: mocks.refreshSignedUrl,
}));

describe("assetResolver", () => {
  let versionFixture: MediaProxyMasterExactBoundaryFixtureV1;

  beforeAll(async () => {
    versionFixture = await buildMediaProxyMasterExactBoundaryFixtureV1({
      tag: "asset-resolver-project-pin",
      cadence: "VARIABLE",
    });
  });

  beforeEach(() => {
    vi.resetModules();
    mocks.collection.mockReset();
    mocks.find.mockReset();
    mocks.findOne.mockReset();
    mocks.toArray.mockReset();
    mocks.updateMany.mockReset();
    mocks.updateOne.mockReset();
    mocks.refreshSignedUrl.mockReset();

    mocks.collection.mockReturnValue({
      find: mocks.find,
      findOne: mocks.findOne,
      updateMany: mocks.updateMany,
      updateOne: mocks.updateOne,
    });
    mocks.find.mockReturnValue({ toArray: mocks.toArray });
    mocks.toArray.mockResolvedValue([]);
    mocks.refreshSignedUrl.mockResolvedValue({
      url: "https://storage.googleapis.com/fresh-voiceover.wav?X-Goog-Signature=fresh",
      expiresAt: new Date("2099-01-01T00:00:00.000Z"),
    });
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("rehydrates missing generated voiceover asset rows from overlay metadata gcsPath", async () => {
    const { assetResolver } = await import("@/lib/editron/services/asset-resolver");

    const [resolved] = await assetResolver.resolveProjectAssets([
      {
        id: 7,
        type: "sound",
        assetId: "voiceover_missing",
        src: "",
        content: "VO ready: this placeholder is not a playable URL",
        metadata: {
          gcsPath: "editron/user_1/media/voiceover_missing.wav",
        },
      } as never,
    ]);

    expect(mocks.refreshSignedUrl).toHaveBeenCalledWith("editron/user_1/media/voiceover_missing.wav");
    expect(resolved).toMatchObject({
      src: "https://storage.googleapis.com/fresh-voiceover.wav?X-Goog-Signature=fresh",
      content: "https://storage.googleapis.com/fresh-voiceover.wav?X-Goog-Signature=fresh",
    });
  });

  it("resolves logical asset aliases through their persisted physical R2 key", async () => {
    vi.stubEnv("CDN_WORKER_URL", "https://cdn.example.test");
    mocks.toArray.mockResolvedValue([{
      assetId: "battle_fixture_asset",
      r2Key: "upload_physical_source",
      type: "video",
      source: "user-upload",
      gcsPath: null,
      cachedUrl: "",
    }]);
    const { assetResolver } = await import("@/lib/editron/services/asset-resolver");

    const [resolved] = await assetResolver.resolveProjectAssets([{
      id: 1,
      type: "video",
      assetId: "battle_fixture_asset",
      from: 0,
      durationInFrames: 30,
      src: "",
    } as never]);

    expect(resolved).toMatchObject({
      assetId: "battle_fixture_asset",
      src: "https://cdn.example.test/asset/upload_physical_source",
      content: "https://cdn.example.test/asset/upload_physical_source",
    });
  });

  it("uses the persisted physical R2 key for direct backend asset resolution", async () => {
    vi.stubEnv("CDN_WORKER_URL", "https://cdn.example.test");
    mocks.findOne.mockResolvedValue({
      assetId: "battle_fixture_asset",
      userId: "user_1",
      r2Key: "upload_physical_source",
      type: "video",
      source: "user-upload",
      gcsPath: null,
      cachedUrl: "",
    });
    const { assetResolver } = await import("@/lib/editron/services/asset-resolver");

    const resolved = await assetResolver.resolveAssetUrl("battle_fixture_asset", "user_1");

    expect(mocks.findOne).toHaveBeenCalledWith({
      assetId: "battle_fixture_asset",
      userId: "user_1",
    });
    expect(resolved).toBe("https://cdn.example.test/asset/upload_physical_source");
  });

  it("keeps legacy asset-id addressing when no physical R2 key was persisted", async () => {
    vi.stubEnv("CDN_WORKER_URL", "https://cdn.example.test");
    mocks.toArray.mockResolvedValue([{
      assetId: "upload_legacy",
      type: "video",
      source: "user-upload",
      gcsPath: null,
      cachedUrl: "",
    }]);
    const { assetResolver } = await import("@/lib/editron/services/asset-resolver");

    const [resolved] = await assetResolver.resolveProjectAssets([{
      id: 2,
      type: "video",
      assetId: "upload_legacy",
      from: 0,
      durationInFrames: 30,
      src: "",
    } as never]);

    expect(resolved).toMatchObject({
      src: "https://cdn.example.test/asset/upload_legacy",
    });
  });

  it("selects exact per-project proxy and master bytes for one shared asset", async () => {
    vi.stubEnv("CDN_WORKER_URL", "https://cdn.example.test");
    const asset = dualVersionAsset(versionFixture);
    mocks.toArray.mockResolvedValue([asset]);
    const { assetResolver } = await import("@/lib/editron/services/asset-resolver");

    const [proxyResolved] = await assetResolver.resolveProjectAssets(
      [versionedOverlay(17, asset.assetId, sourcePin(versionFixture, "project-proxy", 17, "PROXY"))],
      { projectId: "project-proxy" },
    );
    const [masterResolved] = await assetResolver.resolveProjectAssets(
      [versionedOverlay(29, asset.assetId, sourcePin(versionFixture, "project-master", 29, "MASTER"))],
      { projectId: "project-master" },
    );

    expect(proxyResolved).toMatchObject({
      src: `https://cdn.example.test/asset/${asset.r2Key}`,
      content: `https://cdn.example.test/asset/${asset.r2Key}`,
    });
    expect(masterResolved).toMatchObject({
      src: `https://cdn.example.test/asset/${asset.originalR2Key}`,
      content: `https://cdn.example.test/asset/${asset.originalR2Key}`,
    });
  });

  it("fails closed when dual-version media has no project scope or pin", async () => {
    vi.stubEnv("CDN_WORKER_URL", "https://cdn.example.test");
    const asset = dualVersionAsset(versionFixture);
    mocks.toArray.mockResolvedValue([asset]);
    const { assetResolver } = await import("@/lib/editron/services/asset-resolver");

    await expect(assetResolver.resolveProjectAssets([
      versionedOverlay(17, asset.assetId, sourcePin(versionFixture, "project-a", 17, "PROXY")),
    ])).rejects.toMatchObject({
      code: "PROJECT_VIDEO_SOURCE_UNVERIFIABLE",
      diagnostic: { reason: "PROJECT_SCOPE_REQUIRED", overlayId: 17 },
    });
    await expect(assetResolver.resolveProjectAssets(
      [versionedOverlay(17, asset.assetId)],
      { projectId: "project-a" },
    )).rejects.toMatchObject({
      code: "PROJECT_VIDEO_SOURCE_UNVERIFIABLE",
      diagnostic: { reason: "DUAL_VERSION_SOURCE_PIN_REQUIRED", overlayId: 17 },
    });
  });

  it("rejects a valid pin copied from another project instead of using cached media", async () => {
    vi.stubEnv("CDN_WORKER_URL", "https://cdn.example.test");
    const asset = dualVersionAsset(versionFixture);
    mocks.toArray.mockResolvedValue([asset]);
    const { assetResolver } = await import("@/lib/editron/services/asset-resolver");

    await expect(assetResolver.resolveProjectAssets(
      [versionedOverlay(17, asset.assetId, sourcePin(versionFixture, "project-a", 17, "PROXY"))],
      { projectId: "project-b" },
    )).rejects.toMatchObject({
      code: "PROJECT_VIDEO_SOURCE_UNVERIFIABLE",
      diagnostic: {
        projectId: "project-b",
        overlayId: 17,
        assetId: asset.assetId,
        reason: "SOURCE_PIN_SCOPE_MISMATCH",
      },
    });
  });
});

function dualVersionAsset(fixture: MediaProxyMasterExactBoundaryFixtureV1) {
  const proxy = assertMediaSourceVersionV1(fixture.asset.proxySourceVersionV1);
  const master = assertMediaSourceVersionV1(fixture.asset.sourceVersionV1);
  return {
    ...fixture.asset,
    assetId: fixture.qualification.relation.assetId,
    r2Key: proxy.storageVersion.locator.objectKey,
    originalR2Key: master.storageVersion.locator.objectKey,
    filename: "shared-qualified-video.mp4",
    source: "user-upload" as const,
    gcsPath: null,
    cachedUrl: "https://stale.example.test/global-master.mp4",
    urlExpiresAt: new Date("2099-01-01T00:00:00.000Z"),
    size: 1,
    uploadedAt: new Date("2026-08-31T10:00:00.000Z"),
  };
}

function versionedOverlay(
  id: number,
  assetId: string,
  pin?: ProjectVideoSourceVersionPinV1,
) {
  return {
    id,
    type: "video",
    assetId,
    from: 0,
    durationInFrames: 30,
    src: "https://stale.example.test/cached.mp4",
    ...(pin ? { sourceVersionPinV1: pin } : {}),
  } as never;
}

function sourcePin(
  fixture: MediaProxyMasterExactBoundaryFixtureV1,
  projectId: string,
  overlayId: number,
  sourceRole: "PROXY" | "MASTER",
): ProjectVideoSourceVersionPinV1 {
  const proxy = assertMediaSourceVersionV1(fixture.asset.proxySourceVersionV1);
  const master = assertMediaSourceVersionV1(fixture.asset.sourceVersionV1);
  return createProjectVideoSourceVersionPinV1({
    projectId,
    overlayId,
    assetId: fixture.qualification.relation.assetId,
    sourceRole,
    sourceVersionSha256: sourceRole === "PROXY"
      ? proxy.sourceVersionSha256
      : master.sourceVersionSha256,
    storageVersionSha256: sourceRole === "PROXY"
      ? proxy.storageVersion.storageVersionSha256
      : master.storageVersion.storageVersionSha256,
    authority: sourceRole === "PROXY"
      ? {
          kind: "PROJECT_PROXY_SOURCE_BINDING",
          bindingSha256: "a".repeat(64),
          proxyTimeMapReferenceSha256: hashEditronCanonicalJsonV1(
            fixture.qualification.mapping.proxyTimeMap,
          ),
        }
      : {
          kind: "PROJECT_PROXY_MASTER_RELINK",
          relinkStateSha256: "b".repeat(64),
          relationSha256: fixture.qualification.relation.relationSha256,
          activeMappingStateSha256:
            fixture.activeMappingState.proxyMasterActiveMappingStateSha256V1,
        },
    issuedAt: new Date("2026-08-31T10:06:00.000Z"),
  });
}
