import { createHmac, randomBytes, timingSafeEqual } from "crypto";

/**
 * Signed, short-TTL state for the CalOS client-connect OAuth (Model B). The legacy connect used a raw
 * `state = userId`, which is forgeable (eng-review R3). This binds {ownerUserId, orgId, brandId,
 * platform} into an HMAC-signed, time-boxed token so a tampered or stale callback is rejected. Replay
 * is further limited downstream: the OAuth `code` is single-use (LinkedIn rejects replays) and the
 * pending record is consumed once at /select.
 *
 * The HMAC secret reuses CALOS_TOKEN_ENCRYPTION_KEY (already required for Model B token encryption) —
 * one secret to manage for the whole client-connect feature. Different algorithm (HMAC vs AES-GCM),
 * so sharing the key material is safe.
 */

const TTL_MS = 15 * 60 * 1000;

export interface CalosConnectState {
  ownerUserId: string;
  orgId: string | null;
  brandId: string;
  platform: string;
}

interface SignedPayload extends CalosConnectState {
  n: string; // nonce
  x: number; // expiry (epoch ms)
}

function hmacKey(): Buffer {
  const raw = process.env.CALOS_TOKEN_ENCRYPTION_KEY;
  if (!raw) {
    throw new Error("CALOS_TOKEN_ENCRYPTION_KEY is not set — required to sign the client-connect state");
  }
  return Buffer.from(raw, "base64");
}

function sign(body: string): string {
  return createHmac("sha256", hmacKey()).update(body).digest("base64url");
}

/** Sign state for the OAuth redirect. Throws if the key is missing (caller surfaces a config error). */
export function signCalosConnectState(input: CalosConnectState): string {
  const payload: SignedPayload = {
    ...input,
    n: randomBytes(12).toString("hex"),
    x: Date.now() + TTL_MS,
  };
  const body = Buffer.from(JSON.stringify(payload), "utf8").toString("base64url");
  return `${body}.${sign(body)}`;
}

/** Returns the validated state, or null if the signature is bad, malformed, or expired. */
export function verifyCalosConnectState(state: string | null | undefined): CalosConnectState | null {
  if (!state) return null;
  const [body, sig] = state.split(".");
  if (!body || !sig) return null;

  let expected: string;
  try {
    expected = sign(body);
  } catch {
    return null; // key missing — treat as unverifiable
  }
  const a = Buffer.from(sig);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null;

  try {
    const payload = JSON.parse(Buffer.from(body, "base64url").toString("utf8")) as SignedPayload;
    if (!payload?.x || payload.x < Date.now()) return null;
    if (!payload.ownerUserId || !payload.brandId || !payload.platform) return null;
    return {
      ownerUserId: payload.ownerUserId,
      orgId: payload.orgId ?? null,
      brandId: payload.brandId,
      platform: payload.platform,
    };
  } catch {
    return null;
  }
}
