import { spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import { createReadStream } from 'node:fs';
import {
  mkdir,
  open,
  readFile,
  readdir,
  rename,
  rm,
  stat,
  writeFile,
} from 'node:fs/promises';
import path from 'node:path';

import {
  FSD50K_AUDIO_ARCHIVES,
  type Fsd50kArchiveDownloadReceipt,
  type Fsd50kCorpusPlan,
  type Fsd50kCorpusPlanEntry,
} from './sfx-fsd50k-corpus';
import { FSD50K_EXPECTED_COUNTS } from './sfx-fsd50k-harvest';

const EXTRACTION_RECEIPT_FILENAME = 'candidate-extraction-receipt.json';
const EXTRACTION_TIMEOUT_MS = 30 * 60_000;
const MAX_EXTRACTOR_OUTPUT_BYTES = 64 * 1024;
const HASH_CONCURRENCY = 4;

interface Fsd50kArchiveDownloadSetReceipt {
  version: 'editron-fsd50k-archive-download-receipt-v1';
  completedAt: string;
  archiveSetSha256: string;
  archives: Fsd50kArchiveDownloadReceipt[];
}

export interface Fsd50kArchiveExtractionRequest {
  archivePath: string;
  listFilePath: string;
  outputDirectory: string;
  sourceAudioPaths: readonly string[];
  sevenZipBinary: string;
}

export interface Fsd50kCandidateExtractionEntry {
  sourceId: string;
  sourceSplit: Fsd50kCorpusPlanEntry['sourceSplit'];
  sourceTrainingSplit: Fsd50kCorpusPlanEntry['sourceTrainingSplit'];
  sourceAudioPath: string;
  sizeBytes: number;
  sha256: string;
}

export interface Fsd50kCandidateExtractionReceipt {
  version: 'editron-fsd50k-candidate-extraction-v1';
  completedAt: string;
  source: {
    candidatePoolSha256: string;
    archiveSetSha256: string;
    archiveDownloadReceiptSha256: string;
    archives: Array<{
      key: string;
      sizeBytes: number;
      md5: string;
    }>;
  };
  selection: {
    mode: 'full-corpus' | 'deterministic-prefix-canary';
    requestedLimit: number | null;
    selectionSha256: string;
  };
  policy: {
    purpose: 'offline-acoustic-inspection-input';
    publicationAllowed: false;
    productionCatalogMutationAllowed: false;
    everyEntryRequiresAudioInspection: true;
    everyEntryRequiresEmbeddingClassification: true;
  };
  counts: {
    plannedCandidates: number;
    selectedCandidates: number;
    extractedCandidates: number;
    devCandidates: number;
    evalCandidates: number;
    totalBytes: number;
    missingCandidates: 0;
    unexpectedFiles: 0;
    unsafePaths: 0;
  };
  entries: Fsd50kCandidateExtractionEntry[];
  extractionDigestSha256: string;
}

export interface ExtractFsd50kCandidatesOptions {
  corpusPlan: unknown;
  archiveDownloadReceipt: unknown;
  archiveDirectory: string;
  destinationDirectory: string;
  limit?: number;
  completedAt?: Date;
  sevenZipBinary?: string;
  expectedPlanCandidateCount?: number;
  onProgress?: (event: {
    phase: 'extract' | 'hash';
    completed: number;
    total: number;
    sourceId?: string;
  }) => void;
}

export interface ExtractFsd50kCandidatesDependencies {
  runArchiveExtractor?: (request: Fsd50kArchiveExtractionRequest) => Promise<void>;
  getArchiveSize?: (filePath: string) => Promise<number>;
}

export interface ExtractFsd50kCandidatesResult {
  receipt: Fsd50kCandidateExtractionReceipt;
  receiptPath: string;
  reusedExisting: boolean;
}

export class Fsd50kExtractionError extends Error {
  constructor(
    public readonly code: string,
    message: string,
    options?: ErrorOptions,
  ) {
    super(message, options);
    this.name = 'Fsd50kExtractionError';
  }
}

export async function extractFsd50kCandidates(
  options: ExtractFsd50kCandidatesOptions,
  dependencies: ExtractFsd50kCandidatesDependencies = {},
): Promise<ExtractFsd50kCandidatesResult> {
  const completedAt = options.completedAt ?? new Date();
  if (Number.isNaN(completedAt.getTime())) {
    throw new Fsd50kExtractionError(
      'INVALID_EXTRACTION_CLOCK',
      'Candidate extraction timestamp is invalid',
    );
  }
  const expectedPlanCandidateCount =
    options.expectedPlanCandidateCount ?? FSD50K_EXPECTED_COUNTS.cc0;
  const plan = validateCorpusPlan(options.corpusPlan, expectedPlanCandidateCount);
  const archiveDirectory = path.resolve(options.archiveDirectory);
  const destinationDirectory = path.resolve(options.destinationDirectory);
  assertSafeDestination(destinationDirectory);
  const downloadReceipt = await validateArchiveDownloadReceipt(
    options.archiveDownloadReceipt,
    plan,
    archiveDirectory,
    dependencies.getArchiveSize ?? getFileSize,
  );
  const selectedEntries = selectEntries(plan.entries, options.limit);
  const selectionSha256 = hashCanonical(
    selectedEntries.map(entry => ({
      sourceId: entry.sourceId,
      sourceSplit: entry.sourceSplit,
      sourceAudioPath: entry.sourceAudioPath,
    })),
  );

  const reused = await tryReuseExistingExtraction(
    destinationDirectory,
    plan,
    selectedEntries,
    selectionSha256,
  );
  if (reused) {
    return {
      receipt: reused,
      receiptPath: path.join(destinationDirectory, EXTRACTION_RECEIPT_FILENAME),
      reusedExisting: true,
    };
  }

  if (await pathExists(destinationDirectory)) {
    throw new Fsd50kExtractionError(
      'DESTINATION_EXISTS',
      `Extraction destination already exists without a matching receipt: ${destinationDirectory}`,
    );
  }

  const workRoot = `${destinationDirectory}.work`;
  assertSafeWorkRoot(destinationDirectory, workRoot);
  await rm(workRoot, { force: true, recursive: true });
  const stagedAudioRoot = path.join(workRoot, 'audio');
  const listRoot = path.join(workRoot, 'lists');
  await mkdir(stagedAudioRoot, { recursive: true });
  await mkdir(listRoot, { recursive: true });

  const runArchiveExtractor =
    dependencies.runArchiveExtractor ?? runSevenZipArchiveExtractor;
  let extractedSplits = 0;
  const groupedEntries = groupEntriesBySplit(selectedEntries);
  for (const split of ['dev', 'eval'] as const) {
    const entries = groupedEntries[split];
    if (entries.length === 0) continue;
    const listFilePath = path.join(listRoot, `${split}-candidates.txt`);
    await writeFile(
      listFilePath,
      `${entries.map(entry => entry.sourceAudioPath).join('\n')}\n`,
      'utf8',
    );
    await runArchiveExtractor({
      archivePath: path.join(
        archiveDirectory,
        split === 'dev' ? 'FSD50K.dev_audio.zip' : 'FSD50K.eval_audio.zip',
      ),
      listFilePath,
      outputDirectory: stagedAudioRoot,
      sourceAudioPaths: entries.map(entry => entry.sourceAudioPath),
      sevenZipBinary:
        options.sevenZipBinary
        ?? (process.platform === 'win32' ? '7z.exe' : '7z'),
    });
    extractedSplits += 1;
    options.onProgress?.({
      phase: 'extract',
      completed: extractedSplits,
      total: Number(groupedEntries.dev.length > 0) + Number(groupedEntries.eval.length > 0),
    });
  }

  const inspectedEntries = await inspectExtractedFiles(
    stagedAudioRoot,
    selectedEntries,
    options.onProgress,
  );
  const receipt = buildExtractionReceipt({
    completedAt,
    plan,
    downloadReceipt,
    selectedEntries,
    inspectedEntries,
    requestedLimit: options.limit,
    selectionSha256,
  });
  await writeFile(
    path.join(stagedAudioRoot, EXTRACTION_RECEIPT_FILENAME),
    `${JSON.stringify(receipt, null, 2)}\n`,
    'utf8',
  );
  await mkdir(path.dirname(destinationDirectory), { recursive: true });
  await rename(stagedAudioRoot, destinationDirectory);
  await rm(workRoot, { force: true, recursive: true });

  return {
    receipt,
    receiptPath: path.join(destinationDirectory, EXTRACTION_RECEIPT_FILENAME),
    reusedExisting: false,
  };
}

function validateCorpusPlan(
  value: unknown,
  expectedCandidateCount: number,
): Fsd50kCorpusPlan {
  if (!isRecord(value) || value.version !== 'editron-fsd50k-corpus-plan-v1') {
    throw new Fsd50kExtractionError(
      'INVALID_CORPUS_PLAN',
      'FSD50K corpus plan has an unsupported version',
    );
  }
  const plan = value as unknown as Fsd50kCorpusPlan;
  if (!Array.isArray(plan.entries) || !Array.isArray(plan.archives)) {
    throw new Fsd50kExtractionError(
      'INVALID_CORPUS_PLAN',
      'FSD50K corpus plan is missing entries or archives',
    );
  }
  if (
    plan.policy?.publicationAllowed !== false
    || plan.policy?.productionCatalogMutationAllowed !== false
    || plan.policy?.everyCandidateRequiresAudioInspection !== true
    || plan.policy?.everyCandidateRequiresEmbeddingClassification !== true
  ) {
    throw new Fsd50kExtractionError(
      'INVALID_CORPUS_POLICY',
      'FSD50K corpus plan does not preserve the non-publication inspection policy',
    );
  }
  if (
    !Number.isSafeInteger(expectedCandidateCount)
    || expectedCandidateCount <= 0
    || plan.entries.length !== expectedCandidateCount
    || plan.counts?.candidates !== expectedCandidateCount
  ) {
    throw new Fsd50kExtractionError(
      'CORPUS_PLAN_COUNT_MISMATCH',
      `Expected ${expectedCandidateCount} planned candidates, received ${plan.entries.length}`,
    );
  }

  const sourceIds = new Set<string>();
  const sourcePaths = new Set<string>();
  let devCandidates = 0;
  let evalCandidates = 0;
  for (let index = 0; index < plan.entries.length; index += 1) {
    const entry = plan.entries[index];
    validatePlanEntry(entry);
    if (sourceIds.has(entry.sourceId) || sourcePaths.has(entry.sourceAudioPath)) {
      throw new Fsd50kExtractionError(
        'DUPLICATE_CORPUS_ENTRY',
        `Duplicate corpus entry detected for ${entry.sourceId}`,
      );
    }
    if (index > 0 && compareEntries(plan.entries[index - 1], entry) >= 0) {
      throw new Fsd50kExtractionError(
        'NON_CANONICAL_CORPUS_ORDER',
        `Corpus entry ${entry.sourceId} is not in canonical source order`,
      );
    }
    sourceIds.add(entry.sourceId);
    sourcePaths.add(entry.sourceAudioPath);
    if (entry.sourceSplit === 'dev') devCandidates += 1;
    else evalCandidates += 1;
  }
  if (
    plan.counts.devCandidates !== devCandidates
    || plan.counts.evalCandidates !== evalCandidates
    || devCandidates + evalCandidates !== expectedCandidateCount
  ) {
    throw new Fsd50kExtractionError(
      'CORPUS_SPLIT_COUNT_MISMATCH',
      'FSD50K corpus plan split counts do not match its entries',
    );
  }
  if (hashCanonical(plan.entries) !== plan.candidatePoolSha256) {
    throw new Fsd50kExtractionError(
      'CORPUS_PLAN_HASH_MISMATCH',
      'FSD50K corpus plan entries do not match candidatePoolSha256',
    );
  }
  if (
    plan.archiveSetSha256 !== hashArchiveSet(FSD50K_AUDIO_ARCHIVES)
    || hashArchiveSet(plan.archives) !== plan.archiveSetSha256
  ) {
    throw new Fsd50kExtractionError(
      'ARCHIVE_SET_HASH_MISMATCH',
      'FSD50K corpus plan does not match the pinned archive set',
    );
  }
  return plan;
}

function validatePlanEntry(entry: Fsd50kCorpusPlanEntry): void {
  if (!isRecord(entry) || !/^\d+$/.test(entry.sourceId)) {
    throw new Fsd50kExtractionError(
      'INVALID_CORPUS_ENTRY',
      'FSD50K corpus entry has an invalid source ID',
    );
  }
  if (entry.sourceSplit !== 'dev' && entry.sourceSplit !== 'eval') {
    throw new Fsd50kExtractionError(
      'INVALID_CORPUS_ENTRY',
      `FSD50K corpus entry ${entry.sourceId} has an invalid split`,
    );
  }
  const expectedPath =
    `FSD50K.${entry.sourceSplit}_audio/${entry.sourceId}.wav`;
  if (
    entry.sourceAudioPath !== expectedPath
    || entry.sourceAudioPath.includes('..')
    || path.isAbsolute(entry.sourceAudioPath)
  ) {
    throw new Fsd50kExtractionError(
      'UNSAFE_SOURCE_AUDIO_PATH',
      `FSD50K corpus entry ${entry.sourceId} has unsafe path ${entry.sourceAudioPath}`,
    );
  }
}

async function validateArchiveDownloadReceipt(
  value: unknown,
  plan: Fsd50kCorpusPlan,
  archiveDirectory: string,
  getArchiveSize: (filePath: string) => Promise<number>,
): Promise<Fsd50kArchiveDownloadSetReceipt> {
  if (
    !isRecord(value)
    || value.version !== 'editron-fsd50k-archive-download-receipt-v1'
    || !Array.isArray(value.archives)
  ) {
    throw new Fsd50kExtractionError(
      'INVALID_ARCHIVE_DOWNLOAD_RECEIPT',
      'FSD50K archive download receipt has an unsupported shape',
    );
  }
  const receipt = value as unknown as Fsd50kArchiveDownloadSetReceipt;
  if (
    receipt.archiveSetSha256 !== plan.archiveSetSha256
    || Number.isNaN(new Date(receipt.completedAt).getTime())
    || receipt.archives.length !== FSD50K_AUDIO_ARCHIVES.length
  ) {
    throw new Fsd50kExtractionError(
      'INVALID_ARCHIVE_DOWNLOAD_RECEIPT',
      'FSD50K archive download receipt does not match the corpus plan',
    );
  }
  const byKey = new Map(receipt.archives.map(archive => [archive.key, archive]));
  if (byKey.size !== receipt.archives.length) {
    throw new Fsd50kExtractionError(
      'DUPLICATE_ARCHIVE_RECEIPT',
      'FSD50K archive download receipt contains duplicate archive keys',
    );
  }
  for (const expected of FSD50K_AUDIO_ARCHIVES) {
    const actual = byKey.get(expected.key);
    const expectedPath = path.resolve(archiveDirectory, expected.filename);
    if (
      !actual
      || actual.sizeBytes !== expected.sizeBytes
      || actual.md5 !== expected.md5
      || path.resolve(actual.path) !== expectedPath
    ) {
      throw new Fsd50kExtractionError(
        'ARCHIVE_RECEIPT_MISMATCH',
        `FSD50K archive receipt mismatch for ${expected.key}`,
      );
    }
    const diskSize = await getArchiveSize(expectedPath);
    if (diskSize !== expected.sizeBytes) {
      throw new Fsd50kExtractionError(
        'ARCHIVE_DISK_SIZE_MISMATCH',
        `${expected.key} has ${diskSize} bytes on disk; expected ${expected.sizeBytes}`,
      );
    }
  }
  return receipt;
}

function selectEntries(
  entries: readonly Fsd50kCorpusPlanEntry[],
  limit: number | undefined,
): Fsd50kCorpusPlanEntry[] {
  if (limit === undefined) return [...entries];
  if (!Number.isSafeInteger(limit) || limit <= 0 || limit > entries.length) {
    throw new Fsd50kExtractionError(
      'INVALID_EXTRACTION_LIMIT',
      `Extraction limit must be an integer from 1 to ${entries.length}`,
    );
  }
  return entries.slice(0, limit);
}

function groupEntriesBySplit(
  entries: readonly Fsd50kCorpusPlanEntry[],
): Record<'dev' | 'eval', Fsd50kCorpusPlanEntry[]> {
  return {
    dev: entries.filter(entry => entry.sourceSplit === 'dev'),
    eval: entries.filter(entry => entry.sourceSplit === 'eval'),
  };
}

async function inspectExtractedFiles(
  root: string,
  expectedEntries: readonly Fsd50kCorpusPlanEntry[],
  onProgress: ExtractFsd50kCandidatesOptions['onProgress'],
): Promise<Fsd50kCandidateExtractionEntry[]> {
  const actualFiles = await listFilesRecursively(root);
  const expectedPaths = new Set(expectedEntries.map(entry => entry.sourceAudioPath));
  const unexpectedFiles = actualFiles.filter(file => !expectedPaths.has(file));
  if (unexpectedFiles.length > 0) {
    throw new Fsd50kExtractionError(
      'UNEXPECTED_EXTRACTED_FILE',
      `Extractor produced unexpected file ${unexpectedFiles[0]}`,
    );
  }
  const actualPathSet = new Set(actualFiles);
  const missing = expectedEntries.filter(entry => !actualPathSet.has(entry.sourceAudioPath));
  if (missing.length > 0) {
    throw new Fsd50kExtractionError(
      'MISSING_EXTRACTED_FILE',
      `Extractor did not produce ${missing[0].sourceAudioPath}`,
    );
  }

  let completed = 0;
  return mapWithConcurrency(expectedEntries, HASH_CONCURRENCY, async entry => {
    const filePath = resolveSafeOutputPath(root, entry.sourceAudioPath);
    const details = await stat(filePath);
    if (!details.isFile() || details.size <= 12) {
      throw new Fsd50kExtractionError(
        'INVALID_EXTRACTED_AUDIO',
        `${entry.sourceAudioPath} is empty or not a regular file`,
      );
    }
    await assertWavHeader(filePath, entry.sourceAudioPath);
    const sha256 = await hashFileSha256(filePath);
    completed += 1;
    onProgress?.({
      phase: 'hash',
      completed,
      total: expectedEntries.length,
      sourceId: entry.sourceId,
    });
    return {
      sourceId: entry.sourceId,
      sourceSplit: entry.sourceSplit,
      sourceTrainingSplit: entry.sourceTrainingSplit,
      sourceAudioPath: entry.sourceAudioPath,
      sizeBytes: details.size,
      sha256,
    };
  });
}

function buildExtractionReceipt(input: {
  completedAt: Date;
  plan: Fsd50kCorpusPlan;
  downloadReceipt: Fsd50kArchiveDownloadSetReceipt;
  selectedEntries: readonly Fsd50kCorpusPlanEntry[];
  inspectedEntries: Fsd50kCandidateExtractionEntry[];
  requestedLimit: number | undefined;
  selectionSha256: string;
}): Fsd50kCandidateExtractionReceipt {
  const digestPayload = {
    candidatePoolSha256: input.plan.candidatePoolSha256,
    archiveSetSha256: input.plan.archiveSetSha256,
    selectionSha256: input.selectionSha256,
    entries: input.inspectedEntries,
  };
  return {
    version: 'editron-fsd50k-candidate-extraction-v1',
    completedAt: input.completedAt.toISOString(),
    source: {
      candidatePoolSha256: input.plan.candidatePoolSha256,
      archiveSetSha256: input.plan.archiveSetSha256,
      archiveDownloadReceiptSha256: hashCanonical(input.downloadReceipt),
      archives: FSD50K_AUDIO_ARCHIVES.map(archive => ({
        key: archive.key,
        sizeBytes: archive.sizeBytes,
        md5: archive.md5,
      })),
    },
    selection: {
      mode: input.requestedLimit === undefined
        ? 'full-corpus'
        : 'deterministic-prefix-canary',
      requestedLimit: input.requestedLimit ?? null,
      selectionSha256: input.selectionSha256,
    },
    policy: {
      purpose: 'offline-acoustic-inspection-input',
      publicationAllowed: false,
      productionCatalogMutationAllowed: false,
      everyEntryRequiresAudioInspection: true,
      everyEntryRequiresEmbeddingClassification: true,
    },
    counts: {
      plannedCandidates: input.plan.entries.length,
      selectedCandidates: input.selectedEntries.length,
      extractedCandidates: input.inspectedEntries.length,
      devCandidates: input.inspectedEntries.filter(entry => entry.sourceSplit === 'dev').length,
      evalCandidates: input.inspectedEntries.filter(entry => entry.sourceSplit === 'eval').length,
      totalBytes: input.inspectedEntries.reduce((total, entry) => total + entry.sizeBytes, 0),
      missingCandidates: 0,
      unexpectedFiles: 0,
      unsafePaths: 0,
    },
    entries: input.inspectedEntries,
    extractionDigestSha256: hashCanonical(digestPayload),
  };
}

async function tryReuseExistingExtraction(
  destinationDirectory: string,
  plan: Fsd50kCorpusPlan,
  selectedEntries: readonly Fsd50kCorpusPlanEntry[],
  selectionSha256: string,
): Promise<Fsd50kCandidateExtractionReceipt | null> {
  if (!await pathExists(destinationDirectory)) return null;
  const receiptPath = path.join(destinationDirectory, EXTRACTION_RECEIPT_FILENAME);
  let parsed: unknown;
  try {
    parsed = JSON.parse(await readFile(receiptPath, 'utf8'));
  } catch {
    return null;
  }
  if (
    !isRecord(parsed)
    || parsed.version !== 'editron-fsd50k-candidate-extraction-v1'
    || !isRecord(parsed.source)
    || !isRecord(parsed.selection)
    || !isRecord(parsed.counts)
    || !Array.isArray(parsed.entries)
    || parsed.source.candidatePoolSha256 !== plan.candidatePoolSha256
    || parsed.source.archiveSetSha256 !== plan.archiveSetSha256
    || parsed.selection.selectionSha256 !== selectionSha256
    || parsed.counts.selectedCandidates !== selectedEntries.length
  ) {
    return null;
  }
  const receipt = parsed as unknown as Fsd50kCandidateExtractionReceipt;
  const inspected = await inspectExtractedFiles(
    destinationDirectory,
    selectedEntries,
    undefined,
  );
  if (
    hashCanonical(inspected) !== hashCanonical(receipt.entries)
    || receipt.extractionDigestSha256 !== hashCanonical({
      candidatePoolSha256: plan.candidatePoolSha256,
      archiveSetSha256: plan.archiveSetSha256,
      selectionSha256,
      entries: inspected,
    })
  ) {
    return null;
  }
  return receipt;
}

async function runSevenZipArchiveExtractor(
  request: Fsd50kArchiveExtractionRequest,
): Promise<void> {
  const args = [
    'x',
    request.archivePath,
    `-o${request.outputDirectory}`,
    '-y',
    '-aoa',
    '-bd',
    '-bb0',
    '-scsUTF-8',
    `@${request.listFilePath}`,
  ];
  await new Promise<void>((resolve, reject) => {
    const child = spawn(request.sevenZipBinary, args, {
      stdio: ['ignore', 'pipe', 'pipe'],
      windowsHide: true,
    });
    let outputTail: Buffer = Buffer.alloc(0);
    let settled = false;
    const timeout = setTimeout(() => {
      if (settled) return;
      settled = true;
      child.kill();
      reject(new Fsd50kExtractionError(
        'EXTRACTOR_TIMEOUT',
        `7-Zip exceeded ${EXTRACTION_TIMEOUT_MS}ms while extracting ${path.basename(request.archivePath)}`,
      ));
    }, EXTRACTION_TIMEOUT_MS);
    const collect = (chunk: Buffer) => {
      outputTail = appendBoundedTail(outputTail, chunk, MAX_EXTRACTOR_OUTPUT_BYTES);
    };
    child.stdout.on('data', collect);
    child.stderr.on('data', collect);
    child.on('error', (error) => {
      if (settled) return;
      settled = true;
      clearTimeout(timeout);
      reject(new Fsd50kExtractionError(
        'EXTRACTOR_FAILED',
        `Unable to start 7-Zip: ${error.message}`,
        { cause: error },
      ));
    });
    child.on('close', (code) => {
      if (settled) return;
      settled = true;
      clearTimeout(timeout);
      if (code !== 0) {
        reject(new Fsd50kExtractionError(
          'EXTRACTOR_FAILED',
          `7-Zip exited with ${code}: ${outputTail.toString('utf8').slice(-2_000)}`,
        ));
        return;
      }
      resolve();
    });
  });
}

async function listFilesRecursively(root: string): Promise<string[]> {
  const files: string[] = [];
  const visit = async (directory: string): Promise<void> => {
    const entries = await readdir(directory, { withFileTypes: true });
    for (const entry of entries) {
      const absolute = path.join(directory, entry.name);
      if (entry.isSymbolicLink()) {
        throw new Fsd50kExtractionError(
          'UNSAFE_EXTRACTED_LINK',
          `Extractor produced symbolic link ${absolute}`,
        );
      }
      if (entry.isDirectory()) {
        await visit(absolute);
      } else if (entry.isFile()) {
        const relative = path.relative(root, absolute).split(path.sep).join('/');
        if (relative !== EXTRACTION_RECEIPT_FILENAME) files.push(relative);
      } else {
        throw new Fsd50kExtractionError(
          'UNSAFE_EXTRACTED_ENTRY',
          `Extractor produced unsupported entry ${absolute}`,
        );
      }
    }
  };
  await visit(root);
  return files.sort();
}

function resolveSafeOutputPath(root: string, sourceAudioPath: string): string {
  const resolvedRoot = path.resolve(root);
  const resolved = path.resolve(resolvedRoot, ...sourceAudioPath.split('/'));
  const relative = path.relative(resolvedRoot, resolved);
  if (!relative || relative.startsWith('..') || path.isAbsolute(relative)) {
    throw new Fsd50kExtractionError(
      'UNSAFE_OUTPUT_PATH',
      `Candidate path escapes extraction root: ${sourceAudioPath}`,
    );
  }
  return resolved;
}

async function assertWavHeader(filePath: string, sourceAudioPath: string): Promise<void> {
  const file = await open(filePath, 'r');
  const header = Buffer.alloc(12);
  try {
    const { bytesRead } = await file.read(header, 0, header.length, 0);
    if (
      bytesRead !== header.length
      || header.subarray(0, 4).toString('ascii') !== 'RIFF'
      || header.subarray(8, 12).toString('ascii') !== 'WAVE'
    ) {
      throw new Fsd50kExtractionError(
        'INVALID_WAV_HEADER',
        `${sourceAudioPath} is not a RIFF/WAVE file`,
      );
    }
  } finally {
    await file.close();
  }
}

async function hashFileSha256(filePath: string): Promise<string> {
  const hash = createHash('sha256');
  for await (const chunk of createReadStream(filePath)) {
    hash.update(chunk as Buffer);
  }
  return hash.digest('hex');
}

async function getFileSize(filePath: string): Promise<number> {
  const details = await stat(filePath);
  if (!details.isFile()) {
    throw new Fsd50kExtractionError(
      'ARCHIVE_NOT_FILE',
      `Archive path is not a regular file: ${filePath}`,
    );
  }
  return details.size;
}

async function pathExists(filePath: string): Promise<boolean> {
  try {
    await stat(filePath);
    return true;
  } catch (error) {
    if (
      error
      && typeof error === 'object'
      && 'code' in error
      && (error as { code?: unknown }).code === 'ENOENT'
    ) {
      return false;
    }
    throw error;
  }
}

function assertSafeDestination(destinationDirectory: string): void {
  const parsed = path.parse(destinationDirectory);
  if (
    destinationDirectory === parsed.root
    || !path.basename(destinationDirectory)
    || destinationDirectory.includes('\0')
  ) {
    throw new Fsd50kExtractionError(
      'UNSAFE_DESTINATION',
      `Unsafe extraction destination: ${destinationDirectory}`,
    );
  }
}

function assertSafeWorkRoot(destinationDirectory: string, workRoot: string): void {
  if (
    workRoot !== `${destinationDirectory}.work`
    || path.dirname(workRoot) !== path.dirname(destinationDirectory)
  ) {
    throw new Fsd50kExtractionError(
      'UNSAFE_WORK_ROOT',
      `Unsafe extraction work root: ${workRoot}`,
    );
  }
}

function compareEntries(
  left: Fsd50kCorpusPlanEntry,
  right: Fsd50kCorpusPlanEntry,
): number {
  return Number(left.sourceId) - Number(right.sourceId)
    || left.sourceId.localeCompare(right.sourceId);
}

function hashArchiveSet(
  archives: ReadonlyArray<{
    key: string;
    split: string;
    partOrder: number;
    sizeBytes: number;
    md5: string;
    url: string;
  }>,
): string {
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

function hashCanonical(value: unknown): string {
  return createHash('sha256').update(JSON.stringify(value)).digest('hex');
}

function appendBoundedTail(current: Buffer, chunk: Buffer, maximumBytes: number): Buffer {
  const combined = Buffer.concat([current, chunk]);
  return combined.length <= maximumBytes
    ? combined
    : combined.subarray(combined.length - maximumBytes);
}

async function mapWithConcurrency<T, R>(
  items: readonly T[],
  concurrency: number,
  mapper: (item: T) => Promise<R>,
): Promise<R[]> {
  const results = new Array<R>(items.length);
  let nextIndex = 0;
  const workers = Array.from(
    { length: Math.min(concurrency, Math.max(items.length, 1)) },
    async () => {
      while (true) {
        const index = nextIndex;
        nextIndex += 1;
        if (index >= items.length) return;
        results[index] = await mapper(items[index]);
      }
    },
  );
  await Promise.all(workers);
  return results;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value));
}
