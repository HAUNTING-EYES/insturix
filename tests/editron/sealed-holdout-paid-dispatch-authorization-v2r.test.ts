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
  buildSealedHoldoutBenchmarkRoutesV2R,
  SEALED_HOLDOUT_CREDENTIAL_PREFLIGHT_VERSION_V2R,
  type SealedHoldoutCredentialPreflightReceiptV2R,
} from '@/lib/editron/research/open-ended-planner/sealed-holdout-credential-preflight-v2r';
import {
  assertSealedHoldoutPaidDispatchAuthorizationV2R,
  issueSealedHoldoutPaidDispatchAuthorizationV2R,
  SEALED_HOLDOUT_COMPLETE_ZERO_INFERENCE_GATE_V2R,
} from '@/lib/editron/research/open-ended-planner/sealed-holdout-paid-dispatch-authorization-v2r';

async function manifest() {
  const source = await readFile(SEALED_HOLDOUT_COHORT_CONTRACT_PATH_V2R);
  return buildSealedHoldoutCohortManifestV2R(
    createHash('sha256').update(source).digest('hex'),
  );
}

function credentialPreflight(
  cohort: Awaited<ReturnType<typeof manifest>>,
): Readonly<SealedHoldoutCredentialPreflightReceiptV2R> {
  const routes = buildSealedHoldoutBenchmarkRoutesV2R();
  const checks = cohort.cases.flatMap((taskCase) => routes.flatMap((route) => (
    ['DIRECT_ARGUMENTS', 'OPAQUE_RESULT_REFERENCES'] as const
  ).map((handoffMode) => {
    const captureId = `${taskCase.caseId}:${route.routeId}:${handoffMode}`;
    return {
      captureId,
      model: route.model,
      requestSha256: hashCanonicalJsonV1({ captureId }),
    };
  })));
  const material = {
    version: SEALED_HOLDOUT_CREDENTIAL_PREFLIGHT_VERSION_V2R,
    authority: 'RESEARCH_CREDENTIAL_PREFLIGHT_INITIAL_REQUESTS_NO_INFERENCE_NO_PROJECT_ACCESS' as const,
    manifestSha256: cohort.manifestSha256,
    localPreflightReceiptSha256: '1'.repeat(64),
    cap2CurrentTruthManifestSha256: String(cohort.cap2CurrentTruthBinding.manifestSha256),
    routeRosterSha256: hashCanonicalJsonV1(routes),
    egressAuthorizationSha256: '2'.repeat(64),
    modelMetadata: routes.map(({ routeId, model }) => ({ routeId, requestedModel: model })),
    checks,
    requestCaptureSetSha256: hashCanonicalJsonV1(checks),
    googleCredentialSource: 'GOOGLE_GENERATIVE_AI_API_KEY' as const,
    networkCalls: {
      modelMetadataGets: 3 as const,
      googleCountTokensPosts: 32 as const,
      providerContextEgressCalls: 32 as const,
      inferenceCalls: 0 as const,
    },
    secretsPersisted: false as const,
    projectReads: 0 as const,
    projectMutations: 0 as const,
    runtimePerTurnTokenGuardRequired: true as const,
    realProofAdapterGate: 'PENDING' as const,
    dispatchAuthorized: false as const,
    assessment: 'PASS_INITIAL_REQUESTS_BOUNDED_PROOF_AND_RUNTIME_GUARDS_PENDING' as const,
    stateEffects: [] as const,
  };
  return { ...material, receiptSha256: hashCanonicalJsonV1(material) };
}

function approval(credential: Readonly<SealedHoldoutCredentialPreflightReceiptV2R>) {
  return {
    operatorId: 'admin',
    approvedAt: '2026-08-22T01:00:00.000Z',
    expiresAt: '2026-08-23T00:59:59.000Z',
    confirmedCredentialPreflightReceiptSha256: credential.receiptSha256,
    confirmedRequestCaptureSetSha256: credential.requestCaptureSetSha256,
    zeroInferenceGate: SEALED_HOLDOUT_COMPLETE_ZERO_INFERENCE_GATE_V2R,
    maxSpendMicroUsdPerRow: 6_000_000,
    absoluteMaxCohortSpendMicroUsd: 75_000_000,
  } as const;
}

