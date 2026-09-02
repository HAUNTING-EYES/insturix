import { deepFreezeV1, hashCanonicalJsonV1 } from './contracts-v1';

export const STAGE25_LONG_FORM_PRODUCT_EVIDENCE_VERSION_V1 =
  'EDITRON_OE_STAGE25_LONG_FORM_PRODUCT_EVIDENCE_V1' as const;

export const STAGE25_LONG_FORM_PRODUCT_OWNER_TEST_FILES_V1 = [
  'tests/editron/media-source-pts-cadence-map-asset-owner-v2.test.ts',
  'tests/editron/media-proxy-master-transition-v1.test.ts',
  'tests/editron/video-source-time-transform-v1.test.ts',
  'tests/editron/project-video-speed-ramp-v1.test.ts',
  'tests/editron/long-form-render-canary.test.ts',
  'tests/editron/stage25-long-form-product-evidence-v1.test.ts',
] as const;

export const STAGE25_ACCEPTED_LONG_FORM_LOCAL_RECEIPT_SHA256_V1 =
  '59d943354a3a286b986b5b3df2d8cb2de2bb4038d0611b52681e511a34e03336' as const;

export interface Stage25LongFormProductEvidenceInputV1 {
  source: Readonly<{
    commitSha: string;
    treeSha: string;
    relevantScopeSha256: string;
    relevantTrackedFileCount: number;
    relevantStatusEntries: readonly string[];
  }>;
  generatedAt: string;
  localLongFormTrial: Readonly<{
    receiptSha256: string;
    receiptFileSha256: string;
    assessment: 'PASS_LOCAL_LONG_FORM_MEDIA_AND_WINDOW_MECHANICS';
    proofCeiling: 'LOCAL_SYNTHETIC_LONG_DURATION_CONTAINER_AND_BOUNDED_WINDOW_EVIDENCE';
  }>;
  ownerTests: Readonly<{
    reportSha256: string;
    testFiles: readonly string[];
    passedTestCount: number;
    failedTestCount: number;
  }>;
  liveMongo: Readonly<{
    disposition: 'LIVE_MEDIA_ASSETS_V2_CAS_APPLIED_AND_CLEANED';
    topology: 'REPLICA_SET' | 'OTHER';
    writablePrimary: boolean;
    mediaAssetCount: number;
    videoAssetCount: number;
    ptsV2AssetCount: number;
    semanticEmbeddingAssetCount: number;
    fixtureAssetIdSha256: string;
    initialStoreDisposition: 'APPLIED';
    staleStoreDisposition: 'EXPECTED_STATE_MISMATCH';
    persistedStateSha256: string;
    cleanupDeletedCount: 1;
    postCleanupFixtureCount: 0;
  }>;
  storage: Readonly<{
    genericR2Bucket: Readonly<{
      disposition: 'REACHABLE' | 'UNVERIFIABLE';
      reason: null | 'NOT_CONFIGURED' | 'ACCESS_DENIED' | 'UNAVAILABLE';
    }>;
    privatePtsR2: Readonly<
      | { disposition: 'REACHABLE_DEDICATED_PRIVATE_BUCKET'; reason: null }
      | {
          disposition: 'UNVERIFIABLE_CONFIGURED_PRIVATE_BUCKET';
          reason: 'ACCESS_DENIED' | 'UNAVAILABLE';
        }
      | {
          disposition: 'NOT_CONFIGURED';
          reason:
            | 'MISSING_ACCOUNT_ID'
            | 'INVALID_ACCOUNT_ID'
            | 'MISSING_ACCESS_KEY_ID'
            | 'MISSING_SECRET_ACCESS_KEY'
            | 'MISSING_BUCKET_NAME'
            | 'INVALID_OR_PUBLIC_BUCKET';
        }
    >;
    objectWriteCount: 0;
  }>;
  semanticRetrieval: Readonly<{
    selectedOwner: 'NEO4J_GRAPH_FILTERED_WITH_MONGO_FALLBACK';
    neo4jDisposition: 'AVAILABLE' | 'UNAVAILABLE';
    mongoEmbeddingRecordCount: number;
    judgedQueryCount: 0;
    providerEmbeddingCallCount: 0;
    accuracyDisposition: 'UNVERIFIABLE_NO_RIGHTS_CLEARED_QUERY_LABELS';
  }>;
  productionRender: Readonly<{
    disposition: 'PASS_AUDIO_ONLY';
    canaryVersion: 'editron-long-form-render-canary-v1';
    executionSourceCommitSha: string;
    sourceCompatibilityChangedFiles: readonly string[];
    receiptFileSha256: string;
    wavFileSha256: string;
    pcmSha256: string;
    sampleRateHz: 48_000;
    channelCount: 2;
    sampleFrameCount: 14_400_000;
    expectedSampleFrameCount: 14_400_000;
    renderElapsedMs: number;
    measuredDuckReductionDb: number;
    browserErrorCount: 0;
  }>;
}

