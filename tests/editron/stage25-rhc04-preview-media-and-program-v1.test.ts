import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import {
  buildRhc04GeneratedCompositionFixtureV1,
  RHC04_GENERATED_COMPOSITION_SOURCE_BUNDLE_V1,
} from '@/tests/fixtures/editron/open-ended-planner-v2/rhc04-generated-composition-fixture-v1';
import { hashGeneratedCompositionSourceBundleV1 }
  from '@/lib/editron/research/open-ended-planner/generated-composition-program-v1';
import { verifyGeneratedCompositionProgramV1 }
  from '@/lib/editron/research/open-ended-planner/generated-composition-program-verifier-v1';
import {
  buildStage25Rhc04PreviewCandidatesV1,
  identityFromMedia,
} from '@/lib/editron/research/open-ended-planner/stage25-rhc04-preview-candidates-v1';
import {
  assertStage25Rhc04PreviewMediaFixtureReceiptV1,
  materializeStage25Rhc04PreviewMediaFixtureV1,
} from '@/lib/editron/research/open-ended-planner/stage25-rhc04-preview-media-fixture-v1';

type MediaReceipt = Awaited<ReturnType<
  typeof materializeStage25Rhc04PreviewMediaFixtureV1
>>;

describe('Stage 2.5 RHC-04 preview media and generated program V1', () => {
  let scratchRoot = '';
  let media: MediaReceipt;
  let repeated: MediaReceipt;

  beforeAll(async () => {
    scratchRoot = await mkdtemp(path.join(tmpdir(), 'editron-rhc04-phase-a-'));
    const createdAt = '2026-08-27T17:30:00.000Z';
    media = await materializeStage25Rhc04PreviewMediaFixtureV1({
      outputDir: path.join(scratchRoot, 'first'),
      createdAt,
    });
    repeated = await materializeStage25Rhc04PreviewMediaFixtureV1({
      outputDir: path.join(scratchRoot, 'second'),
      createdAt,
    });
  }, 120_000);

  afterAll(async () => {
    if (scratchRoot.startsWith(path.join(tmpdir(), 'editron-rhc04-phase-a-'))) {
      await rm(scratchRoot, { recursive: true, force: true });
    }
  });

  it('materializes four distinct rights-bound stills and the exact licensed font deterministically', () => {
    assertStage25Rhc04PreviewMediaFixtureReceiptV1(media);
    assertStage25Rhc04PreviewMediaFixtureReceiptV1(repeated);
    expect(media.receiptSha256).toBe(repeated.receiptSha256);
    expect(media.assets).toEqual(repeated.assets);
    expect(media.assets.map(({ assetId }) => assetId)).toEqual([
      'rhc04-closeup-60',
      'rhc04-closeup-30',
      'rhc04-closeup-10',
      'rhc04-correction-source',
    ]);
    expect(new Set(media.assets.map(({ sha256 }) => sha256)).size).toBe(4);
    expect(media.assets.every(({ mediaKind }) => mediaKind === 'STILL_IMAGE')).toBe(true);
    expect(media.stillContract.measurements.every(
      ({ minimumWhiteContrastRatio }) => minimumWhiteContrastRatio >= 4.5,
    )).toBe(true);
    expect(media.font).toMatchObject({
      fontAssetId: 'rhc04-licensed-numerals',
      family: 'Noto Sans',
      face: 'Regular',
      weight: 400,
      licenseId: 'OFL-1.1-NOTO-SANS',
    });
    expect(media.externalCalls).toEqual({
      providerInferenceCalls: 0,
      networkCalls: 0,
      databaseCalls: 0,
      renderCalls: 0,
      canonicalProjectMutationWrites: 0,
    });
  });

  it('verifies initial and corrected programs while keeping one exact source bundle', () => {
    const identity = identityFromMedia(media);
    const initial = buildRhc04GeneratedCompositionFixtureV1(identity, {
      variant: 'INITIAL', expectedProjectRevision: 'R1',
    });
    const corrected = buildRhc04GeneratedCompositionFixtureV1(identity, {
      variant: 'CORRECTED', expectedProjectRevision: 'R2',
    });
    const initialVerification = verifyGeneratedCompositionProgramV1(initial);
    const correctedVerification = verifyGeneratedCompositionProgramV1(corrected);
    expect(initialVerification).toMatchObject({
      disposition: 'CONTRACT_PASS', diagnostics: [],
    });
    expect(correctedVerification).toMatchObject({
      disposition: 'CONTRACT_PASS', diagnostics: [],
    });
    expect(initialVerification.sourceBundleHash).toBe(
      correctedVerification.sourceBundleHash,
    );
    expect(initialVerification.sourceBundleHash).toBe(
      hashGeneratedCompositionSourceBundleV1(
        RHC04_GENERATED_COMPOSITION_SOURCE_BUNDLE_V1,
      ),
    );
    expect(initial.program.sourceSlots.map(({ slotId, assetId }) => ({ slotId, assetId })))
      .toEqual([
        { slotId: 'source-60', assetId: 'rhc04-closeup-60' },
        { slotId: 'source-middle', assetId: 'rhc04-closeup-30' },
        { slotId: 'source-10', assetId: 'rhc04-closeup-10' },
      ]);
    expect(corrected.program.sourceSlots.map(({ slotId, assetId }) => ({ slotId, assetId })))
      .toEqual([
        { slotId: 'source-60', assetId: 'rhc04-closeup-60' },
        { slotId: 'source-middle', assetId: 'rhc04-correction-source' },
        { slotId: 'source-10', assetId: 'rhc04-closeup-10' },
      ]);
    expect(controlValues(initial.program.exposedParameters)).toEqual({
      'param-number-60': '60%',
      'param-number-middle': '30%',
      'param-number-10': '10%',
      'param-final-hold': 90,
    });
    expect(controlValues(corrected.program.exposedParameters)).toEqual({
      'param-number-60': '60%',
      'param-number-middle': '35%',
      'param-number-10': '10%',
      'param-final-hold': 75,
    });
    expect(corrected.timingContract.final).toMatchObject({
      startFrame: 105,
      endExclusiveFrame: 180,
      holdFrames: 75,
      assetId: 'rhc04-closeup-10',
      number: '10%',
    });
  });

  it('qualifies generated-only for render and preserves native and hybrid limits honestly', async () => {
    const candidates = await buildStage25Rhc04PreviewCandidatesV1(media);
    expect(candidates.taskSha256).toBe(
      '1e34fb82b82f80fea9888039712af69984dc575942b04c4b9129bf80f7948ea1',
    );
    expect(candidates.routes.map(({ route, disposition }) => ({ route, disposition })))
      .toEqual([
        { route: 'NATIVE', disposition: 'CAPABILITY_GAP' },
        { route: 'GENERATED_COMPOSITION', disposition: 'READY_FOR_RENDER' },
        { route: 'HYBRID', disposition: 'NOT_APPLICABLE' },
      ]);
    const native = candidates.routes.find(({ route }) => route === 'NATIVE');
    const generated = candidates.routes.find(
      ({ route }) => route === 'GENERATED_COMPOSITION',
    );
    expect(native).toMatchObject({
      capabilityGapCodes: ['NATIVE_EXACT_FONT_FILE_BINDING_UNAVAILABLE'],
      ownerObservation: {
        canonicalUnchanged: true,
        imageProposalChangedPaths: ['$.overlays[0]', '$.overlays[1]', '$.overlays[2]'],
        exactFont: {
          disposition: 'UNVERIFIABLE',
          code: 'PROJECTSERVICE_ISOLATED_OVERLAY_FORM_INPUT_INVALID',
        },
      },
    });
    expect(generated).toMatchObject({
      correctionScope: {
        changedSourceSlotIds: ['source-middle'],
        changedControlIds: ['param-number-middle', 'param-final-hold'],
        unchangedControlIds: ['param-number-60', 'param-number-10'],
        unchangedSourceSlotIds: ['source-60', 'source-10'],
      },
      qualifications: {
        sourceBundleRegenerationRequiredForCorrection: false,
        mediaRegenerationRequiredForCorrection: false,
        humanHandsOnMeasurementPending: true,
      },
    });
    expect(candidates.externalCalls).toEqual({
      providerInferenceCalls: 0,
      renderCalls: 0,
      networkCalls: 0,
      databaseCalls: 0,
      canonicalProjectMutationWrites: 0,
    });
  });

  it('fails closed when media or a corrected source binding is tampered', () => {
    const tamperedMedia = structuredClone(media);
    tamperedMedia.assets[0]!.sha256 = '0'.repeat(64);
    expect(() => assertStage25Rhc04PreviewMediaFixtureReceiptV1(tamperedMedia))
      .toThrow('STAGE25_RHC04_PREVIEW_MEDIA_RECEIPT_INVALID');

    const corrected = buildRhc04GeneratedCompositionFixtureV1(identityFromMedia(media), {
      variant: 'CORRECTED', expectedProjectRevision: 'R2',
    });
    const tamperedProgram = structuredClone(corrected);
    (tamperedProgram.program.sourceSlots[1] as { assetId: string }).assetId =
      'rhc04-undeclared-source';
    const verification = verifyGeneratedCompositionProgramV1(tamperedProgram);
    expect(verification.disposition).toBe('CONTRACT_FAIL');
    expect(verification.diagnostics).toContain(
      'SOURCE_IDENTITY_OR_RIGHTS_DRIFT:source-middle',
    );
  });
});

function controlValues(
  controls: readonly { parameterId: string; defaultValue: string | number }[],
) {
  return Object.fromEntries(controls.map(({ parameterId, defaultValue }) => [
    parameterId,
    defaultValue,
  ]));
}
