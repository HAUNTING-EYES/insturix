import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Session } from '@/lib/thinkforge/services/db';
import { resolvePostMortemScope } from '@/lib/thinkforge/agents/post-mortem-scope';

const mocks = vi.hoisted(() => {
  const findLinkBySessionId = vi.fn();
  const getSession = vi.fn();
  return { findLinkBySessionId, getSession };
});

vi.mock('@/lib/shared/project-links', () => ({
  findLinkBySessionId: mocks.findLinkBySessionId,
}));

vi.mock('@/lib/thinkforge/services/db', () => ({
  getSession: mocks.getSession,
}));

const NOW = new Date('2026-06-09T00:00:00.000Z');

function thinkForgeSession(overrides: Partial<Session> = {}): Session {
  return {
    _id: 'tf_session_1',
    userId: 'user_1',
    projectMeta: {
      brandId: 'brand_meta',
      idea: 'Launch idea',
      sessionName: 'Launch session',
    },
    createdAt: NOW,
    updatedAt: NOW,
    activeGeneration: null,
    ...overrides,
  };
}

describe('post-mortem scope resolver', () => {
  beforeEach(() => {
    mocks.findLinkBySessionId.mockReset();
    mocks.getSession.mockReset();
  });

  it('uses owned project-link scope over request or metadata guesses', async () => {
    mocks.findLinkBySessionId.mockResolvedValue({
      universalId: 'plink_1',
      userId: 'user_1',
      sessionId: 'tf_session_1',
      projectIds: ['editron_project_1', 'editron_project_2'],
      brandId: 'brand_link',
      storyboardIds: [],
      videoIds: [],
      schemaVersion: 1,
      createdAt: NOW,
      updatedAt: NOW,
    });

    const result = await resolvePostMortemScope({
      userId: 'user_1',
      sessionId: 'tf_session_1',
      projectTitle: '  Body title  ',
      session: thinkForgeSession(),
    });

    expect(mocks.getSession).not.toHaveBeenCalled();
    expect(mocks.findLinkBySessionId).toHaveBeenCalledWith('user_1', 'tf_session_1');
    expect(result?.input).toEqual({
      userId: 'user_1',
      sessionId: 'tf_session_1',
      projectId: 'editron_project_1',
      brandId: 'brand_link',
      projectTitle: 'Body title',
    });
  });

  it('falls back to session metadata without inventing project scope', async () => {
    mocks.getSession.mockResolvedValue(thinkForgeSession({
      projectMeta: {
        brandId: 'brand_meta',
        idea: 'Fallback idea',
      },
    }));
    mocks.findLinkBySessionId.mockResolvedValue(null);

    const result = await resolvePostMortemScope({
      userId: 'user_1',
      sessionId: 'tf_session_1',
    });

    expect(result?.input).toEqual({
      userId: 'user_1',
      sessionId: 'tf_session_1',
      projectId: undefined,
      brandId: 'brand_meta',
      projectTitle: 'Fallback idea',
    });
  });

  it('returns null and skips project-link lookup for missing sessions', async () => {
    mocks.getSession.mockResolvedValue(null);

    await expect(resolvePostMortemScope({
      userId: 'user_1',
      sessionId: 'missing_session',
    })).resolves.toBeNull();

    expect(mocks.findLinkBySessionId).not.toHaveBeenCalled();
  });
});
