import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { beforeAll, describe, expect, it, vi } from 'vitest';

import { hashCanonicalJsonV1 }
  from '@/lib/editron/research/open-ended-planner/contracts-v1';
import { SEALED_H03_GENERATED_SOURCE_V2R }
  from '@/lib/editron/research/open-ended-planner/sealed-holdout-h03-generated-program-v2r';
import { issueSealedH03PaidAuthorizationV3R3 }
  from '@/lib/editron/research/open-ended-planner/sealed-holdout-h03-paid-authorization-v3r3';
import { runSealedH03ProviderCohortV3R3 }
  from '@/lib/editron/research/open-ended-planner/sealed-holdout-h03-provider-cohort-runner-v3r3';
import { buildSealedH03ProviderOperatorInputV3R3 }
  from '@/lib/editron/research/open-ended-planner/sealed-holdout-h03-provider-operator-input-v3r3';
import { createBudgetedH03SourceGeneratorV3R3 }
  from '@/lib/editron/research/open-ended-planner/sealed-holdout-h03-provider-row-runner-v3r3';

type OperatorInput = Awaited<ReturnType<typeof buildSealedH03ProviderOperatorInputV3R3>>;
let operatorInput: OperatorInput;

beforeAll(async () => {
  operatorInput = await buildSealedH03ProviderOperatorInputV3R3();
});

