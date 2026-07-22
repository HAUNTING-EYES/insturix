/**
 * Infer an avatar's APPEARANCE attributes from the user's reference photos, so the forge
 * stops interrogating people for descriptions they can't reliably give. The honest
 * boundary: a photo tells you how someone LOOKS (build, hair, skin tone, glasses, what
 * they're wearing) and whether the photo is USABLE. It does NOT tell you their job, brand
 * voice, personality, or gesture style — those stay user-chosen defaults/presets, never
 * hallucinated from a face.
 *
 * Everything here is a SUGGESTION: the caller merges it only into empty fields, tags it as
 * inferred (confidence < 1), and lets the user correct it. Fail-soft — if the vision call
 * dies, the draft still saves and the user fills fields manually.
 *
 * Built on the reusable [[extract-structured-from-images]] primitive; this file only owns
 * the avatar schema + the domain guidance.
 */

import { SchemaType, type ResponseSchema } from '@google/generative-ai';
import { z } from 'zod';
import {
  extractStructuredFromImages,
  type ExtractStructuredDeps,
  type ExtractStructuredResult,
  type VisionImageInput,
} from '@/lib/vision/extract-structured-from-images';

export const inferredAvatarAttributesSchema = z.object({
  /** One factual sentence a video model can use to hold this exact person's identity. */
  identityDescription: z.string(),
  /** Body build as visible — slim / average / athletic / broad / etc. */
  build: z.string(),
  /** Hair: colour + length + style, or "bald" / "shaved". Empty if not visible. */
  hair: z.string(),
  /** Skin tone, factual, for render fidelity. Empty if not confidently visible. */
  skinTone: z.string(),
  /** Clearly-visible, stable features (glasses, beard, freckles…). [] if none. */
  notableTraits: z.array(z.string()),
  /** What the person is wearing (the default look). Empty if not visible. */
  wardrobe: z.string(),
  /** Quick usability check of the photo set — the free byproduct of already looking. */
  quality: z.object({
    faceDetected: z.boolean(),
    singlePerson: z.boolean(),
    usable: z.boolean(),
    /** Concrete problems that hurt avatar quality (cropping, blur, sunglasses, etc.). */
    issues: z.array(z.string()),
  }),
});

export type InferredAvatarAttributes = z.infer<typeof inferredAvatarAttributesSchema>;

// Gemini response schema — mirrors the Zod shape so the model emits matching JSON.
const AVATAR_RESPONSE_SCHEMA: ResponseSchema = {
  type: SchemaType.OBJECT,
  properties: {
    identityDescription: { type: SchemaType.STRING },
    build: { type: SchemaType.STRING },
    hair: { type: SchemaType.STRING },
    skinTone: { type: SchemaType.STRING },
    notableTraits: { type: SchemaType.ARRAY, items: { type: SchemaType.STRING } },
    wardrobe: { type: SchemaType.STRING },
    quality: {
      type: SchemaType.OBJECT,
      properties: {
        faceDetected: { type: SchemaType.BOOLEAN },
        singlePerson: { type: SchemaType.BOOLEAN },
        usable: { type: SchemaType.BOOLEAN },
        issues: { type: SchemaType.ARRAY, items: { type: SchemaType.STRING } },
      },
    },
  },
};

// Rule 35: rules over examples, data (the images) appended LAST by the primitive.
export const AVATAR_ATTRIBUTE_GUIDANCE = [
  '<role>You prepare a person\'s reference photos to build a faithful VIDEO AVATAR of them (their own likeness, with their consent).</role>',
  '<task>Look at the reference photos of ONE person and return a factual appearance description that lets an image/video model recreate THIS EXACT person, plus a quick quality check of the photos.</task>',
  '<rules>',
  '- Report ONLY what you can clearly see. Never invent hair, clothing, skin tone, or traits that are not visible.',
  '- Describe for RENDER FIDELITY (so the avatar looks like them), factually and respectfully — not as demographic labels.',
  '- identityDescription: ONE clear sentence capturing the stable, recognisable features.',
  '- If a field is not visible in any photo, return an empty string (or [] for lists). Do NOT guess.',
  '- notableTraits: only clearly-visible, stable features (glasses, beard, distinctive marks). Skip anything transient.',
  '- quality.usable is true ONLY if at least one photo clearly shows this person\'s face, in focus, as the only person in frame.',
  '- quality.issues: concrete problems, e.g. "face partially cropped", "heavy backlight", "sunglasses hide the eyes", "multiple people in frame", "low resolution / blurry".',
  '- Do NOT infer profession, personality, mood, or "tone" — a photo cannot show those. Leave them out entirely.',
  '</rules>',
  '<output>Return JSON matching the provided schema. No prose outside the JSON.</output>',
].join('\n');

/**
 * Run appearance inference over a person's reference photos. Returns a fail-soft result:
 * `{ ok: true, data }` with the suggested attributes, or `{ ok: false, error }` — never throws.
 */
