import type {
  BrandVaultTextEvidenceCompiler,
  BrandVaultTextEvidenceCompilerInput,
} from './brand-vault-draft-orchestrator';
import type {
  BrandEvidenceCandidate,
  BrandEvidenceCandidateSourceType,
  BrandVaultSourceInput,
  BrandWebsiteSnapshot,
} from './brand-website-refinery-types';
import { sanitizeEvidenceExcerpt } from './brand-signal-profile';

type BrandVaultTextCompilerFetch = (input: string, init?: RequestInit) => Promise<Response>;

type CompilerSignalPath =
  | 'identity.audience'
  | 'identity.productServices'
  | 'identity.proofStyle'
  | 'voice.recurringPhrases'
  | 'voice.hookArchetypes'
  | 'voice.ctaDirectness';

interface CompilerOptions {
  apiKey: string;
  model?: string;
  seed?: number;
  fetchFn?: BrandVaultTextCompilerFetch;
}

interface CompilerOutputCandidate {
  signalPath?: unknown;
  normalizedValue?: unknown;
  excerpt?: unknown;
  sourceField?: unknown;
  sourceUrl?: unknown;
  confidence?: unknown;
}

interface TextEvidenceItem {
  sourceField: string;
  sourceType: BrandEvidenceCandidateSourceType;
  sourceUrl?: string;
  text: string;
}

interface CompilerCandidateNormalizationResult {
  candidates: BrandEvidenceCandidate[];
  rejectedCount: number;
}

const DEFAULT_GEMINI_MODEL = 'gemini-2.5-flash-lite';
const DEFAULT_COMPILER_SEED = 11;
const COMPILER_EXTRACTOR_SOURCE = 'brand-vault-text-evidence-compiler.gemini';
const MAX_PROMPT_CHARS = 18_000;
const MAX_REPAIR_PROMPT_CHARS = 6_000;
const MAX_TEXT_BLOCK_CHARS = 1_600;
const MAX_CANDIDATES = 12;
const SIGNAL_PATHS = new Set<CompilerSignalPath>([
  'identity.audience',
  'identity.productServices',
  'identity.proofStyle',
  'voice.recurringPhrases',
  'voice.hookArchetypes',
  'voice.ctaDirectness',
]);
const PROOF_STYLES = new Set(['testimonial', 'metrics', 'authority', 'community', 'demo', 'editorial']);

export function createBrandVaultTextEvidenceCompilerFromEnvironment(args: {
  env?: NodeJS.ProcessEnv;
  fetchFn?: BrandVaultTextCompilerFetch;
} = {}): BrandVaultTextEvidenceCompiler | undefined {
  const env = args.env ?? process.env;
  if (env.BRAND_VAULT_TEXT_COMPILER_ENABLED !== 'true') return undefined;
  const apiKey = geminiApiKeyFromEnv(env);
  if (!apiKey) return undefined;
  return createBrandVaultGeminiTextEvidenceCompiler({
    apiKey,
    model: env.BRAND_VAULT_TEXT_COMPILER_MODEL,
    fetchFn: args.fetchFn,
  });
}

