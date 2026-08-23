import { randomUUID } from 'node:crypto';

import { Client } from '@upstash/qstash';
import type { Collection } from 'mongodb';
import { describe, expect, it } from 'vitest';

import { hashEditronCanonicalJsonV1 } from '@/lib/editron/services/canonical-json-v1';
import { DURABLE_WORKFLOW_JOB_COLLECTION_V1 }
  from '@/lib/editron/services/durable-workflow-job-v1';
import { DurableWorkflowJobStoreV1 }
  from '@/lib/editron/services/durable-workflow-job-store-v1';
import { runEditorialPlanDurableWorkerV1 }
  from '@/lib/editron/services/editorial-plan-durable-worker-v1';
import {
  EDITORIAL_PLAN_PRODUCT_WORKER_MESSAGE_VERSION_V1,
  EDITORIAL_PLAN_PRODUCT_WORKER_PATH_V1,
} from '@/lib/editron/services/editorial-plan-product-dispatch-v1';
import { EditorialPlanStoreV1 }
  from '@/lib/editron/services/editorial-plan-store-v1';
import { createProviderNativeProductBudgetAuthorizationV2R }
  from '@/lib/editron/services/provider-native-product-budget-v2r';
import { createProviderNativeProductTerminalSettlementOwnerV2R }
  from '@/lib/editron/services/provider-native-product-terminal-settlement-v2r';
import { PROVIDER_NATIVE_PRODUCT_BUDGET_CREDIT_COLLECTION_V2R }
  from '@/lib/services/provider-native-product-budget-mongo-ledger-v2r';

const RUN_LIVE = process.env.EDITRON_RUN_LIVE_ATLAS_RECOVERY_V2R === '1';
const liveIt = RUN_LIVE ? it : it.skip;
const ROUTE = {
  routeId: 'OPENAI_TERRA', provider: 'openai', model: 'gpt-5.6-terra',
  claimedModelIdentity: 'gpt-5.6-terra', reasoningMode: 'medium',
} as const;

