/**
 * MG Codegen — DESIGN-THEN-CODE Phase 4a: the OMNI IMAGERY client (generated backdrops).
 *
 * The Vox/Iman-level formula = the composite: a GENERATED illustrated scene (this file) with the deterministic
 * kit's honest type/data layer over it (existing lanes). The kit proved it cannot conjure imagery (form 4-5); a
 * generative image model can — but it butchers text/numbers, so its output is IMAGERY ONLY and every value/word
 * still renders through the kit. This client is the illustrated-overlay lane's backdrop source.
 *
 * STILL backdrop (this phase): Gemini native image generation — LIVE-VERIFIED shape (not doc-guessed):
 *   POST /v1beta/models/gemini-3.1-flash-image:generateContent  { responseModalities:['IMAGE'] }
 *   → candidates[0].content.parts[].inlineData { mimeType, data(base64) } — inline bytes, no download/retention
 *   dance (unlike Veo). Probe returned a 616KB on-brand JPEG with zero text on the first call.
 *
 * MOTION backdrop (Veo, Phase 4b): a long-running predictLongRunning op → a 2-day download URI that MUST be
 * pulled to R2 immediately. Stubbed here (fail-loud NotImplemented with the model id) — not guessed, not faked.
 *
 * GROUNDING (belt over the designer's imagery rule): the prompt hard-forbids any text/number/logo in the image,
 * and the client never lets a value or word reach the image model — those are the kit's job, always.
 *
 * Impurity INJECTED (generate = the model call) so this is testable with a fake and provider-swappable.
 */

import type { Brand } from '../kit/brand';
import type { MgDesignImagery } from './design-plan';

/** The default still-image model — live-verified to return inline JPEG bytes via generateContent. */
export const DEFAULT_MG_IMAGE_MODEL = 'gemini-3.1-flash-image';
/** The Veo motion model (Phase 4b) — recorded, not yet wired. */
export const MG_MOTION_BACKDROP_MODEL = 'veo-3.1-fast-generate-preview';

export interface MgBackdrop {
  bytes: Buffer;
  mimeType: 'image/jpeg' | 'image/png';
  width: number;
  height: number;
}

/** The injected raw model call: a fully-built prompt + aspect → inline image bytes. The default hits Gemini. */
export type MgImageGenerate = (input: { prompt: string; aspectRatio: string; model: string }) => Promise<{ mimeType: string; data: string }>;

export interface MgBackdropOptions {
  brand: Brand;
  canvas: { width: number; height: number };
  model?: string;
  /** Injected for tests / provider swap; defaults to the live Gemini image call. */
  generate?: MgImageGenerate;
  env?: Record<string, string | undefined>;
}

// The nearest supported Gemini aspect ratio for a canvas (doc-confirmed set). Backdrops are landscape/portrait
// video frames — 16:9 / 9:16 cover the real cases; the rest round to the closest.
const ASPECTS: Array<[string, number]> = [
  ['21:9', 21 / 9], ['16:9', 16 / 9], ['3:2', 3 / 2], ['4:3', 4 / 3], ['5:4', 5 / 4], ['1:1', 1],
  ['4:5', 4 / 5], ['3:4', 3 / 4], ['2:3', 2 / 3], ['9:16', 9 / 16],
];
function nearestAspect(width: number, height: number): string {
  const r = width / (height || 1);
  return ASPECTS.reduce((best, cur) => (Math.abs(cur[1] - r) < Math.abs(best[1] - r) ? cur : best))[0];
}

/** The hard grounding suffix — the image must be pure imagery. Kept explicit so a model that loves to render
 *  captions is told, unambiguously, not to. */
const NO_TEXT = 'ABSOLUTELY NO text, letters, words, numbers, digits, labels, captions, titles, logos, watermarks, '
  + 'signatures, UI, charts with labels, or any typography anywhere in the image. Pure illustrative imagery only.';

