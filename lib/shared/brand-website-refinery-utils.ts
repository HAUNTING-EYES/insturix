import { load } from 'cheerio';
import type { BrandPaletteHarmony, BrandProofStyle, BrandSignalProfile } from './brand-signal-profile';
import { sanitizeEvidenceExcerpt } from './brand-signal-profile';
import type {
  BrandEvidenceCandidate,
  BrandEvidenceCandidateSourceType,
  BrandWebsiteDraftInput,
  ParsedWebsiteEvidence,
  SignalSource,
} from './brand-website-refinery-types';

export const DARK_SURFACE = '#0b0b0f';
export const LIGHT_SURFACE = '#ffffff';

const CTA_PATTERN = /\b(start|get|book|join|try|buy|shop|contact|talk|demo|learn|download|subscribe|apply|schedule|request)\b/i;

export function normalizeBrandWebsiteUrl(input: string): string {
  const trimmed = input.trim();
  if (!trimmed) throw new Error('Website URL is required.');
  if (/^[a-z][a-z\d+\-.]*:/i.test(trimmed) && !/^https?:\/\//i.test(trimmed)) {
    throw new Error(`Unsupported website URL protocol: ${trimmed.split(':')[0]}:`);
  }
  const withProtocol = /^[a-z][a-z\d+\-.]*:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
  const url = new URL(withProtocol);
  if (url.protocol !== 'https:' && url.protocol !== 'http:') {
    throw new Error(`Unsupported website URL protocol: ${url.protocol}`);
  }
  url.hash = '';
  url.username = '';
  url.password = '';
  return url.toString();
}

export function parseWebsiteHtml(input: BrandWebsiteDraftInput): ParsedWebsiteEvidence {
  const normalizedUrl = normalizeBrandWebsiteUrl(input.websiteUrl);
  const host = new URL(normalizedUrl).hostname.replace(/^www\./, '');
  const $ = load(input.html);
  const jsonLd = extractJsonLd($('script[type="application/ld+json"]').map((_, el) => $(el).text()).get());
  const schema = chooseSchemaObject(jsonLd);
  const title = cleanText($('title').first().text());
  const metaDescription = meta($, ['description', 'og:description', 'twitter:description']) ?? readString(schema, 'description');
  const siteName = meta($, ['og:site_name', 'application-name']);
  const schemaName = readString(schema, 'name');
  const schemaDescription = readString(schema, 'description');
  const schemaTypes = readTypes(schema);
  const colors = extractColors($);
  const fonts = extractFonts($);
  const headings = uniqueText($('h1,h2,h3').map((_, el) => cleanText($(el).text())).get()).slice(0, 16);
  const ctas = uniqueText($('a,button').map((_, el) => cleanText($(el).text())).get())
    .filter((text) => text.length <= 80 && CTA_PATTERN.test(text))
    .slice(0, 12);
  const proofSnippets = uniqueText($('[class*="testimonial"],[class*="case"],[class*="customer"],[class*="proof"],blockquote')
    .map((_, el) => cleanText($(el).text()))
    .get())
    .filter((text) => text.length >= 12)
    .slice(0, 8);
  const logoCandidates = uniqueText([
    readLogo(schema),
    meta($, ['og:image', 'twitter:image']),
    ...$('link[rel*="icon"],img[alt*="logo" i],img[src*="logo" i]').map((_, el) => cleanText($(el).attr('href') ?? $(el).attr('src'))).get(),
  ]).slice(0, 12);

  $('script,style,noscript,svg').remove();
  const bodyText = sanitizeEvidenceExcerpt(readBodyText($) ?? '', 1200);
  return {
    normalizedUrl,
    host,
    title,
    metaDescription,
    siteName,
    schemaName,
    schemaDescription,
    schemaTypes,
    colors,
    fonts,
    headings,
    ctas,
    proofSnippets,
    logoCandidates,
    bodyText,
  };
}

