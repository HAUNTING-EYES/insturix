/**
 * Fill/edit prompt COMPILER [Wave 3] — one canonical intent, compiled per model dialect.
 *
 * The problem this replaces: every payload builder hand-picks GENERATIVE_FILL vs
 * IMAGE_TO_IMAGE and blasts it at whatever model, even models whose live Fal endpoint
 * accepts NO mask (seedream/nano "edit"), so the mask is silently dropped and "fill"
 * regenerates the whole image. The teammate's instinct ("different prompts per model") is
 * right; hand-writing prose per model is not — it doesn't scale and has no gate.
 *
 * The scalable shape: ONE structured intent + a tiny per-model DECLARATION of two things —
 *   1. does the model accept a real mask? (so code routes correctly, never silently drops)
 *   2. which of ~3 prompt DIALECT FAMILIES does it speak?
 * There aren't 18 dialects, there are three:
 *   - 'inpaint'      : mask models — "change only the masked region, blend seamlessly"
 *   - 'instruction'  : imperative editors (Kontext/nano) — "apply X, preserve the rest"
 *   - 'scene'        : describe-the-result editors (Seedream) — state the desired outcome
 * New model later = one MODEL_FILL_PROFILE entry + pick a dialect + run the eval. No prose.
 *
 * This module is pure and additive: it REUSES the existing system prompts (imported, not
 * duplicated) and does not touch the shared payload builders — wiring is a coordinated
 * follow-up so it can't collide with in-flight edits to clickatron-models.ts.
 */

import { GENERATIVE_FILL_SYSTEM_PROMPT, IMAGE_TO_IMAGE_SYSTEM_PROMPT } from '@/lib/clickatron/fill-prompts';

export type FillDialect = 'inpaint' | 'instruction' | 'scene';

export interface ModelFillProfile {
  /** True only when the live Fal endpoint accepts a mask_url. Declarative capability, not a guess. */
  acceptsMask: boolean;
  dialect: FillDialect;
}

/**
 * Per-model fill capability + dialect. `acceptsMask` values are from the verified Fal API
 * audit (2026-07): only the flux inpaint/fill family (+ SD) take a mask; the seedream/nano
 * "edit" endpoints do NOT — they are natural-language edits.
 */
export const MODEL_FILL_PROFILES: Record<string, ModelFillProfile> = {
  // ── inpaint family: real mask_url support ──
  'fal-ai/flux-pro/v1/fill': { acceptsMask: true, dialect: 'inpaint' },
  'fal-ai/flux/dev/inpainting': { acceptsMask: true, dialect: 'inpaint' },
  'fal-ai/flux-kontext/dev/inpainting': { acceptsMask: true, dialect: 'inpaint' },
  'fal-ai/flux-lora/inpainting': { acceptsMask: true, dialect: 'inpaint' },
  'fal-ai/stable-diffusion-inpainting': { acceptsMask: true, dialect: 'inpaint' },
  // ── instruction family: imperative edit, NO mask ──
  'fal-ai/flux-kontext/dev': { acceptsMask: false, dialect: 'instruction' },
  'fal-ai/nano-banana/edit': { acceptsMask: false, dialect: 'instruction' },
  'fal-ai/nano-banana-pro/edit': { acceptsMask: false, dialect: 'instruction' },
  'fal-ai/flux-2-pro/edit': { acceptsMask: false, dialect: 'instruction' },
  // ── scene family: describe-the-result edit, NO mask ──
  'fal-ai/bytedance/seedream/v4.5/edit': { acceptsMask: false, dialect: 'scene' },
  'fal-ai/bytedance/seedream/v5/lite/edit': { acceptsMask: false, dialect: 'scene' },
};

/** Unknown model → safest assumption: no mask, imperative-instruction dialect. */
const DEFAULT_PROFILE: ModelFillProfile = { acceptsMask: false, dialect: 'instruction' };

export function getModelFillProfile(modelId: string | undefined | null): ModelFillProfile {
  return (modelId && MODEL_FILL_PROFILES[modelId]) || DEFAULT_PROFILE;
}

export interface FillIntent {
  /** What the user wants done, in plain language. */
  instruction: string;
  /** True when the request carries a real mask (a region was selected). */
  hasMask: boolean;
}

export interface CompiledFillPrompt {
  prompt: string;
  dialect: FillDialect;
  /** True only if BOTH the intent has a mask AND the model can honor it. Callers use this
   *  to decide whether to actually send mask_url — never send it to a model that ignores it. */
  useMask: boolean;
  /** Surfaced (loud), e.g. "mask requested but model cannot inpaint → best-effort region edit". */
  warnings: string[];
}

// The instruction dialect isn't a stored blob (unlike the other two) because it's short by
// design; the existing IMAGE_TO_IMAGE prompt is the "preserve the rest" contract it needs.
function instructionDialectPreamble(): string {
  return IMAGE_TO_IMAGE_SYSTEM_PROMPT;
}

/**
 * Compile a fill/edit intent into the prompt for a specific model's dialect. Pure.
 *
 * Key safety property: if the intent has a mask but the model can't accept one, we do NOT
 * pretend — useMask is false, a loud warning is added, and the instruction is reframed as a
 * best-effort region edit so the model at least knows a localized change was intended.
 */
export function compileFillPrompt(modelId: string | undefined | null, intent: FillIntent): CompiledFillPrompt {
  const profile = getModelFillProfile(modelId);
  const instruction = intent.instruction.trim();
  const warnings: string[] = [];
  const useMask = intent.hasMask && profile.acceptsMask;

  if (intent.hasMask && !profile.acceptsMask) {
    warnings.push(
      `Model ${modelId ?? 'unknown'} does not accept a mask (dialect=${profile.dialect}); the masked region is described in text as a best-effort localized edit instead.`,
    );
  }

  const userRequest = instruction.length > 0 ? instruction : 'Make the requested edit.';

  if (profile.dialect === 'inpaint') {
    // Mask model: the fill contract prompt + the user's request. (useMask should be true.)
    return {
      prompt: `${GENERATIVE_FILL_SYSTEM_PROMPT.trim()}\n\nUser Request: ${userRequest}`,
      dialect: 'inpaint',
      useMask,
      warnings,
    };
  }

  if (profile.dialect === 'scene') {
    // Describe-the-result editor. If a mask was intended but can't be used, tell the model
    // WHERE (region-level) so the change stays localized in spirit.
    const regionHint = intent.hasMask && !profile.acceptsMask
      ? ' Apply this change only to the selected region of the image; keep the rest of the scene exactly as it is.'
      : '';
    return {
      prompt: `${IMAGE_TO_IMAGE_SYSTEM_PROMPT.trim()}\n\nDesired result: ${userRequest}${regionHint}`,
      dialect: 'scene',
      useMask,
      warnings,
    };
  }

  // instruction dialect (imperative, short).
  const regionHint = intent.hasMask && !profile.acceptsMask
    ? ' Change only the selected region; leave everything else untouched.'
    : '';
  return {
    prompt: `${instructionDialectPreamble().trim()}\n\nEdit: ${userRequest}${regionHint}`,
    dialect: 'instruction',
    useMask,
    warnings,
  };
}
