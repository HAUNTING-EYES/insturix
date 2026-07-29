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

const EXPIRY_WARNING_MS = 7 * 24 * 60 * 60 * 1000;

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
      message: "Reconnect Instagram once to verify the connection lifetime.",
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
    expiresSoon: expiresAtMs - nowMs <= EXPIRY_WARNING_MS,
  };
}
