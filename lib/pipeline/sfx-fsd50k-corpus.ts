import { createHash } from 'node:crypto';
import { createReadStream } from 'node:fs';
import {
  mkdir,
  open,
  rename,
  rm,
  stat,
} from 'node:fs/promises';
import path from 'node:path';

import {
  FSD50K_CC0_LICENSE_URL,
  FSD50K_EXPECTED_COUNTS,
  FSD50K_VERSION,
  FSD50K_ZENODO_RECORD_ID,
  type Fsd50kHarvestCandidate,
} from './sfx-fsd50k-harvest';

type Fsd50kCorpusSplit = Fsd50kHarvestCandidate['sourceSplit'];

export interface Fsd50kAudioArchive {
  key: string;
  filename: string;
  split: Fsd50kCorpusSplit;
  partOrder: number;
  sizeBytes: number;
  md5: string;
  url: string;
}

const ZENODO_FILES_BASE_URL =
  `https://zenodo.org/records/${FSD50K_ZENODO_RECORD_ID}/files`;
const DEFAULT_ARCHIVE_DOWNLOAD_CONCURRENCY = 4;
const MAX_ARCHIVE_DOWNLOAD_CONCURRENCY = 8;

export const FSD50K_AUDIO_ARCHIVES = [
  audioArchive('FSD50K.dev_audio.z01', 'dev', 1, 3_221_225_472, 'faa7cf4cc076fc34a44a479a5ed862a3'),
  audioArchive('FSD50K.dev_audio.z02', 'dev', 2, 3_221_225_472, '8f9b66153e68571164fb1315d00bc7bc'),
  audioArchive('FSD50K.dev_audio.z03', 'dev', 3, 3_221_225_472, '1196ef47d267a993d30fa98af54b7159'),
  audioArchive('FSD50K.dev_audio.z04', 'dev', 4, 3_221_225_472, 'd088ac4e11ba53daf9f7574c11cccac9'),
  audioArchive('FSD50K.dev_audio.z05', 'dev', 5, 3_221_225_472, '81356521aa159accd3c35de22da28c7f'),
  audioArchive('FSD50K.dev_audio.zip', 'dev', 6, 2_306_663_327, 'c480d119b8f7a7e32fdb58f3ea4d6c5a'),
  audioArchive('FSD50K.eval_audio.z01', 'eval', 1, 3_221_225_472, '3090670eaeecc013ca1ff84fe4442aeb'),
  audioArchive('FSD50K.eval_audio.zip', 'eval', 2, 3_037_675_767, '6fa47636c3a3ad5c7dfeba99f2637982'),
] as const satisfies readonly Fsd50kAudioArchive[];

export type Fsd50kAudioArchiveKey = typeof FSD50K_AUDIO_ARCHIVES[number]['key'];

export interface Fsd50kCorpusPlanEntry {
  sourceId: string;
  sourceSplit: Fsd50kCorpusSplit;
  sourceTrainingSplit: Fsd50kHarvestCandidate['sourceTrainingSplit'];
  sourceAudioPath: string;
  title: string;
  uploader: string;
  labels: string[];
  mids: string[];
  uploaderTags: string[];
  provisionalEditorialRoles: Fsd50kHarvestCandidate['provisionalEditorialRoles'];
  provisionalRoleEvidence: string[];
  metadataRiskFlags: Fsd50kHarvestCandidate['metadataRiskFlags'];
  provenance: Fsd50kHarvestCandidate['provenance'];
}

export interface Fsd50kCorpusPlan {
  version: 'editron-fsd50k-corpus-plan-v1';
  generatedAt: string;
  candidatePoolSha256: string;
  archiveSetSha256: string;
  dataset: {
    version: typeof FSD50K_VERSION;
    zenodoRecordId: typeof FSD50K_ZENODO_RECORD_ID;
    clipLicenseAllowlist: ['cc0-1.0'];
  };
  policy: {
    purpose: 'offline-audio-inspection-embedding-and-curation';
    publicationAllowed: false;
    productionCatalogMutationAllowed: false;
    everyCandidateRequiresAudioInspection: true;
    everyCandidateRequiresEmbeddingClassification: true;
  };
  counts: {
    candidates: number;
    devCandidates: number;
    evalCandidates: number;
    metadataRiskFlagged: number;
    provisionallyRoleMapped: number;
    groundTruthRoleMapped: number;
    archiveParts: number;
    archiveDownloadBytes: number;
  };
  archives: Fsd50kAudioArchive[];
  entries: Fsd50kCorpusPlanEntry[];
}

