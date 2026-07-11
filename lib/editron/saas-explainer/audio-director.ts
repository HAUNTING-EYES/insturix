/**
 * SaaS Explainer — Audio Director.
 *
 * Decides, per scene, whether it is spoken (`vo`) or a deliberate voice-silent beat (`music_beat`, carried by
 * music + on-screen text). This replaces two bad extremes: forcing voiceover on every scene (robotic, ignores
 * that pros use silence) and letting scenes go silent BY ACCIDENT because the writer omitted a line.
 *
 * The decision is LOGIC, not language (Rule 30) — a narrative role + duration + coverage decision — so it is a
 * deterministic engine, not another LLM pass. Rules are research-grounded (see memory saas-explainer-vo-architecture):
 * professional explainers narrate ~70-85% of the runtime; silence is a SHORT, MOTIVATED contrast beat, never used
 * for explanatory content, never two in a row, and the CTA is always spoken.
 *
 * Downstream is already silence-aware: a scene whose `vo` is empty renders as a short (~2.6s) hold under the music
 * bed (explainer-remotion/scripts/glm-voice-fit.py). So this module's only job is to decide INTENT; the render
 * honors it automatically. `music_beat` scenes get an empty `vo` on purpose; `vo` scenes must end up with words.
 */

export type AudioTreatment = "vo" | "music_beat";

export interface AudioSceneInput {
  index: number;
  /** Director family for the scene (e.g. "hook", "ui_proof", "feature_demo", "cta"). May be a "ARCHETYPE/family"
   *  form string — only the trailing family segment is read. */
  family: string;
  /** True only when the script author actually wrote a spoken line for this scene (not an on-screen-text fallback). */
  hasAuthoredVo: boolean;
  /** Estimated scene duration (pre VO-fit) in seconds. */
  durationSec: number;
}

export interface AudioTreatmentDecision {
  index: number;
  treatment: AudioTreatment;
  reason: string;
}

// ≥70% VO coverage by duration → silent beats may occupy at most ~30% of the runtime.
const MAX_SILENT_DURATION_SHARE = 0.3;
// Silence is a short hold only — a long scene with no words is a content gap, not a craft beat.
const MAX_SILENT_SCENE_SEC = 5;
// Families a silent beat can legitimately carry on visuals + on-screen text alone: a cold-open hook, a UI-proof
// hold, a tagline/brand or logo punch, an outro card. Everything else (problem, feature/workflow demo, comparison,
// proof metric, social proof, …) is explanatory and must be spoken.
const SILENCE_ELIGIBLE_FAMILIES = new Set([
  "hook",
  "ui_proof",
  "promise",
  "tagline",
  "logo",
  "brand",
  "brand_reveal",
  "outro",
]);

/** Read the family from a bare family string or a "ARCHETYPE/family" form string. */
export function audioFamilyKey(family: string): string {
  const tail = family.includes("/") ? family.slice(family.lastIndexOf("/") + 1) : family;
  return tail.trim().toLowerCase();
}

function isCtaFamily(family: string): boolean {
  return /cta|call.?to.?action/.test(family);
}

/**
 * Assign an audio treatment to each scene, in order. Deterministic; pure. Coverage + adjacency state is threaded
 * left-to-right so "never two silent in a row" and the ~30% silent budget are enforced as a single pass.
 */
export function assignAudioTreatments(scenes: AudioSceneInput[]): AudioTreatmentDecision[] {
  const totalDuration = scenes.reduce((sum, s) => sum + Math.max(0, s.durationSec), 0);
  const silentBudgetSec = totalDuration * MAX_SILENT_DURATION_SHARE;

  let silentUsedSec = 0;
  let prevWasSilent = false;

  return scenes.map((scene) => {
    const family = audioFamilyKey(scene.family);
    const durationSec = Math.max(0, scene.durationSec);

    const decide = (treatment: AudioTreatment, reason: string): AudioTreatmentDecision => {
      if (treatment === "music_beat") {
        silentUsedSec += durationSec;
        prevWasSilent = true;
      } else {
        prevWasSilent = false;
      }
      return { index: scene.index, treatment, reason };
    };

    if (scene.hasAuthoredVo) return decide("vo", "author wrote a voiceover line");
    if (isCtaFamily(family)) return decide("vo", "CTA is always spoken");
    if (!SILENCE_ELIGIBLE_FAMILIES.has(family)) {
      return decide("vo", `${family || "scene"} is explanatory — must be spoken`);
    }
    if (durationSec > MAX_SILENT_SCENE_SEC) {
      return decide("vo", `too long (${durationSec}s) for a silent hold`);
    }
    if (prevWasSilent) return decide("vo", "avoid two silent scenes in a row");
    if (silentUsedSec + durationSec > silentBudgetSec) {
      return decide("vo", "silent-beat budget (~30% of runtime) reached");
    }
    return decide("music_beat", `${family} beat carried by visuals + music`);
  });
}
