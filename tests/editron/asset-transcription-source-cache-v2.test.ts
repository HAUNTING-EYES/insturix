import { beforeEach, describe, expect, it, vi } from 'vitest';

const persistence = vi.hoisted(() => ({
  documents: new Map<string, Record<string, unknown>>(),
  findOne: vi.fn(),
  getDatabase: vi.fn(),
  updateOne: vi.fn(),
}));

vi.mock('@/lib/editron/db/mongodb', () => ({
  getDatabase: persistence.getDatabase,
}));

import {
  assertAssetTranscriptionSourceBindingV2,
  createAssetTranscriptionSourceBindingV2,
  getSourceBoundTranscriptionV2,
  isAssetTranscriptionFrameAddressableV2,
  saveSourceBoundTranscriptionV2,
  type AssetTranscriptionTimingEvidenceV2,
} from '@/lib/editron/services/asset-transcription-source-cache-v2';
import { createMediaSourceStorageVersionV1 }
  from '@/lib/editron/services/media-source-storage-version-v1';
import { createMediaSourceVersionV1 }
  from '@/lib/editron/services/media-source-version-v1';

describe('source-bound asset transcription cache V2', () => {
  beforeEach(() => {
    persistence.documents.clear();
    persistence.findOne.mockReset();
    persistence.getDatabase.mockReset();
    persistence.updateOne.mockReset();
    persistence.updateOne.mockImplementation(async (
      filter: Record<string, unknown>,
      update: { $setOnInsert: Record<string, unknown> },
    ) => {
      const id = String(filter._id);
      const inserted = !persistence.documents.has(id);
      if (inserted) persistence.documents.set(id, update.$setOnInsert);
      return { upsertedCount: inserted ? 1 : 0 };
    });
    persistence.findOne.mockImplementation(async (filter: Record<string, unknown>) =>
      persistence.documents.get(String(filter._id)) ?? null);
    persistence.getDatabase.mockResolvedValue({
      collection: vi.fn(() => ({
        findOne: persistence.findOne,
        updateOne: persistence.updateOne,
      })),
    });
  });

  it('creates stable exact-source identities and rejects forged bindings', () => {
    const first = binding();
    const equivalent = binding();
    const otherSource = binding({ sourceVersion: sourceVersion('other') });
    const otherLanguage = binding({ requestedLanguage: 'hi' });
    const textOnly = binding({ precision: 'TEXT_ALLOWED' });

    expect(first).toEqual(equivalent);
    expect(otherSource.bindingSha256).not.toBe(first.bindingSha256);
    expect(otherLanguage.bindingSha256).not.toBe(first.bindingSha256);
    expect(textOnly.bindingSha256).not.toBe(first.bindingSha256);
    expect(() => assertAssetTranscriptionSourceBindingV2({
      ...first,
      sourceRole: 'MASTER',
    })).toThrow('ASSET_TRANSCRIPTION_SOURCE_BINDING_HASH_MISMATCH');
  });

  it('stores immutable measured output and restores generatedAt as a Date', async () => {
    const source = binding();
    const stored = await saveSourceBoundTranscriptionV2(source, {
      transcription: transcription(),
      timingEvidence: measuredTiming(),
    });
    const read = await getSourceBoundTranscriptionV2(source);

    expect(stored.transcription.generatedAt).toBeInstanceOf(Date);
    expect(read).toMatchObject({
      sourceBindingV2: { bindingSha256: source.bindingSha256 },
      transcription: { transcript: 'hello', language: 'en' },
      timingEvidence: { timingBasis: 'MEASURED_WORD' },
      transcriptionSha256: expect.stringMatching(/^[a-f0-9]{64}$/),
      recordSha256: expect.stringMatching(/^[a-f0-9]{64}$/),
    });
    expect(isAssetTranscriptionFrameAddressableV2(stored)).toBe(true);
    expect(persistence.updateOne).toHaveBeenCalledWith(
      expect.objectContaining({
        _id: `asset_transcription_v2_${source.bindingSha256}`,
      }),
      expect.objectContaining({ $setOnInsert: expect.any(Object) }),
      { upsert: true, writeConcern: { w: 'majority' } },
    );
  });

  it('preserves the first valid writer instead of replacing provider output', async () => {
    const source = binding();
    const first = await saveSourceBoundTranscriptionV2(source, {
      transcription: transcription(),
      timingEvidence: measuredTiming(),
    });
    const second = await saveSourceBoundTranscriptionV2(source, {
      transcription: transcription({
        transcript: 'different',
        words: [{
          word: 'different', startMs: 0, endMs: 400, confidence: 0.7,
        }],
      }),
      timingEvidence: measuredTiming({ modelId: 'replacement-model' }),
    });

    expect(first.recordSha256).toBe(second.recordSha256);
    expect(second.transcription.transcript).toBe('hello');
    expect(persistence.documents).toHaveLength(1);
  });

  it('isolates source versions and never consults an asset-only row', async () => {
    const selected = binding();
    const otherSource = binding({ sourceVersion: sourceVersion('other') });
    await saveSourceBoundTranscriptionV2(selected, {
      transcription: transcription(),
      timingEvidence: measuredTiming(),
    });

    expect(await getSourceBoundTranscriptionV2(otherSource)).toBeNull();
    expect(persistence.documents).toHaveLength(1);
  });

  it('fails loudly when stored transcript content changes after hashing', async () => {
    const source = binding();
    await saveSourceBoundTranscriptionV2(source, {
      transcription: transcription(),
      timingEvidence: measuredTiming(),
    });
    const [id, stored] = [...persistence.documents.entries()][0]!;
    persistence.documents.set(id, {
      ...stored,
      transcription: {
        ...(stored.transcription as Record<string, unknown>),
        transcript: 'tampered',
      },
    });

    await expect(getSourceBoundTranscriptionV2(source)).rejects.toThrow(
      'ASSET_TRANSCRIPTION_SOURCE_CACHE_TRANSCRIPTION_HASH_MISMATCH',
    );
  });

  it('recomputes hashes before admitting public evidence as frame-addressable', async () => {
    const source = binding();
    const evidence = await saveSourceBoundTranscriptionV2(source, {
      transcription: transcription(),
      timingEvidence: measuredTiming(),
    });
    const forged = structuredClone(evidence);
    forged.transcription.transcript = 'tampered';

    expect(() => isAssetTranscriptionFrameAddressableV2(forged)).toThrow(
      'ASSET_TRANSCRIPTION_EVIDENCE_TRANSCRIPTION_HASH_MISMATCH',
    );
  });

  it('rejects estimated timing for a measured-word binding', async () => {
    const source = binding();

    await expect(saveSourceBoundTranscriptionV2(source, {
      transcription: transcription(),
      timingEvidence: measuredTiming({ timingBasis: 'SEGMENT_ESTIMATED' }),
    })).rejects.toThrow('ASSET_TRANSCRIPTION_PRECISION_UNSATISFIED');
    await expect(saveSourceBoundTranscriptionV2(source, {
      transcription: transcription({
        words: [{ word: 'hello', startMs: 400, endMs: 500, confidence: 0.9 }, {
          word: 'again', startMs: 200, endMs: 300, confidence: 0.9,
        }],
      }),
      timingEvidence: measuredTiming(),
    })).rejects.toThrow('ASSET_TRANSCRIPTION_WORD_TIMING_INVALID');
    expect(persistence.updateOne).not.toHaveBeenCalled();
  });

  it('stores no-speech evidence without pretending it is frame-addressable', async () => {
    const source = binding();
    const evidence = await saveSourceBoundTranscriptionV2(source, {
      transcription: transcription({ words: [], transcript: '' }),
      timingEvidence: measuredTiming({
        timingBasis: 'NO_SPEECH',
        modelId: 'silence-classifier-v1',
      }),
    });

    expect(evidence.transcription.words).toEqual([]);
    expect(isAssetTranscriptionFrameAddressableV2(evidence)).toBe(false);
  });
});

