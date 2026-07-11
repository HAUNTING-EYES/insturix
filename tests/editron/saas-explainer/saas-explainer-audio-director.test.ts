import { describe, expect, it } from "vitest";
import {
  assignAudioTreatments,
  audioFamilyKey,
  type AudioSceneInput,
} from "@/lib/editron/saas-explainer/audio-director";

/**
 * The Audio Director decides per scene: spoken (`vo`) vs deliberate voice-silent beat (`music_beat`). Rules
 * (research-grounded): author's line always wins; CTA always spoken; explanatory families must be spoken; silence
 * only for short, eligible holds; never two silent in a row; silent beats ≤ ~30% of runtime.
 */
function s(overrides: Partial<AudioSceneInput> & { index: number }): AudioSceneInput {
  return { family: "ui_proof", hasAuthoredVo: false, durationSec: 4, ...overrides };
}

describe("audioFamilyKey", () => {
  it("reads the family from a bare family or an ARCHETYPE/family form string", () => {
    expect(audioFamilyKey("ui_proof")).toBe("ui_proof");
    expect(audioFamilyKey("UI_FULL_BLEED/UI_PROOF")).toBe("ui_proof");
    expect(audioFamilyKey("TYPE_OVER_MEDIA/CTA")).toBe("cta");
  });
});

describe("assignAudioTreatments", () => {
  it("keeps an authored voiceover spoken even for a silence-eligible family", () => {
    const [d] = assignAudioTreatments([s({ index: 0, family: "hook", hasAuthoredVo: true })]);
    expect(d.treatment).toBe("vo");
    expect(d.reason).toMatch(/author/);
  });

  it("always speaks the CTA, even with no authored line", () => {
    const [d] = assignAudioTreatments([s({ index: 0, family: "TYPE_OVER_MEDIA/CTA", durationSec: 3 })]);
    expect(d.treatment).toBe("vo");
    expect(d.reason).toMatch(/CTA/);
  });

  it("speaks explanatory families (feature/workflow demo, comparison, metric) that lack a line", () => {
    const out = assignAudioTreatments([
      s({ index: 0, family: "feature_demo" }),
      s({ index: 1, family: "workflow_demo" }),
      s({ index: 2, family: "proof_metric" }),
    ]);
    expect(out.every((d) => d.treatment === "vo")).toBe(true);
  });

  it("makes a short, eligible, wordless hold a music beat (with runtime to spare)", () => {
    // A lone 4s "video" can't be 100% silent, so give it a spoken spacer to leave budget for one hold.
    const out = assignAudioTreatments([
      s({ index: 0, family: "ui_proof", durationSec: 4 }),
      s({ index: 1, family: "feature_demo", durationSec: 40 }),
    ]);
    expect(out[0].treatment).toBe("music_beat");
    expect(out[1].treatment).toBe("vo");
  });

  it("never allows two silent scenes in a row", () => {
    const out = assignAudioTreatments([
      s({ index: 0, family: "hook", durationSec: 3 }),
      s({ index: 1, family: "ui_proof", durationSec: 3 }),
      s({ index: 2, family: "feature_demo", durationSec: 40 }), // spoken spacer → budget for a hold exists
    ]);
    expect(out[0].treatment).toBe("music_beat");
    expect(out[1].treatment).toBe("vo");
    expect(out[1].reason).toMatch(/row/);
  });

  it("does not silence a scene that is too long for a hold", () => {
    const [d] = assignAudioTreatments([s({ index: 0, family: "ui_proof", durationSec: 9 })]);
    expect(d.treatment).toBe("vo");
    expect(d.reason).toMatch(/too long/);
  });

  it("caps silent beats at ~30% of total runtime", () => {
    // 5 eligible short holds separated by long spoken scenes so adjacency never blocks them. Total = 5*3 + 4*30 = 135s;
    // 30% budget = 40.5s → at most 13 silent seconds worth... i.e. ≤ 4 of the 3s holds, but adjacency + budget bound it.
    const scenes: AudioSceneInput[] = [];
    for (let i = 0; i < 5; i++) {
      scenes.push(s({ index: i * 2, family: "ui_proof", durationSec: 3 }));
      scenes.push(s({ index: i * 2 + 1, family: "feature_demo", durationSec: 30 })); // long spoken spacer
    }
    const out = assignAudioTreatments(scenes);
    const silentSec = out
      .filter((d) => d.treatment === "music_beat")
      .reduce((sum, d) => sum + scenes[scenes.findIndex((x) => x.index === d.index)].durationSec, 0);
    const totalSec = scenes.reduce((sum, x) => sum + x.durationSec, 0);
    expect(silentSec).toBeLessThanOrEqual(totalSec * 0.3);
    expect(silentSec).toBeGreaterThan(0); // some silence is allowed
  });

  it("a fully-narrated script stays fully spoken (no silence forced)", () => {
    const out = assignAudioTreatments([
      s({ index: 0, family: "hook", hasAuthoredVo: true }),
      s({ index: 1, family: "feature_demo", hasAuthoredVo: true }),
      s({ index: 2, family: "cta", hasAuthoredVo: true }),
    ]);
    expect(out.every((d) => d.treatment === "vo")).toBe(true);
  });
});