export interface Fsd50kCorpusPlanOptions {
  expectedCandidateCount?: number;
  generatedAt?: Date;
}

export interface Fsd50kArchiveProbeReceipt {
  version: 'editron-fsd50k-archive-probe-v1';
  probedAt: string;
  archiveSetSha256: string;
  counts: {
    archives: number;
    totalBytes: number;
  };
  archives: Array<{
    key: string;
    sizeBytes: number;
    rangeSupported: true;
    contentType: string | null;
    lastModified: string | null;
    etag: string | null;
  }>;
}

export interface Fsd50kArchiveProbeOptions {
  fetchImpl?: typeof fetch;
  probedAt?: Date;
}

export interface Fsd50kArchiveDownloadReceipt {
  key: string;
  path: string;
  sizeBytes: number;
  md5: string;
  resumedFromBytes: number;
  reusedExisting: boolean;
}

export interface Fsd50kArchiveDownloadOptions {
  destinationDirectory: string;
  fetchImpl?: typeof fetch;
  onProgress?: (event: {
    key: string;
    downloadedBytes: number;
    totalBytes: number;
  }) => void;
}

export interface Fsd50kArchiveSetDownloadOptions extends Fsd50kArchiveDownloadOptions {
  archiveKeys?: readonly string[];
  concurrency?: number;
}

export class Fsd50kCorpusError extends Error {
  constructor(
    public readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = 'Fsd50kCorpusError';
  }
}

export function buildFsd50kCorpusPlan(
  candidates: readonly Fsd50kHarvestCandidate[],
  options: Fsd50kCorpusPlanOptions = {},
): Fsd50kCorpusPlan {
  const generatedAt = options.generatedAt ?? new Date();
  if (Number.isNaN(generatedAt.getTime())) {
    throw new Fsd50kCorpusError('INVALID_CORPUS_CLOCK', 'Corpus plan timestamp is invalid');
  }
  const expectedCount = options.expectedCandidateCount ?? FSD50K_EXPECTED_COUNTS.cc0;
  if (candidates.length !== expectedCount) {
    throw new Fsd50kCorpusError(
      'CANDIDATE_COUNT_MISMATCH',
      `Expected ${expectedCount} CC0 candidates, received ${candidates.length}`,
    );
  }

  const seen = new Set<string>();
  const sorted = [...candidates].sort(compareCandidates);
  for (const candidate of sorted) {
    validateCorpusCandidate(candidate, seen);
    seen.add(candidate.sourceId);
  }

  const entries = sorted.map(toCorpusPlanEntry);
  return {
    version: 'editron-fsd50k-corpus-plan-v1',
    generatedAt: generatedAt.toISOString(),
    candidatePoolSha256: hashCanonical(entries),
    archiveSetSha256: hashArchiveSet(FSD50K_AUDIO_ARCHIVES),
    dataset: {
      version: FSD50K_VERSION,
      zenodoRecordId: FSD50K_ZENODO_RECORD_ID,
      clipLicenseAllowlist: ['cc0-1.0'],
    },
    policy: {
      purpose: 'offline-audio-inspection-embedding-and-curation',
      publicationAllowed: false,
      productionCatalogMutationAllowed: false,
      everyCandidateRequiresAudioInspection: true,
      everyCandidateRequiresEmbeddingClassification: true,
    },
    counts: {
      candidates: entries.length,
      devCandidates: entries.filter(entry => entry.sourceSplit === 'dev').length,
      evalCandidates: entries.filter(entry => entry.sourceSplit === 'eval').length,
      metadataRiskFlagged: entries.filter(entry => entry.metadataRiskFlags.length > 0).length,
      provisionallyRoleMapped: entries.filter(
        entry => entry.provisionalEditorialRoles.length > 0,
      ).length,
      groundTruthRoleMapped: entries.filter(
        entry => entry.provisionalRoleEvidence.some(evidence => evidence.includes(':ground-truth-label:')),
      ).length,
      archiveParts: FSD50K_AUDIO_ARCHIVES.length,
      archiveDownloadBytes: FSD50K_AUDIO_ARCHIVES.reduce(
        (total, archive) => total + archive.sizeBytes,
        0,
      ),
    },
    archives: FSD50K_AUDIO_ARCHIVES.map(archive => ({ ...archive })),
    entries,
  };
}

