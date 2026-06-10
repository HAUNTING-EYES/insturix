import { beforeEach, describe, expect, it, vi } from "vitest";
import { emitUploaderXVideoPublished } from "@/lib/uploaderx/video-publish-events";

const mocks = vi.hoisted(() => {
  const emitBrandEvent = vi.fn();
  const findLinkByVideoId = vi.fn();
  const getDatabase = vi.fn();
  const projectFindOne = vi.fn();
  const collection = vi.fn();
  const transitionProjectStatus = vi.fn();
  const uploaderFindOne = vi.fn();
  return {
    collection,
    emitBrandEvent,
    findLinkByVideoId,
    getDatabase,
    projectFindOne,
    transitionProjectStatus,
    uploaderFindOne,
  };
});

vi.mock("@/lib/shared/brand-events", () => ({
  emitBrandEvent: mocks.emitBrandEvent,
}));

vi.mock("@/lib/shared/project-links", () => ({
  findLinkByVideoId: mocks.findLinkByVideoId,
}));

vi.mock("@/lib/shared/project-status", () => ({
  transitionProjectStatus: mocks.transitionProjectStatus,
}));

vi.mock("@/lib/editron/db/mongodb", () => ({
  getDatabase: mocks.getDatabase,
}));

vi.mock("@/schemas/uploaderx-video", () => ({
  default: {
    findOne: mocks.uploaderFindOne,
  },
}));

function mockUploaderVideo(record: unknown): void {
  mocks.uploaderFindOne.mockReturnValue({
    lean: vi.fn(async () => record),
  });
}

