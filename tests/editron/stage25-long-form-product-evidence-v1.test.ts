import { readFileSync } from 'node:fs';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

import { hashCanonicalJsonV1 }
  from '@/lib/editron/research/open-ended-planner/contracts-v1';
import {
  STAGE25_ACCEPTED_LONG_FORM_LOCAL_RECEIPT_SHA256_V1,
  STAGE25_LONG_FORM_PRODUCT_OWNER_TEST_FILES_V1,
  finalizeStage25LongFormProductEvidenceV1,
  type Stage25LongFormProductEvidenceInputV1,
} from '@/lib/editron/research/open-ended-planner/stage25-long-form-product-evidence-v1';

describe('Stage 2.5 long-form product evidence V1', () => {
  it('freezes a MODIFY receipt without promoting partial product evidence', () => {
    const receipt = finalizeStage25LongFormProductEvidenceV1(validInput());

    expect(receipt).toMatchObject({
      assessment: 'MODIFY_LONG_FORM_PRODUCT_EVIDENCE_INCOMPLETE',
      proofCeiling:
        'LIVE_ATLAS_CAS_GENERIC_R2_REACHABILITY_MIXED_RATE_SAFE_STOP_AND_LOCAL_PRODUCTION_AUDIO_RENDER',
      mixedRateProjectService: {
        exactSameRateCfr: 'SUPPORTED',
        mixedRateCfr: 'SAFE_STOP_SOURCE_PROJECT_RATE_MISMATCH',
        variableFrameRate: 'SAFE_STOP_SOURCE_EVENT_REBIND_UNSUPPORTED',
        rationalPtsConsumer: 'MISSING',
      },
      proxyMaster: { identityInvalidationTests: 'PASS', liveTransition: 'NOT_RUN_NO_ISOLATED_MASTER_OBJECT' },
      providerInferenceCalls: 0,
      providerEmbeddingCalls: 0,
      cloudRenderCalls: 0,
      r2ObjectWrites: 0,
      canonicalProjectMutations: 0,
      liveFixtureInsertCount: 1,
      liveFixtureDeleteCount: 1,
      nonFixtureMutationCount: 0,
    });
    expect(receipt.unresolvedRequirements).toContain('SEMANTIC_RETRIEVAL_ACCURACY');
    expect(receipt.unresolvedRequirements)
      .toContain('RATIONAL_MIXED_RATE_AND_VFR_PROJECTSERVICE_CONSUMPTION');
    expect(Object.isFrozen(receipt)).toBe(true);
    const material = { ...receipt } as Record<string, unknown>;
    delete material.receiptSha256;
    expect(receipt.receiptSha256).toBe(hashCanonicalJsonV1(material));
  });

  it('rejects dirty source, substituted local evidence, and incomplete owner tests', () => {
    const dirty = validInput();
    (dirty.source as unknown as { relevantStatusEntries: string[] }).relevantStatusEntries = [
      ' M lib/editron/unsafe.ts',
    ];
    expect(() => finalizeStage25LongFormProductEvidenceV1(dirty))
      .toThrow('STAGE25_LONG_FORM_PRODUCT_EVIDENCE_SOURCE_SCOPE_DIRTY_OR_EMPTY');

    const substituted = validInput();
    (substituted.localLongFormTrial as { receiptSha256: string }).receiptSha256 = 'f'.repeat(64);
    expect(() => finalizeStage25LongFormProductEvidenceV1(substituted))
      .toThrow('STAGE25_LONG_FORM_PRODUCT_EVIDENCE_LOCAL_TRIAL_RECEIPT_MISMATCH');

    const missingTest = validInput();
    (missingTest.ownerTests as { testFiles: readonly string[] }).testFiles =
      missingTest.ownerTests.testFiles.slice(1);
    expect(() => finalizeStage25LongFormProductEvidenceV1(missingTest))
      .toThrow('STAGE25_LONG_FORM_PRODUCT_EVIDENCE_OWNER_TEST_SET_MISMATCH');

    const failedTest = validInput();
    (failedTest.ownerTests as { failedTestCount: number }).failedTestCount = 1;
    expect(() => finalizeStage25LongFormProductEvidenceV1(failedTest))
      .toThrow('STAGE25_LONG_FORM_PRODUCT_EVIDENCE_OWNER_TEST_RESULT_INVALID');
  });

  it('rejects false live-Mongo cleanup and contradictory collection counts', () => {
    const cleanup = validInput();
    (cleanup.liveMongo as { postCleanupFixtureCount: number }).postCleanupFixtureCount = 1;
    expect(() => finalizeStage25LongFormProductEvidenceV1(cleanup))
      .toThrow('STAGE25_LONG_FORM_PRODUCT_EVIDENCE_LIVE_MONGO_FIXTURE_PROOF_INVALID');

    const counts = validInput();
    (counts.liveMongo as { videoAssetCount: number }).videoAssetCount =
      counts.liveMongo.mediaAssetCount + 1;
    expect(() => finalizeStage25LongFormProductEvidenceV1(counts))
      .toThrow('STAGE25_LONG_FORM_PRODUCT_EVIDENCE_LIVE_MONGO_COUNTS_CONTRADICTORY');

    const notWritable = validInput();
    (notWritable.liveMongo as { writablePrimary: boolean }).writablePrimary = false;
    expect(() => finalizeStage25LongFormProductEvidenceV1(notWritable))
      .toThrow('STAGE25_LONG_FORM_PRODUCT_EVIDENCE_LIVE_MONGO_NOT_WRITABLE');
  });

  it('rejects invented private storage and semantic evaluation claims', () => {
    const r2 = validInput();
    (r2.storage as { privatePtsR2: unknown }).privatePtsR2 = {
      disposition: 'REACHABLE_DEDICATED_PRIVATE_BUCKET',
      reason: 'MISSING_BUCKET_NAME',
    };
    expect(() => finalizeStage25LongFormProductEvidenceV1(r2))
      .toThrow('STAGE25_LONG_FORM_PRODUCT_EVIDENCE_PRIVATE_R2_STATUS_INVALID');

    const objectWrite = validInput();
    (objectWrite.storage as { objectWriteCount: number }).objectWriteCount = 1;
    expect(() => finalizeStage25LongFormProductEvidenceV1(objectWrite))
      .toThrow('STAGE25_LONG_FORM_PRODUCT_EVIDENCE_GENERIC_R2_STATUS_INVALID');

    const semantic = validInput();
    (semantic.semanticRetrieval as { judgedQueryCount: number }).judgedQueryCount = 1;
    expect(() => finalizeStage25LongFormProductEvidenceV1(semantic))
      .toThrow('STAGE25_LONG_FORM_PRODUCT_EVIDENCE_SEMANTIC_STATUS_INVALID');
  });

  it('rejects render source drift, malformed duration, and browser errors', () => {
    const drift = validInput();
    (drift.productionRender as unknown as { sourceCompatibilityChangedFiles: string[] })
      .sourceCompatibilityChangedFiles = ['sound-layer-content.tsx'];
    expect(() => finalizeStage25LongFormProductEvidenceV1(drift))
      .toThrow('STAGE25_LONG_FORM_PRODUCT_EVIDENCE_RENDER_SOURCE_DRIFT');

    const duration = validInput();
    (duration.productionRender as { sampleFrameCount: number }).sampleFrameCount = 14_399_999;
    expect(() => finalizeStage25LongFormProductEvidenceV1(duration))
      .toThrow('STAGE25_LONG_FORM_PRODUCT_EVIDENCE_RENDER_DISPOSITION_INVALID');

    const browser = validInput();
    (browser.productionRender as { browserErrorCount: number }).browserErrorCount = 1;
    expect(() => finalizeStage25LongFormProductEvidenceV1(browser))
      .toThrow('STAGE25_LONG_FORM_PRODUCT_EVIDENCE_RENDER_DISPOSITION_INVALID');
  });

  it('keeps the live operator outside provider, object-write, and project authority', () => {
    const source = readFileSync(path.join(
      process.cwd(),
      'tests/editron/helpers/stage25-long-form-product-evidence-operator-v1.ts',
    ), 'utf8');

    expect(source).toContain('runMediaSourcePtsCadenceMapAssetStoreV2');
    expect(source).toContain('HeadBucketCommand');
    expect(source).toContain('deleteOne({ assetId, userId })');
    for (const forbidden of [
      'generateContent(', 'generateEditronEmbedding(', 'searchUserAssets(',
      'PutObjectCommand', 'uploadToR2(', 'ProjectService', 'COLLECTIONS.PROJECTS',
    ]) expect(source).not.toContain(forbidden);
  });
});

