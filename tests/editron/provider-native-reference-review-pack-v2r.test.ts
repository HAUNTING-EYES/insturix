import { mkdtemp, readFile, rm, stat } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { hashCanonicalJsonV1 } from '@/lib/editron/research/open-ended-planner/contracts-v1';
import type { ReferenceNativeObservationMapV2R }
  from '@/lib/editron/research/open-ended-planner/provider-native-reference-observation-contract-v2r';
import {
  buildReferenceHoldout01NativeManifestV2R,
  REFERENCE_HOLDOUT_01_NATIVE_EXPECTED_INPUT_SHA256,
} from '@/lib/editron/research/open-ended-planner/provider-native-reference-holdout-01-v2r';
import {
  buildReferenceHoldout01ReviewPackV2R,
  type ReferenceHoldout01ReviewPackV2R,
} from '@/lib/editron/research/open-ended-planner/provider-native-reference-review-pack-v2r';
import type { ReferenceObserverEpisodeReceiptV2R }
  from '@/lib/editron/research/open-ended-planner/provider-native-reference-observer-episode-v2r';

type JsonRecord = Record<string, unknown>;

describe('HREF-01 native human-review pack V2R', () => {
  let scratch: string;
  let pack: Readonly<ReferenceHoldout01ReviewPackV2R>;

  beforeAll(async () => {
    scratch = await mkdtemp(path.join(os.tmpdir(), 'editron-href01-review-'));
    pack = await buildReferenceHoldout01ReviewPackV2R({
      sourcePath: sourcePath(),
      outputRoot: path.join(scratch, 'valid'),
      createdAt: '2026-08-22T00:00:00.000Z',
      episodeReceipt: validEpisodeReceipt(),
    });
  }, 180_000);

  afterAll(async () => {
    if (scratch) await rm(scratch, { recursive: true, force: true });
  });

  it('creates a self-contained single-reviewer pack without claiming formal promotion', async () => {
    expect(pack).toMatchObject({
      version: 'EDITRON_REFERENCE_HOLDOUT_01_REVIEW_PACK_V2R_1',
      taskId: 'HREF-01-NATIVE',
      reviewStatus: 'AWAITING_SINGLE_PROJECT_OWNER_REVIEW',
      formalPromotionStatus: 'BLOCKED_PENDING_SECOND_INDEPENDENT_QUALIFIED_REVIEWER',
      stateEffects: [],
    });
    expect(pack.denseWindows).toHaveLength(1);
    expect(pack.denseWindows[0]).toMatchObject({
      windowId: 'dense-hub',
      expectedFrameCount: 16,
    });
    expect((await stat(pack.denseWindows[0].videoPath)).size).toBeGreaterThan(10_000);
    expect((await stat(pack.denseWindows[0].audioPath)).size).toBeGreaterThan(10_000);

    const manifest = JSON.parse(await readFile(pack.reviewerManifestPath, 'utf8')) as JsonRecord;
    const serialized = JSON.stringify(manifest);
    expect(serialized).not.toContain('gemini-3.6-flash');
    expect(manifest).toMatchObject({
      publicPackHash: pack.publicPackHash,
      reference: { fileName: 'reference.mp4' },
      reviewStatus: 'AWAITING_SINGLE_PROJECT_OWNER_REVIEW',
      denseWindows: [{ windowId: 'dense-hub', expectedFrameCount: 16 }],
    });
    const form = JSON.parse(await readFile(pack.reviewFormTemplatePath, 'utf8'));
    expect(form).toMatchObject({
      reviewerId: null,
      completeReferencePlaybackConfirmed: false,
      denseWindowPlaybackConfirmed: { 'dense-hub': false },
      overallDecision: null,
      stateEffects: [],
    });
    const key = JSON.parse(await readFile(pack.operatorKeyPath, 'utf8'));
    expect(key).toMatchObject({
      operatorKeyHash: pack.operatorKeyHash,
      route: { model: 'gemini-3.6-flash' },
      disclosurePolicy: 'DO_NOT_OPEN_UNTIL_REVIEW_FORM_IS_FINAL',
    });
  });

  it('rejects a forged provider receipt before producing review evidence', async () => {
    await expect(buildReferenceHoldout01ReviewPackV2R({
      sourcePath: sourcePath(),
      outputRoot: path.join(scratch, 'forged'),
      createdAt: '2026-08-22T00:00:00.000Z',
      episodeReceipt: { ...validEpisodeReceipt(), receiptSha256: '0'.repeat(64) },
    })).rejects.toThrow('HREF01_REVIEW_PACK_EPISODE_RECEIPT_INVALID');
  });

  it('rejects unbounded dense requests and refuses to overwrite a pack', async () => {
    const invalid = mutableReceipt(validEpisodeReceipt());
    const observation = invalid.observation as unknown as JsonRecord;
    const windows = observation.requestedDenseReinspectionWindows as JsonRecord[];
    windows[0].endTimestampUsExclusive = '30000000';
    invalid.receiptSha256 = receiptHash(invalid);
    await expect(buildReferenceHoldout01ReviewPackV2R({
      sourcePath: sourcePath(),
      outputRoot: path.join(scratch, 'unbounded'),
      createdAt: '2026-08-22T00:00:00.000Z',
      episodeReceipt: invalid,
    })).rejects.toThrow(/HREF01_REVIEW_PACK_(OBSERVATION|WINDOW)_INVALID/);

    await expect(buildReferenceHoldout01ReviewPackV2R({
      sourcePath: sourcePath(),
      outputRoot: path.join(scratch, 'valid'),
      createdAt: '2026-08-22T00:00:00.000Z',
      episodeReceipt: validEpisodeReceipt(),
    })).rejects.toThrow();
  });
});

