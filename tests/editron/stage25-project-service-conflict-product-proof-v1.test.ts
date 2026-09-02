import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { hashCanonicalJsonV1 }
  from '@/lib/editron/research/open-ended-planner/contracts-v1';
import {
  assertStage25ProjectServiceConflictProductProofReceiptV1,
  executeStage25ProjectServiceConflictProductProofV1,
  type Stage25ProjectServiceConflictProbeStoreV1,
} from '@/lib/editron/research/open-ended-planner/stage25-project-service-conflict-product-proof-v1';
import type { Project } from '@/lib/editron/services/project-service';
import { StatefulProjectServicePersistenceV1 }
  from './helpers/stateful-project-service-persistence-v1';

type JsonRecord = Record<string, unknown>;
type Persistence = StatefulProjectServicePersistenceV1<JsonRecord>;

const persistenceState = vi.hoisted(() => ({ database: null as unknown }));

vi.mock('@/lib/editron/db/mongodb', () => ({
  COLLECTIONS: { PROJECTS: 'projects' },
  getDatabase: vi.fn(async () => {
    if (!persistenceState.database) throw new Error('PROJECT_SERVICE_TEST_DATABASE_NOT_INSTALLED');
    return persistenceState.database;
  }),
  connectToDatabase: vi.fn(),
}));

vi.mock('@/lib/editron/services/asset-resolver', () => ({
  assetResolver: {
    stripUrlsForLLM: <T>(overlays: readonly T[]) => structuredClone(overlays),
    resolveProjectAssets: async <T>(overlays: readonly T[]) => structuredClone(overlays),
  },
}));

vi.mock('@/lib/services/orgMemberService', () => ({ orgMemberService: {} }));
vi.mock('@/lib/shared/project-links', () => ({ removeProjectFromLinks: vi.fn() }));

describe('Stage 2.5 ProjectService product conflict proof V1', () => {
  beforeEach(() => {
    persistenceState.database = null;
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-08-27T20:10:00.000Z'));
  });

  afterEach(() => {
    persistenceState.database = null;
    vi.useRealTimers();
  });

  it('runs every bounded scenario through the real ProjectService owner', async () => {
    const harness = createMultiProjectHarness();
    persistenceState.database = harness.database;
    const { projectService } = await import('@/lib/editron/services/project-service');

    const receipt = await executeStage25ProjectServiceConflictProductProofV1({
      owner: projectService,
      store: harness.store,
      environment: environment(),
      executionId: 'conflict-proof-test-v1',
      createdAt: '2026-08-27T20:10:00.000Z',
      userId: 'stage25_conflict_proof_user',
      projectIdPrefix: 'stage25-conflict-proof-test',
    });

    expect(receipt.assessment).toBe('PASS_ORCHESTRATION_TEST_ONLY');
    expect(receipt.gates).toHaveLength(11);
    expect(receipt.gates.every(({ status }) => status === 'PASS')).toBe(true);
    expect(receipt.scenarios.disjoint).toMatchObject({
      rebaseDisposition: 'SAFE_REBASED',
      userEditPreserved: true,
      durableReloadMatches: true,
      receiptTruthComplete: true,
    });
    expect(receipt.scenarios.overlap).toMatchObject({
      noWriteAfterBlock: true,
      blocked: {
        code: 'PROJECT_TIMELINE_REBASE_BLOCKED',
        reason: 'OVERLAPPING_UPDATE',
        emittedMutationReceiptCount: 0,
      },
    });
    expect(receipt.scenarios.locks).toMatchObject({
      lifecycleComplete: true,
      consumedByCutRevision: 11,
    });
    expect(receipt.scenarios.invalidInputs).toMatchObject({
      staleRevisionNoWrite: true,
      invalidRangeNoWrite: true,
    });
    expect(receipt.scenarios.staleEvidence).toMatchObject({
      staleTokenNoWrite: true,
      exactTokenRepairAccepted: true,
      repairRevision: 9,
    });
    expect(receipt.cleanup).toMatchObject({
      remainingFixtureProjects: 0,
      disposition: 'DELETED_AND_VERIFIED_ABSENT',
    });
    assertStage25ProjectServiceConflictProductProofReceiptV1(receipt);
  });

  it('rejects a rehashed receipt whose passing gate was rewritten', async () => {
    const harness = createMultiProjectHarness();
    persistenceState.database = harness.database;
    const { projectService } = await import('@/lib/editron/services/project-service');
    const receipt = await executeStage25ProjectServiceConflictProductProofV1({
      owner: projectService,
      store: harness.store,
      environment: environment(),
      executionId: 'conflict-tamper-test-v1',
      createdAt: '2026-08-27T20:10:00.000Z',
      userId: 'stage25_conflict_tamper_user',
      projectIdPrefix: 'stage25-conflict-tamper-test',
    });
    const tampered = structuredClone(receipt) as unknown as JsonRecord;
    const gates = tampered.gates as JsonRecord[];
    gates[0] = { ...gates[0], status: 'FAIL' };
    const { receiptSha256: _priorReceiptSha256, ...unsigned } = tampered;
    tampered.receiptSha256 = hashCanonicalJsonV1(unsigned);

    expect(() => assertStage25ProjectServiceConflictProductProofReceiptV1(tampered))
      .toThrow('STAGE25_PROJECT_SERVICE_CONFLICT_PRODUCT_PROOF_RECEIPT_INVALID');
  });
});

