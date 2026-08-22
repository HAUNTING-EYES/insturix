import { beforeAll, describe, expect, it } from 'vitest';

import { hashCanonicalJsonV1 }
  from '@/lib/editron/research/open-ended-planner/contracts-v1';
import {
  assertSealedH03PaidAuthorizationV3R3,
  issueSealedH03PaidAuthorizationV3R3,
} from '@/lib/editron/research/open-ended-planner/sealed-holdout-h03-paid-authorization-v3r3';
import { buildSealedH03ProviderOperatorInputV3R3 }
  from '@/lib/editron/research/open-ended-planner/sealed-holdout-h03-provider-operator-input-v3r3';

type JsonRecord = Record<string, any>;

const now = Date.parse('2026-08-22T08:30:00.000Z');
const approvedAt = '2026-08-22T08:29:30.000Z';
const expiresAt = '2026-08-23T07:29:30.000Z';
const executionCommitSha = 'a'.repeat(40);
const runnerSourceSha256 = 'b'.repeat(64);
const sandboxEnvironment = {
  snapshotId: 'snap_AAAAAAAAAAAAAAAAAAAA',
  snapshotCommit: 'c'.repeat(40),
} as const;

let operatorInput: Awaited<ReturnType<typeof buildSealedH03ProviderOperatorInputV3R3>>;

beforeAll(async () => {
  operatorInput = await buildSealedH03ProviderOperatorInputV3R3();
});

describe('sealed H03 paid authorization V3R3', () => {
  it('authorizes exactly eighteen rows, fifty-four requests and $11.673', () => {
    const chain = preflightChain();
    const authorization = issue(chain);
    expect(authorization.authorizedRows).toHaveLength(18);
    expect(authorization.limits).toEqual({
      authorizedRowCount: 18,
      maximumProviderHttpRequests: 54,
      absoluteMaxSpendMicroUsd: 11_673_000,
    });
    expect(authorization.projectReadsAuthorized).toBe(0);
    expect(authorization.projectMutationsAuthorized).toBe(0);
    expect(assertSealedH03PaidAuthorizationV3R3(authorization, {
      manifest: operatorInput.cohortManifest,
      executionCommitSha,
      runnerSourceSha256,
      sandboxEnvironment,
      nowUnixMs: now,
    })).toBe(authorization);
  });

  it('rejects forged rows even when the authorization is rehashed', () => {
    const forged = structuredClone(issue(preflightChain())) as JsonRecord;
    forged.authorizedRows[0].rowId = 'forged-row';
    rehash(forged, 'authorizationSha256');
    expect(() => assertSealedH03PaidAuthorizationV3R3(forged, {
      manifest: operatorInput.cohortManifest,
      executionCommitSha,
      runnerSourceSha256,
      sandboxEnvironment,
      nowUnixMs: now,
    })).toThrow('SEALED_H03_PAID_AUTHORIZATION_DRIFT');
  });

  it('rejects a copied authorization against a different runtime snapshot', () => {
    const authorization = issue(preflightChain());
    expect(() => assertSealedH03PaidAuthorizationV3R3(authorization, {
      manifest: operatorInput.cohortManifest,
      executionCommitSha,
      runnerSourceSha256,
      sandboxEnvironment: {
        ...sandboxEnvironment,
        snapshotId: 'snap_BBBBBBBBBBBBBBBBBBBB',
      },
      nowUnixMs: now,
    })).toThrow('SEALED_H03_PAID_AUTHORIZATION_DRIFT');
  });

  it('rejects stale credentials, forged preflight and changed spend confirmation', () => {
    const stale = preflightChain();
    stale.infrastructure.sandboxCredential.expiresAtUnixSeconds = Math.floor(now / 1_000) + 60;
    resign(stale.infrastructure);
    rebuildDownstream(stale);
    expect(() => issue(stale)).toThrow('SEALED_H03_PAID_AUTHORIZATION_PREFLIGHT_CHAIN_INVALID');

    const forged = preflightChain();
    forged.h03.absoluteMaxSpendUsd = 99;
    resign(forged.h03);
    rebuildOperator(forged);
    expect(() => issue(forged)).toThrow('SEALED_H03_PAID_AUTHORIZATION_PREFLIGHT_CHAIN_INVALID');

    const valid = preflightChain();
    expect(() => issueSealedH03PaidAuthorizationV3R3({
      ...issueInput(valid),
      approval: { ...approval(valid), confirmedAbsoluteMaxSpendUsd: 99 as 11.673 },
      nowUnixMs: now,
    })).toThrow('SEALED_H03_PAID_AUTHORIZATION_APPROVAL_INVALID');
  });
});

function issue(chain: ReturnType<typeof preflightChain>) {
  return issueSealedH03PaidAuthorizationV3R3({
    ...issueInput(chain),
    approval: approval(chain),
    nowUnixMs: now,
  });
}

