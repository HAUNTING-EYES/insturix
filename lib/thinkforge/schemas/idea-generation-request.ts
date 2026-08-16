import { z } from 'zod';
import { ThinkForgeAuthoringRequestSchema } from './authoring-request';

export const ThinkForgeIdeaBrandScopeSchema = z.discriminatedUnion('mode', [
  z.object({
    mode: z.literal('brand'),
    brandId: z.string().trim().min(1).max(200),
  }).strict(),
  z.object({
    mode: z.literal('unbranded'),
    reason: z.literal('no_authorized_brands'),
  }).strict(),
]);

export type ThinkForgeIdeaBrandScope = z.infer<typeof ThinkForgeIdeaBrandScopeSchema>;

const RejectedIdeaEvidenceSchema = z.object({
  title: z.string().trim().min(1).max(120),
  purpose: z.string().trim().min(1).max(240).optional(),
  style: z.string().trim().min(1).max(120).optional(),
}).strict();

export const ThinkForgeIdeaGenerationRequestSchema = z.object({
  prompt: z.string().trim().min(1).max(12_000),
  authoringRequest: ThinkForgeAuthoringRequestSchema,
  brandScope: ThinkForgeIdeaBrandScopeSchema,
  variationIndex: z.number().int().min(0).max(1_000).default(0),
  rejectedIdeas: z.array(RejectedIdeaEvidenceSchema).max(12).default([]),
}).strict();

export type ThinkForgeIdeaGenerationRequest = z.infer<typeof ThinkForgeIdeaGenerationRequestSchema>;

export type ThinkForgeIdeaBrandScopeResolution =
  | { status: 'pending' }
  | { status: 'selection_required' }
  | { status: 'ready'; scope: ThinkForgeIdeaBrandScope };

export function resolveThinkForgeIdeaBrandScope(input: {
  activeBrandId?: string | null;
  availableBrandCount: number;
  brandListSettled: boolean;
}): ThinkForgeIdeaBrandScopeResolution {
  if (!Number.isInteger(input.availableBrandCount) || input.availableBrandCount < 0) {
    throw new Error('availableBrandCount must be a non-negative integer');
  }
  if (!input.brandListSettled) return { status: 'pending' };

  const activeBrandId = input.activeBrandId?.trim();
  if (activeBrandId) {
    return { status: 'ready', scope: { mode: 'brand', brandId: activeBrandId } };
  }
  if (input.availableBrandCount === 0) {
    return {
      status: 'ready',
      scope: { mode: 'unbranded', reason: 'no_authorized_brands' },
    };
  }
  return { status: 'selection_required' };
}

export function createThinkForgeIdeaGenerationRequest(
  input: ThinkForgeIdeaGenerationRequest,
): ThinkForgeIdeaGenerationRequest {
  return ThinkForgeIdeaGenerationRequestSchema.parse(input);
}
