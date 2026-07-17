/**
 * Visual-perception extractor (Master v1.1 §7.2) — the LLM half of the EditFingerprint extractor.
 *
 * Gemini watches a reference short and returns its VISUAL layers (treatment/typography/structure/
 * graphics/performance/decisionStream) as a VisualExtractionTarget — the exact shape the eval
 * harness (fingerprint-eval.ts) scores. Reuses the getAnalysisModel + generateContent pattern from
 * reference-content-extractor.ts; Gemini accepts a YouTube URL directly, so no download/upload
 * (side-stepping the Gemini-Files 90s-timeout prod bug).
 *
 * `parseVisualExtraction` (pure) is the testable core; `generate` is injected so the real Gemini
 * call is exercised only in live runs. decisionStream families are validated against the platform
 * decision vocabulary (capabilities.EDITRON_EXECUTABLES); unknown families are dropped.
 *
 * Rule 35: this prompt is XML-structured, rules-over-examples, seeded. It is NOT "deployed" until
 * it clears the eval harness (min-F1 >= 0.85) against human-corrected ground truth.
 */

import { EDITRON_EXECUTABLES, type EditronExecutable } from '@/lib/shared/capabilities';
import type { VisualExtractionTarget } from './fingerprint-eval';
import type {
  FingerprintDecision,
  FingerprintTreatmentLayer,
  FingerprintTypographyLayer,
  FingerprintStructure,
  FingerprintGraphicsLayer,
  FingerprintPerformanceLayer,
} from '@/lib/editron/types/edit-fingerprint';

const EXECUTABLE_SET = new Set<string>(EDITRON_EXECUTABLES);

/**
 * The SUBJECTIVE decision families Gemini is good at (a subset of EDITRON_EXECUTABLES). Cuts and
 * transitions are deliberately EXCLUDED: Gemini fabricates their timing (measured F1 0.66, a ~1 Hz
 * grid on fast edits), so they are detected deterministically by detect-cuts-ffmpeg.ts and merged in
 * by extract-visual-fingerprint-with-cuts.ts. This is the objective/subjective split (Playbook §7).
 */
const VISUAL_FAMILIES = [
  'zoom_punch',
  'zoom_push',
  'zoom_pull_back',
  'caption_emphasis',
  'sfx_impact',
  'speed_ramp',
  'speed_slow_motion',
  'camera_shake',
] as const;

export const VISUAL_PROMPT = [
  '<role>You are a professional short-form video editor analyzing a reference video.</role>',
  '<task>Watch the video and describe ONLY its VISUAL edit fingerprint as JSON.</task>',
  '<rules>',
  '- treatment (colour grade as numeric deltas, 1.0 = unchanged): saturate/contrast/brightness (0.5-2.0), sepia/grain (0-1), hueRotateDeg (-180..180). Include a field ONLY if it clearly differs from neutral.',
  '- typography (on-screen captions): textCase (upper|sentence|lower|as-is), reveal (none|fade|slide-up|pop|typewriter), position (center|lower_third|top|varied). Omit if there are no captions.',
  '- structure: slots[] each {role (hook|promise|payoff|text-reveal|loop-point), startMs, endMs}.',
  '- graphics: classes[] (e.g. kinetic-type, data-viz, callout, lower-third, wireframe), density (heavy|moderate|minimal).',
  '- performance.shotScales[] (ecu|cu|mcu|ms|ws|ews) and subjectPosition (left|center|right|varied).',
  '- performance.cameraMotion (static|push_in|pull_out|handheld|whip|varied). Decide by how the WHOLE frame moves, not the subject:',
  '  · If the entire frame (background, edges, fixed objects) drifts, sways, or shakes over time, the CAMERA is moving. Uniform frame-wide motion = camera; motion confined to the subject while the frame stays fixed = the subject, report static.',
  '  · static = a locked-off/tripod shot where the frame edges do NOT move at all. Do NOT default to static — most handheld, selfie, phone, and UGC footage has constant natural shake and is handheld, not static.',
  '  · push_in / pull_out = the frame steadily zooms or dollies in / out (framing tightens / widens). handheld = organic shake/drift with no single direction. whip = a fast blurred swing. varied = it clearly changes between shots.',
  '  · When the frame moves but you are unsure which kind, prefer handheld over static; only choose static when the frame is genuinely locked.',
  `- decisionStream: timed edit events []: {family, tMs, confidence 0-1}. family MUST be one of: ${VISUAL_FAMILIES.join(', ')}.`,
  '- Do NOT report cuts or transitions (hard cut / dissolve / whip / fade) — those are measured separately. Only report the families listed above.',
  '- Report ONLY what you actually see. Omit uncertain fields. Do not guess.',
  '- Output ONLY valid JSON. No markdown, no prose.',
  '</rules>',
  '<output_format>',
  '{"treatment":{},"typography":{},"structure":{"slots":[]},"graphics":{"classes":[],"density":""},"performance":{},"decisionStream":[{"family":"","tMs":0,"confidence":0}]}',
  '</output_format>',
].join('\n');

export type GenerateVisual = (videoUrl: string, prompt: string, seed?: number) => Promise<string>;

export async function extractVisualFingerprint(
  videoUrl: string,
  opts: { seed?: number; generate?: GenerateVisual } = {},
): Promise<VisualExtractionTarget> {
  const generate = opts.generate ?? defaultGenerate;
  const text = await generate(videoUrl, VISUAL_PROMPT, opts.seed);
  return parseVisualExtraction(text);
}

