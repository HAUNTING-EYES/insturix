import { z } from 'zod';
import type { RetrievedContext, SemanticFact } from '../context';
import {
  hasUnicodeFactualMarker,
  isSubstantiveUnicodeToken,
  normalizeUnicodeText,
  unicodeLexicalTokens,
} from '../text/unicode-text';

export const SOURCE_LEDGER_VERSION = 1 as const;

export const SOURCE_LEDGER_ENTRY_KINDS = [
  'user_brief',
  'project_fact',
  'global_fact',
  'research_source',
  'upload',
  'brand_vault',
  'interaction_pattern',
] as const;

export type SourceLedgerEntryKind = typeof SOURCE_LEDGER_ENTRY_KINDS[number];

export const SourceLedgerEntrySchema = z.object({
  referenceId: z.string().min(1).regex(/^[a-zA-Z0-9_-]+$/),
  kind: z.enum(SOURCE_LEDGER_ENTRY_KINDS),
  title: z.string().min(1),
  summary: z.string().min(1),
  sourceId: z.string().min(1).optional(),
  sourceUrl: z.string().min(1).optional(),
  confidence: z.number().min(0).max(1),
  provenance: z.object({
    origin: z.string().min(1),
    brandId: z.string().min(1).optional(),
    sessionId: z.string().min(1).optional(),
  }).passthrough(),
});

export const SourceLedgerSchema = z.object({
  ledgerVersion: z.literal(SOURCE_LEDGER_VERSION),
  entries: z.array(SourceLedgerEntrySchema).max(80),
}).superRefine((ledger, ctx) => {
  const seen = new Set<string>();
  ledger.entries.forEach((entry, index) => {
    if (seen.has(entry.referenceId)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['entries', index, 'referenceId'],
        message: `duplicate referenceId "${entry.referenceId}"`,
      });
    }
    seen.add(entry.referenceId);
  });
});

export type SourceLedgerEntry = z.infer<typeof SourceLedgerEntrySchema>;
export type SourceLedger = z.infer<typeof SourceLedgerSchema>;
export type ThinkForgeSourceLedgerEvidenceBoundary = 'source_only' | 'bounded_implication';

export interface BuildThinkForgeSourceLedgerInput {
  userPrompt: string;
  retrievedContext?: RetrievedContext | null;
  brandId?: string | null;
  sessionId?: string | null;
  maxFactEntries?: number;
}

interface MinimalSourceRefCarrier {
  sourceRefs?: string[];
  scenes?: Array<{
    title?: string;
    narration?: string;
    visualDescription?: string;
    sourceRefs?: string[];
    lines?: Array<{
      text?: string;
      sourceRefs?: string[];
    }>;
  }>;
}

interface MinimalNarrativeSidecarSourceCarrier {
  sourceRefs?: string[];
  acts?: Array<{
    narrativeScenes?: Array<{
      title?: string;
      narrativePurpose?: string;
      sourceRefs?: string[];
      beats?: Array<{
        narrativePurpose?: string;
        sourceRefs?: string[];
        visualIntent?: {
          description?: string;
          onScreenText?: string[];
        };
        lines?: Array<{
          text?: string;
          sourceRefs?: string[];
        }>;
      }>;
    }>;
  }>;
}

const MAX_SOURCE_TEXT_CHARS = 12_000;

const TOKEN_STOP_WORDS = new Set([
  'about',
  'again',
  'after',
  'before',
  'brand',
  'brief',
  'content',
  'create',
  'from',
  'have',
  'into',
  'make',
  'post',
  'script',
  'that',
  'their',
  'there',
  'this',
  'through',
  'user',
  'with',
  'write',
  'your',
]);