function binding(overrides: Partial<{
  sourceRole: 'DIRECT' | 'PROXY' | 'MASTER';
  sourceVersion: ReturnType<typeof sourceVersion>;
  requestedLanguage: string | null;
  precision: 'TEXT_ALLOWED' | 'MEASURED_WORD_REQUIRED';
}> = {}) {
  return createAssetTranscriptionSourceBindingV2({
    userId: 'user-1',
    assetId: 'asset-1',
    sourceRole: 'PROXY',
    sourceVersion: sourceVersion('selected'),
    requestedLanguage: null,
    precision: 'MEASURED_WORD_REQUIRED',
    ...overrides,
  });
}

function sourceVersion(tag: string) {
  const storageVersion = createMediaSourceStorageVersionV1({
    locator: { provider: 'R2', objectKey: `private/${tag}.mp4` },
    byteLength: 4_096,
    providerVersion: { kind: 'R2_ETAG', value: `etag-${tag}` },
  });
  return createMediaSourceVersionV1({
    owner: { kind: 'USER', userId: 'user-1' },
    assetId: 'asset-1',
    mediaKind: 'video',
    byteLength: 4_096,
    contentSha256: tag === 'selected' ? 'a'.repeat(64) : 'b'.repeat(64),
    storageVersion,
  });
}

function transcription(overrides: Record<string, unknown> = {}) {
  return {
    words: [{ word: 'hello', startMs: 100, endMs: 400, confidence: 0.95 }],
    transcript: 'hello',
    language: 'en',
    confidence: 0.95,
    generatedAt: new Date('2026-08-31T12:00:00.000Z'),
    ...overrides,
  };
}

function measuredTiming(
  overrides: Partial<AssetTranscriptionTimingEvidenceV2> = {},
): AssetTranscriptionTimingEvidenceV2 {
  return {
    timingBasis: 'MEASURED_WORD',
    providerId: 'xai',
    modelId: 'grok-stt',
    strategy: 'grok-stt-word-timing',
    providerContractVersion: '2026-08-31',
    ...overrides,
  };
}
