import { createHash, randomUUID } from 'node:crypto';
import { mkdir, readFile, rename, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { inflateRawSync } from 'node:zlib';
import { pathToFileURL } from 'node:url';

import {
  FSD50K_EXPECTED_COUNTS,
  harvestFsd50kMetadata,
} from '../lib/pipeline/sfx-fsd50k-harvest';

const ARCHIVES = {
  metadata: {
    filename: 'FSD50K.metadata.zip',
    url: 'https://zenodo.org/record/4060432/files/FSD50K.metadata.zip?download=1',
    md5: 'b9ea0c829a411c1d42adb9da539ed237',
    maxBytes: 8_000_000,
  },
  groundTruth: {
    filename: 'FSD50K.ground_truth.zip',
    url: 'https://zenodo.org/record/4060432/files/FSD50K.ground_truth.zip?download=1',
    md5: 'ca27382c195e37d2269c4c866dd73485',
    maxBytes: 1_000_000,
  },
} as const;

interface CliOptions {
  outDir: string;
  offline: boolean;
}

export async function runFsd50kMetadataHarvest(options: CliOptions): Promise<void> {
  const outDir = path.resolve(options.outDir);
  const sourceDir = path.join(outDir, 'source');
  await mkdir(sourceDir, { recursive: true });

  const metadataArchive = await loadArchive(sourceDir, ARCHIVES.metadata, options.offline);
  const groundTruthArchive = await loadArchive(sourceDir, ARCHIVES.groundTruth, options.offline);
  const devClipsInfo = JSON.parse(extractZipEntry(
    metadataArchive,
    'FSD50K.metadata/dev_clips_info_FSD50K.json',
  ).toString('utf8')) as unknown;
  const evalClipsInfo = JSON.parse(extractZipEntry(
    metadataArchive,
    'FSD50K.metadata/eval_clips_info_FSD50K.json',
  ).toString('utf8')) as unknown;
  const devGroundTruthCsv = extractZipEntry(
    groundTruthArchive,
    'FSD50K.ground_truth/dev.csv',
  ).toString('utf8');
  const evalGroundTruthCsv = extractZipEntry(
    groundTruthArchive,
    'FSD50K.ground_truth/eval.csv',
  ).toString('utf8');

  const result = harvestFsd50kMetadata({
    devGroundTruthCsv,
    evalGroundTruthCsv,
    devClipsInfo,
    evalClipsInfo,
    expectedCounts: FSD50K_EXPECTED_COUNTS,
  });
  const candidateIndex = `${result.candidates.map(candidate => JSON.stringify(candidate)).join('\n')}\n`;
  await atomicWrite(
    path.join(outDir, 'report.json'),
    `${JSON.stringify(result.report, null, 2)}\n`,
  );
  await atomicWrite(path.join(outDir, 'cc0-candidates.ndjson'), candidateIndex);

  console.log(JSON.stringify({
    outputDirectory: outDir,
    totalClips: result.report.counts.total,
    cc0RightsEligible: result.report.counts.cc0RightsEligible,
    excludedByClipLicense: result.report.counts.excludedByClipLicense,
    metadataRiskFlagged: result.report.counts.metadataRiskFlagged,
    provisionallyMapped: result.report.counts.provisionallyMapped,
    audioFilesDownloaded: 0,
    nextGate: result.report.nextGate,
  }, null, 2));
}

export function extractZipEntry(archive: Buffer, wantedName: string): Buffer {
  const endOffset = findEndOfCentralDirectory(archive);
  const entryCount = archive.readUInt16LE(endOffset + 10);
  const centralDirectorySize = archive.readUInt32LE(endOffset + 12);
  const centralDirectoryOffset = archive.readUInt32LE(endOffset + 16);
  if (
    entryCount > 10_000
    || centralDirectoryOffset + centralDirectorySize > endOffset
  ) {
    throw new Error('ZIP central directory is malformed');
  }

  let offset = centralDirectoryOffset;
  let match: {
    compression: number;
    compressedSize: number;
    uncompressedSize: number;
    localHeaderOffset: number;
  } | null = null;
  for (let index = 0; index < entryCount; index += 1) {
    assertBufferRange(archive, offset, 46, 'ZIP central directory entry is truncated');
    if (archive.readUInt32LE(offset) !== 0x02014b50) {
      throw new Error('ZIP central directory entry is malformed');
    }
    const compression = archive.readUInt16LE(offset + 10);
    const compressedSize = archive.readUInt32LE(offset + 20);
    const uncompressedSize = archive.readUInt32LE(offset + 24);
    const filenameLength = archive.readUInt16LE(offset + 28);
    const extraLength = archive.readUInt16LE(offset + 30);
    const commentLength = archive.readUInt16LE(offset + 32);
    const localHeaderOffset = archive.readUInt32LE(offset + 42);
    assertBufferRange(
      archive,
      offset + 46,
      filenameLength + extraLength + commentLength,
      'ZIP central directory entry is truncated',
    );
    const name = archive.subarray(offset + 46, offset + 46 + filenameLength).toString('utf8');
    assertSafeZipPath(name);
    if (name === wantedName) {
      if (match) throw new Error(`ZIP contains duplicate entry ${wantedName}`);
      match = { compression, compressedSize, uncompressedSize, localHeaderOffset };
    }
    offset += 46 + filenameLength + extraLength + commentLength;
  }
  if (!match) throw new Error(`ZIP is missing required entry ${wantedName}`);
  if (match.uncompressedSize > 64_000_000) {
    throw new Error(`ZIP entry ${wantedName} exceeds the metadata extraction limit`);
  }

  const localOffset = match.localHeaderOffset;
  assertBufferRange(archive, localOffset, 30, `ZIP local header for ${wantedName} is truncated`);
  if (archive.readUInt32LE(localOffset) !== 0x04034b50) {
    throw new Error(`ZIP local header for ${wantedName} is malformed`);
  }
  const filenameLength = archive.readUInt16LE(localOffset + 26);
  const extraLength = archive.readUInt16LE(localOffset + 28);
  const dataOffset = localOffset + 30 + filenameLength + extraLength;
  assertBufferRange(
    archive,
    dataOffset,
    match.compressedSize,
    `ZIP entry ${wantedName} is truncated`,
  );
  const compressed = archive.subarray(dataOffset, dataOffset + match.compressedSize);
  if (compressed.byteLength !== match.compressedSize) {
    throw new Error(`ZIP entry ${wantedName} is truncated`);
  }
  const output = match.compression === 0
    ? Buffer.from(compressed)
    : match.compression === 8
      ? inflateRawSync(compressed)
      : null;
  if (!output || output.byteLength !== match.uncompressedSize) {
    throw new Error(`ZIP entry ${wantedName} uses an unsupported or invalid compression form`);
  }
  return output;
}

async function loadArchive(
  sourceDir: string,
  archive: typeof ARCHIVES[keyof typeof ARCHIVES],
  offline: boolean,
): Promise<Buffer> {
  const filePath = path.join(sourceDir, archive.filename);
  const cached = await readFile(filePath).catch(() => null);
  if (cached && hashMd5(cached) === archive.md5) return cached;
  if (offline) {
    throw new Error(`Offline harvest requires a checksum-valid ${archive.filename}`);
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 60_000);
  let response: Response;
  try {
    response = await fetch(archive.url, {
      headers: {
        accept: 'application/octet-stream, application/zip;q=0.9, */*;q=0.8',
        'user-agent': 'Editron-SFX-Harvester/1.0 (contact: engineering@insturix.com)',
      },
      redirect: 'follow',
      signal: controller.signal,
    });
  } finally {
    clearTimeout(timeout);
  }
  if (!response.ok) {
    throw new Error(`FSD50K archive download failed with HTTP ${response.status}`);
  }
  const declaredLength = Number(response.headers.get('content-length'));
  if (Number.isFinite(declaredLength) && declaredLength > archive.maxBytes) {
    throw new Error(`${archive.filename} exceeds its pinned download size limit`);
  }
  const buffer = await readBoundedResponse(response, archive.maxBytes);
  if (buffer.byteLength === 0) {
    throw new Error(`${archive.filename} has an invalid downloaded size`);
  }
  if (hashMd5(buffer) !== archive.md5) {
    throw new Error(`${archive.filename} failed its pinned MD5 checksum`);
  }
  await atomicWrite(filePath, buffer);
  return buffer;
}

async function readBoundedResponse(response: Response, maxBytes: number): Promise<Buffer> {
  if (!response.body) throw new Error('FSD50K archive response has no body');
  const reader = response.body.getReader();
  const chunks: Buffer[] = [];
  let totalBytes = 0;
  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    totalBytes += value.byteLength;
    if (totalBytes > maxBytes) {
      await reader.cancel('FSD50K archive exceeded its pinned size limit');
      throw new Error('FSD50K archive exceeded its pinned download size limit');
    }
    chunks.push(Buffer.from(value));
  }
  return Buffer.concat(chunks, totalBytes);
}

