import { createHash } from 'node:crypto';

import { describe, expect, it } from 'vitest';

import { hashCanonicalJsonV1 } from '@/lib/editron/research/open-ended-planner/contracts-v1';
import {
  normalizeProviderResponseV2,
  ProviderCodecErrorV2,
  serializeProviderRequestV2,
  type ProviderKindV2,
  type ProviderRouteV2,
} from '@/lib/editron/research/open-ended-planner/provider-codecs-v2';
import {
  buildDevelopmentStageOnePacketsV2,
  type HashedStagePacketV2,
} from '@/lib/editron/research/open-ended-planner/staged-packet-v2';

describe('open-ended planner V2 provider codecs', () => {
  it('serializes the exact packet schema through each honest provider envelope', async () => {
    for (const kind of ['openai', 'google', 'deepseek'] as const) {
      const artifact = textPacket();
      const request = await serializeProviderRequestV2({
        route: route(kind), artifact, attempt: 1, outputBudget: { visible: 1200, reasoning: 1800 },
      });
      expect(request.requestHash).toMatch(/^[a-f0-9]{64}$/);
      expect(request.promptHash).toMatch(/^[a-f0-9]{64}$/);
      if (kind === 'openai') {
        expect(request.endpoint).toBe('https://api.openai.com/v1/responses');
        expect(record(record(request.body.text).format).schema).toEqual(artifact.packet.outputContract);
        expect(request.body.max_output_tokens).toBe(3000);
      } else if (kind === 'google') {
        expect(request.endpoint).toContain(encodeURIComponent(route(kind).model));
        expect(record(request.body.generationConfig).responseJsonSchema).toEqual(artifact.packet.outputContract);
        expect(record(record(request.body.generationConfig).thinkingConfig).thinkingBudget).toBe(1800);
      } else {
        expect(record(request.body.response_format).type).toBe('json_object');
        expect(request.body.max_tokens).toBe(3000);
        const prompt = record((request.body.messages as unknown[])[0]).content;
        expect(String(prompt)).toContain('ReferenceBlueprintV2');
      }
    }
  });

  it('embeds verified image bytes for OpenAI and all frozen media types for Google', async () => {
    const image = mediaPacket('image/png', Buffer.from('verified-image'));
    const openAI = await serializeProviderRequestV2({
      route: route('openai'), artifact: image.artifact, attempt: 1,
      outputBudget: { visible: 100, reasoning: 50 }, readAttachmentBytes: async () => image.bytes,
    });
    const input = (openAI.body.input as Array<{ content: unknown[] }>)[0];
    expect(record(input.content[1]).image_url).toBe(`data:image/png;base64,${image.bytes.toString('base64')}`);

    for (const mimeType of ['image/png', 'audio/wav', 'video/mp4']) {
      const media = mediaPacket(mimeType, Buffer.from(`verified-${mimeType}`));
      const google = await serializeProviderRequestV2({
        route: route('google'), artifact: media.artifact, attempt: 1,
        outputBudget: { visible: 100, reasoning: 50 }, readAttachmentBytes: async () => media.bytes,
      });
      const parts = (record((google.body.contents as unknown[])[0]).parts as unknown[]);
      expect(record(record(parts[1]).inlineData).mimeType).toBe(mimeType);
    }
  });

  it('fails unsupported media and tampered bytes instead of degrading the input arm', async () => {
    const video = mediaPacket('video/mp4', Buffer.from('video'));
    await expect(serializeProviderRequestV2({
      route: route('openai'), artifact: video.artifact, attempt: 1,
      outputBudget: { visible: 100, reasoning: 50 }, readAttachmentBytes: async () => video.bytes,
    })).rejects.toMatchObject({ code: 'UNSUPPORTED_MODALITY' } satisfies Partial<ProviderCodecErrorV2>);

    const image = mediaPacket('image/png', Buffer.from('image'));
    await expect(serializeProviderRequestV2({
      route: route('openai'), artifact: image.artifact, attempt: 1,
      outputBudget: { visible: 100, reasoning: 50 }, readAttachmentBytes: async () => Buffer.from('tampered'),
    })).rejects.toMatchObject({ code: 'ATTACHMENT_INTEGRITY' } satisfies Partial<ProviderCodecErrorV2>);
  });

  it('preserves OpenAI finish, cache-write, cache-hit, and reasoning telemetry', () => {
    const response = normalizeProviderResponseV2('openai', {
      id: 'resp-1', status: 'completed',
      output: [{ content: [{ type: 'output_text', text: '{}' }] }],
      usage: {
        input_tokens: 100, output_tokens: 40, total_tokens: 140,
        input_tokens_details: { cached_tokens: 20, cache_write_tokens: 10 },
        output_tokens_details: { reasoning_tokens: 15 },
      },
    });
    expect(response).toMatchObject({
      providerRequestId: 'resp-1', finishReason: 'completed', text: '{}',
      usage: {
        inputTokens: 100, cachedInputTokens: 20, cacheWriteInputTokens: 10,
        visibleOutputTokens: 25, reasoningTokens: 15, totalTokens: 140,
      },
    });
  });

  it('keeps Google thought tokens and DeepSeek cache misses distinct', () => {
    const google = normalizeProviderResponseV2('google', {
      responseId: 'google-1', candidates: [{ finishReason: 'STOP', content: { parts: [{ text: '{}' }] } }],
      usageMetadata: {
        promptTokenCount: 80, cachedContentTokenCount: 30, candidatesTokenCount: 20,
        thoughtsTokenCount: 12, totalTokenCount: 112,
      },
    });
    expect(google.usage).toEqual({
      inputTokens: 80, cachedInputTokens: 30, visibleOutputTokens: 20, reasoningTokens: 12, totalTokens: 112,
    });
    const deepseek = normalizeProviderResponseV2('deepseek', {
      id: 'deepseek-1', choices: [{ finish_reason: 'stop', message: { content: '{}' } }],
      usage: {
        prompt_tokens: 90, prompt_cache_hit_tokens: 25, prompt_cache_miss_tokens: 65,
        completion_tokens: 35, completion_tokens_details: { reasoning_tokens: 10 }, total_tokens: 125,
      },
    });
    expect(deepseek.usage).toEqual({
      inputTokens: 90, cachedInputTokens: 25, cacheMissInputTokens: 65,
      visibleOutputTokens: 25, reasoningTokens: 10, totalTokens: 125,
    });
  });

  it('does not manufacture missing token counts', () => {
    const response = normalizeProviderResponseV2('openai', {
      id: 'resp-missing', status: 'completed', output: [{ content: [{ type: 'output_text', text: '{}' }] }],
      usage: { input_tokens: 10, output_tokens: 4 },
    });
    expect(response.usage).toEqual({ inputTokens: 10 });
    expect(response.usage.reasoningTokens).toBeUndefined();
    expect(response.usage.visibleOutputTokens).toBeUndefined();
  });
});

