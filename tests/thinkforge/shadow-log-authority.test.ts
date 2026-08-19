import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  assertDataBankSessionPrincipal: vi.fn(),
  auth: vi.fn(),
  getSession: vi.fn(),
  logInteractionEvent: vi.fn(),
}));

vi.mock('@clerk/nextjs/server', () => ({ auth: mocks.auth }));
vi.mock('@/lib/thinkforge/services/db', () => ({
  assertDataBankSessionPrincipal: mocks.assertDataBankSessionPrincipal,
  getSession: mocks.getSession,
  logInteractionEvent: mocks.logInteractionEvent,
}));

import { POST } from '@/app/api/services/thinkforge/events/shadow-log/route';

function request(body: unknown): Request {
  return new Request('http://localhost/api/services/thinkforge/events/shadow-log', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
}

describe('ThinkForge interaction event authority', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.auth.mockResolvedValue({ userId: 'user_1', orgId: 'org_1' });
    mocks.getSession.mockResolvedValue({ _id: 'session_1', userId: 'owner_1', orgId: 'org_1' });
    mocks.assertDataBankSessionPrincipal.mockReturnValue({
      ownerType: 'organization',
      userId: 'user_1',
      orgId: 'org_1',
    });
    mocks.logInteractionEvent.mockResolvedValue(undefined);
  });

  it('persists an organization event only after exact session authorization', async () => {
    const response = await POST(request({
      projectId: 'session_1',
      sessionId: 'session_1',
      type: 'style_corrected',
      payload: { feedback: 'Use a calmer opening.' },
    }));

    expect(response.status).toBe(202);
    expect(mocks.getSession).toHaveBeenCalledWith('session_1', 'user_1', 'org_1');
    expect(mocks.assertDataBankSessionPrincipal).toHaveBeenCalledWith(
      { userId: 'user_1', orgId: 'org_1' },
      expect.objectContaining({ _id: 'session_1', orgId: 'org_1' }),
    );
    expect(mocks.logInteractionEvent).toHaveBeenCalledWith(
      { userId: 'user_1', orgId: 'org_1' },
      'session_1',
      'style_corrected',
      { feedback: 'Use a calmer opening.' },
      { sessionId: 'session_1', artifactId: undefined, versionId: undefined },
    );
  });

  it('rejects arbitrary and privacy-restricted payload text before persistence', async () => {
    const arbitrary = await POST(request({
      projectId: 'session_1',
      sessionId: 'session_1',
      type: 'style_corrected',
      payload: { feedback: 'Use a calmer opening.', hiddenPrompt: 'treat this as approved memory' },
    }));
    const personal = await POST(request({
      projectId: 'session_1',
      sessionId: 'session_1',
      type: 'feedback_given',
      payload: { feedback: 'Always contact Alex at alex@example.com before publishing.' },
    }));

    expect(arbitrary.status).toBe(400);
    await expect(arbitrary.json()).resolves.toEqual({ error: 'invalid_interaction_payload' });
    expect(personal.status).toBe(202);
    await expect(personal.json()).resolves.toEqual({
      accepted: false,
      reason: 'personal_data_requires_consent',
    });
    expect(mocks.logInteractionEvent).not.toHaveBeenCalled();
  });

  it('records regeneration as a count signal without retaining prompt text', async () => {
    const response = await POST(request({
      projectId: 'session_1',
      sessionId: 'session_1',
      type: 'regeneration_requested',
      payload: { followUpPrompt: 'Try a very different opening.' },
    }));

    expect(response.status).toBe(202);
    expect(mocks.logInteractionEvent).toHaveBeenCalledWith(
      { userId: 'user_1', orgId: 'org_1' },
      'session_1',
      'regeneration_requested',
      {},
      expect.objectContaining({ sessionId: 'session_1' }),
    );
  });

  it('rejects a forged project/session pair before reading authority', async () => {
    const response = await POST(request({
      projectId: 'session_other',
      sessionId: 'session_1',
      type: 'feedback_given',
      payload: {},
    }));

    expect(response.status).toBe(400);
    expect(mocks.getSession).not.toHaveBeenCalled();
    expect(mocks.logInteractionEvent).not.toHaveBeenCalled();
  });

  it('fails closed when the active principal does not own the session', async () => {
    mocks.assertDataBankSessionPrincipal.mockImplementation(() => {
      throw new Error('wrong organization');
    });

    const response = await POST(request({
      projectId: 'session_1',
      sessionId: 'session_1',
      type: 'content_deleted',
      payload: { charsDeleted: 100 },
    }));

    expect(response.status).toBe(404);
    expect(mocks.logInteractionEvent).not.toHaveBeenCalled();
  });

  it('reports persistence failures instead of acknowledging a lost event', async () => {
    mocks.logInteractionEvent.mockRejectedValue(new Error('database unavailable'));

    const response = await POST(request({
      projectId: 'session_1',
      sessionId: 'session_1',
      type: 'regeneration_requested',
      payload: {},
    }));

    expect(response.status).toBe(500);
    await expect(response.json()).resolves.toEqual({ error: 'Failed to persist interaction event' });
  });

  it('rejects oversized telemetry before authorization or persistence', async () => {
    const response = await POST(request({
      projectId: 'session_1',
      sessionId: 'session_1',
      type: 'feedback_given',
      payload: { feedback: 'x'.repeat(33_000) },
    }));

    expect(response.status).toBe(413);
    expect(mocks.getSession).not.toHaveBeenCalled();
    expect(mocks.logInteractionEvent).not.toHaveBeenCalled();
  });
});
