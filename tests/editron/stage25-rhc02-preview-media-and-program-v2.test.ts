import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { afterAll, describe, expect, it } from 'vitest';

import { hashCanonicalJsonV1 }
  from '@/lib/editron/research/open-ended-planner/contracts-v1';
import { verifyGeneratedCompositionProgramV1 }
  from '@/lib/editron/research/open-ended-planner/generated-composition-program-verifier-v1';
import {
  assertStage25Rhc02PreviewMediaFixtureReceiptV2,
  inspectSfntWeightClassV1,
  materializeStage25Rhc02PreviewMediaFixtureV2,
} from '@/lib/editron/research/open-ended-planner/stage25-rhc02-preview-media-fixture-v2';
import { buildRhc02GeneratedCompositionFixtureV2 }
  from '@/tests/fixtures/editron/open-ended-planner-v2/rhc02-generated-composition-fixture-v2';

describe('Stage 2.5 RHC-02 AV media and generated hybrid program V2', () => {
  it('issues a hash-linked successor using the font file\'s SFNT weight', async () => {
    await withFixture(async (media) => {
      expect(() => assertStage25Rhc02PreviewMediaFixtureReceiptV2(media)).not.toThrow();
      const inspected = inspectSfntWeightClassV1(
        await fs.readFile(media.hostPaths.fontPath),
      );
      expect(inspected).toEqual(media.fontMetadataProof);
      expect(media).toMatchObject({
        font: { family: 'Noto Sans', face: 'Regular', weight: 400 },
        fontMetadataProof: {
          kind: 'SFNT_OS2_US_WEIGHT_CLASS',
          usWeightClass: 400,
        },
        correction: {
          predecessorReceiptSha256:
            '096312058f19d3978eea4128df89c3607632664b5fcc061ca75acaf123d7e3b3',
          predecessorDeclaredWeight: 700,
          correctedDeclaredWeight: 400,
          reason: 'SFNT_OS2_US_WEIGHT_CLASS_IS_AUTHORITATIVE',
        },
      });
      expect(media.receiptSha256).not.toBe(media.correction.predecessorReceiptSha256);
      const forged = structuredClone(media);
      forged.font.weight = 700;
      expect(() => assertStage25Rhc02PreviewMediaFixtureReceiptV2(forged))
        .toThrow('STAGE25_RHC02_PREVIEW_MEDIA_V2_RECEIPT_INVALID');
    });
  }, 60_000);

  it('fails closed on malformed SFNT bytes', () => {
    expect(() => inspectSfntWeightClassV1(Buffer.alloc(11)))
      .toThrow('STAGE25_RHC02_PREVIEW_MEDIA_V2_FONT_SFNT_HEADER_INVALID');
    const missingOs2 = Buffer.alloc(28);
    missingOs2.writeUInt16BE(1, 4);
    missingOs2.write('name', 12, 'ascii');
    expect(() => inspectSfntWeightClassV1(missingOs2))
      .toThrow('STAGE25_RHC02_PREVIEW_MEDIA_V2_FONT_OS2_TABLE_MISSING');
  });

  it('builds a verified V2 program without rewriting the V1 program identity', async () => {
    await withFixture(async (media) => {
      const fixture = buildRhc02GeneratedCompositionFixtureV2(media);
      const verification = verifyGeneratedCompositionProgramV1(fixture);
      expect(verification).toMatchObject({
        disposition: 'CONTRACT_PASS',
        diagnostics: [],
      });
      expect(fixture.program).toMatchObject({
        programId: 'gcp-rhc02-hybrid-v2',
        fontSlots: [{ family: 'Noto Sans', face: 'Regular', weight: 400 }],
      });
      expect(fixture.correction).toMatchObject({
        supersedes: { programId: 'gcp-rhc02-hybrid-v1' },
        successor: {
          mediaReceiptSha256: media.receiptSha256,
          programId: 'gcp-rhc02-hybrid-v2',
          programSha256: hashCanonicalJsonV1(fixture.program),
        },
      });
    });
  }, 60_000);

  it('rejects a program whose weight drifts from declared V2 font evidence', async () => {
    await withFixture(async (media) => {
      const fixture = buildRhc02GeneratedCompositionFixtureV2(media);
      const program = structuredClone(fixture.program);
      program.fontSlots[0]!.weight = 700;
      expect(verifyGeneratedCompositionProgramV1({ ...fixture, program }).diagnostics)
        .toContain('FONT_IDENTITY_OR_RIGHTS_DRIFT:font-title');
    });
  }, 60_000);
});

type MaterializedMedia = Awaited<ReturnType<
  typeof materializeStage25Rhc02PreviewMediaFixtureV2
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
    cachedScratch = await fs.mkdtemp(path.join(os.tmpdir(), 'editron-rhc02-v2-'));
    cachedFixture = materializeStage25Rhc02PreviewMediaFixtureV2({
      outputDir: path.join(cachedScratch, 'media'),
      createdAt: '2026-08-27T05:30:00.000Z',
    });
  }
  await run(await cachedFixture);
}

async function removeVerifiedScratch(scratch: string): Promise<void> {
  const resolved = path.resolve(scratch);
  if (path.dirname(resolved) !== path.resolve(os.tmpdir())
    || !path.basename(resolved).startsWith('editron-rhc02-v2-')) {
    throw new Error(`Unsafe RHC02 V2 test scratch path: ${resolved}`);
  }
  await fs.rm(resolved, { recursive: true, force: true });
}
