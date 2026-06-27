import { createHmac, randomBytes, timingSafeEqual } from "crypto";
import connectToDatabase from "@/schemas/ConnectToDatabase";
import CalosDeliverable, { type ICalosDeliverable } from "@/schemas/calos-deliverable";
import CalosShareLink from "@/schemas/calos-share-link";
import { calosScope } from "@/lib/calos/scope";

/**
 * Read-only "client view" share link for a brand's content calendar.
 *
 * An agency drops a single signed URL to its client; the client sees the brand's calendar with NO
 * login and NO write access. The token is an HMAC-signed payload that BINDS the exact read scope
 * ({brandId, orgId|ownerUserId}), so a tampered or cross-brand token is rejected and the link can only
 * ever read the one brand it was minted for. Reuses CALOS_TOKEN_ENCRYPTION_KEY for the HMAC (same key
 * connect-state + token-crypto use; different algorithm, safe to share — see connect-state).
 *
 * Scope: an org-minted link reads the whole org's calendar for the brand (calosScope orgId branch);
 * a solo-minted link reads the creator's. ownerUserId is carried so the solo branch works without a
 * session. The scope binding is also the access control — minting a token for a brand you don't own
 * yields an EMPTY view (no cards match your owner/org), so there is no cross-tenant leak.
 *
 * REVOCABLE: the signature/expiry verify statelessly (no DB hit, so forgeries are rejected cheaply),
 * but every mint also writes a CalosShareLink RECORD keyed by the token nonce (`tokenId`). A view
 * additionally checks that record isn't `revoked` (touchAndCheckShareLink), so an owner can kill a
 * link before its 90-day TTL. Two-stage on purpose: HMAC first (no DB for a forged token), record
 * second (revocation + usage tracking) only for structurally-valid tokens.
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

/** A verified token: the read scope plus the record id (token nonce) used for revocation/usage. */
export interface VerifiedClientView extends CalosClientViewScope {
  tokenId: string;
}

/** A freshly minted token + the fields the caller needs to persist its CalosShareLink record. */
export interface MintedClientViewToken {
  token: string;
  tokenId: string;
  expiresAt: Date;
}

/** Sign a share token for a brand calendar. Throws if the key is missing (caller surfaces a config error). */
export function signClientViewToken(scope: CalosClientViewScope): MintedClientViewToken {
  const tokenId = randomBytes(12).toString("hex");
  const expiry = Date.now() + TTL_MS;
  const payload: SignedPayload = { ...scope, n: tokenId, x: expiry };
  const body = Buffer.from(JSON.stringify(payload), "utf8").toString("base64url");
  return { token: `${body}.${sign(body)}`, tokenId, expiresAt: new Date(expiry) };
}

/**
 * Returns the validated scope + tokenId, or null if the signature is bad, malformed, or expired
 * (fail-safe). This is the STATELESS check (no DB) — revocation is checked separately via
 * touchAndCheckShareLink so a forged/expired token never costs a database read.
 */
export function verifyClientViewToken(token: string | null | undefined): VerifiedClientView | null {
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
    if (!payload.brandId || !payload.ownerUserId || !payload.n) return null;
    return {
      brandId: payload.brandId,
      orgId: payload.orgId ?? null,
      ownerUserId: payload.ownerUserId,
      tokenId: payload.n,
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

// ── Revocable share-link records ────────────────────────────────────────────────────────────────

/** Persist a record for a freshly minted link so it can later be revoked + tracked. */
export async function recordShareLink(input: {
  tokenId: string;
  scope: CalosClientViewScope;
  createdBy: string;
  expiresAt: Date;
  label?: string | null;
}): Promise<void> {
  await connectToDatabase();
  await CalosShareLink.create({
    tokenId: input.tokenId,
    brandId: input.scope.brandId,
    orgId: input.scope.orgId,
    ownerUserId: input.scope.ownerUserId,
    createdBy: input.createdBy,
    label: input.label ?? null,
    expiresAt: input.expiresAt,
    revoked: false,
  });
}

/**
 * A view-time check: confirm the link's record exists and isn't revoked, and record the view
 * (viewCount++ / lastViewedAt) in the same atomic op. Returns false for revoked/missing/expired links
 * (the page then renders the invalid state). Separate from verifyClientViewToken so a forged token is
 * rejected by the signature check WITHOUT a DB read.
 */
export async function touchAndCheckShareLink(tokenId: string): Promise<boolean> {
  await connectToDatabase();
  const rec = await CalosShareLink.findOneAndUpdate(
    { tokenId, revoked: false, expiresAt: { $gt: new Date() } },
    { $inc: { viewCount: 1 }, $set: { lastViewedAt: new Date() } },
  ).lean();
  return !!rec;
}

/** A client-safe view of a share link for the manage-links UI (no token material). */
export interface ShareLinkSummary {
  tokenId: string;
  label: string | null;
  revoked: boolean;
  createdAt: string;
  expiresAt: string;
  viewCount: number;
  lastViewedAt: string | null;
}

/** List a brand's share links for the caller's scope (org-shared or creator-scoped via calosScope). */
export async function listShareLinks(
  session: { userId: string; orgId?: string | null },
  brandId: string,
): Promise<ShareLinkSummary[]> {
  await connectToDatabase();
  const rows = await CalosShareLink.find(calosScope({ userId: session.userId, orgId: session.orgId }, brandId))
    .sort({ createdAt: -1 })
    .lean<
      Array<{
        tokenId: string;
        label?: string | null;
        revoked: boolean;
        createdAt: Date;
        expiresAt: Date;
        viewCount: number;
        lastViewedAt?: Date | null;
      }>
    >();
  return rows.map((r) => ({
    tokenId: r.tokenId,
    label: r.label ?? null,
    revoked: r.revoked,
    createdAt: r.createdAt.toISOString(),
    expiresAt: r.expiresAt.toISOString(),
    viewCount: r.viewCount ?? 0,
    lastViewedAt: r.lastViewedAt ? r.lastViewedAt.toISOString() : null,
  }));
}

/**
 * Revoke a link by tokenId, scoped to the caller (calosScope) so a user can only revoke their own
 * org's/their own links. Returns true if a link was revoked.
 */
export async function revokeShareLink(
  session: { userId: string; orgId?: string | null },
  brandId: string,
  tokenId: string,
): Promise<boolean> {
  await connectToDatabase();
  const res = await CalosShareLink.updateOne(
    { tokenId, ...calosScope({ userId: session.userId, orgId: session.orgId }, brandId) },
    { $set: { revoked: true } },
  );
  return res.modifiedCount > 0;
}
