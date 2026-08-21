import { createHash } from 'node:crypto';
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { dirname, parse, relative, resolve } from 'node:path';

import { hashCanonicalJsonV1 } from './contracts-v1';
import {
  encodeHoldoutPngV2R,
  encodeHoldoutVideoV2R,
  muxHoldoutAudioV2R,
  readHoldoutCodecIdentityV2R,
} from './holdout-media-codec-v2r';
import { synthesizeHoldout04AudioV2R } from './holdout-media-fixtures-v2r';

const V1_PATH = 'tests/fixtures/editron/open-ended-planner-v1/holdout-tasks-v1.json';
const V2_PATH = 'tests/fixtures/editron/open-ended-planner-v2/tasks-v2.json';
const MATERIALIZER_PATH = 'lib/editron/research/open-ended-planner/holdout-media-materializer-v2r.ts';
const CODEC_PATH = 'lib/editron/research/open-ended-planner/holdout-media-codec-v2r.ts';
const FIXTURES_PATH = 'lib/editron/research/open-ended-planner/holdout-media-fixtures-v2r.ts';

type AssetType = 'video' | 'image';
interface SourceAssetV2R {
  assetId: string; type: AssetType; generator: string; seed: number; recipe: string; rightsStatus: string;
}
interface SourceTaskV2R {
  taskId: string;
  project: { fps: number; canvas: { width: number; height: number }; durationFrames: number; assets: SourceAssetV2R[] };
}
interface BoundTaskV2R {
  taskId: string; split: string; sealed: boolean;
  mediaBindings: Array<{ assetId: string; recipeSha256: string; artifactSha256: string | null; materializationStatus: string }>;
}

export interface HoldoutMediaArtifactV2R {
  taskId: string; assetId: string; type: AssetType; mimeType: 'video/mp4' | 'image/png';
  recipeSha256: string; contentSha256: string; artifactSha256: string; artifactPath: string; bytes: number;
  materializationStatus: 'MATERIALIZED_AND_HASHED_V2R';
  technical: Readonly<Record<string, number | string | boolean>>;
}
export interface HoldoutMediaManifestV2R {
  schemaVersion: 'EDITRON_OE_HOLDOUT_MEDIA_MANIFEST_V2R';
  version: '2.3.0-r2';
  scope: 'EIGHT_SEALED_HOLDOUTS_ONLY';
  authority: 'RESEARCH_ONLY_NO_PROVIDER_OR_PROJECT_AUTHORITY';
  networkPolicy: 'DENY';
  sourceBindings: readonly Readonly<{ path: string; sha256: string }>[];
  toolchain: Readonly<Record<string, string>>;
  artifacts: readonly Readonly<HoldoutMediaArtifactV2R>[];
  manifestSha256: string;
}

