import { createCipheriv, createDecipheriv, randomBytes } from "crypto";

const USER_OAUTH_TOKEN_PREFIX = "oauth:v1:";

/**
 * AES-256-GCM encryption at rest for connected-account OAuth tokens.
 *
 * The legacy per-user tokens (User.<platform>Tokens) sit plaintext in Mongo. The per-brand
 * connected-account store holds MANY long-lived refresh tokens (an agency with 40 clients = 40+
 * tokens in one collection) — a single read leak there exposes every client's account, so this
 * store encrypts at rest from day one (eng-review R1).
 *
 * Key: base64-encoded 32 bytes in CALOS_TOKEN_ENCRYPTION_KEY (generate: `openssl rand -base64 32`).
 * Stored blob format: base64(iv).base64(authTag).base64(ciphertext).
 */

function getKey(): Buffer {
  const raw = process.env.CALOS_TOKEN_ENCRYPTION_KEY;
  if (!raw) {
    throw new Error("CALOS_TOKEN_ENCRYPTION_KEY is not set — refusing to handle connected-account tokens");
  }
  const key = Buffer.from(raw, "base64");
  if (key.length !== 32) {
    throw new Error("CALOS_TOKEN_ENCRYPTION_KEY must be base64-encoded 32 bytes (AES-256)");
  }
  return key;
}

/** Encrypt a token for storage. Throws if the key is missing/invalid — NEVER falls back to plaintext. */
export function encryptToken(plaintext: string): string {
  const key = getKey();
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  const enc = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `${iv.toString("base64")}.${tag.toString("base64")}.${enc.toString("base64")}`;
}

/**
 * Decrypt a stored token. Returns null on ANY failure (missing key, tamper, bad format) so callers
 * fail safe (treat as "no usable token → reconnect") rather than throwing into a publish.
 */
export function decryptToken(blob: string | null | undefined): string | null {
  if (!blob) return null;
  try {
    const key = getKey();
    const [ivB64, tagB64, dataB64] = blob.split(".");
    if (!ivB64 || !tagB64 || !dataB64) return null;
    const decipher = createDecipheriv("aes-256-gcm", key, Buffer.from(ivB64, "base64"));
    decipher.setAuthTag(Buffer.from(tagB64, "base64"));
    const dec = Buffer.concat([decipher.update(Buffer.from(dataB64, "base64")), decipher.final()]);
    return dec.toString("utf8");
  } catch (err) {
    // TODO(CALOS_LOUD): remove temporary loud logging once CalOS connect/publish verified stable.
    console.error("[CALOS_LOUD] token-crypto.decryptToken failed (bad key / tampered blob / wrong format):", err);
    return null;
  }
}

/**
 * Store a User.<platform>Tokens secret with an explicit envelope version.
 * The prefix prevents legacy plaintext tokens (including JWT-shaped values) from being
 * mistaken for ciphertext while readers are migrated platform by platform.
 */
export function encryptUserOAuthToken(plaintext: string): string {
  if (!plaintext) {
    throw new Error("Cannot encrypt an empty user OAuth token");
  }
  return `${USER_OAUTH_TOKEN_PREFIX}${encryptToken(plaintext)}`;
}

/**
 * Resolve a User.<platform>Tokens secret during the encryption migration.
 * Unprefixed values are legacy plaintext. Prefixed values must decrypt successfully and
 * never fall back to the stored ciphertext.
 */
export function resolveUserOAuthToken(
  stored: string | null | undefined,
): string | null {
  if (!stored) return null;
  if (!stored.startsWith(USER_OAUTH_TOKEN_PREFIX)) return stored;
  return decryptToken(stored.slice(USER_OAUTH_TOKEN_PREFIX.length));
}