export type Stage25LongFormProductEvidenceReceiptV1 = Readonly<
  ReturnType<typeof buildReceiptMaterial> & { receiptSha256: string }
>;

export function finalizeStage25LongFormProductEvidenceV1(
  input: Readonly<Stage25LongFormProductEvidenceInputV1>,
): Stage25LongFormProductEvidenceReceiptV1 {
  validateInput(input);
  const material = buildReceiptMaterial(input);
  return deepFreezeV1({
    ...material,
    receiptSha256: hashCanonicalJsonV1(material),
  }) as Stage25LongFormProductEvidenceReceiptV1;
}

function buildReceiptMaterial(input: Readonly<Stage25LongFormProductEvidenceInputV1>) {
  return {
    version: STAGE25_LONG_FORM_PRODUCT_EVIDENCE_VERSION_V1,
    artifactType: 'Stage25LongFormProductEvidenceReceiptV1' as const,
    authority: 'RESEARCH_COMPOSITION_OF_EXISTING_PRODUCT_OWNERS' as const,
    source: input.source,
    generatedAt: input.generatedAt,
    localLongFormTrial: input.localLongFormTrial,
    ownerTests: input.ownerTests,
    liveMongo: input.liveMongo,
    storage: input.storage,
    semanticRetrieval: input.semanticRetrieval,
    mixedRateProjectService: {
      exactSameRateCfr: 'SUPPORTED',
      mixedRateCfr: 'SAFE_STOP_SOURCE_PROJECT_RATE_MISMATCH',
      variableFrameRate: 'SAFE_STOP_SOURCE_EVENT_REBIND_UNSUPPORTED',
      fractionalProjectRate: 'SAFE_STOP_PROJECT_RATIONAL_TIMEBASE_REQUIRED',
      rationalPtsConsumer: 'MISSING',
    } as const,
    proxyMaster: {
      owner: 'lib/editron/services/media-proxy-master-transition-v1#runMediaProxyMasterTransitionV1',
      identityInvalidationTests: 'PASS',
      liveTransition: 'NOT_RUN_NO_ISOLATED_MASTER_OBJECT',
    } as const,
    productionRender: input.productionRender,
    providerInferenceCalls: 0 as const,
    providerEmbeddingCalls: 0 as const,
    cloudRenderCalls: 0 as const,
    r2ObjectWrites: 0 as const,
    canonicalProjectReads: 0 as const,
    canonicalProjectMutations: 0 as const,
    liveFixtureInsertCount: 1 as const,
    liveFixtureDeleteCount: 1 as const,
    nonFixtureMutationCount: 0 as const,
    assessment: 'MODIFY_LONG_FORM_PRODUCT_EVIDENCE_INCOMPLETE' as const,
    proofCeiling:
      'LIVE_ATLAS_CAS_GENERIC_R2_REACHABILITY_MIXED_RATE_SAFE_STOP_AND_LOCAL_PRODUCTION_AUDIO_RENDER' as const,
    unresolvedRequirements: [
      'REAL_RIGHTS_CLEARED_CREATIVE_MULTI_HOUR_MEDIA',
      'SEMANTIC_RETRIEVAL_ACCURACY',
      'DEDICATED_PRIVATE_PTS_STORAGE',
      'RATIONAL_MIXED_RATE_AND_VFR_PROJECTSERVICE_CONSUMPTION',
      'SOURCE_DISCONTINUITY_AND_EPOCH_SUPPORT',
      'LIVE_PROXY_MASTER_RELINK_AND_INVALIDATION',
      'PRODUCTION_VISUAL_PLAYBACK_DIRTY_RANGE_RENDER_DELIVERY_AND_RECOVERY',
      'PROVIDER_NATIVE_MULTIMODAL_TOKEN_ACCOUNTING',
    ] as const,
  };
}

