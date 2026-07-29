export type InstagramTokenHealthReason =
  | "not_connected"
  | "expiry_unknown"
  | "expired";

type InstagramTokenLike = {
  userAccessToken?: unknown;
  expiresAt?: Date | string | null;
} | null | undefined;

export type InstagramTokenHealth = {
  connected: boolean;
  reconnectRequired: boolean;
  reason: InstagramTokenHealthReason | null;
  message: string | null;
  expiresAt: string | null;
  expiresSoon: boolean;
};

export const INSTAGRAM_TOKEN_REFRESH_WINDOW_MS = 7 * 24 * 60 * 60 * 1000;

export function getInstagramTokenHealth(
  tokens: InstagramTokenLike,
  nowMs = Date.now(),
): InstagramTokenHealth {
  const token = typeof tokens?.userAccessToken === "string"
    ? tokens.userAccessToken.trim()
    : "";
  if (!token) {
    return {
      connected: false,
      reconnectRequired: false,
      reason: "not_connected",
      message: "Connect Instagram before publishing.",
      expiresAt: null,
      expiresSoon: false,
    };
  }

  const expiresAtMs = tokens?.expiresAt
    ? new Date(tokens.expiresAt).getTime()
    : Number.NaN;
  if (!Number.isFinite(expiresAtMs)) {
    return {
      connected: false,
      reconnectRequired: true,
      reason: "expiry_unknown",
      message: "Reconnect Instagram once to verify the token expiry.",
      expiresAt: null,
      expiresSoon: false,
    };
  }
  if (expiresAtMs <= nowMs) {
    return {
      connected: false,
      reconnectRequired: true,
      reason: "expired",
      message: "Instagram connection expired. Reconnect before publishing.",
      expiresAt: new Date(expiresAtMs).toISOString(),
      expiresSoon: false,
    };
  }

  return {
    connected: true,
    reconnectRequired: false,
    reason: null,
    message: null,
    expiresAt: new Date(expiresAtMs).toISOString(),
    expiresSoon: expiresAtMs - nowMs <= INSTAGRAM_TOKEN_REFRESH_WINDOW_MS,
  };
}

export type InstagramTokenRefreshResult = {
  ok: boolean;
  status: "valid" | "refreshed" | "invalid" | "expired" | "failed";
  userAccessToken?: string;
  expiresAt?: Date;
  retryable?: boolean;
  error?: string;
  responseStatus?: number;
};

type InstagramRefreshOwnerRow = {
  clerkUserId?: string;
  instagramTokens?: InstagramTokenLike;
};

export async function refreshInstagramTokenIfNeeded(
  ownerUserId: string,
  tokens: InstagramTokenLike,
  nowMs = Date.now(),
): Promise<InstagramTokenRefreshResult> {
  const health = getInstagramTokenHealth(tokens, nowMs);
  const currentToken = typeof tokens?.userAccessToken === "string"
    ? tokens.userAccessToken.trim()
    : "";
  if (!health.connected) {
    return {
      ok: false,
      status: health.reason === "expired" ? "expired" : "invalid",
      retryable: false,
      error: health.message || "Instagram connection is invalid",
    };
  }
  if (!health.expiresSoon) {
    return {
      ok: true,
      status: "valid",
      userAccessToken: currentToken,
      expiresAt: new Date(health.expiresAt as string),
    };
  }

  try {
    const query = new URLSearchParams({
      grant_type: "ig_refresh_token",
      access_token: currentToken,
    });
    const response = await fetch(`https://graph.instagram.com/refresh_access_token?${query}`);
    const data: {
      access_token?: unknown;
      expires_in?: unknown;
      error?: { message?: string };
    } = await response.json().catch(() => ({}));
    const refreshedToken = typeof data.access_token === "string"
      ? data.access_token.trim()
      : "";
    const expiresIn = Number(data.expires_in);
    const refreshedExpiresAtMs = nowMs + expiresIn * 1000;
    if (
      !response.ok ||
      !refreshedToken ||
      !Number.isFinite(expiresIn) ||
      expiresIn <= 0 ||
      !Number.isFinite(refreshedExpiresAtMs)
    ) {
      return {
        ok: false,
        status: "failed",
        retryable: response.status === 429 || response.status >= 500,
        error: data.error?.message || "Instagram token refresh failed - reconnect",
        responseStatus: response.status,
      };
    }

    const refreshedExpiresAt = new Date(refreshedExpiresAtMs);
    const { User } = await import("@/schemas/user");
    await User.updateOne(
      { clerkUserId: ownerUserId, "instagramTokens.userAccessToken": currentToken },
      { $set: {
        "instagramTokens.userAccessToken": refreshedToken,
        "instagramTokens.expiresAt": refreshedExpiresAt,
      } },
    );
    return {
      ok: true,
      status: "refreshed",
      userAccessToken: refreshedToken,
      expiresAt: refreshedExpiresAt,
      responseStatus: response.status,
    };
  } catch (error) {
    return {
      ok: false,
      status: "failed",
      retryable: true,
      error: error instanceof Error
        ? `Instagram token refresh failed: ${error.message}`
        : "Instagram token refresh failed",
    };
  }
}

export async function refreshDueInstagramTokens(
  limit = 25,
  nowMs = Date.now(),
) {
  const batchLimit = Number.isFinite(limit)
    ? Math.min(100, Math.max(1, Math.floor(limit)))
    : 25;
  const { User } = await import("@/schemas/user");
  const users = await User.find({
    "instagramTokens.userAccessToken": { $exists: true, $ne: "" },
    "instagramTokens.expiresAt": {
      $gt: new Date(nowMs),
      $lte: new Date(nowMs + INSTAGRAM_TOKEN_REFRESH_WINDOW_MS),
    },
  })
    .select("clerkUserId instagramTokens.userAccessToken instagramTokens.expiresAt")
    .limit(batchLimit)
    .lean<InstagramRefreshOwnerRow[]>();
  const results = await Promise.all(
    users.map((user) =>
      user.clerkUserId
        ? refreshInstagramTokenIfNeeded(user.clerkUserId, user.instagramTokens, nowMs)
        : Promise.resolve<InstagramTokenRefreshResult>({
            ok: false,
            status: "invalid",
            retryable: false,
            error: "Instagram token owner is missing",
          }),
    ),
  );

  return {
    scanned: results.length,
    refreshed: results.filter((result) => result.status === "refreshed").length,
    valid: results.filter((result) => result.status === "valid").length,
    failed: results.filter((result) => !result.ok).length,
  };
}
