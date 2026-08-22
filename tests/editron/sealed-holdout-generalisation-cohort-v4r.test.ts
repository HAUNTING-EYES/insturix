import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';

import { beforeAll, describe, expect, it } from 'vitest';

import { hashCanonicalJsonV1 }
  from '@/lib/editron/research/open-ended-planner/contracts-v1';
import {
  assertSealedHoldoutGeneralisationManifestV4R,
  buildSealedHoldoutGeneralisationManifestV4R,
  SEALED_HOLDOUT_GENERALISATION_IMPLEMENTATION_PATHS_V4R,
  SEALED_HOLDOUT_GENERALISATION_PATH_V4R,
  SEALED_HOLDOUT_HISTORICAL_MATRIX_V4R,
  type SealedHoldoutGeneralisationManifestV4R,
} from '@/lib/editron/research/open-ended-planner/sealed-holdout-generalisation-cohort-v4r';
import {
  buildSealedHoldoutCohortManifestV2R,
  SEALED_HOLDOUT_COHORT_CONTRACT_PATH_V2R,
} from '@/lib/editron/research/open-ended-planner/sealed-holdout-cohort-v2r';
import {
  buildSealedHoldoutCohortManifestV3R,
  SEALED_HOLDOUT_COHORT_CONTRACT_PATH_V3R,
} from '@/lib/editron/research/open-ended-planner/sealed-holdout-cohort-v3r';
import {
  buildSealedHoldoutCohortManifestV3R2,
  SEALED_HOLDOUT_COHORT_CONTRACT_PATH_V3R2,
} from '@/lib/editron/research/open-ended-planner/sealed-holdout-cohort-v3r2';
import identity
  from '@/tests/fixtures/editron/open-ended-planner-v4/sealed-holdout-generalisation-identity-v4r.json';

type JsonRecord = Record<string, unknown>;
let manifest: Readonly<SealedHoldoutGeneralisationManifestV4R>;

beforeAll(async () => { manifest = await buildManifest(); });

