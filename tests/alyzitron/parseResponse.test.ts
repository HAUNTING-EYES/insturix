import { describe, it, expect } from 'vitest';
import { parseAnalysesResponse } from '@/app/dashboard/alyzitron/hooks/useAlyzitronPolling';

describe('parseAnalysesResponse', () => {
  it('returns empty array for falsy input', () => {
    expect(parseAnalysesResponse(null)).toEqual([]);
    expect(parseAnalysesResponse(undefined)).toEqual([]);
  });

  it('returns same array if input is array', () => {
    const arr = [{ _id: '1', status: 'listed' }];
    expect(parseAnalysesResponse(arr)).toEqual(arr);
  });

  it('extracts data from paginated object', () => {
    const paginated = { data: [{ _id: '2', status: 'processing' }], pagination: { totalItems: 1 } };
    expect(parseAnalysesResponse(paginated)).toEqual(paginated.data);
  });
});
