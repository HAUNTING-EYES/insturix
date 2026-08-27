import { createHash } from 'node:crypto';
import { copyFile, lstat, mkdir, readFile } from 'node:fs/promises';
import path from 'node:path';

import sharp from 'sharp';

import { deepFreezeV1, hashCanonicalJsonV1 } from './contracts-v1';
import { inspectSfntWeightClassV1 }
  from './stage25-rhc02-preview-media-fixture-v2';

export const STAGE25_RHC04_PREVIEW_MEDIA_FIXTURE_VERSION_V1 =
  'EDITRON_OE_STAGE25_RHC04_PREVIEW_MEDIA_FIXTURE_V1' as const;

export const STAGE25_RHC04_ASSET_IDS_V1 = Object.freeze([
  'rhc04-closeup-60',
  'rhc04-closeup-30',
  'rhc04-closeup-10',
  'rhc04-correction-source',
] as const);

type AssetId = typeof STAGE25_RHC04_ASSET_IDS_V1[number];

const WIDTH = 1080;
const HEIGHT = 1920;
const DARKEN_ALPHA = 0.62;
const FONT_PATH =
  'node_modules/next/dist/compiled/@vercel/og/noto-sans-v27-latin-regular.ttf';
const FONT_SHA256 =
  'd2a8188db7fdd567bbd94017cec0622373d47206d45281b7c501f0775cdee83a';
const SOURCE_RECIPES = deepFreezeV1({
  'rhc04-closeup-60': {
    repositoryPath: 'public/products-preview/editron.webp',
    sha256: '8c8b32cf58aa57b28e002ec3ebb366038a6ab2b485da0d9d94aa09fba4a90a8a',
    position: 'left' as const,
  },
  'rhc04-closeup-30': {
    repositoryPath: 'public/products-preview/thinkforge.webp',
    sha256: 'e0d560302a684c41faf90264f59f1b02a6b3c0f3c90745988d050dd84cad1f2f',
    position: 'centre' as const,
  },
  'rhc04-closeup-10': {
    repositoryPath: 'public/products-preview/clickatron.webp',
    sha256: '5721a1b111d5a1c776cc124edd3370e40d554f5511ae7a4d55ef387a83e066fb',
    position: 'right' as const,
  },
  'rhc04-correction-source': {
    repositoryPath: 'public/products-preview/socialize.webp',
    sha256: '4d64b12166d200277476319ffc17824f5e47091362a7f0d11b7b5f5e6f3361b0',
    position: 'centre' as const,
  },
} satisfies Record<AssetId, {
  repositoryPath: string;
  sha256: string;
  position: 'left' | 'centre' | 'right';
}>);