function readBodyText($: ReturnType<typeof load>): string | undefined {
  const chunks = $('body')
    .find('*')
    .map((_, el) => {
      const clone = $(el).clone();
      clone.children().remove();
      return cleanText(clone.text());
    })
    .get()
    .filter((text): text is string => Boolean(text));

  return cleanText(chunks.length ? chunks.join('. ') : $('body').text());
}

export function source(
  candidateSourceType: BrandEvidenceCandidateSourceType,
  sourceField: string,
  rawValue: unknown,
  normalizedValue: unknown,
  confidence: number,
  authorityClass: SignalSource['authorityClass'],
): SignalSource {
  return { candidateSourceType, sourceField, rawValue, normalizedValue, confidence, authorityClass };
}

export function fallbackSource(reason: string): SignalSource {
  return {
    candidateSourceType: 'website',
    sourceField: 'fallback',
    rawValue: reason,
    normalizedValue: reason,
    excerpt: reason,
    confidence: 0.15,
    authorityClass: 'inferred_hint',
    trustLevel: 'fallback_default',
  };
}

export function candidateOnly(
  signalPath: string,
  value: string,
  sourceType: BrandEvidenceCandidateSourceType,
  sourceField: string,
  sourceUrl: string,
  observedAt: string,
  extractorId: string,
  input: BrandWebsiteDraftInput,
): BrandEvidenceCandidate {
  return {
    id: `candidate_${sourceField.replace(/[^a-z0-9]+/gi, '_')}_${Math.abs(hash(value))}`,
    brandId: input.brandId,
    jobId: input.jobId,
    sourceType,
    sourceUrl,
    sourceField,
    signalPath,
    rawValue: value,
    normalizedValue: value,
    excerpt: sanitizeEvidenceExcerpt(value),
    confidence: 0.62,
    authorityClass: 'owned',
    observedAt,
    extractorId,
  };
}

export function inferCategory(text: string): string {
  const lower = text.toLowerCase();
  if (/(analytics|dashboard|data|reporting|bi\b)/.test(lower)) return 'analytics';
  if (/(agency|studio|creative|production)/.test(lower)) return 'creative services';
  if (/(finance|wealth|bank|investment)/.test(lower)) return 'finance';
  if (/(health|clinic|wellness|care)/.test(lower)) return 'health';
  if (/(shop|commerce|retail|store)/.test(lower)) return 'commerce';
  if (/(software|platform|automation|workflow|saas)/.test(lower)) return 'software';
  return 'unknown';
}

export function inferAudience(text: string): string[] {
  const matches = [
    ...text.matchAll(/\bfor\s+([^.!?\n,;:]{4,100})/gi),
    ...text.matchAll(/\bhelps\s+([^.!?\n,;:]{4,100})/gi),
    ...text.matchAll(/\btrusted by\s+(?:[\d,.]+\+?\s+)?([^.!?\n,;:]{4,100})/gi),
  ]
    .map((match) => cleanAudiencePhrase(match[1]))
    .filter((value): value is string => Boolean(value));

  return uniqueText(matches).slice(0, 4);
}

function cleanAudiencePhrase(value: string | undefined): string | undefined {
  let phrase = cleanText(value);
  if (!phrase) return undefined;

  phrase = phrase.replace(/^(?:the|a|an|our|your)\s+/i, '');
  phrase = phrase.replace(/^[\d,.]+\+?\s+/, '');
  phrase = phrase.split(/\s+(?:to|who|that|with|using|through|via|into|by|from)\s+/i)[0] ?? phrase;
  phrase = phrase.split(/\s+(?:turn|build|launch|improve|ship|create|grow|scale|manage|make|cut|drive|unlock)\b/i)[0] ?? phrase;
  phrase = phrase.replace(/\b(?:fast|faster|trusted|simple|easy|better)\s*$/i, '');
  phrase = cleanText(phrase);
  if (!phrase || phrase.length < 4 || phrase.length > 64) return undefined;
  if (/\b(book|start|get|try|request|schedule|download|subscribe)\b/i.test(phrase)) return undefined;

  return phrase;
}

