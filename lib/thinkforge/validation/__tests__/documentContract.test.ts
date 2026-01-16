import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { validateDocumentContract } from "../documentValidator";
import type { ThinkForgeBlock } from "../../schemas/thinkforge-block";

describe("Document Contract Validator", () => {
  it("valid document → passes", () => {
    const blocks: ThinkForgeBlock[] = [
      {
        id: "blk_1",
        kind: "header",
        content: [{ type: "text", text: "Document Title", styles: {} }],
        meta: { level: 1 },
      },
      {
        id: "blk_2",
        kind: "header",
        content: [{ type: "text", text: "Section One", styles: {} }],
        meta: { level: 2 },
      },
      {
        id: "blk_3",
        kind: "paragraph",
        content: [{ type: "text", text: "Short paragraph.", styles: {} }],
      },
    ];

    const result = validateDocumentContract(blocks);
    assert.equal(result.valid, true);
    assert.equal(result.violations.length, 0);
  });

  it("two H1 headers → fails", () => {
    const blocks: ThinkForgeBlock[] = [
      {
        id: "blk_1",
        kind: "header",
        content: [{ type: "text", text: "First H1", styles: {} }],
        meta: { level: 1 },
      },
      {
        id: "blk_2",
        kind: "header",
        content: [{ type: "text", text: "Second H1", styles: {} }],
        meta: { level: 1 },
      },
    ];

    const result = validateDocumentContract(blocks);
    assert.equal(result.valid, false);
    assert.ok(result.violations.some(v => v.includes("Multiple H1")));
  });

  it("no H1 header → fails", () => {
    const blocks: ThinkForgeBlock[] = [
      {
        id: "blk_1",
        kind: "header",
        content: [{ type: "text", text: "Only H2", styles: {} }],
        meta: { level: 2 },
      },
    ];

    const result = validateDocumentContract(blocks);
    assert.equal(result.valid, false);
    assert.ok(result.violations.some(v => v.includes("No H1 header")));
  });

  it("duplicate H2 titles → fails", () => {
    const blocks: ThinkForgeBlock[] = [
      {
        id: "blk_1",
        kind: "header",
        content: [{ type: "text", text: "Document Title", styles: {} }],
        meta: { level: 1 },
      },
      {
        id: "blk_2",
        kind: "header",
        content: [{ type: "text", text: "Creative Vision", styles: {} }],
        meta: { level: 2 },
      },
      {
        id: "blk_3",
        kind: "header",
        content: [{ type: "text", text: "Creative Vision", styles: {} }],
        meta: { level: 2 },
      },
    ];

    const result = validateDocumentContract(blocks);
    assert.equal(result.valid, false);
    assert.ok(result.violations.some(v => v.includes("Duplicate header")));
  });

  it("long paragraph block → fails", () => {
    const longText = Array(10).fill("This is a very long line of text that goes on and on. ").join("");
    const blocks: ThinkForgeBlock[] = [
      {
        id: "blk_1",
        kind: "header",
        content: [{ type: "text", text: "Document Title", styles: {} }],
        meta: { level: 1 },
      },
      {
        id: "blk_2",
        kind: "paragraph",
        content: [{ type: "text", text: longText, styles: {} }],
      },
    ];

    const result = validateDocumentContract(blocks);
    assert.equal(result.valid, false);
    assert.ok(result.violations.some(v => v.includes("exceeds 4 lines")));
  });

  it("paragraph with multiple newlines exceeding 4 lines → fails", () => {
    const multiLineText = "Line 1\nLine 2\nLine 3\nLine 4\nLine 5\nLine 6";
    const blocks: ThinkForgeBlock[] = [
      {
        id: "blk_1",
        kind: "header",
        content: [{ type: "text", text: "Document Title", styles: {} }],
        meta: { level: 1 },
      },
      {
        id: "blk_2",
        kind: "paragraph",
        content: [{ type: "text", text: multiLineText, styles: {} }],
      },
    ];

    const result = validateDocumentContract(blocks);
    assert.equal(result.valid, false);
    assert.ok(result.violations.some(v => v.includes("exceeds 4 lines")));
  });

  it("director note in paragraph instead of why block → fails", () => {
    const blocks: ThinkForgeBlock[] = [
      {
        id: "blk_1",
        kind: "header",
        content: [{ type: "text", text: "Document Title", styles: {} }],
        meta: { level: 1 },
      },
      {
        id: "blk_2",
        kind: "paragraph",
        content: [{ type: "text", text: "🎬 Director's Note: Let silence breathe.", styles: {} }],
      },
    ];

    const result = validateDocumentContract(blocks);
    assert.equal(result.valid, false);
    assert.ok(result.violations.some(v => v.includes("Director's note") && v.includes("should be kind: \"why\"")));
  });

  it("director note in why block → passes", () => {
    const blocks: ThinkForgeBlock[] = [
      {
        id: "blk_1",
        kind: "header",
        content: [{ type: "text", text: "Document Title", styles: {} }],
        meta: { level: 1 },
      },
      {
        id: "blk_2",
        kind: "why",
        content: [{ type: "text", text: "🎬 Director's Note: Let silence breathe.", styles: {} }],
      },
    ];

    const result = validateDocumentContract(blocks);
    assert.equal(result.valid, true);
  });

  it("empty header → fails", () => {
    const blocks: ThinkForgeBlock[] = [
      {
        id: "blk_1",
        kind: "header",
        content: [{ type: "text", text: "", styles: {} }],
        meta: { level: 1 },
      },
    ];

    const result = validateDocumentContract(blocks);
    assert.equal(result.valid, false);
    assert.ok(result.violations.some(v => v.includes("Empty header")));
  });

  it("paragraph with 3+ comma-separated items → recommends list", () => {
    const blocks: ThinkForgeBlock[] = [
      {
        id: "blk_1",
        kind: "header",
        content: [{ type: "text", text: "Document Title", styles: {} }],
        meta: { level: 1 },
      },
      {
        id: "blk_2",
        kind: "paragraph",
        content: [{ type: "text", text: "Items: apple, banana, cherry, date", styles: {} }],
      },
    ];

    const result = validateDocumentContract(blocks);
    assert.equal(result.valid, false);
    assert.ok(result.violations.some(v => v.includes("should be in a list")));
  });

  it("paragraph with numbered list pattern → recommends list", () => {
    const blocks: ThinkForgeBlock[] = [
      {
        id: "blk_1",
        kind: "header",
        content: [{ type: "text", text: "Document Title", styles: {} }],
        meta: { level: 1 },
      },
      {
        id: "blk_2",
        kind: "paragraph",
        content: [{ type: "text", text: "1. First item\n2. Second item\n3. Third item", styles: {} }],
      },
    ];

    const result = validateDocumentContract(blocks);
    assert.equal(result.valid, false);
    assert.ok(result.violations.some(v => v.includes("should be in a list")));
  });

  it("empty document → passes", () => {
    const result = validateDocumentContract([]);
    assert.equal(result.valid, true);
    assert.equal(result.violations.length, 0);
  });
});