function validInput(): Stage25LongFormProductEvidenceInputV1 {
  return structuredClone({
    source: {
      commitSha: 'a'.repeat(40), treeSha: 'b'.repeat(40),
      relevantScopeSha256: 'c'.repeat(64), relevantTrackedFileCount: 1_900,
      relevantStatusEntries: [],
    },
    generatedAt: '2026-08-27T00:00:00.000Z',
    localLongFormTrial: {
      receiptSha256: STAGE25_ACCEPTED_LONG_FORM_LOCAL_RECEIPT_SHA256_V1,
      receiptFileSha256: 'd'.repeat(64),
      assessment: 'PASS_LOCAL_LONG_FORM_MEDIA_AND_WINDOW_MECHANICS',
      proofCeiling: 'LOCAL_SYNTHETIC_LONG_DURATION_CONTAINER_AND_BOUNDED_WINDOW_EVIDENCE',
    },
    ownerTests: {
      reportSha256: 'e'.repeat(64),
      testFiles: [...STAGE25_LONG_FORM_PRODUCT_OWNER_TEST_FILES_V1],
      passedTestCount: 32, failedTestCount: 0,
    },
    liveMongo: {
      disposition: 'LIVE_MEDIA_ASSETS_V2_CAS_APPLIED_AND_CLEANED',
      topology: 'REPLICA_SET', writablePrimary: true,
      mediaAssetCount: 84, videoAssetCount: 35, ptsV2AssetCount: 0,
      semanticEmbeddingAssetCount: 3,
      fixtureAssetIdSha256: 'f'.repeat(64),
      initialStoreDisposition: 'APPLIED',
      staleStoreDisposition: 'EXPECTED_STATE_MISMATCH',
      persistedStateSha256: '1'.repeat(64),
      cleanupDeletedCount: 1, postCleanupFixtureCount: 0,
    },
    storage: {
      genericR2Bucket: { disposition: 'REACHABLE', reason: null },
      privatePtsR2: { disposition: 'NOT_CONFIGURED', reason: 'MISSING_ACCOUNT_ID' },
      objectWriteCount: 0,
    },
    semanticRetrieval: {
      selectedOwner: 'NEO4J_GRAPH_FILTERED_WITH_MONGO_FALLBACK',
      neo4jDisposition: 'UNAVAILABLE', mongoEmbeddingRecordCount: 3,
      judgedQueryCount: 0, providerEmbeddingCallCount: 0,
      accuracyDisposition: 'UNVERIFIABLE_NO_RIGHTS_CLEARED_QUERY_LABELS',
    },
    productionRender: {
      disposition: 'PASS_AUDIO_ONLY', canaryVersion: 'editron-long-form-render-canary-v1',
      executionSourceCommitSha: '2'.repeat(40), sourceCompatibilityChangedFiles: [],
      receiptFileSha256: '3'.repeat(64), wavFileSha256: '4'.repeat(64), pcmSha256: '5'.repeat(64),
      sampleRateHz: 48_000, channelCount: 2,
      sampleFrameCount: 14_400_000, expectedSampleFrameCount: 14_400_000,
      renderElapsedMs: 1_200_000, measuredDuckReductionDb: 11.5, browserErrorCount: 0,
    },
  } satisfies Stage25LongFormProductEvidenceInputV1);
}