export function inferProofStyle(text: string): BrandProofStyle {
  const lower = text.toLowerCase();
  if (/(roi|metric|percent|analytics|report|data)/.test(lower)) return 'metrics';
  if (/(testimonial|customer|case study|trusted by)/.test(lower)) return 'testimonial';
  if (/(certified|expert|authority|compliance|secure)/.test(lower)) return 'authority';
  if (/(community|members|creators)/.test(lower)) return 'community';
  if (/(demo|tour|tutorial|watch)/.test(lower)) return 'demo';
  if (/(editorial|newsletter|journal)/.test(lower)) return 'editorial';
  return 'unknown';
}

export function inferHookArchetypes(headings: string[]): string[] {
  const joined = headings.join(' ').toLowerCase();
  const hooks: string[] = [];
  if (/\d+%|\d+x|\broi\b/.test(joined)) hooks.push('metric-led hook');
  if (/\bwithout\b|\bstop\b|\bnever\b/.test(joined)) hooks.push('pain-removal hook');
  if (/\bhow\b|\bguide\b|\blearn\b/.test(joined)) hooks.push('education hook');
  if (/\btrusted\b|\bcustomer\b|\bcase\b/.test(joined)) hooks.push('proof-led hook');
  return hooks;
}

export function inferTypographyCategory(text: string): BrandSignalProfile['typography']['category']['value'] {
  const lower = text.toLowerCase();
  if (!lower) return 'unknown';
  if (/mono|code|console/.test(lower)) return 'mono';
  if (/slab/.test(lower)) return 'slab';
  if (/display|headline/.test(lower)) return 'display';
  if (/serif/.test(lower) && !/sans/.test(lower)) return 'serif';
  if (/sans|inter|arial|helvetica|system/.test(lower)) return 'sans';
  return 'mixed';
}

export function inferCasingBias(headings: string[]): BrandSignalProfile['typography']['casingBias']['value'] {
  const meaningful = headings.filter((heading) => heading.length > 3);
  if (!meaningful.length) return 'unknown';
  const uppercase = meaningful.filter((heading) => heading === heading.toUpperCase()).length;
  const lowercase = meaningful.filter((heading) => heading === heading.toLowerCase()).length;
  if (uppercase / meaningful.length > 0.5) return 'uppercase';
  if (lowercase / meaningful.length > 0.5) return 'lowercase';
  return 'mixed';
}

export function score(text: string, positive: string[], negative: string[]): number {
  const lower = text.toLowerCase();
  const pos = positive.filter((word) => lower.includes(word)).length;
  const neg = negative.filter((word) => lower.includes(word)).length;
  return clamp01(0.5 + pos * 0.15 - neg * 0.15);
}

export function titleBrand(title?: string): string | undefined {
  return cleanText(title?.split(/\s[|\-]\s/)[0]);
}

export function domainBrand(host: string): string {
  return host.split('.')[0].split('-').map((part) => part.charAt(0).toUpperCase() + part.slice(1)).join(' ');
}

export function cleanText(value: string | null | undefined): string | undefined {
  const cleaned = value?.replace(/\s+/g, ' ').trim();
  return cleaned || undefined;
}

export function firstDefined<T>(...values: Array<T | undefined>): T {
  const value = values.find((item) => item !== undefined);
  if (value === undefined) throw new Error('Expected at least one value.');
  return value;
}

export function uniqueText(values: Array<string | undefined>): string[] {
  return [...new Set(values.map((value) => cleanText(value)).filter((value): value is string => Boolean(value)))];
}

export function stringifyExcerpt(value: unknown): string | undefined {
  if (typeof value === 'string') return value;
  if (Array.isArray(value)) return value.join(', ');
  if (value === undefined || value === null) return undefined;
  return String(value);
}

