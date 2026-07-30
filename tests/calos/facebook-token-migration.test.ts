import { describe, expect, it, vi } from "vitest";

import {
  migrateFacebookTokenRecords,
  type FacebookTokenMigrationRecord,
} from "../../scripts/migrate-facebook-oauth-tokens";

describe("Facebook OAuth token migration", () => {
  it("audits legacy tokens without encrypting or writing in dry-run mode", async () => {
    const encrypt = vi.fn((token: string) => `encrypted:${token}`);
    const updateOne = vi.fn();
    const records: FacebookTokenMigrationRecord[] = [
      {
        _id: "user-1",
        facebookTokens: {
          userAccessToken: "legacy-user-token",
          pages: [
            { pageId: "page-1", pageAccessToken: "legacy-page-token" },
            { pageId: "page-2", pageAccessToken: "oauth:v1:already-enveloped" },
            { pageId: "page-3", pageAccessToken: "" },
          ],
        },
      },
    ];

    const report = await migrateFacebookTokenRecords(records, {
      apply: false,
      encrypt,
      updateOne,
    });

    expect(report).toEqual({
      mode: "dry-run",
      usersScanned: 1,
      usersNeedingMigration: 1,
      usersMigrated: 0,
      plaintextUserTokens: 1,
      plaintextPageTokens: 1,
      envelopedTokens: 1,
      invalidTokenFields: 1,
      unsafePageTokens: 0,
      writesAttempted: 0,
      tokensMigrated: 0,
      compareAndSetMisses: 0,
    });
    expect(encrypt).not.toHaveBeenCalled();
    expect(updateOne).not.toHaveBeenCalled();
    expect(JSON.stringify(report)).not.toContain("legacy");
  });

  it("encrypts user and Page tokens with per-secret compare-and-set updates", async () => {
    const updateOne = vi.fn().mockResolvedValue({ modifiedCount: 1 });
    const encrypt = vi.fn((token: string) => `oauth:v1:encrypted:${token}`);
    const records: FacebookTokenMigrationRecord[] = [
      {
        _id: "user-2",
        facebookTokens: {
          userAccessToken: "legacy-user-token",
          pages: [{ pageId: "page-7", pageAccessToken: "legacy-page-token" }],
        },
      },
    ];

    const report = await migrateFacebookTokenRecords(records, {
      apply: true,
      encrypt,
      updateOne,
    });

    expect(updateOne).toHaveBeenNthCalledWith(
      1,
      {
        _id: "user-2",
        "facebookTokens.userAccessToken": "legacy-user-token",
      },
      {
        $set: {
          "facebookTokens.userAccessToken":
            "oauth:v1:encrypted:legacy-user-token",
        },
      },
    );
    expect(updateOne).toHaveBeenNthCalledWith(
      2,
      {
        _id: "user-2",
        "facebookTokens.pages": {
          $elemMatch: {
            pageId: "page-7",
            pageAccessToken: "legacy-page-token",
          },
        },
      },
      {
        $set: {
          "facebookTokens.pages.$[page].pageAccessToken":
            "oauth:v1:encrypted:legacy-page-token",
        },
      },
      {
        arrayFilters: [
          {
            "page.pageId": "page-7",
            "page.pageAccessToken": "legacy-page-token",
          },
        ],
      },
    );
    expect(report.tokensMigrated).toBe(2);
    expect(report.usersMigrated).toBe(1);
    expect(report.compareAndSetMisses).toBe(0);
    expect(JSON.stringify(report)).not.toContain("legacy");
  });

  it("reports compare-and-set misses and skips ambiguous duplicate Page ids", async () => {
    const updateOne = vi.fn().mockResolvedValue({ modifiedCount: 0 });
    const records: FacebookTokenMigrationRecord[] = [
      {
        _id: "user-3",
        facebookTokens: {
          userAccessToken: "legacy-user-token",
          pages: [],
        },
      },
      {
        _id: "user-3b",
        facebookTokens: {
          userAccessToken: "oauth:v1:user-ciphertext",
          pages: [
            { pageId: "duplicate-page", pageAccessToken: "page-token-a" },
            { pageId: "duplicate-page", pageAccessToken: "page-token-b" },
          ],
        },
      },
    ];

    const report = await migrateFacebookTokenRecords(records, {
      apply: true,
      encrypt: (token) => `oauth:v1:encrypted:${token}`,
      updateOne,
    });

    expect(updateOne).toHaveBeenCalledTimes(1);
    expect(report.usersNeedingMigration).toBe(2);
    expect(report.plaintextPageTokens).toBe(2);
    expect(report.unsafePageTokens).toBe(2);
    expect(report.tokensMigrated).toBe(0);
    expect(report.compareAndSetMisses).toBe(1);
  });

  it("is idempotent for enveloped tokens and fails closed before a write", async () => {
    const updateOne = vi.fn();
    const encryptedRecords: FacebookTokenMigrationRecord[] = [
      {
        _id: "user-4",
        facebookTokens: {
          userAccessToken: "oauth:v1:user-ciphertext",
          pages: [
            {
              pageId: "page-4",
              pageAccessToken: "oauth:v1:page-ciphertext",
            },
          ],
        },
      },
    ];

    const rerunReport = await migrateFacebookTokenRecords(encryptedRecords, {
      apply: true,
      encrypt: vi.fn(),
      updateOne,
    });

    expect(rerunReport.envelopedTokens).toBe(2);
    expect(rerunReport.writesAttempted).toBe(0);
    expect(updateOne).not.toHaveBeenCalled();

    await expect(
      migrateFacebookTokenRecords(
        [
          {
            _id: "user-5",
            facebookTokens: { userAccessToken: "legacy-token", pages: [] },
          },
        ],
        {
          apply: true,
          encrypt: () => {
            throw new Error("missing encryption key");
          },
          updateOne,
        },
      ),
    ).rejects.toThrow("missing encryption key");
    expect(updateOne).not.toHaveBeenCalled();
  });
});