function cleanText(value: unknown, maxChars: number): string {
  return String(value ?? '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, maxChars);
}

function entryBase(input: BuildThinkForgeSourceLedgerInput) {
  return {
    ...(input.brandId ? { brandId: input.brandId } : {}),
    ...(input.sessionId ? { sessionId: input.sessionId } : {}),
  };
}

function factEntry(
  fact: SemanticFact,
  kind: Extract<SourceLedgerEntryKind, 'project_fact' | 'global_fact'>,
  referenceId: string,
  input: BuildThinkForgeSourceLedgerInput,
): SourceLedgerEntry {
  return {
    referenceId,
    kind,
    title: cleanText(fact.title || fact.id || referenceId, 160) || referenceId,
    summary: cleanText(fact.summary || fact.title || fact.id || referenceId, MAX_SOURCE_TEXT_CHARS) || referenceId,
    sourceId: cleanText(fact.id, 160) || referenceId,
    ...(fact.source ? { sourceUrl: cleanText(fact.source, 500) } : {}),
    confidence: kind === 'project_fact' ? 0.95 : 0.85,
    provenance: {
      origin: kind,
      ...entryBase(input),
    },
  };
}

export function parseSourceLedger(input: unknown): SourceLedger {
  return SourceLedgerSchema.parse(input);
}

/**
 * A user brief or internal project summary can establish direct facts, but it cannot license
 * causal or market-level inference. That broader boundary requires independently attributable
 * material such as research, an upload, or an explicit source URL.
 */
export function resolveThinkForgeSourceLedgerEvidenceBoundary(
  ledger: SourceLedger | null | undefined,
): ThinkForgeSourceLedgerEvidenceBoundary {
  if (!ledger) return 'source_only';

  return parseSourceLedger(ledger).entries.some((entry) => (
    entry.kind === 'research_source'
    || entry.kind === 'upload'
    || Boolean(entry.sourceUrl)
  ))
    ? 'bounded_implication'
    : 'source_only';
}

export function buildThinkForgeSourceLedger(input: BuildThinkForgeSourceLedgerInput): SourceLedger {
  const entries: SourceLedgerEntry[] = [];
  const userBrief = cleanText(input.userPrompt, MAX_SOURCE_TEXT_CHARS);
  if (userBrief) {
    entries.push({
      referenceId: 'brief_user',
      kind: 'user_brief',
      title: 'User brief',
      summary: userBrief,
      confidence: 1,
      provenance: {
        origin: 'user_prompt',
        ...entryBase(input),
      },
    });
  }

  const availableFactSlots = 80 - entries.length;
  const requestedFactEntries = input.maxFactEntries ?? availableFactSlots;
  if (!Number.isInteger(requestedFactEntries) || requestedFactEntries < 0) {
    throw new Error('ThinkForge source ledger maxFactEntries must be a non-negative integer');
  }

  const promptTokens = tokenSet(input.userPrompt);
  const facts = [
    ...(input.retrievedContext?.projectFacts ?? []).map((fact) => ({ fact, kind: 'project_fact' as const })),
    ...(input.retrievedContext?.globalFacts ?? []).map((fact) => ({ fact, kind: 'global_fact' as const })),
  ]
    .map((candidate, originalIndex) => ({
      ...candidate,
      originalIndex,
      relevance: tokenOverlapCount(promptTokens, tokenSet(`${candidate.fact.title} ${candidate.fact.summary}`)),
    }))
    .sort((left, right) => (
      right.relevance - left.relevance
      || Number(right.kind === 'project_fact') - Number(left.kind === 'project_fact')
      || left.originalIndex - right.originalIndex
    ))
    .slice(0, Math.min(requestedFactEntries, availableFactSlots));

  facts.forEach(({ fact, kind }, index) => {
    entries.push(factEntry(fact, kind, `source_${index + 1}`, input));
  });

  return parseSourceLedger({ ledgerVersion: SOURCE_LEDGER_VERSION, entries });
}

export function formatSourceLedgerForPrompt(ledger: SourceLedger): string {
  if (ledger.entries.length === 0) {
    return '## Source Ledger\nNo admissible factual sources are available. Do not invent facts, stats, dates, prices, URLs, testimonials, or named proof.';
  }

  const rows = ledger.entries
    .map((entry) => {
      const source = entry.sourceUrl ? ` | url: ${entry.sourceUrl}` : '';
      return `- ${entry.referenceId} (${entry.kind}, confidence ${entry.confidence}): ${entry.title} -- ${entry.summary}${source}`;
    })
    .join('\n');

  return [
    '## Source Ledger',
    'Use ONLY these referenceId values in sidecar.sourceRefs, scene.sourceRefs, and line.sourceRefs.',
    'Copy reference IDs exactly as listed. User briefs, edit instructions, project summaries, and fact revisions may each have distinct IDs.',
    'Numeric claims, dates, prices, URLs, named proof, testimonials, and sourced stats must carry at least one sourceRef.',
    rows,
  ].join('\n');
}

function ledgerReferenceIds(ledger: SourceLedger): Set<string> {
  return new Set(ledger.entries.map((entry) => entry.referenceId));
}

function addInvalidRefs(
  issues: string[],
  refs: string[] | undefined,
  allowed: Set<string>,
  label: string,
): void {
  for (const ref of refs ?? []) {
    if (!allowed.has(ref)) {
      issues.push(`invalid_source_ref:${label}:${ref}`);
    }
  }
}

function tokenSet(text: string): Set<string> {
  return new Set(unicodeLexicalTokens(text)
    .filter((token) => isSubstantiveUnicodeToken(token) && !TOKEN_STOP_WORDS.has(token)));
}

function tokenOverlapCount(left: Set<string>, right: Set<string>): number {
  let overlap = 0;
  for (const token of left) {
    if (right.has(token)) overlap += 1;
  }
  return overlap;
}

function entryEvidenceText(entry: SourceLedgerEntry): string {
  return [entry.title, entry.summary, entry.sourceUrl].filter(Boolean).join(' ');
}

function overlapsEntry(text: string, entry: SourceLedgerEntry): boolean {
  const normalizedText = normalizeUnicodeText(text);
  const normalizedSource = normalizeUnicodeText(entryEvidenceText(entry));
  if (
    normalizedText.length >= 4
    && normalizedSource.length >= 4
    && (normalizedText.includes(normalizedSource) || normalizedSource.includes(normalizedText))
  ) {
    return true;
  }

  const textTokens = tokenSet(text);
  if (textTokens.size === 0) return false;
  const sourceTokens = tokenSet(entryEvidenceText(entry));
  return tokenOverlapCount(textTokens, sourceTokens) >= 2;
}

function ledgerEntriesByReferenceId(ledger: SourceLedger): Map<string, SourceLedgerEntry> {
  return new Map(ledger.entries.map((entry) => [entry.referenceId, entry]));
}

function factualAnchorTokens(text: string): string[] {
  return [...new Set(unicodeLexicalTokens(text).filter((token) => /^\p{N}/u.test(token)))];
}

function sourceUrls(text: string): string[] {
  return (text.match(/(?:https?:\/\/|www\.)[^\s]+/giu) ?? [])
    .map((url) => normalizeUnicodeText(url.replace(/[),.;!?]+$/u, '')));
}

