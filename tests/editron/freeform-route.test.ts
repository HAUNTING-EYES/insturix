import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  auth: vi.fn(),
  checkExpensiveRateLimit: vi.fn(),
  editTracedElementWithGlm: vi.fn(),
  generateFreeformRemotionScene: vi.fn(),
}));

vi.mock('@clerk/nextjs/server', () => ({
  auth: mocks.auth,
}));

vi.mock('@/lib/editron/utils/rate-limiter', () => ({
  checkExpensiveRateLimit: mocks.checkExpensiveRateLimit,
}));

vi.mock('@/lib/editron/freeform-glm/generate-scene', () => ({
  generateFreeformRemotionScene: mocks.generateFreeformRemotionScene,
}));

vi.mock('@/lib/editron/freeform-glm/edit-element', () => ({
  editTracedElementWithGlm: mocks.editTracedElementWithGlm,
}));

import { POST } from '@/app/api/services/editron/freeform/route';

describe('Editron freeform route', () => {
  beforeEach(() => {
    for (const mock of Object.values(mocks)) mock.mockReset();
    delete process.env.EDITRON_FREEFORM_GLM_ENABLED;

    mocks.auth.mockResolvedValue({ userId: 'user_1' });
    mocks.checkExpensiveRateLimit.mockResolvedValue({
      success: true,
      limit: 999,
      remaining: 998,
      reset: Date.now(),
    });
  });

  it('rejects unauthenticated requests before touching GLM', async () => {
    mocks.auth.mockResolvedValue({ userId: null });

    const response = await POST(request({ operation: 'generateScene', brief: 'Make a launch scene' }) as any);
    const body = await json(response);

    expect(response.status).toBe(401);
    expect(body).toMatchObject({ success: false, error: 'Unauthorized' });
    expect(mocks.checkExpensiveRateLimit).not.toHaveBeenCalled();
    expect(mocks.generateFreeformRemotionScene).not.toHaveBeenCalled();
  });

  it('feature-gates the GLM boundary', async () => {
    process.env.EDITRON_FREEFORM_GLM_ENABLED = 'false';

    const response = await POST(request({ operation: 'generateScene', brief: 'Make a launch scene' }) as any);
    const body = await json(response);

    expect(response.status).toBe(503);
    expect(body).toMatchObject({ success: false, error: 'Editron freeform GLM is disabled.' });
    expect(mocks.checkExpensiveRateLimit).not.toHaveBeenCalled();
    expect(mocks.generateFreeformRemotionScene).not.toHaveBeenCalled();
  });

  it('rejects invalid operations without spending rate limit', async () => {
    const response = await POST(request({ operation: 'renderNow', brief: 'nope' }) as any);
    const body = await json(response);

    expect(response.status).toBe(400);
    expect(body.error).toContain('operation');
    expect(mocks.checkExpensiveRateLimit).not.toHaveBeenCalled();
  });

  it('generates and instruments a validated scene proposal', async () => {
    mocks.generateFreeformRemotionScene.mockResolvedValue({
      ok: true,
      code: validSceneCode(),
      attempts: 1,
      repaired: false,
      validation: {
        ok: true,
        diagnostics: [],
        elementCount: 6,
        facts: {
          hasRemotionImport: true,
          hasExportedComponent: true,
          usesFrame: true,
          usesConfig: true,
          usesAnimationPrimitive: true,
          usesSequencePrimitive: true,
        },
      },
    });

    const response = await POST(request({
      operation: 'generateScene',
      brief: 'Make a launch scene',
      filename: 'LaunchScene.tsx',
    }) as any);
    const body = await json(response);

    expect(response.status).toBe(200);
    expect(body).toMatchObject({
      success: true,
      operation: 'generateScene',
      attempts: 1,
      repaired: false,
      trace: {
        fileName: 'LaunchScene.tsx',
      },
    });
    expect(String(body.instrumentedCode)).toContain('data-eid=');
    expect(String(body.instrumentedCode)).toContain('data-source-loc=');
    expect(Array.isArray(body.elements)).toBe(true);
    expect(mocks.generateFreeformRemotionScene).toHaveBeenCalledWith(
      expect.objectContaining({
        brief: 'Make a launch scene',
        filename: 'LaunchScene.tsx',
        maxRepairAttempts: 1,
      }),
    );
  });

  it('returns diagnostics when GLM scene output fails validation', async () => {
    mocks.generateFreeformRemotionScene.mockResolvedValue({
      ok: false,
      reason: 'GLM scene output failed validation after repair.',
      attempts: 2,
      diagnostics: [
        {
          code: 'too_few_jsx_elements',
          severity: 'error',
          message: 'Generated scene needs more elements.',
        },
      ],
      rawCode: '<div />',
    });

    const response = await POST(request({ operation: 'generateScene', brief: 'too tiny' }) as any);
    const body = await json(response);

    expect(response.status).toBe(422);
    expect(body).toMatchObject({
      success: false,
      operation: 'generateScene',
      attempts: 2,
      diagnostics: [{ code: 'too_few_jsx_elements' }],
    });
  });

  it('returns a validated traced element replacement without patching a project', async () => {
    mocks.editTracedElementWithGlm.mockResolvedValue({
      ok: true,
      code: '<h1 data-eid="hero_title" data-source-loc="Scene.tsx:12:4">Ship Faster</h1>',
      attempts: 1,
      repaired: false,
      validation: {
        ok: true,
        diagnostics: [],
        rootTagName: 'h1',
      },
    });

    const response = await POST(request({
      operation: 'editElement',
      elementCode: '<h1 data-eid="hero_title" data-source-loc="Scene.tsx:12:4">Old</h1>',
      instruction: 'Make the title punchier',
      marker: { eid: 'hero_title', sourceLoc: 'Scene.tsx:12:4' },
      expectedTagName: 'h1',
    }) as any);
    const body = await json(response);

    expect(response.status).toBe(200);
    expect(body).toMatchObject({
      success: true,
      operation: 'editElement',
      replacementCode: '<h1 data-eid="hero_title" data-source-loc="Scene.tsx:12:4">Ship Faster</h1>',
      validation: { rootTagName: 'h1' },
    });
    expect(mocks.editTracedElementWithGlm).toHaveBeenCalledWith(
      expect.objectContaining({
        instruction: 'Make the title punchier',
        marker: { eid: 'hero_title', sourceLoc: 'Scene.tsx:12:4' },
        maxRepairAttempts: 1,
      }),
    );
  });
});

function request(body: unknown): Request {
  return new Request('http://localhost/api/services/editron/freeform', {
    method: 'POST',
    body: JSON.stringify(body),
  });
}

async function json(response: Response): Promise<Record<string, unknown>> {
  return (await response.json()) as Record<string, unknown>;
}

function validSceneCode(): string {
  return `
import { AbsoluteFill, Sequence, interpolate, useCurrentFrame, useVideoConfig } from 'remotion';

export const LaunchScene = () => {
  const frame = useCurrentFrame();
  const { durationInFrames } = useVideoConfig();
  const opacity = interpolate(frame, [0, durationInFrames - 1], [0.2, 1]);

  return (
    <AbsoluteFill style={{ background: '#101820', color: 'white' }}>
      <section style={{ padding: 72, opacity }}>
        <Sequence from={0}>
          <div>
            <p>EDITRON</p>
            <h1>Freeform scenes, safely traced</h1>
            <div>
              <span>Trace</span>
              <span>Edit</span>
              <span>Render</span>
            </div>
          </div>
        </Sequence>
      </section>
    </AbsoluteFill>
  );
};
`;
}
