import { describe, expect, it } from "vitest";
import {
  estimateVoDurationSec,
  titleForBeat,
  voLinesToStoryboard,
  voWordBudget,
  VO_WORDS_PER_SEC,
  type VoScriptBeat,
} from "@/lib/editron/saas-explainer/vo-script";

/**
 * Deterministic pieces of the narration-led VO writer (the LLM call itself is eval-gated, not unit-tested here):
 * the word-budget + timing math and the beats+VO → storyboard assembler.
 */

describe("voWordBudget", () => {
  it("budgets ~2.3 wps × 80% coverage of the runtime (deliberate breathing room)", () => {
    expect(voWordBudget(60)).toBe(Math.round(60 * VO_WORDS_PER_SEC * 0.8)); // 110
    expect(voWordBudget(90)).toBe(Math.round(90 * VO_WORDS_PER_SEC * 0.8)); // 166
  });
  it("never drops below a sane floor for tiny videos", () => {
    expect(voWordBudget(1)).toBe(20);
  });
});

describe("estimateVoDurationSec", () => {
  it("returns 0 for an empty line (a silent beat contributes no read time)", () => {
    expect(estimateVoDurationSec("")).toBe(0);
    expect(estimateVoDurationSec("   ")).toBe(0);
  });
  it("floors short lines so they still breathe", () => {
    expect(estimateVoDurationSec("Ship faster")).toBe(2.6);
  });
  it("fits a longer line to its read time (~2.3 wps)", () => {
    const line = "Your approval workflow lives in twelve browser tabs and three chat threads and it never ends today"; // 17 words
    expect(estimateVoDurationSec(line)).toBeCloseTo(17 / VO_WORDS_PER_SEC, 5);
  });
});

describe("titleForBeat", () => {
  it("humanizes the copyRole/family into a title", () => {
    expect(titleForBeat({ index: 0, family: "hook", copyRole: "hook", durationSec: 3 })).toBe("Hook");
    expect(titleForBeat({ index: 1, family: "ui_proof", copyRole: "ui_proof", durationSec: 4 })).toBe("Ui proof");
  });
  it("falls back to a scene label when role/family are blank", () => {
    expect(titleForBeat({ index: 2, family: "", copyRole: "", durationSec: 3 })).toBe("Scene 3");
  });
});

describe("voLinesToStoryboard", () => {
  const beats: VoScriptBeat[] = [
    { index: 0, family: "hook", copyRole: "hook", directorNotes: ["Cold open on the mess"], durationSec: 5 },
    { index: 1, family: "ui_proof", copyRole: "proof", durationSec: 4 },
  ];

  it("maps flowing VO lines onto the beats as authored narration", () => {
    const scenes = voLinesToStoryboard(beats, [
      { index: 0, vo: "Your workflow is chaos today" },
      { index: 1, vo: "" },
    ]);
    expect(scenes).toHaveLength(2);
    expect(scenes[0]).toMatchObject({ sceneIndex: 0, title: "Hook", narration: "Your workflow is chaos today" });
    // spoken beat: duration fitted to the line's read time.
    expect(scenes[0].durationSeconds).toBeCloseTo(estimateVoDurationSec("Your workflow is chaos today"), 5);
    // wordless beat: narration empty, keeps the director's planned duration (a deliberate hold).
    expect(scenes[1].narration).toBe("");
    expect(scenes[1].durationSeconds).toBe(4);
  });

  it("treats a beat the writer omitted as a wordless hold (no crash)", () => {
    const scenes = voLinesToStoryboard(beats, [{ index: 0, vo: "Only the hook got a line" }]);
    expect(scenes[1].narration).toBe("");
    expect(scenes[0].narration).toBe("Only the hook got a line");
  });

  it("carries director notes into the visual description", () => {
    const scenes = voLinesToStoryboard(beats, [{ index: 0, vo: "x" }, { index: 1, vo: "y" }]);
    expect(scenes[0].visualDescription).toContain("Cold open on the mess");
  });
});
