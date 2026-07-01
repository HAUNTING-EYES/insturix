import { describe, expect, it } from "vitest";
import {
  assertUploaderXOAuthStateRecord,
  createUploaderXOAuthStateRecord,
  UPLOADERX_OAUTH_STATE_TTL_MS,
  UploaderXOAuthStateError,
} from "@/app/api/services/uploaderx/utils/oauth-state";

describe("UploaderX OAuth state guard", () => {
  it("creates random provider-scoped state without embedding the user id", () => {
    const now = new Date("2026-06-29T00:00:00.000Z");

    const record = createUploaderXOAuthStateRecord({
      userId: "user_123",
      provider: "facebook",
      orgId: "org_123",
      brandId: "brand_123",
      workspaceId: "workspace_123",
      now,
      nonce: "abcdefghijklmnopqrstuvwxyzABCDEF1234567890_-",
    });

    expect(record.state).toMatch(/^facebook_[A-Za-z0-9_-]{32,}$/);
    expect(record.state).not.toContain("user_123");
    expect(record.orgId).toBe("org_123");
    expect(record.brandId).toBe("brand_123");
    expect(record.workspaceId).toBe("workspace_123");
    expect(record.expiresAt.getTime() - now.getTime()).toBe(UPLOADERX_OAUTH_STATE_TTL_MS);
  });

  it("creates provider-specific state values for Instagram and LinkedIn", () => {
    const now = new Date("2026-06-29T00:00:00.000Z");

    for (const provider of ["instagram", "linkedin"] as const) {
      const record = createUploaderXOAuthStateRecord({
        userId: "user_123",
        provider,
        now,
        nonce: "abcdefghijklmnopqrstuvwxyzABCDEF1234567890_-",
      });

      expect(record.state).toMatch(new RegExp(`^${provider}_[A-Za-z0-9_-]{32,}$`));
      expect(record.state).not.toContain("user_123");
      expect(
        assertUploaderXOAuthStateRecord(record, {
          userId: "user_123",
          provider,
          state: record.state,
          now: new Date(now.getTime() + 1000),
        }),
      ).toEqual(record);
    }
  });

  it("accepts a matching unexpired state", () => {
    const now = new Date("2026-06-29T00:00:00.000Z");
    const record = createUploaderXOAuthStateRecord({
      userId: "user_123",
      provider: "facebook",
      now,
      nonce: "abcdefghijklmnopqrstuvwxyzABCDEF1234567890_-",
    });

    expect(
      assertUploaderXOAuthStateRecord(record, {
        userId: "user_123",
        provider: "facebook",
        state: record.state,
        now: new Date(now.getTime() + 1000),
      }),
    ).toEqual(record);
  });

  it("rejects state replay across users, providers, values, and expiry", () => {
    const now = new Date("2026-06-29T00:00:00.000Z");
    const record = createUploaderXOAuthStateRecord({
      userId: "user_123",
      provider: "facebook",
      now,
      nonce: "abcdefghijklmnopqrstuvwxyzABCDEF1234567890_-",
    });

    expect(() =>
      assertUploaderXOAuthStateRecord(record, {
        userId: "user_456",
        provider: "facebook",
        state: record.state,
        now,
      }),
    ).toThrow(UploaderXOAuthStateError);

    expect(() =>
      assertUploaderXOAuthStateRecord(record, {
        userId: "user_123",
        provider: "linkedin",
        state: record.state,
        now,
      }),
    ).toThrow(UploaderXOAuthStateError);

    expect(() =>
      assertUploaderXOAuthStateRecord(record, {
        userId: "user_123",
        provider: "facebook",
        state: "facebook_differentabcdefghijklmnopqrstuvwxyz123456",
        now,
      }),
    ).toThrow(UploaderXOAuthStateError);

    expect(() =>
      assertUploaderXOAuthStateRecord(record, {
        userId: "user_123",
        provider: "facebook",
        state: record.state,
        now: new Date(now.getTime() + UPLOADERX_OAUTH_STATE_TTL_MS),
      }),
    ).toThrow(UploaderXOAuthStateError);
  });
});