export async function inferAvatarAttributesFromImages(
  images: VisionImageInput[],
  deps: ExtractStructuredDeps = {},
): Promise<ExtractStructuredResult<InferredAvatarAttributes>> {
  return extractStructuredFromImages(
    { images, guidance: AVATAR_ATTRIBUTE_GUIDANCE, responseSchema: AVATAR_RESPONSE_SCHEMA, schema: inferredAvatarAttributesSchema },
    deps,
  );
}

/** The subset of an avatar profile these attributes fill. Pure — no ids/timestamps here. */
export interface InferredProfilePatch {
  identityDescription?: string;
  bodyProfile: {
    description?: string;
    build?: string;
    hair?: string;
    skinTone?: string;
    notableTraits?: string[];
  };
  defaultLook?: string;
  /** signalPath → the inferred value, for building provenance evidence at the call site. */
  inferredFields: Array<{ signalPath: string; value: string }>;
}

/**
 * Map inferred attributes to the profile fields they populate. Empty/absent values are
 * dropped so the caller can merge ONLY into fields the user left blank (never overwrite
 * a typed answer). `inferredFields` lets the caller stamp AvatarEvidence with confidence < 1.
 */
export function inferredAttributesToProfilePatch(attrs: InferredAvatarAttributes): InferredProfilePatch {
  const inferredFields: InferredProfilePatch['inferredFields'] = [];
  const put = (signalPath: string, value: string) => {
    const v = value.trim();
    if (v) inferredFields.push({ signalPath, value: v });
    return v || undefined;
  };

  const notableTraits = attrs.notableTraits.map((t) => t.trim()).filter(Boolean);
  if (notableTraits.length > 0) {
    inferredFields.push({ signalPath: 'identityPack.bodyProfile.notableTraits', value: notableTraits.join(', ') });
  }

  return {
    identityDescription: put('portrait.identityDescription', attrs.identityDescription),
    bodyProfile: {
      description: put('identityPack.bodyProfile.description', attrs.identityDescription),
      build: put('identityPack.bodyProfile.build', attrs.build),
      hair: put('identityPack.bodyProfile.hair', attrs.hair),
      skinTone: put('identityPack.bodyProfile.skinTone', attrs.skinTone),
      notableTraits: notableTraits.length > 0 ? notableTraits : undefined,
    },
    defaultLook: put('stylePack.defaultLook', attrs.wardrobe),
    inferredFields,
  };
}

// ─── Request handler (thin route wraps this) ────────────────────────────────────

export interface InferAvatarAttributesRequestInput {
  userId: string;
  body: unknown;
  env?: Record<string, string | undefined>;
}

export type InferAvatarAttributesApiBody =
  | { ok: true; attributes: InferredAvatarAttributes; patch: InferredProfilePatch }
  | { ok: false; error: { code: string; message: string } };

/**
 * Validate + run inference for an API request. SSRF guard: only images hosted in Avatar
 * Vault storage are fetched — never an arbitrary URL from the request body. Inference
 * failure returns 200 with ok:false (fail-soft) so the forge degrades to manual entry
 * instead of erroring.
 */
export async function inferAvatarAttributesFromRequest(
  input: InferAvatarAttributesRequestInput,
  deps: ExtractStructuredDeps = {},
): Promise<{ status: number; body: InferAvatarAttributesApiBody }> {
  const env = input.env ?? process.env;
  const rawUrls = parseImageUrls(input.body);
  if (rawUrls.length === 0) {
    return { status: 400, body: { ok: false, error: { code: 'no_images', message: 'Provide at least one reference image URL.' } } };
  }

  const base = resolveAvatarImageBase(env);
  const imageUrls = rawUrls.filter((url) => isAllowedImageUrl(url, base));
  if (imageUrls.length === 0) {
    return {
      status: 400,
      body: { ok: false, error: { code: 'untrusted_image_host', message: 'Reference images must be hosted in Avatar Vault storage.' } },
    };
  }

  const result = await inferAvatarAttributesFromImages(
    imageUrls.map((url, index) => ({ imageUrl: url, label: `reference ${index + 1}` })),
    deps,
  );
  if (!result.ok) {
    return { status: 200, body: { ok: false, error: { code: 'inference_unavailable', message: result.error } } };
  }
  return { status: 200, body: { ok: true, attributes: result.data, patch: inferredAttributesToProfilePatch(result.data) } };
}

function parseImageUrls(body: unknown): string[] {
  const urls = (body as { imageUrls?: unknown } | null)?.imageUrls;
  if (!Array.isArray(urls)) return [];
  return urls
    .filter((u): u is string => typeof u === 'string' && u.trim().length > 0)
    .map((u) => u.trim());
}

function resolveAvatarImageBase(env: Record<string, string | undefined>): string | null {
  const base = (env.AVATAR_VAULT_R2_PUBLIC_BASE_URL || env.R2_PUBLIC_BASE_URL || '').trim().replace(/\/+$/, '');
  return base || null;
}

function isAllowedImageUrl(url: string, base: string | null): boolean {
  if (!base || !url.startsWith('https://')) return false;
  return url === base || url.startsWith(`${base}/`);
}
