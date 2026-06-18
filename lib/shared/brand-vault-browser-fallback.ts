import type {
  BrandWebsiteBrowserFallbackInput,
  BrandWebsiteBrowserFallbackSnapshot,
  BrandWebsiteRenderedPrimitiveEvidence,
  BrandWebsiteStylesheetSnapshot,
  FetchWebsiteBrandSnapshotOptions,
} from './brand-website-refinery-types';

export interface BrandVaultBrowserRenderEnvironment {
  [key: string]: string | undefined;
  BRAND_VAULT_BROWSER_RENDER_ENDPOINT?: string;
  BRAND_VAULT_BROWSER_RENDER_PROVIDER?: string;
  BRAND_VAULT_BROWSER_RENDER_TOKEN?: string;
  BRAND_VAULT_BROWSER_RENDER_TIMEOUT_MS?: string;
  BRAND_VAULT_PLAYWRIGHT_TIMEOUT_MS?: string;
  BRAND_VAULT_PLAYWRIGHT_WAIT_UNTIL?: string;
  BRAND_VAULT_FIRECRAWL_TIMEOUT_MS?: string;
  BRAND_VAULT_FIRECRAWL_WAIT_MS?: string;
  FIRECRAWL_API_KEY?: string;
  FIRECRAWL_API_URL?: string;
}

export type BrandVaultBrowserRenderFetch = (url: string, init?: RequestInit) => Promise<Response>;
export type BrandVaultBrowserRenderProvider = 'endpoint' | 'local_playwright' | 'firecrawl' | 'off';

export interface BrandVaultPlaywrightBrowser {
  close: () => Promise<void>;
  newContext: (options: { userAgent?: string }) => Promise<BrandVaultPlaywrightContext>;
}

export interface BrandVaultPlaywrightContext {
  close: () => Promise<void>;
  newPage: () => Promise<BrandVaultPlaywrightPage>;
}

export interface BrandVaultPlaywrightPage {
  content: () => Promise<string>;
  evaluate: <T>(pageFunction: () => T | Promise<T>) => Promise<T>;
  goto: (
    url: string,
    options: { timeout: number; waitUntil: BrandVaultPlaywrightWaitUntil },
  ) => Promise<BrandVaultPlaywrightResponse | null>;
}

export interface BrandVaultPlaywrightResponse {
  headers: () => Record<string, string>;
  status: () => number;
  url: () => string;
}

export interface BrandVaultPlaywrightModule {
  chromium: {
    launch: (options: { headless: true; args: string[] }) => Promise<BrandVaultPlaywrightBrowser>;
  };
}

export type BrandVaultPlaywrightWaitUntil = 'domcontentloaded' | 'load' | 'networkidle';

export interface BrandVaultLocalPlaywrightFallbackOptions {
  loadPlaywright?: () => Promise<BrandVaultPlaywrightModule>;
  timeoutMs?: number;
  waitUntil?: BrandVaultPlaywrightWaitUntil;
}

const DEFAULT_BROWSER_RENDER_TIMEOUT_MS = 12_000;
const MIN_BROWSER_RENDER_TIMEOUT_MS = 1_000;
const MAX_BROWSER_RENDER_TIMEOUT_MS = 25_000;
const DEFAULT_FIRECRAWL_API_URL = 'https://api.firecrawl.dev/v2/scrape';
const DEFAULT_FIRECRAWL_WAIT_MS = 1_000;
const MAX_FIRECRAWL_WAIT_MS = 5_000;
const DEFAULT_PLAYWRIGHT_WAIT_UNTIL: BrandVaultPlaywrightWaitUntil = 'domcontentloaded';
const PLAYWRIGHT_LAUNCH_ARGS = ['--disable-dev-shm-usage', '--no-sandbox'] as const;