function validEpisodeReceipt(): Readonly<ReferenceObserverEpisodeReceiptV2R> {
  const manifest = buildReferenceHoldout01NativeManifestV2R();
  const observation = validObservation();
  const evidenceIds = [
    'global-language', 'recurring-cards', 'hero-hub', 'literal-brand',
    'phase-intro', 'audio-build', 'limit-sampling', 'limit-easing', 'dense-hub',
  ];
  const material = {
    receiptVersion: 'EDITRON_REFERENCE_OBSERVER_EPISODE_V2R_1' as const,
    authority: 'RESEARCH_REFERENCE_OBSERVATION_ONLY_NO_PROJECT_MUTATION' as const,
    route: {
      routeId: 'GOOGLE_FLASH' as const,
      provider: 'google' as const,
      model: 'gemini-3.6-flash' as const,
      claimedModelIdentity: 'gemini-3.6-flash',
      reasoningMode: 'medium',
    },
    taskManifestSha256: manifest.manifestSha256,
    referenceInputManifestSha256: REFERENCE_HOLDOUT_01_NATIVE_EXPECTED_INPUT_SHA256,
    toolSetSha256: '1'.repeat(64),
    exposedEditingOperatorIds: [] as const,
    selectedEditingOperatorIds: [] as const,
    providerTurn: { requestHash: '2'.repeat(64), responseStatus: 200 },
    terminal: {
      disposition: 'READY_FOR_EVALUATION' as const,
      reasonCodes: ['OBSERVATION_SUBMITTED'], evidenceIds,
      summary: 'Native observations are timestamp-bound and ready for human review.',
    },
    observation,
    validationDiagnostics: [] as const,
    productOutcome: 'NOT_EVALUATED_OBSERVATION_ONLY' as const,
    stateEffects: [] as const,
  };
  return Object.freeze({ ...material, receiptSha256: hashCanonicalJsonV1(material) });
}

