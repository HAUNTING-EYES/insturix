import { describe, expect, it } from 'vitest';
import {
  createThinkForgeIdeaGenerationRequest,
  resolveThinkForgeIdeaBrandScope,
  ThinkForgeIdeaGenerationRequestSchema,
} from '@/lib/thinkforge/schemas/idea-generation-request';
import {
  createDefaultThinkForgePostControls,
  createThinkForgeAuthoringRequest,
} from '@/lib/thinkforge/schemas/authoring-request';
import { createThinkForgeWriterContract } from '@/lib/thinkforge/schemas/document-contract';

const authoringRequest = createThinkForgeAuthoringRequest({
  contentContract: createThinkForgeWriterContract('social_post'),
  platformSurface: { id: 'linkedin' },
  postControls: createDefaultThinkForgePostControls(),
});

describe('ThinkForge idea generation request authority', () => {
  it('uses the validated active brand without accepting stale session metadata', () => {
    const resolution = resolveThinkForgeIdeaBrandScope({
      activeBrandId: 'brand_b',
      availableBrandCount: 2,
      brandListSettled: true,
    });
    expect(resolution).toEqual({
      status: 'ready',
      scope: { mode: 'brand', brandId: 'brand_b' },
    });
    if (resolution.status !== 'ready') throw new Error('Expected a ready brand scope');

    expect(createThinkForgeIdeaGenerationRequest({
      prompt: 'Create a launch post.',
      authoringRequest,
      brandScope: resolution.scope,
      variationIndex: 0,
      rejectedIdeas: [],
    }).brandScope).toEqual({ mode: 'brand', brandId: 'brand_b' });
  });

  it('does not interpret loading or a missing selection as unbranded intent', () => {
    expect(resolveThinkForgeIdeaBrandScope({
      activeBrandId: null,
      availableBrandCount: 0,
      brandListSettled: false,
    })).toEqual({ status: 'pending' });
    expect(resolveThinkForgeIdeaBrandScope({
      activeBrandId: null,
      availableBrandCount: 2,
      brandListSettled: true,
    })).toEqual({ status: 'selection_required' });
  });

  it('allows an explicit unbranded claim only for an empty settled brand list', () => {
    expect(resolveThinkForgeIdeaBrandScope({
      activeBrandId: null,
      availableBrandCount: 0,
      brandListSettled: true,
    })).toEqual({
      status: 'ready',
      scope: { mode: 'unbranded', reason: 'no_authorized_brands' },
    });
  });

  it('rejects legacy duplicate brand authority fields', () => {
    const base = {
      prompt: 'Create a launch post.',
      authoringRequest,
      brandScope: { mode: 'brand', brandId: 'brand_b' },
      variationIndex: 0,
      rejectedIdeas: [],
    };

    expect(ThinkForgeIdeaGenerationRequestSchema.safeParse({
      ...base,
      brandId: 'brand_a',
    }).success).toBe(false);
    expect(ThinkForgeIdeaGenerationRequestSchema.safeParse({
      ...base,
      projectMeta: { brandId: 'brand_a' },
    }).success).toBe(false);
  });
});