export function createBrandVaultBrowserFallbackFetchFromEnvironment(
  env: BrandVaultBrowserRenderEnvironment = process.env,
  fetchFn: BrandVaultBrowserRenderFetch = fetch,
): FetchWebsiteBrandSnapshotOptions['browserFallbackFetchFn'] | undefined {
  const provider = parseProvider(env.BRAND_VAULT_BROWSER_RENDER_PROVIDER);
  if (provider === 'off') return undefined;

  const endpoint = env.BRAND_VAULT_BROWSER_RENDER_ENDPOINT?.trim();
  if (endpoint) {
    const token = env.BRAND_VAULT_BROWSER_RENDER_TOKEN?.trim();
    const timeoutMs = parseTimeoutMs(env.BRAND_VAULT_BROWSER_RENDER_TIMEOUT_MS);
    return async (input) => fetchBrowserRenderedSnapshot({ endpoint, token, timeoutMs, input, fetchFn });
  }

  if (provider === 'local_playwright') {
    return createBrandVaultLocalPlaywrightFallbackFetch({
      timeoutMs: parseTimeoutMs(env.BRAND_VAULT_PLAYWRIGHT_TIMEOUT_MS),
      waitUntil: parsePlaywrightWaitUntil(env.BRAND_VAULT_PLAYWRIGHT_WAIT_UNTIL),
    });
  }

  if (provider !== 'firecrawl') return undefined;

  const firecrawlApiKey = env.FIRECRAWL_API_KEY?.trim();
  if (!firecrawlApiKey) return undefined;

  return async (input) =>
    fetchFirecrawlRenderedSnapshot({
      apiKey: firecrawlApiKey,
      endpoint: env.FIRECRAWL_API_URL?.trim() || DEFAULT_FIRECRAWL_API_URL,
      input,
      fetchFn,
      timeoutMs: parseTimeoutMs(env.BRAND_VAULT_FIRECRAWL_TIMEOUT_MS),
      waitMs: parseBoundedInteger(env.BRAND_VAULT_FIRECRAWL_WAIT_MS, 0, MAX_FIRECRAWL_WAIT_MS, DEFAULT_FIRECRAWL_WAIT_MS),
    });
}

export function createBrandVaultLocalPlaywrightFallbackFetch(
  options: BrandVaultLocalPlaywrightFallbackOptions = {},
): NonNullable<FetchWebsiteBrandSnapshotOptions['browserFallbackFetchFn']> {
  return async (input) =>
    fetchLocalPlaywrightRenderedSnapshot({
      input,
      loadPlaywright: options.loadPlaywright ?? loadPlaywrightModule,
      timeoutMs: options.timeoutMs ?? DEFAULT_BROWSER_RENDER_TIMEOUT_MS,
      waitUntil: options.waitUntil ?? DEFAULT_PLAYWRIGHT_WAIT_UNTIL,
    });
}

async function fetchBrowserRenderedSnapshot(args: {
  endpoint: string;
  token?: string;
  timeoutMs: number;
  input: BrandWebsiteBrowserFallbackInput;
  fetchFn: BrandVaultBrowserRenderFetch;
}): Promise<BrandWebsiteBrowserFallbackSnapshot | undefined> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), args.timeoutMs);
  try {
    const response = await args.fetchFn(args.endpoint, {
      method: 'POST',
      signal: controller.signal,
      headers: renderRequestHeaders(args.token),
      body: JSON.stringify(renderRequestBody(args.input)),
    });
    if (!response.ok) return undefined;
    return responseToFallbackSnapshot(response, args.input.normalizedUrl);
  } catch {
    return undefined;
  } finally {
    clearTimeout(timeout);
  }
}

function renderRequestHeaders(token: string | undefined): HeadersInit {
  const headers: Record<string, string> = {
    accept: 'application/json,text/html',
    'content-type': 'application/json',
  };
  if (token) headers.authorization = `Bearer ${token}`;
  return headers;
}

function renderRequestBody(input: BrandWebsiteBrowserFallbackInput): Record<string, unknown> {
  return {
    url: input.normalizedUrl,
    normalizedUrl: input.normalizedUrl,
    reason: input.reason,
    httpStatus: input.httpStatus,
    contentType: input.contentType,
    htmlExcerpt: input.htmlExcerpt,
    now: input.now,
    userAgent: input.userAgent,
  };
}

