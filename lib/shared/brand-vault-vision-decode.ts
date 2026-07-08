/**
 * Brand Vault vision-decode: reads the scan's rendered UI section screenshots (assets.uiScreenshots) into a
 * structured Product UI Model via a vision model (GLM-4.6v, z.ai). The Product UI Model is the contract the
 * explainer agent consumes to dramatize a brand's UI, and it upgrades every Brand Vault consumer that only
 * has text today. Report-only-what's-visible is enforced by the prompt (never fabricate a colour, metric,
 * feature, or logo); coordinates are normalized 0..1 to where things actually sit in the shot.
 *
 * Env-gated on GLM_KEY (inert without it). Fail-soft by contract: any misconfiguration, timeout, or model
 * error resolves to `null` — decode is enrichment and must never block the scan.
 * Reference implementation: insturix-explainers/scripts/glm-region-map.mjs.
 */

export interface BrandVaultVisionDecodeEnvironment {
  [key: string]: string | undefined;
  GLM_KEY?: string;
  GLM_API_URL?: string;
  GLM_VISION_MODEL?: string;
  BRAND_VAULT_VISION_DECODE_PROVIDER?: string;
  BRAND_VAULT_VISION_MAX_IMAGES?: string;
}

export type BrandVaultVisionFetch = (url: string, init?: RequestInit) => Promise<Response>;

/* ------------------------------------------------------------------ */
/*  Product UI Model — the decode output contract                      */
/* ------------------------------------------------------------------ */

export interface ProductUiBrandTokens {
  theme?: 'light' | 'dark';
  bg?: string;
  surface?: string;
  text?: string;
  muted?: string;
  border?: string;
  accent?: string;
  accentText?: string;
  gradient?: string | null;
  fontFamily?: string;
  logo?: string;
  vibe?: string;
}

export interface ProductUiPositioning {
  oneLiner?: string;
  whatItDoes?: string;
  audience?: string;
  voice?: string[];
  taglines?: string[];
}

export interface ProductUiRegion {
  name: string;
  x: number;
  y: number;
}

export interface ProductUiScreen {
  name: string;
  shell?: string;
  whatItShows?: string;
  keyElements?: string[];
  regions?: ProductUiRegion[];
}

export interface BrandProductUiModel {
  brand?: ProductUiBrandTokens;
  positioning?: ProductUiPositioning;
  features?: string[];
  proofPoints?: string[];
  screens?: ProductUiScreen[];
  ahaFlow?: string[];
  /** Provenance (stamped by the caller, not the model). */
  sourceUrl?: string;
  screenshotUrls?: string[];
  decodedAt?: string;
  model?: string;
}

export type DecodeBrandVaultProductUiModel = (input: {
  url: string;
  screenshotUrls: string[];
}) => Promise<BrandProductUiModel | null>;

/* ------------------------------------------------------------------ */
/*  Prompt (founder-proven; data LAST) + config                        */
/* ------------------------------------------------------------------ */

const SYSTEM_PROMPT =
  'You are a brand + product-UI analyst. You are given SCREENSHOTS (rendered, not HTML) of a company\'s ' +
  'marketing site and product. Output a Product-UI-Model as JSON. Report ONLY what you can see — never ' +
  'invent a colour, metric, feature, or logo. If a datum isn\'t visible, omit it.';

function userPrompt(url: string): string {
  return `URL: ${url}. [screenshots attached, in order]
Return ONLY this JSON:
{
  "brand": { "theme":"light|dark", "bg":"#hex","surface":"#hex","text":"#hex","muted":"#hex",
             "border":"#hex|rgba","accent":"#hex","accentText":"#hex","gradient":"css|null",
             "fontFamily":"closest named font","logo":"one-line description of the mark",
             "vibe":"3-5 adjectives" },
  "positioning": { "oneLiner":"","whatItDoes":"","audience":"","voice":["do","avoid"],
                   "taglines":["verbatim lines from the site"] },
  "features": ["real, named"],
  "proofPoints": ["real metrics/awards ONLY if shown on the page"],
  "screens": [ { "name":"kebab", "shell":"kanban|editor|dashboard|table|chat|canvas|feed|form",
                 "whatItShows":"", "keyElements":["..."],
                 "regions":[{"name":"kebab","x":0..1,"y":0..1}] } ],
  "ahaFlow": ["user does X","Y happens","result"]
}
Coordinates are where the thing ACTUALLY sits in that screenshot. Never fabricate.`;
}

const DEFAULT_GLM_API_URL = 'https://api.z.ai/api/paas/v4/chat/completions';
const DEFAULT_GLM_VISION_MODEL = 'glm-4.6v';
const DEFAULT_MAX_IMAGES = 6;
const MAX_IMAGES_CAP = 12;
const DECODE_TIMEOUT_MS = 120_000;
const IMAGE_FETCH_TIMEOUT_MS = 15_000;
const MAX_IMAGE_BYTES = 8_000_000;

