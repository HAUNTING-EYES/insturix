import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  auth: vi.fn(),
  createProject: vi.fn(),
}));

vi.mock('@clerk/nextjs/server', () => ({ auth: mocks.auth }));
vi.mock('@/lib/editron/services/project-service', () => ({
  projectService: { createProject: mocks.createProject },
}));

function request(body: Record<string, unknown>): Request {
  return new Request('http://localhost/api/services/editron/projects/create', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

describe('project create route', () => {
  beforeEach(() => {
    mocks.auth.mockReset();
    mocks.createProject.mockReset();
    mocks.auth.mockResolvedValue({ userId: 'user-1', orgId: 'org-1' });
    mocks.createProject.mockResolvedValue({ projectId: 'project-1' });
  });

  it('forwards only supported project creation options', async () => {
    const { POST } = await import('@/app/api/services/editron/projects/create/route');
    const response = await POST(request({ name: 'Agency Reel', brandId: 'brand-1' }) as never);

    expect(response.status).toBe(200);
    expect(mocks.createProject).toHaveBeenCalledWith('user-1', 'Agency Reel', {
      brandId: 'brand-1',
      orgId: 'org-1',
    });
  });

  it('rejects the previously ignored template option without creating a project', async () => {
    const { POST } = await import('@/app/api/services/editron/projects/create/route');
    const response = await POST(request({
      name: 'Template Project',
      templateId: 'template-that-was-never-applied',
    }) as never);

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({
      success: false,
      error: 'Project templates are not supported by this endpoint',
    });
    expect(mocks.createProject).not.toHaveBeenCalled();
  });
});
