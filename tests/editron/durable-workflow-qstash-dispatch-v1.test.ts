import { describe, expect, it, vi } from 'vitest';

import type { DurableWorkflowJobSnapshotV1 }
  from '@/lib/editron/services/durable-workflow-job-v1';
import {
  publishAndRecordDurableWorkflowQStashJobV1,
  resolveDurableWorkflowQStashDispatchConfigurationV1,
  type DurableWorkflowQStashDeliveryPolicyV1,
  type DurableWorkflowQStashDispatchEnvironmentV1,
  type DurableWorkflowQStashPublisherV1,
} from '@/lib/editron/services/durable-workflow-qstash-dispatch-v1';

const ENV: DurableWorkflowQStashDispatchEnvironmentV1 = {
  QSTASH_TOKEN: 'qstash-token',
  QSTASH_CURRENT_SIGNING_KEY: 'current-signing-key',
  QSTASH_NEXT_SIGNING_KEY: 'next-signing-key',
  VERCEL_URL: 'editron.example.test',
};
const WORKER_PATH = '/api/internal/workers/exact-render-preparation';
const POLICY = Object.freeze({ retries: 2, retryDelayMs: 30_000, timeoutSeconds: 300 });

type PublishInput = Parameters<DurableWorkflowQStashPublisherV1['publishJSON']>[0];
type PublishResult = ReturnType<DurableWorkflowQStashPublisherV1['publishJSON']>;
type RecordDispatch = Parameters<
  typeof publishAndRecordDurableWorkflowQStashJobV1
>[0]['jobStore']['recordDispatch'];

describe('durable workflow QStash dispatch owner v1', () => {
  it('requires publisher credentials, both signing keys and exact HTTPS origins', () => {
    expect(configuration({ QSTASH_TOKEN: undefined })).toMatchObject({
      configured: false, reason: 'MISSING_QSTASH_TOKEN',
    });
    expect(configuration({ QSTASH_NEXT_SIGNING_KEY: undefined })).toMatchObject({
      configured: false, reason: 'MISSING_QSTASH_SIGNING_KEYS',
    });
    expect(configuration({ QSTASH_URL: 'http://qstash.example.test' })).toMatchObject({
      configured: false, reason: 'INVALID_QSTASH_URL',
    });
    expect(configuration({
      VERCEL_URL: undefined,
      NEXT_PUBLIC_APP_URL: 'https://editron.example.test/path',
    })).toMatchObject({ configured: false, reason: 'INVALID_PUBLIC_ORIGIN' });
    expect(resolveDurableWorkflowQStashDispatchConfigurationV1({
      workerPath: '/api/internal/workers/../public', environment: ENV,
    })).toMatchObject({ configured: false, reason: 'INVALID_WORKER_PATH' });
  });

  it('publishes with first-class timeout/retry fields and records delivery', async () => {
    const publishJSON = vi.fn<[PublishInput], PublishResult>(
      async () => ({ messageId: 'message-1' }),
    );
    const recordDispatch = vi.fn(async () => undefined);
    const result = await publish({ publishJSON, recordDispatch });

    expect(result).toEqual({
      state: 'dispatched', jobId: 'dwj_job_1', messageId: 'message-1',
    });
    expect(publishJSON).toHaveBeenCalledWith({
      url: 'https://editron.example.test/api/internal/workers/exact-render-preparation',
      body: { version: 'MESSAGE_V1', jobId: 'dwj_job_1' },
      retries: 2,
      retryDelay: '30000',
      timeout: 300,
      deduplicationId: 'dwj_job_1',
    });
    expect(publishJSON.mock.calls[0]![0]).not.toHaveProperty('headers');
    expect(recordDispatch).toHaveBeenCalledWith({
      jobId: 'dwj_job_1', transport: 'qstash', messageId: 'message-1',
    });
  });

  it('does not republish a recorded job or publish a non-queued job', async () => {
    const publishJSON = vi.fn(async () => ({ messageId: 'unused' }));
    await expect(publish({
      publishJSON,
      job: job({ dispatchMessageId: 'message-existing' }),
    })).resolves.toEqual({
      state: 'already_dispatched', jobId: 'dwj_job_1', messageId: 'message-existing',
    });
    await expect(publish({
      publishJSON,
      job: job({ status: 'retry_wait' }),
    })).resolves.toEqual({
      state: 'not_dispatchable', jobId: 'dwj_job_1', jobStatus: 'retry_wait',
    });
    expect(publishJSON).not.toHaveBeenCalled();
  });

  it('distinguishes rejected, missing, invalid and unrecorded delivery receipts', async () => {
    await expect(publish({
      publishJSON: vi.fn(async () => { throw new Error('unavailable'); }),
    })).resolves.toMatchObject({
      state: 'dispatch_unconfirmed', reason: 'QSTASH_PUBLISH_REJECTED',
    });
    await expect(publish({ publishJSON: vi.fn(async () => ({})) }))
      .resolves.toMatchObject({
        state: 'dispatch_unconfirmed', reason: 'QSTASH_MESSAGE_ID_MISSING',
      });
    await expect(publish({ publishJSON: vi.fn(async () => ({ messageId: 'bad id' })) }))
      .resolves.toMatchObject({
        state: 'dispatch_unconfirmed', reason: 'QSTASH_MESSAGE_ID_INVALID',
      });
    await expect(publish({
      publishJSON: vi.fn(async () => ({ messageId: 'message-sent' })),
      recordDispatch: vi.fn(async () => { throw new Error('atlas unavailable'); }),
    })).resolves.toEqual({
      state: 'delivery_unknown', jobId: 'dwj_job_1', messageId: 'message-sent',
      reason: 'DISPATCH_RECEIPT_NOT_RECORDED',
    });
  });

  it('rejects malformed persisted identity, configuration and delivery policy', async () => {
    await expect(publish({ job: job({ dispatchMessageId: 'bad id' }) }))
      .rejects.toThrow('DURABLE_WORKFLOW_QSTASH_DISPATCH_PERSISTED_MESSAGE_ID_INVALID');
    const configured = configuration();
    if (!configured.configured) throw new Error('fixture configuration invalid');
    await expect(publish({
      configuration: {
        ...configured,
        workerUrl: `https://attacker.example${WORKER_PATH}`,
      },
    })).rejects.toThrow('DURABLE_WORKFLOW_QSTASH_DISPATCH_CONFIGURATION_INVALID');
    await expect(publish({
      deliveryPolicy: { ...POLICY, timeoutSeconds: 0 },
    })).rejects.toThrow('DURABLE_WORKFLOW_QSTASH_DISPATCH_DELIVERY_TIMEOUT_SECONDS_INVALID');
    await expect(publish({
      deliveryPolicy: { ...POLICY, unexpected: true } as never,
    })).rejects.toThrow('DURABLE_WORKFLOW_QSTASH_DISPATCH_DELIVERY_POLICY_FIELDS_INVALID');
  });
});