/** Real Gemini call: pass the YouTube URL as fileData, seed for reproducibility (Rule 35). */
async function defaultGenerate(videoUrl: string, prompt: string, seed?: number): Promise<string> {
  const { getAnalysisModel } = await import('@/lib/editron/utils/gemini-model-factory');
  const model = await getAnalysisModel();
  const result = await model.generateContent({
    contents: [
      {
        role: 'user',
        parts: [{ fileData: { fileUri: videoUrl, mimeType: 'video/*' } }, { text: prompt }],
      },
    ],
    generationConfig: { temperature: 0, ...(seed !== undefined ? { seed } : {}) },
  });
  return result.response.text();
}

// ─── Pure parse (the testable core) ──────────────────────────────────────────

function num(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined;
}

function oneOf<T extends string>(value: unknown, allowed: readonly T[]): T | undefined {
  return typeof value === 'string' && (allowed as readonly string[]).includes(value) ? (value as T) : undefined;
}

/** Parse the model's JSON into a validated (partial) VisualExtractionTarget. Unknown/invalid fields are dropped. */
export function parseVisualExtraction(text: string): VisualExtractionTarget {
  const match = text.match(/\{[\s\S]*\}/);
  if (!match) return {};
  let raw: Record<string, unknown>;
  try {
    raw = JSON.parse(match[0]) as Record<string, unknown>;
  } catch {
    return {};
  }

  const out: VisualExtractionTarget = {};

  const t = raw.treatment as Record<string, unknown> | undefined;
  if (t) {
    const treatment: FingerprintTreatmentLayer = {};
    for (const k of ['saturate', 'contrast', 'brightness', 'sepia', 'hueRotateDeg', 'grain'] as const) {
      const v = num(t[k]);
      if (v !== undefined) treatment[k] = v;
    }
    if (Object.keys(treatment).length) out.treatment = treatment;
  }

  const ty = raw.typography as Record<string, unknown> | undefined;
  if (ty) {
    const typography: FingerprintTypographyLayer = {};
    const textCase = oneOf(ty.textCase, ['upper', 'sentence', 'lower', 'as-is'] as const);
    const reveal = oneOf(ty.reveal, ['none', 'fade', 'slide-up', 'pop', 'typewriter'] as const);
    const position = oneOf(ty.position, ['center', 'lower_third', 'top', 'varied'] as const);
    if (textCase) typography.textCase = textCase;
    if (reveal) typography.reveal = reveal;
    if (position) typography.position = position;
    if (Object.keys(typography).length) out.typography = typography;
  }

  const st = raw.structure as { slots?: unknown } | undefined;
  if (st && Array.isArray(st.slots)) {
    const slots = st.slots
      .map((s) => {
        const slot = s as Record<string, unknown>;
        const role = typeof slot.role === 'string' ? slot.role : '';
        const startMs = num(slot.startMs);
        const endMs = num(slot.endMs);
        return role && startMs !== undefined && endMs !== undefined ? { role, startMs, endMs } : null;
      })
      .filter((s): s is { role: string; startMs: number; endMs: number } => s !== null);
    if (slots.length) out.structure = { slots } as FingerprintStructure;
  }

  const g = raw.graphics as Record<string, unknown> | undefined;
  if (g) {
    const graphics: FingerprintGraphicsLayer = {
      classes: Array.isArray(g.classes) ? g.classes.filter((c): c is string => typeof c === 'string') : [],
    };
    const density = oneOf(g.density, ['heavy', 'moderate', 'minimal'] as const);
    if (density) graphics.density = density;
    if (graphics.classes.length || graphics.density) out.graphics = graphics;
  }

  const p = raw.performance as Record<string, unknown> | undefined;
  if (p) {
    const performance: FingerprintPerformanceLayer = {};
    const subjectPosition = oneOf(p.subjectPosition, ['left', 'center', 'right', 'varied'] as const);
    const cameraMotion = oneOf(p.cameraMotion, ['static', 'push_in', 'pull_out', 'handheld', 'whip', 'varied'] as const);
    if (Array.isArray(p.shotScales)) {
      const scales = p.shotScales.filter((s): s is 'ecu' | 'cu' | 'mcu' | 'ms' | 'ws' | 'ews' =>
        ['ecu', 'cu', 'mcu', 'ms', 'ws', 'ews'].includes(s as string),
      );
      if (scales.length) performance.shotScales = scales;
    }
    if (subjectPosition) performance.subjectPosition = subjectPosition;
    if (cameraMotion) performance.cameraMotion = cameraMotion;
    if (Object.keys(performance).length) out.performance = performance;
  }

  if (Array.isArray(raw.decisionStream)) {
    const decisions = raw.decisionStream
      .map((d): FingerprintDecision | null => {
        const dec = d as Record<string, unknown>;
        const family = typeof dec.family === 'string' && EXECUTABLE_SET.has(dec.family) ? (dec.family as EditronExecutable) : null;
        const tMs = num(dec.tMs);
        if (!family || tMs === undefined) return null;
        return {
          family,
          anchor: { kind: 'none', tMs },
          params: {},
          confidence: num(dec.confidence) ?? 0.5,
        };
      })
      .filter((d): d is FingerprintDecision => d !== null);
    if (decisions.length) out.decisionStream = decisions;
  }

  return out;
}
