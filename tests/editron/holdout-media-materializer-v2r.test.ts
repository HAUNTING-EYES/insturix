import { createHash } from 'node:crypto';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import { renderHoldoutFrameV2R, synthesizeHoldout04AudioV2R }
  from '@/lib/editron/research/open-ended-planner/holdout-media-fixtures-v2r';
import { materializeHoldoutMediaV2R }
  from '@/lib/editron/research/open-ended-planner/holdout-media-materializer-v2r';
import identityJson from '@/tests/fixtures/editron/open-ended-planner-v2/holdout-media-identity-v2r.json';

const scratchRoots: string[] = [];
function sha256(bytes: Buffer): string { return createHash('sha256').update(bytes).digest('hex'); }
async function scratch(): Promise<string> {
  const root = await mkdtemp(path.join(tmpdir(), 'editron-holdout-media-'));
  scratchRoots.push(root); return root;
}
afterEach(async () => {
  for (const root of scratchRoots.splice(0)) await rm(root, { recursive: true, force: true });
});

describe('sealed holdout media materializer V2R', () => {
  it('renders deterministic task-specific frames and rejects unsupported inputs', () => {
    const first = renderHoldoutFrameV2R('h01-clock', 80, 160, 90, 300);
    const repeat = renderHoldoutFrameV2R('h01-clock', 80, 160, 90, 300);
    const centered = renderHoldoutFrameV2R('h01-clock', 150, 160, 90, 300);
    const runnerStart = renderHoldoutFrameV2R('h08-runner', 0, 160, 90, 270);
    const runnerEnd = renderHoldoutFrameV2R('h08-runner', 269, 160, 90, 270);
    expect(first.equals(repeat)).toBe(true);
    expect(sha256(first)).not.toBe(sha256(centered));
    expect(sha256(runnerStart)).not.toBe(sha256(runnerEnd));
    expect(() => renderHoldoutFrameV2R('unknown', 0, 160, 90, 1)).toThrow('HOLDOUT_VISUAL_ASSET_UNSUPPORTED');
    expect(() => renderHoldoutFrameV2R('h01-clock', 1, 160, 90, 1)).toThrow('HOLDOUT_VISUAL_COORDINATES_INVALID');
  });

  it('renders HOLD-03 as six distinct windows instead of trusting the authored label', () => {
    const frame = renderHoldoutFrameV2R('h03-ref', 0, 360, 640, 420);
    const windowColors = new Set<string>();
    for (let offset = 0; offset < frame.length; offset += 3) {
      const color = `${frame[offset]},${frame[offset + 1]},${frame[offset + 2]}`;
      if (color !== '0,0,0' && color !== '252,218,45') windowColors.add(color);
    }
    expect([...windowColors].sort()).toEqual([
      '119,67,96', '119,84,54', '51,77,105', '52,106,91', '59,85,121', '67,74,119',
    ]);
  });

  it('creates a deterministic non-silent transcript-tone WAV with the authored pause', () => {
    const wav = synthesizeHoldout04AudioV2R();
    expect(wav.subarray(0, 4).toString('ascii')).toBe('RIFF');
    expect(wav.subarray(8, 12).toString('ascii')).toBe('WAVE');
    expect(wav.subarray(44).some((value) => value !== 0)).toBe(true);
    const sampleRate = 48_000;
    const meanAbs = (startFrame: number, endFrame: number) => {
      let total = 0; let count = 0;
      const start = Math.floor(startFrame / 30 * sampleRate);
      const end = Math.floor(endFrame / 30 * sampleRate);
      for (let index = start; index < end; index += 1) {
        total += Math.abs(wav.readInt16LE(44 + index * 2)); count += 1;
      }
      return total / count;
    };
    expect(meanAbs(120, 192)).toBeGreaterThan(meanAbs(192, 225) * 10);
    expect(meanAbs(225, 297)).toBeGreaterThan(meanAbs(192, 225) * 10);
  });

  it('materializes exactly twelve rights-bound artifacts and an embedded-audio host', async () => {
    const root = await scratch();
    const output = path.join(root, 'holdout-media');
    const manifest = await materializeHoldoutMediaV2R(output);
    expect(manifest).toMatchObject({
      schemaVersion: 'EDITRON_OE_HOLDOUT_MEDIA_MANIFEST_V2R',
      version: '2.3.0-r2',
      scope: 'EIGHT_SEALED_HOLDOUTS_ONLY',
      authority: 'RESEARCH_ONLY_NO_PROVIDER_OR_PROJECT_AUTHORITY',
      networkPolicy: 'DENY',
    });
    expect(manifest.artifacts).toHaveLength(12);
    expect(new Set(manifest.artifacts.map(({ assetId }) => assetId)).size).toBe(12);
    expect(new Set(manifest.artifacts.map(({ taskId }) => taskId)).size).toBe(8);
    expect(manifest.artifacts.find(({ assetId }) => assetId === 'h04-host')?.technical)
      .toMatchObject({ embeddedSyntheticToneAudio: true });
    for (const artifact of manifest.artifacts) {
      const bytes = await readFile(path.resolve(artifact.artifactPath));
      expect(bytes).toHaveLength(artifact.bytes);
      expect(`sha256:${sha256(bytes)}`).toBe(artifact.artifactSha256);
      expect(artifact.recipeSha256).toMatch(/^sha256:[a-f0-9]{64}$/);
      expect(artifact.contentSha256).toMatch(/^sha256:[a-f0-9]{64}$/);
      expect(artifact.bytes).toBeGreaterThan(1_000);
    }
    expect(manifest.manifestSha256).toMatch(/^[a-f0-9]{64}$/);
    expect(manifest.manifestSha256).toBe(identityJson.manifestSha256);
    expect(manifest.toolchain.ffmpegBinarySha256).toBe(identityJson.ffmpegBinarySha256);
    expect(manifest.sourceBindings).toEqual(identityJson.sourceBindings);
    expect(manifest.sourceBindings.map(({ path: sourcePath }) => sourcePath))
      .toContain('tests/fixtures/editron/open-ended-planner-v2/holdout-task-corrections-v2r.json');
    expect(Object.fromEntries(manifest.artifacts.map(({ assetId, artifactSha256 }) =>
      [assetId, artifactSha256]))).toEqual(identityJson.artifactSha256ById);
    const persisted = JSON.parse(await readFile(path.join(output, 'manifest.json'), 'utf8'));
    expect(persisted).toEqual(manifest);
    for (const binding of manifest.sourceBindings) {
      expect(sha256(await readFile(path.resolve(binding.path)))).toBe(binding.sha256);
    }
    await expect(materializeHoldoutMediaV2R(output)).rejects.toThrow();
  }, 180_000);

  it('refuses the repository root as a materialization target', async () => {
    await expect(materializeHoldoutMediaV2R(process.cwd())).rejects.toThrow('HOLDOUT_OUTPUT_ROOT_UNSAFE');
  });
});