describe('sealed Stage 2.5 generalisation cohort V4R', () => {
  it('freezes the corrected base, CAP V6, owners, routes and 45 no-dispatch rows', () => {
    expect(assertSealedHoldoutGeneralisationManifestV4R(manifest)).toBe(manifest);
    expect(manifest).toMatchObject({
      version: identity.version,
      contractSource: { sha256: identity.contractSourceSha256 },
      manifestSha256: identity.manifestSha256,
      rowSetSha256: identity.rowSetSha256,
      routeSetSha256: identity.routeSetSha256,
      implementationBindingsSha256: identity.implementationBindingsSha256,
      baseCohortIdentity: { manifestSha256: identity.baseManifestSha256 },
      cap2CurrentTruthBinding: { manifestSha256: identity.cap2ManifestSha256 },
      executionPolicy: { dispatchAuthorized: identity.dispatchAuthorized },
    });
    expect(manifest.caseSet).toHaveLength(identity.caseCount);
    expect(manifest.rows).toHaveLength(identity.rowCount);
    expect(manifest.caseSet).not.toContain('HOLD-03:C1');
    expect(manifest.caseSet).toContain('HOLD-03:C2');
  });

  it('records all 96 prior rows and does not mislabel the tasks as unseen', () => {
    expect(SEALED_HOLDOUT_HISTORICAL_MATRIX_V4R
      .reduce((sum, task) => sum + task.priorRowCount, 0)).toBe(96);
    expect(record(manifest.historicalEvidenceBinding)).toMatchObject({
      correction: 'THE_TASKS_ARE_PREVIOUSLY_EXECUTED_NOT_UNSEEN',
      sourceInterpretationReceiptSha256:
        '20b5e1c2f1e61c86f918b4894acaa34150faf57e23e86049a5d43cc2514dc01c',
      h03C1CurrentEvidenceReceiptSha256:
        '47a57bf2b46f8be3b1e0ec27d8d1f2b68cae2185508895393ef0a7cae76f60a2',
    });
    expect(SEALED_HOLDOUT_HISTORICAL_MATRIX_V4R.find(({ taskId }) => taskId === 'HOLD-06'))
      .toMatchObject({ dispositions: { VALID_MODEL_TRACE_FAILURE: 6,
        VALID_SAFE_STOP_PROOF: 6 }, nextQualification: 'CURRENT_CONTEXT_SAFETY_REPLICATION' });
  });

  it('balances providers, handoff modes and three presentation orders', () => {
    expect(count(manifest.rows, (row) => text(record(row.route).routeId))).toEqual({
      GOOGLE_FLASH: 15, OPENAI_LUNA: 15, OPENAI_TERRA: 15,
    });
    expect(count(manifest.rows, (row) => text(row.handoffMode))).toEqual({
      DIRECT_ARGUMENTS: 23, OPAQUE_RESULT_REFERENCES: 22,
    });
    expect(count(manifest.rows, (row) => text(row.orderId))).toEqual({
      ORDER_1: 15, ORDER_2: 15, ORDER_3: 15,
    });
    expect(manifest.rows.every((row) => Array.isArray(row.operatorOrder)
      && row.operatorOrder.length === 33)).toBe(true);
  });

  it('rejects recomputed CAP, implementation, case and row forgeries', () => {
    const forgeries = [
      (value: any) => { value.cap2CurrentTruthBinding.manifestSha256 = 'f'.repeat(64); },
      (value: any) => {
        value.implementationBindings[0].sha256 = 'e'.repeat(64);
        value.implementationBindingsSha256 = hashCanonicalJsonV1(value.implementationBindings);
      },
      (value: any) => { value.caseSet[0] = 'HOLD-99:C1'; },
      (value: any) => {
        value.rows[0].handoffMode = 'OPAQUE_RESULT_REFERENCES';
        value.rows[0].rowPlanSha256 = rehashRow(value.rows[0]);
        value.rowSetSha256 = hashCanonicalJsonV1(value.rows);
      },
    ];
    for (const mutate of forgeries) {
      const forged = structuredClone(manifest) as any;
      mutate(forged); rehashManifest(forged);
      expect(() => assertSealedHoldoutGeneralisationManifestV4R(forged)).toThrow();
    }
  });
});

async function buildManifest() {
  const v2 = buildSealedHoldoutCohortManifestV2R(
    await fileSha(SEALED_HOLDOUT_COHORT_CONTRACT_PATH_V2R));
  const v3 = buildSealedHoldoutCohortManifestV3R({
    contractSourceSha256: await fileSha(SEALED_HOLDOUT_COHORT_CONTRACT_PATH_V3R),
    baseManifest: v2,
  });
  const baseManifest = buildSealedHoldoutCohortManifestV3R2({
    contractSourceSha256: await fileSha(SEALED_HOLDOUT_COHORT_CONTRACT_PATH_V3R2),
    baseManifest: v3,
  });
  const implementationBindings = await Promise.all(
    SEALED_HOLDOUT_GENERALISATION_IMPLEMENTATION_PATHS_V4R.map(async (path) => ({
      path, sha256: await fileSha(path),
    })),
  );
  return buildSealedHoldoutGeneralisationManifestV4R({
    contractSourceSha256: await fileSha(SEALED_HOLDOUT_GENERALISATION_PATH_V4R),
    baseManifest, implementationBindings,
  });
}
async function fileSha(path: string): Promise<string> {
  return createHash('sha256').update(await readFile(path)).digest('hex');
}
function count(rows: readonly Readonly<JsonRecord>[], key: (row: Readonly<JsonRecord>) => string) {
  return Object.fromEntries([...new Set(rows.map(key))].sort()
    .map((value) => [value, rows.filter((row) => key(row) === value).length]));
}
function rehashRow(row: JsonRecord): string {
  const { rowPlanSha256: _old, ...material } = row;
  return hashCanonicalJsonV1(material);
}
function rehashManifest(value: any): void {
  const { manifestSha256: _old, ...material } = value;
  value.manifestSha256 = hashCanonicalJsonV1(material);
}
function record(value: unknown): JsonRecord {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as JsonRecord : {};
}
function text(value: unknown): string { return typeof value === 'string' ? value : ''; }
