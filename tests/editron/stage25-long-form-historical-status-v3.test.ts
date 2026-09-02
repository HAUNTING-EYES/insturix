import { createHash } from 'node:crypto';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { resolve } from 'node:path';

import { afterEach, describe, expect, it, vi } from 'vitest';

import { issueStage25LongFormHistoricalStatusV3 }
  from '@/lib/editron/research/open-ended-planner/stage25-long-form-historical-status-v3';
import {
  buildStage25LongFormProviderCohortManifestV3,
  STAGE25_LONG_FORM_PROVIDER_COHORT_PATH_V3,
} from '@/lib/editron/research/open-ended-planner/stage25-long-form-plan-provider-cohort-v3';
import { issueStage25LongFormNoSpendReadinessV3 }
  from '@/lib/editron/research/open-ended-planner/stage25-long-form-no-spend-readiness-v3';
import { hashCanonicalJsonV1 }
  from '@/lib/editron/research/open-ended-planner/contracts-v1';

type JsonRecord = Record<string, unknown>;

const ROOT = resolve(
  '.calibration-temp/open-ended-planner-v2/',
  'stage25-long-form-provider-v2-20260824-phase2-5a38d083',
);
const HISTORICAL_MANIFEST = resolve(ROOT, 'provider-manifest-v2.json');
const HISTORICAL_COHORT = resolve(ROOT, 'paid-cohort-receipt-v2.json');
const EVENTS = resolve(ROOT, 'durable-events');
const artifactsAvailable = existsSync(HISTORICAL_MANIFEST)
  && existsSync(HISTORICAL_COHORT) && existsSync(EVENTS);
const artifactDescribe = artifactsAvailable ? describe : describe.skip;

afterEach(() => { vi.unstubAllGlobals(); });

artifactDescribe('Stage 2.5 long-form historical status V3', () => {
  it('separates original fairness from current V2 compatibility with zero inference', async () => {
    const fetchSpy = vi.fn(() => Promise.reject(new Error('network forbidden')));
    vi.stubGlobal('fetch', fetchSpy);
    const input = await fixture();
    const receipt = await issueStage25LongFormHistoricalStatusV3(input);

    expect(receipt.statusReceipt.counts.interpretationStatus).toEqual({
      FAIL_STRUCTURAL: 1,
      INVALID_BENCHMARK_CONFOUNDED: 6,
      PASS_STRUCTURAL_ONLY: 2,
    });
    expect(receipt.statusReceipt.rows.filter(({ interpretationStatus }) =>
      interpretationStatus === 'PASS_STRUCTURAL_ONLY').map(({ rowId }) => rowId)).toEqual([
      'GOOGLE_FLASH:P2', 'OPENAI_TERRA:P1',
    ]);
    expect(receipt.statusReceipt.rows.filter(({ interpretationStatus }) =>
      interpretationStatus === 'FAIL_STRUCTURAL').map(({ rowId }) => rowId)).toEqual([
      'OPENAI_LUNA:P3',
    ]);
    expect(receipt.currentCompatibilityCounts).toEqual({ FAIL_STRUCTURAL: 9 });
    expect(receipt.currentCompatibility.every(({ diagnostic }) => Boolean(diagnostic))).toBe(true);
    expect(receipt).toMatchObject({
      providerInferenceCalls: 0, networkCalls: 0, projectReads: 0,
      projectMutations: 0, mediaWrites: 0, stateEffects: [],
      assessment: 'ORIGINAL_FAIRNESS_AND_CURRENT_COMPATIBILITY_REPORTED_SEPARATELY',
    });
    expect(receipt.statusReceipt).toMatchObject({
      proofCeiling: 'STRUCTURAL', providerRankingAuthorized: false,
      reliabilityEstimateAuthorized: false, productionPromotionAuthorized: false,
    });
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('rejects a forged durable event or readiness receipt', async () => {
    const input = await fixture();
    const forgedEvents = structuredClone(input.historicalEvents) as JsonRecord[];
    forgedEvents[0].rowId = 'FORGED:P1';
    await expect(issueStage25LongFormHistoricalStatusV3({
      ...input, historicalEvents: forgedEvents,
    })).rejects.toThrow('STAGE25_LONG_FORM_HISTORICAL_STATUS_V3_EVENT_HASH_INVALID');

    const forgedReadiness = structuredClone(input.readinessReceipt) as JsonRecord;
    forgedReadiness.successorManifestSha256 = 'a'.repeat(64);
    await expect(issueStage25LongFormHistoricalStatusV3({
      ...input, readinessReceipt: forgedReadiness,
    })).rejects.toThrow('NO_SPEND_LANE_INTEGRITY_V2_RECEIPT_FORGED_OR_EXPECTATION_DRIFT');
  });

  it('rejects self-rehashed row accounting that disagrees with the frozen cohort', async () => {
    const input = await fixture();
    const forgedEvents = structuredClone(input.historicalEvents) as JsonRecord[];
    const event = forgedEvents[0];
    const row = record(record(event.state).completedRow);
    const accounting = record(row.accounting);
    accounting.providerInferenceCallsObserved = 0;
    accounting.observation = 'RECOVERED_UNKNOWN_DISPATCH_NO_RETRY';
    rehash(row, 'resultSha256');
    rehash(event, 'eventSha256');

    await expect(issueStage25LongFormHistoricalStatusV3({
      ...input, historicalEvents: forgedEvents,
    })).rejects.toThrow('STAGE25_LONG_FORM_HISTORICAL_STATUS_V3_COHORT_ROW_SET_DRIFT');
  });
});

async function fixture() {
  const successorManifest = buildStage25LongFormProviderCohortManifestV3({
    contractSourceSha256: fileSha(STAGE25_LONG_FORM_PROVIDER_COHORT_PATH_V3),
  });
  const readinessReceipt = await issueStage25LongFormNoSpendReadinessV3({
    manifest: successorManifest,
  });
  return {
    successorManifest,
    readinessReceipt,
    historicalManifest: readJson(HISTORICAL_MANIFEST),
    historicalCohortReceipt: readJson(HISTORICAL_COHORT),
    historicalEvents: readdirSync(EVENTS, { withFileTypes: true })
      .filter((entry) => entry.isDirectory())
      .map((entry) => resolve(EVENTS, entry.name, '0002-row.json'))
      .filter(existsSync)
      .sort()
      .map(readJson),
  };
}

function readJson(file: string): JsonRecord {
  return JSON.parse(readFileSync(file, 'utf8')) as JsonRecord;
}
function fileSha(file: string): string {
  return createHash('sha256').update(readFileSync(file)).digest('hex');
}
function record(value: unknown): JsonRecord {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as JsonRecord : {};
}
function rehash(value: JsonRecord, field: string): void {
  const material = { ...value };
  delete material[field];
  value[field] = hashCanonicalJsonV1(material);
}
