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
  getSourceBoundTranscriptionV2,
  saveSourceBoundTranscriptionV2,
} from '@/lib/editron/services/asset-transcription-source-cache-v2';
import { createMediaSourceStorageVersionV1 }
  from '@/lib/editron/services/media-source-storage-version-v1';
import { createMediaSourceVersionV1 }
  from '@/lib/editron/services/media-source-version-v1';
import {
  resolveSourceBoundAssetTranscriptionV2,
  type SourceBoundAssetTranscriptionInputV2,
  type SourceBoundAssetTranscriptionPortsV2,
} from '@/lib/editron/services/source-bound-asset-transcription-v2';
import {
  createSourceTranscriptionEgressAuthorizationV1,
} from '@/lib/editron/services/source-transcription-egress-authorization-v1';
import type { ProjectRevisionV1 }
  from '@/lib/editron/services/project-service';
import {
  issueSourceMediaRightsV1,
  type SourceMediaRightsGrantStateV1,
} from '@/lib/editron/services/source-media-rights-owner-v1';

const NOW = new Date('2026-08-31T12:00:00.000Z');
const REVISION = Object.freeze({
  schemaVersion: 1 as const,
  value: 7,
  compatibilityUpdatedAt: '2026-08-31T11:50:00.000Z',
});

describe('source-bound asset transcription V2', () => {
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

  it('orders authorized generation and reuses the cache without provider owners', async () => {
    const runtime = await harness();
    const generated = await runtime.run();

    expect(generated.disposition).toBe('GENERATED');
    expect(runtime.events).toEqual([
      'cache:get', 'rights', 'revision', 'egress', 'lease:open', 'provider',
      'lease:revalidate', 'rights', 'revision', 'cache:save', 'revision',
    ]);
    expect(runtime.transcribe).toHaveBeenCalledWith(expect.objectContaining({
      sourceUrl: 'https://lease.example.com/source.wav?signature=exact',
      approvedProviderIds: ['deepgram'],
    }));
    if (generated.disposition !== 'GENERATED') throw new Error('expected generation');
    expect(generated.evidence.processingEvidence).toMatchObject({
      mode: 'EXTERNAL_PROVIDER',
      request: {
        projectId: 'project-1',
        sourceRightsAuthorizationReceiptSha256:
          generated.sourceRightsAuthorization.receiptSha256,
      },
      authorization: { approvedProviderIds: ['deepgram'] },
    });

    runtime.events.length = 0;
    const providerCalls = runtime.transcribe.mock.calls.length;
    const cacheWrites = runtime.save.mock.calls.length;
    const cached = await runtime.run({
      egressPolicyOwner: undefined,
      sourceLeasePort: undefined,
      providerTranscriber: undefined,
    });

    expect(cached.disposition).toBe('CACHE_HIT');
    expect(runtime.events).toEqual(['cache:get', 'rights', 'revision']);
    expect(runtime.transcribe).toHaveBeenCalledTimes(providerCalls);
    expect(runtime.save).toHaveBeenCalledTimes(cacheWrites);
  });

  it('keeps CACHE_ONLY cache misses read-only before provider owners', async () => {
    const runtime = await harness();

    expect(await runtime.run({}, { mode: 'CACHE_ONLY' })).toEqual({
      disposition: 'BLOCKED',
      diagnosticCode: 'ASSET_TRANSCRIPTION_CACHE_MISS',
    });
    expect(runtime.events).toEqual(['cache:get', 'rights', 'revision']);
    expect(runtime.egressAuthorize).not.toHaveBeenCalled();
    expect(runtime.openLease).not.toHaveBeenCalled();
    expect(runtime.transcribe).not.toHaveBeenCalled();
    expect(runtime.save).not.toHaveBeenCalled();
  });

  it('rejects an invalid orchestration mode before reading the cache', async () => {
    const runtime = await harness();

    expect(await runtime.run({}, { mode: 'INVALID' as never })).toEqual({
      disposition: 'BLOCKED',
      diagnosticCode: 'ASSET_TRANSCRIPTION_MODE_INVALID',
    });
    expect(runtime.events).toEqual([]);
  });

  it('rejects corrupt cache evidence before rights, policy, lease, or provider work', async () => {
    const runtime = await harness();
    const get = vi.fn(async () => ({} as never));
    const result = await runtime.run({
      cache: { get, save: runtime.save },
    });

    expect(result).toEqual({
      disposition: 'BLOCKED',
      diagnosticCode: 'ASSET_TRANSCRIPTION_EVIDENCE_FIELDS_INVALID',
    });
    expect(runtime.rightsReader.read).not.toHaveBeenCalled();
    expect(runtime.egressAuthorize).not.toHaveBeenCalled();
    expect(runtime.transcribe).not.toHaveBeenCalled();
  });

  it('stops denied egress and provider failures without writing or inventing no-speech', async () => {
    const denied = await harness();
    denied.egressAuthorize.mockResolvedValueOnce({});
    const deniedResult = await denied.run();
    expect(deniedResult).toEqual({
      disposition: 'BLOCKED',
      diagnosticCode: 'SOURCE_TRANSCRIPTION_EGRESS_AUTHORIZATION_FIELDS_INVALID',
    });
    expect(denied.openLease).not.toHaveBeenCalled();
    expect(denied.save).not.toHaveBeenCalled();

    const failed = await harness();
    failed.transcribe.mockRejectedValueOnce(new Error('provider transport failed'));
    const failedResult = await failed.run();
    expect(failedResult).toEqual({
      disposition: 'BLOCKED',
      diagnosticCode: 'ASSET_TRANSCRIPTION_PROVIDER_UNVERIFIABLE',
    });
    expect(failed.save).not.toHaveBeenCalled();
  });

  it('blocks unapproved provider output and a stale source lease before cache save', async () => {
    const unapproved = await harness();
    unapproved.transcribe.mockResolvedValueOnce(generated('xai'));
    const unapprovedResult = await unapproved.run();
    expect(unapprovedResult).toEqual({
      disposition: 'BLOCKED',
      diagnosticCode: 'SOURCE_TRANSCRIPTION_EGRESS_PROVIDER_NOT_APPROVED',
    });
    expect(unapproved.revalidate).not.toHaveBeenCalled();
    expect(unapproved.save).not.toHaveBeenCalled();

    const stale = await harness();
    stale.revalidate.mockResolvedValueOnce(false);
    const staleResult = await stale.run();
    expect(staleResult).toEqual({
      disposition: 'BLOCKED',
      diagnosticCode: 'ASSET_TRANSCRIPTION_SOURCE_LEASE_STALE',
    });
    expect(stale.save).not.toHaveBeenCalled();
  });

  it('rechecks rights and project revision before writing', async () => {
    const rightsLost = await harness();
    rightsLost.rightsReader.read
      .mockResolvedValueOnce(rightsLost.rightsState)
      .mockResolvedValueOnce(null);
    const rightsResult = await rightsLost.run();
    expect(rightsResult).toEqual({
      disposition: 'BLOCKED',
      diagnosticCode: 'SOURCE_MEDIA_RIGHTS_EVIDENCE_MISSING',
    });
    expect(rightsLost.save).not.toHaveBeenCalled();

    const revisionChanged = await harness();
    revisionChanged.getProjectRevision
      .mockResolvedValueOnce(REVISION)
      .mockResolvedValueOnce({ ...REVISION, value: 8 });
    const revisionResult = await revisionChanged.run();
    expect(revisionResult).toEqual({
      disposition: 'BLOCKED',
      diagnosticCode: 'ASSET_TRANSCRIPTION_PROJECT_REVISION_STALE',
    });
    expect(revisionChanged.save).not.toHaveBeenCalled();
  });

  it('withholds stale post-write evidence instead of claiming current consumption', async () => {
    const runtime = await harness();
    runtime.getProjectRevision
      .mockResolvedValueOnce(REVISION)
      .mockResolvedValueOnce(REVISION)
      .mockResolvedValueOnce({ ...REVISION, value: 8 });

    expect(await runtime.run()).toEqual({
      disposition: 'BLOCKED',
      diagnosticCode: 'ASSET_TRANSCRIPTION_PROJECT_REVISION_STALE_AFTER_CACHE_WRITE',
    });
    expect(runtime.save).toHaveBeenCalledTimes(1);
  });
});

