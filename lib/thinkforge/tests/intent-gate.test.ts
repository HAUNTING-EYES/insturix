import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { classifyIntentFast } from "../intent/intent-gate";

const EDIT = "SCRIPT_EDIT";
const CHAT = "CHAT";
const META = "META_QUESTION";
const GEN = "SCRIPT_GENERATE";

describe("intent-gate fast path", () => {
  it("flags edit when verb and selection present", () => {
    const res = classifyIntentFast("please edit this section", "some text", true);
    assert.equal(res.intent, EDIT);
    assert.equal(res.executable, true);
  });

  it("detects structural mutation without scope", () => {
    const res = classifyIntentFast("add a section for how to edit this video", "", true);
    assert.equal(res.intent, EDIT);
    assert.equal(res.executable, false);
    assert.equal(res.reason, "missing_scope");
  });

  it("does not edit when verb present but no selection and no structural noun", () => {
    const res = classifyIntentFast("edit this", "", true);
    assert.equal(res.intent, CHAT);
  });

  it("treats meta questions as META_QUESTION", () => {
    const res = classifyIntentFast("What is ThinkForge pricing?", null, false);
    assert.equal(res.intent, META);
  });

  it("treats generate intent when no script and generate verb", () => {
    const res = classifyIntentFast("please generate a script", null, false);
    assert.equal(res.intent, GEN);
  });

  it("detects generative imperative even with existing script", () => {
    const res = classifyIntentFast("write the script", null, true);
    assert.equal(res.intent, GEN);
  });

  it("detects artifact nouns as generative intent", () => {
    const res = classifyIntentFast("draft a step by step guide", null, true);
    assert.equal(res.intent, GEN);
  });

  it("shields meta questions from being treated as generate", () => {
    const res = classifyIntentFast("how do you write scripts?", null, true);
    assert.equal(res.intent, META);
  });

  it("defaults to chat when no signals", () => {
    const res = classifyIntentFast("hello", null, true);
    assert.equal(res.intent, CHAT);
  });
});