function configuration(
  overrides: Partial<DurableWorkflowQStashDispatchEnvironmentV1> = {},
) {
  return resolveDurableWorkflowQStashDispatchConfigurationV1({
    workerPath: WORKER_PATH,
    environment: { ...ENV, ...overrides },
  });
}

async function publish(input: Readonly<{
  job?: DurableWorkflowJobSnapshotV1;
  publishJSON?: DurableWorkflowQStashPublisherV1['publishJSON'];
  recordDispatch?: RecordDispatch;
  configuration?: Extract<ReturnType<typeof configuration>, { configured: true }>;
  deliveryPolicy?: DurableWorkflowQStashDeliveryPolicyV1;
}> = {}) {
  const configured = input.configuration ?? configuration();
  if (!configured.configured) throw new Error('fixture configuration invalid');
  return publishAndRecordDurableWorkflowQStashJobV1({
    job: input.job ?? job(),
    jobStore: { recordDispatch: input.recordDispatch ?? vi.fn(async () => undefined) },
    configuration: configured,
    message: { version: 'MESSAGE_V1', jobId: 'dwj_job_1' },
    deliveryPolicy: input.deliveryPolicy ?? POLICY,
    deduplicationId: 'dwj_job_1',
    environment: ENV,
    publisher: { publishJSON: input.publishJSON ?? vi.fn(async () => ({ messageId: 'm1' })) },
  });
}

function job(overrides: Readonly<Record<string, unknown>> = {}) {
  return {
    jobId: 'dwj_job_1',
    status: 'queued',
    dispatchMessageId: null,
    ...overrides,
  } as unknown as DurableWorkflowJobSnapshotV1;
}
