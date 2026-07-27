import { createHash } from 'node:crypto';
import {
  lstat,
  mkdir,
  mkdtemp,
  readFile,
  realpath,
  rename,
  rm,
  writeFile,
} from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

import {
  conditionSfxCatalogAsset,
  type ConditionSfxCatalogAssetResult,
} from '../lib/pipeline/audio-conditioning';
import type { SfxCatalogEventRole } from '../lib/pipeline/sfx-catalog';
import { resolveLicensedSourcePath } from './curate-sfx-catalog';
import {
  SFX_CATALOG_REVIEW_SEED,
  type SfxCatalogReviewCandidate,
  type SfxCatalogReviewCollection,
  type SfxCatalogReviewMetadata,
  type SfxCatalogReviewSeed,
} from './sfx-catalog-review-seed';

const TEMPLATE_TOKEN = '__SFX_REVIEW_DATA__';
const DEFAULT_TEMPLATE_PATH = fileURLToPath(
  new URL('./sfx-catalog-review-template.html', import.meta.url),
);

interface ReviewProvenance {
  provider: string;
  providerAssetId: string;
  licenseId: string;
  licenseUrl: string;
  attributionRequired: boolean;
}

export interface SfxCatalogReviewReportCandidate {
  reviewId: string;
  status: 'pending';
  originalSourcePath: string;
  audioPath: string;
  sourceHashSha256: string;
  conditionedHashSha256: string;
  gainDb: number;
  sourceInspection: ConditionSfxCatalogAssetResult['source'];
  outputInspection: ConditionSfxCatalogAssetResult['output'];
  curation: SfxCatalogReviewMetadata & {
    sourcePath: string;
    provenance: ReviewProvenance;
  };
}

export interface SfxCatalogReviewReport {
  version: 'sfx-catalog-review-report-v1';
  generatedAt: string;
  sourceSetHashSha256: string;
  requiredRoles: SfxCatalogEventRole[];
  coverage: Array<{
    role: SfxCatalogEventRole;
    candidateCount: number;
    status: 'covered' | 'gap';
  }>;
  licenses: Array<{
    collectionId: string;
    provider: string;
    licenseId: string;
    licenseUrl: string;
    attributionRequired: boolean;
    evidencePath: string;
    evidenceHashSha256: string;
  }>;
  candidates: SfxCatalogReviewReportCandidate[];
}

export interface PrepareSfxCatalogReviewOptions {
  sourceRoot: string;
  outDir: string;
  seed?: SfxCatalogReviewSeed;
  now?: Date;
  templatePath?: string;
  conditionAsset?: (buffer: Buffer) => Promise<ConditionSfxCatalogAssetResult>;
}

export interface PreparedSfxCatalogReview {
  report: SfxCatalogReviewReport;
  outDir: string;
  indexPath: string;
  reportPath: string;
}

interface PreflightLicense {
  report: SfxCatalogReviewReport['licenses'][number];
  buffer: Buffer;
}

interface PreflightCandidate {
  report: SfxCatalogReviewReportCandidate;
  buffer: Buffer;
}

export class SfxCatalogReviewError extends Error {
  constructor(
    public readonly code: string,
    message: string,
    options?: ErrorOptions,
  ) {
    super(message, options);
    this.name = 'SfxCatalogReviewError';
  }
}