function environment() {
  return {
    persistenceKind: 'IN_MEMORY_STATEFUL_TEST_DOUBLE' as const,
    topology: 'IN_PROCESS_SINGLE_OWNER' as const,
    gcsImportDisposition: 'TEST_MODULE_MOCK_NO_GCS_IMPORT' as const,
    networkBoundary: 'IN_PROCESS_ONLY' as const,
    serverVersion: 'stateful-test-double-v1',
    storageEngine: 'bounded-mongo-surface',
    sourceCommit: 'abcdef0',
    projectServiceSha256: 'a'.repeat(64),
    proofOwnerSha256: 'b'.repeat(64),
    runnerSha256: null,
  };
}

function createMultiProjectHarness() {
  const projects = new Map<string, Persistence>();
  const persistenceFor = (filter: JsonRecord): Persistence | null => {
    const projectId = filter.projectId;
    return typeof projectId === 'string' ? projects.get(projectId) ?? null : null;
  };
  const database = {
    collection: (name: string) => {
      if (name === 'editron_project_render_snapshot_invalidation_outbox_v1') {
        return {
          findOne: async (filter: JsonRecord) => {
            for (const persistence of projects.values()) {
              const outbox = await persistence.asDatabase()
                .collection('editron_project_render_snapshot_invalidation_outbox_v1')
                .findOne(filter);
              if (outbox) return outbox;
            }
            return null;
          },
          insertOne: async (document: JsonRecord) => {
            const receipt = document.receipt;
            const projectId = receipt && typeof receipt === 'object' && !Array.isArray(receipt)
              ? (receipt as JsonRecord).projectId
              : null;
            if (typeof projectId !== 'string') {
              throw new Error('PROJECT_SERVICE_TEST_INVALIDATION_PROJECT_ID_MISSING');
            }
            const persistence = projects.get(projectId);
            if (!persistence) {
              throw new Error('PROJECT_SERVICE_TEST_INVALIDATION_PROJECT_NOT_INSTALLED');
            }
            return persistence.asDatabase()
              .collection('editron_project_render_snapshot_invalidation_outbox_v1')
              .insertOne(document);
          },
        };
      }
      if (name !== 'projects') {
        throw new Error(`PROJECT_SERVICE_TEST_COLLECTION_UNSUPPORTED:${name}`);
      }
      return {
        findOne: async (filter: JsonRecord, options?: unknown) => {
          const persistence = persistenceFor(filter);
          return persistence
            ? persistence.asDatabase().collection('projects').findOne(filter, options)
            : null;
        },
        updateOne: async (
          filter: JsonRecord,
          update: JsonRecord,
          options?: JsonRecord,
        ) => {
          const persistence = persistenceFor(filter);
          return persistence
            ? persistence.asDatabase().collection('projects').updateOne(
              filter,
              update,
              options,
            )
            : { acknowledged: true as const, matchedCount: 0, modifiedCount: 0 };
        },
      };
    },
  };
  const store: Stage25ProjectServiceConflictProbeStoreV1 = {
    installProject: async (project) => {
      projects.set(
        project.projectId,
        new StatefulProjectServicePersistenceV1(
          structuredClone(project) as unknown as JsonRecord,
        ),
      );
    },
    readProject: async (userId, projectId) => {
      const snapshot = projects.get(projectId)?.snapshot();
      return snapshot?.userId === userId
        ? snapshot as unknown as Project
        : null;
    },
    deleteProjects: async (userId, projectIds) => {
      for (const projectId of projectIds) {
        const snapshot = projects.get(projectId)?.snapshot();
        if (snapshot?.userId === userId) projects.delete(projectId);
      }
    },
    countProjects: async (userId, projectIds) => projectIds.filter((projectId) => (
      projects.get(projectId)?.snapshot().userId === userId
    )).length,
  };
  return { database, store };
}
