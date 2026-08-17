import { getEncoding } from 'js-tiktoken';

import type { SerializedProviderRequestV2 } from './provider-codecs-v2';

const SUPPORTED_MODELS = new Set(['gpt-5.6-luna', 'gpt-5.6-terra']);
const TOKENIZER = getEncoding('o200k_base');
const SAFETY_MARGIN_NUMERATOR = 115;
const SAFETY_MARGIN_DENOMINATOR = 100;
const PROTOCOL_OVERHEAD_TOKENS = 512;
const FROZEN_IMAGE_ALLOWANCE_TOKENS = 2_048;

export const OPENAI_INPUT_ESTIMATOR_VERSION_V2 = 'GPT56_O200K_MARGIN_115_IMAGE_2048_V1';

export function estimateOpenAiGpt56InputTokensV2(
  request: SerializedProviderRequestV2,
): number {
  const model = request.body.model;
  if (typeof model !== 'string' || !SUPPORTED_MODELS.has(model)) {
    throw new Error(`OPENAI_INPUT_ESTIMATOR_MODEL_UNSUPPORTED:${String(model)}`);
  }
  const raw = JSON.stringify(request.body);
  const inlineImageCount = raw.match(/data:image\/(?:png|jpeg|webp);base64,/g)?.length ?? 0;
  const withoutInlineMedia = JSON.stringify(request.body, (key, value: unknown) =>
    (key === 'image_url' || key === 'url') && typeof value === 'string' && value.startsWith('data:')
      ? '[HASH_BOUND_INLINE_IMAGE]'
      : value);
  const measuredTextTokens = TOKENIZER.encode(withoutInlineMedia).length;
  const textWithMargin = Math.ceil(
    measuredTextTokens * SAFETY_MARGIN_NUMERATOR / SAFETY_MARGIN_DENOMINATOR,
  );
  return textWithMargin + PROTOCOL_OVERHEAD_TOKENS
    + inlineImageCount * FROZEN_IMAGE_ALLOWANCE_TOKENS;
}
