import type { CalosPublishPlatform } from "@/schemas/calos-scheduled-publish";
import { loadInstagramAssignmentHealth } from "@/lib/calos/instagram-assignment-health";

const YOUTUBE_UPLOAD_SCOPE = "https://www.googleapis.com/auth/youtube.upload";
const AUTO_PUBLISH_PLATFORMS = new Set<string>(["youtube", "facebook", "instagram", "linkedin", "twitter"]);

export type CalosAutoPublishPlatform = Exclude<CalosPublishPlatform, "tiktok">;

export type CalosAssignmentLike = {
  platform?: string;
  accountRef?: string | null;
  accountType?: "organization" | "personal" | null;
  displayName?: string | null;
  ownerUserId?: string | null;
  accessTokenEnc?: string | null;
  refreshTokenEnc?: string | null;
  expiresAt?: Date | string | null;
};

export type CalosConnectionHealth = {
  state: "assigned" | "attention" | "reconnect";
  accountRef: string | null;
  displayName: string | null;
  message: string | null;
};

type OwnerTokenRow = {
  clerkUserId?: string;
  facebookTokens?: {
    pages?: Array<{ pageId?: string; pageAccessToken?: string }>;
  } | null;
  linkedinTokens?: {
    accessToken?: string;
    refreshToken?: string;
    userId?: string;
    expiresAt?: Date | string | null;
  } | null;
  twitterTokens?: {
    accessToken?: string;
    refreshToken?: string;
    userId?: string;
    expiresAt?: Date | string | null;
  } | null;
};

type YoutubeExternalAccount = {
  provider?: string | null;
  approvedScopes?: string | string[] | null;
};

export function isCalosAutoPublishPlatform(
  platform: string,
): platform is CalosAutoPublishPlatform {
  return AUTO_PUBLISH_PLATFORMS.has(platform);
}