/**
 * Build a Product-UI-Model decoder from the environment, or `undefined` when no vision provider is
 * configured (so the caller skips decode). GLM-4.6v is selected when GLM_KEY is present, unless
 * BRAND_VAULT_VISION_DECODE_PROVIDER is 'off'.
 */
export function createBrandVaultVisionDecoderFromEnvironment(
  env: BrandVaultVisionDecodeEnvironment = process.env,
  fetchFn: BrandVaultVisionFetch = fetch,
): DecodeBrandVaultProductUiModel | undefined {
  if (env.BRAND_VAULT_VISION_DECODE_PROVIDER?.trim().toLowerCase() === 'off') return undefined;
  const apiKey = env.GLM_KEY?.trim();
  if (!apiKey) return undefined;

  const endpoint = env.GLM_API_URL?.trim() || DEFAULT_GLM_API_URL;
  const model = env.GLM_VISION_MODEL?.trim() || DEFAULT_GLM_VISION_MODEL;
  const maxImages = parseBoundedInteger(env.BRAND_VAULT_VISION_MAX_IMAGES, 1, MAX_IMAGES_CAP, DEFAULT_MAX_IMAGES);

  return async (input) => decodeViaGlm({ apiKey, endpoint, model, maxImages, input, fetchFn });
}

async function decodeViaGlm(args: {
  apiKey: string;
  endpoint: string;
  model: string;
  maxImages: number;
  input: { url: string; screenshotUrls: string[] };
  fetchFn: BrandVaultVisionFetch;
}): Promise<BrandProductUiModel | null> {
  const urls = args.input.screenshotUrls
    .filter((url): url is string => typeof url === 'string' && /^https?:\/\/\S+/i.test(url.trim()))
    .slice(0, args.maxImages);
  if (urls.length === 0) return null;

  // Inline the shots as data URIs (proven-robust: the model never has to fetch our storage).
  const dataUris: string[] = [];
  for (const url of urls) {
    const dataUri = await fetchImageAsDataUri(url, args.fetchFn);
    if (dataUri) dataUris.push(dataUri);
  }
  if (dataUris.length === 0) return null;

  const content: unknown[] = [
    { type: 'text', text: userPrompt(args.input.url) },
    ...dataUris.map((dataUri) => ({ type: 'image_url', image_url: { url: dataUri } })),
  ];

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), DECODE_TIMEOUT_MS);
  try {
    const response = await args.fetchFn(args.endpoint, {
      method: 'POST',
      signal: controller.signal,
      headers: { accept: 'application/json', authorization: `Bearer ${args.apiKey}`, 'content-type': 'application/json' },
      body: JSON.stringify({
        model: args.model,
        messages: [
          { role: 'system', content: SYSTEM_PROMPT },
          { role: 'user', content },
        ],
      }),
    });
    if (!response.ok) return null;
    const payload = await response.json().catch(() => null);
    return parseProductUiModel(extractModelText(payload), {
      sourceUrl: args.input.url,
      screenshotUrls: urls,
      model: args.model,
    });
  } catch {
    return null;
  } finally {
    clearTimeout(timeout);
  }
}

async function fetchImageAsDataUri(url: string, fetchFn: BrandVaultVisionFetch): Promise<string | undefined> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), IMAGE_FETCH_TIMEOUT_MS);
  try {
    const response = await fetchFn(url, { method: 'GET', redirect: 'follow', signal: controller.signal });
    if (!response.ok) return undefined;
    const contentType = (response.headers.get('content-type') || 'image/png').split(';')[0].trim();
    if (!/^image\//i.test(contentType)) return undefined;
    const buffer = Buffer.from(await response.arrayBuffer());
    if (buffer.length === 0 || buffer.length > MAX_IMAGE_BYTES) return undefined;
    return `data:${contentType};base64,${buffer.toString('base64')}`;
  } catch {
    return undefined;
  } finally {
    clearTimeout(timeout);
  }
}

/** Pull the assistant text out of an OpenAI-compatible chat completion response. */
export function extractModelText(payload: unknown): string {
  const root = objectRecord(payload);
  const choices = root && Array.isArray(root.choices) ? root.choices : [];
  const message = objectRecord(objectRecord(choices[0])?.message);
  const content = message?.content;
  return typeof content === 'string' ? content : '';
}

/**
 * Parse the model's JSON reply into a validated Product UI Model. Tolerant of prose around the JSON (extracts
 * the first `{...}` block). Clamps region coordinates to 0..1 and drops anything malformed. Returns null if no
 * usable model was produced. `meta` is caller-stamped provenance (never trusts the model for these).
 */