async function fetchLocalPlaywrightRenderedSnapshot(args: {
  input: BrandWebsiteBrowserFallbackInput;
  loadPlaywright: () => Promise<BrandVaultPlaywrightModule>;
  timeoutMs: number;
  waitUntil: BrandVaultPlaywrightWaitUntil;
}): Promise<BrandWebsiteBrowserFallbackSnapshot | undefined> {
  let browser: BrandVaultPlaywrightBrowser | undefined;
  let context: BrandVaultPlaywrightContext | undefined;
  try {
    const playwright = await args.loadPlaywright();
    browser = await playwright.chromium.launch({
      headless: true,
      args: [...PLAYWRIGHT_LAUNCH_ARGS],
    });
    context = await browser.newContext({
      userAgent: args.input.userAgent,
    });
    const page = await context.newPage();
    const response = await page.goto(args.input.normalizedUrl, {
      timeout: args.timeoutMs,
      waitUntil: args.waitUntil,
    });
    const html = await page.content();
    if (!html.trim()) return undefined;
    const stylesheets = await extractPlaywrightStylesheets(page);
    const renderedPrimitives = await extractPlaywrightRenderedPrimitives(page);

    return {
      normalizedUrl: response?.url() ?? args.input.normalizedUrl,
      html,
      contentType: response?.headers()['content-type'] ?? 'text/html',
      stylesheets,
      renderedPrimitives,
      fetchWarnings: uniqueStrings([
        'Self-hosted Playwright browser-rendered evidence was used because direct Brand Vault website fetch did not produce usable HTML.',
        response ? `Self-hosted Playwright renderer received HTTP ${response.status()}.` : undefined,
        stylesheets?.length ? 'Self-hosted Playwright renderer attached CSSOM stylesheet evidence for color and font extraction.' : undefined,
        renderedPrimitives ? 'Self-hosted Playwright renderer attached computed layout and motion primitives for visual signal extraction.' : undefined,
      ]),
    };
  } catch {
    return undefined;
  } finally {
    await context?.close().catch(() => undefined);
    await browser?.close().catch(() => undefined);
  }
}

async function extractPlaywrightStylesheets(
  page: BrandVaultPlaywrightPage,
): Promise<BrandWebsiteStylesheetSnapshot[] | undefined> {
  const stylesheets = await page.evaluate(() => {
    return Array.from(document.styleSheets)
      .map((sheet, index) => {
        try {
          const css = Array.from(sheet.cssRules).map((rule) => rule.cssText).join('\n').trim();
          if (!css) return null;
          return {
            url: sheet.href || `${location.href}#playwright-stylesheet-${index}`,
            css,
            contentType: 'text/css',
          };
        } catch {
          return null;
        }
      })
      .filter((item): item is { url: string; css: string; contentType: string } => Boolean(item));
  });
  return stylesheets.length > 0 ? stylesheets : undefined;
}

