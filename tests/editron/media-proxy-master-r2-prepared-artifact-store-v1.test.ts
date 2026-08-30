import { createHash } from 'node:crypto';
import { access, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

import {
  GetObjectCommand,
  HeadObjectCommand,
  PutObjectCommand,
} from '@aws-sdk/client-s3';
import { afterEach, describe, expect, it } from 'vitest';

import { createMediaProxyMasterR2PreparedArtifactPolicyV1 }
  from '@/lib/editron/services/media-proxy-master-r2-prepared-artifact-policy-v1';
import { createMediaProxyMasterR2PreparedArtifactStoreV1 }
  from '@/lib/editron/services/media-proxy-master-r2-prepared-artifact-store-v1';
import { createMediaProxyMasterR2PrivatePublicationPolicyV2 }
  from '@/lib/editron/services/media-proxy-master-r2-private-publication-policy-v2';

const MiB = 1024 * 1024;
const RETAIN_UNTIL = '2026-11-28T10:00:00.000Z';
const temporaryDirectories: string[] = [];

afterEach(async () => {
  while (temporaryDirectories.length > 0) {
    const directory = path.resolve(temporaryDirectories.pop()!);
    if (!directory.startsWith(`${path.resolve(tmpdir())}${path.sep}`)
      || !path.basename(directory).startsWith('editron-prepared-r2-test-')) {
      throw new Error('TEST_TEMP_DIRECTORY_INVALID');
    }
    await rm(directory, { force: true, recursive: true });
  }
});

describe('MediaProxyMasterR2PreparedArtifactStoreV1', () => {
  it('stages exact chunks, recovers without the source file, and reopens bytes', async () => {
    const fixture = await createFixture();
    const reference = await fixture.store.stage(fixture.stageInput);
    await rm(fixture.sourcePath);

    const replay = await fixture.store.stage(fixture.stageInput);
    const reopened = await fixture.store.reopen({
      policy: fixture.policy,
      reference: replay,
      outputPath: fixture.outputPath,
    });

    expect(replay).toEqual(reference);
    expect(reopened).toMatchObject({
      localPath: fixture.outputPath,
      byteLength: fixture.bytes.byteLength,
      contentSha256: fixture.contentSha256,
      artifactHandle: reference.artifactHandle,
    });
    expect(await readFile(fixture.outputPath)).toEqual(fixture.bytes);
    expect([...fixture.memory.objects.keys()].filter((key) => key.endsWith('.bin')))
      .toHaveLength(2);
    expect([...fixture.memory.objects.keys()].filter((key) => key.endsWith('manifest.json')))
      .toHaveLength(1);
    expect(fixture.memory.commands.some((value) => value instanceof GetObjectCommand))
      .toBe(true);
    expect(fixture.memory.commands.some((value) => value instanceof HeadObjectCommand))
      .toBe(true);
    expect(Object.keys(reference)).not.toContain('localPath');
  });

  it('recovers a committed manifest when the write response is lost', async () => {
    const fixture = await createFixture();
    fixture.memory.throwAfterManifestPut = true;

    const reference = await fixture.store.stage(fixture.stageInput);

    expect(reference.manifestObjectKey).toMatch(/manifest\.json$/);
    expect(fixture.memory.commands.filter((value) => value instanceof PutObjectCommand))
      .toHaveLength(3);
  });

  it('rejects corrupt durable chunks and removes the partial reopened output', async () => {
    const fixture = await createFixture();
    const reference = await fixture.store.stage(fixture.stageInput);
    const chunk = [...fixture.memory.objects.entries()]
      .find(([key]) => key.endsWith('.bin'))!;
    chunk[1].bytes[0] ^= 0xff;

    await expect(fixture.store.reopen({
      policy: fixture.policy,
      reference,
      outputPath: fixture.outputPath,
    })).rejects.toThrow('CHUNK_CONTENT_MISMATCH');
    await expect(access(fixture.outputPath)).rejects.toThrow();
  });

  it('rejects provider drift, existing outputs, policy drift, and aborts', async () => {
    const drift = await createFixture();
    const reference = await drift.store.stage(drift.stageInput);
    drift.memory.headETagOverride = 'changed-provider-version';
    await expect(drift.store.reopen({
      policy: drift.policy,
      reference,
      outputPath: drift.outputPath,
    })).rejects.toThrow('MANIFEST_PROVIDER_VERSION_CHANGED');

    const existing = await createFixture();
    const existingReference = await existing.store.stage(existing.stageInput);
    await writeFile(existing.outputPath, 'must-not-overwrite');
    await expect(existing.store.reopen({
      policy: existing.policy,
      reference: existingReference,
      outputPath: existing.outputPath,
    })).rejects.toThrow('OUTPUT_CREATE_FAILED');
    expect(await readFile(existing.outputPath, 'utf8')).toBe('must-not-overwrite');

    const policyDrift = await createFixture();
    const otherPolicy = createPolicy(5 * MiB, {
      ...privateStorage(),
      storagePolicyVersion: 'different-private-policy-v1',
    });
    await expect(policyDrift.store.stage({
      ...policyDrift.stageInput,
      policy: otherPolicy,
    })).rejects.toThrow('POLICY_STORAGE_MISMATCH');

    const aborted = await createFixture();
    const controller = new AbortController();
    controller.abort();
    await expect(aborted.store.stage({
      ...aborted.stageInput,
      abortSignal: controller.signal,
    })).rejects.toThrow('ABORTED');
    expect(aborted.memory.commands).toHaveLength(0);
  });
});

type StoredObject = {
  bytes: Uint8Array;
  cacheControl: string;
  contentDisposition: string;
  contentType: string;
  metadata: Record<string, string>;
  eTag: string;
};

async function createFixture() {
  const directory = await mkdtemp(path.join(tmpdir(), 'editron-prepared-r2-test-'));
  temporaryDirectories.push(directory);
  const sourcePath = path.join(directory, 'proxy.mp4');
  const outputPath = path.join(directory, 'reopened.mp4');
  const bytes = Buffer.alloc(5 * MiB + 17);
  for (let index = 0; index < bytes.byteLength; index += 1) {
    bytes[index] = index % 251;
  }
  await writeFile(sourcePath, bytes);
  const contentSha256 = shaBytes(bytes);
  const policy = createPolicy(5 * MiB);
  const memory = memoryR2();
  let clockTick = 0;
  const store = createMediaProxyMasterR2PreparedArtifactStoreV1({
    privateStorage: privateStorage(),
    client: memory.client,
    now: () => new Date(Date.UTC(2026, 7, 30, 10, 0, clockTick++)).toISOString(),
  });
  const stageInput = {
    policy,
    localPath: sourcePath,
    jobId: 'job_1',
    tenantId: 'tenant_1',
    userId: 'user_1',
    orgId: null,
    owner: { kind: 'USER' as const, userId: 'user_1' },
    assetId: 'asset_1',
    commandSha256: sha('command'),
    outputProbeSha256: sha('probe'),
    artifactByteLength: bytes.byteLength,
    artifactContentSha256: contentSha256,
    retainUntil: RETAIN_UNTIL,
  };
  return {
    directory,
    sourcePath,
    outputPath,
    bytes,
    contentSha256,
    policy,
    memory,
    store,
    stageInput,
  };
}

function memoryR2() {
  const objects = new Map<string, StoredObject>();
  const commands: unknown[] = [];
  const state = {
    objects,
    commands,
    throwAfterManifestPut: false,
    headETagOverride: null as string | null,
    client: {
      async send(command: unknown): Promise<unknown> {
        commands.push(command);
        if (command instanceof PutObjectCommand) {
          const key = String(command.input.Key);
          if (objects.has(key)) {
            throw Object.assign(new Error('collision'), {
              name: 'PreconditionFailed',
              $metadata: { httpStatusCode: 412 },
            });
          }
          const bytes = await collectBytes(command.input.Body);
          const eTag = shaBytes(bytes);
          const stored = {
            bytes,
            cacheControl: String(command.input.CacheControl),
            contentDisposition: String(command.input.ContentDisposition),
            contentType: String(command.input.ContentType),
            metadata: { ...(command.input.Metadata ?? {}) },
            eTag,
          };
          objects.set(key, stored);
          if (state.throwAfterManifestPut && key.endsWith('manifest.json')) {
            throw new Error('RESPONSE_LOST_AFTER_COMMIT');
          }
          return { ETag: `\"${eTag}\"` };
        }
        if (command instanceof GetObjectCommand) {
          const stored = objects.get(String(command.input.Key));
          if (!stored) throw missing();
          return response(stored, chunked(stored.bytes));
        }
        if (command instanceof HeadObjectCommand) {
          const stored = objects.get(String(command.input.Key));
          if (!stored) throw missing();
          return response(
            stored,
            undefined,
            state.headETagOverride ?? stored.eTag,
          );
        }
        throw new Error('TEST_COMMAND_UNEXPECTED');
      },
    },
  };
  return state;
}

function response(
  stored: StoredObject,
  body?: AsyncIterable<Uint8Array>,
  eTag = stored.eTag,
) {
  return {
    ...(body === undefined ? {} : { Body: body }),
    CacheControl: stored.cacheControl,
    ContentDisposition: stored.contentDisposition,
    ContentLength: stored.bytes.byteLength,
    ContentType: stored.contentType,
    ETag: `\"${eTag}\"`,
    Metadata: { ...stored.metadata },
  };
}

async function collectBytes(body: unknown): Promise<Uint8Array> {
  if (body instanceof Uint8Array) return Uint8Array.from(body);
  if (!body || (typeof body !== 'object' && typeof body !== 'function')
    || !(Symbol.asyncIterator in body)) throw new Error('TEST_BODY_INVALID');
  const chunks: Uint8Array[] = [];
  let byteLength = 0;
  for await (const chunk of body as AsyncIterable<unknown>) {
    if (!(chunk instanceof Uint8Array)) throw new Error('TEST_CHUNK_INVALID');
    chunks.push(chunk);
    byteLength += chunk.byteLength;
  }
  return Buffer.concat(
    chunks.map((chunk) => Buffer.from(chunk)),
    byteLength,
  );
}

async function* chunked(bytes: Uint8Array): AsyncGenerator<Uint8Array> {
  const split = Math.max(1, Math.floor(bytes.byteLength / 2));
  yield bytes.subarray(0, split);
  yield bytes.subarray(split);
}

function missing() {
  return Object.assign(new Error('missing'), {
    name: 'NoSuchKey',
    $metadata: { httpStatusCode: 404 },
  });
}

function createPolicy(
  targetChunkBytes: number,
  storage = privateStorage(),
) {
  return createMediaProxyMasterR2PreparedArtifactPolicyV1({
    publicationPolicy: createMediaProxyMasterR2PrivatePublicationPolicyV2(
      storage,
    ),
    targetChunkBytes,
    maximumManifestBytes: 8 * MiB,
  });
}

function privateStorage() {
  return {
    bucketName: 'editron-media-proxy-private',
    storagePolicyVersion: 'private-proxy-media-v1',
    browserRouteExposure: 'NO_BROWSER_ROUTE' as const,
  };
}

function sha(value: string) {
  return createHash('sha256').update(value, 'utf8').digest('hex');
}

function shaBytes(value: Uint8Array) {
  return createHash('sha256').update(value).digest('hex');
}