/** Build the image prompt from the design's imagery spec + the brand palette. Never includes any fact value. */
export function buildBackdropPrompt(imagery: MgDesignImagery, brand: Brand): string {
  return [
    imagery.scenePrompt.trim(),
    `Palette: ${imagery.paletteDirection.trim()} (brand accent ${brand.colors.accent} on a ${brand.colors.bg} base).`,
    'Cinematic, high production value, clean negative space for a graphic overlay, edges soft and uncluttered.',
    NO_TEXT,
  ].join(' ');
}

/** Default Gemini image call — the live-verified generateContent + responseModalities:['IMAGE'] shape. */
export function defaultGeminiImageGenerate(env: Record<string, string | undefined> = process.env): MgImageGenerate {
  const apiKey = env.GEMINI_API_KEY?.trim() || env.GOOGLE_API_KEY?.trim();
  if (!apiKey) throw new Error('MG imagery: missing GEMINI_API_KEY / GOOGLE_API_KEY');
  return async ({ prompt, aspectRatio, model }) => {
    const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        contents: [{ role: 'user', parts: [{ text: prompt }] }],
        generationConfig: { responseModalities: ['IMAGE'], imageConfig: { aspectRatio } },
      }),
    });
    if (!res.ok) throw new Error(`MG imagery: HTTP ${res.status}: ${(await res.text()).slice(0, 200)}`);
    const json = await res.json() as {
      candidates?: Array<{ content?: { parts?: Array<{ inlineData?: { mimeType?: string; data?: string } }> } }>;
      error?: { message?: string };
    };
    if (json.error) throw new Error(`MG imagery: ${json.error.message?.slice(0, 200)}`);
    const part = json.candidates?.[0]?.content?.parts?.find((p) => p.inlineData?.data);
    const data = part?.inlineData?.data;
    const mimeType = part?.inlineData?.mimeType;
    if (!data || !mimeType) throw new Error('MG imagery: response contained no image');
    return { mimeType, data };
  };
}

/**
 * Generate a STILL illustrated backdrop for an illustrated-overlay moment. Returns the raw image bytes at the
 * model's aspect (the caller resizes/crops to the exact canvas at composite time — Phase 4b). Fails loud: a
 * missing/invalid image throws (R18N) — the caller degrades the moment to the pure-kit lane, never a blank frame.
 */
export async function generateStillBackdrop(imagery: MgDesignImagery, opts: MgBackdropOptions): Promise<MgBackdrop> {
  if (imagery.mode !== 'still') {
    throw new Error(`generateStillBackdrop: imagery.mode is '${imagery.mode}', expected 'still' (motion → generateMotionBackdrop)`);
  }
  const model = opts.model ?? DEFAULT_MG_IMAGE_MODEL;
  const generate = opts.generate ?? defaultGeminiImageGenerate(opts.env);
  const aspectRatio = nearestAspect(opts.canvas.width, opts.canvas.height);
  const prompt = buildBackdropPrompt(imagery, opts.brand);

  const { mimeType, data } = await generate({ prompt, aspectRatio, model });
  if (mimeType !== 'image/jpeg' && mimeType !== 'image/png') {
    throw new Error(`MG imagery: unexpected mime '${mimeType}'`);
  }
  const bytes = Buffer.from(data, 'base64');
  if (bytes.byteLength < 1024) throw new Error(`MG imagery: image suspiciously small (${bytes.byteLength} bytes)`);
  return { bytes, mimeType, width: opts.canvas.width, height: opts.canvas.height };
}

/** Veo motion backdrop — Phase 4b. Recorded shape (predictLongRunning → 2-day URI → download to R2), not yet
 *  wired: fail loud rather than pretend. */
export async function generateMotionBackdrop(): Promise<never> {
  throw new Error(`generateMotionBackdrop: not implemented — Veo motion lane (${MG_MOTION_BACKDROP_MODEL}) is Phase 4b (predictLongRunning → download URI → persist to R2 within the 2-day retention window)`);
}
