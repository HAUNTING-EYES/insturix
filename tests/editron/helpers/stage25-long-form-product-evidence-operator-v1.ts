import { HeadBucketCommand, S3Client } from '@aws-sdk/client-s3';
import { execFile } from 'node:child_process';
import { createHash, randomUUID } from 'node:crypto';
import { mkdir, readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';

import { parse as parseEnv } from 'dotenv';

import { hashCanonicalJsonV1 } from '../../../lib/editron/research/open-ended-planner/contracts-v1';
import { writeDurableExclusiveJsonV1 } from '../../../lib/editron/research/open-ended-planner/stage25-final-generalisation-paid-filesystem-port-v1';
import {
  STAGE25_ACCEPTED_LONG_FORM_LOCAL_RECEIPT_SHA256_V1,
  STAGE25_LONG_FORM_PRODUCT_OWNER_TEST_FILES_V1,
  finalizeStage25LongFormProductEvidenceV1,
} from '../../../lib/editron/research/open-ended-planner/stage25-long-form-product-evidence-v1';
import { hashEditronCanonicalJsonV1 } from '../../../lib/editron/services/canonical-json-v1';
import { createMediaSourcePtsCadenceMapAssetRecordV2 } from '../../../lib/editron/services/media-source-pts-cadence-map-asset-state-v2';
import { runMediaSourcePtsCadenceMapAssetStoreV2 } from '../../../lib/editron/services/media-source-pts-cadence-map-asset-store-v2';
import { resolveMediaSourcePtsCadenceR2RuntimeConfigurationV1 } from '../../../lib/editron/services/media-source-pts-cadence-r2-runtime-v1';
import { createMediaSourcePtsCadenceShardV1 } from '../../../lib/editron/services/media-source-pts-cadence-shard-v1';
import {
  claimMediaSourceQualificationV1,
  completeMediaSourceQualificationV1,
  createMediaSourceQualificationV1,
} from '../../../lib/editron/services/media-source-qualification-v1';
import { createMediaSourceStorageVersionV1 } from '../../../lib/editron/services/media-source-storage-version-v1';
import { createMediaSourceVersionV1 } from '../../../lib/editron/services/media-source-version-v1';
import { parsePcm16Wav } from '../../../scripts/sfx-render-canary-core';

const execFileAsync = promisify(execFile);
const require = createRequire(import.meta.url);
const VITEST_CLI = require.resolve('vitest/vitest.mjs');
const SOURCE_SCOPES = [
  'lib/editron',
  'tests/editron',
  'components/editron',
  'scripts/run-long-form-render-canary.ts',
  'scripts/long-form-render-canary-core.ts',
  'scripts/sfx-render-canary-core.ts',
  'lib/pipeline/audio-conditioning.ts',
  'package.json',
  'pnpm-lock.yaml',
] as const;
const RENDER_SCOPES = [
  'scripts/run-long-form-render-canary.ts',
  'scripts/long-form-render-canary-core.ts',
  'scripts/sfx-render-canary-core.ts',
  'lib/pipeline/audio-conditioning.ts',
  'lib/editron/shared/render-request-payload.ts',
  'components/editron/editor/version-7.0.0',
] as const;
const LOCAL_TRIAL_PATH = path.join(
  '.calibration-temp',
  'open-ended-planner-v2',
  'stage25-long-form-real-media',
  'stage25-long-form-real-media-a9c93a084-v1',
  'readiness-receipt.json',
);

type JsonRecord = Record<string, unknown>;

export async function runStage25LongFormProductEvidenceOperatorV1(
  input: Readonly<{
    workspaceRoot: string;
    artifactParent: string;
    productionRenderReceiptPath: string;
    renderExecutionSourceCommitSha: string;
    executionSuffix?: string;
    productionEnvironmentFile?: string;
  }>,
) {
  if (!/^[a-f0-9]{40}$/.test(input.renderExecutionSourceCommitSha)) {
    fail('RENDER_SOURCE_COMMIT_INVALID');
  }
  const environment = await installProductionEnvironment(
    input.productionEnvironmentFile ?? path.join(input.workspaceRoot, '.env.local.prod'),
  );
  const source = await sourceIdentity(input.workspaceRoot);
  const suffix = input.executionSuffix ?? 'v1';
  if (!/^v[1-9][0-9]*$/.test(suffix)) fail('EXECUTION_SUFFIX_INVALID');
  const executionId = `stage25-long-form-product-${source.commitSha.slice(0, 9)}-${suffix}`;
  const executionRoot = path.resolve(input.artifactParent, executionId);
  await mkdir(input.artifactParent, { recursive: true });
  await mkdir(executionRoot);

  const ownerTests = await runOwnerTests(input.workspaceRoot, executionRoot);
  const [localLongFormTrial, liveMongo, storage, neo4jDisposition, productionRender] =
    await Promise.all([
      readLocalTrial(path.resolve(input.workspaceRoot, LOCAL_TRIAL_PATH)),
      proveLiveMongo(),
      proveStorage(environment),
      probeNeo4j(),
      readProductionRender({
        workspaceRoot: input.workspaceRoot,
        receiptPath: path.resolve(input.productionRenderReceiptPath),
        executionSourceCommitSha: input.renderExecutionSourceCommitSha,
      }),
    ]);
  const receipt = finalizeStage25LongFormProductEvidenceV1({
    source,
    generatedAt: new Date().toISOString(),
    localLongFormTrial,
    ownerTests,
    liveMongo,
    storage,
    semanticRetrieval: {
      selectedOwner: 'NEO4J_GRAPH_FILTERED_WITH_MONGO_FALLBACK',
      neo4jDisposition,
      mongoEmbeddingRecordCount: liveMongo.semanticEmbeddingAssetCount,
      judgedQueryCount: 0,
      providerEmbeddingCallCount: 0,
      accuracyDisposition: 'UNVERIFIABLE_NO_RIGHTS_CLEARED_QUERY_LABELS',
    },
    productionRender,
  });
  const receiptPath = path.join(executionRoot, 'readiness-receipt.json');
  await writeDurableExclusiveJsonV1({
    filePath: receiptPath,
    value: receipt,
    forbiddenSecrets: sensitiveValues(environment),
  });
  return {
    executionId,
    executionRoot,
    receiptPath,
    receiptSha256: receipt.receiptSha256,
    assessment: receipt.assessment,
    liveMongo: receipt.liveMongo.disposition,
    genericR2: receipt.storage.genericR2Bucket.disposition,
    privatePtsR2: receipt.storage.privatePtsR2.disposition,
    neo4j: receipt.semanticRetrieval.neo4jDisposition,
    productionRender: receipt.productionRender.disposition,
  };
}

async function runOwnerTests(workspaceRoot: string, executionRoot: string) {
  const reportPath = path.join(executionRoot, 'vitest-report.json');
  await execFileAsync(
    process.execPath,
    [
      VITEST_CLI,
      'run',
      ...STAGE25_LONG_FORM_PRODUCT_OWNER_TEST_FILES_V1,
      '--reporter=json',
      `--outputFile=${reportPath}`,
    ],
    {
      cwd: workspaceRoot,
      windowsHide: true,
      timeout: 180_000,
      maxBuffer: 16 * 1024 * 1024,
    },
  );
  const bytes = await readFile(reportPath);
  const report = json(bytes);
  if (
    report.success !== true ||
    report.numFailedTests !== 0 ||
    report.numPassedTests !== report.numTotalTests ||
    !Number.isSafeInteger(report.numPassedTests)
  )
    fail('OWNER_TESTS_FAILED');
  return {
    reportSha256: sha(bytes),
    testFiles: [...STAGE25_LONG_FORM_PRODUCT_OWNER_TEST_FILES_V1],
    passedTestCount: report.numPassedTests as number,
    failedTestCount: 0 as const,
  };
}

async function proveLiveMongo() {
  const { connectToDatabase, COLLECTIONS } = await import('../../../lib/editron/db/mongodb');
  const { client, db } = await connectToDatabase();
  try {
    const collection = db.collection(COLLECTIONS.MEDIA_ASSETS);
    const assetId = `stage25-long-form-${randomUUID()}`;
    const userId = `stage25-proof-${randomUUID()}`;
    const fixture = liveAssetFixture(assetId, userId);
    let inserted = false;
    let persistedStateSha256 = '';
    let cleanupDeletedCount = 0;
    try {
      if ((await collection.countDocuments({ assetId, userId })) !== 0)
        fail('MONGO_FIXTURE_COLLISION');
      const insertedResult = await collection.insertOne(fixture.asset);
      if (!insertedResult.acknowledged) fail('MONGO_FIXTURE_INSERT_FAILED');
      inserted = true;
      const applied = await runMediaSourcePtsCadenceMapAssetStoreV2({
        assetId,
        userId,
        expectedStateSha256: null,
        nextRecord: fixture.record,
      });
      if (applied.disposition !== 'APPLIED') fail('MONGO_V2_CAS_NOT_APPLIED');
      persistedStateSha256 = applied.state.sourcePtsCadenceMapStateSha256V2;
      const stale = await runMediaSourcePtsCadenceMapAssetStoreV2({
        assetId,
        userId,
        expectedStateSha256: null,
        nextRecord: fixture.record,
      });
      if (stale.disposition !== 'REJECTED' || stale.reason !== 'EXPECTED_STATE_MISMATCH') {
        fail('MONGO_STALE_CAS_NOT_REJECTED');
      }
      const persisted = await collection.findOne(
        { assetId, userId },
        {
          projection: { sourcePtsCadenceMapStateSha256V2: 1 },
        },
      );
      if (persisted?.sourcePtsCadenceMapStateSha256V2 !== persistedStateSha256) {
        fail('MONGO_V2_CAS_READBACK_MISMATCH');
      }
    } finally {
      if (inserted)
        cleanupDeletedCount = (await collection.deleteOne({ assetId, userId })).deletedCount;
    }
    const postCleanupFixtureCount = await collection.countDocuments({
      assetId,
      userId,
    });
    if (cleanupDeletedCount !== 1 || postCleanupFixtureCount !== 0)
      fail('MONGO_FIXTURE_CLEANUP_FAILED');
    const [hello, mediaAssetCount, videoAssetCount, ptsV2AssetCount, semanticEmbeddingAssetCount] =
      await Promise.all([
        db.command({ hello: 1 }),
        collection.countDocuments({}),
        collection.countDocuments({ type: 'video' }),
        collection.countDocuments({
          sourcePtsCadenceMapV2: { $exists: true, $ne: null },
        }),
        collection.countDocuments({
          semanticEmbedding: { $type: 'array' },
          'semanticEmbedding.0': { $exists: true },
        }),
      ]);
    const writablePrimary = hello.isWritablePrimary === true || hello.ismaster === true;
    return {
      disposition: 'LIVE_MEDIA_ASSETS_V2_CAS_APPLIED_AND_CLEANED' as const,
      topology: typeof hello.setName === 'string' ? ('REPLICA_SET' as const) : ('OTHER' as const),
      writablePrimary,
      mediaAssetCount,
      videoAssetCount,
      ptsV2AssetCount,
      semanticEmbeddingAssetCount,
      fixtureAssetIdSha256: hashCanonicalJsonV1(assetId),
      initialStoreDisposition: 'APPLIED' as const,
      staleStoreDisposition: 'EXPECTED_STATE_MISMATCH' as const,
      persistedStateSha256,
      cleanupDeletedCount: 1 as const,
      postCleanupFixtureCount: 0 as const,
    };
  } finally {
    await client.close();
  }
}

function liveAssetFixture(assetId: string, userId: string) {
  const objectKey = `private/stage25/${assetId}/source.mov`;
  const storageVersion = createMediaSourceStorageVersionV1({
    locator: { provider: 'R2', objectKey },
    byteLength: 12_345,
    providerVersion: { kind: 'R2_ETAG', value: 'stage25-live-fixture-etag' },
  });
  const sourceVersion = createMediaSourceVersionV1({
    owner: { kind: 'USER', userId },
    assetId,
    mediaKind: 'video',
    byteLength: 12_345,
    contentSha256: 'b'.repeat(64),
    storageVersion,
  });
  const created = createMediaSourceQualificationV1({
    asset: { assetId, source: 'user-upload', r2Key: objectKey },
    now: new Date('2026-08-27T00:00:00.000Z'),
  });
  if (created.disposition !== 'CREATED') fail('MONGO_FIXTURE_QUALIFICATION_CREATE_FAILED');
  const claimed = claimMediaSourceQualificationV1({
    record: created.record,
    sourceBindingSha256: created.record.sourceBindingSha256,
    now: new Date('2026-08-27T00:00:01.000Z'),
  });
  if (claimed.disposition !== 'CLAIMED') fail('MONGO_FIXTURE_QUALIFICATION_CLAIM_FAILED');
  const observationMaterial = {
    schemaVersion: 1 as const,
    kind: 'EDITRON_MEDIA_SOURCE_PROBE_V1' as const,
    probeVersion: 'stage25-live-fixture-v1',
    formatName: 'mov',
    durationMilliseconds: 134,
    startTimeMilliseconds: 0,
    videoStreams: [
      {
        streamIndex: 0,
        codec: 'h264',
        codedWidth: 1920,
        codedHeight: 1080,
        pixelFormat: 'yuv420p',
        sourceTimebase: { numerator: '1', denominator: '90000' },
        sourceStartPts: '0',
        sourceDurationTicks: '12000',
        averageFrameRate: { numerator: '30', denominator: '1' },
        realFrameRate: { numerator: '30', denominator: '1' },
        frameCount: '4',
        colorSpace: 'bt709',
        colorTransfer: 'bt709',
        colorPrimaries: 'bt709',
        colorRange: 'tv',
        timecode: null,
        reelId: null,
      },
    ],
    audioStreams: [],
  };
  const completed = completeMediaSourceQualificationV1({
    record: claimed.record,
    sourceBindingSha256: claimed.record.sourceBindingSha256,
    result: {
      disposition: 'MEASURED',
      diagnostics: [],
      observation: {
        ...observationMaterial,
        observationSha256: hashEditronCanonicalJsonV1(observationMaterial),
      },
    },
    storageVersion,
    now: new Date('2026-08-27T00:00:02.000Z'),
  });
  if (completed.disposition !== 'COMPLETED') fail('MONGO_FIXTURE_QUALIFICATION_COMPLETE_FAILED');
  const shard = createMediaSourcePtsCadenceShardV1({
    sourceVersion,
    qualification: completed.record,
    videoStreamIndex: 0,
    mapper: {
      mapperVersion: 'stage25-live-v1',
      ffprobeVersion: 'ffprobe-8.1',
      commandPolicyVersion: 'stage25-live-v1',
      timestampOrigin: 'FFPROBE_BEST_EFFORT_TIMESTAMP',
    },
    shardSequence: 0,
    firstFrameOrdinal: '0',
    frames: [{ presentationTimestampTicks: '0', durationTicks: '3000' }],
  });
  return {
    asset: {
      assetId,
      userId,
      filename: 'stage25-live-fixture.mov',
      type: 'video',
      sourceVersionV1: sourceVersion,
      sourceQualificationV1: completed.record,
    },
    record: createMediaSourcePtsCadenceMapAssetRecordV2({
      bootstrapShard: shard,
      now: new Date('2026-08-27T00:00:03.000Z'),
    }),
  };
}

async function proveStorage(environment: Record<string, string>) {
  const genericR2Bucket = await probeGenericR2(environment);
  const configuration = resolveMediaSourcePtsCadenceR2RuntimeConfigurationV1(environment);
  if (!configuration.configured) {
    return {
      genericR2Bucket,
      privatePtsR2: {
        disposition: 'NOT_CONFIGURED' as const,
        reason: configuration.reason,
      },
      objectWriteCount: 0 as const,
    };
  }
  const client = new S3Client({
    region: 'auto',
    endpoint: configuration.endpoint,
    forcePathStyle: true,
    credentials: {
      accessKeyId: environment.EDITRON_MEDIA_PTS_R2_ACCESS_KEY_ID!,
      secretAccessKey: environment.EDITRON_MEDIA_PTS_R2_SECRET_ACCESS_KEY!,
    },
  });
  try {
    await client.send(
      new HeadBucketCommand({
        Bucket: configuration.privateStorage.bucketName,
      }),
    );
    return {
      genericR2Bucket,
      privatePtsR2: {
        disposition: 'REACHABLE_DEDICATED_PRIVATE_BUCKET' as const,
        reason: null,
      },
      objectWriteCount: 0 as const,
    };
  } catch (error) {
    return {
      genericR2Bucket,
      privatePtsR2: {
        disposition: 'UNVERIFIABLE_CONFIGURED_PRIVATE_BUCKET' as const,
        reason: storageErrorReason(error),
      },
      objectWriteCount: 0 as const,
    };
  } finally {
    client.destroy();
  }
}

async function probeGenericR2(environment: Record<string, string>) {
  if (
    !environment.R2_ACCOUNT_ID ||
    !environment.R2_ACCESS_KEY_ID ||
    !environment.R2_SECRET_ACCESS_KEY ||
    !environment.R2_BUCKET_NAME
  ) {
    return {
      disposition: 'UNVERIFIABLE' as const,
      reason: 'NOT_CONFIGURED' as const,
    };
  }
  let client: S3Client | null = null;
  try {
    const { getS3Client } = await import('../../../lib/editron/services/r2-service');
    client = getS3Client();
    await client.send(new HeadBucketCommand({ Bucket: environment.R2_BUCKET_NAME }));
    return { disposition: 'REACHABLE' as const, reason: null };
  } catch (error) {
    return {
      disposition: 'UNVERIFIABLE' as const,
      reason: storageErrorReason(error),
    };
  } finally {
    client?.destroy();
  }
}

async function probeNeo4j(): Promise<'AVAILABLE' | 'UNAVAILABLE'> {
  const originalWarn = console.warn;
  console.warn = () => undefined;
  try {
    const { isNeo4jAvailable, closeDriver } = await import('../../../lib/editron/db/neo4j');
    const available = await isNeo4jAvailable();
    await closeDriver();
    return available ? 'AVAILABLE' : 'UNAVAILABLE';
  } catch {
    return 'UNAVAILABLE';
  } finally {
    console.warn = originalWarn;
  }
}

async function readLocalTrial(filePath: string) {
  const bytes = await readFile(filePath);
  const receipt = json(bytes);
  if (receipt.receiptSha256 !== STAGE25_ACCEPTED_LONG_FORM_LOCAL_RECEIPT_SHA256_V1) {
    fail('LOCAL_TRIAL_RECEIPT_MISMATCH');
  }
  return {
    receiptSha256: STAGE25_ACCEPTED_LONG_FORM_LOCAL_RECEIPT_SHA256_V1,
    receiptFileSha256: sha(bytes),
    assessment: receipt.assessment as 'PASS_LOCAL_LONG_FORM_MEDIA_AND_WINDOW_MECHANICS',
    proofCeiling:
      receipt.proofCeiling as 'LOCAL_SYNTHETIC_LONG_DURATION_CONTAINER_AND_BOUNDED_WINDOW_EVIDENCE',
  };
}

async function readProductionRender(input: {
  workspaceRoot: string;
  receiptPath: string;
  executionSourceCommitSha: string;
}) {
  await git(input.workspaceRoot, [
    'merge-base',
    '--is-ancestor',
    input.executionSourceCommitSha,
    'HEAD',
  ]);
  const sourceCompatibilityChangedFiles = lines(
    await git(input.workspaceRoot, [
      'diff',
      '--name-only',
      input.executionSourceCommitSha,
      'HEAD',
      '--',
      ...RENDER_SCOPES,
    ]),
  );
  const receiptBytes = await readFile(input.receiptPath);
  const receipt = json(receiptBytes);
  const render = record(receipt.render);
  const ducking = record(receipt.ducking);
  const zeroCredit = record(receipt.zeroCredit);
  const browserErrors = Array.isArray(render.browserErrors) ? render.browserErrors : null;
  if (
    receipt.version !== 'editron-long-form-render-canary-v1' ||
    receipt.status !== 'pass' ||
    zeroCredit.paidGenerationCalls !== 0 ||
    zeroCredit.providerApiCalls !== 0 ||
    zeroCredit.cloudRenderCalls !== 0 ||
    !browserErrors ||
    browserErrors.length !== 0
  ) {
    fail('PRODUCTION_RENDER_RECEIPT_INVALID');
  }
  const wavPath = stringValue(render.wavPath, 'PRODUCTION_RENDER_WAV_PATH_INVALID');
  const expectedRoot = path.resolve(
    input.workspaceRoot,
    '.calibration-temp',
    'long-form-render-canary',
  );
  const resolvedWav = path.resolve(wavPath);
  if (
    !resolvedWav.startsWith(`${expectedRoot}${path.sep}`) ||
    path.dirname(resolvedWav) !== path.dirname(input.receiptPath)
  ) {
    fail('PRODUCTION_RENDER_WAV_SCOPE_INVALID');
  }
  const wavBytes = await readFile(resolvedWav);
  const wav = parsePcm16Wav(wavBytes);
  if (sha(wavBytes) !== render.wavFileHashSha256 || wav.pcmHashSha256 !== render.pcmHashSha256) {
    fail('PRODUCTION_RENDER_BYTES_MISMATCH');
  }
  return {
    disposition: 'PASS_AUDIO_ONLY' as const,
    canaryVersion: 'editron-long-form-render-canary-v1' as const,
    executionSourceCommitSha: input.executionSourceCommitSha,
    sourceCompatibilityChangedFiles,
    receiptFileSha256: sha(receiptBytes),
    wavFileSha256: sha(wavBytes),
    pcmSha256: wav.pcmHashSha256,
    sampleRateHz: wav.sampleRateHz as 48_000,
    channelCount: wav.channelCount as 2,
    sampleFrameCount: wav.sampleFrameCount as 14_400_000,
    expectedSampleFrameCount: Number(render.expectedSampleFrameCount) as 14_400_000,
    renderElapsedMs: Number(render.renderElapsedMs),
    measuredDuckReductionDb: Number(ducking.measuredReductionDb),
    browserErrorCount: 0 as const,
  };
}

async function sourceIdentity(workspaceRoot: string) {
  const commitSha = await git(workspaceRoot, ['rev-parse', 'HEAD']);
  const treeSha = await git(workspaceRoot, ['rev-parse', 'HEAD^{tree}']);
  const relevantStatusEntries = lines(
    await git(workspaceRoot, [
      'status',
      '--porcelain=v1',
      '--untracked-files=all',
      '--',
      ...SOURCE_SCOPES,
    ]),
  );
  const tracked = lines(await git(workspaceRoot, ['ls-files', '-s', '--', ...SOURCE_SCOPES]));
  if (!tracked.length) fail('SOURCE_SCOPE_EMPTY');
  return {
    commitSha,
    treeSha,
    relevantScopeSha256: hashCanonicalJsonV1(tracked),
    relevantTrackedFileCount: tracked.length,
    relevantStatusEntries,
  };
}

async function installProductionEnvironment(filePath: string): Promise<Record<string, string>> {
  const environment = parseEnv(await readFile(path.resolve(filePath), 'utf8'));
  for (const [name, value] of Object.entries(environment)) process.env[name] = value;
  return environment;
}
function sensitiveValues(environment: Record<string, string>): string[] {
  return Object.entries(environment)
    .filter(
      ([name, value]) =>
        value.length >= 8 && /(SECRET|PASSWORD|ACCESS_KEY|API_KEY|_URI$)/.test(name),
    )
    .map(([, value]) => value);
}
function storageErrorReason(error: unknown): 'ACCESS_DENIED' | 'UNAVAILABLE' {
  const value = record(error);
  const metadata = record(value.$metadata);
  return value.name === 'AccessDenied' ||
    metadata.httpStatusCode === 401 ||
    metadata.httpStatusCode === 403
    ? 'ACCESS_DENIED'
    : 'UNAVAILABLE';
}
async function git(root: string, args: readonly string[]): Promise<string> {
  const result = await execFileAsync('git', [...args], {
    cwd: root,
    windowsHide: true,
    timeout: 30_000,
    maxBuffer: 12 * 1024 * 1024,
  });
  return result.stdout.trim();
}
function json(bytes: Uint8Array): JsonRecord {
  return record(JSON.parse(Buffer.from(bytes).toString('utf8')));
}
function record(value: unknown): JsonRecord {
  return value && typeof value === 'object' && !Array.isArray(value) ? (value as JsonRecord) : {};
}
function stringValue(value: unknown, code: string): string {
  if (typeof value !== 'string' || !value.trim()) fail(code);
  return value;
}
function lines(value: string): string[] {
  return value ? value.split(/\r?\n/).filter(Boolean) : [];
}
function sha(value: Uint8Array): string {
  return createHash('sha256').update(value).digest('hex');
}
function fail(code: string): never {
  throw new Error(`STAGE25_LONG_FORM_PRODUCT_OPERATOR_${code}`);
}

async function main(): Promise<void> {
  const [artifactParent, renderReceiptPath, renderSourceCommit, suffix, environmentFile] =
    process.argv.slice(2);
  if (!artifactParent || !renderReceiptPath || !renderSourceCommit) fail('USAGE_INVALID');
  const result = await runStage25LongFormProductEvidenceOperatorV1({
    workspaceRoot: process.cwd(),
    artifactParent,
    productionRenderReceiptPath: renderReceiptPath,
    renderExecutionSourceCommitSha: renderSourceCommit,
    ...(suffix ? { executionSuffix: suffix } : {}),
    ...(environmentFile ? { productionEnvironmentFile: environmentFile } : {}),
  });
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
}
const invoked = process.argv[1] ? path.resolve(process.argv[1]) : null;
if (invoked && invoked === path.resolve(fileURLToPath(import.meta.url))) await main();
