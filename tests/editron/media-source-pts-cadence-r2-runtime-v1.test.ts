import { createHash } from 'node:crypto';

import {
  DeleteObjectCommand,
  GetObjectCommand,
  PutObjectCommand,
} from '@aws-sdk/client-s3';
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

const PNG = Uint8Array.from([137, 80, 78, 71, 13, 10, 26, 10, 1, 2, 3, 4]);
const RGBA = Uint8Array.from([10, 20, 30, 255]);
const NOW = 1_900_000_000_000;

function digest(value: Uint8Array): string {
  return createHash('sha256').update(value).digest('hex');
}

function createMemoryClient() {
  type Stored = Readonly<{
    body: Uint8Array;
    cacheControl: string;
    contentLength: number;
    contentType: string;
    metadata: Record<string, string>;
  }>;
  const objects = new Map<string, Stored>();
  const commands: unknown[] = [];
  const client = {
    async send(command: unknown): Promise<unknown> {
      commands.push(command);
      if (command instanceof PutObjectCommand) {
        const key = String(command.input.Key);
        if (command.input.IfNoneMatch === '*' && objects.has(key)) {
          throw Object.assign(new Error('collision'), {
            name: 'PreconditionFailed',
            $metadata: { httpStatusCode: 412 },
          });
        }
        const body = command.input.Body;
        if (!(body instanceof Uint8Array)
          || typeof command.input.CacheControl !== 'string'
          || typeof command.input.ContentLength !== 'number'
          || typeof command.input.ContentType !== 'string'
          || !command.input.Metadata) {
          throw new Error('invalid test PUT');
        }
        objects.set(key, {
          body: Uint8Array.from(body),
          cacheControl: command.input.CacheControl,
          contentLength: command.input.ContentLength,
          contentType: command.input.ContentType,
          metadata: { ...command.input.Metadata },
        });
        return {};
      }
      if (command instanceof GetObjectCommand) {
        const stored = objects.get(String(command.input.Key));
        if (!stored) {
          throw Object.assign(new Error('missing'), {
            name: 'NoSuchKey',
            $metadata: { httpStatusCode: 404 },
          });
        }
        return {
          Body: Uint8Array.from(stored.body),
          CacheControl: stored.cacheControl,
          ContentLength: stored.contentLength,
          ContentType: stored.contentType,
          Metadata: { ...stored.metadata },
        };
      }
      if (command instanceof DeleteObjectCommand) {
        objects.delete(String(command.input.Key));
        return {};
      }
      return {};
    },
  };
  return { client, commands, objects };
}

function leaseScope() {
  return {
    userId: 'user_preview_owner',
    projectId: 'project_preview_1',
    sequenceId: 'sequence_main',
    overlayId: '42',
    projectRevision: {
      schemaVersion: 1 as const,
      value: 7,
      compatibilityUpdatedAt: '2026-08-29T00:00:00.000Z',
    },
  };
}

