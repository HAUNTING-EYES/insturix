import { createHmac, randomBytes, timingSafeEqual } from "crypto";
import connectToDatabase from "@/schemas/ConnectToDatabase";
import CalosDeliverable, { type ICalosDeliverable } from "@/schemas/calos-deliverable";
import { calosScope } from "@/lib/calos/scope";

/**
 * Read-only "client view" share link for a brand's content calendar.
 *
 * An agency drops a single signed URL to its client; the client sees the brand's calendar with NO
 * login and NO write access. The token is a stateless HMAC-signed payload that BINDS the exact read
 * scope ({brandId, orgId|ownerUserId}), so a tampered or cross-brand token is rejected and the link
 * can only ever read the one brand it was minted for. Reuses CALOS_TOKEN_ENCRYPTION_KEY for the HMAC
 * (same key connect-state + token-crypto use; different algorithm, safe to share — see connect-state).
 *
 * Scope: an org-minted link reads the whole org's calendar for the brand (calosScope orgId branch);
 * a solo-minted link reads the creator's. ownerUserId is carried so the solo branch works without a
 * session. The scope binding is also the access control — minting a token for a brand you don't own
 * yields an EMPTY view (no cards match your owner/org), so there is no cross-tenant leak.
 *
 * ponytail: the token is STATELESS, so it can't be revoked before it expires — to kill a shared link
 * today you wait out the TTL. A revocable version (a stored share record, or a per-brand share salt
 * folded into the signature) is the follow-up, mirroring the connected-account store. The TTL keeps a
 * leaked/forgotten link from living forever.
 */

const TTL_MS = 90 * 24 * 60 * 60 * 1000; // 90 days ← client keeps the link; TTL bounds a leaked link's lifetime.

export interface CalosClientViewScope {
  brandId: string;
  orgId: string | null;
  ownerUserId: string;
}

interface SignedPayload extends CalosClientViewScope {
  n: string; // nonce — distinct tokens for the same scope
  x: number; // expiry (epoch ms)
}

function hmacKey(): Buffer {
  const raw = process.env.CALOS_TOKEN_ENCRYPTION_KEY;
  if (!raw) {
    throw new Error("CALOS_TOKEN_ENCRYPTION_KEY is not set — required to sign the client-view share link");
  }
  return Buffer.from(raw, "base64");
}

function sign(body: string): string {
  return createHmac("sha256", hmacKey()).update(body).digest("base64url");
}

/** Sign a share token for a brand calendar. Throws if the key is missing (caller surfaces a config error). */
export function signClientViewToken(scope: CalosClientViewScope): string {
  const payload: SignedPayload = {
    ...scope,
    n: randomBytes(12).toString("hex"),
    x: Date.now() + TTL_MS,
  };
  const body = Buffer.from(JSON.stringify(payload), "utf8").toString("base64url");
  return `${body}.${sign(body)}`;
}

/** Returns the validated scope, or null if the signature is bad, malformed, or expired (fail-safe). */
export function verifyClientViewToken(token: string | null | undefined): CalosClientViewScope | null {
  if (!token) return null;
  const [body, sig] = token.split(".");
  if (!body || !sig) return null;

  let expected: string;
  try {
    expected = sign(body);
  } catch (err) {
    // TODO(CALOS_LOUD): revert to warn once stable.
    console.error("[CALOS_LOUD] client-view.verify: cannot sign (CALOS_TOKEN_ENCRYPTION_KEY missing?):", err);
    return null; // key missing — treat as unverifiable
  }
  const a = Buffer.from(sig);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null;

  try {
    const payload = JSON.parse(Buffer.from(body, "base64url").toString("utf8")) as SignedPayload;
    if (!payload?.x || payload.x < Date.now()) return null;
    if (!payload.brandId || !payload.ownerUserId) return null;
    return {
      brandId: payload.brandId,
      orgId: payload.orgId ?? null,
      ownerUserId: payload.ownerUserId,
    };
  } catch (err) {
    // TODO(CALOS_LOUD): revert to warn once stable.
    console.error("[CALOS_LOUD] client-view.verify: malformed/tampered token payload:", err);
    return null;
  }
}

/** A read-only, client-safe projection of a calendar card — NO owner/org/approvals/serviceRef internals. */
export interface SharedCalendarCard {
  id: string;
  title: string;
  plannedDates: string[];
  platform: string;
  contentFormat: string | null;
  editorialStatus: string;
  scriptPreview: string | null;
  assetUrl: string | null;
}

/**
 * Load the brand's calendar for a verified share scope. Sanitized projection only — strips
 * ownerUserId/orgId/approvals/serviceRef/errorMessage so the client never sees internals. Sorted by
 * first planned date so the public page can group chronologically.
 */
export async function loadSharedCalendar(scope: CalosClientViewScope): Promise<SharedCalendarCard[]> {
  await connectToDatabase();
  const docs = await CalosDeliverable.find({
    ...calosScope({ userId: scope.ownerUserId, orgId: scope.orgId }, scope.brandId),
    deletedAt: null,
  })
    .select("card editorialStatus plannedDates platform assetUrl")
    .lean<ICalosDeliverable[]>();

  return docs
    .map((d): SharedCalendarCard | null => {
      const card = d.card;
      if (!card?.id || !card?.title) return null;
      return {
        id: card.id,
        title: card.title,
        plannedDates: Array.isArray(d.plannedDates) && d.plannedDates.length > 0
          ? d.plannedDates
          : (card.plannedDates ?? []),
        platform: d.platform || card.platform || "generic",
        contentFormat: card.contentFormat ?? null,
        editorialStatus: d.editorialStatus || "idea",
        scriptPreview: card.scriptPreview ?? null,
        assetUrl: d.assetUrl ?? null,
      };
    })
    .filter((c): c is SharedCalendarCard => c !== null)
    .sort((a, b) => (a.plannedDates[0] ?? "").localeCompare(b.plannedDates[0] ?? ""));
}