async function extractPlaywrightRenderedPrimitives(
  page: BrandVaultPlaywrightPage,
): Promise<BrandWebsiteRenderedPrimitiveEvidence | undefined> {
  const primitives = await page.evaluate(() => {
    const clamp01 = (value: number) => Math.max(0, Math.min(1, value));
    const round = (value: number) => Math.round(clamp01(value) * 100) / 100;
    const visibleElements = Array.from(document.body?.querySelectorAll<HTMLElement>('*') ?? [])
      .map((element) => {
        const rect = element.getBoundingClientRect();
        const style = getComputedStyle(element);
        const area = Math.max(0, rect.width) * Math.max(0, rect.height);
        if (area <= 4 || style.display === 'none' || style.visibility === 'hidden' || Number(style.opacity || 1) <= 0.02) return null;
        return { element, rect, style, area };
      })
      .filter((item): item is { element: HTMLElement; rect: DOMRect; style: CSSStyleDeclaration; area: number } => Boolean(item));
    if (visibleElements.length === 0) return null;

    const viewportArea = Math.max(1, window.innerWidth * window.innerHeight);
    const totalArea = visibleElements.reduce((sum, item) => sum + Math.min(item.area, viewportArea), 0);
    const textArea = visibleElements
      .filter((item) => Boolean(item.element.innerText?.trim()))
      .reduce((sum, item) => sum + Math.min(item.area, viewportArea), 0);
    const mediaArea = visibleElements
      .filter((item) => /^(IMG|PICTURE|VIDEO|SVG|CANVAS)$/.test(item.element.tagName))
      .reduce((sum, item) => sum + Math.min(item.area, viewportArea), 0);
    const dataVizCount = visibleElements.filter((item) =>
      /^(TABLE|CANVAS|SVG)$/.test(item.element.tagName) ||
      /\b(?:chart|graph|metric|stat|dashboard|analytics|data-viz|datatable)\b/i.test(`${item.element.className} ${item.element.id} ${item.element.getAttribute('aria-label') ?? ''}`),
    ).length;
    const interactiveCount = visibleElements.filter((item) =>
      /^(A|BUTTON|INPUT|SELECT|TEXTAREA)$/.test(item.element.tagName) || item.element.getAttribute('role') === 'button',
    ).length;
    const radiusValues = visibleElements.flatMap((item) =>
      [item.style.borderTopLeftRadius, item.style.borderTopRightRadius, item.style.borderBottomRightRadius, item.style.borderBottomLeftRadius]
        .map((value) => Number.parseFloat(value))
        .filter((value) => Number.isFinite(value) && value > 0),
    );
    const centerAlignedCount = visibleElements.filter((item) =>
      item.style.justifyContent === 'center' ||
      item.style.alignItems === 'center' ||
      item.style.textAlign === 'center' ||
      Math.abs((item.rect.left + item.rect.width / 2) - window.innerWidth / 2) < window.innerWidth * 0.08,
    ).length;
    const decoratedCount = visibleElements.filter((item) =>
      item.style.boxShadow !== 'none' ||
      item.style.textShadow !== 'none' ||
      item.style.filter !== 'none' ||
      item.style.backdropFilter !== 'none' ||
      item.style.backgroundImage.includes('gradient') ||
      item.style.borderStyle !== 'none',
    ).length;
    const geometryCount = visibleElements.filter((item) =>
      item.style.display === 'grid' ||
      item.style.display === 'flex' ||
      item.style.transform !== 'none' ||
      /^(SVG|CANVAS)$/.test(item.element.tagName),
    ).length;
    const transitionItems = visibleElements.filter((item) =>
      item.style.transitionDuration.split(',').some((duration) => parseCssDurationMs(duration) > 0),
    );
    const animationItems = visibleElements.filter((item) =>
      item.style.animationName !== 'none' &&
      item.style.animationDuration.split(',').some((duration) => parseCssDurationMs(duration) > 0),
    );
    const transformCount = visibleElements.filter((item) => item.style.transform !== 'none').length;
    const durations = [...transitionItems, ...animationItems].flatMap((item) => [
      ...item.style.transitionDuration.split(',').map(parseCssDurationMs),
      ...item.style.animationDuration.split(',').map(parseCssDurationMs),
    ]).filter((value) => value > 0);
    const easingCount = visibleElements.filter((item) =>
      /cubic-bezier\([^)]*(?:1\.\d|-\d)/i.test(`${item.style.transitionTimingFunction} ${item.style.animationTimingFunction}`),
    ).length;
    const elementDensity = clamp01(visibleElements.length / 80);
    const textCoverage = clamp01(textArea / viewportArea);
    const mediaCoverage = clamp01(mediaArea / viewportArea);
    const dataVizDensity = clamp01(dataVizCount / Math.max(1, visibleElements.length) * 8);
    const interactionDensity = clamp01(interactiveCount / Math.max(1, visibleElements.length) * 4);
    const averageRadius = radiusValues.length ? radiusValues.reduce((sum, value) => sum + value, 0) / radiusValues.length : 0;
    const radiusBias = clamp01(averageRadius / 28);
    const decorationDensity = clamp01(decoratedCount / Math.max(1, visibleElements.length) * 3);
    const geometryDensity = clamp01(geometryCount / Math.max(1, visibleElements.length) * 3);
    const layoutSymmetry = clamp01(0.36 + centerAlignedCount / Math.max(1, visibleElements.length) * 0.82 - interactionDensity * 0.12);
    const transitionDensity = clamp01(transitionItems.length / Math.max(1, visibleElements.length) * 5);
    const animationDensity = clamp01(animationItems.length / Math.max(1, visibleElements.length) * 5);
    const transformDensity = clamp01(transformCount / Math.max(1, visibleElements.length) * 4);
    const averageDurationMs = durations.length ? durations.reduce((sum, value) => sum + value, 0) / durations.length : 0;
    const durationRegularity = durations.length > 1 ? 1 - clamp01(durationStdDev(durations) / Math.max(1, averageDurationMs)) : 0.5;
    const fastness = durations.length ? clamp01(1 - averageDurationMs / 900) : 0.45;
    const motionEnergy = clamp01(animationDensity * 0.45 + transitionDensity * 0.35 + transformDensity * 0.2);
    const atoms = {
      'rendered.element_density': round(elementDensity),
      'rendered.text_coverage': round(textCoverage),
      'rendered.media_coverage': round(mediaCoverage),
      'rendered.data_viz_density': round(dataVizDensity),
      'rendered.interaction_density': round(interactionDensity),
      'rendered.corner_radius_bias': round(radiusBias),
      'rendered.decoration_density': round(decorationDensity),
      'rendered.geometry_density': round(geometryDensity),
      'rendered.layout_symmetry': round(layoutSymmetry),
      'rendered.motion_intensity': round(motionEnergy),
      'rendered.transition_density': round(transitionDensity),
      'rendered.animation_density': round(animationDensity),
    };

    return {
      sourceField: 'website.renderedPrimitives',
      motionSourceField: 'website.renderedMotionPrimitives',
      excerpt: `Rendered primitives: ${visibleElements.length} visible elements, ${dataVizCount} data-viz markers, ${transitionItems.length} transitions, ${animationItems.length} animations.`,
      atoms,
      visual: {
        minimalism: round(clamp01(0.78 - elementDensity * 0.34 - decorationDensity * 0.34 - mediaCoverage * 0.12)),
        densityTolerance: round(clamp01(0.32 + elementDensity * 0.34 + textCoverage * 0.2 + dataVizDensity * 0.28)),
        dataVizAffinity: round(clamp01(dataVizDensity * 0.76 + geometryDensity * 0.16 + textCoverage * 0.08)),
        expressiveness: round(clamp01(decorationDensity * 0.34 + mediaCoverage * 0.24 + motionEnergy * 0.24 + geometryDensity * 0.18)),
        geometryTendency: round(clamp01(geometryDensity * 0.5 + layoutSymmetry * 0.28 + dataVizDensity * 0.22)),
        decorationTolerance: round(decorationDensity),
        cornerRadiusBias: round(radiusBias),
        layoutSymmetry: round(layoutSymmetry),
        contrastPreference: 0.5,
      },
      motion: transitionItems.length + animationItems.length + transformCount > 0
        ? {
            motionEnergy: round(motionEnergy),
            overshootTolerance: round(clamp01(easingCount / Math.max(1, transitionItems.length + animationItems.length) + animationDensity * 0.18)),
            transitionSharpness: round(clamp01(fastness * 0.55 + transitionDensity * 0.25 + geometryDensity * 0.2)),
            rhythmRegularity: round(clamp01(durationRegularity * 0.7 + (transitionItems.length > 0 && animationItems.length === 0 ? 0.15 : 0))),
          }
        : undefined,
      confidence: 0.66,
      motionConfidence: 0.62,
    };

    function parseCssDurationMs(value: string): number {
      const trimmed = value.trim();
      const match = trimmed.match(/^(\d+(?:\.\d+)?)(ms|s)$/i);
      if (!match) return 0;
      return match[2].toLowerCase() === 's' ? Number.parseFloat(match[1]) * 1000 : Number.parseFloat(match[1]);
    }

    function durationStdDev(values: number[]): number {
      const mean = values.reduce((sum, value) => sum + value, 0) / values.length;
      const variance = values.reduce((sum, value) => sum + (value - mean) ** 2, 0) / values.length;
      return Math.sqrt(variance);
    }
  });
  return renderedPrimitiveSnapshot(primitives);
}

