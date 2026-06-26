import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createHmac } from "crypto";

const mocks = vi.hoisted(() => ({
  connectToDatabase: vi.fn(),
  find: vi.fn(),
}));

vi.mock("@/schemas/ConnectToDatabase", () => ({ default: mocks.connectToDatabase }));
vi.mock("@/schemas/calos-deliverable", () => ({ default: { find: mocks.find } }));

import {
  signClientViewToken,
  verifyClientViewToken,
  loadSharedCalendar,
  type CalosClientViewScope,
} from "@/lib/calos/client-view";

const KEY = "c29tZS10ZXN0LWtleS0zMi1ieXRlcy1sb25nLXh4eHg="; // any base64 — HMAC doesn't require 32 bytes
const OTHER_KEY = "ZGlmZmVyZW50LXRlc3Qta2V5LWZvci1jYWxvcy1zaGFyZQ==";

const ORG_SCOPE: CalosClientViewScope = { brandId: "brand_1", orgId: "org_1", ownerUserId: "user_1" };
const SOLO_SCOPE: CalosClientViewScope = { brandId: "brand_1", orgId: null, ownerUserId: "user_1" };

/** Hand-craft a token with a valid signature over an arbitrary payload (for expiry/tamper tests). */
function craftToken(payload: object, key = KEY): string {
  const body = Buffer.from(JSON.stringify(payload), "utf8").toString("base64url");
  const sig = createHmac("sha256", Buffer.from(key, "base64")).update(body).digest("base64url");
  return `${body}.${sig}`;
}

describe("client-view token", () => {
  beforeEach(() => {
    vi.stubEnv("CALOS_TOKEN_ENCRYPTION_KEY", KEY);
  });
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("round-trips an org scope", () => {
    const token = signClientViewToken(ORG_SCOPE);
    expect(verifyClientViewToken(token)).toEqual(ORG_SCOPE);
  });

  it("round-trips a solo scope (orgId null)", () => {
    const token = signClientViewToken(SOLO_SCOPE);
    expect(verifyClientViewToken(token)).toEqual(SOLO_SCOPE);
  });

  it("rejects a tampered signature", () => {
    const token = signClientViewToken(ORG_SCOPE);
    const [body] = token.split(".");
    expect(verifyClientViewToken(`${body}.deadbeef`)).toBeNull();
  });

  it("rejects a tampered payload (re-pointed to another brand) under the original signature", () => {
    const token = signClientViewToken(ORG_SCOPE);
    const sig = token.split(".")[1];
    const forgedBody = Buffer.from(
      JSON.stringify({ ...ORG_SCOPE, brandId: "brand_VICTIM", n: "x", x: Date.now() + 1000 }),
      "utf8",
    ).toString("base64url");
    expect(verifyClientViewToken(`${forgedBody}.${sig}`)).toBeNull();
  });

  it("rejects an expired token even with a valid signature", () => {
    const expired = craftToken({ ...ORG_SCOPE, n: "abc", x: Date.now() - 1000 });
    expect(verifyClientViewToken(expired)).toBeNull();
  });

  it("rejects a token signed with a different key", () => {
    const token = craftToken({ ...ORG_SCOPE, n: "abc", x: Date.now() + 100000 }, OTHER_KEY);
    expect(verifyClientViewToken(token)).toBeNull();
  });

  it("returns null when the signing key is missing", () => {
    const token = signClientViewToken(ORG_SCOPE);
    vi.stubEnv("CALOS_TOKEN_ENCRYPTION_KEY", "");
    expect(verifyClientViewToken(token)).toBeNull();
  });

  it("rejects null / empty / malformed tokens", () => {
    expect(verifyClientViewToken(null)).toBeNull();
    expect(verifyClientViewToken("")).toBeNull();
    expect(verifyClientViewToken("no-dot")).toBeNull();
    expect(verifyClientViewToken("a.b.c.d")).toBeNull();
  });

  it("throws when minting without a signing key", () => {
    vi.stubEnv("CALOS_TOKEN_ENCRYPTION_KEY", "");
    expect(() => signClientViewToken(ORG_SCOPE)).toThrow(/CALOS_TOKEN_ENCRYPTION_KEY/);
  });
});

describe("loadSharedCalendar", () => {
  beforeEach(() => {
    mocks.connectToDatabase.mockReset().mockResolvedValue(undefined);
    mocks.find.mockReset();
  });

  function mockDocs(docs: unknown[]) {
    mocks.find.mockReturnValue({ select: vi.fn(() => ({ lean: vi.fn(async () => docs) })) });
  }

  it("scopes the query by org when the scope has an orgId", async () => {
    mockDocs([]);
    await loadSharedCalendar(ORG_SCOPE);
    expect(mocks.find).toHaveBeenCalledWith({ brandId: "brand_1", orgId: "org_1", deletedAt: null });
  });

  it("scopes the query by creator when the scope has no orgId", async () => {
    mockDocs([]);
    await loadSharedCalendar(SOLO_SCOPE);
    expect(mocks.find).toHaveBeenCalledWith({ brandId: "brand_1", ownerUserId: "user_1", deletedAt: null });
  });

  it("returns a sanitized projection — no owner/org/approvals leak", async () => {
    mockDocs([
      {
        ownerUserId: "user_1",
        orgId: "org_1",
        approvals: [{ actor: "user_1", decision: "approved" }],
        serviceRef: { service: "thinkforge", sessionId: "s1" },
        errorMessage: "secret",
        editorialStatus: "approved",
        plannedDates: ["2026-07-01T00:00:00.000Z"],
        platform: "instagram",
        assetUrl: "https://cdn/x.jpg",
        card: { id: "c1", title: "Launch post", scriptPreview: "hello", contentFormat: "image" },
      },
    ]);
    const out = await loadSharedCalendar(ORG_SCOPE);
    expect(out).toEqual([
      {
        id: "c1",
        title: "Launch post",
        plannedDates: ["2026-07-01T00:00:00.000Z"],
        platform: "instagram",
        contentFormat: "image",
        editorialStatus: "approved",
        scriptPreview: "hello",
        assetUrl: "https://cdn/x.jpg",
      },
    ]);
    const card = out[0] as unknown as Record<string, unknown>;
    expect(card.ownerUserId).toBeUndefined();
    expect(card.orgId).toBeUndefined();
    expect(card.approvals).toBeUndefined();
    expect(card.serviceRef).toBeUndefined();
    expect(card.errorMessage).toBeUndefined();
  });

  it("drops malformed docs (missing card id/title)", async () => {
    mockDocs([
      { editorialStatus: "idea", plannedDates: [], platform: "generic", card: { title: "no id" } },
      { editorialStatus: "idea", plannedDates: [], platform: "generic", card: { id: "ok", title: "keep" } },
    ]);
    const out = await loadSharedCalendar(ORG_SCOPE);
    expect(out.map((c) => c.id)).toEqual(["ok"]);
  });
});