describe('provider-native product live recovery V2R', () => {
  liveIt('redelivers a post-settlement crash without a duplicate charge or project write',
    async () => {
      assertDevelopmentOnlyEnvironment();
      const runId = `ep_live_${randomUUID().replace(/-/g, '')}`;
      const tenantId = `${runId}_tenant`;
      const userId = `${runId}_user`;
      const projectId = `${runId}_project`;
      const episodeId = `${runId}_episode`;
      const now = new Date();
      const qstash = new Client({
        token: requiredEnvironment('QSTASH_TOKEN'),
        baseUrl: requiredEnvironment('QSTASH_URL'),
      });
      const workerOrigin = loopbackUrl(
        requiredEnvironment('EDITRON_LIVE_WORKER_ORIGIN'),
        'EDITRON_LIVE_WORKER_ORIGIN',
      );
      const [{ connectToDatabase, COLLECTIONS }, connectMongooseModule,
        userModule, creditsModule] = await Promise.all([
        import('@/lib/editron/db/mongodb'),
        import('@/schemas/ConnectToDatabase'),
        import('@/schemas/user'),
        import('@/lib/services/creditsService'),
      ]);
      const editronConnection = await connectToDatabase();
      const mongoose = await connectMongooseModule.default();
      const billingDb = mongoose.connection.db;
      if (!billingDb) throw new Error('LIVE_RECOVERY_BILLING_DB_UNAVAILABLE');
      const users = billingDb.collection(userModule.User.collection.name);
      const reservations = billingDb.collection(
        PROVIDER_NATIVE_PRODUCT_BUDGET_CREDIT_COLLECTION_V2R,
      ) as Collection<{
        _id: string; record?: { status?: string };
      }>;
      const jobs = editronConnection.db.collection<{
        _id: string; status?: string; attemptCount?: number;
        dispatchCount?: number;
      }>(
        DURABLE_WORKFLOW_JOB_COLLECTION_V1,
      );
      const projects = editronConnection.db.collection(COLLECTIONS.PROJECTS);
      let reservationId: string | null = null;
      let jobId: string | null = null;

      try {
        await users.insertOne({
          clerkUserId: userId,
          email: `${runId}@invalid.example`,
          creditsBalance: {
            subscriptionCredits: 0, topupCredits: 10,
            subscriptionCreditsExpiry: null, lastSubscriptionGrant: null,
            mediaCredits: 0, mediaTopupCredits: 0,
            mediaCreditsExpiry: null, lastMediaGrant: null, creditHistory: [],
          },
          createdAt: now, updatedAt: now,
        });
        expect(await projects.findOne({ projectId })).toBeNull();

        const budgetOwner = creditsModule.CreditsService
          .createProviderNativeProductBudgetOwnerV2R();
        const authorization = createProviderNativeProductBudgetAuthorizationV2R({
          scope: { tenantId, userId, projectId, episodeId },
          wallet: { type: 'user', clerkUserId: userId },
          route: ROUTE,
          providerPricing: {
            ownerId: 'LIVE_RECOVERY_PROVIDER_PRICING', ownerVersion: 'v1',
            effectiveAt: offsetIso(now, -60_000),
            expiresAt: offsetIso(now, 3_600_000),
            tokenPricing: {
              normalInputNanoUsdPerToken: 500,
              cachedInputNanoUsdPerToken: 50,
              cacheWriteNanoUsdPerToken: 625,
              outputNanoUsdPerToken: 2_000,
            },
          },
          customerPricing: {
            ownerId: 'LIVE_RECOVERY_CUSTOMER_PRICING', ownerVersion: 'v1',
            creditPool: 'main', pricingSha256: 'c'.repeat(64),
          },
          limits: {
            maxProviderTurns: 1, maxSelectedOperations: 1,
            maxCandidatesPerOperation: 1, maxInputTokensPerTurn: 128,
            maxCumulativeOutputTokens: 128,
            absoluteMaxProviderSpendNanoUsd: 1_000_000,
            absoluteMaxCustomerChargeCentiCredits: 100,
          },
          approval: {
            approvedBy: 'live-recovery-probe',
            approvedAt: offsetIso(now, -1_000),
            expiresAt: offsetIso(now, 1_800_000),
          },
        });
        const reservation = await budgetOwner.reserve({ authorization });
        reservationId = reservation.reservationId;
        const jobStore = new DurableWorkflowJobStoreV1();
        const created = await jobStore.createOrGet({
          tenantId, userId, orgId: null, projectId,
          operationOwner: 'PLAN_SERVICE',
          operationKind: 'editorial_plan_node_episode',
          operationId: episodeId,
          parentCommandId: `${runId}_command`,
          parentReceiptId: `${runId}_receipt`,
          idempotencyKey: `${runId}_job`,
          input: {
            schemaId: 'EDITRON_LIVE_RECOVERY_PROBE_V2R_1',
            bindingSha256: hashEditronCanonicalJsonV1({ runId }),
            payload: { runId },
          },
          dependencies: [],
          budgetReservation: {
            reservationId: reservation.reservationId,
            bindingSha256: reservation.guardIdentitySha256,
          },
          maxAttempts: 3,
          expiresAt: new Date(now.getTime() + 3_600_000),
        }, now);
        jobId = created.job.jobId;
        await jobStore.requestCancellation({
          jobId, tenantId, userId, requestedBy: userId,
          reason: 'zero-inference live recovery probe',
        });

        const terminalOwner = createProviderNativeProductTerminalSettlementOwnerV2R({
          budgetOwner,
          customerChargeOwner: {
            compute: async () => {
              throw new Error('LIVE_RECOVERY_CUSTOMER_CHARGE_UNEXPECTED');
            },
          },
        });
        let injectedCrashCount = 0;
        await expect(runEditorialPlanDurableWorkerV1({
          jobStore,
          planStore: new EditorialPlanStoreV1(),
          jobId,
          workerId: `${runId}_crash_worker`,
          executionOwner: neverExecutionOwner(),
          terminalSettlementOwner: {
            settleTerminal: async (job) => {
              const settled = await terminalOwner.settleTerminal(job);
              injectedCrashCount += 1;
              throw new Error(
                `LIVE_RECOVERY_INJECTED_POST_SETTLEMENT_CRASH:${settled.settlementSha256}`,
              );
            },
          },
        })).rejects.toThrow('LIVE_RECOVERY_INJECTED_POST_SETTLEMENT_CRASH');
        expect(injectedCrashCount).toBe(1);

        const published = await qstash.publishJSON({
          url: `${workerOrigin.origin}${EDITORIAL_PLAN_PRODUCT_WORKER_PATH_V1}`,
          body: {
            version: EDITORIAL_PLAN_PRODUCT_WORKER_MESSAGE_VERSION_V1,
            jobId,
          },
          retries: 2,
          deduplicationId: `${runId}_redelivery`,
          label: runId,
        });
        await jobStore.recordDispatch({
          jobId, transport: 'qstash-local-probe',
          messageId: published.messageId,
        });
        const delivered = await waitForDelivery(qstash, published.messageId);

        const [wallet, storedReservation, storedJob, storedProject] =
          await Promise.all([
            users.findOne({ clerkUserId: userId }),
            reservations.findOne({ _id: reservation.reservationId }),
            jobs.findOne({ _id: jobId }),
            projects.findOne({ projectId }),
          ]);
        const history = wallet?.creditsBalance?.creditHistory ?? [];
        const probeHistory = history.filter((entry: Record<string, unknown>) => (
          (entry.metadata as Record<string, unknown> | undefined)
            ?.productBudgetReservationId === reservation.reservationId
        ));
        expect(wallet?.creditsBalance?.topupCredits).toBe(10);
        expect(probeHistory).toHaveLength(2);
        expect(probeHistory.map((entry: Record<string, unknown>) => (
          (entry.metadata as Record<string, unknown>).productBudgetPhase
        )).sort()).toEqual(['RESERVE', 'SETTLE']);
        expect(storedReservation?.record?.status).toBe('RELEASED');
        expect(storedJob).toMatchObject({
          status: 'cancelled', attemptCount: 0, dispatchCount: 1,
        });
        expect(storedProject).toBeNull();
        const receipt = {
          authority: 'DEVELOPMENT_LIVE_RECOVERY_PROBE_NO_PROVIDER_OR_PROJECT_MUTATION',
          runId, jobId, reservationId: reservation.reservationId,
          qstashMessageId: published.messageId,
          qstashTerminalState: delivered.state,
          injectedCrashCount,
          walletHistoryCount: probeHistory.length,
          finalReservationStatus: storedReservation?.record?.status,
          finalJobStatus: storedJob?.status,
          projectRowCount: 0,
        };
        console.info('EDITRON_LIVE_RECOVERY_RECEIPT', JSON.stringify({
          ...receipt,
          receiptSha256: hashEditronCanonicalJsonV1(receipt),
        }));
      } finally {
        const cleanup = [];
        if (jobId) cleanup.push(jobs.deleteOne({ _id: jobId }));
        if (reservationId) {
          cleanup.push(reservations.deleteOne({ _id: reservationId }));
        }
        cleanup.push(users.deleteOne({ clerkUserId: userId }));
        cleanup.push(projects.deleteOne({ projectId }));
        await Promise.all(cleanup);
        await Promise.all([
          editronConnection.client.close(),
          mongoose.disconnect(),
        ]);
      }
    }, 120_000);
});