async function fetchFirecrawlRenderedSnapshot(args: {
  apiKey: string;
  endpoint: string;
  input: BrandWebsiteBrowserFallbackInput;
  fetchFn: BrandVaultBrowserRenderFetch;
  timeoutMs: number;
  waitMs: number;
}): Promise<BrandWebsiteBrowserFallbackSnapshot | undefined> {
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
      body: JSON.stringify(firecrawlRequestBody(args.input, args.timeoutMs, args.waitMs)),
    });
    if (!response.ok) return undefined;
    const payload = await response.json().catch(() => null);
    return firecrawlPayloadToSnapshot(payload, args.input.normalizedUrl);
  } catch {
    return undefined;
  } finally {
    clearTimeout(timeout);
  }
}

function firecrawlRequestBody(
  input: BrandWebsiteBrowserFallbackInput,
  timeoutMs: number,
  waitMs: number,
): Record<string, unknown> {
  return {
    url: input.normalizedUrl,
    formats: ['html', 'rawHtml', 'links', 'branding'],
    onlyMainContent: false,
    waitFor: waitMs,
    timeout: timeoutMs,
    removeBase64Images: true,
    blockAds: true,
    proxy: 'auto',
    ...(input.userAgent ? { headers: { 'User-Agent': input.userAgent } } : {}),
  };
}