export async function prepareSfxCatalogReview(
  options: PrepareSfxCatalogReviewOptions,
): Promise<PreparedSfxCatalogReview> {
  const seed = options.seed ?? SFX_CATALOG_REVIEW_SEED;
  validateSeed(seed);
  const now = options.now ?? new Date();
  if (Number.isNaN(now.getTime())) {
    throw new SfxCatalogReviewError('INVALID_SFX_REVIEW_CLOCK', 'Review timestamp is invalid');
  }

  const sourceRoot = await realpath(path.resolve(options.sourceRoot));
  const outDir = path.resolve(options.outDir);
  await assertOutputMissing(outDir);
  const template = await readFile(
    path.resolve(options.templatePath ?? DEFAULT_TEMPLATE_PATH),
    'utf8',
  );
  if (template.split(TEMPLATE_TOKEN).length !== 2) {
    throw new SfxCatalogReviewError(
      'INVALID_SFX_REVIEW_TEMPLATE',
      `Review template must contain exactly one ${TEMPLATE_TOKEN} token`,
    );
  }

  const collectionById = new Map(seed.collections.map(collection => [collection.id, collection]));
  const licenseAssets = await Promise.all(seed.collections.map(collection => (
    preflightLicense(sourceRoot, collection)
  )));
  const conditionAsset = options.conditionAsset ?? conditionSfxCatalogAsset;
  const candidateAssets: PreflightCandidate[] = [];
  const sourceHashes = new Set<string>();

  for (const candidate of seed.candidates) {
    const collection = collectionById.get(candidate.collectionId);
    if (!collection) {
      throw new SfxCatalogReviewError(
        'INVALID_SFX_REVIEW_SEED',
        `Candidate ${candidate.providerAssetId} references unknown collection ${candidate.collectionId}`,
      );
    }
    const source = await resolveLicensedSourcePath(sourceRoot, candidate.sourcePath, realpath);
    const sourceBuffer = await readFile(source.absolutePath);
    const sourceHashSha256 = hashBuffer(sourceBuffer);
    if (sourceHashes.has(sourceHashSha256)) {
      throw new SfxCatalogReviewError(
        'DUPLICATE_SFX_REVIEW_AUDIO',
        `Candidate ${candidate.providerAssetId} duplicates another source audio file`,
      );
    }
    sourceHashes.add(sourceHashSha256);

    let conditioned: ConditionSfxCatalogAssetResult;
    try {
      conditioned = await conditionAsset(sourceBuffer);
    } catch (error) {
      throw new SfxCatalogReviewError(
        'SFX_REVIEW_CONDITIONING_FAILED',
        `Candidate ${candidate.providerAssetId} could not be conditioned`,
        { cause: error },
      );
    }
    const reviewId = `sfx_review_${sourceHashSha256.slice(0, 20)}`;
    const audioPath = `audio/${reviewId}.wav`;
    candidateAssets.push({
      buffer: conditioned.buffer,
      report: {
        reviewId,
        status: 'pending',
        originalSourcePath: source.relativePath,
        audioPath,
        sourceHashSha256,
        conditionedHashSha256: hashBuffer(conditioned.buffer),
        gainDb: conditioned.gainDb,
        sourceInspection: conditioned.source,
        outputInspection: conditioned.output,
        curation: {
          sourcePath: audioPath,
          ...candidate.metadata,
          provenance: buildProvenance(collection, candidate),
        },
      },
    });
  }

  const licenses = licenseAssets.map(asset => asset.report);
  const candidates = candidateAssets.map(asset => asset.report);
  const reportWithoutSetHash = {
    version: 'sfx-catalog-review-report-v1' as const,
    generatedAt: now.toISOString(),
    requiredRoles: [...seed.requiredRoles],
    coverage: seed.requiredRoles.map(role => {
      const candidateCount = candidates.filter(candidate => (
        candidate.curation.eventRoles.includes(role)
      )).length;
      return {
        role,
        candidateCount,
        status: candidateCount > 0 ? 'covered' as const : 'gap' as const,
      };
    }),
    licenses,
    candidates,
  };
  const report: SfxCatalogReviewReport = {
    ...reportWithoutSetHash,
    sourceSetHashSha256: hashJson({
      licenses: licenses.map(license => license.evidenceHashSha256),
      candidates: candidates.map(candidate => ({
        source: candidate.sourceHashSha256,
        conditioned: candidate.conditionedHashSha256,
      })),
    }),
  };
  const embeddedReport = JSON.stringify(report).replaceAll('<', '\\u003c');
  const html = template.replace(TEMPLATE_TOKEN, embeddedReport);
  await writeReviewPackAtomically(
    outDir,
    report,
    html,
    licenseAssets,
    candidateAssets,
  );

  return {
    report,
    outDir,
    indexPath: path.join(outDir, 'index.html'),
    reportPath: path.join(outDir, 'review.json'),
  };
}

function validateSeed(seed: SfxCatalogReviewSeed): void {
  if (
    seed.version !== 'sfx-catalog-review-seed-v1'
    || seed.requiredRoles.length === 0
    || seed.collections.length === 0
    || seed.candidates.length === 0
  ) {
    throw new SfxCatalogReviewError('INVALID_SFX_REVIEW_SEED', 'Review seed is incomplete');
  }
  assertUnique(seed.requiredRoles, 'required role');
  assertUnique(seed.collections.map(collection => collection.id), 'collection ID');
  assertUnique(seed.candidates.map(candidate => candidate.providerAssetId), 'provider asset ID');
  assertUnique(seed.candidates.map(candidate => candidate.sourcePath), 'candidate source path');
  for (const collection of seed.collections) {
    if (!/^[a-z0-9][a-z0-9-]{1,79}$/.test(collection.id)) {
      throw new SfxCatalogReviewError(
        'INVALID_SFX_REVIEW_SEED',
        `Invalid collection ID: ${collection.id}`,
      );
    }
  }
}

function assertUnique(values: string[], label: string): void {
  if (new Set(values).size !== values.length) {
    throw new SfxCatalogReviewError(
      'INVALID_SFX_REVIEW_SEED',
      `Review seed contains a duplicate ${label}`,
    );
  }
}