async function harness() {
  const sourceVersion = mediaSourceVersion();
  const rightsState = await issueRights(sourceVersion);
  const events: string[] = [];
  const get = vi.fn(async (binding) => {
    events.push('cache:get');
    return getSourceBoundTranscriptionV2(binding);
  });
  const save = vi.fn(async (binding, value) => {
    events.push('cache:save');
    return saveSourceBoundTranscriptionV2(binding, value);
  });
  const rightsReader = {
    read: vi.fn(async (): Promise<SourceMediaRightsGrantStateV1 | null> => {
      events.push('rights');
      return rightsState;
    }),
  };
  const getProjectRevision = vi.fn(async (): Promise<ProjectRevisionV1> => {
    events.push('revision');
    return REVISION;
  });
  const egressAuthorize = vi.fn(async (request): Promise<unknown> => {
    events.push('egress');
    return createSourceTranscriptionEgressAuthorizationV1({
      request,
      approvedProviderIds: ['deepgram'],
      authorizationDecisionRef: artifact('decision'),
      issuedAt: '2026-08-31T11:55:00.000Z',
      expiresAt: '2026-08-31T12:05:00.000Z',
    });
  });
  const revalidate = vi.fn(async () => {
    events.push('lease:revalidate');
    return true;
  });
  const openLease = vi.fn(async () => {
    events.push('lease:open');
    return {
      sourceUrl: 'https://lease.example.com/source.wav?signature=exact',
      storageVersion: sourceVersion.storageVersion,
      revalidate,
    };
  });
  const transcribe = vi.fn(async () => {
    events.push('provider');
    return generated('deepgram');
  });
  const ports = {
    cache: { get, save },
    rightsReader,
    projectRevisionReader: { getProjectRevision },
    egressPolicyOwner: { authorize: egressAuthorize },
    sourceLeasePort: { open: openLease },
    providerTranscriber: { transcribe },
    now: () => NOW,
  } satisfies SourceBoundAssetTranscriptionPortsV2;
  const input: SourceBoundAssetTranscriptionInputV2 = {
    mode: 'FULL',
    tenantId: 'user-1',
    userId: 'user-1',
    orgId: null,
    projectId: 'project-1',
    projectOwnerId: 'user-1',
    projectRevision: REVISION,
    asset: mediaAsset(),
    sourceVersion,
    sourceRole: 'DIRECT' as const,
    requestedLanguage: null,
    precision: 'MEASURED_WORD_REQUIRED' as const,
    eligibleProviderIds: ['deepgram'] as const,
    privacyEgressPolicyRef: artifact('privacy-policy'),
  };
  return {
    events,
    rightsState,
    rightsReader,
    getProjectRevision,
    egressAuthorize,
    openLease,
    revalidate,
    transcribe,
    save,
    run: (
      overrides: Partial<SourceBoundAssetTranscriptionPortsV2> = {},
      inputOverrides: Partial<typeof input> = {},
    ) => resolveSourceBoundAssetTranscriptionV2(
      { ...input, ...inputOverrides },
      { ...ports, ...overrides },
    ),
  };
}

