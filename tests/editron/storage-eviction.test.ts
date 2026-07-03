import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { bytesToFree, ownerAssetFilter } from '../../lib/editron/services/storage-eviction-policy';

const read = (rel: string) => readFileSync(path.join(process.cwd(), rel), 'utf8');

describe('storage eviction — pure logic', () => {
  it('bytesToFree = how much over the cap the upload would put us (0 if it fits)', () => {
    expect(bytesToFree(0, 100, 50)).toBe(0); // fits
    expect(bytesToFree(80, 100, 20)).toBe(0); // exactly fits
    expect(bytesToFree(80, 100, 50)).toBe(30); // 30 over
    expect(bytesToFree(100, 100, 1)).toBe(1);
    expect(bytesToFree(500, 100, 0)).toBe(400); // already over, no add
  });

  it('owner filter is org-wide for orgs, solo-only for users', () => {
    expect(ownerAssetFilter({ id: 'org_1', type: 'org' })).toEqual({ orgId: 'org_1' });
    expect(ownerAssetFilter({ id: 'user_1', type: 'user' })).toEqual({
      userId: 'user_1',
      orgId: { $exists: false },
    });
  });
});

describe('storage eviction — destructive-safety invariants (source-level)', () => {
  const src = read('lib/editron/services/storage-eviction-service.ts');

  it('evicts least-recently-used first (lastUsedAt asc), pinned excluded', () => {
    expect(src).toContain('.sort({ lastUsedAt: 1, uploadedAt: 1 })');
    expect(src).toContain('pinned: { $ne: true }');
  });

  it('never evicts assets referenced by a saved project', () => {
    expect(src).toContain('projectReferencedAssetIds');
    expect(src).toContain("distinct('overlays.assetId'");
    expect(src).toContain('if (protectedIds.has(a.assetId)) continue');
  });

  it('deletes bytes BEFORE the doc, and skips (no counter drift) on byte-delete failure', () => {
    const bytesIdx = src.indexOf('await deleteAssetBytes(a)');
    const docIdx = src.indexOf('deleteOne({ _id:');
    expect(bytesIdx).toBeGreaterThan(-1);
    expect(docIdx).toBeGreaterThan(bytesIdx); // bytes first
    expect(src).toContain('continue; // don\'t delete the doc or count it');
  });

  it('decrements the storage_usage counter by exactly what was freed', () => {
    expect(src).toContain('if (freed > 0) await recordStorageUsage(owner, -freed)');
  });

  it('reports blockedByProtected when it cannot free enough', () => {
    expect(src).toContain('blockedByProtected: !fits');
  });
});
