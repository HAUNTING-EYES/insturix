import { getClickatronModelPromptMaxLength } from '@/lib/config/clickatron-models';
import {
  GENERATIVE_FILL_SYSTEM_PROMPT,
  IMAGE_TO_IMAGE_SYSTEM_PROMPT,
} from '@/lib/clickatron/fill-prompts';

export interface ClickatronGenerationPromptSegment {
  id: string;
  content: string | null | undefined;
  required: boolean;
  priority?: number;
}

export type ClickatronGenerationPromptMode =
  | 'text-to-image'
  | 'image-to-image'
  | 'inpainting';

export interface CompileClickatronGenerationPromptInput {
  modelId?: string | null;
  generationMode?: ClickatronGenerationPromptMode;
  segments: readonly ClickatronGenerationPromptSegment[];
  fallbackMaxLength?: number;
}

export interface CompiledClickatronGenerationPrompt {
  prompt: string;
  maxPromptLength: number;
  providerPrefixReserveCharacters: number;
  omittedSegmentIds: string[];
}

export const CLICKATRON_PROMPT_REQUIRED_CONTEXT_EXCEEDS_MODEL_LIMIT =
  'CLICKATRON_PROMPT_REQUIRED_CONTEXT_EXCEEDS_MODEL_LIMIT';

export class ClickatronPromptBudgetError extends Error {
  readonly code = CLICKATRON_PROMPT_REQUIRED_CONTEXT_EXCEEDS_MODEL_LIMIT;

  constructor(readonly details: {
    modelId?: string | null;
    maxPromptLength: number;
    providerPrefixReserveCharacters: number;
    requiredLength: number;
    requiredSegmentIds: string[];
  }) {
    super(
      `The selected image model cannot preserve the required creative context `
      + `(${details.requiredLength}/${details.maxPromptLength - details.providerPrefixReserveCharacters} characters). `
      + `Choose a model with a larger prompt limit or shorten the request.`,
    );
    this.name = 'ClickatronPromptBudgetError';
  }
}

function normalizeSegmentContent(value: string): string {
  return value.replace(/\s+/g, ' ').trim();
}

function providerPrefixReserveCharacters(
  generationMode?: ClickatronGenerationPromptMode,
): number {
  if (generationMode !== 'image-to-image' && generationMode !== 'inpainting') return 0;

  return Math.max(
    GENERATIVE_FILL_SYSTEM_PROMPT.trim().length,
    IMAGE_TO_IMAGE_SYSTEM_PROMPT.trim().length,
  ) + '\n\nUser Request: '.length;
}

/**
 * Compiles generation intent against the actual selected model limit. Required
 * segments are never shortened or displaced by prompt boilerplate. Optional
 * context is included in priority order only when it fits intact.
 */
export function compileClickatronGenerationPrompt(
  input: CompileClickatronGenerationPromptInput,
): CompiledClickatronGenerationPrompt {
  const maxPromptLength = getClickatronModelPromptMaxLength(input.modelId)
    ?? input.fallbackMaxLength
    ?? 6000;
  const reserve = providerPrefixReserveCharacters(input.generationMode);
  const availableLength = maxPromptLength - reserve;
  const segments = input.segments
    .map((segment, index) => ({
      ...segment,
      content: segment.content ? normalizeSegmentContent(segment.content) : '',
      index,
    }))
    .filter((segment) => segment.content.length > 0);
  const required = segments.filter((segment) => segment.required);
  const requiredPrompt = required.map((segment) => segment.content).join('\n');

  if (availableLength < 1 || requiredPrompt.length > availableLength) {
    throw new ClickatronPromptBudgetError({
      modelId: input.modelId,
      maxPromptLength,
      providerPrefixReserveCharacters: reserve,
      requiredLength: requiredPrompt.length,
      requiredSegmentIds: required.map((segment) => segment.id),
    });
  }

  const output = requiredPrompt ? [...required] : [];
  const omittedSegmentIds: string[] = [];
  const optional = segments
    .filter((segment) => !segment.required)
    .sort((left, right) => (right.priority ?? 0) - (left.priority ?? 0) || left.index - right.index);

  let currentLength = requiredPrompt.length;
  for (const segment of optional) {
    const separatorLength = currentLength > 0 ? 1 : 0;
    if (currentLength + separatorLength + segment.content.length <= availableLength) {
      output.push(segment);
      currentLength += separatorLength + segment.content.length;
    } else {
      omittedSegmentIds.push(segment.id);
    }
  }

  return {
    prompt: output.map((segment) => segment.content).join('\n'),
    maxPromptLength,
    providerPrefixReserveCharacters: reserve,
    omittedSegmentIds,
  };
}
