export type ChatProviderFailureCode =
  | 'CHAT_PROVIDER_CREDITS_DEPLETED'
  | 'CHAT_PROVIDER_CREDENTIAL_REVOKED'
  | 'CHAT_PROVIDER_RATE_LIMITED'
  | 'CHAT_PROVIDER_TIMEOUT'
  | 'CHAT_PROVIDER_UNAVAILABLE';

export interface ChatProviderFailure {
  code: ChatProviderFailureCode;
  httpStatus: 503 | 504;
  retryable: boolean;
  message: string;
  retryAfterSeconds?: number;
}

export function classifyChatProviderFailure(error: unknown): ChatProviderFailure | null {
  const message = providerErrorMessage(error);
  const status = providerErrorStatus(error);
  const normalized = message.toLowerCase();

  if (/prepayment credits? (?:are )?depleted|billing.*(?:disabled|depleted)/i.test(message)) {
    return {
      code: 'CHAT_PROVIDER_CREDITS_DEPLETED',
      httpStatus: 503,
      retryable: false,
      message: 'AI editing is temporarily unavailable because the configured model provider has no prepaid balance. No edit was applied and no chat credits were charged.',
    };
  }

  if (
    /api key was reported as leaked|api key.*(?:revoked|invalid)|permission_denied/i.test(message)
    && (status === 401 || status === 403 || normalized.includes('api key'))
  ) {
    return {
      code: 'CHAT_PROVIDER_CREDENTIAL_REVOKED',
      httpStatus: 503,
      retryable: false,
      message: 'AI editing is temporarily unavailable because its model-provider credential is invalid or revoked. No edit was applied and no chat credits were charged.',
    };
  }

  if (
    /timed? out|timeout|deadline exceeded|etimedout|aborterror/i.test(message)
    || status === 408
    || status === 504
  ) {
    return {
      code: 'CHAT_PROVIDER_TIMEOUT',
      httpStatus: 504,
      retryable: true,
      retryAfterSeconds: 15,
      message: 'The AI editing provider timed out before completing this request. No partial edit was kept and no chat credits were charged.',
    };
  }

  if (
    status === 429
    || /resource_exhausted|rate limit|too many requests|quota exceeded/i.test(message)
  ) {
    return {
      code: 'CHAT_PROVIDER_RATE_LIMITED',
      httpStatus: 503,
      retryable: true,
      retryAfterSeconds: 60,
      message: 'The AI editing provider is temporarily rate-limited. No partial edit was kept and no chat credits were charged.',
    };
  }

  if (
    (status != null && status >= 500 && status <= 599)
    || /service unavailable|temporarily unavailable|bad gateway|internal provider error/i.test(message)
  ) {
    return {
      code: 'CHAT_PROVIDER_UNAVAILABLE',
      httpStatus: 503,
      retryable: true,
      retryAfterSeconds: 30,
      message: 'The AI editing provider is temporarily unavailable. No partial edit was kept and no chat credits were charged.',
    };
  }

  return null;
}

function providerErrorMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  if (typeof error === 'string') return error;
  if (error && typeof error === 'object') {
    const candidate = error as Record<string, unknown>;
    if (typeof candidate.message === 'string') return candidate.message;
    if (typeof candidate.error === 'string') return candidate.error;
  }
  return '';
}

function providerErrorStatus(error: unknown): number | null {
  if (!error || typeof error !== 'object') return statusFromMessage(providerErrorMessage(error));
  const candidate = error as Record<string, unknown>;
  const direct = Number(candidate.status ?? candidate.statusCode ?? candidate.code);
  return Number.isInteger(direct) && direct >= 100 && direct <= 599
    ? direct
    : statusFromMessage(providerErrorMessage(error));
}

function statusFromMessage(message: string): number | null {
  const match = message.match(/(?:http\s*)?\[?(4\d\d|5\d\d)(?:\s|\]|:)/i);
  return match ? Number(match[1]) : null;
}
