import { spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import { createReadStream } from 'node:fs';
import { mkdir, readFile, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';
import readline from 'node:readline';

import { buildMediaSourcePtsCadenceDurableJobContractV1 }
  from '@/lib/editron/services/media-source-pts-cadence-durable-job-binding-v1';
import { serializeMediaSourcePtsCadenceFrameBatchV2,
  type MediaSourcePtsCadenceFrameBatchSerializationV2 }
  from '@/lib/editron/services/media-source-pts-cadence-frame-batch-v2';
import { createMediaSourcePtsCadenceFrameBatchSidecarV2,
  createMediaSourcePtsCadenceManifestIndexV2,
  type MediaSourcePtsCadenceFrameBatchSidecarV2 }
  from '@/lib/editron/services/media-source-pts-cadence-manifest-index-v2';
import { verifyMediaSourcePtsCadenceSourceCoverageV2 }
  from '@/lib/editron/services/media-source-pts-cadence-source-coverage-v2';
import { createMediaSourcePtsCadenceShardV1,
  type MediaSourcePtsCadenceFrameInputV1 }
  from '@/lib/editron/services/media-source-pts-cadence-shard-v1';
import { parseMediaSourceProbeResponseV1 }
  from '@/lib/editron/services/media-source-probe-v1';
import { claimMediaSourceQualificationV1, completeMediaSourceQualificationV1,
  createMediaSourceQualificationV1 }
  from '@/lib/editron/services/media-source-qualification-v1';
import { createMediaSourceStorageVersionV1 }
  from '@/lib/editron/services/media-source-storage-version-v1';
import { createMediaSourceVersionV1 }
  from '@/lib/editron/services/media-source-version-v1';

const BATCH_FRAMES = 50_000;
const WINDOW_FRAMES = 60;

export async function buildStage25LongFormPtsEvidenceV1(input: Readonly<{
  sourcePath: string;
  artifact: Readonly<{ sha256: string; byteLength: number }>;
  rawProbe: Readonly<{ streams?: Array<Record<string, unknown>>; format?: Record<string, unknown> }>;
  ffprobeIdentity: string;
  outputDirectory: string;
  now: string;
}>) {
  const observation = parseMediaSourceProbeResponseV1({
    ok: true,
    probe_version: input.ffprobeIdentity,
    streams: input.rawProbe.streams,
    format: input.rawProbe.format,
  }) ?? fail('TECHNICAL_OBSERVATION_INVALID');
  const storageVersion = createMediaSourceStorageVersionV1({
    locator: { provider: 'R2', objectKey: 'local-research/stage25/long-form-source.mp4' },
    byteLength: input.artifact.byteLength,
    providerVersion: { kind: 'R2_ETAG', value: `local-emulation-${input.artifact.sha256}` },
  });
  const created = createMediaSourceQualificationV1({
    asset: { assetId: 'stage25-long-form-source', source: 'user-upload',
      r2Key: storageVersion.locator.objectKey },
    now: new Date(input.now),
  });
  if (created.disposition !== 'CREATED') fail('QUALIFICATION_CREATE_FAILED');
  const claimed = claimMediaSourceQualificationV1({
    record: created.record,
    sourceBindingSha256: created.record.sourceBindingSha256,
    now: new Date(input.now),
  });
  if (claimed.disposition !== 'CLAIMED') fail('QUALIFICATION_CLAIM_FAILED');
  const completed = completeMediaSourceQualificationV1({
    record: claimed.record,
    sourceBindingSha256: claimed.record.sourceBindingSha256,
    result: { disposition: 'MEASURED', observation, diagnostics: [] },
    storageVersion,
    now: new Date(input.now),
  });
  if (completed.disposition !== 'COMPLETED') fail('QUALIFICATION_COMPLETE_FAILED');
  const qualification = completed.record;
  const sourceVersion = createMediaSourceVersionV1({
    owner: { kind: 'USER', userId: 'stage25-local-operator' },
    assetId: qualification.assetId,
    mediaKind: 'video',
    byteLength: input.artifact.byteLength,
    contentSha256: input.artifact.sha256,
    storageVersion,
  });
  const contract = buildMediaSourcePtsCadenceDurableJobContractV1({
    tenantId: 'stage25-local-tenant',
    userId: 'stage25-local-operator',
    orgId: null,
    assetId: sourceVersion.assetId,
    sourceVersion,
    qualification,
    videoStreamIndex: 0,
  });
  const video = observation.videoStreams.find(({ streamIndex }) => streamIndex === 0)
    ?? fail('VIDEO_STREAM_MISSING');
  const audio = observation.audioStreams[0] ?? fail('AUDIO_STREAM_MISSING');
  const frameCount = Number(video.frameCount);
  if (!Number.isSafeInteger(frameCount) || frameCount < 1) fail('FRAME_COUNT_INVALID');
  const starts = [900, Math.floor((frameCount - WINDOW_FRAMES) / 2), frameCount - 960];
  const wanted = new Set(starts.flatMap((start) => [start, start + WINDOW_FRAMES - 1]));
  const anchors = new Map<number, MediaSourcePtsCadenceFrameInputV1>();
  const batchDirectory = path.join(input.outputDirectory, 'pts-batches');
  await mkdir(batchDirectory);
  const batches: Array<{
    serialization: MediaSourcePtsCadenceFrameBatchSerializationV2;
    sidecar: MediaSourcePtsCadenceFrameBatchSidecarV2;
  }> = [];
  const localPaths = new Map<string, string>();
  let frames: MediaSourcePtsCadenceFrameInputV1[] = [];
  let ordinal = 0;
  let previousEnd: bigint | null = null;
  let peakRssBytes = process.memoryUsage().rss;
  const flush = async () => {
    if (!frames.length) return;
    const shard = createMediaSourcePtsCadenceShardV1({
      sourceVersion, qualification, videoStreamIndex: 0,
      mapper: contract.payload.mapBinding.mapper,
      shardSequence: batches.length,
      firstFrameOrdinal: String(ordinal - frames.length),
      frames,
    });
    const serialization = serializeMediaSourcePtsCadenceFrameBatchV2({
      mapBindingSha256: contract.payload.mapBindingSha256,
      resourcePolicy: contract.payload.scanResourcePolicy,
      shard,
      frames,
    });
    const sidecar = createMediaSourcePtsCadenceFrameBatchSidecarV2({
      storage: 'R2_PRIVATE', serialization,
    });
    const localPath = path.join(batchDirectory,
      `${String(shard.shardSequence).padStart(3, '0')}-${serialization.contentSha256}.json`);
    await writeFile(localPath, serialization.canonicalJson, { encoding: 'utf8', flag: 'wx' });
    batches.push({ serialization, sidecar });
    localPaths.set(sidecar.objectKey, localPath);
    frames = [];
    peakRssBytes = Math.max(peakRssBytes, process.memoryUsage().rss);
  };
  const started = performance.now();
  const child = spawn('ffprobe', [
    '-v', 'error', '-select_streams', 'v:0', '-show_frames',
    '-show_entries', 'frame=best_effort_timestamp,duration', '-of', 'compact=p=0:nk=0',
    input.sourcePath,
  ], { windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] });
  let stderr = '';
  child.stderr.on('data', (chunk) => { stderr += String(chunk); });
  const closed = new Promise<number | null>((resolve, reject) => {
    child.once('error', reject); child.once('close', resolve);
  });
  const lines = readline.createInterface({ input: child.stdout, crlfDelay: Infinity });
  for await (const line of lines) {
    const frame = parseFrame(line);
    const pts = BigInt(frame.presentationTimestampTicks);
    if (previousEnd !== null && pts !== previousEnd) fail('PTS_DISCONTINUITY');
    previousEnd = pts + BigInt(frame.durationTicks);
    if (wanted.has(ordinal)) anchors.set(ordinal, frame);
    frames.push(frame); ordinal += 1;
    if (frames.length === BATCH_FRAMES) await flush();
  }
  const code = await closed;
  if (code !== 0) fail(`FFPROBE_SCAN_FAILED:${stderr.slice(-800)}`);
  await flush();
  if (ordinal !== frameCount || anchors.size !== wanted.size) fail('FRAME_SCAN_INCOMPLETE');
  const manifest = createMediaSourcePtsCadenceManifestIndexV2({
    mapBindingSha256: contract.payload.mapBindingSha256,
    resourcePolicy: contract.payload.manifestResourcePolicy,
    batches,
  });
  await writeFile(path.join(input.outputDirectory, 'pts-manifest.json'),
    manifest.canonicalJson, { encoding: 'utf8', flag: 'wx' });
  const reader = { read: async (sidecar: MediaSourcePtsCadenceFrameBatchSidecarV2) => {
    const localPath = localPaths.get(sidecar.objectKey) ?? fail('SIDECAR_PATH_MISSING');
    const canonicalJson = await readFile(localPath, 'utf8');
    const file = await stat(localPath);
    return { canonicalJson, byteLength: file.size,
      contentSha256: createHash('sha256').update(canonicalJson, 'utf8').digest('hex') };
  } };
  const coverage = await verifyMediaSourcePtsCadenceSourceCoverageV2({
    coverage: contract.payload.expectedCoverage,
    manifestIndex: manifest,
    reader,
  });
  if (coverage.disposition !== 'SOURCE_PRESENTATION_COVERAGE_VERIFIED') {
    fail(`SOURCE_COVERAGE_FAILED:${coverage.reason}`);
  }
  const windows = starts.map((start, index) => {
    const first = anchors.get(start) ?? fail('WINDOW_START_MISSING');
    const last = anchors.get(start + WINDOW_FRAMES - 1) ?? fail('WINDOW_END_MISSING');
    return {
      windowId: ['START', 'MIDDLE', 'END'][index] as 'START' | 'MIDDLE' | 'END',
      priorityOrdinal: index as 0 | 1 | 2,
      startFrameOrdinal: String(start),
      endExclusiveFrameOrdinal: String(start + WINDOW_FRAMES),
      startPts: first.presentationTimestampTicks,
      endExclusivePts: String(BigInt(last.presentationTimestampTicks) + BigInt(last.durationTicks)),
    };
  });
  return {
    sourceVersionSha256: sourceVersion.sourceVersionSha256,
    technicalObservationSha256: observation.observationSha256,
    mapBindingSha256: contract.payload.mapBindingSha256,
    video,
    audio,
    manifestContentSha256: manifest.contentSha256,
    verificationSha256: coverage.indexVerificationSha256,
    coverageSha256: coverage.sourcePresentationCoverageSha256,
    batchCount: batches.length,
    verifiedFrameCount: String(frameCount),
    startPts: coverage.sourceStartPresentationTimestampTicks,
    endExclusivePts: coverage.sourceEndExclusivePresentationTimestampTicks,
    cadence: coverage.sourceCadence.kind,
    peakRssBytes,
    windows,
    ptsScanAndVerifyMs: Math.max(1, Math.round(performance.now() - started)),
  };
}

function parseFrame(line: string): MediaSourcePtsCadenceFrameInputV1 {
  const values = new Map(line.split('|').flatMap((token) => {
    const index = token.indexOf('=');
    return index < 0 ? [] : [[token.slice(0, index), token.slice(index + 1)]];
  }));
  const pts = values.get('best_effort_timestamp');
  const duration = values.get('duration');
  if (!pts || !/^-?(0|[1-9]\d*)$/.test(pts) || !duration || !/^[1-9]\d*$/.test(duration)) {
    fail('FRAME_RECORD_INVALID');
  }
  return { presentationTimestampTicks: BigInt(pts).toString(),
    durationTicks: BigInt(duration).toString() };
}
function fail(code: string): never { throw new Error(`STAGE25_LONG_FORM_PTS_${code}`); }
