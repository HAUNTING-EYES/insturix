import { describe, expect, it } from 'vitest';
import { parseLedgerEntry } from '@/lib/ledger/schema';
import type { LedgerEntry } from '@/lib/ledger/types';

/** A minimal valid entry the tests mutate to probe each rule. */
function baseEntry(): LedgerEntry {
  return {
    referenceId: 'ref_abc',
    owner: { userId: 'user_1' },
    sourceKind: 'platform-video',
    dedupe: { platform: 'youtube', platformId: 'dQw4w9WgXcQ', normalizedUrl: 'https://youtu.be/dQw4w9WgXcQ' },
    extracts: {},
    analyzedAt: '2026-07-10T00:00:00.000Z',
    schemaVersion: 1,
  };
}

describe('parseLedgerEntry — accepts valid entries', () => {
  it('parses a minimal valid entry', () => {
    expect(() => parseLedgerEntry(baseEntry())).not.toThrow();
  });

  it('accepts provenance-bearing extracts', () => {
    const entry = baseEntry();
    entry.extracts = {
      factsWithProvenance: [{ claim: '2x faster', sourceRefId: 'ref_abc', licensedForGraphics: true }],
      copyAnnotations: [{ kind: 'copy-this', note: 'hook lands on the drop' }],
      dataPoints: [{ label: 'CTR', value: 4.2, sourceRefId: 'ref_abc' }],
      voiceSampleRefs: ['ref_voice_1'],
    };
    expect(() => parseLedgerEntry(entry)).not.toThrow();
  });

  it('treats editFingerprint as opaque (passthrough) until the extractor phase', () => {
    const entry = baseEntry() as unknown as Record<string, unknown>;
    (entry.extracts as Record<string, unknown>).editFingerprint = { anything: true, layers: [1, 2, 3] };
    expect(() => parseLedgerEntry(entry)).not.toThrow();
  });

  it('accepts a chromaprint-only (user upload) dedupe identity', () => {
    const entry = baseEntry();
    entry.sourceKind = 'user-video';
    entry.dedupe = { chromaprint: 'AQADtMkS' };
    expect(() => parseLedgerEntry(entry)).not.toThrow();
  });
});

describe('parseLedgerEntry — rejects invalid entries (fail-loud)', () => {
  it('rejects a missing referenceId', () => {
    const entry = baseEntry() as Partial<LedgerEntry>;
    delete entry.referenceId;
    expect(() => parseLedgerEntry(entry)).toThrow();
  });

  it('rejects an empty owner.userId', () => {
    const entry = baseEntry();
    entry.owner = { userId: '' };
    expect(() => parseLedgerEntry(entry)).toThrow();
  });

  it('rejects an unknown sourceKind', () => {
    const entry = baseEntry() as unknown as Record<string, unknown>;
    entry.sourceKind = 'hologram';
    expect(() => parseLedgerEntry(entry)).toThrow();
  });

  it('rejects a dedupe identity with nothing to dedupe on', () => {
    const entry = baseEntry();
    entry.dedupe = {};
    expect(() => parseLedgerEntry(entry)).toThrow();
  });

  it('rejects a platformId with no platform', () => {
    const entry = baseEntry();
    entry.dedupe = { platformId: 'dQw4w9WgXcQ' };
    expect(() => parseLedgerEntry(entry)).toThrow();
  });

  it('rejects a fact without a sourceRefId', () => {
    const entry = baseEntry() as unknown as Record<string, unknown>;
    (entry.extracts as Record<string, unknown>).factsWithProvenance = [{ claim: 'unsourced' }];
    expect(() => parseLedgerEntry(entry)).toThrow();
  });

  it('rejects a copy annotation with a bad kind', () => {
    const entry = baseEntry() as unknown as Record<string, unknown>;
    (entry.extracts as Record<string, unknown>).copyAnnotations = [{ kind: 'maybe-this', note: 'x' }];
    expect(() => parseLedgerEntry(entry)).toThrow();
  });

  it('rejects a non-positive schemaVersion', () => {
    const entry = baseEntry();
    entry.schemaVersion = 0;
    expect(() => parseLedgerEntry(entry)).toThrow();
  });
});
