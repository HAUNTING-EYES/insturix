import neo4j from 'neo4j-driver';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const { runCypherMock } = vi.hoisted(() => ({
  runCypherMock: vi.fn(async (
    _cypher: string,
    _params: Record<string, unknown>,
    _mode: 'READ' | 'WRITE',
  ) => []),
}));

vi.mock('@/lib/editron/db/neo4j', () => ({
  getSession: vi.fn(),
  isNeo4jAvailable: vi.fn(async () => true),
  runCypher: runCypherMock,
}));

import { searchAssets } from '@/lib/editron/services/graph-service';

describe('graph asset search', () => {
  beforeEach(() => {
    runCypherMock.mockClear();
  });

  it('encodes a one-result LIMIT as a Neo4j integer', async () => {
    await searchAssets('user-1', new Array(768).fill(0.01), { limit: 1 });

    expect(runCypherMock).toHaveBeenCalledOnce();
    const [, params, mode] = runCypherMock.mock.calls[0];
    expect(mode).toBe('READ');
    const limitParam = params.limit;
    if (!neo4j.isInt(limitParam)) {
      throw new Error('Expected graph search LIMIT to use a Neo4j Integer');
    }
    expect(limitParam.toNumber()).toBe(1);
  });
});