export async function probeFsd50kAudioArchives(
  options: Fsd50kArchiveProbeOptions = {},
): Promise<Fsd50kArchiveProbeReceipt> {
  const fetchImpl = options.fetchImpl ?? fetch;
  const probedAt = options.probedAt ?? new Date();
  if (Number.isNaN(probedAt.getTime())) {
    throw new Fsd50kCorpusError('INVALID_PROBE_CLOCK', 'Archive probe timestamp is invalid');
  }

  const archives: Fsd50kArchiveProbeReceipt['archives'] = [];
  for (const archive of FSD50K_AUDIO_ARCHIVES) {
    const response = await fetchImpl(archive.url, {
      headers: {
        Accept: 'application/octet-stream',
        Range: 'bytes=0-0',
      },
      redirect: 'follow',
    });
    if (response.status !== 206) {
      await response.body?.cancel();
      throw new Fsd50kCorpusError(
        'ARCHIVE_RANGE_UNSUPPORTED',
        `${archive.key} returned HTTP ${response.status} to a one-byte range probe`,
      );
    }
    const remoteSize = parseContentRangeSize(response.headers.get('content-range'));
    if (remoteSize !== archive.sizeBytes) {
      await response.body?.cancel();
      throw new Fsd50kCorpusError(
        'ARCHIVE_SIZE_MISMATCH',
        `${archive.key} reports ${remoteSize} bytes; expected ${archive.sizeBytes}`,
      );
    }
    const probeBytes = new Uint8Array(await response.arrayBuffer());
    if (probeBytes.byteLength !== 1) {
      throw new Fsd50kCorpusError(
        'INVALID_ARCHIVE_PROBE',
        `${archive.key} returned ${probeBytes.byteLength} bytes to a one-byte probe`,
      );
    }
    archives.push({
      key: archive.key,
      sizeBytes: remoteSize,
      rangeSupported: true,
      contentType: response.headers.get('content-type'),
      lastModified: response.headers.get('last-modified'),
      etag: response.headers.get('etag'),
    });
  }

  return {
    version: 'editron-fsd50k-archive-probe-v1',
    probedAt: probedAt.toISOString(),
    archiveSetSha256: hashArchiveSet(FSD50K_AUDIO_ARCHIVES),
    counts: {
      archives: archives.length,
      totalBytes: archives.reduce((total, archive) => total + archive.sizeBytes, 0),
    },
    archives,
  };
}

