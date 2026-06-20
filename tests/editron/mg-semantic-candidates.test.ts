import { describe, expect, it } from 'vitest';

import {
  buildSemanticMgCandidateLedger,
  resolveSemanticMgLedgerGate,
} from '../../lib/editron/motion-graphics/engine/semantic-mg-candidates';

describe('semantic MG candidate ledger', () => {
  it('suppresses unlicensed weak scalar stats instead of promoting a graphic shape', () => {
    const ledger = buildSemanticMgCandidateLedger({
      content: {
        value: '0.03',
        label: 'events per day',
        sourceSpan: { text: 'it was about 0.03 events per day', startMs: 1200, endMs: 2400 },
      },
    });

    expect(ledger.candidates).toHaveLength(0);
    expect(resolveSemanticMgLedgerGate(ledger)).toEqual(expect.objectContaining({
      allow: false,
      reasons: expect.arrayContaining([
        'semantic-ledger:no-licensed-candidate',
        'semantic-ledger:weak-stat-needs-salience-or-relation',
      ]),
    }));
    expect(ledger.suppressed).toEqual([
      expect.objectContaining({
        factKind: 'weak-stat',
        hardGate: expect.objectContaining({
          passed: false,
          blockedBy: ['weak-stat-needs-salience-or-relation'],
        }),
      }),
    ]);
    expect(JSON.stringify(ledger)).not.toMatch(/bar|ring|sparkline|template|preset|graphicType|calibration/i);
  });

  it('licenses bounded numeric facts as proportions without naming a surface renderer', () => {
    const ledger = buildSemanticMgCandidateLedger({
      content: {
        value: '90%',
        label: 'completion',
        quantityKind: 'percentage',
        denominator: 100,
        bounded: true,
        salience: 0.74,
        sourceSpan: { text: 'ninety percent completion', startMs: 500, endMs: 1400 },
      },
    });

    expect(ledger.candidates).toEqual([
      expect.objectContaining({
        factKind: 'bounded-stat',
        licenses: expect.arrayContaining(['bounded-proportion', 'source-span', 'salience']),
        hardGate: expect.objectContaining({ passed: true }),
      }),
    ]);
    expect(ledger.summary).toMatchObject({
      totalCandidates: 1,
      selectedReadyCount: 1,
      suppressedCount: 0,
      factKinds: { 'bounded-stat': 1 },
    });
    expect(JSON.stringify(ledger)).not.toMatch(/percentage-ring|bar-chart|sparkline|template|preset/i);
  });

  it('keeps magnitude facts distinct from bounded proportions', () => {
    const ledger = buildSemanticMgCandidateLedger({
      content: {
        value: '100M',
        label: 'registered accounts',
        quantityKind: 'magnitude',
        sourceSpan: { text: 'one hundred million registered accounts' },
      },
    });

    expect(ledger.candidates[0]).toEqual(expect.objectContaining({
      factKind: 'magnitude-stat',
      licenses: expect.arrayContaining(['magnitude', 'source-span']),
    }));
    expect(ledger.candidates[0]?.licenses).not.toContain('bounded-proportion');
  });

  it('emits concept, identity, quote, and comparison candidates from content facts', () => {
    const concept = buildSemanticMgCandidateLedger({
      content: {
        keyword: 'selection bias',
        body: 'the sample changed the story',
        salience: 0.82,
        sourceSpan: { text: 'selection bias changed the story' },
      },
    });
    const identity = buildSemanticMgCandidateLedger({
      content: {
        name: 'Ada Lovelace',
        title: 'Mathematician',
        sourceSpan: { text: 'Ada Lovelace was a mathematician' },
      },
    });
    const quote = buildSemanticMgCandidateLedger({
      content: {
        quote: 'The machine can weave algebraic patterns.',
        author: 'Archive note',
        sourceSpan: { text: 'The machine can weave algebraic patterns.' },
      },
    });
    const comparison = buildSemanticMgCandidateLedger({
      content: {
        from: 'manual edits',
        to: 'signal-aware edits',
        relation: 'vs',
        sourceSpan: { text: 'manual edits compared with signal-aware edits' },
      },
    });

    expect(concept.candidates[0]).toEqual(expect.objectContaining({
      factKind: 'concept',
      licenses: expect.arrayContaining(['concept-context', 'source-span', 'salience']),
    }));
    expect(identity.candidates[0]).toEqual(expect.objectContaining({
      factKind: 'identity',
      licenses: expect.arrayContaining(['named-entity', 'source-span']),
    }));
    expect(quote.candidates[0]).toEqual(expect.objectContaining({
      factKind: 'quote',
      licenses: expect.arrayContaining(['quote-proof', 'source-span']),
    }));
    expect(comparison.candidates[0]).toEqual(expect.objectContaining({
      factKind: 'comparison',
      licenses: expect.arrayContaining(['comparison-relation', 'source-span']),
    }));
  });

  it('requires source-span evidence for otherwise valid facts', () => {
    const ledger = buildSemanticMgCandidateLedger({
      content: {
        value: '1/3',
        label: 'respondents',
        quantityKind: 'fraction',
        denominator: 3,
        bounded: true,
      },
      sourceSpan: { text: '' },
    });

    expect(ledger.candidates).toHaveLength(0);
    expect(ledger.suppressed[0]).toEqual(expect.objectContaining({
      factKind: 'bounded-stat',
      hardGate: expect.objectContaining({
        blockedBy: ['missing-source-span'],
      }),
    }));
    expect(ledger.summary.suppressReasons).toEqual({ 'missing-source-span': 1 });
    expect(resolveSemanticMgLedgerGate(ledger).allow).toBe(false);
  });

  it('blocks non-candidate content instead of falling through to legacy graphic authority', () => {
    const ledger = buildSemanticMgCandidateLedger({
      content: { text: 'plain caption emphasis' },
      sourceSpan: { text: 'plain caption emphasis' },
    });

    expect(ledger.summary.totalCandidates).toBe(0);
    expect(resolveSemanticMgLedgerGate(ledger)).toEqual({
      allow: false,
      reasons: ['semantic-ledger:no-candidate-facts'],
      readyCandidateIds: [],
      suppressedCandidateIds: [],
    });
  });

  it('does not license novel generated display text without source evidence', () => {
    const ledger = buildSemanticMgCandidateLedger({
      content: {
        value: '700%',
        label: 'synthetic lift from generated card',
        quantityKind: 'percentage',
        denominator: 100,
        bounded: true,
        salience: 0.9,
      },
    });

    expect(ledger.candidates).toHaveLength(0);
    expect(ledger.suppressed[0]).toEqual(expect.objectContaining({
      factKind: 'bounded-stat',
      hardGate: expect.objectContaining({
        blockedBy: ['missing-source-span'],
      }),
    }));
    expect(resolveSemanticMgLedgerGate(ledger)).toEqual(expect.objectContaining({
      allow: false,
      reasons: expect.arrayContaining([
        'semantic-ledger:no-licensed-candidate',
        'semantic-ledger:missing-source-span',
      ]),
    }));
  });
});
