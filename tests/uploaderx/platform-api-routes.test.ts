import { Readable } from "node:stream";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { POST as postFacebookChunk } from "@/app/api/services/uploaderx/facebook/chunk/route";
import { POST as postFacebook } from "@/app/api/services/uploaderx/facebook/route";
import { POST as postYouTube } from "@/app/api/services/uploaderx/youtube/route";
import { encryptUserOAuthToken } from "@/lib/calos/publish/token-crypto";

const mocks = vi.hoisted(() => {
  const auth = vi.fn();
  const axiosGet = vi.fn();
  const axiosPost = vi.fn();
  const clerkClient = vi.fn();
  const connectToDatabase = vi.fn();
  const emitUploaderXVideoPublished = vi.fn();
  const fetchUploaderXBuffer = vi.fn();
  const fetchUploaderXStream = vi.fn();
  const oauthSetCredentials = vi.fn();
  const resolveUploaderXVideo = vi.fn();
  const userFindOne = vi.fn();
  const userFindOneAndUpdate = vi.fn();
  const videoFindOne = vi.fn();
  const videoUpdateOne = vi.fn();
  const youtubeInsert = vi.fn();
  const youtubeThumbnailSet = vi.fn();
  const youtubeUpdate = vi.fn();
  const youtubeFactory = vi.fn(() => ({
    videos: {
      insert: youtubeInsert,
      update: youtubeUpdate,
    },
    thumbnails: {
      set: youtubeThumbnailSet,
    },
  }));
  const OAuth2 = vi.fn(() => ({ setCredentials: oauthSetCredentials }));

  return {
    auth,
    axiosGet,
    axiosPost,
    clerkClient,
    connectToDatabase,
    emitUploaderXVideoPublished,
    fetchUploaderXBuffer,
    fetchUploaderXStream,
    oauthSetCredentials,
    OAuth2,
    resolveUploaderXVideo,
    userFindOne,
    userFindOneAndUpdate,
    videoFindOne,
    videoUpdateOne,
    youtubeFactory,
    youtubeInsert,
    youtubeThumbnailSet,
    youtubeUpdate,
  };
});

vi.mock("@clerk/nextjs/server", () => ({
  auth: mocks.auth,
  clerkClient: mocks.clerkClient,
}));

vi.mock("@/schemas/ConnectToDatabase", () => ({
  default: mocks.connectToDatabase,
}));

vi.mock("@/schemas/user", () => ({
  User: {
    findOne: mocks.userFindOne,
    findOneAndUpdate: mocks.userFindOneAndUpdate,
  },
}));

vi.mock("@/schemas/uploaderx-video", () => ({
  default: {
    findOne: mocks.videoFindOne,
    updateOne: mocks.videoUpdateOne,
  },
}));

vi.mock("@/lib/uploaderx/video-publish-events", () => ({
  emitUploaderXVideoPublished: mocks.emitUploaderXVideoPublished,
}));

vi.mock("@/lib/uploaderx-storage", () => ({
  fetchUploaderXBuffer: mocks.fetchUploaderXBuffer,
  fetchUploaderXStream: mocks.fetchUploaderXStream,
  resolveUploaderXVideo: mocks.resolveUploaderXVideo,
}));

vi.mock("axios", () => ({
  default: {
    get: mocks.axiosGet,
    post: mocks.axiosPost,
  },
}));

vi.mock("googleapis", () => ({
  google: {
    auth: {
      OAuth2: mocks.OAuth2,
    },
    youtube: mocks.youtubeFactory,
  },
}));

