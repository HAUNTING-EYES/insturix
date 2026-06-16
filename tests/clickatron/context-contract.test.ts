import { describe, expect, it } from 'vitest';
import { ClickatronTask } from '../../schemas/Clickatron';
import { CreateSessionRequestSchema } from '../../types/clickatron';

describe('Clickatron context contract', () => {
  it('accepts durable cross-service context on session creation', () => {
    const parsed = CreateSessionRequestSchema.parse({
      prompt: 'Create a launch thumbnail',
      aspectRatio: '16:9',
      modelId: 'fal-ai/flux-kontext/dev',
      sourceService: 'thinkforge',
      sourceSessionId: 'tf_session_123',
      sourceScriptId: 'script_456',
      universalId: 'plink_789',
      brandId: 'brand_abc',
      projectId: 'proj_def',
      metadata: '{"handoff":"think-to-click"}',
    });

    expect(parsed).toMatchObject({
      sourceService: 'thinkforge',
      sourceSessionId: 'tf_session_123',
      sourceScriptId: 'script_456',
      universalId: 'plink_789',
      brandId: 'brand_abc',
      projectId: 'proj_def',
      metadata: { handoff: 'think-to-click' },
    });
  });

  it('accepts absent source context for native Clickatron blank sessions', () => {
    const parsed = CreateSessionRequestSchema.parse({
      prompt: '',
      aspectRatio: '16:9',
      modelId: 'fal-ai/flux-kontext/dev',
      brandId: null,
      projectId: null,
      universalId: null,
      sourceService: null,
      sourceSessionId: null,
      sourceScriptId: null,
      metadata: null,
    });

    expect(parsed.sourceService).toBeUndefined();
    expect(parsed.sourceSessionId).toBeUndefined();
    expect(parsed.sourceScriptId).toBeUndefined();
  });

  it('rejects malformed metadata instead of silently dropping it', () => {
    expect(() =>
      CreateSessionRequestSchema.parse({
        prompt: 'Create a launch thumbnail',
        metadata: '{"handoff":',
      }),
    ).toThrow();
  });

  it('keeps task context and variation metadata in the Mongo document shape', () => {
    const task = new ClickatronTask({
      clerkUserId: 'user_123',
      brandId: 'brand_abc',
      projectId: 'proj_def',
      universalId: 'plink_789',
      sourceService: 'thinkforge',
      sourceSessionId: 'tf_session_123',
      sourceScriptId: 'script_456',
      metadata: {
        handoff: 'think-to-click',
        sourceContext: {
          sourceService: 'thinkforge',
          sourceSessionId: 'tf_session_123',
          sourceScriptId: 'script_456',
          universalId: 'plink_789',
          brandId: 'brand_abc',
          projectId: 'proj_def',
        },
      },
      details: {
        videoIdea: 'Create a launch thumbnail',
        aspectRatio: '16:9',
        canvas: {
          variations: [
            {
              id: 'variation_123',
              prompt: 'Create a launch thumbnail',
              imageRef: '',
              thumbnailRef: '',
              status: 'blank',
              aspectRatio: '16:9',
              fineTuning: { brightness: 100, contrast: 100, saturation: 100 },
              modelId: 'fal-ai/flux-kontext/dev',
              metadata: {
                sourceContext: {
                  sourceService: 'thinkforge',
                  sourceSessionId: 'tf_session_123',
                  sourceScriptId: 'script_456',
                  universalId: 'plink_789',
                  brandId: 'brand_abc',
                  projectId: 'proj_def',
                },
              },
            },
          ],
          chatHistory: [],
        },
      },
    });

    const object = task.toObject();

    expect(object.brandId).toBe('brand_abc');
    expect(object.projectId).toBe('proj_def');
    expect(object.universalId).toBe('plink_789');
    expect(object.sourceService).toBe('thinkforge');
    expect(object.sourceSessionId).toBe('tf_session_123');
    expect(object.sourceScriptId).toBe('script_456');
    expect(object.metadata?.sourceContext).toMatchObject({
      sourceService: 'thinkforge',
      brandId: 'brand_abc',
    });
    expect(object.details.canvas.variations[0].metadata.sourceContext).toMatchObject({
      sourceService: 'thinkforge',
      universalId: 'plink_789',
    });
  });
});
