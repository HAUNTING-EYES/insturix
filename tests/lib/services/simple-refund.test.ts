import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock the User model updateOne method
vi.mock('@/schemas/user', () => ({
  User: {
    updateOne: vi.fn(),
  },
}));

import { processRefund } from '@/lib/services/tasks/simple-refund';
import { REFUND_MAPPING } from '@/lib/services/refund-config';
import { User } from '@/schemas/user';

beforeEach(() => {
  vi.clearAllMocks();
});

describe('processRefund', () => {
  it('calls User.updateOne for alyzitron analysis with correct parameters', async () => {
    const minutes = 5;
    await processRefund('alyzitron', 'analysis', 'user-123', minutes);

    // For alyzitron analysis, REFUND_MAPPING maps to ['AnalysisMinutes']
    expect(User.updateOne).toHaveBeenCalled();

    expect(User.updateOne).toHaveBeenCalledWith(
      { clerkUserId: 'user-123' },
      { $inc: { ['currentPlan.serviceLimits.alyzitron.$[elem].currentUsage']: -minutes } },
      { arrayFilters: [{ 'elem.limitType': 'AnalysisMinutes', 'elem.currentUsage': { $gt: 0 } }] }
    );
  });

  it('does nothing if service/task mapping does not exist', async () => {
    // Call with a non-existent mapping; should not throw and should not call updateOne
    await processRefund('nonexistent', 'nope', 'user-xxx', 1);
    // There are other tests that might have called it; ensure no call for this specific case
    // We assert that the mock was not called with the nonexistent service path
    expect(User.updateOne).not.toHaveBeenCalledWith(
      expect.objectContaining({ clerkUserId: 'user-xxx' }),
      expect.any(Object),
      expect.any(Object)
    );
  });
});