import { describe, expect, it } from 'vitest';

import { estimateOpenAiGpt56InputTokensV2 } from '@/lib/editron/research/open-ended-planner/openai-input-token-counter-v2';
import type { SerializedProviderRequestV2 } from '@/lib/editron/research/open-ended-planner/provider-codecs-v2';

describe('open-ended planner V2 OpenAI input token counter', () => {
  it('counts GPT-5.6 input with BPE units instead of UTF-8 bytes', () => {
    const request = providerRequest({
      model: 'gpt-5.6-luna',
      input: [{ role: 'user', content: [{ type: 'input_text', text: 'editorial intent '.repeat(4_000) }] }],
    });
    const bytes = Buffer.byteLength(JSON.stringify(request.body));
    const estimate = estimateOpenAiGpt56InputTokensV2(request);

    expect(bytes).toBeGreaterThan(50_000);
    expect(estimate).toBeGreaterThan(4_000);
    expect(estimate).toBeLessThan(bytes / 2);
  });

  it('counts a hash-bound inline image by allowance rather than base64 length', () => {
    const small = providerRequest(imageBody('YWJj'));
    const large = providerRequest(imageBody('A'.repeat(500_000)));

    expect(estimateOpenAiGpt56InputTokensV2(large)).toBe(
      estimateOpenAiGpt56InputTokensV2(small),
    );
  });

  it('fails closed for an uncalibrated model identity', () => {
    expect(() => estimateOpenAiGpt56InputTokensV2(providerRequest({
      model: 'gpt-6-unknown', input: 'test',
    }))).toThrow(/OPENAI_INPUT_ESTIMATOR_MODEL_UNSUPPORTED/);
  });
});

function imageBody(base64: string): Record<string, unknown> {
  return {
    model: 'gpt-5.6-terra',
    input: [{ role: 'user', content: [{
      type: 'input_image', image_url: `data:image/png;base64,${base64}`, detail: 'auto',
    }] }],
  };
}

function providerRequest(body: Record<string, unknown>): SerializedProviderRequestV2 {
  return {
    endpoint: 'https://api.openai.com/v1/responses',
    headers: {},
    body,
    promptHash: 'prompt-hash',
    requestHash: 'request-hash',
    schemaMode: 'NATIVE_JSON_SCHEMA_NON_STRICT',
  };
}
