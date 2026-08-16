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

export function buildContinuedThinkForgeSourceLedger(
  input: BuildContinuedSourceLedgerInput,
): SourceLedger {
  const current = buildThinkForgeSourceLedger(input);
  if (input.previousLedger === undefined || input.previousLedger === null) return current;

  const previous = parseSourceLedger(input.previousLedger);
  const entries = [...previous.entries];

  for (const candidate of current.entries) {
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
