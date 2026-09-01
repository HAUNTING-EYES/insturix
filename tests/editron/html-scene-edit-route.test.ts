import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

const mocks = vi.hoisted(() => ({
  auth: vi.fn(),
  invoke: vi.fn(),
  loadProject: vi.fn(),
  updateOverlayAtRevisionV1: vi.fn(),
}));

vi.mock('@clerk/nextjs/server', () => ({ auth: mocks.auth }));
vi.mock('@langchain/google-genai', () => ({
  ChatGoogleGenerativeAI: class {
    invoke = mocks.invoke;
  },
}));
vi.mock('@/lib/editron/services/project-service', () => ({
  projectService: {
    loadProject: mocks.loadProject,
    updateOverlayAtRevisionV1: mocks.updateOverlayAtRevisionV1,
  },
}));

import { POST } from '@/app/api/services/editron/html-scene/edit/route';

const PERSISTED_HTML = '<div style="position:absolute;inset:0">Before</div>';

function request(body: Record<string, unknown>) {
  return new NextRequest('http://localhost/api/services/editron/html-scene/edit', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
}

function project() {
  return {
    projectId: 'proj_html',
    userId: 'user_html',
    projectRevision: 7,
    updatedAt: new Date('2026-08-11T04:00:00.000Z'),
    overlays: [{
      id: 41,
      type: 'html-scene',
      content: PERSISTED_HTML,
      from: 30,
      durationInFrames: 90,
      width: 1280,
      height: 720,
    }],
  };
}

describe('HTML scene edit route revision binding', () => {
  beforeEach(() => {
    for (const mock of Object.values(mocks)) mock.mockReset();
    mocks.auth.mockResolvedValue({ userId: 'user_html' });
    mocks.loadProject.mockResolvedValue(project());
    mocks.updateOverlayAtRevisionV1.mockResolvedValue({
      mutationReceipt: {},
      timelineChangeReceipt: {},
    });
  });

  it('binds generation to the persisted scene revision and writes through ProjectService CAS', async () => {
    mocks.invoke.mockResolvedValue({
      content: '```html\n<div style="position:absolute;inset:0">After</div>\n```',
    });

    const response = await POST(request({
      projectId: 'proj_html',
      overlayId: 41,
      currentHtml: PERSISTED_HTML,
      editPrompt: 'Change Before to After.',
      width: 1920,
      height: 1080,
    }));

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      success: true,
      newHtml: '<div style="position:absolute;inset:0">After</div>',
    });
    expect(mocks.invoke).toHaveBeenCalledTimes(1);
    expect(mocks.updateOverlayAtRevisionV1).toHaveBeenCalledWith(
      'user_html',
      'proj_html',
      {
        expectedRevision: {
          schemaVersion: 1,
          value: 7,
          compatibilityUpdatedAt: '2026-08-11T04:00:00.000Z',
        },
        actorKind: 'USER',
        overlayId: 41,
        updates: {
          content: '<div style="position:absolute;inset:0">After</div>',
        },
      },
    );
  });

  it('rejects stale browser HTML before model egress or mutation', async () => {
    const response = await POST(request({
      projectId: 'proj_html',
      overlayId: 41,
      currentHtml: '<div>Older browser state</div>',
      editPrompt: 'Change the headline.',
    }));

    expect(response.status).toBe(409);
    await expect(response.json()).resolves.toMatchObject({
      code: 'PROJECT_MUTATION_CONFLICT',
    });
    expect(mocks.invoke).not.toHaveBeenCalled();
    expect(mocks.updateOverlayAtRevisionV1).not.toHaveBeenCalled();
  });

  it('returns a conflict when the project changes during generation', async () => {
    mocks.invoke.mockResolvedValue({ content: '<div>After</div>' });
    mocks.updateOverlayAtRevisionV1.mockRejectedValue({
      code: 'PROJECT_MUTATION_CONFLICT',
      currentRevision: {
        schemaVersion: 1,
        value: 8,
        compatibilityUpdatedAt: '2026-08-11T04:00:01.000Z',
      },
    });

    const response = await POST(request({
      projectId: 'proj_html',
      overlayId: 41,
      currentHtml: PERSISTED_HTML,
      editPrompt: 'Change the headline.',
    }));

    expect(response.status).toBe(409);
    await expect(response.json()).resolves.toMatchObject({
      code: 'PROJECT_MUTATION_CONFLICT',
      currentRevision: { value: 8 },
    });
    expect(mocks.invoke).toHaveBeenCalledTimes(1);
    expect(mocks.updateOverlayAtRevisionV1).toHaveBeenCalledTimes(1);
  });
});