function assertDevelopmentOnlyEnvironment(): void {
  if (process.env.EDITRON_LIVE_ATLAS_ENVIRONMENT !== 'development') {
    throw new Error('LIVE_RECOVERY_EXPLICIT_DEVELOPMENT_MARKER_REQUIRED');
  }
  loopbackUrl(requiredEnvironment('QSTASH_URL'), 'QSTASH_URL');
  loopbackUrl(
    requiredEnvironment('EDITRON_LIVE_WORKER_ORIGIN'),
    'EDITRON_LIVE_WORKER_ORIGIN',
  );
}

function loopbackUrl(raw: string, label: string): URL {
  const url = new URL(raw);
  if (url.protocol !== 'http:'
    || !['127.0.0.1', 'localhost', '::1'].includes(url.hostname)) {
    throw new Error(`LIVE_RECOVERY_${label}_MUST_BE_LOOPBACK`);
  }
  return url;
}

function requiredEnvironment(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`LIVE_RECOVERY_${name}_MISSING`);
  return value;
}

function neverExecutionOwner() {
  return {
    ownerId: 'LIVE_RECOVERY_NEVER_EXECUTION_OWNER', ownerVersion: 'v1',
    assertDefinitionSupported: () => {
      throw new Error('LIVE_RECOVERY_EXECUTION_OWNER_UNEXPECTED');
    },
    execute: async (): Promise<never> => {
      throw new Error('LIVE_RECOVERY_EXECUTION_OWNER_UNEXPECTED');
    },
  };
}

async function waitForDelivery(client: Client, messageId: string) {
  const deadline = Date.now() + 30_000;
  while (Date.now() < deadline) {
    const logs = await client.logs({ filter: { messageId, count: 100 } });
    const terminal = logs.logs.find(({ state }) => (
      ['DELIVERED', 'FAILED', 'ERROR', 'CANCELED'].includes(state)
    ));
    if (terminal?.state === 'DELIVERED') return terminal;
    if (terminal) {
      throw new Error(`LIVE_RECOVERY_QSTASH_${terminal.state}`);
    }
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  throw new Error('LIVE_RECOVERY_QSTASH_DELIVERY_TIMEOUT');
}

function offsetIso(base: Date, milliseconds: number): string {
  return new Date(base.getTime() + milliseconds).toISOString();
}
