import { readFileSync } from 'node:fs';
import path from 'node:path';
import type { NextRequest } from 'next/server';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  auth: vi.fn(),
}));

vi.mock('@clerk/nextjs/server', () => ({
  auth: mocks.auth,
}));

import { POST } from '@/app/api/services/editron/match-edit/generate-gap/route';

describe('Match Edit gap-generation route', () => {
  beforeEach(() => {
    mocks.auth.mockResolvedValue({ userId: 'user_123' });
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('requires an authenticated user', async () => {
    mocks.auth.mockResolvedValueOnce({ userId: null });

    const response = await POST({} as NextRequest);

    expect(response.status).toBe(401);
    await expect(response.json()).resolves.toEqual({
      success: false,
      error: 'Unauthorized',
    });
  });

  it('fails closed before reading generation-shaped caller input', async () => {
    const json = vi.fn(() => {
      throw new Error('The disabled route must not inspect caller-authored generation input.');
    });

    const response = await POST({ json } as unknown as NextRequest);

    expect(json).not.toHaveBeenCalled();
    expect(response.status).toBe(501);
    await expect(response.json()).resolves.toEqual({
      success: false,
      code: 'MATCH_EDIT_GAP_GENERATION_UNAVAILABLE',
      disposition: 'CAPABILITY_GAP',
      retryable: false,
      error: 'Match Edit gap generation is unavailable until its accepted plan, credits, project mutation, and proof owners are connected.',
    });
  });

  it('contains no direct provider, placeholder, or video-only fallback', () => {
    const source = readFileSync(path.join(
      process.cwd(),
      'app/api/services/editron/match-edit/generate-gap/route.ts',
    ), 'utf8');

    expect(source).not.toContain('@fal-ai/client');
    expect(source).not.toContain('generateVideoClip');
    expect(source).not.toContain('placehold.co');
    expect(source).not.toContain('attempting video-only');
    expect(source).not.toContain('FAL_AI_API_KEY');
  });
});
