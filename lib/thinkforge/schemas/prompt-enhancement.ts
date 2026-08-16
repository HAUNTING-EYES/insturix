import { z } from 'zod';
import {
  ThinkForgeAuthoringRequestSchema,
  type ThinkForgeAuthoringRequest,
} from './authoring-request';

export const THINKFORGE_PROMPT_ENHANCEMENT_VERSION = 1;

export const ThinkForgePromptEnhancementRequestSchema = z.object({
  version: z.number().int(),
  prompt: z.string().trim().min(1).max(8_000),
  authoringRequest: ThinkForgeAuthoringRequestSchema,
}).strict().superRefine((request, ctx) => {
  if (request.version !== THINKFORGE_PROMPT_ENHANCEMENT_VERSION) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['version'],
      message: 'unsupported prompt enhancement request version',
    });
  }
});

export type ThinkForgePromptEnhancementRequest = z.infer<
  typeof ThinkForgePromptEnhancementRequestSchema
>;

export function createThinkForgePromptEnhancementRequest(input: {
  prompt: string;
  authoringRequest: ThinkForgeAuthoringRequest;
}): ThinkForgePromptEnhancementRequest {
  return ThinkForgePromptEnhancementRequestSchema.parse({
    version: THINKFORGE_PROMPT_ENHANCEMENT_VERSION,
    ...input,
  });
}