export async function materializeHoldoutMediaV2R(outputDirectory: string): Promise<Readonly<HoldoutMediaManifestV2R>> {
  const outputRoot = safeExclusiveOutput(outputDirectory);
  await mkdir(dirname(outputRoot), { recursive: true });
  await mkdir(outputRoot);
  const source = JSON.parse(await readFile(resolve(V1_PATH), 'utf8')) as { tasks: SourceTaskV2R[] };
  const expected = JSON.parse(await readFile(resolve(V2_PATH), 'utf8')) as { tasks: BoundTaskV2R[] };
  const boundTasks = expected.tasks.filter(({ split }) => split === 'HOLDOUT');
  if (source.tasks.length !== 8 || boundTasks.length !== 8 || boundTasks.some(({ sealed }) => !sealed)) {
    return fail('HOLDOUT_TASK_SET_INVALID');
  }
  const expectedByAsset = new Map(boundTasks.flatMap((task) => task.mediaBindings.map((binding) => [
    binding.assetId, { ...binding, taskId: task.taskId },
  ])));
  const sourceAssets = source.tasks.flatMap((task) => task.project.assets.map((asset) => ({ task, asset })));
  if (sourceAssets.length !== 12 || expectedByAsset.size !== 12) return fail('HOLDOUT_ASSET_SET_INVALID');
  const codec = await readHoldoutCodecIdentityV2R();
  const artifacts: HoldoutMediaArtifactV2R[] = [];
  try {
    for (const { task, asset } of sourceAssets) {
      if (task.project.fps !== 30 || asset.rightsStatus !== 'INTERNAL_OWNED_FIXTURE') {
        return fail(`HOLDOUT_SOURCE_POLICY_INVALID:${asset.assetId}`);
      }
      const binding = expectedByAsset.get(asset.assetId);
      const recipeSha256 = `sha256:${hashCanonicalJsonV1(asset)}`;
      if (!binding || binding.taskId !== task.taskId || binding.recipeSha256 !== recipeSha256
        || binding.artifactSha256 !== null || binding.materializationStatus !== 'NOT_MATERIALIZED_V2_0') {
        return fail(`HOLDOUT_RECIPE_BINDING_DRIFT:${asset.assetId}`);
      }
      const dimensions = scaledDimensions(task.project.canvas);
      const extension = asset.type === 'image' ? 'png' : 'mp4';
      const artifactPath = resolve(outputRoot, `${asset.assetId}.${extension}`);
      let contentSha256: string;
      if (asset.type === 'image') {
        contentSha256 = await encodeHoldoutPngV2R({ assetId: asset.assetId, outputPath: artifactPath, ...dimensions, ffmpegPath: codec.ffmpegPath });
      } else if (asset.assetId === 'h04-host') {
        const silentPath = resolve(outputRoot, `${asset.assetId}.silent.mp4`);
        const visualHash = await encodeHoldoutVideoV2R({ assetId: asset.assetId, outputPath: silentPath, ...dimensions, frameCount: task.project.durationFrames, ffmpegPath: codec.ffmpegPath });
        const audioBytes = synthesizeHoldout04AudioV2R(task.project.durationFrames);
        const audioHash = await muxHoldoutAudioV2R({ videoPath: silentPath, audioBytes, outputPath: artifactPath, ffmpegPath: codec.ffmpegPath });
        await rm(silentPath, { force: true });
        contentSha256 = hashCanonicalJsonV1({ visualHash, audioHash });
      } else {
        contentSha256 = await encodeHoldoutVideoV2R({ assetId: asset.assetId, outputPath: artifactPath, ...dimensions, frameCount: task.project.durationFrames, ffmpegPath: codec.ffmpegPath });
      }
      const bytes = await readFile(artifactPath);
      artifacts.push({
        taskId: task.taskId, assetId: asset.assetId, type: asset.type,
        mimeType: asset.type === 'image' ? 'image/png' : 'video/mp4', recipeSha256,
        contentSha256: `sha256:${contentSha256}`, artifactSha256: `sha256:${sha256(bytes)}`,
        artifactPath: normalizePath(relative(process.cwd(), artifactPath)), bytes: bytes.length,
        materializationStatus: 'MATERIALIZED_AND_HASHED_V2R',
        technical: {
          width: dimensions.width, height: dimensions.height,
          ...(asset.type === 'video' ? {
            editRateNumerator: '30', editRateDenominator: '1', frames: task.project.durationFrames,
            durationSeconds: task.project.durationFrames / 30,
            embeddedSyntheticToneAudio: asset.assetId === 'h04-host',
          } : {}),
        },
      });
    }
  } catch (error) {
    throw error;
  }
  artifacts.sort((left, right) => left.assetId < right.assetId ? -1 : left.assetId > right.assetId ? 1 : 0);
  const unsigned = {
    schemaVersion: 'EDITRON_OE_HOLDOUT_MEDIA_MANIFEST_V2R' as const,
    version: '2.3.0-r2' as const,
    scope: 'EIGHT_SEALED_HOLDOUTS_ONLY' as const,
    authority: 'RESEARCH_ONLY_NO_PROVIDER_OR_PROJECT_AUTHORITY' as const,
    networkPolicy: 'DENY' as const,
    sourceBindings: await Promise.all([V1_PATH, V2_PATH, MATERIALIZER_PATH, CODEC_PATH, FIXTURES_PATH].map(async (path) => ({
      path, sha256: sha256(await readFile(resolve(path))),
    }))),
    toolchain: {
      node: process.version, platform: process.platform, arch: process.arch,
      ffmpegVersion: codec.ffmpegVersion, ffmpegBinarySha256: codec.ffmpegBinarySha256,
      videoEncoding: 'raw-rgb24->h264(libx264,crf18,threads1,bitexact)->mp4',
    },
    artifacts,
  };
  const identityMaterial = {
    ...unsigned,
    artifacts: unsigned.artifacts.map(({ artifactPath: _artifactPath, ...artifact }) => artifact),
  };
  const manifest = Object.freeze({ ...unsigned, manifestSha256: hashCanonicalJsonV1(identityMaterial) });
  await writeFile(resolve(outputRoot, 'manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`, {
    encoding: 'utf8', mode: 0o600, flag: 'wx',
  });
  return manifest;
}

function safeExclusiveOutput(outputDirectory: string): string {
  const absolute = resolve(outputDirectory); const root = parse(absolute).root;
  if (absolute === root || absolute === resolve(process.cwd())) return fail('HOLDOUT_OUTPUT_ROOT_UNSAFE');
  return absolute;
}
function scaledDimensions(canvas: { width: number; height: number }) {
  return canvas.width >= canvas.height ? { width: 640, height: 360 } : { width: 360, height: 640 };
}
function normalizePath(value: string): string { return value.replaceAll('\\', '/'); }
function sha256(bytes: Buffer): string { return createHash('sha256').update(bytes).digest('hex'); }
function fail(code: string): never { throw new Error(code); }
