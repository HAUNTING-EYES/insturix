import { strict as assert } from 'assert';
import { parseAnalysesResponse } from '@/lib/alyzitron/parseResponse';

describe('parseAnalysesResponse', () => {
  it('returns empty array for falsy input', () => {
    assert.deepEqual(parseAnalysesResponse(null), []);
    assert.deepEqual(parseAnalysesResponse(undefined), []);
  });

  it('returns same array if input is array', () => {
    const arr = [{ _id: '1', status: 'listed' }];
    assert.deepEqual(parseAnalysesResponse(arr), arr);
  });

  it('extracts data from paginated object', () => {
    const paginated = { data: [{ _id: '2', status: 'processing' }], pagination: { totalItems: 1 } };
    assert.deepEqual(parseAnalysesResponse(paginated), paginated.data);
  });
});
