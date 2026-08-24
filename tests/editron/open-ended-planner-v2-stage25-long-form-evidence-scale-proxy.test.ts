import { readFileSync } from 'node:fs';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

import { hashEditronCanonicalJsonV1 }
  from '@/lib/editron/services/canonical-json-v1';
import {
  assertStage25LongFormEvidenceRangeRetrievalReceiptV1,
  createStage25LongFormEvidenceRangeRetrievalRequestV1,
  retrieveStage25LongFormEvidenceRangesV1,
  STAGE25_LONG_FORM_EVIDENCE_RANGE_RETRIEVAL_VERSION_V1,
  type Stage25LongFormEvidenceRangeRetrievalMaterialV1,
} from '@/lib/editron/research/open-ended-planner/stage25-long-form-evidence-range-retrieval-v1';
import { buildStage25LongFormEvidenceScaleProxyFixtureV1 }
  from '@/lib/editron/research/open-ended-planner/stage25-long-form-evidence-scale-proxy-fixture-v1';
import {
  assertStage25LongFormEvidenceScaleProxyV1,
  STAGE25_LONG_FORM_EVIDENCE_KINDS_V1,
  STAGE25_LONG_FORM_EVIDENCE_SCALE_PROXY_DURATION_US_V1,
  type Stage25LongFormEvidenceScaleProxyV1,
} from '@/lib/editron/research/open-ended-planner/stage25-long-form-evidence-scale-proxy-v1';

