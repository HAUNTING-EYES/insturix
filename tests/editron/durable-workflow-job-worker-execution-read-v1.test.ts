import { describe, expect, it } from 'vitest';

import {
  hashDurableWorkflowJobJsonV1,
  type DurableWorkflowJobRecordV1,
} from '@/lib/editron/services/durable-workflow-job-v1';
import { DurableWorkflowJobStoreV1 }
  from '@/lib/editron/services/durable-workflow-job-store-v1';
import { StatefulMongoCollection } from './helpers/stateful-mongo-collection';

const START = new Date('2026-08-30T09:00:00.000Z');
const OPERATION_OWNER = 'NATIVE_MEDIA_FINAL_RENDER';
const OPERATION_KIND = 'native_media_final_render_prepare_source';
const INPUT_SCHEMA_ID = 'EDITRON_NATIVE_MEDIA_FINAL_RENDER_PREPARATION_JOB_INPUT_V1_3';

describe('durable worker execution lookup', () => {
  it('reads only the exact operation family without claiming the job', async () => {
    const collection = new StatefulMongoCollection<DurableWorkflowJobRecordV1>();
    const store = new DurableWorkflowJobStoreV1(async () => collection.asCollection());
    const payload = { version: INPUT_SCHEMA_ID, projectId: 'project-1' };
    const created = await store.createOrGet({
      tenantId: 'tenant-1',
      userId: 'user-1',
      orgId: null,
      projectId: 'project-1',
      operationOwner: OPERATION_OWNER,
      operationKind: OPERATION_KIND,
      operationId: 'render-source-1',
      parentCommandId: null,
      parentReceiptId: null,
      idempotencyKey: 'render-source-1',
      input: {
        schemaId: INPUT_SCHEMA_ID,
        bindingSha256: hashDurableWorkflowJobJsonV1(payload),
        payload,
      },
      dependencies: [],
      budgetReservation: null,
      maxAttempts: 3,
    }, START);

    await expect(store.getForWorkerExecution({
      jobId: created.job.jobId,
      operationOwner: OPERATION_OWNER,
      operationKind: OPERATION_KIND,
      inputSchemaId: INPUT_SCHEMA_ID,
    })).resolves.toMatchObject({
      jobId: created.job.jobId,
      status: 'queued',
      attemptCount: 0,
      remainingAttempts: 3,
    });
    expect(collection.snapshot()[0]).toMatchObject({
      status: 'queued', attemptCount: 0, leaseToken: null,
    });
  });

  it.each([
    { operationOwner: 'FOREIGN_OWNER' },
    { operationKind: 'foreign_operation' },
    { inputSchemaId: 'FOREIGN_INPUT_V1' },
    { jobId: 'dwj_missing' },
  ])('rejects a mismatched execution scope: %o', async (override) => {
    const collection = new StatefulMongoCollection<DurableWorkflowJobRecordV1>();
    const store = new DurableWorkflowJobStoreV1(async () => collection.asCollection());
    const payload = { version: INPUT_SCHEMA_ID };
    const created = await store.createOrGet({
      tenantId: 'tenant-1', userId: 'user-1', orgId: null, projectId: 'project-1',
      operationOwner: OPERATION_OWNER, operationKind: OPERATION_KIND,
      operationId: 'render-source-2', parentCommandId: null, parentReceiptId: null,
      idempotencyKey: 'render-source-2',
      input: {
        schemaId: INPUT_SCHEMA_ID,
        bindingSha256: hashDurableWorkflowJobJsonV1(payload),
        payload,
      },
      dependencies: [], budgetReservation: null, maxAttempts: 3,
    }, START);

    await expect(store.getForWorkerExecution({
      jobId: created.job.jobId,
      operationOwner: OPERATION_OWNER,
      operationKind: OPERATION_KIND,
      inputSchemaId: INPUT_SCHEMA_ID,
      ...override,
    })).resolves.toBeNull();
    expect(collection.snapshot()[0]).toMatchObject({ attemptCount: 0, leaseToken: null });
  });

  it('rejects malformed scope before opening the collection', async () => {
    let collectionLoads = 0;
    const store = new DurableWorkflowJobStoreV1(async () => {
      collectionLoads += 1;
      return new StatefulMongoCollection<DurableWorkflowJobRecordV1>().asCollection();
    });

    await expect(store.getForWorkerExecution({
      jobId: 'dwj_valid',
      operationOwner: '',
      operationKind: OPERATION_KIND,
      inputSchemaId: INPUT_SCHEMA_ID,
    })).rejects.toThrow('DURABLE_JOB_OPERATION_OWNER_INVALID');
    expect(collectionLoads).toBe(0);
  });
});
