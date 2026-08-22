import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { beforeAll, describe, expect, it, vi } from 'vitest';

import { hashCanonicalJsonV1 }
  from '@/lib/editron/research/open-ended-planner/contracts-v1';
import { SEALED_H03_GENERATED_SOURCE_V2R }
  from '@/lib/editron/research/open-ended-planner/sealed-holdout-h03-generated-program-v2r';
import {
  assertSealedH03PaidAuthorizationV3R4,
  issueSealedH03PaidAuthorizationV3R4,
} from '@/lib/editron/research/open-ended-planner/sealed-holdout-h03-paid-authorization-v3r4';
import { runSealedH03ProviderCohortV3R4 }
  from '@/lib/editron/research/open-ended-planner/sealed-holdout-h03-provider-cohort-runner-v3r4';
import { buildSealedH03ProviderOperatorInputV3R4 }
  from '@/lib/editron/research/open-ended-planner/sealed-holdout-h03-provider-operator-input-v3r4';
import { createBudgetedH03SourceGeneratorV3R3 }
  from '@/lib/editron/research/open-ended-planner/sealed-holdout-h03-provider-row-runner-v3r3';

type OperatorInput = Awaited<ReturnType<typeof buildSealedH03ProviderOperatorInputV3R4>>;
type JsonRecord = Record<string, any>;
let operatorInput: OperatorInput;
const NOW = '2026-08-22T08:30:00.000Z';
const NOW_MS = Date.parse(NOW);
const EXECUTION_COMMIT = 'a'.repeat(40);
const RUNNER_SHA = 'b'.repeat(64);
const SANDBOX = { snapshotId: 'snap_AAAAAAAAAAAAAAAAAAAA',
  snapshotCommit: 'c'.repeat(40) } as const;

beforeAll(async () => { operatorInput = await buildSealedH03ProviderOperatorInputV3R4(); });

describe('sealed H03 V3R4 paid authorization', () => {
  it('authorizes exactly eighteen rows, fifty-four requests and $11.673', () => {
    const authorization = issue(preflightChain());
    expect(authorization.limits).toEqual({ authorizedRowCount: 18,
      maximumProviderHttpRequests: 54, absoluteMaxSpendMicroUsd: 11_673_000 });
    expect(authorization.projectReadsAuthorized).toBe(0);
    expect(authorization.projectMutationsAuthorized).toBe(0);
    expect(assertSealedH03PaidAuthorizationV3R4(authorization, {
      manifest: operatorInput.cohortManifest, executionCommitSha: EXECUTION_COMMIT,
      runnerSourceSha256: RUNNER_SHA, sandboxEnvironment: SANDBOX,
      nowUnixMs: NOW_MS,
    })).toBe(authorization);
  });

  it('rejects recomputed row, snapshot, preflight and spend forgery', () => {
    const forgedRow = structuredClone(issue(preflightChain())) as JsonRecord;
    forgedRow.authorizedRows[0].rowId = 'forged';
    resign(forgedRow, 'authorizationSha256');
    expect(() => assertSealedH03PaidAuthorizationV3R4(forgedRow, {
      manifest: operatorInput.cohortManifest, executionCommitSha: EXECUTION_COMMIT,
      runnerSourceSha256: RUNNER_SHA, sandboxEnvironment: SANDBOX, nowUnixMs: NOW_MS,
    })).toThrow('SEALED_H03_V3R4_PAID_AUTHORIZATION_DRIFT');

    expect(() => assertSealedH03PaidAuthorizationV3R4(issue(preflightChain()), {
      manifest: operatorInput.cohortManifest, executionCommitSha: EXECUTION_COMMIT,
      runnerSourceSha256: RUNNER_SHA,
      sandboxEnvironment: { ...SANDBOX, snapshotId: 'snap_BBBBBBBBBBBBBBBBBBBB' },
      nowUnixMs: NOW_MS,
    })).toThrow('SEALED_H03_V3R4_PAID_AUTHORIZATION_DRIFT');

    const stale = preflightChain();
    stale.infrastructure.sandboxCredential.expiresAtUnixSeconds = Math.floor(NOW_MS / 1_000) + 60;
    resign(stale.infrastructure); rebuildDownstream(stale);
    expect(() => issue(stale))
      .toThrow('SEALED_H03_V3R4_PAID_AUTHORIZATION_PREFLIGHT_CHAIN_INVALID');

    const valid = preflightChain();
    expect(() => issueSealedH03PaidAuthorizationV3R4({
      ...issueInput(valid), approval: { ...approval(valid),
        confirmedAbsoluteMaxSpendUsd: 99 as 11.673 }, nowUnixMs: NOW_MS,
    })).toThrow('SEALED_H03_V3R4_PAID_AUTHORIZATION_APPROVAL_INVALID');
  });
});