describe("emitUploaderXVideoPublished", () => {
  beforeEach(() => {
    mocks.collection.mockReset();
    mocks.emitBrandEvent.mockReset();
    mocks.findLinkByVideoId.mockReset();
    mocks.getDatabase.mockReset();
    mocks.projectFindOne.mockReset();
    mocks.transitionProjectStatus.mockReset();
    mocks.uploaderFindOne.mockReset();

    mocks.collection.mockReturnValue({ findOne: mocks.projectFindOne });
    mocks.getDatabase.mockResolvedValue({ collection: mocks.collection });
    mocks.emitBrandEvent.mockResolvedValue("event_1");
    mocks.transitionProjectStatus.mockResolvedValue({ success: true, previousStatus: "rendered" });
  });

  it("emits video_published with project metadata from the UploaderX video record", async () => {
    mockUploaderVideo({
      userId: "user_1",
      videoUuid: "video_1",
      editronProjectId: "project_1",
    });
    mocks.projectFindOne.mockResolvedValue({
      brandId: "brand_1",
      name: "Launch Reel",
      qualityScore: 87,
      sourceSessionId: "session_1",
      status: "rendered",
    });

    const result = await emitUploaderXVideoPublished({
      userId: "user_1",
      videoUuid: "video_1",
      platform: "instagram",
      platformPostId: "ig_media_1",
      platformUrl: "https://www.instagram.com/p/ig_media_1",
      accountUsername: "brand_account",
      mediaType: "REELS",
    });

    expect(result).toEqual({
      emitted: true,
      eventId: "event_1",
      projectId: "project_1",
      statusTransition: "transitioned_to_published",
    });
    expect(mocks.uploaderFindOne).toHaveBeenCalledWith({
      userId: "user_1",
      videoUuid: "video_1",
    });
    expect(mocks.findLinkByVideoId).not.toHaveBeenCalled();
    expect(mocks.collection).toHaveBeenCalledWith("projects");
    expect(mocks.projectFindOne).toHaveBeenCalledWith(
      { userId: "user_1", projectId: "project_1" },
      { projection: { brandId: 1, name: 1, qualityScore: 1, sourceSessionId: 1, status: 1 } },
    );
    expect(mocks.transitionProjectStatus).toHaveBeenCalledWith(
      "project_1",
      "user_1",
      "published",
      "uploaderx_publish",
    );
    expect(mocks.emitBrandEvent).toHaveBeenCalledWith({
      userId: "user_1",
      projectId: "project_1",
      brandId: "brand_1",
      service: "uploaderx",
      type: "video_published",
      payload: {
        videoUuid: "video_1",
        platform: "instagram",
        platformPostId: "ig_media_1",
        platformUrl: "https://www.instagram.com/p/ig_media_1",
        qualityScore: 87,
        projectStatusAtPublish: "rendered",
        accountUsername: "brand_account",
        mediaType: "REELS",
        sessionId: "session_1",
        projectName: "Launch Reel",
      },
    });
  });

  it("falls back to the universal project link when the video lacks editronProjectId", async () => {
    mockUploaderVideo({
      userId: "user_1",
      videoUuid: "video_1",
      editronProjectId: null,
    });
    mocks.findLinkByVideoId.mockResolvedValue({
      universalId: "plink_1",
      userId: "user_1",
      storyboardIds: [],
      projectIds: ["project_from_link"],
      videoIds: ["video_1"],
      schemaVersion: 1,
      createdAt: new Date("2026-06-01T00:00:00.000Z"),
      updatedAt: new Date("2026-06-01T00:00:00.000Z"),
    });
    mocks.projectFindOne.mockResolvedValue({
      brandId: "brand_1",
      qualityScore: 74,
      status: "published",
    });

    const result = await emitUploaderXVideoPublished({
      userId: "user_1",
      videoUuid: "video_1",
      platform: "twitter",
      platformPostId: "tweet_1",
      platformUrl: "https://x.com/brand/status/tweet_1",
    });

    expect(result).toEqual({
      emitted: true,
      eventId: "event_1",
      projectId: "project_from_link",
      statusTransition: "already_published",
    });
    expect(mocks.findLinkByVideoId).toHaveBeenCalledWith("user_1", "video_1");
    expect(mocks.transitionProjectStatus).not.toHaveBeenCalled();
    expect(mocks.emitBrandEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        projectId: "project_from_link",
        type: "video_published",
        payload: expect.objectContaining({
          platform: "twitter",
          qualityScore: 74,
          projectStatusAtPublish: "published",
        }),
      }),
    );
  });

  it("skips deterministically when videoUuid is absent", async () => {
    const result = await emitUploaderXVideoPublished({
      userId: "user_1",
      videoUuid: null,
      platform: "linkedin",
      platformPostId: "post_1",
      platformUrl: "https://www.linkedin.com/feed/update/post_1",
    });

    expect(result).toEqual({ emitted: false, reason: "missing_video_uuid" });
    expect(mocks.uploaderFindOne).not.toHaveBeenCalled();
    expect(mocks.emitBrandEvent).not.toHaveBeenCalled();
  });

  it("skips bring-your-own uploads that are not linked to an Editron project", async () => {
    mockUploaderVideo({
      userId: "user_1",
      videoUuid: "byoc_video_1",
      editronProjectId: null,
    });
    mocks.findLinkByVideoId.mockResolvedValue(null);

    const result = await emitUploaderXVideoPublished({
      userId: "user_1",
      videoUuid: "byoc_video_1",
      platform: "youtube",
      platformPostId: "youtube_video_1",
      platformUrl: "https://www.youtube.com/watch?v=youtube_video_1",
      mediaType: "video",
    });

    expect(result).toEqual({ emitted: false, reason: "missing_project_link" });
    expect(mocks.findLinkByVideoId).toHaveBeenCalledWith("user_1", "byoc_video_1");
    expect(mocks.getDatabase).not.toHaveBeenCalled();
    expect(mocks.emitBrandEvent).not.toHaveBeenCalled();
  });

  it("skips instead of inventing quality when project qualityScore is missing", async () => {
    mockUploaderVideo({
      userId: "user_1",
      videoUuid: "video_1",
      editronProjectId: "project_1",
    });
    mocks.projectFindOne.mockResolvedValue({
      brandId: "brand_1",
      name: "Unreviewed clip",
      status: "rendered",
    });

    const result = await emitUploaderXVideoPublished({
      userId: "user_1",
      videoUuid: "video_1",
      platform: "linkedin",
      platformPostId: "post_1",
      platformUrl: "https://www.linkedin.com/feed/update/post_1",
    });

    expect(result).toEqual({
      emitted: false,
      projectId: "project_1",
      statusTransition: "transitioned_to_published",
      reason: "missing_quality_score",
    });
    expect(mocks.transitionProjectStatus).toHaveBeenCalledWith(
      "project_1",
      "user_1",
      "published",
      "uploaderx_publish",
    );
    expect(mocks.emitBrandEvent).not.toHaveBeenCalled();
  });

  it("skips linked uploads when the project is not publish-ready", async () => {
    mockUploaderVideo({
      userId: "user_1",
      videoUuid: "byoc_video_1",
      editronProjectId: "project_1",
    });
    mocks.projectFindOne.mockResolvedValue({
      brandId: "brand_1",
      qualityScore: 91,
      status: "editing",
    });

    const result = await emitUploaderXVideoPublished({
      userId: "user_1",
      videoUuid: "byoc_video_1",
      platform: "youtube",
      platformPostId: "youtube_video_1",
      platformUrl: "https://www.youtube.com/watch?v=youtube_video_1",
    });

    expect(result).toEqual({
      emitted: false,
      projectId: "project_1",
      reason: "project_not_publish_ready",
    });
    expect(mocks.transitionProjectStatus).not.toHaveBeenCalled();
    expect(mocks.emitBrandEvent).not.toHaveBeenCalled();
  });

  it("skips learning when the rendered project cannot transition to published", async () => {
    mockUploaderVideo({
      userId: "user_1",
      videoUuid: "video_1",
      editronProjectId: "project_1",
    });
    mocks.projectFindOne.mockResolvedValue({
      brandId: "brand_1",
      qualityScore: 88,
      status: "rendered",
    });
    mocks.transitionProjectStatus.mockResolvedValue({
      success: false,
      previousStatus: "rendered",
      error: "Status changed concurrently",
    });

    const result = await emitUploaderXVideoPublished({
      userId: "user_1",
      videoUuid: "video_1",
      platform: "facebook",
      platformPostId: "fb_video_1",
      platformUrl: "https://www.facebook.com/page/videos/fb_video_1",
    });

    expect(result).toEqual({
      emitted: false,
      projectId: "project_1",
      reason: "project_status_transition_failed",
    });
    expect(mocks.emitBrandEvent).not.toHaveBeenCalled();
  });
});
