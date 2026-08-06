import type { CalosPublishPlatform } from "@/schemas/calos-scheduled-publish";
import { loadInstagramAssignmentHealth } from "@/lib/calos/instagram-assignment-health";
import { validateFacebookPageToken } from "@/lib/calos/facebook-page-token-health";
import { resolveUserOAuthToken } from "@/lib/calos/publish/token-crypto";
import { resolveOwnerYouTubeChannels } from "@/lib/calos/publish/youtube";

const AUTO_PUBLISH_PLATFORMS = new Set<string>(["youtube", "facebook", "instagram", "linkedin", "twitter"]);
const LINKEDIN_APPROVED_ORG_ROLES = new Set([
  "ADMINISTRATOR",
  "CONTENT_ADMIN",
  "CONTENT_ADMINISTRATOR",
  "DIRECT_SPONSORED_CONTENT_POSTER",
]);
const LINKEDIN_ORG_ACL_PATH = "/rest/organizationAcls";
const LINKEDIN_ORG_ACL_MAX_PAGES = 10;
const LINKEDIN_PREFLIGHT_TIMEOUT_MS = 8_000;

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
  scopes?: string[];
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
    scopes?: string[];
    missingScopes?: string[];
    organizations?: Array<{ id?: string | number }>;
  } | null;
  twitterTokens?: {
    accessToken?: string;
    refreshToken?: string;
    userId?: string;
    expiresAt?: Date | string | null;
    scopes?: string[];
    missingScopes?: string[];
  } | null;
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

function missingRequiredScopes(
  grantedScopes: string[] | undefined,
  explicitlyMissingScopes: string[] | undefined,
  requiredScopes: string[],
): string[] {
  const granted = new Set((grantedScopes ?? []).map(text).filter(Boolean));
  const explicitlyMissing = new Set(
    (explicitlyMissingScopes ?? []).map(text).filter(Boolean),
  );
  return requiredScopes.filter(
    (scope) => explicitlyMissing.has(scope) || !granted.has(scope),
  );
}

function record(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object";
}

function linkedInOrganizationId(value: unknown): string {
  const raw = text(value);
  const prefix = "urn:li:organization:";
  return raw.startsWith(prefix) ? raw.slice(prefix.length) : raw;
}

async function linkedInOrganizationRoleHealth(
  account: CalosAssignmentLike,
  accessToken: string,
): Promise<CalosConnectionHealth> {
  const accountRef = text(account.accountRef);
  let url = new URL("https://api.linkedin.com/rest/organizationAcls");
  url.searchParams.set("q", "roleAssignee");
  url.searchParams.set("state", "APPROVED");
  url.searchParams.set("count", "100");

  for (let page = 0; page < LINKEDIN_ORG_ACL_MAX_PAGES; page += 1) {
    const response = await fetch(url.toString(), {
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
        "Linkedin-Version": process.env.LINKEDIN_REST_API_VERSION || "202605",
        "X-Restli-Protocol-Version": "2.0.0",
      },
      signal: AbortSignal.timeout(LINKEDIN_PREFLIGHT_TIMEOUT_MS),
    });
    if ([401, 403, 404].includes(response.status)) {
      return reconnect(
        account,
        "LinkedIn organization authorization is no longer valid. Reconnect LinkedIn before publishing.",
      );
    }
    if (!response.ok) {
      throw new Error(`LinkedIn organization authorization check failed (${response.status}).`);
    }

    const payload: unknown = await response.json();
    if (!record(payload) || !Array.isArray(payload.elements)) {
      throw new Error("LinkedIn organization authorization returned an invalid response.");
    }
    const hasApprovedRole = payload.elements.some((element) => {
      if (!record(element)) return false;
      const organization = element.organization ?? element.organizationTarget;
      return (
        linkedInOrganizationId(organization) === accountRef &&
        text(element.state) === "APPROVED" &&
        LINKEDIN_APPROVED_ORG_ROLES.has(text(element.role))
      );
    });
    if (hasApprovedRole) return assigned(account);

    const paging = record(payload.paging) ? payload.paging : null;
    const links = paging && Array.isArray(paging.links) ? paging.links : [];
    const next = links.find((link) => record(link) && text(link.rel).toLowerCase() === "next");
    const href = record(next) ? text(next.href) : "";
    if (!href) break;
    const nextUrl = new URL(href, url);
    if (nextUrl.origin !== "https://api.linkedin.com" || nextUrl.pathname !== LINKEDIN_ORG_ACL_PATH) {
      throw new Error("LinkedIn organization authorization returned an unsafe pagination URL.");
    }
    url = nextUrl;
  }

  return reconnect(
    account,
    "The assigned LinkedIn organization no longer has an approved publishing role for this connection. Reassign or reconnect it before publishing.",
  );
}

async function facebookHealth(
  account: CalosAssignmentLike,
  owner: OwnerTokenRow | undefined,
): Promise<CalosConnectionHealth> {
  const accountRef = text(account.accountRef);
  const page = owner?.facebookTokens?.pages?.find(
    (candidate) => text(candidate.pageId) === accountRef,
  );
  const storedPageAccessToken = text(page?.pageAccessToken);
  if (!storedPageAccessToken) {
    return reconnect(account, "Assigned Facebook Page is no longer connected. Reconnect Facebook before publishing.");
  }
  const pageAccessToken = resolveUserOAuthToken(storedPageAccessToken);
  if (!pageAccessToken) {
    return reconnect(account, "Assigned Facebook Page token is unreadable. Reconnect Facebook before publishing.");
  }

  const live = await validateFacebookPageToken(accountRef, pageAccessToken);
  return live.state === "valid"
    ? assigned(account)
    : health(account, live.state, live.message);
}