function hasExactEvidenceContainment(text: string, entry: SourceLedgerEntry): boolean {
  const normalizedText = normalizeUnicodeText(text);
  const normalizedEvidence = normalizeUnicodeText(entryEvidenceText(entry));
  return normalizedText.length >= 4
    && normalizedEvidence.length >= 4
    && (normalizedText.includes(normalizedEvidence) || normalizedEvidence.includes(normalizedText));
}

function hasDirectFactualSupport(text: string, entry: SourceLedgerEntry): boolean {
  if (!overlapsEntry(text, entry)) return false;
  if (hasExactEvidenceContainment(text, entry)) return true;

  const evidenceText = entryEvidenceText(entry);
  const evidenceTokens = tokenSet(evidenceText);
  if (!hasUnicodeFactualMarker(text)) {
    const claimTokens = tokenSet(text);
    return claimTokens.size >= 2 && [...claimTokens].every((token) => evidenceTokens.has(token));
  }

  if (factualAnchorTokens(text).some((anchor) => !evidenceTokens.has(anchor))) return false;

  const evidenceUrls = new Set(sourceUrls(evidenceText));
  if (sourceUrls(text).some((url) => !evidenceUrls.has(url))) return false;

  const nonNumericTextTokens = new Set(
    [...tokenSet(text)].filter((token) => !/^\p{N}/u.test(token)),
  );
  const nonNumericEvidenceTokens = new Set(
    [...evidenceTokens].filter((token) => !/^\p{N}/u.test(token)),
  );
  return tokenOverlapCount(nonNumericTextTokens, nonNumericEvidenceTokens) >= 2;
}

/**
 * Returns only source IDs whose evidence directly supports the supplied text. This intentionally
 * refuses keyword-only matches so the writer can never repair an unsupported claim by auto-citing
 * a merely related ledger entry.
 */
export function findDirectlySupportingSourceReferenceIds(
  text: string | undefined,
  ledger: SourceLedger | null | undefined,
): string[] {
  if (!ledger) return [];
  const normalized = cleanText(text, 4000);
  if (!normalized) return [];

  return parseSourceLedger(ledger).entries
    .filter((entry) => hasDirectFactualSupport(normalized, entry))
    .map((entry) => entry.referenceId);
}

function addUnsupportedCitationIssues(
  issues: string[],
  text: string | undefined,
  refs: string[] | undefined,
  entriesById: Map<string, SourceLedgerEntry>,
  label: string,
): void {
  const normalized = cleanText(text, 4000);
  if (!normalized || !refs?.length) return;

  const citedEntries = refs.flatMap((ref) => {
    const entry = entriesById.get(ref);
    return entry ? [entry] : [];
  });
  if (citedEntries.length === 0) return;

  const combinedEvidence = citedEntries.map(entryEvidenceText).join(' ');
  const evidenceTokens = tokenSet(combinedEvidence);
  const missingNumericAnchor = factualAnchorTokens(normalized)
    .some((anchor) => !evidenceTokens.has(anchor));
  const evidenceUrls = new Set(sourceUrls(combinedEvidence));
  const missingUrlAnchor = sourceUrls(normalized).some((url) => !evidenceUrls.has(url));
  if (missingNumericAnchor || missingUrlAnchor) {
    issues.push(`source_ref_marker_mismatch:${label}`);
  }

  const claimTokens = tokenSet(normalized);
  if (claimTokens.size >= 2 && !citedEntries.some((entry) => hasDirectFactualSupport(normalized, entry))) {
    issues.push(`source_ref_low_support:${label}`);
  }
}