describe('Stage 2.5 long-form evidence-fabric scale proxy', () => {
  it('binds a complete 4.5-hour, seven-source professional identity inventory', () => {
    const inventory = buildStage25LongFormEvidenceScaleProxyFixtureV1();
    const identities = inventory.sources.map(({ identity }) => {
      if (identity.identityStatus !== 'QUALIFIED') throw new Error('TEST_IDENTITY_INVALID');
      return identity;
    });

    expect(inventory).toMatchObject({
      evidenceClass: 'SCALE_PROXY_ONLY',
      declaredSourceCount: 7,
      declaredSourceDurationUs: STAGE25_LONG_FORM_EVIDENCE_SCALE_PROXY_DURATION_US_V1,
      providerInferenceCalls: 0,
      networkCalls: 0,
      renderCalls: 0,
      canonicalProjectReads: 0,
      canonicalProjectMutations: 0,
      stateEffects: [],
    });
    expect(inventory.sources).toHaveLength(7);
    expect(inventory.coverageLedger).toHaveLength(7);
    expect(new Set(identities.map(({ media }) => media.assetId)).size).toBe(7);
    expect(new Set(identities.map(({ source }) => source.timebase.timebaseId)).size).toBe(7);
    expect(new Set(identities.map(({ source }) => source.reelTimecode.reelId)).size).toBe(7);
    expect(identities.map(({ source }) => source.cadence.kind)).toContain('VFR');
    expect(identities.map(({ source }) => JSON.stringify(
      source.cadence.kind === 'CFR'
        ? source.cadence.frameRate : source.cadence.nominalFrameRate,
    ))).toEqual(expect.arrayContaining([
      JSON.stringify({ numerator: '24000', denominator: '1001' }),
      JSON.stringify({ numerator: '30000', denominator: '1001' }),
      JSON.stringify({ numerator: '60000', denominator: '1001' }),
      JSON.stringify({ numerator: '25', denominator: '1' }),
    ]));
    expect(inventory.sources.flatMap(({ evidenceReferences }) => evidenceReferences))
      .toHaveLength(28);
    for (const source of inventory.sources) {
      expect(new Set(source.evidenceReferences.map(({ kind }) => kind)))
        .toEqual(new Set(STAGE25_LONG_FORM_EVIDENCE_KINDS_V1));
    }
    expect(Object.isFrozen(inventory)).toBe(true);
  });

  it('retrieves only exact bounded PTS windows and accounts every selected reference', () => {
    const inventory = buildStage25LongFormEvidenceScaleProxyFixtureV1();
    const receipt = retrieveStage25LongFormEvidenceRangesV1({
      inventory,
      request: createStage25LongFormEvidenceRangeRetrievalRequestV1(
        requestMaterial(inventory),
      ),
    });

    expect(receipt).toMatchObject({
      disposition: 'PASS_STRUCTURAL_SCALE_PROXY_ONLY',
      omissionLedger: [],
      contextBudget: {
        requestedRangeCount: 2,
        hydratedDurationUs: '90000000',
        selectedEvidenceRefs: 6,
        consumedContextTokens: 590,
        remainingContextTokens: 1410,
      },
      providerInferenceCalls: 0,
      networkCalls: 0,
      renderCalls: 0,
      canonicalProjectMutations: 0,
      stateEffects: [],
    });
    expect(receipt.selectedWindows).toHaveLength(2);
    expect(receipt.coverageLedger).toHaveLength(6);
    expect(Object.isFrozen(receipt.limitations)).toBe(true);
    expect(receipt.coverageLedger.every(({ status }) => status === 'COVERED')).toBe(true);
    expect(receipt.selectedWindows[1]).toMatchObject({
      sourceAssetId: 'source-phones-vfr',
      sourceRange: {
        coordinateDomain: 'SOURCE_PTS',
        startPts: '20000000',
        endExclusivePts: '50000000',
      },
      reelIdentity: { reelId: 'P001', dropFrame: true },
      cadence: { kind: 'VFR' },
    });
  });

  it('records omissions and refuses to call a partial context complete', () => {
    const inventory = buildStage25LongFormEvidenceScaleProxyFixtureV1();
    const material = requestMaterial(inventory);
    material.budget.maxEvidenceRefs = 2;
    material.budget.maxContextTokens = 250;
    const receipt = retrieveStage25LongFormEvidenceRangesV1({
      inventory,
      request: createStage25LongFormEvidenceRangeRetrievalRequestV1(material),
    });

    expect(receipt.disposition).toBe('UNVERIFIABLE_CONTEXT_BUDGET');
    expect(receipt.omissionLedger).toHaveLength(4);
    expect(receipt.contextBudget).toMatchObject({
      maxEvidenceRefs: 2,
      selectedEvidenceRefs: 2,
      maxContextTokens: 250,
      consumedContextTokens: 170,
    });
    expect(receipt.coverageLedger).toEqual(expect.arrayContaining([
      expect.objectContaining({ status: 'OMITTED_CONTEXT_TOKEN_BUDGET' }),
      expect.objectContaining({ status: 'OMITTED_EVIDENCE_REF_BUDGET' }),
    ]));
  });

  it('keeps tight-budget evidence selection stable across kind permutations', () => {
    const inventory = buildStage25LongFormEvidenceScaleProxyFixtureV1();
    const baseline = requestMaterial(inventory);
    baseline.budget.maxEvidenceRefs = 2;
    const permuted = structuredClone(baseline);
    permuted.ranges.forEach((range) => range.requiredEvidenceKinds.reverse());
    const baselineRequest = createStage25LongFormEvidenceRangeRetrievalRequestV1(baseline);
    const permutedRequest = createStage25LongFormEvidenceRangeRetrievalRequestV1(permuted);
    const left = retrieve(inventory, baseline);
    const right = retrieve(inventory, permuted);
    expect(permutedRequest.requestSha256).toBe(baselineRequest.requestSha256);
    expect(right.coverageLedger).toEqual(left.coverageLedger);
    expect(right.omissionLedger).toEqual(left.omissionLedger);
    expect(right.receiptSha256).toBe(left.receiptSha256);
  });

  it('uses explicit priority—not range array order—and rejects invalid priorities', () => {
    const inventory = buildStage25LongFormEvidenceScaleProxyFixtureV1();
    const baseline = requestMaterial(inventory);
    baseline.budget.maxEvidenceRefs = 3;
    const permuted = structuredClone(baseline);
    permuted.ranges.reverse();
    const baselineRequest = createStage25LongFormEvidenceRangeRetrievalRequestV1(baseline);
    const permutedRequest = createStage25LongFormEvidenceRangeRetrievalRequestV1(permuted);
    const left = retrieve(inventory, baseline);
    const right = retrieve(inventory, permuted);
    expect(permutedRequest.requestSha256).toBe(baselineRequest.requestSha256);
    expect(right.coverageLedger).toEqual(left.coverageLedger);
    expect(right.omissionLedger).toEqual(left.omissionLedger);
    expect(right.receiptSha256).toBe(left.receiptSha256);
    const duplicate = requestMaterial(inventory);
    duplicate.ranges[1].priorityOrdinal = 0;
    expect(() => createStage25LongFormEvidenceRangeRetrievalRequestV1(duplicate))
      .toThrow('STAGE25_LONG_FORM_EVIDENCE_RETRIEVAL_RANGE_PRIORITY_DUPLICATED');
    const gap = requestMaterial(inventory);
    gap.ranges[1].priorityOrdinal = 2;
    expect(() => createStage25LongFormEvidenceRangeRetrievalRequestV1(gap))
      .toThrow('STAGE25_LONG_FORM_EVIDENCE_RETRIEVAL_RANGE_PRIORITY_NOT_CONTIGUOUS');
  });

  it('fails closed when a required evidence kind is removed even after outer rehash', () => {
    const inventory = mutableInventory();
    const source = inventory.sources[0];
    source.evidenceReferences[3] = structuredClone(source.evidenceReferences[2]);

    expect(() => assertStage25LongFormEvidenceScaleProxyV1(rehashInventory(inventory)))
      .toThrow('STAGE25_LONG_FORM_EVIDENCE_SCALE_PROXY_SOURCE_EVIDENCE_KIND_SET_INCOMPLETE');
  });

  it('fails closed on a tampered evidence artifact or stale source version', () => {
    const inventory = mutableInventory();
    inventory.sources[0].evidenceReferences[0].artifactRef.artifactSha256 = '0'.repeat(64);
    expect(() => assertStage25LongFormEvidenceScaleProxyV1(rehashInventory(inventory)))
      .toThrow('STAGE25_LONG_FORM_EVIDENCE_SCALE_PROXY_EVIDENCE_REFERENCE_BINDING_INVALID');

    const valid = buildStage25LongFormEvidenceScaleProxyFixtureV1();
    const request = requestMaterial(valid);
    request.ranges[0].sourceVersionSha256 = '0'.repeat(64);
    expect(() => retrieveStage25LongFormEvidenceRangesV1({
      inventory: valid,
      request: createStage25LongFormEvidenceRangeRetrievalRequestV1(request),
    })).toThrow('STAGE25_LONG_FORM_EVIDENCE_RETRIEVAL_SOURCE_VERSION_STALE');
  });

  it('rejects unknown, out-of-bounds and duration-over-budget ranges', () => {
    const inventory = buildStage25LongFormEvidenceScaleProxyFixtureV1();
    const unknown = requestMaterial(inventory);
    unknown.ranges[0].sourceAssetId = 'source-forged';
    expect(() => retrieve(inventory, unknown)).toThrow(
      'STAGE25_LONG_FORM_EVIDENCE_RETRIEVAL_SOURCE_UNKNOWN:source-forged',
    );

    const outside = requestMaterial(inventory);
    outside.ranges[0].endExclusivePts = '1002000000';
    expect(() => retrieve(inventory, outside)).toThrow(
      'STAGE25_LONG_FORM_EVIDENCE_RETRIEVAL_SOURCE_RANGE_INVALID:range-camera-a',
    );

    const overBudget = requestMaterial(inventory);
    overBudget.budget.maxWindowDurationUs = '30000000';
    expect(() => retrieve(inventory, overBudget)).toThrow(
      'STAGE25_LONG_FORM_EVIDENCE_RETRIEVAL_WINDOW_DURATION_BUDGET_EXCEEDED',
    );
  });

  it('rejects an inventory-binding mismatch and a tampered receipt', () => {
    const inventory = buildStage25LongFormEvidenceScaleProxyFixtureV1();
    const material = requestMaterial(inventory);
    material.inventorySha256 = '0'.repeat(64);
    expect(() => retrieve(inventory, material)).toThrow(
      'STAGE25_LONG_FORM_EVIDENCE_RETRIEVAL_INVENTORY_BINDING_INVALID',
    );

    const receipt = structuredClone(
      retrieve(inventory, requestMaterial(inventory)),
    ) as unknown as Record<string, unknown>;
    receipt.disposition = 'UNVERIFIABLE_CONTEXT_BUDGET';
    expect(() => assertStage25LongFormEvidenceRangeRetrievalReceiptV1(receipt))
      .toThrow('STAGE25_LONG_FORM_EVIDENCE_RETRIEVAL_RECEIPT_HASH_INVALID');
  });

  it('rejects self-rehashed forged inner receipt accounting', () => {
    const inventory = buildStage25LongFormEvidenceScaleProxyFixtureV1();
    const valid = retrieve(inventory, requestMaterial(inventory));
    const forgeries: Array<Readonly<{
      code: string; mutate: (receipt: Record<string, unknown>) => void;
    }>> = [{
      code: 'RECEIPT_DISPOSITION_INVALID',
      mutate: (receipt) => { receipt.disposition = 'UNVERIFIABLE_CONTEXT_BUDGET'; },
    }, {
      code: 'RECEIPT_SELECTION_COVERAGE_INVALID',
      mutate: (receipt) => { (receipt.coverageLedger as unknown[]).pop(); },
    }, {
      code: 'RECEIPT_COVERAGE_TUPLE_DUPLICATED',
      mutate: (receipt) => {
        const ledger = receipt.coverageLedger as unknown[];
        ledger.push(structuredClone(ledger[0]));
      },
    }, {
      code: 'RECEIPT_SELECTED_REF_COUNT_INVALID',
      mutate: (receipt) => {
        (receipt.contextBudget as Record<string, unknown>).selectedEvidenceRefs = 5;
      },
    }, {
      code: 'RECEIPT_CONTEXT_TOKEN_ARITHMETIC_INVALID',
      mutate: (receipt) => {
        (receipt.contextBudget as Record<string, unknown>).remainingContextTokens = 1_409;
      },
    }, {
      code: 'RECEIPT_RANGE_COUNT_INVALID',
      mutate: (receipt) => {
        (receipt.contextBudget as Record<string, unknown>).requestedRangeCount = 1;
      },
    }, {
      code: 'RECEIPT_SCHEMA_INVALID',
      mutate: (receipt) => {
        receipt.limitations = ['REFERENCES_ONLY_NO_EVIDENCE_PAYLOADS_OR_MEDIA_BYTES',
          'FORGED_PRODUCTION_PROOF'];
      },
    }];
    for (const forgery of forgeries) {
      const receipt = structuredClone(valid) as unknown as Record<string, unknown>;
      forgery.mutate(receipt);
      expect(() => assertStage25LongFormEvidenceRangeRetrievalReceiptV1(
        rehashReceipt(receipt),
      ), forgery.code).toThrow(`STAGE25_LONG_FORM_EVIDENCE_RETRIEVAL_${forgery.code}`);
    }
  });

  it('keeps the slice free of provider, network, renderer and project mutation paths', () => {
    const directory = path.join(process.cwd(), 'lib/editron/research/open-ended-planner');
    const source = [
      'stage25-long-form-evidence-scale-proxy-v1.ts',
      'stage25-long-form-evidence-scale-proxy-fixture-v1.ts',
      'stage25-long-form-evidence-range-retrieval-v1.ts',
    ].map((file) => readFileSync(path.join(directory, file), 'utf8')).join('\n');
    for (const forbidden of [
      'fetch(', 'process.env', 'getDatabase', 'ProjectService', 'PlanService',
      'renderMedia(', 'generateContent(', 'saveProject(', 'updateProject(',
    ]) expect(source, forbidden).not.toContain(forbidden);
  });
});

