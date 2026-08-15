import { describe, expect, it } from 'vitest';
import { buildThinkForgeSessionPrincipalQuery } from '@/lib/thinkforge/services/db';

describe('ThinkForge session principal query', () => {
  it('keeps personal sessions outside every active organization', () => {
    expect(buildThinkForgeSessionPrincipalQuery({
      sessionId: ' session_personal ',
      userId: ' user_1 ',
      orgId: null,
    })).toEqual({
      _id: 'session_personal',
      userId: 'user_1',
      $or: [{ orgId: { $exists: false } }, { orgId: null }],
    });
  });

  it('authorizes an organization session only through the exact active organization', () => {
    expect(buildThinkForgeSessionPrincipalQuery({
      sessionId: ' session_org ',
      userId: ' teammate_2 ',
      orgId: ' org_1 ',
    })).toEqual({ _id: 'session_org', orgId: 'org_1' });
  });

  it('fails closed when session or actor identity is empty', () => {
    expect(() => buildThinkForgeSessionPrincipalQuery({
      sessionId: ' ',
      userId: 'user_1',
      orgId: null,
    })).toThrow('ThinkForge session authority requires an exact session and user actor.');
    expect(() => buildThinkForgeSessionPrincipalQuery({
      sessionId: 'session_1',
      userId: ' ',
      orgId: 'org_1',
    })).toThrow('ThinkForge session authority requires an exact session and user actor.');
  });
});