function validateInput(input: Readonly<Stage25LongFormProductEvidenceInputV1>): void {
  sha(input.source.commitSha, 40, 'SOURCE_COMMIT_SHA_INVALID');
  sha(input.source.treeSha, 40, 'SOURCE_TREE_SHA_INVALID');
  sha(input.source.relevantScopeSha256, 64, 'SOURCE_SCOPE_SHA_INVALID');
  if (!Number.isSafeInteger(input.source.relevantTrackedFileCount)
    || input.source.relevantTrackedFileCount < 1
    || input.source.relevantStatusEntries.length > 0) fail('SOURCE_SCOPE_DIRTY_OR_EMPTY');
  if (!Number.isFinite(Date.parse(input.generatedAt))) fail('GENERATED_AT_INVALID');

  if (input.localLongFormTrial.receiptSha256
      !== STAGE25_ACCEPTED_LONG_FORM_LOCAL_RECEIPT_SHA256_V1) {
    fail('LOCAL_TRIAL_RECEIPT_MISMATCH');
  }
  if (input.localLongFormTrial.assessment !== 'PASS_LOCAL_LONG_FORM_MEDIA_AND_WINDOW_MECHANICS'
    || input.localLongFormTrial.proofCeiling
      !== 'LOCAL_SYNTHETIC_LONG_DURATION_CONTAINER_AND_BOUNDED_WINDOW_EVIDENCE') {
    fail('LOCAL_TRIAL_DISPOSITION_INVALID');
  }
  sha(input.localLongFormTrial.receiptFileSha256, 64, 'LOCAL_TRIAL_FILE_SHA_INVALID');
  sha(input.ownerTests.reportSha256, 64, 'OWNER_TEST_REPORT_SHA_INVALID');
  if (hashCanonicalJsonV1([...input.ownerTests.testFiles].sort())
      !== hashCanonicalJsonV1([...STAGE25_LONG_FORM_PRODUCT_OWNER_TEST_FILES_V1].sort())) {
    fail('OWNER_TEST_SET_MISMATCH');
  }
  if (!Number.isSafeInteger(input.ownerTests.passedTestCount)
    || input.ownerTests.passedTestCount < STAGE25_LONG_FORM_PRODUCT_OWNER_TEST_FILES_V1.length
    || input.ownerTests.failedTestCount !== 0) fail('OWNER_TEST_RESULT_INVALID');

  for (const count of [input.liveMongo.mediaAssetCount, input.liveMongo.videoAssetCount,
    input.liveMongo.ptsV2AssetCount, input.liveMongo.semanticEmbeddingAssetCount]) {
    nonNegativeInteger(count, 'LIVE_MONGO_COUNT_INVALID');
  }
  if (!input.liveMongo.writablePrimary) fail('LIVE_MONGO_NOT_WRITABLE');
  if (input.liveMongo.disposition !== 'LIVE_MEDIA_ASSETS_V2_CAS_APPLIED_AND_CLEANED'
    || input.liveMongo.initialStoreDisposition !== 'APPLIED'
    || input.liveMongo.staleStoreDisposition !== 'EXPECTED_STATE_MISMATCH'
    || input.liveMongo.cleanupDeletedCount !== 1
    || input.liveMongo.postCleanupFixtureCount !== 0) fail('LIVE_MONGO_FIXTURE_PROOF_INVALID');
  sha(input.liveMongo.fixtureAssetIdSha256, 64, 'LIVE_MONGO_FIXTURE_ID_SHA_INVALID');
  sha(input.liveMongo.persistedStateSha256, 64, 'LIVE_MONGO_STATE_SHA_INVALID');
  if (input.liveMongo.videoAssetCount > input.liveMongo.mediaAssetCount
    || input.liveMongo.ptsV2AssetCount > input.liveMongo.mediaAssetCount
    || input.liveMongo.semanticEmbeddingAssetCount > input.liveMongo.mediaAssetCount) {
    fail('LIVE_MONGO_COUNTS_CONTRADICTORY');
  }
  if ((input.storage.genericR2Bucket.disposition === 'REACHABLE')
      !== (input.storage.genericR2Bucket.reason === null)) fail('GENERIC_R2_STATUS_INVALID');
  if (!['REACHABLE', 'UNVERIFIABLE'].includes(input.storage.genericR2Bucket.disposition)
    || (input.storage.genericR2Bucket.reason !== null
      && !['NOT_CONFIGURED', 'ACCESS_DENIED', 'UNAVAILABLE']
        .includes(input.storage.genericR2Bucket.reason))
    || input.storage.objectWriteCount !== 0) fail('GENERIC_R2_STATUS_INVALID');
  const privateReason = input.storage.privatePtsR2.reason;
  if (input.storage.privatePtsR2.disposition === 'REACHABLE_DEDICATED_PRIVATE_BUCKET') {
    if (privateReason !== null) fail('PRIVATE_R2_STATUS_INVALID');
  } else if (input.storage.privatePtsR2.disposition
      === 'UNVERIFIABLE_CONFIGURED_PRIVATE_BUCKET') {
    if (!privateReason || !['ACCESS_DENIED', 'UNAVAILABLE'].includes(privateReason)) {
      fail('PRIVATE_R2_STATUS_INVALID');
    }
  } else if (input.storage.privatePtsR2.disposition === 'NOT_CONFIGURED') {
    if (!privateReason || ![
      'MISSING_ACCOUNT_ID', 'INVALID_ACCOUNT_ID', 'MISSING_ACCESS_KEY_ID',
      'MISSING_SECRET_ACCESS_KEY', 'MISSING_BUCKET_NAME', 'INVALID_OR_PUBLIC_BUCKET',
    ].includes(privateReason)) fail('PRIVATE_R2_STATUS_INVALID');
  } else fail('PRIVATE_R2_STATUS_INVALID');

  if (input.semanticRetrieval.selectedOwner !== 'NEO4J_GRAPH_FILTERED_WITH_MONGO_FALLBACK'
    || !['AVAILABLE', 'UNAVAILABLE'].includes(input.semanticRetrieval.neo4jDisposition)
    || input.semanticRetrieval.judgedQueryCount !== 0
    || input.semanticRetrieval.providerEmbeddingCallCount !== 0
    || input.semanticRetrieval.accuracyDisposition
      !== 'UNVERIFIABLE_NO_RIGHTS_CLEARED_QUERY_LABELS') fail('SEMANTIC_STATUS_INVALID');
  if (input.semanticRetrieval.mongoEmbeddingRecordCount
      !== input.liveMongo.semanticEmbeddingAssetCount) fail('SEMANTIC_MONGO_COUNT_MISMATCH');
  if (input.productionRender.disposition !== 'PASS_AUDIO_ONLY'
    || input.productionRender.canaryVersion !== 'editron-long-form-render-canary-v1'
    || input.productionRender.sampleRateHz !== 48_000
    || input.productionRender.channelCount !== 2
    || input.productionRender.sampleFrameCount !== 14_400_000
    || input.productionRender.expectedSampleFrameCount !== 14_400_000
    || input.productionRender.browserErrorCount !== 0) fail('RENDER_DISPOSITION_INVALID');
  sha(input.productionRender.executionSourceCommitSha, 40, 'RENDER_SOURCE_SHA_INVALID');
  if (input.productionRender.sourceCompatibilityChangedFiles.length > 0) {
    fail('RENDER_SOURCE_DRIFT');
  }
  for (const value of [input.productionRender.receiptFileSha256,
    input.productionRender.wavFileSha256, input.productionRender.pcmSha256]) {
    sha(value, 64, 'RENDER_SHA_INVALID');
  }
  if (!Number.isFinite(input.productionRender.renderElapsedMs)
    || input.productionRender.renderElapsedMs <= 0
    || !Number.isFinite(input.productionRender.measuredDuckReductionDb)
    || input.productionRender.measuredDuckReductionDb <= 0) fail('RENDER_MEASUREMENT_INVALID');
}

function sha(value: string, length: number, code: string): void {
  if (!new RegExp(`^[a-f0-9]{${length}}$`).test(value)) fail(code);
}
function nonNegativeInteger(value: number, code: string): void {
  if (!Number.isSafeInteger(value) || value < 0) fail(code);
}
function fail(code: string): never {
  throw new Error(`STAGE25_LONG_FORM_PRODUCT_EVIDENCE_${code}`);
}
