import { describe, expect, it } from 'vitest';

import {
  computeDeliveryRecord,
  deliveryStaleGuard,
  mgDeliveryRecordSchema,
} from '@/lib/editron/motion-graphics/codegen/mg-delivery-record';

describe('MG delivery record (brief §6.8/§16.2)', () => {
  it('computeDeliveryRecord stamps enqueuedAt and keeps the callers fields', () => {
    const r = computeDeliveryRecord(
      { videoId: 'v1', momentId: 'm1', status: 'enqueued', attempt: 1, jobId: 'mgr_1', idempotencyKey: 'v1:m1:mgr_1' },
      { now: '2026-08-05T00:00:00.000Z' },
    );
    expect(r.enqueuedAt).toBe('2026-08-05T00:00:00.000Z');
    expect(r.jobId).toBe('mgr_1');
    expect(mgDeliveryRecordSchema.parse(r).momentId).toBe('m1');
  });

  it('stale-guard: taste-contract change since enqueue blocks the delivery (§16.2)', () => {
    const record = computeDeliveryRecord({ videoId: 'v1', momentId: 'm1', status: 'enqueued', attempt: 1, jobId: 'mgr_1', idempotencyKey: 'k', tasteContractHash: 'old' });
    expect(deliveryStaleGuard(record, { tasteContractHash: 'new' })).toMatchObject({ ok: false });
    expect(deliveryStaleGuard(record, { tasteContractHash: 'old' })).toEqual({ ok: true });
  });

  it('stale-guard: a missing record is never treated as fresh', () => {
    expect(deliveryStaleGuard(null, {})).toMatchObject({ ok: false });
  });

  it('schema rejects unknown fields (strict) and requires idempotencyKey', () => {
    expect(() => mgDeliveryRecordSchema.parse({ videoId: 'v', momentId: 'm', status: 'enqueued', attempt: 0 })).toThrow();
  });
});