function mediaSourceVersion() {
  const storageVersion = createMediaSourceStorageVersionV1({
    locator: { provider: 'R2', objectKey: 'private/source.wav' },
    byteLength: 4_096,
    providerVersion: { kind: 'R2_ETAG', value: 'etag-source' },
  });
  return createMediaSourceVersionV1({
    owner: { kind: 'USER', userId: 'user-1' },
    assetId: 'asset-1',
    mediaKind: 'audio',
    byteLength: 4_096,
    contentSha256: 'a'.repeat(64),
    storageVersion,
  });
}

function mediaAsset() {
  return {
    assetId: 'asset-1',
    userId: 'user-1',
    type: 'audio' as const,
    filename: 'source.wav',
    source: 'user-upload' as const,
    gcsPath: null,
    cachedUrl: 'https://stale.example.com/source.wav',
    urlExpiresAt: new Date('2026-09-01T00:00:00.000Z'),
    size: 4_096,
    uploadedAt: new Date('2026-08-31T00:00:00.000Z'),
  };
}

function generated(providerId: 'xai' | 'deepgram') {
  return {
    transcription: {
      words: [{ word: 'hello', startMs: 100, endMs: 400, confidence: 0.95 }],
      transcript: 'hello',
      language: 'en',
      confidence: 0.95,
      generatedAt: NOW,
    },
    timingEvidence: {
      timingBasis: 'MEASURED_WORD' as const,
      providerId,
      modelId: providerId === 'deepgram' ? 'nova-2' : 'grok-stt',
      strategy: 'measured-stt',
      providerContractVersion: 'word-v1',
    },
  };
}

async function issueRights(
  sourceVersion: ReturnType<typeof mediaSourceVersion>,
): Promise<SourceMediaRightsGrantStateV1> {
  const result = await issueSourceMediaRightsV1({
    tenantId: 'user-1',
    attestedByUserId: 'user-1',
    orgId: null,
    projectId: 'project-1',
    disposition: 'OWNED_BY_USER',
    sourceVersion,
    termsVersion: 'rights-terms-v1',
    termsContentSha256: 'd'.repeat(64),
    license: null,
    attestedAt: new Date('2026-08-31T11:00:00.000Z'),
    principalAuthority: {
      ownerId: 'PROJECT_ACCESS_AUTHORITY',
      ownerVersion: '1',
      authorize: vi.fn(async () => ({
        disposition: 'AUTHORIZED' as const,
        receiptSha256: 'e'.repeat(64),
      })),
    },
  });
  if (result.disposition !== 'ISSUED') throw new Error(result.diagnosticCode);
  return result.state;
}

function artifact(tag: string) {
  return {
    ownerId: 'POLICY_SERVICE',
    artifactId: tag,
    artifactVersion: '1',
    artifactSha256: tag === 'decision' ? 'b'.repeat(64) : 'c'.repeat(64),
  };
}
