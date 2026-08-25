import { describe, expect, it } from 'vitest';

import {
  MEDIA_SOURCE_PROBE_CLAIM_STALE_MS_V1,
  claimMediaSourceQualificationV1,
  completeMediaSourceQualificationV1,
  createMediaSourceQualificationV1,
  resolveMediaSourceStorageLocatorV1,
} from '@/lib/editron/services/media-source-qualification-v1';

const initialNow = new Date('2026-08-25T04:00:00.000Z');

describe('MediaSourceQualificationV1', () => {
  it('embeds a stable, source-bound pending job for a registered R2 user upload', () => {
    const first = created();
    const second = created(new Date('2026-08-25T05:00:00.000Z'));

    expect(first).toMatchObject({
      status: 'PENDING',
      assetId: 'asset_a',
      locator: { provider: 'R2', objectKey: 'r2-key-a' },
      attemptCount: 0,
      observation: null,
      diagnostic: null,
    });
    expect(first.sourceBindingSha256).toBe(second.sourceBindingSha256);
    expect(first.requestId).toBe(`media-source-probe:${first.sourceBindingSha256}`);
  });

  it('never substitutes a public URL, legacy asset id, or unproven mirror for a source locator', () => {
    expect(createMediaSourceQualificationV1({
      asset: { assetId: 'public_a', source: 'public', gcsPath: null }, now: initialNow,
    })).toEqual({
      disposition: 'UNAVAILABLE', record: null, diagnostic: 'MEDIA_SOURCE_NOT_USER_UPLOAD',
    });
    expect(createMediaSourceQualificationV1({
      asset: { assetId: 'legacy_a', source: 'user-upload', gcsPath: null, r2Key: null }, now: initialNow,
    })).toEqual({
      disposition: 'UNAVAILABLE', record: null, diagnostic: 'MEDIA_SOURCE_STORAGE_LOCATOR_MISSING',
    });
    expect(resolveMediaSourceStorageLocatorV1({
      assetId: 'dual_a', source: 'user-upload', r2Key: 'r2-primary', gcsPath: 'gcs-mirror',
    })).toEqual({ provider: 'R2', objectKey: 'r2-primary' });
  });

  it('allows only the exact source binding to claim or complete, with a bounded stale retry', () => {
    const pending = created();
    const wrongClaim = claimMediaSourceQualificationV1({
      record: pending, sourceBindingSha256: 'f'.repeat(64), now: initialNow,
    });
    expect(wrongClaim).toMatchObject({ disposition: 'NOT_CLAIMED', reason: 'SOURCE_BINDING_MISMATCH' });

    const claim = claimMediaSourceQualificationV1({
      record: pending, sourceBindingSha256: pending.sourceBindingSha256, now: initialNow,
    });
    expect(claim).toMatchObject({ disposition: 'CLAIMED', record: { status: 'PROBING', attemptCount: 1 } });
    if (claim.disposition !== 'CLAIMED') throw new Error('expected source-probe claim');

    expect(claimMediaSourceQualificationV1({
      record: claim.record, sourceBindingSha256: claim.record.sourceBindingSha256,
      now: new Date(initialNow.getTime() + MEDIA_SOURCE_PROBE_CLAIM_STALE_MS_V1 - 1),
    })).toMatchObject({ disposition: 'NOT_CLAIMED', reason: 'ACTIVE_CLAIM' });
    expect(claimMediaSourceQualificationV1({
      record: claim.record, sourceBindingSha256: claim.record.sourceBindingSha256,
      now: new Date(initialNow.getTime() + MEDIA_SOURCE_PROBE_CLAIM_STALE_MS_V1),
    })).toMatchObject({ disposition: 'CLAIMED', record: { attemptCount: 2 } });
  });

  it('records a measured probe as technical evidence only and retains an explicit unavailable state', () => {
    const claim = claimMediaSourceQualificationV1({
      record: created(), sourceBindingSha256: created().sourceBindingSha256, now: initialNow,
    });
    if (claim.disposition !== 'CLAIMED') throw new Error('expected source-probe claim');

    const measured = completeMediaSourceQualificationV1({
      record: claim.record,
      sourceBindingSha256: claim.record.sourceBindingSha256,
      result: {
        disposition: 'MEASURED', diagnostics: [], observation: {
          schemaVersion: 1, kind: 'EDITRON_MEDIA_SOURCE_PROBE_V1', probeVersion: 'ffprobe-test',
          formatName: 'mov', durationMilliseconds: 5_000, startTimeMilliseconds: 0,
          videoStreams: [], audioStreams: [{
            streamIndex: 0, codec: 'aac', sampleRate: '48000', channelCount: 2,
            channelLayout: 'stereo', sourceTimebase: { numerator: '1', denominator: '48000' },
          }], observationSha256: 'a'.repeat(64),
        },
      },
      now: new Date('2026-08-25T04:01:00.000Z'),
    });
    expect(measured).toMatchObject({
      disposition: 'COMPLETED', record: { status: 'MEASURED_TECHNICAL', diagnostic: null },
    });
    expect(JSON.stringify(measured)).not.toContain('QUALIFIED');

    const unavailableClaim = claimMediaSourceQualificationV1({
      record: created(), sourceBindingSha256: created().sourceBindingSha256, now: initialNow,
    });
    if (unavailableClaim.disposition !== 'CLAIMED') throw new Error('expected source-probe claim');
    expect(completeMediaSourceQualificationV1({
      record: unavailableClaim.record,
      sourceBindingSha256: unavailableClaim.record.sourceBindingSha256,
      result: {
        disposition: 'UNVERIFIABLE', observation: null,
        diagnostics: ['MEDIA_SOURCE_PROBE_NOT_CONFIGURED'],
      },
      now: new Date('2026-08-25T04:01:00.000Z'),
    })).toMatchObject({
      disposition: 'COMPLETED',
      record: { status: 'UNVERIFIABLE', diagnostic: 'MEDIA_SOURCE_PROBE_NOT_CONFIGURED', observation: null },
    });
  });
});

function created(now = initialNow) {
  const result = createMediaSourceQualificationV1({
    asset: { assetId: 'asset_a', source: 'user-upload', r2Key: 'r2-key-a', gcsPath: null },
    now,
  });
  if (result.disposition !== 'CREATED') throw new Error('expected source qualification record');
  return result.record;
}
