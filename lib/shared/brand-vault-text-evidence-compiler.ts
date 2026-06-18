import type {
  BrandVaultTextEvidenceCompiler,
  BrandVaultTextEvidenceCompilerInput,
  BrandVaultTextEvidenceCompilerResult,
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
  | 'identity.proofStyle'
  | 'voice.recurringPhrases'
  | 'voice.hookArchetypes'
  | 'voice.ctaDirectness';

interface CompilerOptions {
  apiKey: string;
  model?: string;
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
const COMPILER_EXTRACTOR_SOURCE = 'brand-vault-text-evidence-compiler.gemini';
const MAX_PROMPT_CHARS = 18_000;
const MAX_TEXT_BLOCK_CHARS = 1_600;
const MAX_CANDIDATES = 12;
const SIGNAL_PATHS = new Set<CompilerSignalPath>([
  'identity.audience',
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

  return async (input) => {
    if (!hasUsefulTextEvidence(input)) return { candidates: [], warnings: [] };

    const endpoint = new URL(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`);
    endpoint.searchParams.set('key', options.apiKey);

    const response = await fetchFn(endpoint.href, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        contents: [{ role: 'user', parts: [{ text: buildCompilerPrompt(input) }] }],
        generationConfig: {
          temperature: 0,
          maxOutputTokens: 1600,
          responseMimeType: 'application/json',
        },
      }),
    });

    if (!response.ok) {
      return {
        candidates: [],
        warnings: [`Brand Vault text evidence compiler skipped: Gemini returned HTTP ${response.status}.`],
      };
    }

    const payload = await response.json();
    const text = extractGeminiText(payload);
    if (!text) return { candidates: [], warnings: ['Brand Vault text evidence compiler skipped: Gemini returned no JSON text.'] };

    const parsed = parseCompilerJson(text);
    if (!parsed) return { candidates: [], warnings: ['Brand Vault text evidence compiler skipped: Gemini returned invalid JSON.'] };

    const normalized = compilerOutputToCandidates(parsed, input);
    if (normalized.candidates.length === 0) {
      return {
        candidates: [],
        warnings: [
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
        'Brand Vault text evidence compiler produced inferred review candidates from website and source evidence.',
        ...(normalized.rejectedCount > 0
          ? [`Brand Vault text evidence compiler discarded ${normalized.rejectedCount} unsupported, duplicate, or ungrounded candidate${normalized.rejectedCount === 1 ? '' : 's'}.`]
          : []),
      ],
    };
  };
}

function buildCompilerPrompt(input: BrandVaultTextEvidenceCompilerInput): string {
  const evidence = collectTextEvidence(input);
  return truncateText(`You are Brand Vault's evidence compiler.

Return JSON only:
{"candidates":[{"signalPath":"identity.audience|identity.proofStyle|voice.recurringPhrases|voice.hookArchetypes|voice.ctaDirectness","normalizedValue":string|string[]|number,"excerpt":"short evidence quote/paraphrase","sourceField":"exact supplied sourceField","sourceUrl":"optional supplied source URL","confidence":0.42-0.68}]}

Rules:
- Return the JSON object directly. Do not wrap it in Markdown fences or prose.
- Use only the evidence supplied below. Do not invent facts.
- Do not summarize the company. Emit reusable brand signals.
- Every candidate sourceField must exactly match one sourceField from the Evidence blocks.
- Prefer precise product/service, audience, proof, and voice evidence over generic descriptions.
- Treat OCR and transcript text as first-class evidence when present.
- Audience values must be specific buyer/user groups, not generic words like "businesses" alone.
- Proof style must be one of: testimonial, metrics, authority, community, demo, editorial.
- Hook archetypes should be compact labels such as statement-led, system, question, contrast, metric-led, demo-led.
- Recurring phrases should be short exact or near-exact brand-language fragments.
- CTA directness is a 0..1 number, only when evidence contains CTA language.
- Confidence cannot exceed 0.68.

Brand:
- brandId: ${input.input.brandId ?? 'unknown'}
- userId: ${input.input.userId}
- companyName: ${input.input.companyName ?? 'unknown'}
- website: ${input.website.normalizedUrl}

Evidence:
${evidence.map((item, index) => `[${index + 1}] sourceField=${item.sourceField} sourceType=${item.sourceType}${item.sourceUrl ? ` sourceUrl=${item.sourceUrl}` : ''}
${item.text}`).join('\n\n')}`, MAX_PROMPT_CHARS);
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
    .filter((item) => item.length >= 3)
    .filter((item) => !/^(?:businesses|users|customers|people|everyone|brands?)$/i.test(item));
  return normalized.length > 0 ? Array.from(new Set(normalized)).slice(0, 8) : undefined;
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

function parseCompilerJson(text: string): unknown | null {
  for (const candidate of compilerJsonCandidates(text)) {
    const parsed = parseJsonCandidate(candidate);
    if (parsed !== null) return parsed;
  }
  return null;
}

function compilerJsonCandidates(text: string): string[] {
  const stripped = stripJsonMarkdown(text);
  return uniqueStrings([
    stripped,
    extractBalancedJsonObject(stripped),
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

function stripJsonMarkdown(value: string): string {
  const trimmed = value.replace(/^\uFEFF/, '').trim();
  const fenced = trimmed.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/i);
  return (fenced?.[1] ?? trimmed).trim();
}

function repairCommonJson(value: string): string {
  return value
    .replace(/[\u201c\u201d]/g, '"')
    .replace(/[\u2018\u2019]/g, "'")
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
