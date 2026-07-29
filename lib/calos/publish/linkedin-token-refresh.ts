export type LinkedInTokenRefreshResult =
  | {
      ok: true;
      accessToken: string;
      refreshToken: string;
      expiresAt: Date;
    }
  | {
      ok: false;
      error: string;
      retryable: boolean;
    };

function text(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

export async function refreshLinkedInAccessToken(
  refreshToken: string,
): Promise<LinkedInTokenRefreshResult> {
  const clientId = text(process.env.LINKEDIN_CLIENT_ID);
  const clientSecret = text(process.env.LINKEDIN_CLIENT_SECRET);
  if (!text(refreshToken) || !clientId || !clientSecret) {
    return {
      ok: false,
      error: "LinkedIn token expired and cannot refresh - reconnect required",
      retryable: false,
    };
  }

  try {
    const response = await fetch("https://www.linkedin.com/oauth/v2/accessToken", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        grant_type: "refresh_token",
        refresh_token: refreshToken,
        client_id: clientId,
        client_secret: clientSecret,
      }),
    });
    const data = await response.json().catch(() => ({})) as {
      access_token?: unknown;
      refresh_token?: unknown;
      expires_in?: unknown;
    };
    if (!response.ok) {
      const retryable = response.status === 429 || response.status >= 500;
      return {
        ok: false,
        error: retryable
          ? "LinkedIn token refresh temporarily failed"
          : "LinkedIn token refresh failed - reconnect required",
        retryable,
      };
    }

    const accessToken = text(data.access_token);
    const expiresInSeconds = Number(data.expires_in);
    if (!accessToken || !Number.isFinite(expiresInSeconds) || expiresInSeconds <= 0) {
      return {
        ok: false,
        error: "LinkedIn token refresh returned an invalid response",
        retryable: true,
      };
    }
    return {
      ok: true,
      accessToken,
      refreshToken: text(data.refresh_token) || refreshToken,
      expiresAt: new Date(Date.now() + expiresInSeconds * 1000),
    };
  } catch (error) {
    console.error("[CALOS_LOUD] LinkedIn token refresh request failed:", error);
    return {
      ok: false,
      error: "LinkedIn token refresh request failed",
      retryable: true,
    };
  }
}