function jsonRequest(body: Record<string, unknown>): Request {
  return new Request("http://localhost/api", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

function platformResponse(body: unknown): Response {
  const responseText = typeof body === "string" ? body : JSON.stringify(body);
  return {
    ok: true,
    status: 200,
    headers: new Headers(),
    json: vi.fn(async () => body),
    text: vi.fn(async () => responseText),
  } as unknown as Response;
}

async function responseJson(response: Response): Promise<Record<string, unknown>> {
  return await response.json();
}

function futureSchedule(minutesFromNow: number): { iso: string; seconds: number } {
  const publishAt = new Date(Date.now() + minutesFromNow * 60 * 1000);
  return {
    iso: publishAt.toISOString(),
    seconds: Math.floor(publishAt.getTime() / 1000),
  };
}

function mockCreditUser() {
  return {
    clerkUserId: "user_1",
    creditsBalance: {
      subscriptionCredits: 1000,
      topupCredits: 0,
      totalCredits: 1000,
      mediaCredits: 0,
      mediaTopupCredits: 0,
      totalMediaCredits: 0,
      lastSubscriptionGrant: null,
      subscriptionCreditsExpiry: null,
      lastMediaGrant: null,
      mediaCreditsExpiry: null,
      creditHistory: [],
    },
    save: vi.fn(async () => undefined),
  };
}

function mockUserQuery<T>(value: T) {
  const promise = Promise.resolve(value);
  return {
    select: vi.fn(async () => value),
    lean: vi.fn(async () => value),
    then: promise.then.bind(promise),
    catch: promise.catch.bind(promise),
    finally: promise.finally.bind(promise),
    [Symbol.toStringTag]: "Promise",
  };
}

function mockFacebookUser(tokens: {
  pageAccessToken?: string;
  userAccessToken?: string;
} = {}) {
  const facebookUser = {
    ...mockCreditUser(),
    facebookTokens: {
      userAccessToken: tokens.userAccessToken ?? "fb_user_token",
      pages: [{
        pageId: "page_1",
        pageName: "Brand Page",
        pageAccessToken: tokens.pageAccessToken ?? "page_token",
      }],
    },
  };

  mocks.userFindOne.mockImplementation((query?: Record<string, unknown>) => {
    if (query && "facebookTokens" in query) {
      return mockUserQuery(facebookUser);
    }
    return mockUserQuery(mockCreditUser());
  });
}

describe("UploaderX platform API route contracts", () => {
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    vi.clearAllMocks();
    fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    mocks.auth.mockResolvedValue({ userId: "user_1" });
    mocks.connectToDatabase.mockResolvedValue(undefined);
    mocks.emitUploaderXVideoPublished.mockResolvedValue({ emitted: true, eventId: "event_1" });
    mocks.fetchUploaderXBuffer.mockResolvedValue(Buffer.from("video"));
    mocks.fetchUploaderXStream.mockResolvedValue({
      stream: Readable.from(["video"]),
      contentType: "video/mp4",
      contentLength: 1024,
    });
    mocks.resolveUploaderXVideo.mockResolvedValue({
      publicUrl: "https://cdn.example.com/asset.mp4",
      contentType: "video/mp4",
      filename: "asset.mp4",
      size: 1024,
    });
    mocks.userFindOne.mockImplementation(() => mockUserQuery(mockCreditUser()));
    mocks.userFindOneAndUpdate.mockResolvedValue(mockCreditUser());
    mocks.videoFindOne.mockResolvedValue(null);
    mocks.videoUpdateOne.mockResolvedValue({ modifiedCount: 1 });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
  });

  it("accepts a Facebook publish only after Graph simple upload returns a video id", async () => {
    mockFacebookUser();
    fetchMock.mockResolvedValue(platformResponse({ access_token: "fresh_page_token" }));
    mocks.axiosGet.mockResolvedValue({ data: Readable.from(["video"]) });
    mocks.axiosPost.mockResolvedValue({ data: { id: "fb_video_1" } });

    const response = await postFacebook(jsonRequest({
      gcsPath: "video.mp4",
      videoUuid: "video_1",
      title: "Launch",
    }));

    expect(response.status).toBe(200);
    await expect(responseJson(response)).resolves.toMatchObject({
      success: true,
      videoId: "fb_video_1",
      facebookUrl: "https://www.facebook.com/page_1/videos/fb_video_1",
      scheduled: false,
    });
    expect(mocks.axiosPost).toHaveBeenCalledWith(
      expect.stringContaining("https://graph.facebook.com/v21.0/page_1/videos"),
      expect.anything(),
      expect.objectContaining({ timeout: 120000 }),
    );
    expect(mocks.emitUploaderXVideoPublished).toHaveBeenCalledWith(
      expect.objectContaining({
        platform: "facebook",
        platformPostId: "fb_video_1",
        platformUrl: "https://www.facebook.com/page_1/videos/fb_video_1",
        accountUsername: "Brand Page",
      }),
    );
  });

  it("decrypts stored Facebook credentials for whole-file publishing", async () => {
    vi.stubEnv("CALOS_TOKEN_ENCRYPTION_KEY", Buffer.alloc(32, 4).toString("base64"));
    mockFacebookUser({
      userAccessToken: encryptUserOAuthToken("fb_user_token"),
      pageAccessToken: encryptUserOAuthToken("page_token"),
    });
    fetchMock.mockRejectedValueOnce(new Error("refresh unavailable"));
    mocks.axiosGet.mockResolvedValue({ data: Readable.from(["video"]) });
    mocks.axiosPost.mockResolvedValue({ data: { id: "fb_video_encrypted" } });

    const response = await postFacebook(jsonRequest({
      gcsPath: "video.mp4",
      videoUuid: "video_encrypted",
      title: "Encrypted credentials",
    }));

    expect(response.status).toBe(200);
    expect(String(fetchMock.mock.calls[0]?.[0])).toContain("access_token=fb_user_token");
    expect(String(fetchMock.mock.calls[0]?.[0])).not.toContain("oauth%3Av1");
    expect(String(mocks.axiosPost.mock.calls[0]?.[0])).toContain("access_token=page_token");
    expect(String(mocks.axiosPost.mock.calls[0]?.[0])).not.toContain("oauth%3Av1");
  });

  it("rejects unreadable Page ciphertext before whole-file publishing work starts", async () => {
    vi.stubEnv("CALOS_TOKEN_ENCRYPTION_KEY", Buffer.alloc(32, 4).toString("base64"));
    mockFacebookUser({ pageAccessToken: "oauth:v1:not-valid-ciphertext" });

    const response = await postFacebook(jsonRequest({
      gcsPath: "video.mp4",
      videoUuid: "video_corrupt",
      title: "Corrupt credentials",
    }));
    const payload = await responseJson(response);

    expect(response.status).toBe(403);
    expect(payload.error).toContain("Reconnect Facebook");
    expect(fetchMock).not.toHaveBeenCalled();
    expect(mocks.resolveUploaderXVideo).not.toHaveBeenCalled();
    expect(mocks.axiosPost).not.toHaveBeenCalled();
  });

  it("decrypts stored Facebook credentials for chunked upload start", async () => {
    vi.stubEnv("CALOS_TOKEN_ENCRYPTION_KEY", Buffer.alloc(32, 4).toString("base64"));
    mockFacebookUser({
      userAccessToken: encryptUserOAuthToken("fb_user_token"),
      pageAccessToken: encryptUserOAuthToken("page_token"),
    });
    fetchMock
      .mockResolvedValueOnce(platformResponse({ access_token: "fresh_page_token" }))
      .mockResolvedValueOnce(platformResponse({
        upload_session_id: "fb_chunk_session",
        video_id: "fb_chunk_video",
      }));

    const response = await postFacebookChunk(jsonRequest({
      phase: "start",
      videoUuid: "video_chunked",
      pageId: "page_1",
    }));

    expect(response.status).toBe(200);
    expect(String(fetchMock.mock.calls[0]?.[0])).toContain("access_token=fb_user_token");
    expect(String(fetchMock.mock.calls[1]?.[0])).toContain("access_token=fresh_page_token");
    expect(fetchMock.mock.calls.map((call) => String(call[0])).join("\n")).not.toContain("oauth%3Av1");
  });

  it("rejects unreadable Page ciphertext before chunked upload work starts", async () => {
    vi.stubEnv("CALOS_TOKEN_ENCRYPTION_KEY", Buffer.alloc(32, 4).toString("base64"));
    mockFacebookUser({ pageAccessToken: "oauth:v1:not-valid-ciphertext" });

    const response = await postFacebookChunk(jsonRequest({
      phase: "start",
      videoUuid: "video_chunked_corrupt",
      pageId: "page_1",
    }));
    const payload = await responseJson(response);

    expect(response.status).toBe(403);
    expect(payload.error).toContain("Reconnect Facebook");
    expect(fetchMock).not.toHaveBeenCalled();
    expect(mocks.resolveUploaderXVideo).not.toHaveBeenCalled();
    expect(mocks.axiosPost).not.toHaveBeenCalled();
  });

  it("schedules a Facebook Page video with native scheduled_publish_time", async () => {
    mockFacebookUser();
    const schedule = futureSchedule(20);

    mocks.resolveUploaderXVideo.mockResolvedValue({
      publicUrl: "https://cdn.example.com/large-video.mp4",
      contentType: "video/mp4",
      filename: "large-video.mp4",
      size: 20 * 1024 * 1024,
    });
    fetchMock
      .mockResolvedValueOnce(platformResponse({ access_token: "fresh_page_token" }))
      .mockResolvedValueOnce(platformResponse({
        upload_session_id: "fb_session_1",
        video_id: "fb_video_scheduled",
      }));
    mocks.axiosPost.mockResolvedValue({ data: {} });

    const response = await postFacebook(jsonRequest({
      gcsPath: "large-video.mp4",
      videoUuid: "video_scheduled",
      title: "Scheduled Launch",
      publishAt: schedule.iso,
    }));

    expect(response.status).toBe(200);
    await expect(responseJson(response)).resolves.toMatchObject({
      success: true,
      videoId: "fb_video_scheduled",
      scheduled: true,
      publishAt: schedule.iso,
    });
    expect(mocks.axiosPost).toHaveBeenCalledWith(
      expect.stringContaining("https://graph.facebook.com/v21.0/page_1/videos"),
      expect.objectContaining({
        upload_phase: "finish",
        upload_session_id: "fb_session_1",
        published: false,
        scheduled_publish_time: schedule.seconds,
      }),
      expect.objectContaining({ timeout: 60000 }),
    );
    expect(mocks.videoUpdateOne).toHaveBeenCalledWith(
      { userId: "user_1", videoUuid: "video_scheduled" },
      expect.objectContaining({
        $set: expect.objectContaining({
          "metadata.facebook.publishState": "scheduled",
          "metadata.facebook.scheduledTime": schedule.iso,
        }),
      }),
    );
    expect(mocks.emitUploaderXVideoPublished).not.toHaveBeenCalled();
  });

  it("schedules a Facebook Reel with video_state SCHEDULED", async () => {
    mockFacebookUser();
    const schedule = futureSchedule(30);

    fetchMock
      .mockResolvedValueOnce(platformResponse({ access_token: "fresh_page_token" }))
      .mockResolvedValueOnce(platformResponse({
        video_id: "fb_reel_scheduled",
        upload_url: "https://upload.facebook.example/reel",
      }));
    mocks.axiosPost.mockResolvedValue({ data: {} });

    const response = await postFacebook(jsonRequest({
      gcsPath: "reel.mp4",
      videoUuid: "reel_scheduled",
      title: "Scheduled Reel",
      postType: "reel",
      publishAt: schedule.iso,
    }));

    expect(response.status).toBe(200);
    await expect(responseJson(response)).resolves.toMatchObject({
      success: true,
      videoId: "fb_reel_scheduled",
      postType: "reel",
      scheduled: true,
      publishAt: schedule.iso,
    });
    expect(mocks.axiosPost).toHaveBeenCalledWith(
      expect.stringContaining("https://graph.facebook.com/v21.0/page_1/video_reels"),
      expect.objectContaining({
        upload_phase: "finish",
        video_id: "fb_reel_scheduled",
        video_state: "SCHEDULED",
        scheduled_publish_time: schedule.seconds,
      }),
      expect.objectContaining({ timeout: 60000 }),
    );
    expect(mocks.emitUploaderXVideoPublished).not.toHaveBeenCalled();
  });

  it("schedules a YouTube publish as private with publishAt", async () => {
    mocks.clerkClient.mockResolvedValue({
      users: {
        getUser: vi.fn(async () => ({
          externalAccounts: [{ provider: "oauth_google", id: "google_1" }],
        })),
        getUserOauthAccessToken: vi.fn(async () => ({ data: [{ token: "yt_token" }] })),
      },
    });
    mocks.youtubeInsert.mockResolvedValue({ data: { id: "yt_video_1" } });

    const response = await postYouTube(jsonRequest({
      gcsPath: "video.mp4",
      videoUuid: "video_1",
      title: "Scheduled Launch",
      privacyStatus: "public",
      publishAt: "2030-01-02T03:04:05.000Z",
    }));

    expect(response.status).toBe(200);
    await expect(responseJson(response)).resolves.toMatchObject({
      success: true,
      youtubeUrl: "https://www.youtube.com/watch?v=yt_video_1",
    });
    expect(mocks.oauthSetCredentials).toHaveBeenCalledWith({ access_token: "yt_token" });
    expect(mocks.youtubeInsert).toHaveBeenCalledWith(
      expect.objectContaining({
        part: ["snippet", "status"],
        requestBody: expect.objectContaining({
          snippet: expect.objectContaining({ title: "Scheduled Launch" }),
          status: {
            privacyStatus: "private",
            publishAt: "2030-01-02T03:04:05.000Z",
          },
        }),
      }),
    );
    expect(mocks.videoUpdateOne).toHaveBeenCalledWith(
      { userId: "user_1", videoUuid: "video_1" },
      expect.objectContaining({
        $set: expect.objectContaining({
          "metadata.youtube.videoId": "yt_video_1",
          "metadata.youtube.url": "https://www.youtube.com/watch?v=yt_video_1",
          "metadata.youtube.publishState": "scheduled",
          "metadata.youtube.scheduledTime": "2030-01-02T03:04:05.000Z",
        }),
      }),
    );
    expect(mocks.emitUploaderXVideoPublished).not.toHaveBeenCalled();
  });
});
