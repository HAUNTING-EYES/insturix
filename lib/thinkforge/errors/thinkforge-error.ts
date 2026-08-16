export type ThinkForgeError =
  | {
      type: 'generation_temporarily_unavailable';
      message: string;
      retryable: true;
    }
  | {
      type: 'contract_violation';
      message: string;
      retryable: false;
    }
  | {
      type: 'needs_user_input';
      code: string;
      message: string;
      retryable: false;
    }
  | {
      type: 'internal_error';
      message: string;
      retryable: false;
    };

export function isGenerationTemporarilyUnavailable(error: unknown): boolean {
  const err = error as any;
  const status = err?.status || err?.statusCode || err?.response?.status;
  const code = String(err?.code || '').toLowerCase();
  const message = String(err?.message || '').toLowerCase();

  if (status === 503 || status === 529) return true;
  if (code.includes('overload') || code.includes('timeout')) return true;
  if (message.includes('overload') || message.includes('temporarily unavailable')) return true;
  if (message.includes('timeout') || message.includes('rate limit') || message.includes('too many requests')) return true;

  return false;
}

export function isContractViolation(error: unknown): boolean {
  const message = String((error as any)?.message || '');
  return (
    message.includes('Invalid AgentScriptResponse') ||
    message.includes('Invalid JSON from ScriptAuthorAgent') ||
    message.includes('Invalid JSON after extraction') ||
    message.includes('Invalid JSON: unable to extract JSON object')
  );
}

const ACTIONABLE_AUTHORING_ERROR_CODES = new Set([
  'PUBLISHING_REQUEST_INCOMPATIBLE',
  'POST_TARGET_NOT_PUBLISHABLE',
  'SCRIPT_REQUIRES_CHAPTERED_GENERATION',
]);

export function isActionableAuthoringError(error: unknown): boolean {
  const code = String((error as { code?: unknown } | null)?.code ?? '');
  return ACTIONABLE_AUTHORING_ERROR_CODES.has(code);
}

export function toThinkForgeErrorResponse(error: unknown): { status: number; body: { error: ThinkForgeError } } {
  if (isActionableAuthoringError(error)) {
    const actionable = error as { code: string; message?: string };
    return {
      status: 422,
      body: {
        error: {
          type: 'needs_user_input',
          code: actionable.code,
          message: actionable.message || 'The authoring request needs an explicit compatible choice.',
          retryable: false,
        },
      },
    };
  }

  if (isContractViolation(error)) {
    return {
      status: 500,
      body: {
        error: {
          type: 'contract_violation',
          message: 'The generation failed due to invalid agent output.',
          retryable: false,
        },
      },
    };
  }

  if (isGenerationTemporarilyUnavailable(error)) {
    return {
      status: 503,
      body: {
        error: {
          type: 'generation_temporarily_unavailable',
          message: 'Generation is temporarily unavailable. Please retry shortly.',
          retryable: true,
        },
      },
    };
  }

  return {
    status: 500,
    body: {
      error: {
        type: 'internal_error',
        message: 'An unexpected error occurred.',
        retryable: false,
      },
    },
  };
}