export function createBrandVaultGeminiTextEvidenceCompiler(options: CompilerOptions): BrandVaultTextEvidenceCompiler {
  const fetchFn = options.fetchFn ?? fetch;
  const model = options.model?.trim() || DEFAULT_GEMINI_MODEL;
  const seed = options.seed ?? DEFAULT_COMPILER_SEED;

  return async (input) => {
    if (!hasUsefulTextEvidence(input)) return { candidates: [], warnings: [] };

    const endpoint = new URL(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`);
    endpoint.searchParams.set('key', options.apiKey);

    const response = await fetchFn(endpoint.href, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: COMPILER_SYSTEM_INSTRUCTION }] },
        contents: [{ role: 'user', parts: [{ text: buildCompilerUserContent(input) }] }],
        generationConfig: {
          temperature: 0,
          maxOutputTokens: 1600,
          responseMimeType: 'application/json',
          seed,
        },
      }),
    });

    if (!response.ok) {
      return {
        candidates: [],
        warnings: [`Brand Vault text evidence compiler skipped: Gemini returned HTTP ${response.status}.`],
      };
    }

    const payload = await readGeminiPayload(response);
    if (!payload) {
      return {
        candidates: [],
        warnings: ['Brand Vault text evidence compiler skipped: Gemini returned a malformed API response.'],
      };
    }

    const text = extractGeminiText(payload);
    if (!text) return { candidates: [], warnings: ['Brand Vault text evidence compiler skipped: Gemini returned no JSON text.'] };

    const parsedResult = await parseCompilerJsonWithRepair({
      text,
      endpointHref: endpoint.href,
      fetchFn,
      seed,
    });
    if (!parsedResult.parsed) {
      return {
        candidates: [],
        warnings: [
          'Brand Vault text evidence compiler skipped: Gemini returned invalid JSON.',
          ...parsedResult.warnings,
        ],
      };
    }

    const normalized = compilerOutputToCandidates(parsedResult.parsed, input);
    if (normalized.candidates.length === 0) {
      return {
        candidates: [],
        warnings: [
          ...parsedResult.warnings,
          'Brand Vault text evidence compiler produced no accepted evidence-grounded candidates.',
          ...(normalized.rejectedCount > 0
            ? [`Brand Vault text evidence compiler discarded ${normalized.rejectedCount} unsupported, duplicate, or ungrounded candidate${normalized.rejectedCount === 1 ? '' : 's'}.`]
            : []),
        ],
      };
    }

    return {
      candidates: normalized.candidates,
      warnings: [
        ...parsedResult.warnings,
        'Brand Vault text evidence compiler produced inferred review candidates from website and source evidence.',
        ...(normalized.rejectedCount > 0
          ? [`Brand Vault text evidence compiler discarded ${normalized.rejectedCount} unsupported, duplicate, or ungrounded candidate${normalized.rejectedCount === 1 ? '' : 's'}.`]
          : []),
      ],
    };
  };
}

const COMPILER_SYSTEM_INSTRUCTION = `<role>
You are Brand Vault's evidence compiler. From raw evidence gathered across a brand's website, crawled pages, uploads, and social posts (including image OCR and video transcripts), you extract a small set of reusable, evidence-grounded brand SIGNALS.
The brand can be ANY kind: SaaS, e-commerce/DTC, local service, agency or consultancy, creator/media/publisher, nonprofit, personal brand, or marketplace. Never assume software or B2B; read each brand on its own terms.
</role>

<signals>
Emit ONLY these signalPaths, each mapped to the brand's own domain:
- identity.audience: the specific people or organizations the brand serves, concrete to its category (e.g. "RevOps leaders", "first-time home buyers", "families with toddlers", "indie game studios", "local homeowners"). Reject bare generic words used alone: businesses, customers, users, people, everyone, brands.
- identity.productServices: what the brand actually offers, in its own terms — software capabilities, product lines or categories, services, programs or causes (nonprofit), shows/channels/newsletters (creator), courses or coaching (personal brand). Concrete offerings or named categories only; never CTAs, audiences, proof claims, page labels, or bare words like "software"/"services"/"products" alone.
- identity.proofStyle: how the brand earns trust. Exactly ONE of: testimonial, metrics, authority, community, demo, editorial.
- voice.recurringPhrases: brand language the brand REPEATS as its own — taglines, slogans, signature lines, repeated CTAs. A phrase QUALIFIES ONLY IF it recurs: it appears in 2 or more evidence blocks, OR is clearly a fixed brand line (a site header, navigation, or footer tagline). It does NOT qualify if it appears in only one place — especially a single video transcript or a single post — no matter how catchy or quotable. Never output a full spoken sentence. Prefer short fragments of 6 words or fewer.
- voice.hookArchetypes: compact labels for how the brand opens or hooks attention: statement-led, question, contrast, metric-led, story-led, demo-led, list-led, how-to.
- voice.ctaDirectness: a number from 0 to 1 for how blunt the calls-to-action are (0 = soft or none, 1 = direct imperative). Only when CTA language is present.
</signals>

<rules>
- Use ONLY the supplied evidence. Never invent facts or infer beyond the text.
- Ground every candidate: its sourceField MUST exactly match one sourceField from the evidence, and the excerpt must come from that block.
- OCR and transcripts are valid evidence, but a single transcript or post counts as ONE source; on its own it cannot establish a recurring phrase or a brand-wide claim.
- confidence is 0.42 to 0.68: use the low end for single-source or weak evidence, the high end only for strong, repeated, owned-site evidence.
- Precision over recall: if the evidence does not clearly support a signal, OMIT it. Emit at most 12 candidates; prefer a few strong signals over many weak ones.
- Do not summarize the company. Emit reusable signals only.
</rules>

<output_format>
Return a single JSON object, with no Markdown fences and no prose:
{"candidates":[{"signalPath":"identity.audience|identity.productServices|identity.proofStyle|voice.recurringPhrases|voice.hookArchetypes|voice.ctaDirectness","normalizedValue":string|string[]|number,"excerpt":"short quote or paraphrase from the cited block","sourceField":"exact supplied sourceField","sourceUrl":"optional supplied source URL","confidence":0.42-0.68}]}
</output_format>`;

function buildCompilerUserContent(input: BrandVaultTextEvidenceCompilerInput): string {
  const evidence = collectTextEvidence(input);
  return truncateText(`<brand>
brandId: ${input.input.brandId ?? 'unknown'}
companyName: ${input.input.companyName ?? 'unknown'}
website: ${input.website.normalizedUrl}
</brand>

<evidence>
${evidence.map((item, index) => `[${index + 1}] sourceField=${item.sourceField} sourceType=${item.sourceType}${item.sourceUrl ? ` sourceUrl=${item.sourceUrl}` : ''}
${item.text}`).join('\n\n')}
</evidence>

Based only on the evidence above, return the JSON now.`, MAX_PROMPT_CHARS);
}

function collectTextEvidence(input: BrandVaultTextEvidenceCompilerInput): TextEvidenceItem[] {
  const items: TextEvidenceItem[] = [];
  addSnapshotEvidence(items, input.website, 'website.root');
  input.crawlSnapshots.slice(0, 10).forEach((snapshot, index) => addSnapshotEvidence(items, snapshot, `crawl.${index + 1}`));
  input.sourceEvidence.slice(0, 20).forEach((source, index) => {
    const text = sourceText(source);
    if (text) {
      items.push({
        sourceField: `sourceEvidence.${index}.${source.kind}`,
        sourceType: source.kind,
        sourceUrl: source.url,
        text,
      });
    }
  });
  return items.slice(0, 24);
}

function addSnapshotEvidence(
  items: TextEvidenceItem[],
  snapshot: BrandWebsiteSnapshot,
  sourceField: string,
): void {
  const text = visibleText(snapshot.html);
  if (text) items.push({ sourceField, sourceType: 'website', sourceUrl: snapshot.normalizedUrl, text });
  for (const supplemental of snapshot.supplementalText ?? []) {
    const supplementalText = cleanText(supplemental.text);
    if (supplementalText) {
      items.push({
        sourceField: supplemental.sourceField,
        sourceType: 'website',
        sourceUrl: supplemental.sourceUrl ?? snapshot.normalizedUrl,
        text: supplementalText,
      });
    }
  }
}

function sourceText(source: BrandVaultSourceInput): string {
  if (source.kind === 'social_post' || source.kind === 'social_profile') return socialSourceText(source);
  return cleanText([
    source.name,
    source.note,
    source.text,
    source.profile?.bio,
    source.profile?.category,
    source.media?.ocrText,
    source.media?.transcript,
    source.publishedAt ? `Published: ${source.publishedAt}` : undefined,
    source.metrics?.engagementCount ? `Engagement: ${source.metrics.engagementCount}` : undefined,
  ].filter(Boolean).join('\n'));
}

function socialSourceText(source: BrandVaultSourceInput): string {
  return cleanText([
    source.text,
    source.profile?.bio ? `Profile bio: ${source.profile.bio}` : undefined,
    source.profile?.category ? `Profile category: ${source.profile.category}` : undefined,
    source.media?.ocrText ? `Media OCR: ${source.media.ocrText}` : undefined,
    source.media?.transcript ? `Media transcript: ${source.media.transcript}` : undefined,
    source.publishedAt ? `Published: ${source.publishedAt}` : undefined,
    source.metrics?.engagementCount ? `Engagement: ${source.metrics.engagementCount}` : undefined,
  ].filter(Boolean).join('\n'));
}

function visibleText(html: string): string {
  return cleanText(html
    .replace(/<script\b[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style\b[\s\S]*?<\/style>/gi, ' ')
    .replace(/<noscript\b[\s\S]*?<\/noscript>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&'));
}

function cleanText(value: string | undefined): string {
  return truncateText((value ?? '').replace(/\s+/g, ' ').trim(), MAX_TEXT_BLOCK_CHARS);
}

function hasUsefulTextEvidence(input: BrandVaultTextEvidenceCompilerInput): boolean {
  return collectTextEvidence(input).some((item) => item.text.length >= 40);
}

function compilerOutputToCandidates(
  parsed: unknown,
  input: BrandVaultTextEvidenceCompilerInput,
): CompilerCandidateNormalizationResult {
  const record = asRecord(parsed);
  const rawCandidates = Array.isArray(record.candidates) ? record.candidates : [];
  const evidenceBySourceField = new Map(collectTextEvidence(input).map((item) => [item.sourceField, item]));
  const candidates: BrandEvidenceCandidate[] = [];
  let rejectedCount = 0;
  const seen = new Set<string>();
  for (const rawCandidate of rawCandidates.slice(0, MAX_CANDIDATES)) {
    const candidate = normalizeCompilerCandidate(rawCandidate, input, candidates.length, evidenceBySourceField);
    if (!candidate) {
      rejectedCount += 1;
      continue;
    }
    const dedupeKey = compilerCandidateDedupeKey(candidate);
    if (seen.has(dedupeKey)) {
      rejectedCount += 1;
      continue;
    }
    seen.add(dedupeKey);
    candidates.push(candidate);
  }
  return { candidates, rejectedCount };
}

function normalizeCompilerCandidate(
  rawCandidate: unknown,
  input: BrandVaultTextEvidenceCompilerInput,
  index: number,
  evidenceBySourceField: Map<string, TextEvidenceItem>,
): BrandEvidenceCandidate | null {
  const record = asRecord(rawCandidate) as CompilerOutputCandidate;
  const signalPath = typeof record.signalPath === 'string' && SIGNAL_PATHS.has(record.signalPath as CompilerSignalPath)
    ? record.signalPath as CompilerSignalPath
    : null;
  if (!signalPath) return null;

  const normalizedValue = normalizeCandidateValue(signalPath, record.normalizedValue);
  if (normalizedValue === undefined) return null;

  const sourceField = typeof record.sourceField === 'string' ? record.sourceField.trim() : '';
  const evidence = evidenceBySourceField.get(sourceField);
  if (!evidence) return null;

  const confidence = typeof record.confidence === 'number' && Number.isFinite(record.confidence)
    ? Math.min(Math.max(record.confidence, 0.42), 0.68)
    : 0.58;
  const sourceUrl = evidence.sourceUrl ?? input.website.normalizedUrl;

  return {
    id: `candidate_text_compiler_raw_${index + 1}`,
    brandId: input.input.brandId,
    jobId: input.jobId,
    sourceType: evidence.sourceType,
    sourceUrl,
    sourceField,
    signalPath,
    rawValue: record.normalizedValue,
    normalizedValue,
    excerpt: typeof record.excerpt === 'string' ? sanitizeEvidenceExcerpt(record.excerpt, 180) : sanitizeEvidenceExcerpt(evidence.text, 180),
    confidence,
    authorityClass: 'inferred',
    observedAt: input.observedAt,
    extractorId: COMPILER_EXTRACTOR_SOURCE,
  };
}

function compilerCandidateDedupeKey(candidate: BrandEvidenceCandidate): string {
  return [
    candidate.sourceField,
    candidate.signalPath,
    stableStringify(candidate.normalizedValue),
  ].join('|');
}

function normalizeCandidateValue(signalPath: CompilerSignalPath, value: unknown): string[] | string | number | undefined {
  if (signalPath === 'voice.ctaDirectness') {
    return typeof value === 'number' && Number.isFinite(value) ? Math.min(Math.max(value, 0), 1) : undefined;
  }
  if (signalPath === 'identity.proofStyle') {
    const proofStyle = typeof value === 'string' ? value.trim().toLowerCase() : '';
    return PROOF_STYLES.has(proofStyle) ? proofStyle : undefined;
  }
  const values = Array.isArray(value) ? value : typeof value === 'string' ? [value] : [];
  const normalized = values
    .map((item) => typeof item === 'string' ? sanitizeEvidenceExcerpt(item, 90) : '')
    .filter((item) => item.length >= 3);
  const filtered = signalPath === 'identity.productServices'
    ? normalized.filter(isCompilerProductServiceValue)
    : signalPath === 'voice.recurringPhrases'
      ? normalized.filter(isCompilerRecurringPhraseValue)
      : normalized.filter((item) => !/^(?:businesses|users|customers|people|everyone|brands?)$/i.test(item));
  return filtered.length > 0 ? Array.from(new Set(filtered)).slice(0, 8) : undefined;
}

function isCompilerProductServiceValue(value: string): boolean {
  if (value.length < 4 || value.length > 96) return false;
  if (/^(?:products?|services?|solutions?|features?|collections?|home|about|contact|pricing|software|platform|app|tool|tools)$/i.test(value)) {
    return false;
  }
  if (/\b(?:shop now|add to cart|buy now|wishlist|no reviews?|mrp|price|sale|discount|select size|checkout|cart|book a demo|get started|contact sales|learn more)\b/i.test(value)) {
    return false;
  }
  if (/^https?:\/\//i.test(value) || /[{}<>]|(?:document\.|window\.|function\s*\(|=>)/.test(value)) return false;
  if (/^(?:agenc(?:y|ies)|creative teams?|founders?|operators?|customers?|users|businesses|brands?)$/i.test(value)) return false;
  return true;
}

function isCompilerRecurringPhraseValue(value: string): boolean {
  const trimmed = value.trim();
  if (trimmed.length < 3 || trimmed.length > 80) return false;
  // Recurrence itself is enforced in the prompt (the model sees every evidence
  // block). This backstop only drops gross non-phrases: long narration or full
  // spoken sentences that are clearly not a reusable brand line.
  if (trimmed.split(/\s+/).length > 9) return false;
  if (/^https?:\/\//i.test(trimmed) || /[{}<>]|(?:document\.|window\.|function\s*\(|=>)/.test(trimmed)) return false;
  return true;
}

function extractGeminiText(payload: unknown): string | undefined {
  const record = asRecord(payload);
  const candidates = Array.isArray(record.candidates) ? record.candidates : [];
  for (const candidate of candidates) {
    const content = asRecord(asRecord(candidate).content);
    const parts = Array.isArray(content.parts) ? content.parts : [];
    const text = parts.map((part) => asRecord(part).text).find((value) => typeof value === 'string' && value.trim());
    if (typeof text === 'string') return text;
  }
  return undefined;
}

async function readGeminiPayload(response: Response): Promise<unknown | null> {
  try {
    return await response.json();
  } catch {
    return null;
  }
}

async function parseCompilerJsonWithRepair(args: {
  text: string;
  endpointHref: string;
  fetchFn: BrandVaultTextCompilerFetch;
  seed: number;
}): Promise<{ parsed: unknown | null; warnings: string[] }> {
  const parsed = parseCompilerJson(args.text);
  if (parsed) return { parsed, warnings: [] };

  const repaired = await repairCompilerJsonWithGemini(args);
  if (!repaired.parsed) return repaired;

  return {
    parsed: repaired.parsed,
    warnings: ['Brand Vault text evidence compiler repaired malformed Gemini JSON before applying signal gates.'],
  };
}

async function repairCompilerJsonWithGemini(args: {
  text: string;
  endpointHref: string;
  fetchFn: BrandVaultTextCompilerFetch;
  seed: number;
}): Promise<{ parsed: unknown | null; warnings: string[] }> {
  let response: Response;
  try {
    response = await args.fetchFn(args.endpointHref, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        contents: [{ role: 'user', parts: [{ text: buildCompilerJsonRepairPrompt(args.text) }] }],
        generationConfig: {
          temperature: 0,
          maxOutputTokens: 1200,
          responseMimeType: 'application/json',
          seed: args.seed,
        },
      }),
    });
  } catch {
    return {
      parsed: null,
      warnings: ['Brand Vault text evidence compiler JSON repair skipped: Gemini repair request failed.'],
    };
  }

  if (!response.ok) {
    return {
      parsed: null,
      warnings: [`Brand Vault text evidence compiler JSON repair skipped: Gemini returned HTTP ${response.status}.`],
    };
  }

  const payload = await readGeminiPayload(response);
  if (!payload) {
    return {
      parsed: null,
      warnings: ['Brand Vault text evidence compiler JSON repair skipped: Gemini returned a malformed API response.'],
    };
  }

  const text = extractGeminiText(payload);
  if (!text) {
    return {
      parsed: null,
      warnings: ['Brand Vault text evidence compiler JSON repair skipped: Gemini returned no JSON text.'],
    };
  }

  return { parsed: parseCompilerJson(text), warnings: [] };
}

function buildCompilerJsonRepairPrompt(rawText: string): string {
  return truncateText(`Repair the following Brand Vault model output into strict JSON.

Return only this JSON shape:
{"candidates":[{"signalPath":"identity.audience|identity.productServices|identity.proofStyle|voice.recurringPhrases|voice.hookArchetypes|voice.ctaDirectness","normalizedValue":string|string[]|number,"excerpt":"short evidence quote/paraphrase","sourceField":"exact supplied sourceField","sourceUrl":"optional supplied source URL","confidence":0.42-0.68}]}

Rules:
- Preserve only candidate fields already present in the malformed output.
- Do not invent new candidates, evidence, sourceField values, or sourceUrl values.
- Drop any candidate that cannot be represented in the required shape.
- Return the JSON object directly, with no Markdown fences or prose.

Malformed output:
${rawText}`, MAX_REPAIR_PROMPT_CHARS);
}

function parseCompilerJson(text: string): unknown | null {
  for (const candidate of compilerJsonCandidates(text)) {
    const parsed = parseJsonCandidate(candidate);
    const normalized = normalizeParsedCompilerJson(parsed);
    if (normalized) return normalized;
  }
  return null;
}

function compilerJsonCandidates(text: string): string[] {
  const stripped = stripJsonMarkdown(text);
  return uniqueStrings([
    stripped,
    ...extractFencedJsonBlocks(stripped),
    extractBalancedJsonObject(stripped),
    extractCandidatesArrayJson(stripped),
    stripped.match(/\{[\s\S]*\}/)?.[0],
  ]);
}

function parseJsonCandidate(value: string): unknown | null {
  for (const candidate of uniqueStrings([value, repairCommonJson(value)])) {
    try {
      return JSON.parse(candidate);
    } catch {
      // Try the next normalized representation before giving up.
    }
  }
  return null;
}

function normalizeParsedCompilerJson(value: unknown): unknown | null {
  if (isCompilerOutputObject(value)) return value;
  if (Array.isArray(value)) return { candidates: value };
  if (typeof value === 'string' && value.trim() && value.trim() !== value) return parseCompilerJson(value.trim());
  if (typeof value === 'string' && /^[{[]/.test(value.trim())) return parseCompilerJson(value.trim());
  return null;
}

function isCompilerOutputObject(value: unknown): boolean {
  const record = asRecord(value);
  return Array.isArray(record.candidates);
}

function stripJsonMarkdown(value: string): string {
  const trimmed = value.replace(/^\uFEFF/, '').trim();
  const fenced = trimmed.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/i);
  return (fenced?.[1] ?? trimmed).trim();
}

function extractFencedJsonBlocks(value: string): string[] {
  return Array.from(value.matchAll(/```(?:json)?\s*([\s\S]*?)\s*```/gi))
    .map((match) => match[1]);
}

function extractCandidatesArrayJson(value: string): string | undefined {
  const match = value.match(/\[[\s\S]*\]/);
  return match?.[0];
}

function repairCommonJson(value: string): string {
  return value
    .replace(/[\u201c\u201d]/g, '"')
    .replace(/[\u2018\u2019]/g, "'")
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/(^|[^:])\/\/.*$/gm, '$1')
    .replace(/([{,]\s*)([A-Za-z_][A-Za-z0-9_-]*)\s*:/g, '$1"$2":')
    .replace(/,\s*([}\]])/g, '$1');
}

function extractBalancedJsonObject(value: string): string | undefined {
  const start = value.indexOf('{');
  if (start < 0) return undefined;

  let depth = 0;
  let inString = false;
  let escaped = false;
  for (let index = start; index < value.length; index += 1) {
    const char = value[index];
    if (escaped) {
      escaped = false;
      continue;
    }
    if (char === '\\' && inString) {
      escaped = true;
      continue;
    }
    if (char === '"') {
      inString = !inString;
      continue;
    }
    if (inString) continue;
    if (char === '{') depth += 1;
    if (char === '}') depth -= 1;
    if (depth === 0) return value.slice(start, index + 1);
  }
  return undefined;
}

function uniqueStrings(values: Array<string | undefined>): string[] {
  return Array.from(new Set(values.map((value) => value?.trim()).filter((value): value is string => Boolean(value))));
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function geminiApiKeyFromEnv(env: NodeJS.ProcessEnv): string | undefined {
  return env.GEMINI_API_KEY?.trim() || env.GOOGLE_API_KEY?.trim() || env.GOOGLE_GENERATIVE_AI_API_KEY?.trim() || undefined;
}

function stableStringify(value: unknown): string {
  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
}

function truncateText(value: string, maxLength: number): string {
  return value.length > maxLength ? `${value.slice(0, maxLength).trim()}...` : value;
}
