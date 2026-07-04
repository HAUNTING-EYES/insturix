/**
 * Brand Vault website screenshot capture.
 *
 * Owned-subject storyboard evidence (a "website screenshot", see reference-brand-evidence.ts) requires a
 * real image of the brand's live site. The scan extracts og:image / product <img> URLs but never captures
 * an actual rendered screenshot, so brand-owned product/platform subjects always dead-end on "upload
 * evidence". This module captures one during the scan via Firecrawl's screenshot format, returning a
 * temporary screenshot URL. The caller mirrors it to durable storage (R2) and injects it as an actionable
 * assets.socialPreviewImages candidate.
 *
 * Fail-soft by contract: any misconfiguration, timeout, or provider error resolves to `undefined`. The
 * screenshot is enrichment, never a gate — a failed capture must never fail or block the scan (R18N).
 */
import type { BrandSignal, BrandSignalEvidence, BrandSignalProfile } from './brand-signal-profile';

export interface BrandVaultScreenshotEnvironment {
  [key: string]: string | undefined;
  BRAND_VAULT_SCREENSHOT_PROVIDER?: string;
  BRAND_VAULT_SCREENSHOT_TIMEOUT_MS?: string;
  BRAND_VAULT_SCREENSHOT_WAIT_MS?: string;
  BRAND_VAULT_SCREENSHOT_FULL_PAGE?: string;
  FIRECRAWL_API_KEY?: string;
  FIRECRAWL_API_URL?: string;
}

export type BrandVaultScreenshotFetch = (url: string, init?: RequestInit) => Promise<Response>;
export type BrandVaultScreenshotProvider = 'firecrawl' | 'off';

/** Captures a screenshot of `websiteUrl` and returns a temporary image URL, or `undefined` if unavailable. */
export type CaptureBrandVaultWebsiteScreenshot = (websiteUrl: string) => Promise<string | undefined>;

const DEFAULT_SCREENSHOT_TIMEOUT_MS = 15_000;
const MIN_SCREENSHOT_TIMEOUT_MS = 2_000;
const MAX_SCREENSHOT_TIMEOUT_MS = 25_000;
const DEFAULT_SCREENSHOT_WAIT_MS = 1_400;
const MAX_SCREENSHOT_WAIT_MS = 5_000;
const DEFAULT_FIRECRAWL_API_URL = 'https://api.firecrawl.dev/v2/scrape';

/**
 * Build a screenshot capture function from the environment, or `undefined` when no provider is configured
 * (so the caller can skip the step entirely). Firecrawl is the only provider today; it is selected
 * automatically when FIRECRAWL_API_KEY is present, unless BRAND_VAULT_SCREENSHOT_PROVIDER is 'off'.
 */
export function createBrandVaultWebsiteScreenshotCaptureFromEnvironment(
  env: BrandVaultScreenshotEnvironment = process.env,
  fetchFn: BrandVaultScreenshotFetch = fetch,
): CaptureBrandVaultWebsiteScreenshot | undefined {
  const provider = parseProvider(env.BRAND_VAULT_SCREENSHOT_PROVIDER);
  if (provider === 'off') return undefined;

  const apiKey = env.FIRECRAWL_API_KEY?.trim();
  if (!apiKey) return undefined;

  const endpoint = env.FIRECRAWL_API_URL?.trim() || DEFAULT_FIRECRAWL_API_URL;
  const timeoutMs = parseBoundedInteger(
    env.BRAND_VAULT_SCREENSHOT_TIMEOUT_MS,
    MIN_SCREENSHOT_TIMEOUT_MS,
    MAX_SCREENSHOT_TIMEOUT_MS,
    DEFAULT_SCREENSHOT_TIMEOUT_MS,
  );
  const waitMs = parseBoundedInteger(env.BRAND_VAULT_SCREENSHOT_WAIT_MS, 0, MAX_SCREENSHOT_WAIT_MS, DEFAULT_SCREENSHOT_WAIT_MS);
  const fullPage = parseBoolean(env.BRAND_VAULT_SCREENSHOT_FULL_PAGE, false);

  return async (websiteUrl) =>
    captureFirecrawlScreenshot({ apiKey, endpoint, websiteUrl, timeoutMs, waitMs, fullPage, fetchFn });
}

async function captureFirecrawlScreenshot(args: {
  apiKey: string;
  endpoint: string;
  websiteUrl: string;
  timeoutMs: number;
  waitMs: number;
  fullPage: boolean;
  fetchFn: BrandVaultScreenshotFetch;
}): Promise<string | undefined> {
  const target = normalizeHttpUrl(args.websiteUrl);
  if (!target) return undefined;

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), args.timeoutMs);
  try {
    const response = await args.fetchFn(args.endpoint, {
      method: 'POST',
      signal: controller.signal,
      headers: {
        accept: 'application/json',
        authorization: `Bearer ${args.apiKey}`,
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        url: target,
        formats: [{ type: 'screenshot', fullPage: args.fullPage }],
        onlyMainContent: false,
        waitFor: args.waitMs,
        timeout: args.timeoutMs,
        blockAds: true,
        proxy: 'auto',
      }),
    });
    if (!response.ok) return undefined;
    const payload = await response.json().catch(() => null);
    return extractScreenshotUrl(payload);
  } catch {
    return undefined;
  } finally {
    clearTimeout(timeout);
  }
}

/** Pull the screenshot URL out of a Firecrawl v2 scrape response, tolerant of shape drift. */
export function extractScreenshotUrl(payload: unknown): string | undefined {
  const root = objectRecord(payload);
  if (!root) return undefined;
  const data = objectRecord(root.data) ?? root;
  const screenshot =
    httpString(data.screenshot) ??
    httpString(objectRecord(data.screenshot)?.url) ??
    httpString(objectRecord(root.screenshot)?.url);
  return screenshot;
}

