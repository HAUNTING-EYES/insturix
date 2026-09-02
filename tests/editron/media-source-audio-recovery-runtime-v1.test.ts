import { describe, expect, it, vi } from 'vitest';

import { DURABLE_WORKFLOW_JOB_LEASE_MS_V1 }
  from '@/lib/editron/services/durable-workflow-job-v1';
import { MEDIA_SOURCE_AUDIO_PRODUCT_DELIVERY_POLICY_V1 }
  from '@/lib/editron/services/media-source-audio-product-trigger-v1';
import {
  MEDIA_SOURCE_AUDIO_RECOVERY_LIMIT_V1,
  MEDIA_SOURCE_AUDIO_RECOVERY_STALE_MS_V1,
  runMediaSourceAudioRecoveryV1,
} from '@/lib/editron/services/media-source-audio-recovery-runtime-v1';

const NOW = new Date('2026-08-30T19:00:00.000Z');

describe('media source audio recovery runtime V1', () => {
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

    await expect(runMediaSourceAudioRecoveryV1({
      recover,
      jobStore,
      now: NOW,
    })).resolves.toBe(result);
    expect(MEDIA_SOURCE_AUDIO_RECOVERY_STALE_MS_V1)
      .toBe(2 * DURABLE_WORKFLOW_JOB_LEASE_MS_V1);
    expect(recover).toHaveBeenCalledWith({
      jobStore,
      staleBefore: new Date(
        NOW.getTime() - MEDIA_SOURCE_AUDIO_RECOVERY_STALE_MS_V1,
      ),
      now: NOW,
      limit: MEDIA_SOURCE_AUDIO_RECOVERY_LIMIT_V1,
      deliveryPolicy: MEDIA_SOURCE_AUDIO_PRODUCT_DELIVERY_POLICY_V1,
    });
  });

  it('rejects an invalid recovery clock before store access', async () => {
    const recover = vi.fn();
    await expect(runMediaSourceAudioRecoveryV1({
      recover,
      now: new Date(Number.NaN),
    })).rejects.toThrow('MEDIA_SOURCE_AUDIO_RECOVERY_NOW_INVALID');
    expect(recover).not.toHaveBeenCalled();
  });
});