function text(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function timestamp(value: Date | string | null | undefined): number {
  if (!value) return 0;
  const parsed = new Date(value).getTime();
  return Number.isFinite(parsed) ? parsed : 0;
}

function health(
  account: CalosAssignmentLike,
  state: CalosConnectionHealth["state"],
  message: string | null,
): CalosConnectionHealth {
  return {
    state,
    accountRef: text(account.accountRef) || null,
    displayName: text(account.displayName) || null,
    message,
  };
}

function assigned(account: CalosAssignmentLike): CalosConnectionHealth { return health(account, "assigned", null); }

function reconnect(account: CalosAssignmentLike, message: string): CalosConnectionHealth {
  return health(account, "reconnect", message);
}

function ownerTokenHealth(
  account: CalosAssignmentLike,
  owner: OwnerTokenRow | undefined,
  requiredThroughMs: number,
): CalosConnectionHealth {
  const accountRef = text(account.accountRef);
  if (account.platform === "facebook") {
    const page = owner?.facebookTokens?.pages?.find(
      (candidate) => text(candidate.pageId) === accountRef,
    );
    return text(page?.pageAccessToken)
      ? assigned(account)
      : reconnect(account, "Assigned Facebook Page is no longer connected. Reconnect Facebook before publishing.");
  }

  if (account.platform === "linkedin") {
    const tokens = owner?.linkedinTokens;
    if (!text(tokens?.accessToken)) {
      return reconnect(account, "LinkedIn is no longer connected for this account owner. Reconnect before publishing.");
    }
    if (
      account.accountType === "personal" &&
      text(tokens?.userId) !== accountRef
    ) {
      return reconnect(account, "Assigned LinkedIn profile no longer matches the connected profile. Reassign it before publishing.");
    }
    const expiresAt = timestamp(tokens?.expiresAt);
    if (expiresAt > 0 && expiresAt <= requiredThroughMs) {
      const canRefresh = Boolean(
        text(tokens?.refreshToken) &&
        text(process.env.LINKEDIN_CLIENT_ID) &&
        text(process.env.LINKEDIN_CLIENT_SECRET),
      );
      if (!canRefresh) {
        return reconnect(account, "LinkedIn connection expired and cannot refresh. Reconnect before publishing.");
      }
    }
    return assigned(account);
  }

  const tokens = owner?.twitterTokens;
  if (!text(tokens?.accessToken)) {
    return reconnect(account, "X is no longer connected for this account owner. Reconnect before publishing.");
  }
  if (!text(tokens?.userId) || text(tokens?.userId) !== accountRef) {
    return reconnect(account, "Assigned X account no longer matches the connected account. Reassign it before publishing.");
  }
  const expiresAt = timestamp(tokens?.expiresAt);
  if (expiresAt === 0 || expiresAt <= requiredThroughMs) {
    const canRefresh = Boolean(
      text(tokens?.refreshToken) &&
      text(process.env.TWITTER_CLIENT_ID) &&
      text(process.env.TWITTER_CLIENT_SECRET),
    );
    if (!canRefresh) {
      return reconnect(account, "X connection expired and cannot refresh. Reconnect before publishing.");
    }
  }
  return assigned(account);
}

async function storedLinkedInHealth(
  account: CalosAssignmentLike,
  requiredThroughMs: number,
): Promise<CalosConnectionHealth> {
  try {
    const { decryptToken } = await import("@/lib/calos/publish/token-crypto");
    const accessToken = decryptToken(text(account.accessTokenEnc));
    if (!text(accessToken)) {
      return reconnect(account, "Stored LinkedIn connection is unreadable and must be reconnected before publishing.");
    }
    const expiresAt = timestamp(account.expiresAt);
    if (expiresAt > 0 && expiresAt <= requiredThroughMs) {
      const refreshTokenEnc = text(account.refreshTokenEnc);
      const canRefresh = Boolean(
        refreshTokenEnc &&
        text(decryptToken(refreshTokenEnc)) &&
        text(process.env.LINKEDIN_CLIENT_ID) &&
        text(process.env.LINKEDIN_CLIENT_SECRET),
      );
      if (!canRefresh) {
        return reconnect(account, "Stored LinkedIn connection expired and must be reconnected before publishing.");
      }
    }
    return assigned(account);
  } catch {
    return reconnect(account, "Stored LinkedIn connection is unreadable and must be reconnected before publishing.");
  }
}

function hasYoutubeUploadScope(account: YoutubeExternalAccount): boolean {
  const scopes = account.approvedScopes;
  if (scopes == null) return true;
  return Array.isArray(scopes)
    ? scopes.includes(YOUTUBE_UPLOAD_SCOPE)
    : scopes.includes(YOUTUBE_UPLOAD_SCOPE);
}

async function youtubeHealth(
  account: CalosAssignmentLike,
): Promise<CalosConnectionHealth> {
  try {
    const { clerkClient } = await import("@clerk/nextjs/server");
    const client = await clerkClient();
    const owner = await client.users.getUser(text(account.ownerUserId));
    const googleAccount = (
      owner.externalAccounts as unknown as YoutubeExternalAccount[] | undefined
    )?.find(
      (candidate) =>
        candidate.provider?.includes("google") && hasYoutubeUploadScope(candidate),
    );
    if (!googleAccount?.provider) {
      return reconnect(account, "Assigned YouTube channel is no longer connected with upload access. Reconnect before publishing.");
    }
    const tokenResponse = await client.users.getUserOauthAccessToken(
      text(account.ownerUserId),
      googleAccount.provider as never,
    );
    return text(tokenResponse.data?.[0]?.token)
      ? assigned(account)
      : reconnect(account, "Assigned YouTube channel has no usable OAuth token. Reconnect before publishing.");
  } catch {
    return health(
      account,
      "attention",
      "YouTube connection could not be verified. Try again before approving or retrying.",
    );
  }
}

async function loadOwnerTokens(
  assignments: CalosAssignmentLike[],
): Promise<Map<string, OwnerTokenRow>> {
  const ownerIds = Array.from(new Set(
    assignments
      .filter((account) =>
        account.platform === "facebook" ||
        account.platform === "linkedin" ||
        account.platform === "twitter",
      )
      .map((account) => text(account.ownerUserId))
      .filter(Boolean),
  ));
  if (ownerIds.length === 0) return new Map();

  const { User } = await import("@/schemas/user");
  const users = await User.find({ clerkUserId: { $in: ownerIds } })
    .select("clerkUserId facebookTokens.pages linkedinTokens twitterTokens")
    .lean<OwnerTokenRow[]>();
  return new Map(
    users
      .filter((user): user is OwnerTokenRow & { clerkUserId: string } =>
        Boolean(text(user.clerkUserId)),
      )
      .map((user) => [text(user.clerkUserId), user]),
  );
}

export async function loadCalosAssignmentHealth(
  assignments: CalosAssignmentLike[],
  requiredThroughMs = Date.now(),
): Promise<Record<string, CalosConnectionHealth>> {
  const byPlatform = new Map<string, CalosAssignmentLike[]>();
  for (const assignment of assignments) {
    const platform = text(assignment.platform);
    if (!platform) continue;
    byPlatform.set(platform, [...(byPlatform.get(platform) ?? []), assignment]);
  }

  const result: Record<string, CalosConnectionHealth> = {};
  const ready: CalosAssignmentLike[] = [];
  for (const [platform, platformAssignments] of byPlatform) {
    if (!isCalosAutoPublishPlatform(platform)) {
      result[platform] = health(platformAssignments[0], "attention", `Automatic ${platform} publishing is not available.`);
      continue;
    }
    if (platformAssignments.length !== 1) {
      result[platform] = {
        state: "attention",
        accountRef: null,
        displayName: null,
        message: "Multiple accounts are assigned. Keep one active account before publishing.",
      };
      continue;
    }
    const account = platformAssignments[0];
    if (!text(account.accountRef) || !text(account.ownerUserId)) {
      result[platform] = health(account, "attention", "This account assignment is incomplete. Reconnect it before publishing.");
      continue;
    }
    ready.push(account);
  }

  const [ownerTokens, instagramHealth] = await Promise.all([
    loadOwnerTokens(ready),
    loadInstagramAssignmentHealth(ready.map((account) => ({
      platform: account.platform,
      ownerUserId: text(account.ownerUserId) || undefined,
    }))),
  ]);
  for (const account of ready) {
    const platform = text(account.platform);
    if (platform === "instagram") {
      const liveHealth = instagramHealth.get(text(account.ownerUserId));
      result[platform] = liveHealth?.connected
        ? assigned(account)
        : reconnect(account, liveHealth?.message || "Instagram must be reconnected before publishing.");
      continue;
    }
    if (platform === "youtube") {
      result[platform] = await youtubeHealth(account);
      continue;
    }
    if (platform === "linkedin" && text(account.accessTokenEnc)) {
      result[platform] = await storedLinkedInHealth(account, requiredThroughMs);
      continue;
    }
    result[platform] = ownerTokenHealth(
      account,
      ownerTokens.get(text(account.ownerUserId)),
      requiredThroughMs,
    );
  }

  return result;
}