export async function downloadFsd50kArchive(
  archive: Fsd50kAudioArchive,
  options: Fsd50kArchiveDownloadOptions,
): Promise<Fsd50kArchiveDownloadReceipt> {
  validateArchiveDefinition(archive);
  const destinationDirectory = path.resolve(options.destinationDirectory);
  await mkdir(destinationDirectory, { recursive: true });
  const finalPath = safeArchivePath(destinationDirectory, archive.filename);
  const partialPath = `${finalPath}.part`;

  if (await fileMatchesArchive(finalPath, archive)) {
    return {
      key: archive.key,
      path: finalPath,
      sizeBytes: archive.sizeBytes,
      md5: archive.md5,
      resumedFromBytes: archive.sizeBytes,
      reusedExisting: true,
    };
  }
  await rm(finalPath, { force: true });

  let resumedFromBytes = await fileSizeOrZero(partialPath);
  if (resumedFromBytes > archive.sizeBytes) {
    await rm(partialPath, { force: true });
    resumedFromBytes = 0;
  }
  if (resumedFromBytes === archive.sizeBytes) {
    const partialMd5 = await hashFileMd5(partialPath);
    if (partialMd5 === archive.md5) {
      await rename(partialPath, finalPath);
      return {
        key: archive.key,
        path: finalPath,
        sizeBytes: archive.sizeBytes,
        md5: partialMd5,
        resumedFromBytes,
        reusedExisting: false,
      };
    }
    await rm(partialPath, { force: true });
    resumedFromBytes = 0;
  }

  const fetchImpl = options.fetchImpl ?? fetch;
  let response = await requestArchive(fetchImpl, archive, resumedFromBytes);
  if (resumedFromBytes > 0 && response.status === 200) {
    await response.body?.cancel();
    await rm(partialPath, { force: true });
    resumedFromBytes = 0;
    response = await requestArchive(fetchImpl, archive, 0);
  }
  assertDownloadResponse(response, archive, resumedFromBytes);

  const file = await open(partialPath, resumedFromBytes > 0 ? 'a' : 'w');
  let downloadedBytes = resumedFromBytes;
  try {
    if (!response.body) {
      throw new Fsd50kCorpusError(
        'ARCHIVE_BODY_MISSING',
        `${archive.key} download response has no body`,
      );
    }
    const reader = response.body.getReader();
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      const chunk = Buffer.from(value);
      downloadedBytes += chunk.byteLength;
      if (downloadedBytes > archive.sizeBytes) {
        await reader.cancel('archive exceeded pinned size');
        throw new Fsd50kCorpusError(
          'ARCHIVE_TOO_LARGE',
          `${archive.key} exceeded its pinned ${archive.sizeBytes}-byte size`,
        );
      }
      await file.write(chunk);
      options.onProgress?.({
        key: archive.key,
        downloadedBytes,
        totalBytes: archive.sizeBytes,
      });
    }
  } finally {
    await file.close();
  }

  if (downloadedBytes !== archive.sizeBytes) {
    throw new Fsd50kCorpusError(
      'ARCHIVE_TRUNCATED',
      `${archive.key} stopped at ${downloadedBytes}/${archive.sizeBytes} bytes`,
    );
  }
  const md5 = await hashFileMd5(partialPath);
  if (md5 !== archive.md5) {
    await rm(partialPath, { force: true });
    throw new Fsd50kCorpusError(
      'ARCHIVE_CHECKSUM_MISMATCH',
      `${archive.key} failed its pinned MD5 checksum`,
    );
  }
  await rename(partialPath, finalPath);

  return {
    key: archive.key,
    path: finalPath,
    sizeBytes: archive.sizeBytes,
    md5,
    resumedFromBytes,
    reusedExisting: false,
  };
}

export async function downloadFsd50kArchiveSet(
  options: Fsd50kArchiveSetDownloadOptions,
): Promise<Fsd50kArchiveDownloadReceipt[]> {
  const requested = options.archiveKeys?.length
    ? new Set(options.archiveKeys)
    : null;
  const unknown = requested
    ? [...requested].filter(key => !FSD50K_AUDIO_ARCHIVES.some(archive => archive.key === key))
    : [];
  if (unknown.length > 0) {
    throw new Fsd50kCorpusError(
      'UNKNOWN_ARCHIVE_KEY',
      `Unknown FSD50K archive key(s): ${unknown.join(', ')}`,
    );
  }
  const archives = requested
    ? FSD50K_AUDIO_ARCHIVES.filter(archive => requested.has(archive.key))
    : FSD50K_AUDIO_ARCHIVES;
  const concurrency = resolveArchiveDownloadConcurrency(
    options.concurrency,
    archives.length,
  );
  const receipts: Fsd50kArchiveDownloadReceipt[] = [];
  for (let offset = 0; offset < archives.length; offset += concurrency) {
    const batch = archives.slice(offset, offset + concurrency);
    const results = await Promise.allSettled(
      batch.map(archive => downloadFsd50kArchive(archive, options)),
    );
    for (const result of results) {
      if (result.status === 'rejected') throw result.reason;
      receipts.push(result.value);
    }
  }
  return receipts;
}