export function chooseAccent(colors: string[], primary?: string): string | undefined {
  return colors
    .filter((color) => color !== primary && contrastRatio(color, DARK_SURFACE) >= 3)
    .sort((a, b) => saturation(b) - saturation(a))[0] ?? colors.find((color) => color !== primary);
}

export function inferContrastBias(colors: string[]): number {
  if (!colors.length) return 0.5;
  const avg = colors.reduce((sum, color) => sum + Math.max(contrastRatio(color, DARK_SURFACE), contrastRatio(color, LIGHT_SURFACE)), 0) / colors.length;
  return clamp01((avg - 1) / 10);
}

export function inferHarmony(primary?: string, accent?: string): BrandPaletteHarmony {
  if (!primary || !accent || primary === accent) return 'unknown';
  const diff = hueDiff(hue(primary), hue(accent));
  if (diff < 25) return 'monochromatic';
  if (diff < 70) return 'analogous';
  if (diff > 150 && diff < 210) return 'complementary';
  if (diff > 130 && diff <= 150) return 'split-complementary';
  if (diff > 100 && diff < 130) return 'triadic';
  return 'unknown';
}

export function contrastRatio(a: string, b: string): number {
  const l1 = luminance(a);
  const l2 = luminance(b);
  const light = Math.max(l1, l2);
  const dark = Math.min(l1, l2);
  return (light + 0.05) / (dark + 0.05);
}

export function saturation(hex: string): number {
  return hsl(hex)[1];
}

export function clamp01(value: number): number {
  return Math.max(0, Math.min(1, value));
}

export function nextEvidenceId(count: number, path: string): string {
  return `website_e${count + 1}_${path.replace(/[^a-z0-9]+/gi, '_')}`;
}

function meta($: ReturnType<typeof load>, keys: string[]): string | undefined {
  const wanted = new Set(keys.map((key) => key.toLowerCase()));
  let value: string | undefined;
  $('meta').each((_, el) => {
    if (value) return;
    const node = $(el);
    const key = (node.attr('name') ?? node.attr('property') ?? '').toLowerCase();
    if (wanted.has(key)) value = cleanText(node.attr('content'));
  });
  return value;
}

function extractJsonLd(blocks: string[]): Record<string, unknown>[] {
  const objects: Record<string, unknown>[] = [];
  for (const block of blocks) {
    try {
      collectJsonObjects(JSON.parse(block) as unknown, objects);
    } catch {
      continue;
    }
  }
  return objects;
}

function collectJsonObjects(value: unknown, output: Record<string, unknown>[]): void {
  if (Array.isArray(value)) {
    for (const item of value) collectJsonObjects(item, output);
    return;
  }
  if (!isRecord(value)) return;
  output.push(value);
  if ('@graph' in value) collectJsonObjects(value['@graph'], output);
}

function chooseSchemaObject(objects: Record<string, unknown>[]): Record<string, unknown> | undefined {
  return objects.find((obj) => readTypes(obj).some((type) => /organization|localbusiness|corporation|product|brand/i.test(type))) ?? objects[0];
}

function extractColors($: ReturnType<typeof load>): string[] {
  const scores = new Map<string, number>();
  const add = (value: string | undefined, weight: number): void => {
    if (!value) return;
    for (const color of colorsFromText(value)) scores.set(color, (scores.get(color) ?? 0) + weight);
  };

  $('meta[name="theme-color"],meta[property="theme-color"]').each((_, el) => add($(el).attr('content'), 10));
  $('style').each((_, el) => add($(el).text(), 2));
  $('[style]').each((_, el) => add($(el).attr('style'), 3));

  return [...scores.entries()]
    .sort((a, b) => b[1] - a[1])
    .map(([color]) => color)
    .slice(0, 16);
}