describe('sealed H03 V3R4 row and cohort execution', () => {
  it('reuses the bound row owner with exact accounting and repair limits', async () => {
    const call = vi.fn(async () => acceptedCall());
    const production = budget('PRODUCTION_BUDGET', call);
    const result = await production.generateSource(initialRequest());
    expect(result).toMatchObject({ source: SEALED_H03_GENERATED_SOURCE_V2R,
      modelId: 'gpt-5.6-luna',
      orchestratorSpecSha256: operatorInput.sourceRequest.orchestratorSpecSha256 });
    expect(production.snapshot()).toMatchObject({ providerGeneratedCandidates: 1,
      providerHttpAttempts: 1, actualSpendUsd: 0.001,
      accountingDisposition: 'EXACT_FROM_PROVIDER_RECEIPTS' });

    const forbidden = vi.fn();
    await expect(budget('PRODUCTION_BUDGET', forbidden).generateSource({
      candidateOrdinal: 1, repair: { repairOrdinal: 1 },
    } as never)).rejects.toThrow('SEALED_H03_ARM_BUDGET_EXHAUSTED_BEFORE_PROVIDER');
    expect(forbidden).not.toHaveBeenCalled();
  });

  it('rejects absent authorization and a runtime snapshot mismatch before rows', async () => {
    await expect(runSealedH03ProviderCohortV3R4({
      ...operatorInput, authorization: {} as never, environment: {},
      mediaManifest: { manifestSha256: 'f'.repeat(64) } as never,
      outputRoot: 'must-not-be-created-v3r4', executionCommitSha: EXECUTION_COMMIT,
      runnerSourceSha256: RUNNER_SHA, sandboxEnvironment: SANDBOX,
      repoRoot: process.cwd(), now: () => NOW,
    })).rejects.toThrow('SEALED_H03_V3R4_PAID_AUTHORIZATION_DRIFT');

    const runRow = vi.fn();
    await expect(runSealedH03ProviderCohortV3R4({
      ...operatorInput, authorization: issue(preflightChain()), environment: {},
      mediaManifest: { manifestSha256: 'f'.repeat(64) } as never,
      outputRoot: 'must-not-be-created-v3r4-snapshot', executionCommitSha: EXECUTION_COMMIT,
      runnerSourceSha256: RUNNER_SHA,
      sandboxEnvironment: { ...SANDBOX, snapshotId: 'snap_BBBBBBBBBBBBBBBBBBBB' },
      repoRoot: process.cwd(), now: () => NOW, runRow: runRow as never,
    })).rejects.toThrow('SEALED_H03_V3R4_PAID_AUTHORIZATION_DRIFT');
    expect(runRow).not.toHaveBeenCalled();
  });

  it('persists all eighteen bounded row receipts and cohort accounting', async () => {
    const root = await mkdtemp(join(tmpdir(), 'editron-h03-v3r4-'));
    try {
      const runRow = vi.fn(async ({ row }: { row: { rowId: string } }) => ({
        receipt: { disposition: 'PROOF_UNVERIFIABLE',
          failureDiagnostic: `proof:${row.rowId}`,
          receiptSha256: hashCanonicalJsonV1({ rowId: row.rowId }),
          accounting: { accountingDisposition: 'EXACT_FROM_PROVIDER_RECEIPTS',
            actualSpendUsd: 0.001, providerGeneratedCandidates: 1,
            providerHttpAttempts: 1 } },
        providerCalls: [], proof: null,
      }));
      const receipt = await runSealedH03ProviderCohortV3R4({
        ...operatorInput, authorization: issue(preflightChain()), environment: {},
        mediaManifest: { manifestSha256: 'f'.repeat(64) } as never,
        outputRoot: root, executionCommitSha: EXECUTION_COMMIT,
        runnerSourceSha256: RUNNER_SHA, sandboxEnvironment: SANDBOX,
        repoRoot: process.cwd(), now: () => NOW, runRow: runRow as never,
      });
      expect(receipt).toMatchObject({ rowCount: 18, projectReads: 0,
        projectMutations: 0, accounting: { knownActualSpendUsd: 0.018 } });
      expect(runRow).toHaveBeenCalledTimes(18);
      const source = await readJson(join(root, 'rows',
        'openai_luna-production_budget-r1', 'source-row-receipt.json'));
      expect(source.failureDiagnostic).toBe('proof:openai_luna-production_budget-r1');
    } finally { await rm(root, { recursive: true, force: true }); }
  });
});