function normalizeHttpUrl(value: string): string | undefined {
  try {
    const url = new URL(value.trim());
    return url.protocol === 'https:' || url.protocol === 'http:' ? url.toString() : undefined;
  } catch {
    return undefined;
  }
}

function httpString(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined;
  const trimmed = value.trim();
  return /^https?:\/\/\S+/i.test(trimmed) ? trimmed : undefined;
}

function objectRecord(value: unknown): Record<string, unknown> | undefined {
  return value && typeof value === 'object' && !Array.isArray(value) ? (value as Record<string, unknown>) : undefined;
}

function parseProvider(value: string | undefined): BrandVaultScreenshotProvider | undefined {
  const normalized = value?.trim().toLowerCase();
  if (!normalized) return undefined;
  if (normalized === 'off' || normalized === 'disabled' || normalized === 'none') return 'off';
  if (normalized === 'firecrawl' || normalized === 'auto' || normalized === 'on') return 'firecrawl';
  return undefined;
}

function parseBoolean(value: string | undefined, fallback: boolean): boolean {
  const normalized = value?.trim().toLowerCase();
  if (!normalized) return fallback;
  if (['1', 'true', 'yes', 'on', 'full', 'fullpage'].includes(normalized)) return true;
  if (['0', 'false', 'no', 'off'].includes(normalized)) return false;
  return fallback;
}

function parseBoundedInteger(value: string | undefined, min: number, max: number, fallback: number): number {
  const parsed = value ? Number.parseInt(value, 10) : fallback;
  if (!Number.isFinite(parsed)) return fallback;
  return Math.min(max, Math.max(min, parsed));
}

/* ------------------------------------------------------------------ */
/*  Apply a captured screenshot to the draft profile                    */
/* ------------------------------------------------------------------ */

const SCREENSHOT_EXTRACTOR = 'brand-vault-website-screenshot.v1';
// > BRAND_CONFIDENCE.ACTIONABLE_SIGNAL (0.55) so the signal is actionable evidence for the storyboard
// owned-subject gate. first_party_website + brand_fact keep getBrandSignalEffectWeight() > 0.
const SCREENSHOT_SIGNAL_CONFIDENCE = 0.72;
const MAX_SCREENSHOT_SIGNAL_URLS = 4;

/**
 * Merge a durable screenshot URL into the profile's `assets.socialPreviewImages` signal as actionable,
 * first-party website evidence — the "Website screenshot" provenance the storyboard gate resolves
 * (reference-brand-evidence.ts). Deliberately NOT `assets.productImages`: that slot feeds Clickatron's
 * intent-gated product-mockup reference (Rule 29), and a full-site screenshot there would be a false
 * product image. Pure: returns a new profile, never mutates the input. No-op for a non-http URL.
 */
export function applyWebsiteScreenshotToProfile(
  profile: BrandSignalProfile,
  input: { screenshotUrl: string; observedAt: string; sourceUrl?: string },
): BrandSignalProfile {
  const url = input.screenshotUrl.trim();
  if (!/^https?:\/\/\S+/i.test(url)) return profile;

  const evidenceId = `evidence_website_screenshot_${stableHash(url)}`;
  const evidence: BrandSignalEvidence = {
    id: evidenceId,
    signalPath: 'assets.socialPreviewImages',
    sourceType: 'first_party_website',
    sourceField: 'website.screenshot',
    sourceUrl: input.sourceUrl?.trim() || url,
    excerpt: 'Live website screenshot captured during the Brand Vault scan.',
    confidence: SCREENSHOT_SIGNAL_CONFIDENCE,
    trustLevel: 'first_party_website',
    authorityClass: 'brand_fact',
    observedAt: input.observedAt,
    extractor: SCREENSHOT_EXTRACTOR,
  };

  const existing = profile.assets?.socialPreviewImages;
  const existingUrls = Array.isArray(existing?.value) ? existing.value : [];
  const value = [url, ...existingUrls.filter((existingUrl) => existingUrl !== url)].slice(0, MAX_SCREENSHOT_SIGNAL_URLS);
  const socialPreviewImages: BrandSignal<string[]> = {
    value,
    confidence: Math.max(SCREENSHOT_SIGNAL_CONFIDENCE, existing?.confidence ?? 0),
    trustLevel: 'first_party_website',
    authorityClass: 'brand_fact',
    evidenceIds: uniqueStrings([evidenceId, ...(existing?.evidenceIds ?? [])]),
  };

  // `assets.productImages` is required whenever `assets` exists — seed a non-actionable empty one when the
  // scan found no product images, so we can add socialPreviewImages without faking product evidence.
  const assets = profile.assets
    ? { ...profile.assets, socialPreviewImages }
    : { productImages: emptyProductImagesSignal(), socialPreviewImages };

  const alreadyRecorded = profile.evidence.some((item) => item.id === evidenceId);
  return {
    ...profile,
    assets,
    evidence: alreadyRecorded ? profile.evidence : [...profile.evidence, evidence],
  };
}

function emptyProductImagesSignal(): BrandSignal<string[]> {
  return {
    value: [],
    confidence: 0,
    trustLevel: 'fallback_default',
    authorityClass: 'inferred_hint',
    evidenceIds: [],
    fallbackReason: 'No product images detected during the scan.',
  };
}

function uniqueStrings(values: string[]): string[] {
  return [...new Set(values.map((value) => value.trim()).filter(Boolean))];
}

/** Small deterministic hash for a stable evidence id (not security-sensitive). */
function stableHash(value: string): string {
  let hash = 0;
  for (let index = 0; index < value.length; index += 1) {
    hash = (hash * 31 + value.charCodeAt(index)) | 0;
  }
  return Math.abs(hash).toString(36);
}