function firecrawlPayloadToSnapshot(
  payload: unknown,
  requestedUrl: string,
): BrandWebsiteBrowserFallbackSnapshot | undefined {
  const record = objectRecord(payload) ?? {};
  const data = objectRecord(record.data) ?? record;
  const html = stringValue(data.html) ?? stringValue(data.rawHtml);
  if (!html?.trim()) return undefined;

  const metadata = objectRecord(data.metadata);
  const normalizedUrl =
    stringValue(metadata?.url) ??
    stringValue(metadata?.sourceURL) ??
    stringValue(data.url) ??
    requestedUrl;
  const brandingStylesheet = firecrawlBrandingStylesheet(data.branding, normalizedUrl);
  return {
    normalizedUrl,
    html,
    contentType: stringValue(metadata?.contentType) ?? 'text/html',
    stylesheets: brandingStylesheet ? [brandingStylesheet] : undefined,
    fetchWarnings: uniqueStrings([
      'Firecrawl browser-rendered evidence was used because direct Brand Vault website fetch did not produce usable HTML.',
      stringValue(data.warning),
      stringValue(metadata?.error),
      brandingStylesheet ? 'Firecrawl branding metadata was converted into draft-only color and font stylesheet evidence.' : undefined,
    ]),
  };
}

async function responseToFallbackSnapshot(
  response: Response,
  requestedUrl: string,
): Promise<BrandWebsiteBrowserFallbackSnapshot | undefined> {
  const contentType = response.headers.get('content-type') ?? '';
  if (contentType.includes('application/json')) {
    const payload = await response.json().catch(() => null);
    return snapshotFromJsonPayload(payload, requestedUrl);
  }

  const html = await response.text();
  if (!html.trim()) return undefined;
  return {
    normalizedUrl: response.url || requestedUrl,
    html,
    contentType: contentType || 'text/html',
    fetchWarnings: ['Browser render endpoint returned raw HTML fallback evidence.'],
  };
}

function snapshotFromJsonPayload(
  payload: unknown,
  requestedUrl: string,
): BrandWebsiteBrowserFallbackSnapshot | undefined {
  const record = objectRecord(payload) ?? {};
  const data = objectRecord(record.data) ?? objectRecord(record.result) ?? record;
  const html = stringValue(data.html) ?? stringValue(data.content);
  if (!html?.trim()) return undefined;

  return {
    normalizedUrl:
      stringValue(data.normalizedUrl) ??
      stringValue(data.finalUrl) ??
      stringValue(data.url) ??
      requestedUrl,
    html,
    contentType: stringValue(data.contentType) ?? stringValue(data.mimeType) ?? 'text/html',
    stylesheets: stylesheetSnapshots(data.stylesheets),
    renderedPrimitives: renderedPrimitiveSnapshot(data.renderedPrimitives),
    stylesheetWarnings: stringArray(data.stylesheetWarnings),
    fetchWarnings: stringArray(data.fetchWarnings ?? data.warnings),
  };
}