describe('sealed H03 provider row/cohort runner V3R3', () => {
  it('records one accepted production candidate from the exact owner-bound request', async () => {
    const runProviderCall = vi.fn(async () => acceptedCall());
    const budgeted = budget('PRODUCTION_BUDGET', runProviderCall);
    const result = await budgeted.generateSource(initialRequest());
    expect(result).toMatchObject({
      source: SEALED_H03_GENERATED_SOURCE_V2R,
      modelId: 'gpt-5.6-luna',
      orchestratorSpecSha256: operatorInput.sourceRequest.orchestratorSpecSha256,
    });
    expect(runProviderCall).toHaveBeenCalledTimes(1);
    expect(budgeted.snapshot()).toMatchObject({
      providerGeneratedCandidates: 1,
      providerHttpAttempts: 1,
      actualSpendUsd: 0.001,
      accountingDisposition: 'EXACT_FROM_PROVIDER_RECEIPTS',
      indeterminateProviderFailures: [],
    });
  });

  it('blocks a production repair before dispatch and reserves failed transport attempts', async () => {
    const forbiddenProviderCall = vi.fn();
    const production = budget('PRODUCTION_BUDGET', forbiddenProviderCall);
    await expect(production.generateSource({
      candidateOrdinal: 1,
      repair: { repairOrdinal: 1 },
    } as never)).rejects.toThrow('SEALED_H03_ARM_BUDGET_EXHAUSTED_BEFORE_PROVIDER');
    expect(forbiddenProviderCall).not.toHaveBeenCalled();

    const transportFailure = vi.fn(async () => {
      throw new Error('provider connection failed');
    });
    const capability = budget('CAPABILITY_CEILING', transportFailure);
    await expect(capability.generateSource(initialRequest())).rejects.toThrow(
      'provider connection failed',
    );
    expect(capability.snapshot()).toMatchObject({
      providerGeneratedCandidates: 1,
      providerHttpAttempts: 2,
      actualSpendUsd: 0,
      accountingDisposition: 'MAXIMUM_HTTP_ATTEMPTS_RESERVED_FOR_INDETERMINATE_PROVIDER_FAILURE',
    });
  });

  it('rejects missing paid authorization before creating a cohort run', async () => {
    await expect(runSealedH03ProviderCohortV3R3({
      ...operatorInput,
      authorization: {} as never,
      environment: {},
      mediaManifest: { manifestSha256: 'f'.repeat(64) } as never,
      outputRoot: 'must-not-be-created',
      executionCommitSha: 'a'.repeat(40),
      runnerSourceSha256: 'b'.repeat(64),
      sandboxEnvironment: { snapshotId: 'snapshot', snapshotCommit: 'commit' },
      repoRoot: process.cwd(),
    })).rejects.toThrow('SEALED_H03_PAID_AUTHORIZATION_DRIFT');
  });

  it('persists the inner source receipt and proof diagnostic for every completed row', async () => {
    const root = await mkdtemp(join(tmpdir(), 'editron-h03-v3r3-'));
    try {
      const runRow = vi.fn(async ({ row }: { row: { rowId: string } }) => ({
        receipt: {
          disposition: 'PROOF_UNVERIFIABLE', failureDiagnostic: `proof:${row.rowId}`,
          receiptSha256: hashCanonicalJsonV1({ rowId: row.rowId }),
          accounting: {
            accountingDisposition: 'EXACT_FROM_PROVIDER_RECEIPTS',
            actualSpendUsd: 0.001, providerGeneratedCandidates: 1, providerHttpAttempts: 1,
          },
        },
        providerCalls: [], proof: null,
      }));
      const receipt = await runSealedH03ProviderCohortV3R3({
        ...operatorInput,
        authorization: authorization(),
        environment: {},
        mediaManifest: { manifestSha256: 'f'.repeat(64) } as never,
        outputRoot: root,
        executionCommitSha: EXECUTION_COMMIT,
        runnerSourceSha256: RUNNER_SHA,
        sandboxEnvironment: { snapshotId: 'snapshot', snapshotCommit: 'commit' },
        repoRoot: process.cwd(),
        now: () => NOW,
        runRow: runRow as never,
      });
      expect(receipt.rowCount).toBe(18);
      expect(runRow).toHaveBeenCalledTimes(18);
      const rowRoot = join(root, 'rows', 'openai_luna-production_budget-r1');
      const [source, outcome] = await Promise.all([
        readJson(join(rowRoot, 'source-row-receipt.json')),
        readJson(join(rowRoot, 'row-receipt.json')),
      ]);
      expect(source.failureDiagnostic).toBe('proof:openai_luna-production_budget-r1');
      expect(outcome.failureDiagnostic).toBe(source.failureDiagnostic);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });
});

const NOW = '2026-08-22T08:30:00.000Z';
const EXECUTION_COMMIT = 'a'.repeat(40);
const RUNNER_SHA = 'b'.repeat(64);

function authorization() {
  const nowMs = Date.parse(NOW);
  const infrastructure = sign({
    infrastructureAssessment: 'PASS', dispatchAssessment: 'PASS_READY',
    networkCalls: { inferenceCalls: 0 }, secretsPersisted: false, stateEffects: [],
    sandboxCredential: { expiresAtUnixSeconds: Math.floor(nowMs / 1_000) + 3_600 },
  });
  const h03 = sign({
    version: 'EDITRON_OE_SEALED_H03_PROVIDER_PREFLIGHT_V3R3_1',
    manifestSha256: operatorInput.cohortManifest.manifestSha256,
    providerInfrastructureReceiptSha256: infrastructure.receiptSha256,
    infrastructureAssessment: 'PASS',
    dispatchAssessment: 'PASS_READY_FOR_EXPLICIT_SPEND_AUTHORIZATION',
    plannedRowCount: 18, absoluteMaxSpendUsd: 11.673,
    networkCalls: { inferenceCalls: 0 }, secretsPersisted: false, stateEffects: [],
  });
  const operator = sign({
    version: 'EDITRON_OE_SEALED_H03_PROVIDER_OPERATOR_PREFLIGHT_V3R3_1',
    operatorId: 'admin', createdAt: '2026-08-22T08:20:00.000Z',
    manifestSha256: operatorInput.cohortManifest.manifestSha256,
    providerInfrastructureReceiptSha256: infrastructure.receiptSha256,
    h03PreflightReceiptSha256: h03.receiptSha256,
    dispatchAuthorized: false, inferenceCalls: 0, projectReads: 0, projectMutations: 0,
    absoluteMaxSpendUsd: 11.673, secretsPersisted: false, stateEffects: [],
  });
  return issueSealedH03PaidAuthorizationV3R3({
    manifest: operatorInput.cohortManifest,
    providerInfrastructureReceipt: infrastructure as never,
    h03PreflightReceipt: h03 as never,
    operatorPreflightReceipt: operator,
    approval: {
      operatorId: 'admin', approvedAt: '2026-08-22T08:29:30.000Z',
      expiresAt: '2026-08-23T07:29:30.000Z',
      confirmedManifestSha256: operatorInput.cohortManifest.manifestSha256,
      confirmedH03PreflightReceiptSha256: String(h03.receiptSha256),
      confirmedOperatorPreflightReceiptSha256: String(operator.receiptSha256),
      confirmedAbsoluteMaxSpendUsd: 11.673,
      executionCommitSha: EXECUTION_COMMIT, runnerSourceSha256: RUNNER_SHA,
    },
    nowUnixMs: nowMs,
  });
}

function sign(value: Record<string, unknown>): Record<string, unknown> {
  return { ...value, receiptSha256: hashCanonicalJsonV1(value) };
}
async function readJson(filePath: string): Promise<Record<string, unknown>> {
  return JSON.parse(await readFile(filePath, 'utf8')) as Record<string, unknown>;
}

function budget(
  armId: 'PRODUCTION_BUDGET' | 'CAPABILITY_CEILING',
  runProviderCall: unknown,
) {
  const arm = operatorInput.cohortManifest.budgetArms.find((entry) => entry.armId === armId);
  if (!arm) throw new Error(`test arm missing: ${armId}`);
  return createBudgetedH03SourceGeneratorV3R3({
    arm,
    routeEntry: operatorInput.providerManifest.routes[0],
    environment: { OPENAI_API_KEY: 'test-key' },
    runProviderCall: runProviderCall as never,
  });
}

function initialRequest() {
  const routeEntry = operatorInput.providerManifest.routes[0];
  return {
    route: routeEntry.route,
    packet: operatorInput.sourceRequest.packet,
    arguments: operatorInput.sourceRequest.arguments,
    orchestratorSpecSha256: operatorInput.sourceRequest.orchestratorSpecSha256,
    candidateOrdinal: 0 as const,
  };
}

function acceptedCall() {
  return {
    run: {
      disposition: 'ARTIFACT_ACCEPTED',
      artifact: { source: SEALED_H03_GENERATED_SOURCE_V2R },
      attempts: [{
        disposition: 'ARTIFACT_ACCEPTED',
        promptHash: 'b'.repeat(64),
        providerModel: 'gpt-5.6-luna',
        providerCostUsd: 0.001,
      }],
    },
    preflightCounts: [],
  };
}
