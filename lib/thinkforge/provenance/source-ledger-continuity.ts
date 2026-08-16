import type { SemanticFact } from '../context';
import {
  buildThinkForgeSourceLedger,
  parseSourceLedger,
  type BuildThinkForgeSourceLedgerInput,
  type SourceLedger,
  type SourceLedgerEntry,
} from './source-ledger';

const MAX_LEDGER_ENTRIES = 80;

export interface BuildContinuedSourceLedgerInput extends BuildThinkForgeSourceLedgerInput {
  previousLedger?: unknown;
  projectSummary?: string | null;
}

function normalized(value: string): string {
  return value.normalize('NFC').replace(/\s+/g, ' ').trim();
}

function sameEvidence(left: SourceLedgerEntry, right: SourceLedgerEntry): boolean {
  return left.kind === right.kind
    && normalized(left.title) === normalized(right.title)
    && normalized(left.summary) === normalized(right.summary)
    && normalized(left.sourceUrl ?? '') === normalized(right.sourceUrl ?? '');
}

function nextReferenceIndex(entries: SourceLedgerEntry[], prefix: 'source' | 'brief_edit'): number {
  const pattern = new RegExp(`^${prefix}_(\\d+)$`);
  return entries.reduce((maximum, entry) => {
    const match = pattern.exec(entry.referenceId);
    return match ? Math.max(maximum, Number(match[1])) : maximum;
  }, 0) + 1;
}

function latestFactRevision(
  entries: SourceLedgerEntry[],
  candidate: SourceLedgerEntry,
): SourceLedgerEntry | undefined {
  if (!candidate.sourceId) return undefined;
  return [...entries].reverse().find((entry) => entry.sourceId === candidate.sourceId);
}

function nextProjectSummaryReference(entries: SourceLedgerEntry[]): string {
  const latest = entries.reduce((maximum, entry) => {
    if (entry.referenceId === 'project_summary') return Math.max(maximum, 1);
    const match = /^project_summary_(\d+)$/.exec(entry.referenceId);
    return match ? Math.max(maximum, Number(match[1])) : maximum;
  }, 0);
  return latest === 0 ? 'project_summary' : `project_summary_${latest + 1}`;
}

export function buildContinuedThinkForgeSourceLedger(
  input: BuildContinuedSourceLedgerInput,
): SourceLedger {
  const current = buildThinkForgeSourceLedger(input);
  const previous = input.previousLedger === undefined || input.previousLedger === null
    ? null
    : parseSourceLedger(input.previousLedger);
  const entries = [...(previous?.entries ?? [])];
  const projectSummary = normalized(input.projectSummary ?? '');
  const currentEntries = [...current.entries];
  if (projectSummary) {
    const firstFactIndex = currentEntries.findIndex((entry) => entry.kind !== 'user_brief');
    const projectEntry: SourceLedgerEntry = {
      referenceId: 'project_summary',
      kind: 'project_fact',
      title: 'Project summary',
      summary: projectSummary.slice(0, 900),
      sourceId: 'project_summary',
      confidence: 1,
      provenance: {
        origin: 'project_summary',
        ...(input.brandId ? { brandId: input.brandId } : {}),
        ...(input.sessionId ? { sessionId: input.sessionId } : {}),
      },
    };
    currentEntries.splice(firstFactIndex < 0 ? currentEntries.length : firstFactIndex, 0, projectEntry);
  }

  for (const candidate of currentEntries) {
    if (candidate.kind === 'user_brief') {
      if (entries.some((entry) => entry.kind === 'user_brief' && sameEvidence(entry, candidate))) continue;
      const hasOriginalBrief = entries.some((entry) => entry.referenceId === 'brief_user');
      entries.push(hasOriginalBrief
        ? {
            ...candidate,
            referenceId: `brief_edit_${nextReferenceIndex(entries, 'brief_edit')}`,
            title: 'Edit instruction',
            provenance: { ...candidate.provenance, origin: 'user_edit' },
          }
        : candidate);
      continue;
    }

    if (candidate.sourceId === 'project_summary') {
      const priorRevision = latestFactRevision(entries, candidate);
      if (priorRevision && sameEvidence(priorRevision, candidate)) continue;
      entries.push({
        ...candidate,
        referenceId: nextProjectSummaryReference(entries),
        provenance: {
          ...candidate.provenance,
          ...(priorRevision ? { supersedesReferenceId: priorRevision.referenceId } : {}),
        },
      });
      continue;
    }

    const priorRevision = latestFactRevision(entries, candidate);
    if (priorRevision && sameEvidence(priorRevision, candidate)) continue;
    const duplicate = entries.find((entry) => sameEvidence(entry, candidate));
    if (duplicate) continue;
    entries.push({
      ...candidate,
      referenceId: `source_${nextReferenceIndex(entries, 'source')}`,
      provenance: {
        ...candidate.provenance,
        ...(priorRevision ? { supersedesReferenceId: priorRevision.referenceId } : {}),
      },
    });
  }

  if (entries.length > MAX_LEDGER_ENTRIES) {
    throw new Error(`Source ledger capacity exceeded (${entries.length}/${MAX_LEDGER_ENTRIES}); compact it explicitly before editing.`);
  }
  return parseSourceLedger({ ledgerVersion: 1, entries });
}

export function requireSourceReferenceIdForFact(
  ledger: SourceLedger | null | undefined,
  fact: SemanticFact,
  fallbackIndex: number,
): string {
  if (!ledger) return `source_${fallbackIndex + 1}`;
  const entries = [...ledger.entries].reverse();
  const bySourceId = fact.id
    ? entries.find((entry) => entry.sourceId === fact.id)
    : undefined;
  const byEvidence = entries.find((entry) => (
    normalized(entry.title) === normalized(fact.title ?? '')
    && normalized(entry.summary) === normalized(fact.summary ?? '')
  ));
  const resolved = bySourceId ?? byEvidence;
  if (!resolved) {
    throw new Error(`Source ledger is missing retrieved fact ${fact.id || fallbackIndex + 1}.`);
  }
  return resolved.referenceId;
}
