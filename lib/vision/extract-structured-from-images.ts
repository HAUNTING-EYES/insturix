/**
 * extractStructuredFromImages — one reusable door for "look at these images and return
 * validated structured data." Domain-agnostic: caller supplies the images, a guidance
 * prompt (the rules), a Gemini responseSchema (guides the model's JSON), and a Zod schema
 * (validates + types the result). Reuse targets: avatar attribute inference, brand imagery,
 * product shots, thumbnail QC — anything that reads pixels into a typed object.
 *
 * Built on the house Gemini plumbing (gemini-model-factory: getAnalysisModel, temperature 0
 * + seed = deterministic) and the request shape proven by the MG visual judge (inlineData
 * base64 parts + responseSchema). Fail-soft like the Brand Vault vision decoder: returns a
 * discriminated result, never throws into the caller, so a flaky vision call never blocks
 * the flow that needs it.
 *
 * Rule 35: the guidance goes FIRST, the images (the data) go LAST; temperature 0 + a fixed
 * seed keep it reproducible; validation is schema-driven, not example-driven.
 */

import type { ResponseSchema } from '@google/generative-ai';
import type { z } from 'zod';

export interface VisionImageInput {
  /** Hosted image URL (fetched → base64). Provide this OR `data`. */
  imageUrl?: string;
  /** Raw image bytes. Provide this OR `imageUrl`. */
  data?: Buffer;
  /** MIME type for `data` (or an override for a fetched URL). */
  mimeType?: string;
  /** Short label the model sees ("front portrait", "full body") — improves grounding. */
  label?: string;
}

export interface ExtractStructuredInput<T> {
  images: VisionImageInput[];
  /** The domain prompt: role + rules + the "report only what you see, never invent" contract. */
  guidance: string;
  /** Gemini response schema — guides the model to emit matching JSON. */
  responseSchema: ResponseSchema;
  /** Zod schema — validates + types the parsed result (the source of truth for the shape). */
  schema: z.ZodType<T>;
  /** Fixed seed for reproducibility. Defaults to the house convention (7). */
  seed?: number;
  maxOutputTokens?: number;
}

/** The transport request handed to the (injectable) generate function. */
export interface VisionGenerateRequest {
  prompt: string;
  images: Array<{ label: string; mimeType: string; base64: string }>;
  responseSchema: ResponseSchema;
  seed: number;
  maxOutputTokens: number;
}

export interface ExtractStructuredDeps {
  /** Vision call. Default = Gemini analysis model. Injected in tests. */
  generate?: (request: VisionGenerateRequest) => Promise<{ text: string }>;
  /** Fetch a hosted image → bytes + mime. Default = fetch(). Injected in tests. */
  fetchImage?: (url: string) => Promise<{ data: Buffer; mimeType: string }>;
}

export type ExtractStructuredResult<T> =
  | { ok: true; data: T; raw: string }
  | { ok: false; error: string; raw?: string };

const DEFAULT_SEED = 7; // house convention (lib/calos/trends/gemini.ts) — reproducible runs
const DEFAULT_MAX_OUTPUT_TOKENS = 2048;
const MAX_ATTEMPTS = 2; // one retry — vision JSON either lands or it doesn't; don't loop on spend