export async function materializeStage25Rhc04PreviewMediaFixtureV1(input: {
  outputDir: string;
  createdAt: string;
}) {
  assertIsoTimestamp(input.createdAt);
  const root = await createNewDirectory(input.outputDir);
  const fontSourcePath = path.resolve(FONT_PATH);
  const fontSource = await regularArtifact(fontSourcePath);
  if (fontSource.sha256 !== FONT_SHA256) fail('FONT_IDENTITY_DRIFT');
  const fontMetadata = inspectSfntWeightClassV1(await readFile(fontSourcePath));
  if (fontMetadata.usWeightClass !== 400) fail('FONT_WEIGHT_NOT_REGULAR_400');

  const sourceArtifacts = new Map<AssetId, Awaited<ReturnType<typeof regularArtifact>>>();
  const assetPaths = {} as Record<AssetId, string>;
  for (const assetId of STAGE25_RHC04_ASSET_IDS_V1) {
    const recipe = SOURCE_RECIPES[assetId];
    const sourcePath = path.resolve(recipe.repositoryPath);
    const sourceArtifact = await regularArtifact(sourcePath);
    if (sourceArtifact.sha256 !== recipe.sha256) {
      fail(`SOURCE_IDENTITY_DRIFT:${assetId}`);
    }
    sourceArtifacts.set(assetId, sourceArtifact);
    const outputPath = path.join(root, `${assetId}.png`);
    await createCloseup(sourcePath, outputPath, recipe.position);
    assetPaths[assetId] = outputPath;
  }

  const fontPath = path.join(root, 'noto-sans-v27-latin-regular.ttf');
  await copyFile(fontSourcePath, fontPath);
  const outputArtifacts = new Map<AssetId, Awaited<ReturnType<typeof regularArtifact>>>();
  const contrastMeasurements = [];
  for (const assetId of STAGE25_RHC04_ASSET_IDS_V1) {
    const outputPath = assetPaths[assetId];
    const artifact = await regularArtifact(outputPath);
    const measurement = await measureStill(outputPath);
    if (measurement.format !== 'png' || measurement.width !== WIDTH
      || measurement.height !== HEIGHT || measurement.minimumWhiteContrastRatio < 4.5) {
      fail(`STILL_CONTRACT_INVALID:${assetId}`);
    }
    outputArtifacts.set(assetId, artifact);
    contrastMeasurements.push({ assetId, ...measurement });
  }
  if (new Set([...outputArtifacts.values()].map(({ sha256 }) => sha256)).size
    !== STAGE25_RHC04_ASSET_IDS_V1.length) {
    fail('CLOSEUPS_NOT_DISTINCT');
  }
  const fontArtifact = await regularArtifact(fontPath);
  if (fontArtifact.sha256 !== fontSource.sha256) fail('FONT_COPY_DRIFT');

  const provenance = STAGE25_RHC04_ASSET_IDS_V1.map((assetId) => {
    const recipe = SOURCE_RECIPES[assetId];
    const material = {
      assetId,
      rightsStatus: 'INTERNAL_OWNED_FIXTURE' as const,
      repositoryPath: recipe.repositoryPath,
      repositorySourceSha256: recipe.sha256,
      outputSha256: outputArtifacts.get(assetId)?.sha256
        ?? fail(`OUTPUT_ARTIFACT_MISSING:${assetId}`),
      transform: `COVER_1080X1920_${recipe.position.toUpperCase()}_BLACK_ALPHA_0_62_PNG`,
      useScope: 'STAGE25_RHC04_RESEARCH_CANDIDATE_ONLY' as const,
    };
    return { ...material, receiptSha256: hashCanonicalJsonV1(material) };
  });
  const rightsByAsset = new Map(provenance.map((entry) => [entry.assetId, entry]));
  const assets = STAGE25_RHC04_ASSET_IDS_V1.map((assetId) => ({
    assetId,
    mediaKind: 'STILL_IMAGE' as const,
    fileName: path.basename(assetPaths[assetId]),
    sha256: outputArtifacts.get(assetId)?.sha256
      ?? fail(`OUTPUT_ARTIFACT_MISSING:${assetId}`),
    bytes: outputArtifacts.get(assetId)?.bytes
      ?? fail(`OUTPUT_ARTIFACT_MISSING:${assetId}`),
    sourceSha256: sourceArtifacts.get(assetId)?.sha256
      ?? fail(`SOURCE_ARTIFACT_MISSING:${assetId}`),
    rightsEvidenceSha256: rightsByAsset.get(assetId)?.receiptSha256
      ?? fail(`RIGHTS_RECEIPT_MISSING:${assetId}`),
  }));
  const portable = {
    version: STAGE25_RHC04_PREVIEW_MEDIA_FIXTURE_VERSION_V1,
    artifactType: 'Stage25Rhc04PreviewMediaFixtureReceiptV1' as const,
    authority: 'LOCAL_RESEARCH_STILL_FIXTURE_MATERIALIZER_ONLY' as const,
    fixtureId: 'RHC-04-PREVIEW-MEDIA-V1' as const,
    createdAt: input.createdAt,
    canvas: { width: WIDTH, height: HEIGHT, frameRate: '30/1' as const },
    stillContract: {
      format: 'png' as const,
      darkenAlpha: DARKEN_ALPHA,
      foregroundForMeasurement: '#FFFFFF' as const,
      minimumContrastRatio: 4.5,
      measurements: contrastMeasurements,
    },
    assets,
    provenance,
    font: {
      fontAssetId: 'rhc04-licensed-numerals' as const,
      fileName: path.basename(fontPath),
      sha256: fontArtifact.sha256,
      bytes: fontArtifact.bytes,
      family: 'Noto Sans' as const,
      face: 'Regular' as const,
      weight: fontMetadata.usWeightClass,
      licenseId: 'OFL-1.1-NOTO-SANS' as const,
      metadataProof: fontMetadata,
    },
    externalCalls: {
      providerInferenceCalls: 0 as const,
      networkCalls: 0 as const,
      databaseCalls: 0 as const,
      renderCalls: 0 as const,
      canonicalProjectMutationWrites: 0 as const,
    },
    stateEffects: [...Object.values(assetPaths), fontPath].map((filePath) => ({
      kind: 'LOCAL_RESEARCH_FIXTURE_WRITE' as const,
      fileName: path.basename(filePath),
    })),
  };
  return deepFreezeV1({
    ...portable,
    receiptSha256: hashCanonicalJsonV1(portable),
    hostPaths: { assetPaths, fontPath },
  });
}

