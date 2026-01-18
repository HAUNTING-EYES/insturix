import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { evaluateChatLimit } from "../services/db";

describe("chat rate limit evaluation", () => {
  it("blocks free users at limit", () => {
    const result = evaluateChatLimit("free", 50);
    assert.equal(result.allowed, false);
    assert.equal(result.remaining, 0);
    assert.equal(result.maxAllowed, 50);
  });

  it("allows paid users at same usage threshold", () => {
    const result = evaluateChatLimit("pro", 50);
    assert.equal(result.allowed, true);
    assert.equal(result.remaining, 450);
    assert.equal(result.maxAllowed, 500);
  });
});