async function preflightLicense(
  sourceRoot: string,
  collection: SfxCatalogReviewCollection,
): Promise<PreflightLicense> {
  const source = await resolveLicensedSourcePath(
    sourceRoot,
    collection.licenseEvidencePath,
    realpath,
  );
  const evidence = await readFile(source.absolutePath);
  if (evidence.length === 0) {
    throw new SfxCatalogReviewError(
      'EMPTY_SFX_LICENSE_EVIDENCE',
      `License evidence for ${collection.id} is empty`,
    );
  }
  return {
    buffer: evidence,
    report: {
      collectionId: collection.id,
      provider: collection.provider,
      licenseId: collection.licenseId,
      licenseUrl: collection.licenseUrl,
      attributionRequired: collection.attributionRequired,
      evidencePath: `licenses/${collection.id}.txt`,
      evidenceHashSha256: hashBuffer(evidence),
    },
  };
}

function buildProvenance(
  collection: SfxCatalogReviewCollection,
  candidate: SfxCatalogReviewCandidate,
): ReviewProvenance {
  return {
    provider: collection.provider,
    providerAssetId: candidate.providerAssetId,
    licenseId: collection.licenseId,
    licenseUrl: collection.licenseUrl,
    attributionRequired: collection.attributionRequired,
  };
}

async function writeReviewPackAtomically(
  outDir: string,
  report: SfxCatalogReviewReport,
  html: string,
  licenses: PreflightLicense[],
  candidates: PreflightCandidate[],
): Promise<void> {
  const parent = path.dirname(outDir);
  await mkdir(parent, { recursive: true });
  const temporaryDirectory = await mkdtemp(
    path.join(parent, `.${path.basename(outDir)}.tmp-`),
  );
  try {
    await mkdir(path.join(temporaryDirectory, 'audio'));
    await mkdir(path.join(temporaryDirectory, 'licenses'));
    await Promise.all([
      writeFile(path.join(temporaryDirectory, 'index.html'), html, { flag: 'wx' }),
      writeFile(
        path.join(temporaryDirectory, 'review.json'),
        `${JSON.stringify(report, null, 2)}\n`,
        { flag: 'wx' },
      ),
      ...candidates.map(candidate => writeFile(
        path.join(temporaryDirectory, candidate.report.audioPath),
        candidate.buffer,
        { flag: 'wx' },
      )),
      ...licenses.map(license => writeFile(
        path.join(temporaryDirectory, license.report.evidencePath),
        license.buffer,
        { flag: 'wx' },
      )),
    ]);
    await rename(temporaryDirectory, outDir);
  } catch (error) {
    await rm(temporaryDirectory, { recursive: true, force: true });
    throw error;
  }
}

function hashBuffer(buffer: Buffer): string {
  return createHash('sha256').update(buffer).digest('hex');
}

function hashJson(value: unknown): string {
  return hashBuffer(Buffer.from(JSON.stringify(value)));
}

async function assertOutputMissing(outDir: string): Promise<void> {
  try {
    await lstat(outDir);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return;
    throw error;
  }
  throw new SfxCatalogReviewError(
    'SFX_REVIEW_OUTPUT_EXISTS',
    `Review output already exists: ${outDir}`,
  );
}

interface CliArguments {
  sourceRoot: string;
  outDir: string;
}

function parseCliArguments(argv: string[]): CliArguments {
  const values = new Map<string, string>();
  for (const argument of argv) {
    const match = /^--(source-root|out-dir)=(.+)$/.exec(argument);
    if (!match || values.has(match[1])) throw cliUsageError();
    values.set(match[1], match[2]);
  }
  const sourceRoot = values.get('source-root') ?? process.env.SFX_CATALOG_SOURCE_ROOT;
  const outDir = values.get('out-dir');
  if (!sourceRoot || !outDir) throw cliUsageError();
  return { sourceRoot: path.resolve(sourceRoot), outDir: path.resolve(outDir) };
}

function cliUsageError(): SfxCatalogReviewError {
  return new SfxCatalogReviewError(
    'INVALID_SFX_REVIEW_ARGUMENTS',
    'Usage: pnpm review:sfx -- --source-root=<licensed-pack-dir> --out-dir=<new-dir>',
  );
}

async function main(): Promise<void> {
  const cli = parseCliArguments(process.argv.slice(2));
  const prepared = await prepareSfxCatalogReview(cli);
  console.log(
    `[SFXCatalog] Prepared ${prepared.report.candidates.length} pending candidates at ${prepared.indexPath}`,
  );
}

const isMain = Boolean(
  process.argv[1]
  && pathToFileURL(path.resolve(process.argv[1])).href === import.meta.url,
);
if (isMain) {
  main().catch(error => {
    console.error(`[SFXCatalog] ${error instanceof Error ? error.message : String(error)}`);
    process.exitCode = 1;
  });
}