function issueInput(chain: ReturnType<typeof preflightChain>) {
  return {
    manifest: operatorInput.cohortManifest,
    providerInfrastructureReceipt: chain.infrastructure as any,
    h03PreflightReceipt: chain.h03 as any,
    operatorPreflightReceipt: chain.operator,
  };
}

function approval(chain: ReturnType<typeof preflightChain>) {
  return {
    operatorId: 'admin', approvedAt, expiresAt,
    confirmedManifestSha256: operatorInput.cohortManifest.manifestSha256,
    confirmedH03PreflightReceiptSha256: chain.h03.receiptSha256,
    confirmedOperatorPreflightReceiptSha256: chain.operator.receiptSha256,
    confirmedAbsoluteMaxSpendUsd: 11.673 as const,
    executionCommitSha,
    runnerSourceSha256,
    sandboxEnvironment,
  };
}

function preflightChain() {
  const infrastructure = sign({
    version: 'EDITRON_PROVIDER_NATIVE_NO_SPEND_PREFLIGHT_V2R_8',
    authority: 'RESEARCH_PREFLIGHT_NO_MODEL_INFERENCE_NO_PROJECT_MUTATION',
    manifestSha256: operatorInput.providerManifest.manifestSha256,
    checks: [], infrastructureAssessment: 'PASS', dispatchAssessment: 'PASS_READY',
    networkCalls: { modelMetadataGets: 3, googleCountTokensPosts: 6, inferenceCalls: 0 },
    sandboxCredential: {
      kind: 'VERCEL_OIDC',
      expiresAtUnixSeconds: Math.floor(now / 1_000) + 3_600,
      minimumRemainingSeconds: 300,
    },
    secretsPersisted: false, stateEffects: [],
  });
  const h03 = sign({
    version: 'EDITRON_OE_SEALED_H03_PROVIDER_PREFLIGHT_V3R3_1',
    authority: 'RESEARCH_PREFLIGHT_NO_MODEL_INFERENCE_NO_PROJECT_MUTATION',
    manifestSha256: operatorInput.cohortManifest.manifestSha256,
    providerInfrastructureReceiptSha256: infrastructure.receiptSha256,
    sourceRequest: {}, checks: [], plannedRowCount: 18, absoluteMaxSpendUsd: 11.673,
    infrastructureAssessment: 'PASS',
    dispatchAssessment: 'PASS_READY_FOR_EXPLICIT_SPEND_AUTHORIZATION',
    networkCalls: {
      inheritedModelMetadataGets: 3, inheritedGoogleCountTokensPosts: 6,
      h03GoogleCountTokensPosts: 1, inferenceCalls: 0,
    },
    secretsPersisted: false, stateEffects: [],
  });
  const operator = sign({
    version: 'EDITRON_OE_SEALED_H03_PROVIDER_OPERATOR_PREFLIGHT_V3R3_1',
    authority: 'OPERATOR_ZERO_INFERENCE_PREFLIGHT_NO_DISPATCH_NO_PROJECT_MUTATION',
    operatorId: 'admin', createdAt: '2026-08-22T08:20:00.000Z',
    implementationCommitSha: 'c'.repeat(40), runnerSourceSha256: 'd'.repeat(64),
    manifestSha256: operatorInput.cohortManifest.manifestSha256,
    absoluteMaxSpendUsd: 11.673,
    providerInfrastructureReceiptSha256: infrastructure.receiptSha256,
    h03PreflightReceiptSha256: h03.receiptSha256,
    dispatchAssessment: 'PASS_READY_FOR_EXPLICIT_SPEND_AUTHORIZATION',
    networkCalls: h03.networkCalls, dispatchAuthorized: false, inferenceCalls: 0,
    projectReads: 0, projectMutations: 0, secretsPersisted: false, stateEffects: [],
  });
  return { infrastructure, h03, operator };
}

function rebuildDownstream(chain: ReturnType<typeof preflightChain>): void {
  chain.h03.providerInfrastructureReceiptSha256 = chain.infrastructure.receiptSha256;
  resign(chain.h03);
  rebuildOperator(chain);
}
function rebuildOperator(chain: ReturnType<typeof preflightChain>): void {
  chain.operator.providerInfrastructureReceiptSha256 = chain.infrastructure.receiptSha256;
  chain.operator.h03PreflightReceiptSha256 = chain.h03.receiptSha256;
  resign(chain.operator);
}
function sign(material: JsonRecord): JsonRecord {
  return { ...material, receiptSha256: hashCanonicalJsonV1(material) };
}
function resign(value: JsonRecord): void { rehash(value, 'receiptSha256'); }
function rehash(value: JsonRecord, field: string): void {
  const material = { ...value };
  delete material[field];
  value[field] = hashCanonicalJsonV1(material);
}
