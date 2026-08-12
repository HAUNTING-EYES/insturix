import { createHash } from 'node:crypto';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { join, resolve, sep } from 'node:path';
import { tmpdir } from 'node:os';

import { afterEach, describe, expect, it } from 'vitest';

import {
  encodeSyntheticVideoV2,
  materializeDevelopmentMediaV2,
  renderSyntheticFrameV2,
  synthesizeAudioWavV2,
  type DevelopmentMediaManifestV2,
} from '@/lib/editron/research/open-ended-planner/media-materializer-v2';

const manifestPath = 'tests/fixtures/editron/open-ended-planner-v2/development-media-manifest-v2.json';
const temporaryDirectories: string[] = [];

function sha256(bytes: Buffer): string {
  return createHash('sha256').update(bytes).digest('hex');
}

async function temporaryDirectory(): Promise<string> {
  const directory = await mkdtemp(join(tmpdir(), 'editron-oe-v2-'));
  temporaryDirectories.push(directory);
  return directory;
}

afterEach(async () => {
  const safeRoot = `${resolve(tmpdir())}${sep}`;
  for (const directory of temporaryDirectories.splice(0)) {
    const absolute = resolve(directory);
    if (!absolute.startsWith(safeRoot)) throw new Error(`Refusing unsafe test cleanup: ${absolute}`);
    await rm(absolute, { recursive: true, force: true });
  }
});

describe('open-ended planner V2 development media materializer', () => {
  it('renders deterministic but temporally changing visual evidence', () => {
    const first = renderSyntheticFrameV2('dev02-wide', 0, 160, 284, 30);
    const repeated = renderSyntheticFrameV2('dev02-wide', 0, 160, 284, 30);
    const later = renderSyntheticFrameV2('dev02-wide', 29, 160, 284, 30);
    expect(first.equals(repeated)).toBe(true);
    expect(sha256(first)).not.toBe(sha256(later));
    expect(() => renderSyntheticFrameV2('not-a-fixture', 0, 160, 90, 1)).toThrow(
      /No visual recipe/,
    );
  });

  it('synthesizes deterministic, non-silent PCM WAV evidence', () => {
    const music = synthesizeAudioWavV2('dev01-music', 90);
    const repeated = synthesizeAudioWavV2('dev01-music', 90);
    const beats = synthesizeAudioWavV2('dev03-beats', 90);
    expect(music.subarray(0, 4).toString('ascii')).toBe('RIFF');
    expect(music.subarray(8, 12).toString('ascii')).toBe('WAVE');
    expect(music.equals(repeated)).toBe(true);
    expect(sha256(music)).not.toBe(sha256(beats));
    expect(music.subarray(44).some((sample) => sample !== 0)).toBe(true);
  });

  it('encodes identical MP4 bytes twice with the pinned FFmpeg path', async () => {
    const directory = await temporaryDirectory();
    const firstPath = join(directory, 'first.mp4');
    const secondPath = join(directory, 'second.mp4');
    const firstContentHash = await encodeSyntheticVideoV2({
      assetId: 'dev04-crossing',
      outputPath: firstPath,
      width: 160,
      height: 90,
      frameCount: 12,
    });
    const secondContentHash = await encodeSyntheticVideoV2({
      assetId: 'dev04-crossing',
      outputPath: secondPath,
      width: 160,
      height: 90,
      frameCount: 12,
    });
    const first = await readFile(firstPath);
    const second = await readFile(secondPath);
    expect(firstContentHash).toBe(secondContentHash);
    expect(first.equals(second)).toBe(true);
    expect(first.subarray(4, 8).toString('ascii')).toBe('ftyp');
    expect(first.length).toBeGreaterThan(1_000);
  });

  it('refuses to materialize into the repository root', async () => {
    await expect(materializeDevelopmentMediaV2(process.cwd())).rejects.toMatchObject({
      code: 'UNSAFE_OUTPUT_DIRECTORY',
    });
  });

  it('freezes eight development artifacts and exact source-file hashes', async () => {
    const manifest = JSON.parse(
      await readFile(resolve(manifestPath), 'utf8'),
    ) as DevelopmentMediaManifestV2;
    expect(manifest.scope).toBe('DEVELOPMENT_ONLY');
    expect(manifest.authority).toBe('RESEARCH_ONLY_NO_PROVIDER_OR_PROJECT_AUTHORITY');
    expect(manifest.artifacts).toHaveLength(8);
    expect(new Set(manifest.artifacts.map(({ assetId }) => assetId)).size).toBe(8);
    expect(manifest.artifacts.every(({ materializationStatus }) =>
      materializationStatus === 'MATERIALIZED_AND_HASHED_V2_1A')).toBe(true);
    for (const binding of manifest.sourceBindings) {
      expect(sha256(await readFile(resolve(binding.path)))).toBe(binding.sha256);
    }
    for (const artifact of manifest.artifacts) {
      expect(artifact.recipeSha256).toMatch(/^sha256:[a-f0-9]{64}$/);
      expect(artifact.contentSha256).toMatch(/^sha256:[a-f0-9]{64}$/);
      expect(artifact.artifactSha256).toMatch(/^sha256:[a-f0-9]{64}$/);
      expect(artifact.bytes).toBeGreaterThan(1_000);
      expect(artifact.artifactPath).toMatch(/^\.calibration-temp\/open-ended-planner-v2\//);
    }
  });
});