function isQuestion(text: string): boolean {
  return /[?？]$/u.test(text.trim());
}

function requiresSourceRef(text: string, ledger: SourceLedger): boolean {
  const normalized = cleanText(text, 4000);
  if (!normalized) return false;
  if (isQuestion(normalized)) return false;
  if (hasUnicodeFactualMarker(normalized)) return true;
  return ledger.entries.some((entry) => overlapsEntry(normalized, entry));
}

export function findSourceLedgerIssuesForSidecar(
  sidecar: MinimalSourceRefCarrier,
  ledger: SourceLedger | null | undefined,
): string[] {
  if (!ledger) return [];

  const parsedLedger = parseSourceLedger(ledger);
  const allowed = ledgerReferenceIds(parsedLedger);
  const entriesById = ledgerEntriesByReferenceId(parsedLedger);
  const issues: string[] = [];

  addInvalidRefs(issues, sidecar.sourceRefs, allowed, 'sidecar');

  sidecar.scenes?.forEach((scene, sceneIndex) => {
    const sceneLabel = `scene_${sceneIndex + 1}`;
    addInvalidRefs(issues, scene.sourceRefs, allowed, sceneLabel);

    if (requiresSourceRef(scene.narration ?? '', parsedLedger) && (scene.sourceRefs ?? []).length === 0) {
      issues.push(`missing_source_ref:${sceneLabel}`);
    }
    addUnsupportedCitationIssues(
      issues,
      scene.narration,
      scene.sourceRefs,
      entriesById,
      `${sceneLabel}.narration`,
    );
    scene.lines?.forEach((line, lineIndex) => {
      const lineLabel = `${sceneLabel}.line_${lineIndex + 1}`;
      addInvalidRefs(issues, line.sourceRefs, allowed, lineLabel);
      if (requiresSourceRef(line.text ?? '', parsedLedger) && (line.sourceRefs ?? []).length === 0) {
        issues.push(`missing_source_ref:${lineLabel}`);
      }
      addUnsupportedCitationIssues(issues, line.text, line.sourceRefs, entriesById, lineLabel);
    });
  });

  return issues;
}

export function findSourceLedgerIssuesForNarrativeSidecar(
  sidecar: MinimalNarrativeSidecarSourceCarrier,
  ledger: SourceLedger | null | undefined,
): string[] {
  if (!ledger) return [];

  const parsedLedger = parseSourceLedger(ledger);
  const allowed = ledgerReferenceIds(parsedLedger);
  const entriesById = ledgerEntriesByReferenceId(parsedLedger);
  const issues: string[] = [];

  addInvalidRefs(issues, sidecar.sourceRefs, allowed, 'sidecar');

  sidecar.acts?.forEach((act, actIndex) => {
    act.narrativeScenes?.forEach((scene, sceneIndex) => {
      const sceneLabel = `act_${actIndex + 1}.scene_${sceneIndex + 1}`;
      addInvalidRefs(issues, scene.sourceRefs, allowed, sceneLabel);

      scene.beats?.forEach((beat, beatIndex) => {
        const beatLabel = `${sceneLabel}.beat_${beatIndex + 1}`;
        addInvalidRefs(issues, beat.sourceRefs, allowed, beatLabel);

        beat.visualIntent?.onScreenText?.forEach((text, textIndex) => {
          const onScreenTextLabel = `${beatLabel}.on_screen_text_${textIndex + 1}`;
          if (requiresSourceRef(text, parsedLedger) && (beat.sourceRefs ?? []).length === 0) {
            issues.push(`missing_source_ref:${onScreenTextLabel}`);
          }
          addUnsupportedCitationIssues(
            issues,
            text,
            beat.sourceRefs,
            entriesById,
            onScreenTextLabel,
          );
        });

        beat.lines?.forEach((line, lineIndex) => {
          const lineLabel = `${beatLabel}.line_${lineIndex + 1}`;
          addInvalidRefs(issues, line.sourceRefs, allowed, lineLabel);
          if (requiresSourceRef(line.text ?? '', parsedLedger) && (line.sourceRefs ?? []).length === 0) {
            issues.push(`missing_source_ref:${lineLabel}`);
          }
          addUnsupportedCitationIssues(issues, line.text, line.sourceRefs, entriesById, lineLabel);
        });
      });
    });
  });

  return issues;
}
