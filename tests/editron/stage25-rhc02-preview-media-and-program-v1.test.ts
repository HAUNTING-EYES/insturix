import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { afterAll, describe, expect, it } from 'vitest';

import { hashCanonicalJsonV1 }
  from '@/lib/editron/research/open-ended-planner/contracts-v1';
import { hashGeneratedCompositionSourceBundleV1 }
  from '@/lib/editron/research/open-ended-planner/generated-composition-program-v1';
import { verifyGeneratedCompositionProgramV1 }
  from '@/lib/editron/research/open-ended-planner/generated-composition-program-verifier-v1';
import {
  assertStage25Rhc02PreviewMediaFixtureReceiptV1,
  materializeStage25Rhc02PreviewMediaFixtureV1,
} from '@/lib/editron/research/open-ended-planner/stage25-rhc02-preview-media-fixture-v1';
import {
  buildRhc02GeneratedCompositionFixtureV1,
  buildRhc02PreviewIdentityFromMediaV1,
} from '@/tests/fixtures/editron/open-ended-planner-v2/rhc02-generated-composition-fixture-v1';

describe('Stage 2.5 RHC-02 AV media and generated hybrid program V1', () => {
  it('materializes hash-bound dialogue, room tone, stills and licensed font', async () => {
    await withFixture(async (media) => {
      expect(() => assertStage25Rhc02PreviewMediaFixtureReceiptV1(media))
        .not.toThrow();
      expect(media.assets.map(({ assetId, mediaKind }) => ({ assetId, mediaKind })))
        .toEqual([
          { assetId: 'rhc02-interview', mediaKind: 'VIDEO_WITH_DIALOGUE_AUDIO' },
          { assetId: 'rhc02-still-a', mediaKind: 'STILL_IMAGE' },
          { assetId: 'rhc02-still-b', mediaKind: 'STILL_IMAGE' },
          { assetId: 'rhc02-room-tone', mediaKind: 'AUDIO' },
        ]);
      expect(media).toMatchObject({
        authority: 'LOCAL_RESEARCH_AV_FIXTURE_MATERIALIZER_ONLY',
        dialogue: {
          projectStartFrame: 210,
          projectEndExclusiveFrame: 421,
          targetRangeFullyInsideDialogue: true,
        },
        roomTone: { projectRange: { startFrame: 0, endExclusiveFrame: 450 } },
        avContract: {
          width: 1080,
          height: 1920,
          frameRate: '30/1',
          frameCount: 450,
          dialogueAudio: { codec: 'aac', sampleRate: 48_000, channels: 1 },
          roomToneAudio: { codec: 'pcm_s16le', sampleRate: 48_000, channels: 1 },
          stills: { format: 'png', width: 540, height: 1920 },
        },
        font: {
          fontAssetId: 'rhc02-licensed-title',
          family: 'Noto Sans',
          weight: 700,
          licenseId: 'OFL-1.1-NOTO-SANS',
        },
      });
      expect(media.provenance.every((entry) => (
        entry.rightsStatus === 'INTERNAL_OWNED_FIXTURE'
        && /^[a-f0-9]{64}$/.test(entry.receiptSha256)
      ))).toBe(true);
      for (const filePath of [
        ...Object.values(media.hostPaths.assetPaths),
        media.hostPaths.fontPath,
        media.hostPaths.audioBaselinePath,
      ]) {
        expect((await fs.stat(filePath)).size).toBeGreaterThan(0);
      }
    });
  }, 60_000);

  it('freezes a decoded PCM baseline across both chapter boundaries', async () => {
    await withFixture(async (media) => {
      expect(media.audioBaseline).toMatchObject({
        format: 'SIGNED_16_BIT_LITTLE_ENDIAN_MONO_48000HZ',
        roomToneGain: 0.15,
        proofWindow: { startFrame: 270, endExclusiveFrame: 420 },
        targetRange: { startFrame: 300, endExclusiveFrame: 390 },
      });
      expect(media.audioBaseline.sampleCount).toBeGreaterThanOrEqual(720_000);
      expect(media.audioBaseline.sampleCount).toBeLessThan(722_048);
      expect([
        media.audioBaseline.dialoguePcmSha256,
        media.audioBaseline.roomTonePcmSha256,
        media.audioBaseline.mixedPcmSha256,
      ].every((hash) => /^[a-f0-9]{64}$/.test(hash))).toBe(true);
      expect(media.audioBaseline.mixedPcmSha256)
        .not.toBe(media.audioBaseline.dialoguePcmSha256);
      expect(media.audioBaseline.mixedPcmSha256)
        .not.toBe(media.audioBaseline.roomTonePcmSha256);
    });
  }, 60_000);

  it('builds a verified visual-island program with explicit native-audio handoffs', async () => {
    await withFixture(async (media) => {
      const identity = buildRhc02PreviewIdentityFromMediaV1(media);
      const fixture = buildRhc02GeneratedCompositionFixtureV1(identity);
      const verification = verifyGeneratedCompositionProgramV1(fixture);

      expect(verification).toMatchObject({
        disposition: 'CONTRACT_PASS',
        executionEligibility: 'NOT_EXECUTABLE',
        diagnostics: [],
      });
      expect(verification.programHash).toBe(hashCanonicalJsonV1(fixture.program));
      expect(verification.sourceBundleHash)
        .toBe(hashGeneratedCompositionSourceBundleV1(fixture.sourceBundle));
      expect(fixture.program).toMatchObject({
        programId: 'gcp-rhc02-hybrid-v1',
        duration: {
          compositionStartTick: '0',
          compositionEndExclusiveTick: '90',
          projectStartTick: '300',
          projectEndExclusiveTick: '390',
        },
        output: {
          kind: 'OPAQUE_NESTED_COMPOSITION',
          audioDisposition: 'CUE_HANDOFF_ONLY',
        },
      });
      expect(fixture.program.sourceSlots.map((slot) => ({
        assetId: slot.assetId,
        range: slot.sourceRange,
      }))).toEqual([
        { assetId: 'rhc02-still-a', range: { start: '0', endExclusive: '1' } },
        { assetId: 'rhc02-still-b', range: { start: '0', endExclusive: '1' } },
      ]);
      expect(fixture.program.exposedParameters.find(
        ({ parameterId }) => parameterId === 'param-title',
      )?.defaultValue).toBe('How we shipped it');
      expect(fixture.handoffs).toMatchObject({
        entry: { firstTargetProjectFrame: 300, firstCompositionFrame: 0 },
        exit: {
          lastCompositionFrame: 89,
          firstReturnProjectFrame: 390,
          firstReturnInterviewSourceFrame: 390,
        },
        audio: { owner: 'NATIVE_TIMELINE_AUDIO', mutationAllowed: false },
      });
    });
  }, 60_000);

  it('rejects a still source whose evidence media kind is changed to audio', async () => {
    await withFixture(async (media) => {
      const fixture = buildRhc02GeneratedCompositionFixtureV1(
        buildRhc02PreviewIdentityFromMediaV1(media),
      );
      const evidence = structuredClone(fixture.evidencePack) as {
        facts: Array<Record<string, unknown>>;
      };
      const still = evidence.facts.find(
        (fact) => fact.factId === 'rhc02-source-rhc02-still-a',
      );
      if (!still) throw new Error('still evidence missing');
      still.mediaKind = 'AUDIO';
      const program = {
        ...fixture.program,
        projectBinding: {
          ...fixture.program.projectBinding,
          evidencePackHash: hashCanonicalJsonV1(evidence),
        },
      };

      expect(verifyGeneratedCompositionProgramV1({
        ...fixture,
        program,
        evidencePack: evidence,
      }).diagnostics).toContain('SOURCE_MEDIA_KIND_UNSUPPORTED:source-still-a');
    });
  }, 60_000);

  it('fails closed on invalid creation time before writing media', async () => {
    const scratch = await fs.mkdtemp(path.join(os.tmpdir(), 'editron-rhc02-invalid-'));
    try {
      await expect(materializeStage25Rhc02PreviewMediaFixtureV1({
        outputDir: path.join(scratch, 'media'),
        createdAt: 'not-a-date',
      })).rejects.toThrow('STAGE25_RHC02_PREVIEW_MEDIA_CREATED_AT_INVALID');
      await expect(fs.stat(path.join(scratch, 'media'))).rejects.toThrow();
    } finally {
      await removeVerifiedScratch(scratch);
    }
  });
});

type MaterializedMedia = Awaited<ReturnType<
  typeof materializeStage25Rhc02PreviewMediaFixtureV1
>>;

let cachedFixture: Promise<MaterializedMedia> | null = null;
let cachedScratch: string | null = null;

afterAll(async () => {
  if (cachedScratch) await removeVerifiedScratch(cachedScratch);
});

async function withFixture(
  run: (media: MaterializedMedia) => Promise<void>,
): Promise<void> {
  if (!cachedFixture) {
    cachedScratch = await fs.mkdtemp(path.join(os.tmpdir(), 'editron-rhc02-media-'));
    cachedFixture = materializeStage25Rhc02PreviewMediaFixtureV1({
      outputDir: path.join(cachedScratch, 'media'),
      createdAt: '2026-08-27T05:30:00.000Z',
    });
  }
  await run(await cachedFixture);
}

async function removeVerifiedScratch(scratch: string): Promise<void> {
  const resolved = path.resolve(scratch);
  if (path.dirname(resolved) !== path.resolve(os.tmpdir())
    || !path.basename(resolved).startsWith('editron-rhc02-')) {
    throw new Error(`Unsafe RHC02 test scratch path: ${resolved}`);
  }
  await fs.rm(resolved, { recursive: true, force: true });
}