function resolveArchiveDownloadConcurrency(
  requested: number | undefined,
  archiveCount: number,
): number {
  const concurrency = requested ?? DEFAULT_ARCHIVE_DOWNLOAD_CONCURRENCY;
  if (
    !Number.isSafeInteger(concurrency)
    || concurrency <= 0
    || concurrency > MAX_ARCHIVE_DOWNLOAD_CONCURRENCY
  ) {
    throw new Fsd50kCorpusError(
      'INVALID_DOWNLOAD_CONCURRENCY',
      `Archive download concurrency must be an integer from 1 to ${MAX_ARCHIVE_DOWNLOAD_CONCURRENCY}`,
    );
  }
  return Math.min(concurrency, Math.max(archiveCount, 1));
}

function audioArchive(
  filename: string,
  split: Fsd50kCorpusSplit,
  partOrder: number,
  sizeBytes: number,
  md5: string,
): Fsd50kAudioArchive {
  return {
    key: filename,
    filename,
    split,
    partOrder,
    sizeBytes,
    md5,
    url: `${ZENODO_FILES_BASE_URL}/${filename}?download=1`,
  };
}

function validateCorpusCandidate(
  candidate: Fsd50kHarvestCandidate,
  seen: ReadonlySet<string>,
): void {
  if (seen.has(candidate.sourceId)) {
    throw new Fsd50kCorpusError(
      'DUPLICATE_SOURCE_ID',
      `Corpus candidate ${candidate.sourceId} is duplicated`,
    );
  }
  const expectedPath =
    `FSD50K.${candidate.sourceSplit}_audio/${candidate.sourceId}.wav`;
  if (candidate.sourceAudioPath !== expectedPath) {
    throw new Fsd50kCorpusError(
      'INVALID_SOURCE_AUDIO_PATH',
      `Corpus candidate ${candidate.sourceId} has source path ${candidate.sourceAudioPath}`,
    );
  }
  if (
    candidate.version !== 'editron-fsd50k-candidate-v1'
    || candidate.provenance.provider !== 'fsd50k'
    || candidate.provenance.providerAssetId !== candidate.sourceId
    || candidate.provenance.datasetVersion !== FSD50K_VERSION
    || candidate.provenance.zenodoRecordId !== FSD50K_ZENODO_RECORD_ID
    || candidate.provenance.clipLicenseId !== 'cc0-1.0'
    || candidate.provenance.clipLicenseUrl !== FSD50K_CC0_LICENSE_URL
    || candidate.provenance.clipAttributionRequired !== false
    || candidate.requiresAudioInspection !== true
    || candidate.requiresEmbeddingClassification !== true
  ) {
    throw new Fsd50kCorpusError(
      'INVALID_CORPUS_RIGHTS_EVIDENCE',
      `Corpus candidate ${candidate.sourceId} violates the pinned rights/evidence contract`,
    );
  }
}

function toCorpusPlanEntry(candidate: Fsd50kHarvestCandidate): Fsd50kCorpusPlanEntry {
  return {
    sourceId: candidate.sourceId,
    sourceSplit: candidate.sourceSplit,
    sourceTrainingSplit: candidate.sourceTrainingSplit,
    sourceAudioPath: candidate.sourceAudioPath,
    title: candidate.title,
    uploader: candidate.uploader,
    labels: [...candidate.labels],
    mids: [...candidate.mids],
    uploaderTags: [...candidate.uploaderTags],
    provisionalEditorialRoles: [...candidate.provisionalEditorialRoles],
    provisionalRoleEvidence: [...candidate.provisionalRoleEvidence],
    metadataRiskFlags: [...candidate.metadataRiskFlags],
    provenance: { ...candidate.provenance },
  };
}

function compareCandidates(
  left: Fsd50kHarvestCandidate,
  right: Fsd50kHarvestCandidate,
): number {
  return Number(left.sourceId) - Number(right.sourceId)
    || left.sourceId.localeCompare(right.sourceId);
}

function hashCanonical(value: unknown): string {
  return createHash('sha256').update(JSON.stringify(value)).digest('hex');
}

function hashArchiveSet(archives: readonly Fsd50kAudioArchive[]): string {
  return hashCanonical(
    archives.map(({ key, split, partOrder, sizeBytes, md5, url }) => ({
      key,
      split,
      partOrder,
      sizeBytes,
      md5,
      url,
    })),
  );
}

