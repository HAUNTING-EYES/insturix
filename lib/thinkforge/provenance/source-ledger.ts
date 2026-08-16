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

function overlapsEntry(text: string, entry: SourceLedgerEntry): boolean {
  const normalizedText = normalizeUnicodeText(text);
  const normalizedSource = normalizeUnicodeText(`${entry.title} ${entry.summary}`);
  if (
    normalizedText.length >= 4
    && normalizedSource.length >= 4
    && (normalizedText.includes(normalizedSource) || normalizedSource.includes(normalizedText))
  ) {
    return true;
  }

  const textTokens = tokenSet(text);
  if (textTokens.size === 0) return false;
  const sourceTokens = tokenSet(`${entry.title} ${entry.summary}`);
  return tokenOverlapCount(textTokens, sourceTokens) >= 2;
}

function requiresSourceRef(text: string, ledger: SourceLedger): boolean {
  const normalized = cleanText(text, 4000);
  if (!normalized) return false;
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
  const issues: string[] = [];

  addInvalidRefs(issues, sidecar.sourceRefs, allowed, 'sidecar');

  sidecar.scenes?.forEach((scene, sceneIndex) => {
    const sceneLabel = `scene_${sceneIndex + 1}`;
    addInvalidRefs(issues, scene.sourceRefs, allowed, sceneLabel);

    const sceneFactText = [scene.title, scene.narration, scene.visualDescription].filter(Boolean).join(' ');
    if (requiresSourceRef(sceneFactText, parsedLedger) && (scene.sourceRefs ?? []).length === 0) {
      issues.push(`missing_source_ref:${sceneLabel}`);
    }

    scene.lines?.forEach((line, lineIndex) => {
      const lineLabel = `${sceneLabel}.line_${lineIndex + 1}`;
      addInvalidRefs(issues, line.sourceRefs, allowed, lineLabel);
      if (requiresSourceRef(line.text ?? '', parsedLedger) && (line.sourceRefs ?? []).length === 0) {
        issues.push(`missing_source_ref:${lineLabel}`);
      }
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
  const issues: string[] = [];

  addInvalidRefs(issues, sidecar.sourceRefs, allowed, 'sidecar');

  sidecar.acts?.forEach((act, actIndex) => {
    act.narrativeScenes?.forEach((scene, sceneIndex) => {
      const sceneLabel = `act_${actIndex + 1}.scene_${sceneIndex + 1}`;
      addInvalidRefs(issues, scene.sourceRefs, allowed, sceneLabel);

      const sceneFactText = [scene.title, scene.narrativePurpose].filter(Boolean).join(' ');
      if (requiresSourceRef(sceneFactText, parsedLedger) && (scene.sourceRefs ?? []).length === 0) {
        issues.push(`missing_source_ref:${sceneLabel}`);
      }

      scene.beats?.forEach((beat, beatIndex) => {
        const beatLabel = `${sceneLabel}.beat_${beatIndex + 1}`;
        addInvalidRefs(issues, beat.sourceRefs, allowed, beatLabel);

        const beatFactText = [
          beat.narrativePurpose,
          beat.visualIntent?.description,
          ...(beat.visualIntent?.onScreenText ?? []),
        ].filter(Boolean).join(' ');
        if (requiresSourceRef(beatFactText, parsedLedger) && (beat.sourceRefs ?? []).length === 0) {
          issues.push(`missing_source_ref:${beatLabel}`);
        }

        beat.lines?.forEach((line, lineIndex) => {
          const lineLabel = `${beatLabel}.line_${lineIndex + 1}`;
          addInvalidRefs(issues, line.sourceRefs, allowed, lineLabel);
          if (requiresSourceRef(line.text ?? '', parsedLedger) && (line.sourceRefs ?? []).length === 0) {
            issues.push(`missing_source_ref:${lineLabel}`);
          }
        });
      });
    });
  });

  return issues;
}
