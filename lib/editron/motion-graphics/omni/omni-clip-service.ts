/**
 * Omni MG clip seam — turns an edit beat into a Gemini Omni (fal) motion-graphic clip.
 *
 * This is the production path while our own codegen is developed in parallel.
 * Variants (matches the proven fal endpoints + the Vox prompting method):
 *   text    -> cutaway/standalone beat           (fal-ai/gemini-omni-flash)
 *   style   -> style-locked beat from an anchor  (google/gemini-omni-flash/reference-to-video)
 *   invideo -> MG baked over a real footage frame(google/gemini-omni-flash/reference-to-video)
 *
 * Prompt rules enforced here (YT Omni method + live learnings): locked [STYLE] block,
 * short bold-cap stat, single macro shot, no extra text, negative type instructions.
 * Injectable `fal` so unit tests mock generation (no real spend).
 */
import type { fal as FalResult } from '@fal-ai/client';

export type OmniClipVariant = 'text' | 'style' | 'invideo';

export interface OmniClipRequest {
  variant: OmniClipVariant;
  /** The single bold uppercase beat word (keep short — long text hallucinates). */
  word: string;
  /** The stat/value shown under the word (big + simple for precision). */
  stat: string;
  /** Optional locked [STYLE] block. Defaults to the Vox editorial style. */
  styleBlock?: string;
  /** Public URL or bytes for the style OR footage reference (variant style/invideo). */
  anchorMedia?: { url?: string; bytes?: Uint8Array; mimeType?: string };
  durationSec?: number;
  aspectRatio?: '16:9' | '9:16';
}

export interface OmniClipResult {
  variant: OmniClipVariant;
  endpoint: string;
  prompt: string;
  videoUrl: string;
  durationSec: number;
  requestId?: string;
}

export interface OmniClipDeps {
  subscribe: (endpoint: string, input: { input: Record<string, unknown> }) => Promise<{ data: unknown; requestId?: string }>;
  upload?: (uint8Array: Uint8Array, name: string, mimeType: string) => Promise<string>;
  now?: () => number;
}

const FAL_TEXT_2_VIDEO = 'fal-ai/gemini-omni-flash';
const FAL_REFS_2_VIDEO = 'google/gemini-omni-flash/reference-to-video';

const DEFAULT_STYLE =
  `[STYLE] Vox editorial explainer motion graphic. Matte near-black background (#0a0a0a), ` +
  `bold oversized uppercase yellow (#FFD400) headline type, white secondary type, paper-cutout texture accents, ` +
  `flat vector shapes, subtle film grain, soft vignette, gentle dynamic camera push-in. Crisp legible type, minimal, authoritative.`;

function buildTextPrompt(req: OmniClipRequest, style: string): string {
  return `${style}\n[ACTION] One continuous 16:9 shot, single beat: the word "${req.word}" ` +
    `slams in with a soft paper-cutout whoosh, a thin white underline sweeps left-to-right beneath it, ` +
    `then the stat "${req.stat}" pops below with a small impact. No extra text, no dialogue, subtle whoosh audio only.`;
}

function buildStylePrompt(req: OmniClipRequest, style: string): string {
  return `<IMAGE_REF_0> is THE style anchor — keep EXACTLY this visual style (${style.replace(/^\[STYLE\]\s*/, '')}). ` +
    `One continuous beat: "${req.word}" slams in, thin white rule sweeps under it, "${req.stat}" pops below with a small impact. ` +
    `No extra text, native subtle whoosh only. 16:9.`;
}

function buildInVideoPrompt(req: OmniClipRequest): string {
  return `<IMAGE_REF_0> is REAL footage — keep the scene, subject, framing and camera identical, do not restyle it. ` +
    `Superimpose and animate ONE professional editorial motion graphic in the lower third / open region: ` +
    `a bold uppercase yellow "${req.stat}" pops in with a clean white rule and a short white label "${req.word}". ` +
    `High legibility, does NOT cover the subject's face, clean entry + settle, keep the footage's natural audio. 16:9.`;
}

function unpackVideo(data: unknown): string {
  const video = (data as { video?: { url?: string } } | undefined)?.video;
  const url = video?.url ?? (data as { url?: string } | undefined)?.url;
  if (typeof url === 'string' && url) return url;
  throw new Error('omni-clip: no video url in fal result');
}

export async function generateOmniClip(
  req: OmniClipRequest,
  deps: OmniClipDeps,
): Promise<OmniClipResult> {
  const durationSec = req.durationSec ?? 5;
  const style = req.styleBlock?.trim() ? req.styleBlock.trim() : DEFAULT_STYLE;

  if (req.variant === 'text') {
    const prompt = buildTextPrompt(req, style);
    const { data, requestId } = await deps.subscribe(FAL_TEXT_2_VIDEO, {
      input: { prompt, aspect_ratio: req.aspectRatio ?? '16:9', duration: durationSec },
    });
    return { variant: req.variant, endpoint: FAL_TEXT_2_VIDEO, prompt, videoUrl: unpackVideo(data), durationSec, requestId };
  }

  const anchorUrl = req.anchorMedia?.url ?? (req.anchorMedia?.bytes && deps.upload
    ? await deps.upload(req.anchorMedia.bytes, 'ref.png', req.anchorMedia.mimeType ?? 'image/png')
    : null);
  if (!anchorUrl) throw new Error(`omni-clip: ${req.variant} requires anchorMedia (url or bytes)`);

  const prompt = req.variant === 'style' ? buildStylePrompt(req, style) : buildInVideoPrompt(req);
  const { data, requestId } = await deps.subscribe(FAL_REFS_2_VIDEO, {
    input: { prompt, image_urls: [anchorUrl], aspect_ratio: req.aspectRatio ?? '16:9', duration: durationSec },
  });
  return { variant: req.variant, endpoint: FAL_REFS_2_VIDEO, prompt, videoUrl: unpackVideo(data), durationSec, requestId };
}

/** Convenience wrapper against the real fal client (production/Node). */
export function realOmniDeps(): OmniClipDeps {
  // Lazy CommonJS require by design: @fal-ai/client must NOT load at module import
  // (tests inject a mock, and it stays out of non-production bundles).
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { fal } = require('@fal-ai/client') as { fal: typeof import('@fal-ai/client').fal };
  return {
    subscribe: (endpoint, input) =>
      fal.subscribe(endpoint as never, input as never) as Promise<{ data: unknown; requestId?: string }>,
    upload: async (bytes, name, mimeType) => fal.storage.upload(new Blob([bytes as unknown as BlobPart]) as never) as Promise<string>,
  };
}
