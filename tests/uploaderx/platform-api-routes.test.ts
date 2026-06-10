import { Readable } from "node:stream";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { POST as postFacebook } from "@/app/api/services/uploaderx/facebook/route";
import { POST as postInstagram } from "@/app/api/services/uploaderx/instagram/route";
import { POST as postLinkedIn } from "@/app/api/services/uploaderx/linkedin/route";
import { POST as postTwitter } from "@/app/api/services/uploaderx/twitter/route";
import { POST as postYouTube } from "@/app/api/services/uploaderx/youtube/route";

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
  const userUpdateOne = vi.fn();
  const videoFindOne = vi.fn();
  const videoUpdateOne = vi.fn();
  const youtubeInsert = vi.fn();
  const youtubeUpdate = vi.fn();
  const youtubeFactory = vi.fn(() => ({
    videos: {
      insert: youtubeInsert,
      update: youtubeUpdate,
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
    userUpdateOne,
    videoFindOne,
    videoUpdateOne,
    youtubeFactory,
    youtubeInsert,
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
    updateOne: mocks.userUpdateOne,
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

function platformResponse(
  body: unknown,
  options: { ok?: boolean; status?: number } = {},
): Response {
  const responseText = typeof body === "string" ? body : JSON.stringify(body);
  return {
    ok: options.ok ?? true,
    status: options.status ?? 200,
    json: vi.fn(async () => body),
    text: vi.fn(async () => responseText),
  } as unknown as Response;
}

async function responseJson(response: Response): Promise<Record<string, unknown>> {
  return await response.json();
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
    mocks.fetchUploaderXStream.mockResolvedValue({ stream: Readable.from(["video"]) });
    mocks.resolveUploaderXVideo.mockResolvedValue({
      publicUrl: "https://cdn.example.com/asset.mp4",
      contentType: "video/mp4",
      filename: "asset.mp4",
      size: 1024,
    });
    mocks.userUpdateOne.mockResolvedValue({ modifiedCount: 1 });
    mocks.videoFindOne.mockResolvedValue(null);
    mocks.videoUpdateOne.mockResolvedValue({ modifiedCount: 1 });
  });

  it("accepts an Instagram publish only after container creation and media_publish succeed", async () => {
    mocks.userFindOne.mockResolvedValue({
      instagramTokens: {
        userAccessToken: "ig_token",
        accounts: [{ instagramAccountId: "ig_account_1", instagramUsername: "brand_ig" }],
      },
    });
    mocks.resolveUploaderXVideo.mockResolvedValue({
      publicUrl: "https://cdn.example.com/post.jpg",
      contentType: "image/jpeg",
    });
    fetchMock.mockImplementation(async (url: string | URL) => {
      const href = String(url);
      if (href.includes("/me/media?")) {
        return platformResponse({ id: "ig_container_1" });
      }
      if (href.includes("/me/media_publish?")) {
        return platformResponse({ id: "ig_media_1" });
      }
      throw new Error(`Unexpected Instagram fetch: ${href}`);
    });

    const response = await postInstagram(jsonRequest({
      gcsPath: "post.jpg",
      videoUuid: "video_1",
      title: "Launch",
    }));

    expect(response.status).toBe(200);
    await expect(responseJson(response)).resolves.toMatchObject({
      success: true,
      mediaId: "ig_media_1",
      instagramUrl: "https://www.instagram.com/p/ig_media_1",
    });
    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringContaining("image_url=https%3A%2F%2Fcdn.example.com%2Fpost.jpg"),
      { method: "POST" },
    );
    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringContaining("creation_id=ig_container_1"),
      { method: "POST" },
    );
    expect(mocks.emitUploaderXVideoPublished).toHaveBeenCalledWith(
      expect.objectContaining({
        platform: "instagram",
        platformPostId: "ig_media_1",
        platformUrl: "https://www.instagram.com/p/ig_media_1",
      }),
    );
  });

  it("does not emit publish learning when Instagram media_publish rejects the post", async () => {
    mocks.userFindOne.mockResolvedValue({
      instagramTokens: {
        userAccessToken: "ig_token",
        accounts: [{ instagramAccountId: "ig_account_1", instagramUsername: "brand_ig" }],
      },
    });
    mocks.resolveUploaderXVideo.mockResolvedValue({
      publicUrl: "https://cdn.example.com/post.jpg",
      contentType: "image/jpeg",
    });
    fetchMock.mockImplementation(async (url: string | URL) => {
      const href = String(url);
      if (href.includes("/me/media?")) {
        return platformResponse({ id: "ig_container_1" });
      }
      if (href.includes("/me/media_publish?")) {
        return platformResponse({ error: { message: "Media rejected" } });
      }
      throw new Error(`Unexpected Instagram fetch: ${href}`);
    });

    const response = await postInstagram(jsonRequest({
      gcsPath: "post.jpg",
      videoUuid: "video_1",
      title: "Launch",
    }));

    expect(response.status).toBe(500);
    await expect(responseJson(response)).resolves.toMatchObject({
      success: false,
      error: "Media rejected",
    });
    expect(mocks.videoUpdateOne).not.toHaveBeenCalled();
    expect(mocks.emitUploaderXVideoPublished).not.toHaveBeenCalled();
  });

  it("accepts a Twitter/X publish only after the tweet creation endpoint returns an id", async () => {
    mocks.userFindOne.mockResolvedValue({
      twitterTokens: {
        accessToken: "x_token",
        expiresAt: new Date(Date.now() + 60_000),
        userName: "brand_x",
      },
    });
    fetchMock.mockResolvedValue(platformResponse({ data: { id: "tweet_1" } }));

    const response = await postTwitter(jsonRequest({
      videoUuid: "video_1",
      title: "Launch",
      description: "Now live",
    }));

    expect(response.status).toBe(200);
    await expect(responseJson(response)).resolves.toMatchObject({
      success: true,
      tweetId: "tweet_1",
      tweetUrl: "https://x.com/brand_x/status/tweet_1",
    });
    expect(fetchMock).toHaveBeenCalledWith(
      "https://api.x.com/2/tweets",
      expect.objectContaining({
        method: "POST",
        headers: expect.objectContaining({ Authorization: "Bearer x_token" }),
      }),
    );
    expect(mocks.emitUploaderXVideoPublished).toHaveBeenCalledWith(
      expect.objectContaining({
        platform: "twitter",
        platformPostId: "tweet_1",
        platformUrl: "https://x.com/brand_x/status/tweet_1",
        mediaType: "text",
      }),
    );
  });

  it("accepts a LinkedIn publish only after ugcPosts returns a post id", async () => {
    mocks.userFindOne.mockResolvedValue({
      linkedinTokens: {
        accessToken: "li_token",
        userId: "li_user_1",
        expiresAt: new Date(Date.now() + 60_000),
      },
    });
    fetchMock.mockResolvedValue(platformResponse({ id: "urn:li:share:1" }));

    const response = await postLinkedIn(jsonRequest({
      videoUuid: "video_1",
      title: "Launch",
      postType: "personal",
    }));

    expect(response.status).toBe(200);
    await expect(responseJson(response)).resolves.toMatchObject({
      success: true,
      postId: "urn:li:share:1",
      postUrl: "https://www.linkedin.com/feed/update/urn:li:share:1",
    });
    expect(fetchMock).toHaveBeenCalledWith(
      "https://api.linkedin.com/v2/ugcPosts",
      expect.objectContaining({
        method: "POST",
        headers: expect.objectContaining({ Authorization: "Bearer li_token" }),
      }),
    );
    expect(mocks.emitUploaderXVideoPublished).toHaveBeenCalledWith(
      expect.objectContaining({
        platform: "linkedin",
        platformPostId: "urn:li:share:1",
        platformUrl: "https://www.linkedin.com/feed/update/urn:li:share:1",
        mediaType: "text",
      }),
    );
  });

  it("accepts a Facebook publish only after Graph simple upload returns a video id", async () => {
    mocks.userFindOne.mockResolvedValue({
      facebookTokens: {
        userAccessToken: "fb_user_token",
        pages: [{
          pageId: "page_1",
          pageName: "Brand Page",
          pageAccessToken: "page_token",
        }],
      },
    });
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

  it("accepts a YouTube publish only after videos.insert returns a video id", async () => {
    mocks.clerkClient.mockResolvedValue({
      users: {
        getUser: vi.fn(async () => ({
          externalAccounts: [{ provider: "oauth_google", id: "google_1", emailAddress: "brand@example.com" }],
        })),
        getUserOauthAccessToken: vi.fn(async () => ({ data: [{ token: "yt_token" }] })),
      },
    });
    mocks.youtubeInsert.mockResolvedValue({ data: { id: "yt_video_1" } });

    const response = await postYouTube(jsonRequest({
      gcsPath: "video.mp4",
      videoUuid: "video_1",
      title: "Launch",
      privacyStatus: "unlisted",
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
          snippet: expect.objectContaining({ title: "Launch" }),
          status: { privacyStatus: "unlisted" },
        }),
      }),
    );
    expect(mocks.emitUploaderXVideoPublished).toHaveBeenCalledWith(
      expect.objectContaining({
        platform: "youtube",
        platformPostId: "yt_video_1",
        platformUrl: "https://www.youtube.com/watch?v=yt_video_1",
      }),
    );
  });
});
