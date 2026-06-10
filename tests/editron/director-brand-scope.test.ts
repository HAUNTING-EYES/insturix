import { describe, expect, it } from 'vitest';
import { resolveDirectorBrandScope } from '@/lib/editron/agent/director-brand-scope';

describe('resolveDirectorBrandScope', () => {
  it('uses the project brand as the Graphiti group when present', () => {
    expect(resolveDirectorBrandScope(' brand_123 ', 'user_123')).toEqual({
      brandId: 'brand_123',
      graphitiGroupId: 'brand_123',
    });
  });

  it('falls back to the user group for unbranded projects', () => {
    expect(resolveDirectorBrandScope('   ', 'user_123')).toEqual({
      brandId: undefined,
      graphitiGroupId: 'user_123',
    });

    expect(resolveDirectorBrandScope(undefined, 'user_123')).toEqual({
      brandId: undefined,
      graphitiGroupId: 'user_123',
    });
  });
});