function extractFonts($: ReturnType<typeof load>): string[] {
  const chunks = [
    ...$('style').map((_, el) => $(el).text()).get(),
    ...$('[style]').map((_, el) => $(el).attr('style') ?? '').get(),
  ];
  const fonts: string[] = [];
  for (const chunk of chunks) {
    for (const match of chunk.matchAll(/font-family\s*:\s*([^;}]+)/gi)) {
      const family = cleanText(match[1]?.split(',')[0]?.replace(/["']/g, ''));
      if (family && !/^(system-ui|sans-serif|serif|monospace)$/i.test(family)) fonts.push(family);
    }
  }
  return uniqueText(fonts).slice(0, 8);
}

function colorsFromText(text: string): string[] {
  const colors: string[] = [];
  for (const match of text.matchAll(/#[0-9a-f]{3,8}\b/gi)) {
    const normalized = normalizeHex(match[0]);
    if (normalized) colors.push(normalized);
  }
  for (const match of text.matchAll(/rgba?\(\s*(\d{1,3})\s*,\s*(\d{1,3})\s*,\s*(\d{1,3})(?:\s*,\s*[\d.]+)?\s*\)/gi)) {
    colors.push(rgbToHex(Number(match[1]), Number(match[2]), Number(match[3])));
  }
  return uniqueText(colors);
}

function readString(obj: Record<string, unknown> | undefined, key: string): string | undefined {
  if (!obj) return undefined;
  const value = obj[key];
  if (typeof value === 'string') return cleanText(value);
  if (isRecord(value) && typeof value['@value'] === 'string') return cleanText(value['@value']);
  return undefined;
}

function readLogo(obj: Record<string, unknown> | undefined): string | undefined {
  if (!obj) return undefined;
  const logo = obj.logo;
  if (typeof logo === 'string') return cleanText(logo);
  if (isRecord(logo)) return readString(logo, 'url') ?? readString(logo, 'contentUrl');
  return undefined;
}

function readTypes(obj: Record<string, unknown> | undefined): string[] {
  if (!obj) return [];
  const value = obj['@type'];
  if (typeof value === 'string') return [value];
  if (Array.isArray(value)) return value.filter((item): item is string => typeof item === 'string');
  return [];
}

function normalizeHex(value: string): string | undefined {
  const hex = value.trim().toLowerCase();
  if (/^#[0-9a-f]{8}$/.test(hex)) return hex.slice(0, 7);
  if (/^#[0-9a-f]{6}$/.test(hex)) return hex;
  if (/^#[0-9a-f]{3}$/.test(hex)) return `#${hex[1]}${hex[1]}${hex[2]}${hex[2]}${hex[3]}${hex[3]}`;
  return undefined;
}

function rgbToHex(r: number, g: number, b: number): string {
  return `#${[r, g, b].map((channel) => Math.max(0, Math.min(255, channel)).toString(16).padStart(2, '0')).join('')}`;
}

function hue(hex: string): number {
  return hsl(hex)[0];
}

function hueDiff(a: number, b: number): number {
  const diff = Math.abs(a - b) % 360;
  return diff > 180 ? 360 - diff : diff;
}

function luminance(hex: string): number {
  const [r, g, b] = rgb(hex).map((v) => {
    const c = v / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

function hsl(hex: string): [number, number, number] {
  const [r, g, b] = rgb(hex).map((v) => v / 255);
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const l = (max + min) / 2;
  if (max === min) return [0, 0, l];
  const d = max - min;
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
  const h = max === r ? ((g - b) / d + (g < b ? 6 : 0)) : max === g ? (b - r) / d + 2 : (r - g) / d + 4;
  return [h * 60, s, l];
}

function rgb(hex: string): [number, number, number] {
  return [parseInt(hex.slice(1, 3), 16), parseInt(hex.slice(3, 5), 16), parseInt(hex.slice(5, 7), 16)];
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value));
}

function hash(value: string): number {
  return value.split('').reduce((acc, char) => ((acc << 5) - acc + char.charCodeAt(0)) | 0, 0);
}