export type Stage25Rhc04PreviewMediaFixtureReceiptV1 = Awaited<
  ReturnType<typeof materializeStage25Rhc04PreviewMediaFixtureV1>
>;

export function assertStage25Rhc04PreviewMediaFixtureReceiptV1(
  receipt: Readonly<Stage25Rhc04PreviewMediaFixtureReceiptV1>,
): void {
  const { hostPaths: _hostPaths, receiptSha256, ...portable } = receipt;
  if (receipt.version !== STAGE25_RHC04_PREVIEW_MEDIA_FIXTURE_VERSION_V1
    || receipt.receiptSha256 !== hashCanonicalJsonV1(portable)
    || receipt.assets.map(({ assetId }) => assetId).join('|')
      !== STAGE25_RHC04_ASSET_IDS_V1.join('|')
    || receipt.stillContract.measurements.some(
      ({ minimumWhiteContrastRatio }) => minimumWhiteContrastRatio < 4.5,
    )
    || receipt.font.weight !== 400
    || !/^[a-f0-9]{64}$/.test(receiptSha256)) {
    fail('RECEIPT_INVALID');
  }
}

async function createCloseup(
  sourcePath: string,
  outputPath: string,
  position: 'left' | 'centre' | 'right',
): Promise<void> {
  const shade = await sharp({
    create: {
      width: WIDTH,
      height: HEIGHT,
      channels: 4,
      background: { r: 0, g: 0, b: 0, alpha: DARKEN_ALPHA },
    },
  }).png().toBuffer();
  await sharp(sourcePath, { failOn: 'error', limitInputPixels: 64_000_000 })
    .resize(WIDTH, HEIGHT, { fit: 'cover', position, kernel: sharp.kernel.lanczos3 })
    .composite([{ input: shade }])
    .png({ compressionLevel: 9, adaptiveFiltering: false, palette: false })
    .toFile(outputPath);
}

async function measureStill(filePath: string) {
  const image = sharp(filePath, { failOn: 'error' });
  const metadata = await image.metadata();
  const { data, info } = await image.removeAlpha().raw().toBuffer({ resolveWithObject: true });
  if (info.channels < 3 || data.length !== info.width * info.height * info.channels) {
    fail('STILL_PIXEL_BUFFER_INVALID');
  }
  let maximumRelativeLuminance = 0;
  for (let offset = 0; offset < data.length; offset += info.channels) {
    const luminance = 0.2126 * linear(data[offset]!)
      + 0.7152 * linear(data[offset + 1]!)
      + 0.0722 * linear(data[offset + 2]!);
    maximumRelativeLuminance = Math.max(maximumRelativeLuminance, luminance);
  }
  return {
    format: metadata.format,
    width: metadata.width,
    height: metadata.height,
    maximumRelativeLuminance: fixed(maximumRelativeLuminance),
    minimumWhiteContrastRatio: fixed(1.05 / (maximumRelativeLuminance + 0.05)),
  };
}

function linear(channel: number): number {
  const value = channel / 255;
  return value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
}
function fixed(value: number): number { return Number(value.toFixed(6)); }

async function createNewDirectory(value: string): Promise<string> {
  const root = path.resolve(value);
  if (root === path.parse(root).root || root === path.resolve(process.cwd())) {
    fail('OUTPUT_DIRECTORY_UNSAFE');
  }
  await mkdir(path.dirname(root), { recursive: true });
  await mkdir(root);
  return root;
}

async function regularArtifact(filePath: string) {
  const stat = await lstat(filePath);
  if (!stat.isFile() || stat.isSymbolicLink() || stat.size <= 0) fail('ARTIFACT_INVALID');
  return {
    sha256: createHash('sha256').update(await readFile(filePath)).digest('hex'),
    bytes: stat.size,
  };
}

function assertIsoTimestamp(value: string): void {
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime()) || parsed.toISOString() !== value) {
    fail('CREATED_AT_INVALID');
  }
}
function fail(code: string): never {
  throw new Error(`STAGE25_RHC04_PREVIEW_MEDIA_${code}`);
}