function textPacket(): HashedStagePacketV2 {
  const packet = buildDevelopmentStageOnePacketsV2().find(({ packet: value }) =>
    value.taskId === 'DEV-01' && value.conditionId === 'BASELINE' && value.inputArm === 'TEXT_EVIDENCE_ONLY');
  if (!packet) throw new Error('Missing DEV-01 text packet');
  return packet;
}

function mediaPacket(mimeType: string, bytes: Buffer): { artifact: HashedStagePacketV2; bytes: Buffer } {
  const base = textPacket();
  const artifactSha256 = `sha256:${createHash('sha256').update(bytes).digest('hex')}`;
  const attachment = { assetId: 'synthetic-media', mimeType, artifactPath: 'not-read-directly', artifactSha256, bytes: bytes.length };
  const packet = {
    ...base.packet,
    inputArm: 'MULTIMODAL' as const,
    modelInput: {
      ...base.packet.modelInput,
      mediaDescriptors: [{ assetId: attachment.assetId, mimeType, artifactSha256 }],
      mediaPolicy: 'ATTACH_HASH_BOUND_MEDIA',
    },
  };
  const attachments = [attachment];
  return {
    artifact: {
      packet, packetHash: hashCanonicalJsonV1(packet), transportAttachments: attachments,
      transportHash: hashCanonicalJsonV1(attachments),
    },
    bytes,
  };
}

function route(kind: ProviderKindV2): ProviderRouteV2 {
  return { kind, apiKey: 'test-key', model: `${kind}-test-model`, modelSnapshot: `${kind}-snapshot`, reasoningMode: 'medium' };
}
function record(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {};
}
