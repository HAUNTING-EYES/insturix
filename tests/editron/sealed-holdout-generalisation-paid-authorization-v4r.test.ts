import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';

import { describe, expect, it } from 'vitest';

import { hashCanonicalJsonV1 }
  from '@/lib/editron/research/open-ended-planner/contracts-v1';
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
import {
  buildSealedHoldoutGeneralisationManifestV4R,
  SEALED_HOLDOUT_GENERALISATION_IMPLEMENTATION_PATHS_V4R,
  SEALED_HOLDOUT_GENERALISATION_PATH_V4R,
  type SealedHoldoutGeneralisationManifestV4R,
} from '@/lib/editron/research/open-ended-planner/sealed-holdout-generalisation-cohort-v4r';
import {
  assertSealedHoldoutGeneralisationPaidAuthorizationV4R,
  issueSealedHoldoutGeneralisationPaidAuthorizationV4R,
  SEALED_HOLDOUT_GENERALISATION_ZERO_INFERENCE_GATE_V4R,
} from '@/lib/editron/research/open-ended-planner/sealed-holdout-generalisation-paid-authorization-v4r';
import {
  SEALED_HOLDOUT_GENERALISATION_PREFLIGHT_VERSION_V4R,
  type SealedHoldoutGeneralisationPreflightReceiptV4R,
} from '@/lib/editron/research/open-ended-planner/sealed-holdout-generalisation-preflight-v4r';

async function fixtures() {
  const v2 = buildSealedHoldoutCohortManifestV2R(
    await fileSha(SEALED_HOLDOUT_COHORT_CONTRACT_PATH_V2R),
  );
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
      path,
      sha256: await fileSha(path),
    })),
  );
  const manifest = buildSealedHoldoutGeneralisationManifestV4R({
    contractSourceSha256: await fileSha(SEALED_HOLDOUT_GENERALISATION_PATH_V4R),
    baseManifest,
    implementationBindings,
  });
  return { manifest, baseManifest, preflight: syntheticPreflight(manifest) };
}

function syntheticPreflight(manifest: Readonly<SealedHoldoutGeneralisationManifestV4R>):
Readonly<SealedHoldoutGeneralisationPreflightReceiptV4R> {
  const checks = manifest.rows.map((row) => ({
    rowId: row.rowId,
    rowPlanSha256: row.rowPlanSha256,
    caseId: row.caseId,
    requestSha256: hashCanonicalJsonV1({ rowId: row.rowId }),
  }));
  const material = {
    version: SEALED_HOLDOUT_GENERALISATION_PREFLIGHT_VERSION_V4R,
    authority: 'RESEARCH_V4R_INITIAL_REQUESTS_NO_INFERENCE_NO_PROJECT_ACCESS' as const,
    generalisationManifestSha256: manifest.manifestSha256,
    baseManifestSha256: String(manifest.baseCohortIdentity.manifestSha256),
    cap2CurrentTruthManifestSha256: String(manifest.cap2CurrentTruthBinding.manifestSha256),
    rowSetSha256: manifest.rowSetSha256,
    routeSetSha256: manifest.routeSetSha256,
    egressAuthorizationSha256: '1'.repeat(64),
    modelMetadata: [],
    checks,
    requestCaptureSetSha256: hashCanonicalJsonV1(checks),
    googleCredentialSource: 'GOOGLE_GENERATIVE_AI_API_KEY' as const,
    networkCalls: {
      modelMetadataGets: 3 as const,
      googleCountTokensPosts: 15 as const,
      providerContextEgressCalls: 15 as const,
      inferenceCalls: 0 as const,
    },
    secretsPersisted: false as const,
    projectReads: 0 as const,
    projectMutations: 0 as const,
    runtimePerTurnTokenGuardRequired: true as const,
    realProofAdapterGate: 'PASS_CURRENT_PROOFS' as const,
    dispatchAuthorized: false as const,
    assessment: 'PASS_V4R_INITIAL_REQUESTS_BOUNDED_ZERO_INFERENCE' as const,
    stateEffects: [] as const,
  };
  return { ...material, receiptSha256: hashCanonicalJsonV1(material) };
}

function approval(preflight: Readonly<SealedHoldoutGeneralisationPreflightReceiptV4R>) {
  return {
    operatorId: 'admin',
    approvedAt: '2026-08-22T12:00:00.000Z',
    expiresAt: '2026-08-23T11:59:59.000Z',
    confirmedGeneralisationManifestSha256: preflight.generalisationManifestSha256,
    confirmedPreflightReceiptSha256: preflight.receiptSha256,
    confirmedRequestCaptureSetSha256: preflight.requestCaptureSetSha256,
    zeroInferenceGate: SEALED_HOLDOUT_GENERALISATION_ZERO_INFERENCE_GATE_V4R,
    maxSpendMicroUsdPerRow: 10_000_000,
    absoluteMaxCohortSpendMicroUsd: 75_000_000,
  } as const;
}

