import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { verifyGeneratedCompositionProgramV1 }
  from '@/lib/editron/research/open-ended-planner/generated-composition-program-verifier-v1';
import {
  buildStage25Rhc03PreviewCandidatesV1,
  identityFromMedia,
} from '@/lib/editron/research/open-ended-planner/stage25-rhc03-preview-candidates-v1';
import {
  assertStage25Rhc03PreviewMediaFixtureReceiptV1,
  materializeStage25Rhc03PreviewMediaFixtureV1,
  type Stage25Rhc03PreviewMediaFixtureReceiptV1,
} from '@/lib/editron/research/open-ended-planner/stage25-rhc03-preview-media-fixture-v1';
import {
  buildRhc03GeneratedCompositionFixtureV1,
  RHC03_LABEL_TEXT_V1,
} from '@/tests/fixtures/editron/open-ended-planner-v2/rhc03-generated-composition-fixture-v1';

const CREATED_AT = '2026-08-27T08:30:00.000Z';
const TASK_SHA256 =
  '560623d9895a005e54b015a95433d9e6fee292a9dad5f4d18dbb6413d40571ab';

describe('Stage 2.5 RHC03 media, program, and owner qualification V1', () => {
  let scratch = '';
  let media: Stage25Rhc03PreviewMediaFixtureReceiptV1;

  beforeAll(async () => {
    scratch = await mkdtemp(path.join(os.tmpdir(), 'editron-rhc03-media-'));
    media = await materializeStage25Rhc03PreviewMediaFixtureV1({
      outputDir: path.join(scratch, 'fixture'),
      createdAt: CREATED_AT,
    });
  }, 180_000);

  afterAll(async () => {
    if (scratch) await rm(scratch, { recursive: true, force: true });
  });

  it('materializes exact synchronized source, audio, font, and rights evidence', () => {
    expect(() => assertStage25Rhc03PreviewMediaFixtureReceiptV1(media)).not.toThrow();
    expect(media.source).toMatchObject({
      sha256: 'd95dd77fccaa5e6eb4f1c0e42b399b95a801937c49ef072160d10b2a4208e73f',
      sourceRate: '60/1',
      sourceFrameRange: { startFrame: 300, endExclusiveFrame: 2100 },
    });
    expect(media.projectContract).toEqual({
      width: 1920,
      height: 1080,
      frameRate: '30/1',
      frameCount: 900,
      targetRange: { startFrame: 450, endExclusiveFrame: 600 },
      actionClipFrameCount: 150,
      sourceRateConversion: 'SELECT_EVERY_SECOND_60FPS_SOURCE_FRAME',
    });
    const left = media.assets.find(({ assetId }) => assetId === 'rhc03-action-left');
    const right = media.assets.find(({ assetId }) => assetId === 'rhc03-action-right');
    expect(left?.sha256).toBe(right?.sha256);
    expect(media.hostPaths.assetPaths['rhc03-action-left'])
      .toBe(media.hostPaths.assetPaths['rhc03-action-right']);
    expect(media.synchronization).toMatchObject({
      leftAndRightUseIdenticalTemporalBytes: true,
      returnMarker: { projectFrame: 600, authoredWideSourceFrame: 600 },
    });
    expect(media.productionAudio).toMatchObject({
      owner: 'NATIVE_TIMELINE_PRODUCTION_AUDIO',
      sampleRate: 48_000,
      channels: 2,
      sampleCountPerChannel: 1_440_000,
      candidateMayMutateAudio: false,
    });
    expect(media.font).toMatchObject({
      fontAssetId: 'rhc03-licensed-label',
      family: 'Noto Sans',
      face: 'Regular',
      weight: 400,
      licenseId: 'OFL-1.1-NOTO-SANS',
    });
    expect(new Set(media.provenance.map(({ receiptSha256 }) => receiptSha256)).size)
      .toBe(4);
  });

  it('verifies the editable program and explicit hybrid handoffs', () => {
    const fixture = buildRhc03GeneratedCompositionFixtureV1(identityFromMedia(media));
    const verification = verifyGeneratedCompositionProgramV1(fixture);
    expect(verification).toMatchObject({
      disposition: 'CONTRACT_PASS',
      diagnostics: [],
    });
    expect(fixture.program.sourceSlots).toMatchObject([
      { slotId: 'source-left', assetId: 'rhc03-action-left' },
      { slotId: 'source-right', assetId: 'rhc03-action-right' },
    ]);
    expect(fixture.program.exposedParameters.map(({ parameterId }) => parameterId))
      .toEqual([
        'param-label',
        'param-label-color',
        'param-label-size',
        'param-gutter',
        'param-background',
      ]);
    expect(fixture.program.exposedParameters[0]).toMatchObject({
      defaultValue: RHC03_LABEL_TEXT_V1,
    });
    expect(fixture.handoffs).toMatchObject({
      target: { startFrame: 450, endExclusiveFrame: 600 },
      entry: {
        firstTargetProjectFrame: 450,
        firstCompositionFrame: 0,
        correspondingAuthoredWideFrame: 450,
      },
      exit: {
        lastTargetProjectFrame: 599,
        lastCompositionFrame: 149,
        firstReturnProjectFrame: 600,
        firstReturnAuthoredWideFrame: 600,
      },
      audio: {
        owner: 'NATIVE_TIMELINE_PRODUCTION_AUDIO',
        mutationAllowed: false,
        exactPcmEquivalenceRequired: true,
      },
    });
    expect(fixture.layoutContract).toMatchObject({
      centeredLabelGap: { left: 0.45, right: 0.55 },
      label: {
        text: 'SYNC',
        defaultFontSizePx: 40,
        minimumFontSizePx: 36,
        minimumContrastRatio: 4.5,
        defaultContrastRatio: 20.17,
      },
      danglingKnowledgeGraphEdgeExcluded: 'technique:layout.split_screen',
    });
  });

  it('observes current native gaps and qualifies only hybrid for rendering', async () => {
    const receipt = await buildStage25Rhc03PreviewCandidatesV1(media);
    expect(receipt).toMatchObject({
      taskSha256: TASK_SHA256,
      proofCeiling: 'MATERIALIZED_FORM_AND_ISOLATED_OWNER_PROOF_NOT_RENDERED',
      programVerification: { disposition: 'CONTRACT_PASS', diagnostics: [] },
      externalCalls: {
        providerInferenceCalls: 0,
        renderCalls: 0,
        networkCalls: 0,
        databaseCalls: 0,
        canonicalProjectMutationWrites: 0,
      },
    });
    const native = receipt.routes.find(({ route }) => route === 'NATIVE');
    const generated = receipt.routes.find(
      ({ route }) => route === 'GENERATED_COMPOSITION',
    );
    const hybrid = receipt.routes.find(({ route }) => route === 'HYBRID');
    if (!native || native.route !== 'NATIVE') {
      throw new Error('RHC03 native route missing');
    }
    expect(native).toMatchObject({
      disposition: 'CAPABILITY_GAP',
      capabilityGapCodes: ['NATIVE_EXACT_FONT_FILE_BINDING_UNAVAILABLE'],
      qualifications: {
        isolatedRevisionIssuedVideoOverlayWriter: true,
        bothMutedVideoFormsAccepted: true,
        exactNativeFontFileBinding: false,
      },
      ownerObservation: {
        canonicalUnchanged: true,
        exactFont: {
          disposition: 'UNVERIFIABLE',
          code: 'PROJECTSERVICE_ISOLATED_OVERLAY_FORM_INPUT_INVALID',
        },
      },
    });
    expect(native.ownerObservation.mutedVideoViews).toHaveLength(2);
    expect(generated).toMatchObject({
      disposition: 'CAPABILITY_GAP',
      capabilityGapCodes: ['GENERATED_PROXY_PLAYABLE_AUDIO_ABSENT'],
      qualifications: { playableProductionAudioOwner: false },
    });
    expect(hybrid).toMatchObject({
      disposition: 'READY_FOR_RENDER',
      capabilityAvailable: true,
      capabilityGapCodes: [],
      qualifications: {
        programContractVerified: true,
        sourceRightsReceiptsVerified: true,
        exactFontFileBound: true,
        timebaseHandoff: true,
        audioHandoff: true,
        boundaryHandoff: true,
        isolatedProjectServiceDraftProjection: true,
        sandboxExecutionPending: true,
        renderedAvProofPending: true,
      },
    });
  });

  it('fails closed when a materialized identity is altered', async () => {
    const tampered = structuredClone(media);
    tampered.assets[0]!.sha256 = '0'.repeat(64);
    expect(() => assertStage25Rhc03PreviewMediaFixtureReceiptV1(tampered))
      .toThrow('STAGE25_RHC03_PREVIEW_MEDIA_RECEIPT_INVALID');
    await expect(buildStage25Rhc03PreviewCandidatesV1(tampered))
      .rejects.toThrow('STAGE25_RHC03_PREVIEW_MEDIA_RECEIPT_INVALID');
  });
});
