import { describe, expect, it } from "vitest";
import { parseWalletCredits } from "@/lib/studio/client/turnClient";

describe("parseWalletCredits", () => {
  it("accepts the nested balance shape", () => {
    expect(parseWalletCredits({ balance: { totalCredits: 12, totalMediaCredits: 4 } })).toEqual({ main: 12, media: 4 });
  });

  it("accepts the flat shape and defaults media to 0", () => {
    expect(parseWalletCredits({ totalCredits: 7 })).toEqual({ main: 7, media: 0 });
  });

  it("returns null for anything without a numeric main balance — unknown, never faked", () => {
    expect(parseWalletCredits(null)).toBeNull();
    expect(parseWalletCredits({})).toBeNull();
    expect(parseWalletCredits({ totalCredits: "328" })).toBeNull();
    expect(parseWalletCredits({ balance: { totalMediaCredits: 5 } })).toBeNull();
  });
});