export async function extractStructuredFromImages<T>(
  input: ExtractStructuredInput<T>,
  deps: ExtractStructuredDeps = {},
): Promise<ExtractStructuredResult<T>> {
  if (input.images.length === 0) return { ok: false, error: 'No images supplied.' };

  const generate = deps.generate ?? defaultGeminiGenerate;
  const fetchImage = deps.fetchImage ?? defaultFetchImage;

  let images: VisionGenerateRequest['images'];
  try {
    images = await Promise.all(
      input.images.map(async (image, index) => {
        const label = image.label ?? `image ${index + 1}`;
        if (image.data) {
          return { label, mimeType: image.mimeType ?? 'image/png', base64: image.data.toString('base64') };
        }
        if (image.imageUrl) {
          const fetched = await fetchImage(image.imageUrl);
          return { label, mimeType: image.mimeType ?? fetched.mimeType, base64: fetched.data.toString('base64') };
        }
        throw new Error(`Image ${index + 1} has neither data nor imageUrl.`);
      }),
    );
  } catch (error) {
    return { ok: false, error: `Image preparation failed: ${errorText(error)}` };
  }

  const request: Omit<VisionGenerateRequest, never> = {
    prompt: input.guidance,
    images,
    responseSchema: input.responseSchema,
    seed: input.seed ?? DEFAULT_SEED,
    maxOutputTokens: input.maxOutputTokens ?? DEFAULT_MAX_OUTPUT_TOKENS,
  };

  let lastRaw: string | undefined;
  let lastError = 'unknown error';
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    let text: string;
    try {
      ({ text } = await generate(request));
    } catch (error) {
      lastError = `Vision call failed: ${errorText(error)}`;
      continue;
    }
    lastRaw = text;
    const parsed = parseJsonLoose(text);
    if (parsed === undefined) {
      lastError = 'Model did not return parseable JSON.';
      continue;
    }
    const validated = input.schema.safeParse(parsed);
    if (validated.success) return { ok: true, data: validated.data, raw: text };
    lastError = `Output did not match the schema: ${validated.error.issues.map((i) => i.path.join('.')).join(', ')}`;
  }

  return { ok: false, error: lastError, raw: lastRaw };
}

// ─── JSON tolerance (models wrap JSON in fences / truncate at the token cap) ─────
export function parseJsonLoose(text: string): unknown | undefined {
  const cleaned = stripToJson(text);
  try {
    return JSON.parse(cleaned);
  } catch {
    // Retry once with dangling braces/brackets closed (truncation repair).
    try {
      return JSON.parse(closeDangling(cleaned));
    } catch {
      return undefined;
    }
  }
}

function stripToJson(text: string): string {
  let t = text.trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '').trim();
  const start = t.indexOf('{');
  if (start > 0) t = t.slice(start);
  return t;
}

function closeDangling(text: string): string {
  let s = text.replace(/,\s*$/, '');
  const need = (open: string, close: string) =>
    Math.max(0, (s.match(escapeRe(open)) ?? []).length - (s.match(escapeRe(close)) ?? []).length);
  s += ']'.repeat(need('[', ']'));
  s += '}'.repeat(need('{', '}'));
  return s;
}

function escapeRe(ch: string): RegExp {
  return new RegExp(`\\${ch}`, 'g');
}

function errorText(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

// ─── Defaults (real services; injected out in tests) ────────────────────────────

const defaultGeminiGenerate: NonNullable<ExtractStructuredDeps['generate']> = async (request) => {
  const { getAnalysisModel } = await import('@/lib/editron/utils/gemini-model-factory');
  const model = await getAnalysisModel();
  const result = await model.generateContent({
    contents: [{
      role: 'user',
      parts: [
        { text: request.prompt },
        ...request.images.flatMap((image, index) => [
          { text: `IMAGE ${index + 1}: ${image.label}` },
          { inlineData: { mimeType: image.mimeType, data: image.base64 } },
        ]),
      ],
    }],
    generationConfig: {
      responseMimeType: 'application/json',
      responseSchema: request.responseSchema,
      temperature: 0,
      seed: request.seed,
      maxOutputTokens: request.maxOutputTokens,
    },
  });
  return { text: result.response?.text?.() ?? '' };
};

const defaultFetchImage: NonNullable<ExtractStructuredDeps['fetchImage']> = async (url) => {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`Failed to fetch image (HTTP ${response.status}) from ${url}.`);
  const mimeType = response.headers.get('content-type')?.split(';')[0]?.trim() || 'image/png';
  return { data: Buffer.from(await response.arrayBuffer()), mimeType };
};