function validObservation(): ReferenceNativeObservationMapV2R {
  return {
    artifactVersion: 'REFERENCE_OBSERVATION_MAP_V2R_2',
    taskId: 'HREF-01-NATIVE',
    inputArm: 'NATIVE_VIDEO_WITH_EMBEDDED_AUDIO',
    globalEditorialLanguage: [{
      observationId: 'global-language', statement: 'Near-black fields use restrained warm accents.',
      certainty: 'OBSERVED', evidenceRanges: [range('0', '10000000', 'VIDEO')],
      dimension: 'COLOUR_LIGHT', transferability: 'STYLE_ONLY',
    }],
    recurringDesignGrammar: [{
      observationId: 'recurring-cards', statement: 'Dark product cards recur outside the sparse opening.',
      certainty: 'OBSERVED', patternKind: 'RECURRING',
      evidenceRanges: [range('10000000', '20000000', 'VIDEO'), range('30000000', '40000000', 'VIDEO')],
      occurrenceRanges: [range('10000000', '20000000', 'VIDEO'), range('30000000', '40000000', 'VIDEO')],
      counterexampleRanges: [range('0', '5000000', 'VIDEO')],
    }],
    boundedHeroMoments: [{
      observationId: 'hero-hub', statement: 'A central object is surrounded by labelled functions.',
      certainty: 'OBSERVED', evidenceRanges: [range('14000000', '16000000', 'VIDEO')],
      momentRange: range('14000000', '16000000', 'VIDEO'), states: ['hub visible'],
    }],
    contentLiterals: [{
      observationId: 'literal-brand', statement: 'The exact brand is literal content.',
      certainty: 'OBSERVED', evidenceRanges: [range('5000000', '6000000', 'VIDEO')],
      kind: 'BRAND', rightsDisposition: 'DO_NOT_COPY',
    }],
    temporalStructure: [{
      observationId: 'phase-intro', statement: 'The opening establishes the premise.',
      certainty: 'OBSERVED', evidenceRanges: [range('0', '8000000', 'VIDEO_AND_AUDIO')],
      phaseRange: range('0', '8000000', 'VIDEO_AND_AUDIO'), phaseRole: 'INTRODUCTION',
    }],
    audioBehaviour: [{
      observationId: 'audio-build', statement: 'Audible energy supports the opening build.',
      certainty: 'OBSERVED', evidenceRanges: [range('0', '10000000', 'VIDEO_AND_AUDIO')],
      behaviourKind: 'DYNAMICS',
    }],
    uncertainties: [
      { uncertaintyId: 'limit-sampling', statement: 'Provider sampling is not source-frame complete.', disposition: 'UNVERIFIABLE_FROM_NATIVE_PASS', affectedLayers: ['source-frame completeness'] },
      { uncertaintyId: 'limit-easing', statement: 'Exact easing requires dense inspection.', disposition: 'REQUIRES_DENSE_REINSPECTION', affectedLayers: ['exact easing'] },
    ],
    requestedDenseReinspectionWindows: [{
      windowId: 'dense-hub', startTimestampUs: '14000000', endTimestampUsExclusive: '16000000',
      reason: 'Resolve fast motion around the hub reveal.', requiredModality: 'CUSTOM_FPS_VIDEO',
      requestedRate: { numerator: '8', denominator: '1' },
    }],
  };
}

function range(startTimestampUs: string, endTimestampUsExclusive: string, modality: string) {
  return { startTimestampUs, endTimestampUsExclusive, modality };
}
function sourcePath(): string {
  return path.resolve('public/product_demos/showcase/insturix-final-intro.mp4');
}
function mutableReceipt(receipt: Readonly<ReferenceObserverEpisodeReceiptV2R>): JsonRecord {
  return structuredClone(receipt) as unknown as JsonRecord;
}
function receiptHash(receipt: JsonRecord): string {
  const material = structuredClone(receipt); delete material.receiptSha256;
  return hashCanonicalJsonV1(material);
}
