import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import { classifyChatProviderFailure } from '@/lib/editron/agent/chat-provider-failure';

describe('chat provider failure classification', () => {
  it('treats depleted prepaid credits as terminal and safe to expose', () => {
    expect(classifyChatProviderFailure(new Error(
      '[GoogleGenerativeAI Error] [429 Too Many Requests] Your prepayment credits are depleted.',
    ))).toEqual({
      code: 'CHAT_PROVIDER_CREDITS_DEPLETED',
      httpStatus: 503,
      retryable: false,
      message: 'AI editing is temporarily unavailable because the configured model provider has no prepaid balance. No edit was applied and no chat credits were charged.',
    });
  });

  it('distinguishes revoked credentials from transient throttling', () => {
    expect(classifyChatProviderFailure({ status: 403, message: 'Your API key was reported as leaked.' }))
      .toMatchObject({ code: 'CHAT_PROVIDER_CREDENTIAL_REVOKED', retryable: false });
    expect(classifyChatProviderFailure({ status: 429, message: 'RESOURCE_EXHAUSTED: rate limit exceeded' }))
      .toMatchObject({ code: 'CHAT_PROVIDER_RATE_LIMITED', retryable: true, retryAfterSeconds: 60 });
  });

  it('classifies provider timeouts and upstream outages as retryable', () => {
    expect(classifyChatProviderFailure(new Error('fetch timed out after 120000ms')))
      .toMatchObject({ code: 'CHAT_PROVIDER_TIMEOUT', httpStatus: 504, retryable: true });
    expect(classifyChatProviderFailure({ status: 503, message: 'service unavailable' }))
      .toMatchObject({ code: 'CHAT_PROVIDER_UNAVAILABLE', httpStatus: 503, retryable: true });
  });

  it('does not relabel ordinary application failures as provider failures', () => {
    expect(classifyChatProviderFailure(new Error('Project not found'))).toBeNull();
  });

  it('is wired into both pre-stream and in-stream route failure paths', () => {
    const source = readFileSync(join(
      process.cwd(),
      'app/api/services/editron/chat/stream/route.ts',
    ), 'utf8');
    expect(source.match(/classifyChatProviderFailure\(error\)/g)).toHaveLength(2);
    expect(source).toContain("code: providerFailure.code, retryable: providerFailure.retryable");
    expect(source).toContain("'Retry-After': String(providerFailure.retryAfterSeconds)");
  });
});
