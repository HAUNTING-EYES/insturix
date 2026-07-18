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
/** Veo motion model — image-to-video with true world/camera motion, BUT it drifts meaning-bearing content
 *  (verified: houses multiplied, regions reshaped). Kept for the world-motion luxury path; NOT the default. */
export const MG_MOTION_BACKDROP_MODEL = 'veo-3.1-fast-generate-preview';
/** Omni motion model — image→motion enrichment (LIVE-VERIFIED 2026-07-18): a wordless still backdrop → a moving
 *  cinematic backdrop (flowing light, drift, depth, filmic grade) in ~40s, staying WORDLESS. This is the DEFAULT
 *  motion-backdrop path: an abstract world has no meaning to drift, so Veo's fabrication-by-drift never applies,
 *  and the deterministic kit type still composites on top (values/text never touch the generative model). */
export const MG_OMNI_MOTION_MODEL = 'gemini-omni-flash-preview';

export interface MgBackdrop {
  bytes: Buffer;
  mimeType: 'image/jpeg' | 'image/png';
  width: number;
  height: number;
}

/** A moving illustrated backdrop (Omni image→motion). Carries the base `still` too — the coder's multimodal
 *  frame + the graceful still-lane fallback both use it. */
export interface MgMotionBackdrop {
  bytes: Buffer;
  mimeType: 'video/mp4';
  width: number;
  height: number;
  still: MgBackdrop;
}

/** The injected raw model call: a fully-built prompt + aspect → inline image bytes. The default hits Gemini. */
export type MgImageGenerate = (input: { prompt: string; aspectRatio: string; model: string }) => Promise<{ mimeType: string; data: string }>;
/** The injected Omni image→motion call: a still image + animate prompt → inline mp4 bytes. Default hits Omni. */
export type MgVideoEnrich = (input: { image: { mimeType: string; data: string }; prompt: string; model: string }) => Promise<{ mimeType: string; data: string }>;

export interface MgBackdropOptions {
  brand: Brand;
  canvas: { width: number; height: number };
  model?: string;
  /** Injected for tests / provider swap; defaults to the live Gemini image call. */
  generate?: MgImageGenerate;
  /** Motion path: injected Omni image→motion call (defaults to the live Omni call) + its model override. */
  enrich?: MgVideoEnrich;
  motionModel?: string;
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

/** Build the Omni image→motion prompt: animate the still into a living cinematic backdrop, WORDLESS, preserving
 *  the composition + the clear zone. No fact value ever reaches the model (grounding belt). */
export function buildMotionBackdropPrompt(imagery: MgDesignImagery, brand: Brand): string {
  return [
    'Bring this abstract scene to life as a premium, living cinematic BACKDROP:',
    'add subtle continuous motion (slow drift, flowing light, gentle parallax and depth), volumetric/rim lighting,',
    'soft depth-of-field, atmospheric particles, and a filmic colour grade — a high-end broadcast background.',
    `Keep the same composition, palette (${imagery.paletteDirection.trim()}; accent ${brand.colors.accent}),`,
    'and the clear negative space for a graphic overlay. Keep it seamless and loopable.',
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

/** Deep-walk an Omni interactions response for the first inline video part (tolerant to the exact response
 *  shape — steps[].content[].data / output_video.data / inlineData.data all resolve). */
function findOmniVideoData(node: unknown): string | null {
  if (!node || typeof node !== 'object') return null;
  const o = node as Record<string, unknown>;
  const mime = (o.mime_type ?? o.mimeType) as string | undefined;
  const data = (o.data ?? (o.inlineData as Record<string, unknown> | undefined)?.data) as string | undefined;
  if (typeof data === 'string' && data.length > 5000 && (!mime || String(mime).startsWith('video'))) return data;
  for (const v of Object.values(o)) {
    const found = Array.isArray(v) ? v.map(findOmniVideoData).find(Boolean) : findOmniVideoData(v);
    if (found) return found as string;
  }
  return null;
}

/** Default Omni image→motion call — the live-verified /v1beta/interactions inline shape (Method B: user_input →
 *  image + text → an inline mp4 in the response). */
export function defaultOmniEnrich(env: Record<string, string | undefined> = process.env): MgVideoEnrich {
  const apiKey = env.GEMINI_API_KEY?.trim() || env.GOOGLE_API_KEY?.trim();
  if (!apiKey) throw new Error('MG imagery: missing GEMINI_API_KEY / GOOGLE_API_KEY');
  return async ({ image, prompt, model }) => {
    const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/interactions?key=${apiKey}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        model,
        input: [{ type: 'user_input', content: [
          { type: 'image', mime_type: image.mimeType, data: image.data },
          { type: 'text', text: prompt },
        ] }],
      }),
    });
    if (!res.ok) throw new Error(`MG omni: HTTP ${res.status}: ${(await res.text()).slice(0, 200)}`);
    const json = await res.json() as { error?: { message?: string } };
    if (json.error) throw new Error(`MG omni: ${json.error.message?.slice(0, 200)}`);
    const data = findOmniVideoData(json);
    if (!data) throw new Error('MG omni: response contained no video');
    return { mimeType: 'video/mp4', data };
  };
}

/**
 * Generate a MOVING illustrated backdrop for an illustrated-overlay moment via Omni image→motion (the default,
 * no-drift motion path — proven live 2026-07-18). Pipeline: a WORDLESS still (generateStillBackdrop) → Omni
 * animates it into a living cinematic clip. The still is carried back for the coder's multimodal frame and the
 * graceful still-lane fallback. Fails loud (no/short/wrong-mime video → throw → the caller degrades to the still
 * lane, never a blank frame). No fact value ever reaches either model (grounding belt).
 */
export async function generateMotionBackdrop(imagery: MgDesignImagery, opts: MgBackdropOptions): Promise<MgMotionBackdrop> {
  // 1. base still — reuse the (grounded, fail-loud) still path with the mode coerced.
  const still = await generateStillBackdrop({ ...imagery, mode: 'still' }, opts);
  // 2. Omni image→motion.
  const enrich = opts.enrich ?? defaultOmniEnrich(opts.env);
  const model = opts.motionModel ?? MG_OMNI_MOTION_MODEL;
  const prompt = buildMotionBackdropPrompt(imagery, opts.brand);
  const { mimeType, data } = await enrich({ image: { mimeType: still.mimeType, data: still.bytes.toString('base64') }, prompt, model });
  if (mimeType !== 'video/mp4') throw new Error(`MG omni: unexpected mime '${mimeType}' (expected video/mp4)`);
  const bytes = Buffer.from(data, 'base64');
  if (bytes.byteLength < 8192) throw new Error(`MG omni: motion backdrop suspiciously small (${bytes.byteLength} bytes)`);
  return { bytes, mimeType: 'video/mp4', width: opts.canvas.width, height: opts.canvas.height, still };
}