function ownerTokenHealth(
  account: CalosAssignmentLike,
  owner: OwnerTokenRow | undefined,
  requiredThroughMs: number,
): CalosConnectionHealth {
  const accountRef = text(account.accountRef);
  if (account.platform === "linkedin") {
    const tokens = owner?.linkedinTokens;
    if (!text(tokens?.accessToken)) {
      return reconnect(account, "LinkedIn is no longer connected for this account owner. Reconnect before publishing.");
    }
    const isPersonal = account.accountType === "personal";
    if (isPersonal) {
      if (text(tokens?.userId) !== accountRef) {
        return reconnect(account, "Assigned LinkedIn profile no longer matches the connected profile. Reassign it before publishing.");
      }
    } else {
      const authorizedOrganizations = new Set(
        (tokens?.organizations ?? []).map((organization) =>
          organization.id == null ? "" : String(organization.id).trim(),
        ),
      );
      if (!authorizedOrganizations.has(accountRef)) {
        return reconnect(account, "Assigned LinkedIn organization is no longer available to this account owner. Reassign or reconnect it before publishing.");
      }
    }
    const requiredScopes = isPersonal
      ? ["w_member_social"]
      : ["w_organization_social", "rw_organization_admin"];
    const missingScopes = missingRequiredScopes(
      tokens?.scopes,
      tokens?.missingScopes,
      requiredScopes,
    );
    if (missingScopes.length > 0) {
      return reconnect(account, `LinkedIn publishing permission is missing (${missingScopes.join(", ")}). Reconnect before publishing.`);
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
  const missingScopes = missingRequiredScopes(
    tokens?.scopes,
    tokens?.missingScopes,
    ["tweet.read", "tweet.write", "users.read", "offline.access"],
  );
  if (missingScopes.length > 0) {
    return reconnect(account, `X publishing permission is missing (${missingScopes.join(", ")}). Reconnect before publishing.`);
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
  const isPersonal = account.accountType === "personal";
  const requiredScopes = isPersonal
    ? ["w_member_social"]
    : ["w_organization_social", "rw_organization_admin"];
  const missingScopes = missingRequiredScopes(account.scopes, undefined, requiredScopes);
  if (missingScopes.length > 0) {
    return reconnect(account, `LinkedIn publishing permission is missing (${missingScopes.join(", ")}). Reconnect before publishing.`);
  }

  let accessToken: string;
  try {
    const { decryptToken } = await import("@/lib/calos/publish/token-crypto");
    const decryptedAccessToken = decryptToken(text(account.accessTokenEnc));
    if (!decryptedAccessToken?.trim()) {
      return reconnect(account, "Stored LinkedIn connection is unreadable and must be reconnected before publishing.");
    }
    accessToken = decryptedAccessToken;
  } catch {
    return reconnect(account, "Stored LinkedIn connection is unreadable and must be reconnected before publishing.");
  }

  const expiresAt = timestamp(account.expiresAt);
  if (expiresAt > 0 && expiresAt <= requiredThroughMs) {
    const { decryptToken } = await import("@/lib/calos/publish/token-crypto");
    const refreshTokenEnc = text(account.refreshTokenEnc);
    let refreshToken = "";
    try {
      refreshToken = refreshTokenEnc ? text(decryptToken(refreshTokenEnc)) : "";
    } catch {
      refreshToken = "";
    }
    const canRefresh = Boolean(
      refreshToken &&
      text(process.env.LINKEDIN_CLIENT_ID) &&
      text(process.env.LINKEDIN_CLIENT_SECRET),
    );
    if (!canRefresh) {
      return reconnect(account, "Stored LinkedIn connection expired and must be reconnected before publishing.");
    }
  }
  if (isPersonal || (expiresAt > 0 && expiresAt <= Date.now())) {
    return assigned(account);
  }
  return linkedInOrganizationRoleHealth(account, accessToken);
}

async function youtubeHealth(
  account: CalosAssignmentLike,
): Promise<CalosConnectionHealth> {
  const resolution = await resolveOwnerYouTubeChannels(text(account.ownerUserId));
  if (!resolution.ok) {
    return health(account, resolution.state, resolution.error);
  }
  const matchesAssignment = resolution.channels.some(
    (channel) => channel.accountRef === text(account.accountRef),
  );
  return matchesAssignment
    ? assigned(account)
    : reconnect(
      account,
      "Assigned YouTube channel no longer matches the connected channel. Reassign it before publishing.",
    );
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
      accountRef: text(account.accountRef) || undefined,
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
    if (platform === "facebook") {
      result[platform] = await facebookHealth(
        account,
        ownerTokens.get(text(account.ownerUserId)),
      );
      continue;
    }
    if (platform === "linkedin" && text(account.accessTokenEnc)) {
      result[platform] = await storedLinkedInHealth(account, requiredThroughMs);
      continue;
    }
    const owner = ownerTokens.get(text(account.ownerUserId));
    const ownerHealth = ownerTokenHealth(
      account,
      owner,
      requiredThroughMs,
    );
    if (
      platform === "linkedin" &&
      account.accountType !== "personal" &&
      ownerHealth.state === "assigned"
    ) {
      const expiresAt = timestamp(owner?.linkedinTokens?.expiresAt);
      if (expiresAt > 0 && expiresAt <= Date.now()) {
        result[platform] = ownerHealth;
        continue;
      }
      const accessToken = resolveUserOAuthToken(text(owner?.linkedinTokens?.accessToken));
      result[platform] = accessToken
        ? await linkedInOrganizationRoleHealth(account, accessToken)
        : reconnect(account, "LinkedIn token is unreadable. Reconnect before publishing.");
      continue;
    }
    result[platform] = ownerHealth;
  }

  return result;
}