function findEndOfCentralDirectory(archive: Buffer): number {
  const minimumOffset = Math.max(0, archive.byteLength - 65_557);
  for (let offset = archive.byteLength - 22; offset >= minimumOffset; offset -= 1) {
    if (archive.readUInt32LE(offset) === 0x06054b50) return offset;
  }
  throw new Error('ZIP end-of-central-directory record is missing');
}

function assertBufferRange(
  buffer: Buffer,
  offset: number,
  length: number,
  message: string,
): void {
  if (
    !Number.isSafeInteger(offset)
    || !Number.isSafeInteger(length)
    || offset < 0
    || length < 0
    || offset + length > buffer.byteLength
  ) {
    throw new Error(message);
  }
}

function assertSafeZipPath(name: string): void {
  const normalized = name.replaceAll('\\', '/');
  if (
    !normalized
    || normalized.startsWith('/')
    || /^[A-Za-z]:/.test(normalized)
    || normalized.split('/').some(segment => segment === '..')
  ) {
    throw new Error('ZIP contains an unsafe entry path');
  }
}

async function atomicWrite(filePath: string, value: string | Buffer): Promise<void> {
  await mkdir(path.dirname(filePath), { recursive: true });
  const temporaryPath = `${filePath}.${process.pid}.${randomUUID()}.tmp`;
  await writeFile(temporaryPath, value);
  await rm(filePath, { force: true });
  await rename(temporaryPath, filePath);
}

function hashMd5(buffer: Buffer): string {
  return createHash('md5').update(buffer).digest('hex');
}

function readCliOptions(argv: string[]): CliOptions {
  let outDir = path.resolve('tmp/sfx-harvest/fsd50k-v1');
  let offline = false;
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (argument === '--offline') {
      offline = true;
    } else if (argument === '--out') {
      const value = argv[index + 1];
      if (!value) throw new Error('--out requires a directory path');
      outDir = path.resolve(value);
      index += 1;
    } else {
      throw new Error(`Unknown argument: ${argument}`);
    }
  }
  return { outDir, offline };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  runFsd50kMetadataHarvest(readCliOptions(process.argv.slice(2))).catch(error => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  });
}
