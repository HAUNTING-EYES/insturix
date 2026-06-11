export type UploaderXPlatform =
  | "youtube"
  | "instagram"
  | "facebook"
  | "twitter"
  | "linkedin";

export type UploaderXCapabilityStatus = "supported" | "planned" | "blocked";

export interface UploaderXFieldCapability {
  status: UploaderXCapabilityStatus;
  reason?: string;
}

export type UploaderXPlatformCapabilities = Record<string, UploaderXFieldCapability>;

export const UPLOADERX_PLATFORM_CAPABILITIES = {
  youtube: {
    title: { status: "supported" },
    description: { status: "supported" },
    tags: { status: "supported" },
    privacyStatus: { status: "supported" },
    videoType: { status: "supported", reason: "Used to append #Shorts metadata." },
    categoryId: { status: "supported" },
    publishAt: { status: "supported", reason: "Scheduled YouTube uploads must publish as private until publishAt." },
    thumbnail: { status: "supported", reason: "Uploads a JPEG/PNG thumbnail after the YouTube video ID exists." },
    madeForKids: { status: "planned" },
    containsSyntheticMedia: { status: "planned" },
  },
  instagram: {
    title: { status: "supported" },
    caption: { status: "supported" },
    accountId: { status: "supported" },
    media: { status: "supported" },
    location: { status: "blocked", reason: "Requires Meta docs verification before wiring." },
    altText: { status: "blocked", reason: "Requires Meta docs verification before wiring." },
  },
  facebook: {
    title: { status: "supported" },
    description: { status: "supported" },
    pageId: { status: "supported" },
    media: { status: "supported" },
    privacy: { status: "blocked", reason: "Requires Meta docs verification before wiring." },
    publishAt: { status: "blocked", reason: "Requires Meta docs verification before wiring." },
    thumbnail: { status: "blocked", reason: "Requires Meta docs verification before wiring." },
  },
  twitter: {
    title: { status: "supported" },
    description: { status: "supported" },
    media: { status: "supported" },
    replySettings: { status: "supported" },
    poll: { status: "planned" },
    geo: { status: "planned" },
    paidPartnership: { status: "planned" },
    madeWithAi: { status: "planned" },
  },
  linkedin: {
    title: { status: "supported" },
    description: { status: "supported" },
    media: { status: "supported" },
    postType: { status: "supported" },
    organizationId: { status: "supported" },
    distribution: { status: "planned", reason: "Requires LinkedIn REST Posts API migration." },
    isReshareDisabledByAuthor: { status: "planned", reason: "Requires LinkedIn REST Posts API migration." },
  },
} satisfies Record<UploaderXPlatform, UploaderXPlatformCapabilities>;

export type YouTubePublishPayload = {
  gcsPath: string;
  filename: string;
  videoUuid: string;
  title?: string;
  description?: string;
  privacyStatus?: string;
  categoryId?: string;
  publishAt?: string;
  thumbnailPublicUrl?: string;
  postType?: string;
};

export type FacebookPublishPayload = {
  gcsPath: string;
  videoUuid: string;
  title?: string;
  description?: string;
  pageId?: string;
  postType?: string;
};

export type InstagramPublishPayload = {
  gcsPath: string;
  videoUuid: string;
  title?: string;
  description?: string;
  accountId?: string;
  postType?: string;
};

export type TwitterPublishPayload = {
  gcsPath?: string;
  videoUuid?: string;
  title?: string;
  description?: string;
  replySettings?: "everyone" | "following" | "mentionedUsers" | "subscribers" | "verified";
  postType?: string;
};

export type LinkedInPublishPayload = {
  gcsPath?: string;
  videoUuid?: string;
  title?: string;
  description?: string;
  postType: "personal" | "organization";
  organizationId?: string;
  videoPostType?: string;
};

export type UploaderXPublishPayload =
  | ({ platform: "youtube" } & YouTubePublishPayload)
  | ({ platform: "facebook" } & FacebookPublishPayload)
  | ({ platform: "instagram" } & InstagramPublishPayload)
  | ({ platform: "twitter" } & TwitterPublishPayload)
  | ({ platform: "linkedin" } & LinkedInPublishPayload);

export function isUploaderXFieldSupported(
  platform: UploaderXPlatform,
  field: string,
): boolean {
  const capabilities = UPLOADERX_PLATFORM_CAPABILITIES[platform] as UploaderXPlatformCapabilities;
  return capabilities[field]?.status === "supported";
}
