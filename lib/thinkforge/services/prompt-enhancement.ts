import type { ThinkForgeAuthoringRequest } from '../schemas/authoring-request';
import type { ThinkForgeWriterKind } from '../schemas/document-contract';

type PromptEnhancementPolicy = (request: ThinkForgeAuthoringRequest) => string;

const PROMPT_ENHANCEMENT_POLICIES: Record<ThinkForgeWriterKind, PromptEnhancementPolicy> = {
  social_post: () => (
    'Expand toward a written social post brief. Define the audience tension, angle, credible support, voice, and intended response. Do not introduce scenes, shots, narration, or video production.'
  ),
  carousel: (request) => (
    `Expand toward a ${request.contentContract.carouselSlideCount}-slide carousel brief. Define one coherent narrative progression and what each stage must accomplish. Preserve the exact slide count; do not convert it into a video or single post.`
  ),
  video_script: () => (
    'Expand toward a video-script brief. Define the narrative spine, audience tension, credible support, and visual-verbal relationship. Preserve the requested runtime when supplied; do not write the final script.'
  ),
};

export function describeThinkForgePromptEnhancementPolicy(
  request: ThinkForgeAuthoringRequest,
): string {
  const outputKind = request.contentContract.outputKind;
  if (!Object.prototype.hasOwnProperty.call(PROMPT_ENHANCEMENT_POLICIES, outputKind)) {
    throw new Error(`unsupported prompt enhancement output kind: ${outputKind}`);
  }
  return PROMPT_ENHANCEMENT_POLICIES[outputKind as ThinkForgeWriterKind](request);
}
