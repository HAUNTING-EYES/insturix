import { beforeEach, describe, expect, it, vi } from 'vitest';
import { POST } from '@/app/api/services/thinkforge/events/observe/route';

const mocks = vi.hoisted(() => ({
  addDataBankEntry: vi.fn(),
  auth: vi.fn(),
  checkDuplicateBeforeSave: vi.fn(),
  createModelByTier: vi.fn(),
  embedDataBankEntry: vi.fn(),
  generateObject: vi.fn(),
  getSession: vi.fn(),
  processPendingEmbeddings: vi.fn(),
}));

vi.mock('@clerk/nextjs/server', () => ({
  auth: mocks.auth,
}));

vi.mock('ai', () => ({
  generateObject: mocks.generateObject,
}));

vi.mock('@/lib/thinkforge/agents/model-factory', () => ({
  createModelByTier: mocks.createModelByTier,
  ModelTier: { Structural: 'structural' },
}));

vi.mock('@/lib/thinkforge/services/db', () => ({
  addDataBankEntry: mocks.addDataBankEntry,
  getSession: mocks.getSession,
}));

vi.mock('@/lib/thinkforge/services/embedding-service', () => ({
  checkDuplicateBeforeSave: mocks.checkDuplicateBeforeSave,
  embedDataBankEntry: mocks.embedDataBankEntry,
  processPendingEmbeddings: mocks.processPendingEmbeddings,
}));

const LONG_TEXT = 'This is a long enough editor buffer where I explain that I prefer warm direct response openings and crisp captions.';

function request(body: unknown): Request {
  return new Request('http://localhost/api/services/thinkforge/events/observe', {
    method: 'POST',
    body: JSON.stringify(body),
  });
}

async function json(response: Response): Promise<Record<string, unknown>> {
  return (await response.json()) as Record<string, unknown>;
}

async function flushBackgroundWork(): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, 10));
}

describe('ThinkForge observer ingress', () => {
  beforeEach(() => {
    process.env.OBSERVER_ENABLED = 'true';
    for (const mock of Object.values(mocks)) {
      mock.mockReset();
    }
    mocks.auth.mockResolvedValue({ userId: 'user_1' });
    mocks.createModelByTier.mockReturnValue('model');
    mocks.checkDuplicateBeforeSave.mockResolvedValue(false);
    mocks.embedDataBankEntry.mockResolvedValue(undefined);
    mocks.processPendingEmbeddings.mockResolvedValue(undefined);
    mocks.generateObject.mockResolvedValue({
      object: {
        facts: [
          {
            type: 'preference',
            content: 'The user prefers warm direct response openings.',
            confidence: 0.91,
            scope: 'global',
          },
        ],
      },
    });
    mocks.getSession.mockResolvedValue({
      _id: 'tf_session_1',
      userId: 'user_1',
      projectMeta: {},
    });
    mocks.addDataBankEntry.mockResolvedValue({
      _id: 'entry_1',
      userId: 'user_1',
      sessionId: 'tf_session_1',
      scope: 'project',
    });
  });

  it('does not observe text without an owned session', async () => {
    const response = await POST(request({ text: LONG_TEXT, source: 'editor' }));

    expect(response.status).toBe(202);
    await expect(json(response)).resolves.toMatchObject({
      accepted: false,
      reason: 'missing_session',
    });
    expect(mocks.generateObject).not.toHaveBeenCalled();
  });

  it('rejects observation for sessions not owned by the user', async () => {
    mocks.getSession.mockResolvedValue(null);

    const response = await POST(request({
      text: LONG_TEXT,
      sessionId: 'tf_session_other',
      source: 'editor',
    }));

    expect(response.status).toBe(404);
    expect(mocks.getSession).toHaveBeenCalledWith('tf_session_other', 'user_1');
    expect(mocks.generateObject).not.toHaveBeenCalled();
  });

  it('quarantines LLM global facts as project-scoped DataBank entries', async () => {
    const response = await POST(request({
      text: LONG_TEXT,
      sessionId: 'tf_session_1',
      source: 'editor',
    }));

    expect(response.status).toBe(202);
    await flushBackgroundWork();

    expect(mocks.checkDuplicateBeforeSave).toHaveBeenCalledWith(
      'user_1',
      'The user prefers warm direct response openings.',
      'project',
    );
    expect(mocks.addDataBankEntry).toHaveBeenCalledWith('tf_session_1', 'user_1', expect.objectContaining({
      type: 'brand_insight',
      projectId: 'tf_session_1',
      scope: 'project',
      content: expect.objectContaining({
        claim: 'The user prefers warm direct response openings.',
        llmScope: 'global',
        memoryScope: 'project',
        promotionReason: 'observer_project_quarantine',
      }),
      tags: expect.arrayContaining([
        'memory:project',
        'promotion:observer_project_quarantine',
        'llm_scope:global',
      ]),
    }));
  });
});
