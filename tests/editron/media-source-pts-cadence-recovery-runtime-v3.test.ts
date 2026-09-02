import { describe, expect, it, vi } from 'vitest';

import { DURABLE_WORKFLOW_JOB_LEASE_MS_V1 }
  from '@/lib/editron/services/durable-workflow-job-v1';
import {
  MEDIA_SOURCE_PTS_CADENCE_RECOVERY_LIMIT_V3,
  MEDIA_SOURCE_PTS_CADENCE_RECOVERY_STALE_MS_V3,
  runMediaSourcePtsCadenceRecoveryV3,
} from '@/lib/editron/services/media-source-pts-cadence-recovery-runtime-v3';
import { MEDIA_SOURCE_PTS_CADENCE_PRODUCT_DELIVERY_POLICY_V3 }
  from '@/lib/editron/services/media-source-pts-cadence-product-trigger-v3';

const NOW = new Date('2026-08-30T14:00:00.000Z');

describe('media source PTS cadence recovery runtime V3', () => {
  it('binds a bounded sweep beyond the durable lease window', async () => {
    const result = Object.freeze({
      scanned: 0,
      eligible: 0,
      skipped: 0,
      results: Object.freeze([]),
    });
    const recover = vi.fn(async () => result);
    const jobStore = {
      listRecoverable: vi.fn(),
      recordDispatch: vi.fn(),
    };

    await expect(runMediaSourcePtsCadenceRecoveryV3({
      recover,
      jobStore,
      now: NOW,
    })).resolves.toBe(result);
    expect(MEDIA_SOURCE_PTS_CADENCE_RECOVERY_STALE_MS_V3)
      .toBe(2 * DURABLE_WORKFLOW_JOB_LEASE_MS_V1);
    expect(recover).toHaveBeenCalledWith({
      jobStore,
      staleBefore: new Date(
        NOW.getTime() - MEDIA_SOURCE_PTS_CADENCE_RECOVERY_STALE_MS_V3,
      ),
      now: NOW,
      limit: MEDIA_SOURCE_PTS_CADENCE_RECOVERY_LIMIT_V3,
      deliveryPolicy: MEDIA_SOURCE_PTS_CADENCE_PRODUCT_DELIVERY_POLICY_V3,
    });
  });

  it('rejects an invalid recovery clock before store access', async () => {
    const recover = vi.fn();
    await expect(runMediaSourcePtsCadenceRecoveryV3({
      recover,
      now: new Date(Number.NaN),
    })).rejects.toThrow('MEDIA_SOURCE_PTS_CADENCE_RECOVERY_NOW_INVALID');
    expect(recover).not.toHaveBeenCalled();
  });
});