function parseContentRangeSize(value: string | null): number {
  const match = /^bytes 0-0\/(\d+)$/.exec(value ?? '');
  const size = Number(match?.[1]);
  if (!Number.isSafeInteger(size) || size <= 0) {
    throw new Fsd50kCorpusError(
      'INVALID_CONTENT_RANGE',
      `Archive probe returned invalid Content-Range: ${value ?? '<missing>'}`,
    );
  }
  return size;
}

function validateArchiveDefinition(archive: Fsd50kAudioArchive): void {
  if (
    archive.key !== archive.filename
    || !/^FSD50K\.(dev|eval)_audio\.(?:z\d{2}|zip)$/.test(archive.filename)
    || !Number.isSafeInteger(archive.sizeBytes)
    || archive.sizeBytes <= 0
    || !/^[a-f0-9]{32}$/.test(archive.md5)
    || !archive.url.startsWith(`${ZENODO_FILES_BASE_URL}/`)
  ) {
    throw new Fsd50kCorpusError(
      'INVALID_ARCHIVE_DEFINITION',
      `Archive definition is invalid for ${archive.key}`,
    );
  }
}

function safeArchivePath(destinationDirectory: string, filename: string): string {
  const resolved = path.resolve(destinationDirectory, filename);
  const relative = path.relative(destinationDirectory, resolved);
  if (!relative || relative.startsWith('..') || path.isAbsolute(relative)) {
    throw new Fsd50kCorpusError(
      'UNSAFE_ARCHIVE_PATH',
      `Archive path escapes its destination: ${filename}`,
    );
  }
  return resolved;
}

async function fileMatchesArchive(
  filePath: string,
  archive: Fsd50kAudioArchive,
): Promise<boolean> {
  try {
    const details = await stat(filePath);
    if (!details.isFile() || details.size !== archive.sizeBytes) return false;
    return await hashFileMd5(filePath) === archive.md5;
  } catch (error) {
    if (isMissingFileError(error)) return false;
    throw error;
  }
}

async function fileSizeOrZero(filePath: string): Promise<number> {
  try {
    const details = await stat(filePath);
    return details.isFile() ? details.size : 0;
  } catch (error) {
    if (isMissingFileError(error)) return 0;
    throw error;
  }
}

async function requestArchive(
  fetchImpl: typeof fetch,
  archive: Fsd50kAudioArchive,
  offset: number,
): Promise<Response> {
  return fetchImpl(archive.url, {
    headers: {
      Accept: 'application/octet-stream',
      ...(offset > 0 ? { Range: `bytes=${offset}-` } : {}),
    },
    redirect: 'follow',
  });
}

function assertDownloadResponse(
  response: Response,
  archive: Fsd50kAudioArchive,
  offset: number,
): void {
  const expectedStatus = offset > 0 ? 206 : [200, 206];
  const accepted = Array.isArray(expectedStatus)
    ? expectedStatus.includes(response.status)
    : response.status === expectedStatus;
  if (!accepted) {
    void response.body?.cancel();
    throw new Fsd50kCorpusError(
      'ARCHIVE_DOWNLOAD_FAILED',
      `${archive.key} download returned HTTP ${response.status}`,
    );
  }
  if (response.status === 206) {
    const contentRange = response.headers.get('content-range');
    const match = /^bytes (\d+)-(\d+)\/(\d+)$/.exec(contentRange ?? '');
    if (
      Number(match?.[1]) !== offset
      || Number(match?.[3]) !== archive.sizeBytes
    ) {
      void response.body?.cancel();
      throw new Fsd50kCorpusError(
        'INVALID_DOWNLOAD_RANGE',
        `${archive.key} returned invalid Content-Range ${contentRange ?? '<missing>'}`,
      );
    }
  }
}

async function hashFileMd5(filePath: string): Promise<string> {
  const hash = createHash('md5');
  for await (const chunk of createReadStream(filePath)) {
    hash.update(chunk as Buffer);
  }
  return hash.digest('hex');
}

function isMissingFileError(error: unknown): boolean {
  return Boolean(
    error
    && typeof error === 'object'
    && 'code' in error
    && (error as { code?: unknown }).code === 'ENOENT',
  );
}