export function parseProductUiModel(
  text: string,
  meta: { sourceUrl: string; screenshotUrls: string[]; model: string; decodedAt?: string },
): BrandProductUiModel | null {
  const match = text.match(/\{[\s\S]*\}/);
  if (!match) return null;
  let raw: unknown;
  try {
    raw = JSON.parse(match[0]);
  } catch {
    return null;
  }
  const root = objectRecord(raw);
  if (!root) return null;

  const model: BrandProductUiModel = {
    sourceUrl: meta.sourceUrl,
    screenshotUrls: meta.screenshotUrls,
    model: meta.model,
    ...(meta.decodedAt ? { decodedAt: meta.decodedAt } : {}),
  };

  const brand = parseBrandTokens(objectRecord(root.brand));
  if (brand) model.brand = brand;
  const positioning = parsePositioning(objectRecord(root.positioning));
  if (positioning) model.positioning = positioning;
  const features = stringArray(root.features);
  if (features) model.features = features;
  const proofPoints = stringArray(root.proofPoints);
  if (proofPoints) model.proofPoints = proofPoints;
  const ahaFlow = stringArray(root.ahaFlow);
  if (ahaFlow) model.ahaFlow = ahaFlow;
  const screens = parseScreens(root.screens);
  if (screens) model.screens = screens;

  // Only return a model if the vision pass produced SOMETHING beyond provenance.
  const hasContent = Boolean(model.brand || model.positioning || model.features || model.proofPoints || model.screens || model.ahaFlow);
  return hasContent ? model : null;
}

function parseBrandTokens(record: Record<string, unknown> | undefined): ProductUiBrandTokens | undefined {
  if (!record) return undefined;
  const tokens: ProductUiBrandTokens = {};
  const theme = cleanString(record.theme)?.toLowerCase();
  if (theme === 'light' || theme === 'dark') tokens.theme = theme;
  for (const key of ['bg', 'surface', 'text', 'muted', 'border', 'accent', 'accentText', 'fontFamily', 'logo', 'vibe'] as const) {
    const value = cleanString(record[key]);
    if (value) tokens[key] = value;
  }
  const gradient = cleanString(record.gradient);
  if (gradient && gradient.toLowerCase() !== 'null') tokens.gradient = gradient;
  return Object.keys(tokens).length > 0 ? tokens : undefined;
}

function parsePositioning(record: Record<string, unknown> | undefined): ProductUiPositioning | undefined {
  if (!record) return undefined;
  const positioning: ProductUiPositioning = {};
  for (const key of ['oneLiner', 'whatItDoes', 'audience'] as const) {
    const value = cleanString(record[key]);
    if (value) positioning[key] = value;
  }
  const voice = stringArray(record.voice);
  if (voice) positioning.voice = voice;
  const taglines = stringArray(record.taglines);
  if (taglines) positioning.taglines = taglines;
  return Object.keys(positioning).length > 0 ? positioning : undefined;
}

function parseScreens(value: unknown): ProductUiScreen[] | undefined {
  if (!Array.isArray(value)) return undefined;
  const screens: ProductUiScreen[] = [];
  for (const item of value) {
    const record = objectRecord(item);
    const name = cleanString(record?.name);
    if (!record || !name) continue;
    const screen: ProductUiScreen = { name };
    const shell = cleanString(record.shell);
    if (shell) screen.shell = shell;
    const whatItShows = cleanString(record.whatItShows);
    if (whatItShows) screen.whatItShows = whatItShows;
    const keyElements = stringArray(record.keyElements);
    if (keyElements) screen.keyElements = keyElements;
    const regions = parseRegions(record.regions);
    if (regions) screen.regions = regions;
    screens.push(screen);
  }
  return screens.length > 0 ? screens : undefined;
}

function parseRegions(value: unknown): ProductUiRegion[] | undefined {
  if (!Array.isArray(value)) return undefined;
  const regions: ProductUiRegion[] = [];
  for (const item of value) {
    const record = objectRecord(item);
    const name = cleanString(record?.name);
    const x = clamp01(record?.x);
    const y = clamp01(record?.y);
    if (name && x !== undefined && y !== undefined) regions.push({ name, x, y });
  }
  return regions.length > 0 ? regions : undefined;
}

function clamp01(value: unknown): number | undefined {
  const num = typeof value === 'number' ? value : typeof value === 'string' ? Number.parseFloat(value) : NaN;
  if (!Number.isFinite(num)) return undefined;
  return Math.max(0, Math.min(1, num));
}

function cleanString(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() ? value.trim() : undefined;
}

function stringArray(value: unknown): string[] | undefined {
  if (!Array.isArray(value)) return undefined;
  const out = value.filter((item): item is string => typeof item === 'string' && Boolean(item.trim())).map((item) => item.trim());
  return out.length > 0 ? out : undefined;
}

function objectRecord(value: unknown): Record<string, unknown> | undefined {
  return value && typeof value === 'object' && !Array.isArray(value) ? (value as Record<string, unknown>) : undefined;
}

function parseBoundedInteger(value: string | undefined, min: number, max: number, fallback: number): number {
  const parsed = value ? Number.parseInt(value, 10) : fallback;
  if (!Number.isFinite(parsed)) return fallback;
  return Math.min(max, Math.max(min, parsed));
}
