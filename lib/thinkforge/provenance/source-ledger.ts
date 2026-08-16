import { z } from 'zod';
import type { RetrievedContext, SemanticFact } from '../context';

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

const MAX_BRIEF_CHARS = 1200;
const MAX_FACT_CHARS = 900;

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

const STRICT_FACT_PATTERN = /(?:https?:\/\/\S+|(?:\$|rs\.?|inr|usd|eur|gbp)\s?\d[\d,]*(?:\.\d+)?|\b\d[\d,]*(?:\.\d+)?\s?(?:%|percent|x|k|m|b|am|pm|hours?|days?|weeks?|months?|years?)\b|\b\d{1,2}:\d{2}\b|\b(?:jan|feb|mar|apr|may|jun|jul|aug|sep|sept|oct|nov|dec)[a-z]*\b)/i;

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
    summary: cleanText(fact.summary || fact.title || fact.id || referenceId, MAX_FACT_CHARS) || referenceId,
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
  const userBrief = cleanText(input.userPrompt, MAX_BRIEF_CHARS);
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

  const maxFactEntries = input.maxFactEntries ?? 12;
  const facts = [
    ...(input.retrievedContext?.projectFacts ?? []).map((fact) => ({ fact, kind: 'project_fact' as const })),
    ...(input.retrievedContext?.globalFacts ?? []).map((fact) => ({ fact, kind: 'global_fact' as const })),
  ].slice(0, maxFactEntries);

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
    'Use brief_user for factual claims supplied by the user brief. Use source_N for DataBank/project/global facts.',
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
  return new Set(
    text
      .toLowerCase()
      .replace(/[^a-z0-9\s-]/g, ' ')
      .split(/\s+/)
      .filter((token) => token.length >= 5 && !TOKEN_STOP_WORDS.has(token)),
  );
}

function overlapsEntry(text: string, entry: SourceLedgerEntry): boolean {
  if (entry.kind === 'user_brief') return false;
  const textTokens = tokenSet(text);
  if (textTokens.size === 0) return false;
  const sourceTokens = tokenSet(`${entry.title} ${entry.summary}`);
  let overlap = 0;
  for (const token of sourceTokens) {
    if (textTokens.has(token)) overlap += 1;
    if (overlap >= 2) return true;
  }
  return false;
}

function requiresSourceRef(text: string, ledger: SourceLedger): boolean {
  const normalized = cleanText(text, 4000);
  if (!normalized) return false;
  if (STRICT_FACT_PATTERN.test(normalized)) return true;
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
