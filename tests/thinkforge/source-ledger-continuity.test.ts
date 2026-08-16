import { describe, expect, it } from 'vitest';
import {
  buildContinuedThinkForgeSourceLedger,
  requireSourceReferenceIdForFact,
} from '@/lib/thinkforge/provenance/source-ledger-continuity';

function fact(id: string, summary: string) {
  return { id, title: `Fact ${id}`, summary, source: `https://example.com/${id}`, tags: [] };
}

function retrieved(projectFacts: ReturnType<typeof fact>[]) {
  return {
    brandDNA: {},
    projectFacts,
    globalFacts: [],
    semanticFacts: [],
    interactionPatterns: [],
  };
}

describe('ThinkForge source ledger continuity', () => {
  it('preserves original references and appends stable edit and fact identities', () => {
    const originalFact = fact('fact_a', 'Original evidence.');
    const original = buildContinuedThinkForgeSourceLedger({
      userPrompt: 'Original brief with an approved claim.',
      retrievedContext: retrieved([originalFact]),
    });
    const newFact = fact('fact_b', 'New evidence.');
    const edited = buildContinuedThinkForgeSourceLedger({
      userPrompt: 'Make the CTA direct and include the new evidence.',
      retrievedContext: retrieved([originalFact, newFact]),
      previousLedger: original,
    });

    expect(edited.entries.map((entry) => entry.referenceId)).toEqual([
      'brief_user',
      'source_1',
      'brief_edit_1',
      'source_2',
    ]);
    expect(requireSourceReferenceIdForFact(edited, originalFact, 0)).toBe('source_1');
    expect(requireSourceReferenceIdForFact(edited, newFact, 1)).toBe('source_2');
  });

  it('creates an immutable superseding reference when a known fact changes', () => {
    const original = buildContinuedThinkForgeSourceLedger({
      userPrompt: 'Original brief.',
      retrievedContext: retrieved([fact('fact_a', 'Old evidence.')]),
    });
    const revisedFact = fact('fact_a', 'Corrected evidence.');
    const revised = buildContinuedThinkForgeSourceLedger({
      userPrompt: 'Use the corrected evidence.',
      retrievedContext: retrieved([revisedFact]),
      previousLedger: original,
    });

    expect(revised.entries.at(-1)).toMatchObject({
      referenceId: 'source_2',
      sourceId: 'fact_a',
      provenance: { supersedesReferenceId: 'source_1' },
    });
    expect(requireSourceReferenceIdForFact(revised, revisedFact, 0)).toBe('source_2');
  });

  it('deduplicates repeated edit evidence and rejects malformed prior ledgers', () => {
    const first = buildContinuedThinkForgeSourceLedger({ userPrompt: 'Keep this exact instruction.' });
    const repeated = buildContinuedThinkForgeSourceLedger({
      userPrompt: 'Keep this exact instruction.',
      previousLedger: first,
    });
    expect(repeated).toEqual(first);
    expect(() => buildContinuedThinkForgeSourceLedger({
      userPrompt: 'Edit this.',
      previousLedger: { ledgerVersion: 1, entries: [{ referenceId: 'bad ref' }] },
    })).toThrow();
  });

  it('fails when a retrieved fact has no ledger authority', () => {
    const ledger = buildContinuedThinkForgeSourceLedger({ userPrompt: 'A brief.' });
    expect(() => requireSourceReferenceIdForFact(ledger, fact('missing', 'Missing.'), 0))
      .toThrow('Source ledger is missing retrieved fact');
  });
});
