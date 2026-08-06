import { readFile, realpath, mkdir, rename, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

import { fileTypeFromBuffer } from 'file-type';
import { z } from 'zod';

import {
  BUNDLED_SFX_CATALOG,
  parseSfxCatalogManifest,
  sfxCatalogSemanticEvidenceSchema,
  type SfxCatalogEntry,
  type SfxCatalogManifest,
} from '../lib/pipeline/sfx-catalog';
import { inspectEncodedSfxAudio } from '../lib/pipeline/audio-conditioning';
import {
  MAX_SFX_ACOUSTIC_MEASUREMENT_DURATION_MS,
  buildSfxAcousticMeasurement,
  type SfxAcousticInspectionInput,
} from '../lib/pipeline/sfx-acoustic-measurement';

const eventRoleSchema = z.enum([
  'whoosh',
  'impact',
  'tick',
  'pop',
  'riser',
  'logo-sting',
  'ambience',
  'foley',
  'shimmer',
]);
const surfaceSchema = z.enum([
  'transition',
  'motion-graphic',
  'ui',
  'scene',
  'logo',
  'caption',
  'chapter',
]);
const layerRoleSchema = z.enum([
  'oneshot',
  'riser',
  'impact',
  'loop',
  'bed',
  'sting',
]);
const directionSchema = z.enum([
  'neutral',
  'left',
  'right',
  'up',
  'down',
  'in',
  'out',
]);

const approvalSchema = z.object({
  status: z.literal('approved'),
  reviewerId: z.string().trim().min(1),
  reviewedAt: z.string().datetime(),
}).strict();

const provenanceSchema = z.object({
  provider: z.string().trim().min(1),
  providerAssetId: z.string().trim().min(1),
  licenseId: z.string().trim().min(1),
  licenseUrl: z.string().url().optional(),
  attributionRequired: z.boolean(),
  attributionText: z.string().trim().min(1).optional(),
}).strict().superRefine((provenance, context) => {
  if (provenance.attributionRequired && !provenance.attributionText) {
    context.addIssue({
      code: 'custom',
      path: ['attributionText'],
      message: 'required attribution text is missing',
    });
  }
});

const curationAssetSchema = z.object({
  sourcePath: z.string().trim().min(1),
  title: z.string().trim().min(1),
  eventRoles: z.array(eventRoleSchema).min(1),
  surfaces: z.array(surfaceSchema).min(1),
  layerRole: layerRoleSchema,
  tags: z.array(z.string().trim().min(1)).min(1),
  negativeTags: z.array(z.string().trim().min(1)),
  energy: z.number().min(0).max(1),
  brightness: z.number().min(0).max(1),
  weight: z.number().min(0).max(1),
  transientSharpness: z.number().min(0).max(1),
  material: z.string().trim().min(1),
  tailMs: z.number().int().nonnegative(),
  loopable: z.boolean(),
  direction: directionSchema,
  motionSpeed: z.enum(['still', 'slow', 'medium', 'fast']),
  trendTag: z.string().trim().min(1).optional(),
  semanticEvidence: sfxCatalogSemanticEvidenceSchema.optional(),
  provenance: provenanceSchema,
  approval: approvalSchema,
}).strict();

const curationSpecSchema = z.object({
  version: z.literal('sfx-catalog-curation-spec-v1'),
  assets: z.array(curationAssetSchema).min(1),
}).strict();

const uploadPlanSchema = z.object({
  version: z.literal('sfx-catalog-upload-plan-v1'),
  generatedAt: z.string().datetime(),
  manifestVersion: z.literal('sfx-catalog-v1'),
  publicAssetBaseUrl: z.string().min(1),
  assets: z.array(z.object({
    assetId: z.string().regex(/^sfx_catalog_[a-z0-9_-]+$/),
    sourcePath: z.string().min(1),
    r2Key: z.string().min(1),
    filename: z.string().min(1),
    mimeType: z.enum(['audio/wav', 'audio/mpeg', 'audio/flac', 'audio/ogg']),
    byteLength: z.number().int().positive(),
    contentHashSha256: z.string().regex(/^[a-f0-9]{64}$/),
    provenance: provenanceSchema,
    approval: approvalSchema,
  }).strict()),
}).strict();

type SfxCatalogCurationSpec = z.infer<typeof curationSpecSchema>;
type SfxCatalogCurationAsset = SfxCatalogCurationSpec['assets'][number];
export type SfxCatalogUploadPlan = z.infer<typeof uploadPlanSchema>;

type DetectedFileType = Awaited<ReturnType<typeof fileTypeFromBuffer>>;
type InspectAudio = (buffer: Buffer) => Promise<SfxAcousticInspectionInput>;

export interface CurateSfxCatalogOptions {
  sourceRoot: string;
  publicAssetBaseUrl: string;
  now?: Date;
  readBuffer?: (filePath: string) => Promise<Buffer>;
  resolveRealPath?: (filePath: string) => Promise<string>;
  detectFileType?: (buffer: Buffer) => Promise<DetectedFileType>;
  inspectAudio?: InspectAudio;
}

export interface CuratedSfxCatalogArtifacts {
  manifest: SfxCatalogManifest;
  uploadPlan: SfxCatalogUploadPlan;
}

export class SfxCatalogCurationError extends Error {
  constructor(
    public readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = 'SfxCatalogCurationError';
  }
}

export function parseSfxCatalogCurationSpec(value: unknown): SfxCatalogCurationSpec {
  const parsed = curationSpecSchema.safeParse(value);
  if (parsed.success) return parsed.data;

  throw new SfxCatalogCurationError(
    'INVALID_SFX_CURATION_SPEC',
    `Invalid SFX curation spec: ${parsed.error.issues
      .map(issue => `${issue.path.join('.') || 'spec'}: ${issue.message}`)
      .join('; ')}`,
  );
}

export function parseSfxCatalogUploadPlan(value: unknown): SfxCatalogUploadPlan {
  const parsed = uploadPlanSchema.safeParse(value);
  if (parsed.success) return parsed.data;

  throw new SfxCatalogCurationError(
    'INVALID_SFX_CATALOG_UPLOAD_PLAN',
    `Invalid SFX catalog upload plan: ${parsed.error.issues
      .map(issue => `${issue.path.join('.') || 'uploadPlan'}: ${issue.message}`)
      .join('; ')}`,
  );
}

export async function curateSfxCatalog(
  specValue: unknown,
  options: CurateSfxCatalogOptions,
): Promise<CuratedSfxCatalogArtifacts> {
  const spec = parseSfxCatalogCurationSpec(specValue);
  const publicAssetBaseUrl = normalizePublicAssetBaseUrl(options.publicAssetBaseUrl);
  const now = options.now ?? new Date();
  if (Number.isNaN(now.getTime())) {
    throw new SfxCatalogCurationError(
      'INVALID_SFX_CURATION_CLOCK',
      'SFX curation requires a valid build timestamp',
    );
  }

  const readBuffer = options.readBuffer ?? (filePath => readFile(filePath));
  const resolveRealPath = options.resolveRealPath ?? (filePath => realpath(filePath));
  const detectFileType = options.detectFileType ?? fileTypeFromBuffer;
  const inspectAudio = options.inspectAudio ?? inspectEncodedSfxAudio;
  const sourceRoot = await resolveRealPath(path.resolve(options.sourceRoot));
  const entries: SfxCatalogEntry[] = [];
  const uploadAssets: SfxCatalogUploadPlan['assets'] = [];

  for (const asset of spec.assets) {
    const source = await resolveLicensedSourcePath(
      sourceRoot,
      asset.sourcePath,
      resolveRealPath,
    );
    const buffer = await readBuffer(source.absolutePath);
    if (buffer.byteLength === 0) {
      throw new SfxCatalogCurationError(
        'EMPTY_SFX_SOURCE',
        `SFX source "${asset.sourcePath}" is empty`,
      );
    }

    let detectedType: DetectedFileType;
    try {
      detectedType = await detectFileType(buffer);
    } catch (error) {
      throw new SfxCatalogCurationError(
        'UNSUPPORTED_SFX_AUDIO',
        `SFX source "${asset.sourcePath}" could not be identified: ${errorMessage(error)}`,
      );
    }
    const audioType = supportedAudioType(detectedType, asset.sourcePath);
    let inspection: SfxAcousticInspectionInput;
    try {
      inspection = await inspectAudio(buffer);
    } catch (error) {
      throw new SfxCatalogCurationError(
        'SFX_CURATION_AUDIO_REJECTED',
        `SFX source "${asset.sourcePath}" could not be decoded and measured: ${errorMessage(error)}`,
      );
    }
    enforceCatalogQualityPolicy(asset, inspection);

    let measurement;
    try {
      measurement = buildSfxAcousticMeasurement(buffer, inspection, now);
    } catch (error) {
      throw new SfxCatalogCurationError(
        'SFX_CURATION_INVALID_MEASUREMENT',
        `SFX source "${asset.sourcePath}" produced invalid acoustic evidence: ${errorMessage(error)}`,
      );
    }
    const contentHashSha256 = measurement.sourceHashSha256;
    const assetId = `sfx_catalog_${contentHashSha256.slice(0, 24)}`;
    const {
      sourcePath: _sourcePath,
      approval: _approval,
      ...catalogMetadata
    } = asset;
    const entry = parseCuratedEntry({
      ...catalogMetadata,
      assetId,
      audioUrl: `${publicAssetBaseUrl}/${assetId}`,
      storagePath: assetId,
      durationMs: measurement.durationMs,
      contentHashSha256,
      mimeType: audioType.mimeType,
      measurement,
      audioRights: {
        mediaRole: 'sfx',
        source: 'library',
        userChoice: 'attested',
        licensed: true,
        evidence: {
          kind: 'library-license',
          sourceAssetId: assetId,
          licenseId: asset.provenance.licenseId,
        },
      },
    });
    entries.push(entry);
    uploadAssets.push({
      assetId,
      sourcePath: source.relativePath,
      r2Key: assetId,
      filename: `${assetId}.${audioType.extension}`,
      mimeType: audioType.mimeType,
      byteLength: buffer.byteLength,
      contentHashSha256,
      provenance: asset.provenance,
      approval: asset.approval,
    });
  }

  entries.sort((left, right) => left.assetId.localeCompare(right.assetId));
  uploadAssets.sort((left, right) => left.assetId.localeCompare(right.assetId));
  const generatedAt = now.toISOString();
  const manifest = parseSfxCatalogManifest({
    ...BUNDLED_SFX_CATALOG,
    generatedAt,
    entries,
  });
  const uploadPlan = parseSfxCatalogUploadPlan({
    version: 'sfx-catalog-upload-plan-v1',
    generatedAt,
    manifestVersion: manifest.version,
    publicAssetBaseUrl,
    assets: uploadAssets,
  });

  return { manifest, uploadPlan };
}

function parseCuratedEntry(entry: SfxCatalogEntry): SfxCatalogEntry {
  return parseSfxCatalogManifest({
    ...BUNDLED_SFX_CATALOG,
    entries: [entry],
  }).entries[0];
}

export async function resolveLicensedSourcePath(
  sourceRoot: string,
  sourcePath: string,
  resolveRealPath: (filePath: string) => Promise<string>,
): Promise<{ absolutePath: string; relativePath: string }> {
  const pathSegments = sourcePath.replaceAll('\\', '/').split('/');
  if (
    path.posix.isAbsolute(sourcePath)
    || path.win32.isAbsolute(sourcePath)
    || pathSegments.includes('..')
  ) {
    throw invalidSourcePath(sourcePath);
  }

  const unresolvedPath = path.resolve(sourceRoot, sourcePath);
  assertPathInsideRoot(sourceRoot, unresolvedPath, sourcePath);
  let absolutePath: string;
  try {
    absolutePath = await resolveRealPath(unresolvedPath);
  } catch (error) {
    throw new SfxCatalogCurationError(
      'SFX_SOURCE_NOT_FOUND',
      `SFX source "${sourcePath}" could not be resolved: ${errorMessage(error)}`,
    );
  }
  assertPathInsideRoot(sourceRoot, absolutePath, sourcePath);

  return {
    absolutePath,
    relativePath: path.relative(sourceRoot, absolutePath).split(path.sep).join('/'),
  };
}

function assertPathInsideRoot(
  sourceRoot: string,
  candidatePath: string,
  sourcePath: string,
): void {
  const relative = path.relative(sourceRoot, candidatePath);
  if (
    relative === '..'
    || relative.startsWith(`..${path.sep}`)
    || path.isAbsolute(relative)
  ) {
    throw invalidSourcePath(sourcePath);
  }
}

function invalidSourcePath(sourcePath: string): SfxCatalogCurationError {
  return new SfxCatalogCurationError(
    'INVALID_SFX_SOURCE_PATH',
    `Invalid sourcePath "${sourcePath}": source files must remain inside the licensed source root`,
  );
}

function supportedAudioType(
  detectedType: DetectedFileType,
  sourcePath: string,
): {
  extension: 'wav' | 'mp3' | 'flac' | 'ogg';
  mimeType: SfxCatalogEntry['mimeType'];
} {
  if (!detectedType) {
    throw new SfxCatalogCurationError(
      'UNSUPPORTED_SFX_AUDIO',
      `SFX source "${sourcePath}" has no recognized audio signature`,
    );
  }
  switch (detectedType.ext) {
    case 'wav':
      return { extension: 'wav', mimeType: 'audio/wav' };
    case 'mp3':
      return { extension: 'mp3', mimeType: 'audio/mpeg' };
    case 'flac':
      return { extension: 'flac', mimeType: 'audio/flac' };
    case 'ogg':
      return { extension: 'ogg', mimeType: 'audio/ogg' };
    default:
      throw new SfxCatalogCurationError(
        'UNSUPPORTED_SFX_AUDIO',
        `SFX source "${sourcePath}" uses unsupported byte format "${detectedType.ext}"`,
      );
  }
}

function enforceCatalogQualityPolicy(
  asset: SfxCatalogCurationAsset,
  inspection: SfxAcousticInspectionInput,
): void {
  const policy = BUNDLED_SFX_CATALOG.qualityPolicy;
  const blockedTags = [...asset.tags, ...asset.negativeTags]
    .filter(tag => policy.blockedTags.some(blocked => containsTerm(tag, blocked)));
  if (blockedTags.length > 0) {
    throw new SfxCatalogCurationError(
      'SFX_CURATION_BLOCKED_TAG',
      `SFX source "${asset.sourcePath}" contains blocked catalog tags: ${blockedTags.join(', ')}`,
    );
  }
  if (
    !Number.isFinite(inspection.loudness.valueDb)
    || inspection.loudness.valueDb <= policy.silenceFloorLufs
  ) {
    throw qualityError(asset, 'is silent or below the catalog loudness floor');
  }
  if (
    !Number.isFinite(inspection.truePeakDbtp)
    || inspection.truePeakDbtp > policy.maxTruePeakDbtp
  ) {
    throw qualityError(asset, `exceeds the ${policy.maxTruePeakDbtp} dBTP catalog ceiling`);
  }
  if (
    !Number.isFinite(inspection.sampleRate)
    || inspection.sampleRate < policy.minSampleRateHz
    || !policy.allowedChannelCounts.includes(inspection.channels)
  ) {
    throw qualityError(asset, 'does not meet catalog sample-rate or channel requirements');
  }
  if (
    !Number.isFinite(inspection.durationMs)
    || inspection.durationMs <= 0
    || inspection.durationMs > MAX_SFX_ACOUSTIC_MEASUREMENT_DURATION_MS
  ) {
    throw qualityError(
      asset,
      `must be between 1 and ${MAX_SFX_ACOUSTIC_MEASUREMENT_DURATION_MS}ms`,
    );
  }
}

function qualityError(
  asset: SfxCatalogCurationAsset,
  reason: string,
): SfxCatalogCurationError {
  return new SfxCatalogCurationError(
    'SFX_CURATION_QUALITY_REJECTED',
    `SFX source "${asset.sourcePath}" ${reason}`,
  );
}

function containsTerm(value: string, term: string): boolean {
  const normalizedValue = value.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
  const normalizedTerm = term.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
  return Boolean(normalizedTerm)
    && new RegExp(`\\b${escapeRegExp(normalizedTerm)}\\b`).test(normalizedValue);
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function normalizePublicAssetBaseUrl(value: string): string {
  const trimmed = value.trim().replace(/\/+$/, '');
  if (
    (trimmed === '/sfx' || trimmed.startsWith('/sfx/'))
    && !trimmed.includes('..')
    && !trimmed.includes('?')
    && !trimmed.includes('#')
    && !trimmed.includes('\\')
  ) {
    return trimmed;
  }

  try {
    const url = new URL(trimmed);
    if (
      url.protocol === 'https:'
      && !url.username
      && !url.password
      && !url.search
      && !url.hash
    ) {
      return url.toString().replace(/\/+$/, '');
    }
  } catch {
    // The typed curation error below is the public failure contract.
  }
  throw new SfxCatalogCurationError(
    'INVALID_SFX_PUBLIC_BASE_URL',
    'publicAssetBaseUrl must be HTTPS or a root-relative /sfx/ path',
  );
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

interface CurationCliArguments {
  specPath: string;
  sourceRoot: string;
  outManifestPath: string;
  outUploadPlanPath: string;
  publicAssetBaseUrl: string;
}

function parseCliArguments(argv: string[]): CurationCliArguments {
  const values = new Map<string, string>();
  const allowed = new Set([
    'spec',
    'source-root',
    'out-manifest',
    'out-upload-plan',
    'public-asset-base-url',
  ]);
  for (const argument of argv) {
    const match = /^--([^=]+)=(.+)$/.exec(argument);
    if (!match || !allowed.has(match[1]) || values.has(match[1])) {
      throw cliUsageError();
    }
    values.set(match[1], match[2]);
  }

  const specPath = values.get('spec');
  const outManifestPath = values.get('out-manifest');
  const outUploadPlanPath = values.get('out-upload-plan');
  const publicAssetBaseUrl = values.get('public-asset-base-url')
    ?? process.env.SFX_CATALOG_PUBLIC_ASSET_BASE_URL;
  if (!specPath || !outManifestPath || !outUploadPlanPath || !publicAssetBaseUrl) {
    throw cliUsageError();
  }

  const resolvedSpecPath = path.resolve(specPath);
  const resolvedManifestPath = path.resolve(outManifestPath);
  const resolvedUploadPlanPath = path.resolve(outUploadPlanPath);
  if (resolvedManifestPath === resolvedUploadPlanPath) {
    throw new SfxCatalogCurationError(
      'INVALID_SFX_CURATION_ARGUMENTS',
      'Manifest and upload-plan outputs must use different paths',
    );
  }
  return {
    specPath: resolvedSpecPath,
    sourceRoot: path.resolve(values.get('source-root') ?? path.dirname(resolvedSpecPath)),
    outManifestPath: resolvedManifestPath,
    outUploadPlanPath: resolvedUploadPlanPath,
    publicAssetBaseUrl,
  };
}

function cliUsageError(): SfxCatalogCurationError {
  return new SfxCatalogCurationError(
    'INVALID_SFX_CURATION_ARGUMENTS',
    'Usage: pnpm curate:sfx -- --spec=<json> --out-manifest=<json> '
      + '--out-upload-plan=<json> --public-asset-base-url=<https-or-/sfx/path> '
      + '[--source-root=<directory>]',
  );
}

async function writeArtifacts(
  artifacts: CuratedSfxCatalogArtifacts,
  outManifestPath: string,
  outUploadPlanPath: string,
): Promise<void> {
  const manifestTempPath = `${outManifestPath}.${process.pid}.tmp`;
  const uploadPlanTempPath = `${outUploadPlanPath}.${process.pid}.tmp`;
  await mkdir(path.dirname(outManifestPath), { recursive: true });
  await mkdir(path.dirname(outUploadPlanPath), { recursive: true });
  try {
    await writeFile(manifestTempPath, `${JSON.stringify(artifacts.manifest, null, 2)}\n`, {
      flag: 'wx',
    });
    await writeFile(uploadPlanTempPath, `${JSON.stringify(artifacts.uploadPlan, null, 2)}\n`, {
      flag: 'wx',
    });
    await rename(uploadPlanTempPath, outUploadPlanPath);
    await rename(manifestTempPath, outManifestPath);
  } finally {
    await Promise.all([
      rm(manifestTempPath, { force: true }),
      rm(uploadPlanTempPath, { force: true }),
    ]);
  }
}

async function main(): Promise<void> {
  const cli = parseCliArguments(process.argv.slice(2));
  const rawSpec = await readFile(cli.specPath, 'utf8');
  let specValue: unknown;
  try {
    specValue = JSON.parse(rawSpec);
  } catch (error) {
    throw new SfxCatalogCurationError(
      'INVALID_SFX_CURATION_SPEC_JSON',
      `Could not parse SFX curation spec JSON: ${errorMessage(error)}`,
    );
  }
  const artifacts = await curateSfxCatalog(specValue, {
    sourceRoot: cli.sourceRoot,
    publicAssetBaseUrl: cli.publicAssetBaseUrl,
  });
  await writeArtifacts(artifacts, cli.outManifestPath, cli.outUploadPlanPath);
  console.log(
    `[SFXCatalog] Curated ${artifacts.manifest.entries.length} approved assets. `
      + `Manifest: ${cli.outManifestPath}. Upload plan: ${cli.outUploadPlanPath}.`,
  );
}

const isMain = Boolean(
  process.argv[1]
  && pathToFileURL(path.resolve(process.argv[1])).href === import.meta.url,
);
if (isMain) {
  main().catch(error => {
    console.error(`[SFXCatalog] ${errorMessage(error)}`);
    process.exitCode = 1;
  });
}