function renderedPrimitiveSnapshot(value: unknown): BrandWebsiteRenderedPrimitiveEvidence | undefined {
  const record = objectRecord(value);
  const visual = objectRecord(record?.visual);
  const atoms = objectRecord(record?.atoms);
  if (!record || !visual || !atoms) return undefined;

  const rendered: BrandWebsiteRenderedPrimitiveEvidence = {
    sourceField: stringValue(record.sourceField) ?? 'website.renderedPrimitives',
    motionSourceField: stringValue(record.motionSourceField),
    excerpt: stringValue(record.excerpt),
    atoms: numberRecord(atoms),
    visual: {
      minimalism: clamp01Number(visual.minimalism),
      densityTolerance: clamp01Number(visual.densityTolerance),
      dataVizAffinity: clamp01Number(visual.dataVizAffinity),
      expressiveness: clamp01Number(visual.expressiveness),
      geometryTendency: clamp01Number(visual.geometryTendency),
      decorationTolerance: clamp01Number(visual.decorationTolerance),
      cornerRadiusBias: clamp01Number(visual.cornerRadiusBias),
      layoutSymmetry: clamp01Number(visual.layoutSymmetry),
      contrastPreference: clamp01Number(visual.contrastPreference),
    },
    confidence: optionalClamp01Number(record.confidence),
    motionConfidence: optionalClamp01Number(record.motionConfidence),
  };
  const motion = objectRecord(record.motion);
  if (motion) {
    rendered.motion = {
      motionEnergy: clamp01Number(motion.motionEnergy),
      overshootTolerance: clamp01Number(motion.overshootTolerance),
      transitionSharpness: clamp01Number(motion.transitionSharpness),
      rhythmRegularity: clamp01Number(motion.rhythmRegularity),
    };
  }
  return Object.keys(rendered.atoms).length > 0 ? rendered : undefined;
}

function numberRecord(record: Record<string, unknown>): Record<string, number> {
  return Object.fromEntries(
    Object.entries(record)
      .map(([key, value]) => [key, optionalClamp01Number(value)])
      .filter((entry): entry is [string, number] => typeof entry[1] === 'number'),
  );
}

function clamp01Number(value: unknown): number {
  return optionalClamp01Number(value) ?? 0.5;
}

function optionalClamp01Number(value: unknown): number | undefined {
  if (typeof value !== 'number' || !Number.isFinite(value)) return undefined;
  return Math.max(0, Math.min(1, value));
}

function stylesheetSnapshots(value: unknown): BrandWebsiteStylesheetSnapshot[] | undefined {
  if (!Array.isArray(value)) return undefined;
  const snapshots = value
    .map((item) => {
      const record = objectRecord(item);
      const url = stringValue(record?.url);
      const css = stringValue(record?.css);
      if (!url || !css) return null;
      const contentType = stringValue(record?.contentType);
      return {
        url,
        css,
        ...(contentType ? { contentType } : {}),
      };
    })
    .filter((item): item is BrandWebsiteStylesheetSnapshot => Boolean(item));
  return snapshots.length > 0 ? snapshots : undefined;
}

function stringArray(value: unknown): string[] | undefined {
  if (!Array.isArray(value)) return undefined;
  const values = value.filter((item): item is string => typeof item === 'string' && Boolean(item.trim()));
  return values.length > 0 ? values : undefined;
}

function firecrawlBrandingStylesheet(
  value: unknown,
  normalizedUrl: string,
): BrandWebsiteStylesheetSnapshot | undefined {
  const branding = objectRecord(value);
  if (!branding) return undefined;

  const lines = firecrawlBrandingColorLines(branding.colors);
  const fontFamily = firecrawlFontFamily(branding.typography);
  if (fontFamily) lines.push(`body { font-family: ${JSON.stringify(fontFamily)}, sans-serif; }`);
  if (lines.length === 0) return undefined;

  return {
    url: `${normalizedUrl}#firecrawl-branding`,
    css: lines.join('\n'),
    contentType: 'text/css',
  };
}