describe('sealed holdout paid dispatch authorization V2R', () => {
  it('binds the exact current cohort, preflight, gate, routes, arms and limits', async () => {
    const cohort = await manifest();
    const credential = credentialPreflight(cohort);
    const authorization = issueSealedHoldoutPaidDispatchAuthorizationV2R({
      manifest: cohort, credentialPreflight: credential, approval: approval(credential),
    });
    expect(authorization).toMatchObject({
      manifestSha256: cohort.manifestSha256,
      credentialPreflightReceiptSha256: credential.receiptSha256,
      projectReadsAuthorized: 0,
      projectMutationsAuthorized: 0,
      limits: {
        authorizedRows: 96,
        authorizedProviderTurns: 1296,
        authorizedGoogleCountTokensCalls: 432,
        maxInputTokensPerTurn: 85_000,
        maxSpendMicroUsdPerRow: 6_000_000,
        absoluteMaxCohortSpendMicroUsd: 75_000_000,
      },
    });
    expect(authorization.caseIds).toHaveLength(16);
    expect(authorization.routes).toHaveLength(3);
    expect(authorization.handoffModes).toHaveLength(2);
  });

  it('rejects a copied or stale credential-preflight confirmation', async () => {
    const cohort = await manifest();
    const credential = credentialPreflight(cohort);
    await expect(Promise.resolve().then(() => issueSealedHoldoutPaidDispatchAuthorizationV2R({
      manifest: cohort,
      credentialPreflight: credential,
      approval: { ...approval(credential), confirmedCredentialPreflightReceiptSha256: 'f'.repeat(64) },
    }))).rejects.toThrow('SEALED_PAID_DISPATCH_APPROVAL_INVALID');
  });

  it('rejects a forged zero-inference gate and an expired authorization', async () => {
    const cohort = await manifest();
    const credential = credentialPreflight(cohort);
    await expect(Promise.resolve().then(() => issueSealedHoldoutPaidDispatchAuthorizationV2R({
      manifest: cohort,
      credentialPreflight: credential,
      approval: {
        ...approval(credential),
        zeroInferenceGate: {
          ...SEALED_HOLDOUT_COMPLETE_ZERO_INFERENCE_GATE_V2R,
          passedTests: 33,
        } as unknown as typeof SEALED_HOLDOUT_COMPLETE_ZERO_INFERENCE_GATE_V2R,
      },
    }))).rejects.toThrow('SEALED_PAID_DISPATCH_APPROVAL_INVALID');
    const authorization = issueSealedHoldoutPaidDispatchAuthorizationV2R({
      manifest: cohort, credentialPreflight: credential, approval: approval(credential),
    });
    expect(() => assertSealedHoldoutPaidDispatchAuthorizationV2R({
      manifest: cohort,
      credentialPreflight: credential,
      authorization,
      now: '2026-08-23T01:00:00.000Z',
    })).toThrow('SEALED_PAID_DISPATCH_AUTHORIZATION_EXPIRED_OR_INVALID');
  });

  it('rejects a rehashed authorization with altered cases or spend', async () => {
    const cohort = await manifest();
    const credential = credentialPreflight(cohort);
    const authorization = issueSealedHoldoutPaidDispatchAuthorizationV2R({
      manifest: cohort, credentialPreflight: credential, approval: approval(credential),
    });
    const { authorizationSha256: _ignored, ...material } = authorization;
    const forged = {
      ...material,
      caseIds: material.caseIds.slice(1),
      limits: { ...material.limits, absoluteMaxCohortSpendMicroUsd: 299_000_000 },
    };
    expect(() => assertSealedHoldoutPaidDispatchAuthorizationV2R({
      manifest: cohort,
      credentialPreflight: credential,
      authorization: { ...forged, authorizationSha256: hashCanonicalJsonV1(forged) },
      now: '2026-08-22T02:00:00.000Z',
    })).toThrow('SEALED_PAID_DISPATCH_AUTHORIZATION_INVALID');
  });
});