function requestMaterial(
  inventory: Readonly<Stage25LongFormEvidenceScaleProxyV1>,
): Stage25LongFormEvidenceRangeRetrievalMaterialV1 {
  const source = (assetId: string) => inventory.sources.find(({ identity }) =>
    identity.identityStatus === 'QUALIFIED' && identity.media.assetId === assetId)!;
  return {
    version: STAGE25_LONG_FORM_EVIDENCE_RANGE_RETRIEVAL_VERSION_V1,
    authority: 'RESEARCH_BOUNDED_RETRIEVAL_ONLY',
    evidenceClass: 'SCALE_PROXY_ONLY',
    requestId: 'range-retrieval-01',
    inventorySha256: inventory.inventorySha256,
    ranges: [{
      rangeRequestId: 'range-camera-a', priorityOrdinal: 0,
      sourceAssetId: 'source-camera-a',
      sourceVersionSha256: source('source-camera-a').sourceVersionSha256,
      startPts: '10000000', endExclusivePts: '70000000',
      requiredEvidenceKinds: ['TRANSCRIPT', 'SHOT', 'AUDIO', 'RIGHTS'],
    }, {
      rangeRequestId: 'range-phone-vfr', priorityOrdinal: 1,
      sourceAssetId: 'source-phones-vfr',
      sourceVersionSha256: source('source-phones-vfr').sourceVersionSha256,
      startPts: '20000000', endExclusivePts: '50000000',
      requiredEvidenceKinds: ['SHOT', 'AUDIO'],
    }],
    budget: {
      maxRangeRequests: 4,
      maxWindowDurationUs: '120000000',
      maxTotalHydratedDurationUs: '240000000',
      maxEvidenceRefs: 8,
      maxContextTokens: 2_000,
    },
    stateEffects: [],
  };
}

function retrieve(
  inventory: Readonly<Stage25LongFormEvidenceScaleProxyV1>,
  material: Stage25LongFormEvidenceRangeRetrievalMaterialV1,
) {
  return retrieveStage25LongFormEvidenceRangesV1({
    inventory,
    request: createStage25LongFormEvidenceRangeRetrievalRequestV1(material),
  });
}

function mutableInventory(): Stage25LongFormEvidenceScaleProxyV1 {
  return structuredClone(buildStage25LongFormEvidenceScaleProxyFixtureV1());
}

function rehashInventory(
  inventory: Stage25LongFormEvidenceScaleProxyV1,
): Stage25LongFormEvidenceScaleProxyV1 {
  const { inventorySha256: _old, ...material } = inventory;
  return { ...material, inventorySha256: hashEditronCanonicalJsonV1(material) };
}

function rehashReceipt(receipt: Record<string, unknown>): Record<string, unknown> {
  const { receiptSha256: _old, ...material } = receipt;
  return { ...material, receiptSha256: hashEditronCanonicalJsonV1(material) };
}