function picture() {
  return {
    decoderRequestSha256: 'd'.repeat(64),
    pictureRequest: {
      sourceFrameOrdinal: '12',
      epochId: 'epoch-a',
      presentationTimestampTicks: '10000',
      decoderPictureRequestSha256: 'e'.repeat(64),
    },
    sourceVersionSha256: 'a'.repeat(64),
    storageVersionSha256: 'b'.repeat(64),
    rgbaBytes: RGBA,
    pngBytes: PNG,
    width: 1,
    height: 1,
    decodedPictureContentSha256: digest(RGBA),
  };
}

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
    expect(runtime.proxyMasterCorrespondenceArtifact.read).toBeTypeOf('function');
    expect(runtime.proxyMasterCorrespondenceArtifact.writeAndVerifyArtifactSet)
      .toBeTypeOf('function');
    expect(runtime.stagingReader.read).toBeTypeOf('function');
    expect(runtime.descriptorPort.writeImmutableShard).toBeTypeOf('function');
    expect(runtime.artifactPort.writeImmutableFrameBatch).toBeTypeOf('function');
    expect(runtime.epochIndexWriter.writeImmutableEpochIndex).toBeTypeOf('function');
    expect(runtime.lifecycleManifestReader.read).toBeTypeOf('function');
    expect(runtime.audioArtifact.writeArtifactSetFromPcmStream).toBeTypeOf('function');
    expect(runtime.audioArtifact.readArtifactSet).toBeTypeOf('function');
    expect(runtime.audioArtifact.readPcmSampleRange).toBeTypeOf('function');
    expect(runtime.previewSurface.createStore).toBeTypeOf('function');
    expect(runtime.previewSurface.createReader).toBeTypeOf('function');
  });

  it('stores, rereads, scopes, and explicitly deletes exact private preview pictures', async () => {
    const memory = createMemoryClient();
    const runtime = createMediaSourcePtsCadenceR2RuntimePortsV1(
      validEnvironment,
      { clientFactory: () => memory.client },
    );
    const store = runtime.previewSurface.createStore(leaseScope(), {
      now: () => NOW,
      randomIdentifier: () => '1'.repeat(64),
    });

    const stored = await store.putPicture(picture());
    expect(stored).toEqual({ pictureHandle: `nmpv1_${'1'.repeat(64)}` });
    const put = memory.commands.find(
      (command): command is PutObjectCommand => command instanceof PutObjectCommand,
    );
    expect(put?.input).toMatchObject({
      Bucket: 'editron-media-pts-private',
      Key: `private/editron/native-media-preview/v1/${'1'.repeat(64)}.png`,
      CacheControl: 'private, no-store, max-age=0',
      ContentType: 'image/png',
      ContentLength: PNG.byteLength,
      IfNoneMatch: '*',
    });
    expect(put?.input.Key).not.toContain(leaseScope().projectId);
    expect(put?.input.Metadata?.binding).toMatch(/^[a-f0-9]{64}$/);

    const reader = runtime.previewSurface.createReader({ now: () => NOW + 1 });
    const read = await reader.readPicture(stored.pictureHandle);
    expect(read).toMatchObject({
      disposition: 'AVAILABLE',
      binding: {
        pictureHandle: stored.pictureHandle,
        userId: leaseScope().userId,
        projectId: leaseScope().projectId,
        projectRevision: leaseScope().projectRevision,
        decoderRequestSha256: 'd'.repeat(64),
        decoderPictureRequestSha256: 'e'.repeat(64),
        sourceVersionSha256: 'a'.repeat(64),
        storageVersionSha256: 'b'.repeat(64),
        decodedPictureContentSha256: digest(RGBA),
        pngContentSha256: digest(PNG),
        pngByteLength: PNG.byteLength,
        expiresAtEpochMs: NOW + 60 * 60 * 1_000,
      },
      pngBytes: PNG,
    });

    await store.deletePicture(stored.pictureHandle);
    await expect(reader.readPicture(stored.pictureHandle)).resolves.toEqual({
      disposition: 'NOT_FOUND',
      pictureHandle: stored.pictureHandle,
    });
  });

  it('retries opaque-handle collisions and rejects altered binding metadata', async () => {
    const memory = createMemoryClient();
    const runtime = createMediaSourcePtsCadenceR2RuntimePortsV1(
      validEnvironment,
      { clientFactory: () => memory.client },
    );
    const first = runtime.previewSurface.createStore(leaseScope(), {
      now: () => NOW,
      randomIdentifier: () => '2'.repeat(64),
    });
    await first.putPicture(picture());

    const identifiers = ['2'.repeat(64), '3'.repeat(64)];
    const second = runtime.previewSurface.createStore(leaseScope(), {
      now: () => NOW,
      randomIdentifier: () => identifiers.shift()!,
    });
    const stored = await second.putPicture(picture());
    expect(stored.pictureHandle).toBe(`nmpv1_${'3'.repeat(64)}`);

    const key = `private/editron/native-media-preview/v1/${'3'.repeat(64)}.png`;
    const original = memory.objects.get(key)!;
    memory.objects.set(key, {
      ...original,
      metadata: { ...original.metadata, project: Buffer.from('other-project').toString('base64url') },
    });
    const reader = runtime.previewSurface.createReader({ now: () => NOW + 1 });
    await expect(reader.readPicture(stored.pictureHandle))
      .rejects.toThrow('NATIVE_MEDIA_PREVIEW_SURFACE_BINDING_MISMATCH');
  });

  it('fails closed after lease expiry and removes the expired private object', async () => {
    const memory = createMemoryClient();
    const runtime = createMediaSourcePtsCadenceR2RuntimePortsV1(
      validEnvironment,
      { clientFactory: () => memory.client },
    );
    const store = runtime.previewSurface.createStore(leaseScope(), {
      now: () => NOW,
      randomIdentifier: () => '4'.repeat(64),
    });
    const stored = await store.putPicture(picture());
    const reader = runtime.previewSurface.createReader({
      now: () => NOW + 60 * 60 * 1_000,
    });

    await expect(reader.readPicture(stored.pictureHandle)).resolves.toMatchObject({
      disposition: 'EXPIRED',
      binding: { pictureHandle: stored.pictureHandle },
    });
    expect(memory.objects).toHaveLength(0);
    expect(memory.commands.some((command) => command instanceof DeleteObjectCommand)).toBe(true);
    await expect(reader.readPicture('not-a-handle'))
      .rejects.toThrow('NATIVE_MEDIA_PREVIEW_SURFACE_HANDLE_INVALID');
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
