import { describe, expect, it, vi } from 'vitest';

import {
  createMediaSourcePtsCadenceR2RuntimePortsV1,
  resolveMediaSourcePtsCadenceR2RuntimeConfigurationV1,
} from '@/lib/editron/services/media-source-pts-cadence-r2-runtime-v1';

const validEnvironment = {
  EDITRON_MEDIA_PTS_R2_ACCOUNT_ID: 'a'.repeat(32),
  EDITRON_MEDIA_PTS_R2_ACCESS_KEY_ID: 'private-access-key',
  EDITRON_MEDIA_PTS_R2_SECRET_ACCESS_KEY: 'private-secret-key',
  EDITRON_MEDIA_PTS_R2_BUCKET_NAME: 'editron-media-pts-private',
};

describe('media source PTS cadence private R2 runtime V1', () => {
  it('creates every private adapter over one dedicated client and scope', () => {
    const client = { send: vi.fn(async () => ({})) };
    const clientFactory = vi.fn(() => client);
    const runtime = createMediaSourcePtsCadenceR2RuntimePortsV1(
      validEnvironment,
      { clientFactory },
    );

    expect(clientFactory).toHaveBeenCalledWith({
      endpoint: `https://${'a'.repeat(32)}.r2.cloudflarestorage.com`,
      region: 'auto',
      credentials: {
        accessKeyId: 'private-access-key',
        secretAccessKey: 'private-secret-key',
      },
    });
    expect(runtime.configuration).toMatchObject({
      configured: true,
      privateStorage: {
        bucketName: 'editron-media-pts-private',
        browserRouteExposure: 'NO_BROWSER_ROUTE',
      },
    });
    expect(runtime.stagingReader.read).toBeTypeOf('function');
    expect(runtime.descriptorPort.writeImmutableShard).toBeTypeOf('function');
    expect(runtime.artifactPort.writeImmutableFrameBatch).toBeTypeOf('function');
    expect(runtime.lifecycleManifestReader.read).toBeTypeOf('function');
  });

  it.each([
    [{ ...validEnvironment, EDITRON_MEDIA_PTS_R2_ACCOUNT_ID: '' }, 'MISSING_ACCOUNT_ID'],
    [{ ...validEnvironment, EDITRON_MEDIA_PTS_R2_ACCOUNT_ID: 'not-an-account' }, 'INVALID_ACCOUNT_ID'],
    [{ ...validEnvironment, EDITRON_MEDIA_PTS_R2_ACCESS_KEY_ID: '' }, 'MISSING_ACCESS_KEY_ID'],
    [{ ...validEnvironment, EDITRON_MEDIA_PTS_R2_SECRET_ACCESS_KEY: '' }, 'MISSING_SECRET_ACCESS_KEY'],
    [{ ...validEnvironment, EDITRON_MEDIA_PTS_R2_BUCKET_NAME: '' }, 'MISSING_BUCKET_NAME'],
    [{ ...validEnvironment, EDITRON_MEDIA_PTS_R2_BUCKET_NAME: 'editron-cdn' }, 'INVALID_OR_PUBLIC_BUCKET'],
    [{ ...validEnvironment, EDITRON_MEDIA_PTS_R2_BUCKET_NAME: 'Bad_Bucket' }, 'INVALID_OR_PUBLIC_BUCKET'],
  ] as const)('fails closed for unsafe or incomplete private storage %#', (environment, reason) => {
    expect(resolveMediaSourcePtsCadenceR2RuntimeConfigurationV1(environment)).toEqual({
      configured: false,
      reason,
      endpoint: null,
      privateStorage: null,
    });
    expect(() => createMediaSourcePtsCadenceR2RuntimePortsV1(environment))
      .toThrow(`MEDIA_SOURCE_PTS_R2_RUNTIME_NOT_CONFIGURED:${reason}`);
  });

  it('does not fall back to generic R2 credentials or a public bucket', () => {
    expect(resolveMediaSourcePtsCadenceR2RuntimeConfigurationV1({
      R2_ACCOUNT_ID: 'a'.repeat(32),
      R2_ACCESS_KEY_ID: 'generic-access',
      R2_SECRET_ACCESS_KEY: 'generic-secret',
      R2_BUCKET_NAME: 'editron-cdn',
    } as Record<string, string>)).toMatchObject({
      configured: false,
      reason: 'MISSING_ACCOUNT_ID',
    });
  });
});
