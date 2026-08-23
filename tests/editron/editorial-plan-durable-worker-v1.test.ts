import { describe, expect, it, vi } from 'vitest';

import {
  EditorialPlanDurableRetryableErrorV1,
  runEditorialPlanDurableWorkerV1,
  type EditorialPlanDurableExecutionOwnerV1,
} from '@/lib/editron/services/editorial-plan-durable-worker-v1';
import { createEditorialPlanRevisionV1 }
  from '@/lib/editron/services/editorial-plan-v1';
import {
  createPreparedEditorialPlanDurableFixtureV1 as prepared,
  EDITORIAL_PLAN_FIXTURE_START_V1 as START,
  editorialPlanFixtureInputV1 as planInput,
} from './helpers/editorial-plan-durable-fixture-v1';

const HASH = 'd'.repeat(64);

describe('editorial plan durable worker', () => {
  it('executes one exact resolved definition and stores an owner-bound receipt', async () => {
    const setup = await prepared();
    const execute = vi.fn(async ({ plan, node, definition, lifecycle }) => {
      expect(plan.revisionSha256).toBe(setup.active.revisionSha256);
      expect(node.nodeId).toBe('root');
      expect(definition.definitionSha256).toBe(setup.definition.definitionSha256);
      expect(await lifecycle.persistResumeState({
        schemaId: 'TEST_EXECUTION_STATE_V1', payload: { completedSteps: 1 },
      })).toBe(1);
      return receipt('PASS');
    });
    const result = await run(setup, owner(execute));

    expect(result).toMatchObject({ kind: 'completed', disposition: 'PASS' });
    expect(execute).toHaveBeenCalledOnce();
    await expect(current(setup)).resolves.toMatchObject({
      status: 'completed', resumeState: {
        sequence: 1, schemaId: 'TEST_EXECUTION_STATE_V1',
      },
      terminalReceipt: {
        disposition: 'PASS', receiptId: expect.stringMatching(/^epw_/),
        receiptSha256: result.kind === 'completed' ? result.receiptSha256 : '',
        proofReferences: [{ proofId: 'proof-a', disposition: 'PASS' }],
      },
    });
  });

  it('retries only a typed retryable owner failure and preserves its cursor', async () => {
    const setup = await prepared();
    const result = await run(setup, owner(async () => {
      throw new EditorialPlanDurableRetryableErrorV1(
        'UPSTREAM_TEMPORARY', 'Temporary owner outage.', { providerAttempt: 1 },
      );
    }));

    expect(result).toEqual({
      kind: 'retry_wait', jobId: setup.jobId, errorCode: 'UPSTREAM_TEMPORARY',
    });
    await expect(current(setup)).resolves.toMatchObject({
      status: 'retry_wait', error: { code: 'UPSTREAM_TEMPORARY', retryable: true },
      retryCursor: { resumeSequence: 0, ownerCursor: { providerAttempt: 1 } },
    });
  });

  it('dead-letters an unknown owner failure instead of guessing a fallback', async () => {
    const setup = await prepared();
    const result = await run(setup, owner(async () => {
      throw new Error('Unexpected execution failure.');
    }));

    expect(result).toEqual({
      kind: 'dead_letter', jobId: setup.jobId, errorCode: 'PLAN_EXECUTION_FAILED',
    });
    await expect(current(setup)).resolves.toMatchObject({
      status: 'dead_letter', error: { retryable: false }, terminalReceipt: null,
    });
  });

  it('rejects a stale accepted plan before invoking the execution owner', async () => {
    const setup = await prepared();
    const next = createEditorialPlanRevisionV1(planInput({
      planRevision: 3, previousRevisionSha256: setup.active.revisionSha256,
      nodes: setup.active.nodes, changeReason: 'accepted plan advanced',
    }));
    await setup.planStore().appendSuccessor({
      plan: next, expectedCurrentRevisionSha256: setup.active.revisionSha256,
      now: START,
    });
    const execute = vi.fn(async () => receipt('PASS'));
    const result = await run(setup, owner(execute));

    expect(result).toEqual({
      kind: 'dead_letter', jobId: setup.jobId,
      errorCode: 'PLAN_JOB_RESOLUTION_PLAN_STALE',
    });
    expect(execute).not.toHaveBeenCalled();
  });

  it('honours cancellation detected by the owner heartbeat', async () => {
    const setup = await prepared();
    const result = await run(setup, owner(async ({ lifecycle }) => {
      await setup.jobStore.requestCancellation({
        jobId: setup.jobId, tenantId: 'tenant-a', userId: 'user-a',
        requestedBy: 'user-a', reason: 'user stopped the episode', now: at(10),
      });
      await lifecycle.heartbeat();
      throw new Error('UNREACHABLE');
    }));

    expect(result).toEqual({ kind: 'cancelled', jobId: setup.jobId });
    await expect(current(setup)).resolves.toMatchObject({
      status: 'cancelled', terminalReceipt: { disposition: 'CANCELLED' },
    });
  });
});

function owner(
  execute: EditorialPlanDurableExecutionOwnerV1['execute'],
): EditorialPlanDurableExecutionOwnerV1 {
  return {
    ownerId: 'TEST_ZERO_INFERENCE_OWNER', ownerVersion: 'v1',
    assertDefinitionSupported: ({ definition }) => {
      if (definition.plannerEnvelopeSchemaRef.artifactId !== 'planner-envelope-v1') {
        throw new Error('TEST_OWNER_DEFINITION_UNSUPPORTED');
      }
    },
    execute,
  };
}

function receipt(disposition: 'PASS' | 'FAIL' | 'UNVERIFIABLE') {
  return {
    disposition, receiptId: 'test-owner-receipt', receiptSha256: HASH,
    proofReferences: [{ proofId: 'proof-a', proofSha256: HASH, disposition }],
  } as const;
}

function run(
  setup: Awaited<ReturnType<typeof prepared>>,
  executionOwner: EditorialPlanDurableExecutionOwnerV1,
) {
  return runEditorialPlanDurableWorkerV1({
    jobStore: setup.jobStore, planStore: setup.planStore(),
    jobId: setup.jobId, workerId: 'worker-a', executionOwner,
    clock: () => START, retryDelayMs: 1_000,
  });
}

function current(setup: Awaited<ReturnType<typeof prepared>>) {
  return setup.jobStore.getAuthorized({
    jobId: setup.jobId, tenantId: 'tenant-a', userId: 'user-a',
  });
}
function at(offsetMs: number): Date {
  return new Date(START.getTime() + offsetMs);
}