function issue(chain: ReturnType<typeof preflightChain>) {
  return issueSealedH03PaidAuthorizationV3R4({ ...issueInput(chain),
    approval: approval(chain), nowUnixMs: NOW_MS });
}
function issueInput(chain: ReturnType<typeof preflightChain>) {
  return { manifest: operatorInput.cohortManifest,
    providerInfrastructureReceipt: chain.infrastructure as any,
    h03PreflightReceipt: chain.h03 as any, operatorPreflightReceipt: chain.operator };
}
function approval(chain: ReturnType<typeof preflightChain>) {
  return { operatorId: 'admin', approvedAt: '2026-08-22T08:29:30.000Z',
    expiresAt: '2026-08-23T07:29:30.000Z',
    confirmedManifestSha256: operatorInput.cohortManifest.manifestSha256,
    confirmedH03PreflightReceiptSha256: chain.h03.receiptSha256,
    confirmedOperatorPreflightReceiptSha256: chain.operator.receiptSha256,
    confirmedAbsoluteMaxSpendUsd: 11.673 as const,
    executionCommitSha: EXECUTION_COMMIT, runnerSourceSha256: RUNNER_SHA,
    sandboxEnvironment: SANDBOX };
}
function preflightChain() {
  const infrastructure = sign({ infrastructureAssessment: 'PASS',
    dispatchAssessment: 'PASS_READY', networkCalls: { inferenceCalls: 0 },
    secretsPersisted: false, stateEffects: [], sandboxCredential: {
      expiresAtUnixSeconds: Math.floor(NOW_MS / 1_000) + 3_600 } });
  const h03 = sign({ version: 'EDITRON_OE_SEALED_H03_PROVIDER_PREFLIGHT_V3R4_1',
    manifestSha256: operatorInput.cohortManifest.manifestSha256,
    providerInfrastructureReceiptSha256: infrastructure.receiptSha256,
    infrastructureAssessment: 'PASS',
    dispatchAssessment: 'PASS_READY_FOR_EXPLICIT_SPEND_AUTHORIZATION',
    plannedRowCount: 18, absoluteMaxSpendUsd: 11.673,
    networkCalls: { inferenceCalls: 0 }, secretsPersisted: false, stateEffects: [] });
  const operator = sign({
    version: 'EDITRON_OE_SEALED_H03_PROVIDER_OPERATOR_PREFLIGHT_V3R4_1',
    operatorId: 'admin', createdAt: '2026-08-22T08:20:00.000Z',
    manifestSha256: operatorInput.cohortManifest.manifestSha256,
    providerInfrastructureReceiptSha256: infrastructure.receiptSha256,
    h03PreflightReceiptSha256: h03.receiptSha256, dispatchAuthorized: false,
    inferenceCalls: 0, projectReads: 0, projectMutations: 0,
    absoluteMaxSpendUsd: 11.673, secretsPersisted: false, stateEffects: [] });
  return { infrastructure, h03, operator };
}
function rebuildDownstream(chain: ReturnType<typeof preflightChain>): void {
  chain.h03.providerInfrastructureReceiptSha256 = chain.infrastructure.receiptSha256;
  resign(chain.h03); chain.operator.providerInfrastructureReceiptSha256 = chain.infrastructure.receiptSha256;
  chain.operator.h03PreflightReceiptSha256 = chain.h03.receiptSha256; resign(chain.operator);
}
function sign(value: JsonRecord): JsonRecord {
  return { ...value, receiptSha256: hashCanonicalJsonV1(value) };
}
function resign(value: JsonRecord, field = 'receiptSha256'): void {
  const material = { ...value }; delete material[field]; value[field] = hashCanonicalJsonV1(material);
}
function budget(armId: 'PRODUCTION_BUDGET' | 'CAPABILITY_CEILING', runProviderCall: unknown) {
  const arm = operatorInput.cohortManifest.budgetArms.find((entry) => entry.armId === armId);
  if (!arm) throw new Error(`test arm missing: ${armId}`);
  return createBudgetedH03SourceGeneratorV3R3({ arm,
    routeEntry: operatorInput.providerManifest.routes[0],
    environment: { OPENAI_API_KEY: 'test-key' }, runProviderCall: runProviderCall as never });
}
function initialRequest() {
  return { route: operatorInput.providerManifest.routes[0].route,
    packet: operatorInput.sourceRequest.packet, arguments: operatorInput.sourceRequest.arguments,
    orchestratorSpecSha256: operatorInput.sourceRequest.orchestratorSpecSha256,
    candidateOrdinal: 0 as const };
}
function acceptedCall() {
  return { run: { disposition: 'ARTIFACT_ACCEPTED',
    artifact: { source: SEALED_H03_GENERATED_SOURCE_V2R }, attempts: [{
      disposition: 'ARTIFACT_ACCEPTED', promptHash: 'b'.repeat(64),
      providerModel: 'gpt-5.6-luna', providerCostUsd: 0.001 }] }, preflightCounts: [] };
}
async function readJson(filePath: string): Promise<Record<string, unknown>> {
  return JSON.parse(await readFile(filePath, 'utf8')) as Record<string, unknown>;
}
