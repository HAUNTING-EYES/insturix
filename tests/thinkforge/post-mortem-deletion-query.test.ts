import { describe, expect, it } from 'vitest';
import { buildProjectScopedDeletionQuery } from '@/lib/thinkforge/services/db';

describe('post-mortem source cleanup authority', () => {
  it('targets only normalized source records from the authorized session', () => {
    expect(buildProjectScopedDeletionQuery({
      sessionId: ' session_1 ',
      userId: ' user_1 ',
      entryIds: [' source_1 ', 'source_2', 'source_1', '', '   '],
    })).toEqual({
      _id: { $in: ['source_1', 'source_2'] },
      sessionId: 'session_1',
      userId: 'user_1',
      scope: 'project',
    });
  });

  it('cannot create a broad deletion query when no source records were read', () => {
    expect(buildProjectScopedDeletionQuery({
      sessionId: 'session_1',
      userId: 'user_1',
      entryIds: [],
    })).toBeNull();
  });

  it('fails closed without an exact session and actor', () => {
    expect(() => buildProjectScopedDeletionQuery({
      sessionId: '',
      userId: 'user_1',
      entryIds: ['source_1'],
    })).toThrow('Project memory cleanup requires an exact session and user.');
    expect(() => buildProjectScopedDeletionQuery({
      sessionId: 'session_1',
      userId: ' ',
      entryIds: ['source_1'],
    })).toThrow('Project memory cleanup requires an exact session and user.');
  });
});
