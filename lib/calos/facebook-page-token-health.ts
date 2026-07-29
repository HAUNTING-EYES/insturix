const FACEBOOK_VALIDATION_TIMEOUT_MS = 5_000;
const FACEBOOK_TRANSIENT_ERROR_CODES = new Set([1, 2, 4, 17, 32, 341, 613]);

export const FACEBOOK_RECONNECT_MESSAGE =
  "Assigned Facebook Page connection expired or lost publishing access. Reconnect Facebook before publishing.";

export const FACEBOOK_ATTENTION_MESSAGE =
  "Facebook Page connection could not be verified. Try again before approving or retrying.";

export type FacebookPageTokenHealth =
  | { state: "valid" }
  | { state: "reconnect"; message: string }
  | { state: "attention"; message: string };

type FacebookGraphIdentityResponse = {
  id?: unknown;
  error?: {
    code?: unknown;
    error_subcode?: unknown;
    type?: unknown;
  };
};

function text(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function finiteNumber(value: unknown): number | null {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function graphVersion(): string {
  const raw = text(process.env.FACEBOOK_GRAPH_API_VERSION) || "v21.0";
  return raw.startsWith("v") ? raw : `v${raw}`;
}

function reconnect(): FacebookPageTokenHealth {
  return { state: "reconnect", message: FACEBOOK_RECONNECT_MESSAGE };
}

function attention(): FacebookPageTokenHealth {
  return { state: "attention", message: FACEBOOK_ATTENTION_MESSAGE };
}

export async function validateFacebookPageToken(
  pageId: string,
  pageAccessToken: string,
): Promise<FacebookPageTokenHealth> {
  const expectedPageId = text(pageId);
  const token = text(pageAccessToken);
  if (!expectedPageId || !token) return reconnect();

  try {
    const response = await fetch(
      `https://graph.facebook.com/${graphVersion()}/${encodeURIComponent(expectedPageId)}?fields=id`,
      {
        headers: { Authorization: `Bearer ${token}` },
        cache: "no-store",
        signal: AbortSignal.timeout(FACEBOOK_VALIDATION_TIMEOUT_MS),
      },
    );
    const data = await response.json().catch(() => ({})) as FacebookGraphIdentityResponse;
    if (!response.ok || data.error) {
      const graphCode = finiteNumber(data.error?.code);
      if (
        response.status === 429 ||
        response.status >= 500 ||
        (graphCode !== null && FACEBOOK_TRANSIENT_ERROR_CODES.has(graphCode))
      ) {
        return attention();
      }
      return reconnect();
    }

    const actualPageId = text(data.id);
    if (!actualPageId) return attention();
    return actualPageId === expectedPageId ? { state: "valid" } : reconnect();
  } catch (error) {
    console.error("[CALOS_LOUD] Facebook Page token validation failed:", {
      pageId: expectedPageId,
      error: error instanceof Error ? error.message : "unknown error",
    });
    return attention();
  }
}