function firecrawlBrandingColorLines(value: unknown): string[] {
  const colors = objectRecord(value);
  if (!colors) return [];
  const entries = Object.entries(colors)
    .map(([name, color]) => {
      const normalized = normalizeHexColor(stringValue(color));
      if (!normalized) return null;
      return `--firecrawl-${cssIdentifier(name)}: ${normalized};`;
    })
    .filter((line): line is string => Boolean(line));
  return entries.length > 0 ? [`:root { ${entries.join(' ')} }`] : [];
}

function firecrawlFontFamily(value: unknown): string | undefined {
  const typography = objectRecord(value);
  const fontFamilies = objectRecord(typography?.fontFamilies);
  const family = stringValue(fontFamilies?.primary) ?? stringValue(fontFamilies?.heading);
  if (!family) return undefined;
  const clean = family.replace(/[^a-zA-Z0-9 ,._-]+/g, '').trim();
  return clean || undefined;
}

function cssIdentifier(value: string): string {
  return value
    .replace(/([a-z])([A-Z])/g, '$1-$2')
    .toLowerCase()
    .replace(/[^a-z0-9-]+/g, '-')
    .replace(/^-+|-+$/g, '') || 'color';
}

function normalizeHexColor(value: string | undefined): string | undefined {
  if (!value) return undefined;
  const hex = value.trim().toLowerCase();
  if (/^#[0-9a-f]{6}$/.test(hex)) return hex;
  if (/^#[0-9a-f]{3}$/.test(hex)) return `#${hex[1]}${hex[1]}${hex[2]}${hex[2]}${hex[3]}${hex[3]}`;
  return undefined;
}

function uniqueStrings(values: Array<string | undefined>): string[] | undefined {
  const unique = [...new Set(values.map((value) => value?.trim()).filter((value): value is string => Boolean(value)))];
  return unique.length > 0 ? unique : undefined;
}

function objectRecord(value: unknown): Record<string, unknown> | undefined {
  return value && typeof value === 'object' && !Array.isArray(value) ? (value as Record<string, unknown>) : undefined;
}

function stringValue(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() ? value.trim() : undefined;
}

function parseProvider(value: string | undefined): BrandVaultBrowserRenderProvider | undefined {
  const normalized = value?.trim().toLowerCase().replace(/-/g, '_');
  if (!normalized) return undefined;
  if (normalized === 'endpoint' || normalized === 'self_hosted' || normalized === 'custom') return 'endpoint';
  if (normalized === 'playwright' || normalized === 'local_playwright') return 'local_playwright';
  if (normalized === 'firecrawl') return 'firecrawl';
  if (normalized === 'off' || normalized === 'disabled' || normalized === 'none') return 'off';
  return undefined;
}

function parsePlaywrightWaitUntil(value: string | undefined): BrandVaultPlaywrightWaitUntil {
  const normalized = value?.trim().toLowerCase();
  if (normalized === 'domcontentloaded' || normalized === 'load' || normalized === 'networkidle') return normalized;
  return DEFAULT_PLAYWRIGHT_WAIT_UNTIL;
}

async function loadPlaywrightModule(): Promise<BrandVaultPlaywrightModule> {
  const packageName = 'playwright';
  const loadedPackage = await import(/* webpackIgnore: true */ packageName);
  return loadedPackage as BrandVaultPlaywrightModule;
}

function parseTimeoutMs(value: string | undefined): number {
  const parsed = value ? Number.parseInt(value, 10) : DEFAULT_BROWSER_RENDER_TIMEOUT_MS;
  if (!Number.isFinite(parsed)) return DEFAULT_BROWSER_RENDER_TIMEOUT_MS;
  return Math.min(MAX_BROWSER_RENDER_TIMEOUT_MS, Math.max(MIN_BROWSER_RENDER_TIMEOUT_MS, parsed));
}

function parseBoundedInteger(
  value: string | undefined,
  min: number,
  max: number,
  fallback: number,
): number {
  const parsed = value ? Number.parseInt(value, 10) : fallback;
  if (!Number.isFinite(parsed)) return fallback;
  return Math.min(max, Math.max(min, parsed));
}
