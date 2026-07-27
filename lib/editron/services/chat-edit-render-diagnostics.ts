export type ChatEditRenderIssueModality = 'visual' | 'audio' | 'system';

export function sanitizeChatEditRenderDiagnostic(
  value: unknown,
  maxLength = 500,
): string | null {
  if (typeof value !== 'string') return null;

  const normalized = value
    .replace(/[\u0000-\u001F\u007F]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  if (!normalized) return null;

  const limit = Number.isSafeInteger(maxLength)
    ? Math.max(1, Math.min(maxLength, 2_000))
    : 500;
  if (normalized.length <= limit) return normalized;
  if (limit <= 3) return normalized.slice(0, limit);
  return `${normalized.slice(0, limit - 3)}...`;
}

export function buildChatEditRenderIssue(
  modality: ChatEditRenderIssueModality,
  code: string,
  message: string,
  extra: Record<string, unknown> = {},
): Record<string, unknown> {
  return {
    ...extra,
    modality,
    severity: 'error',
    code: sanitizeChatEditRenderDiagnostic(code, 120) ?? 'render_verification_issue',
    message: sanitizeChatEditRenderDiagnostic(message, 500) ?? 'Rendered verification failed.',
    source: 'chat-edit-render-verification',
  };
}
