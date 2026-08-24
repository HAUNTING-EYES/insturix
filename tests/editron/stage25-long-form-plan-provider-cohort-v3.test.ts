import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';

import { describe, expect, it } from 'vitest';

import { CAP2_CURRENT_TRUTH_REISSUE_AUDIT_V7 }
  from '@/lib/editron/research/capability-census/cap2-current-truth-reissue-audit-v7';
import { hashCanonicalJsonV1 }
  from '@/lib/editron/research/open-ended-planner/contracts-v1';
import {
  assertStage25LongFormProviderCohortManifestV3,
  buildStage25LongFormProviderCohortManifestV3,
  STAGE25_LONG_FORM_PROVIDER_COHORT_PATH_V3,
} from '@/lib/editron/research/open-ended-planner/stage25-long-form-plan-provider-cohort-v3';

describe('Stage 2.5 long-form successor provider cohort V3', () => {
  it('binds the corrected V2 planning stack and current CAP truth without dispatch', () => {
    const manifest = buildManifest();
    expect(manifest.currentTruthBinding).toMatchObject({
      manifestSha256: CAP2_CURRENT_TRUTH_REISSUE_AUDIT_V7.manifestHash,
      runtimeAuthorityDenied: true,
    });
    expect(manifest.planningContractBinding).toMatchObject({
      holdoutVersion: 'EDITRON_STAGE25_LONG_FORM_PLAN_HOLDOUT_V2_1',
      proposalVersion: 'EDITRON_STAGE25_LONG_FORM_PLAN_PROPOSAL_V2_1',
      protocolVersion: 'EDITRON_STAGE25_LONG_FORM_PROVIDER_PROTOCOL_V2_1',
      compilerVersion: 'EDITRON_STAGE25_LONG_FORM_PLAN_COMPILER_V2_1',
      evaluatorVersion: 'EDITRON_STAGE25_LONG_FORM_PROVIDER_EVALUATOR_V2_1',
      proofCeiling: 'STRUCTURE_AND_PROVENANCE_ONLY',
    });
    expect(manifest.historicalEvidenceBinding).toMatchObject({
      paidCohortReceiptSha256:
        'ad64ab8d261dc90ca39d5a94679de036f4067b967eedc595d73e1c3fa1b342c3',
      historicalClaimsNotInherited: true,
    });
    expect(manifest.pilotRows).toHaveLength(3);
    expect(manifest.scoredRows).toHaveLength(9);
    expect(manifest.executionPolicy).toMatchObject({
      dispatchAuthorized: false,
      maximumAttemptsPerRow: 1,
      automaticRetry: false,
    });
    expect(manifest.stateEffects).toEqual([]);
    expect(assertStage25LongFormProviderCohortManifestV3(manifest)).toEqual(manifest);
  });

  it('uses one non-scored pilot per route and three scored presentations per route', () => {
    const manifest = buildManifest();
    const pilotIds = new Set(manifest.pilotRows.map(({ rowId }) => rowId));
    expect(manifest.scoredRows.some(({ rowId }) => pilotIds.has(rowId))).toBe(false);
    for (const route of manifest.routeSet) {
      const routeId = route.routeId;
      expect(manifest.pilotRows.filter((row) =>
        (row.route as Record<string, unknown>).routeId === routeId)).toHaveLength(1);
      expect(manifest.scoredRows.filter((row) =>
        (row.route as Record<string, unknown>).routeId === routeId)).toHaveLength(3);
    }
    expect(manifest.pilotRowSetSha256).toBe(hashCanonicalJsonV1(manifest.pilotRows));
    expect(manifest.scoredRowSetSha256).toBe(hashCanonicalJsonV1(manifest.scoredRows));
  });

  it('rejects a self-rehashed production authority forgery', () => {
    const forged = structuredClone(buildManifest()) as unknown as Record<string, unknown>;
    forged.authority = 'PRODUCTION';
    const { manifestSha256: _ignored, ...material } = forged;
    forged.manifestSha256 = hashCanonicalJsonV1(material);
    expect(() => assertStage25LongFormProviderCohortManifestV3(forged))
      .toThrow('STAGE25_LONG_FORM_COHORT_V3_MANIFEST_DRIFT');
  });
});

function buildManifest() {
  return buildStage25LongFormProviderCohortManifestV3({
    contractSourceSha256: createHash('sha256')
      .update(readFileSync(STAGE25_LONG_FORM_PROVIDER_COHORT_PATH_V3)).digest('hex'),
  });
}