describe('sealed Stage 2.5 generalisation paid authorization V4R', () => {
  it('binds every current row, order, handoff, preflight and bounded network limit', async () => {
    const { manifest, baseManifest, preflight } = await fixtures();
    const authorization = issueSealedHoldoutGeneralisationPaidAuthorizationV4R({
      generalisationManifest: manifest,
      baseManifest,
      preflight,
      approval: approval(preflight),
    });
    expect(authorization).toMatchObject({
      generalisationManifestSha256: manifest.manifestSha256,
      rowSetSha256: manifest.rowSetSha256,
      preflightReceiptSha256: preflight.receiptSha256,
      projectReadsAuthorized: 0,
      projectMutationsAuthorized: 0,
      limits: {
        authorizedRows: 45,
        authorizedProviderTurns: 555,
        authorizedGoogleCountTokensCalls: 185,
        maxInputTokensPerTurn: 85_000,
        maxSpendMicroUsdPerRow: 10_000_000,
        absoluteMaxCohortSpendMicroUsd: 75_000_000,
      },
    });
    expect(authorization.authorizedRows).toHaveLength(45);
    expect(new Set(authorization.authorizedRows.map(({ rowAuthorizationSha256 }) =>
      rowAuthorizationSha256))).toHaveLength(45);
  });

  it('rejects stale preflight confirmation and a forged zero-inference gate', async () => {
    const { manifest, baseManifest, preflight } = await fixtures();
    expect(() => issueSealedHoldoutGeneralisationPaidAuthorizationV4R({
      generalisationManifest: manifest,
      baseManifest,
      preflight,
      approval: {
        ...approval(preflight),
        confirmedPreflightReceiptSha256: 'f'.repeat(64),
      },
    })).toThrow('SEALED_V4R_PAID_APPROVAL_INVALID');
    expect(() => issueSealedHoldoutGeneralisationPaidAuthorizationV4R({
      generalisationManifest: manifest,
      baseManifest,
      preflight,
      approval: {
        ...approval(preflight),
        zeroInferenceGate: {
          ...SEALED_HOLDOUT_GENERALISATION_ZERO_INFERENCE_GATE_V4R,
          passedTests: 6,
        } as unknown as typeof SEALED_HOLDOUT_GENERALISATION_ZERO_INFERENCE_GATE_V4R,
      },
    })).toThrow('SEALED_V4R_PAID_APPROVAL_INVALID');
  });

  it('rejects copied rows, excessive spend and expired authorization', async () => {
    const { manifest, baseManifest, preflight } = await fixtures();
    const authorization = issueSealedHoldoutGeneralisationPaidAuthorizationV4R({
      generalisationManifest: manifest,
      baseManifest,
      preflight,
      approval: approval(preflight),
    });
    const { authorizationSha256: _ignored, ...material } = authorization;
    const forged = { ...material, authorizedRows: material.authorizedRows.slice(1) };
    expect(() => assertSealedHoldoutGeneralisationPaidAuthorizationV4R({
      generalisationManifest: manifest,
      baseManifest,
      preflight,
      authorization: { ...forged, authorizationSha256: hashCanonicalJsonV1(forged) },
      now: '2026-08-22T13:00:00.000Z',
    })).toThrow('SEALED_V4R_PAID_AUTHORIZATION_INVALID');
    expect(() => assertSealedHoldoutGeneralisationPaidAuthorizationV4R({
      generalisationManifest: manifest,
      baseManifest,
      preflight,
      authorization,
      now: '2026-08-23T12:00:00.000Z',
    })).toThrow('SEALED_V4R_PAID_AUTHORIZATION_EXPIRED_OR_INVALID');
    expect(() => issueSealedHoldoutGeneralisationPaidAuthorizationV4R({
      generalisationManifest: manifest,
      baseManifest,
      preflight,
      approval: { ...approval(preflight), absoluteMaxCohortSpendMicroUsd: 400_000_000 },
    })).toThrow('SEALED_V4R_PAID_APPROVAL_INVALID');
  });
});

async function fileSha(filePath: string): Promise<string> {
  return createHash('sha256').update(await readFile(filePath)).digest('hex');
}
