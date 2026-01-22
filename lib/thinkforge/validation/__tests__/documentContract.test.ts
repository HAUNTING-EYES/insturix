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
    assert.ok(Array.isArray(result.violations));
  });

  it("two H1 headers → telemetry", () => {
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
    assert.equal(result.valid, true);
    assert.ok(result.violations.some(v => v.includes("multiple H1")));
  });

  it("no H1 header → telemetry", () => {
    const blocks: ThinkForgeBlock[] = [
      {
        id: "blk_1",
        kind: "header",
        content: [{ type: "text", text: "Only H2", styles: {} }],
        meta: { level: 2 },
      },
    ];

    const result = validateDocumentContract(blocks);
    assert.equal(result.valid, true);
    assert.ok(result.violations.some(v => v.includes("missing H1")));
  });

  it("duplicate H2 titles → telemetry", () => {
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
    assert.equal(result.valid, true);
    assert.ok(result.violations.some(v => v.includes("duplicate header")));
  });

  it("director note in paragraph instead of why block → telemetry", () => {
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
    assert.equal(result.valid, true);
    assert.ok(result.violations.some(v => v.includes("director note") && v.includes("kind \"why\"")));
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

  it("empty header → telemetry", () => {
    const blocks: ThinkForgeBlock[] = [
      {
        id: "blk_1",
        kind: "header",
        content: [{ type: "text", text: "", styles: {} }],
        meta: { level: 1 },
      },
    ];

    const result = validateDocumentContract(blocks);
    assert.equal(result.valid, true);
    assert.ok(result.violations.some(v => v.includes("empty header")));
  });

  it("paragraph with 3+ comma-separated items → telemetry", () => {
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
    assert.equal(result.valid, true);
    assert.ok(result.violations.some(v => v.includes("list opportunity")));
  });

  it("paragraph with numbered list pattern → telemetry", () => {
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
    assert.equal(result.valid, true);
    assert.ok(result.violations.some(v => v.includes("list opportunity")));
  });

  it("empty document → passes", () => {
    const result = validateDocumentContract([]);
    assert.equal(result.valid, true);
    assert.equal(result.violations.length, 0);
  });
});
