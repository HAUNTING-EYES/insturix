import type {
  ChatEditRenderedAudioEvidence,
  ChatEditRenderVerificationRequest,
} from './phase0-rendered-evidence-worker';
import type { ProjectRenderEligibilityAudit } from '../shared/render-request-payload';

export const CHAT_EDIT_RENDER_VERIFICATION_LIFECYCLE_VERSION =
  'editron-chat-render-verification-lifecycle-v1' as const;

export type ChatEditRenderVerificationStatus =
  | 'pending'
  | 'running'
  | 'pass'
  | 'warn'
  | 'fail'
  | 'error';

export type ChatEditRenderVerificationLifecycleState =
  | 'requested'
  | 'dispatched'
  | 'delivered'
  | 'rendering'
  | 'completed'
  | 'failed';

export type ChatEditRenderVerificationTerminalStatus =
  | 'pass'
  | 'quality-warn'
  | 'quality-fail'
  | 'system-error'
  | 'dispatch-error';

export interface ChatEditRenderVerificationLifecycle {
  version: typeof CHAT_EDIT_RENDER_VERIFICATION_LIFECYCLE_VERSION;
  state: ChatEditRenderVerificationLifecycleState;
  terminalStatus: ChatEditRenderVerificationTerminalStatus | null;
  attemptCount: number;
  /** Attempts to hand the durable request to queue transport; separate from worker attempts. */
  dispatchAttemptCount?: number;
  qstashMessageId: string | null;
  /** A short checkpoint-owned lease prevents concurrent recovery sweeps from publishing the same request. */
  dispatchLeaseToken?: string | null;
  dispatchLeaseExpiresAt?: string | null;
  nextDispatchAttemptAt?: string | null;
  lastDispatchError?: string | null;
  workerRequestId: string | null;
  /** Server-generated token for the one worker attempt allowed to finish this record. */
  attemptToken: string | null;
  reason: string | null;
  requestedAt: string;
  dispatchedAt: string | null;
  deliveredAt: string | null;
  renderingAt: string | null;
  terminalAt: string | null;
  updatedAt: string;
}

export interface ChatEditRenderVerificationIssue extends Record<string, unknown> {
  modality: 'visual' | 'audio' | 'system';
  severity: 'info' | 'warn' | 'error' | 'critical';
  code: string;
  message: string;
}

export interface ChatEditRenderVerificationRecord<Visual = unknown, Audio = ChatEditRenderedAudioEvidence> {
  version: 'editron-chat-render-verification-result-v1';
  operationId: string;
  sessionId: string;
  beforeCheckpointId: string;
  afterCheckpointId: string;
  /** Immutable worker input retained by the checkpoint for crash-safe redelivery. */
  request?: ChatEditRenderVerificationRequest;
  /** Immutable ProjectService receipt for the post-mutation state under review. */
  subjectReceipt?: ChatEditRenderVerificationRequest['subjectReceipt'];
  status: ChatEditRenderVerificationStatus;
  requestedAt: string;
  startedAt: string | null;
  completedAt: string | null;
  modalities: ChatEditRenderVerificationRequest['modalities'];
  targets: ChatEditRenderVerificationRequest['targets'];
  inheritedRenderEligibilityOverlayIds?: string[];
  projectRenderEligibility: ProjectRenderEligibilityAudit | null;
  sampleFrames: number[];
  visual: Visual | null;
  audio: Audio | null;
  reasons: string[];
  issues: ChatEditRenderVerificationIssue[];
  dispatchMessageId: string | null;
  notificationStatus: 'pending' | 'sending' | 'sent';
  notificationSentAt: string | null;
  lifecycle: ChatEditRenderVerificationLifecycle;
}

export type PersistedChatEditRenderVerificationRecord<Visual = unknown, Audio = ChatEditRenderedAudioEvidence> =
  Omit<
    ChatEditRenderVerificationRecord<Visual, Audio>,
    'lifecycle' | 'issues' | 'projectRenderEligibility'
  > & {
    lifecycle?: ChatEditRenderVerificationLifecycle;
    issues?: ChatEditRenderVerificationIssue[];
    projectRenderEligibility?: ProjectRenderEligibilityAudit | null;
  };

export function resolveChatEditRenderVerificationStatus(input: {
  requestedModalities: ChatEditRenderVerificationRequest['modalities'];
  visual: { status?: unknown; gateStatus?: unknown } | null;
  audio: { status?: unknown } | null;
}): Extract<ChatEditRenderVerificationStatus, 'pass' | 'warn' | 'fail'> {
  let hasWarning = false;
  if (input.requestedModalities.includes('visual')) {
    if (!input.visual || input.visual.status !== 'completed') return 'fail';
    if (input.visual.gateStatus === 'warn') hasWarning = true;
    else if (input.visual.gateStatus !== 'pass') return 'fail';
  }
  if (input.requestedModalities.includes('audio') && input.audio?.status !== 'pass') {
    return 'fail';
  }
  return hasWarning ? 'warn' : 'pass';
}

export function buildRequestedChatEditRenderVerification(
  request: ChatEditRenderVerificationRequest,
  now: Date | string = new Date(),
): ChatEditRenderVerificationRecord {
  const updatedAt = toIso(now);
  return {
    version: 'editron-chat-render-verification-result-v1',
    operationId: request.operationId,
    sessionId: request.sessionId,
    beforeCheckpointId: request.beforeCheckpointId,
    afterCheckpointId: request.afterCheckpointId,
    request: structuredClone(request),
    ...(request.subjectReceipt ? { subjectReceipt: request.subjectReceipt } : {}),
    status: 'pending',
    requestedAt: request.requestedAt,
    startedAt: null,
    completedAt: null,
    modalities: request.modalities,
    targets: request.targets,
    ...(request.inheritedRenderEligibilityOverlayIds?.length
      ? { inheritedRenderEligibilityOverlayIds: request.inheritedRenderEligibilityOverlayIds }
      : {}),
    projectRenderEligibility: null,
    sampleFrames: request.sampleFrames,
    visual: null,
    audio: null,
    reasons: [],
    issues: [],
    dispatchMessageId: null,
    notificationStatus: 'pending',
    notificationSentAt: null,
    lifecycle: {
      version: CHAT_EDIT_RENDER_VERIFICATION_LIFECYCLE_VERSION,
      state: 'requested',
      terminalStatus: null,
      attemptCount: 0,
      dispatchAttemptCount: 0,
      qstashMessageId: null,
      dispatchLeaseToken: null,
      dispatchLeaseExpiresAt: null,
      nextDispatchAttemptAt: null,
      lastDispatchError: null,
      workerRequestId: null,
      attemptToken: null,
      reason: null,
      requestedAt: request.requestedAt,
      dispatchedAt: null,
      deliveredAt: null,
      renderingAt: null,
      terminalAt: null,
      updatedAt,
    },
  };
}

export function ensureChatEditRenderVerificationLifecycle<Visual, Audio>(
  record: PersistedChatEditRenderVerificationRecord<Visual, Audio>,
  now: Date | string = new Date(),
): ChatEditRenderVerificationRecord<Visual, Audio> {
  if (record.lifecycle?.version === CHAT_EDIT_RENDER_VERIFICATION_LIFECYCLE_VERSION) {
    const reasons = Array.isArray(record.reasons)
      ? record.reasons
          .map((reason) => cleanText(reason, 500))
          .filter((reason): reason is string => Boolean(reason))
      : [];
    const suppliedIssues = sanitizeIssues(record.issues);
    const needsTerminalDiagnostic =
      record.status !== 'pass'
      && ['warn', 'fail', 'error'].includes(record.status)
      && reasons.length === 0
      && suppliedIssues.length === 0;
    const terminalReason = needsTerminalDiagnostic
      ? cleanText(record.lifecycle.reason, 500) ?? 'render_verification_terminal_missing_diagnostic'
      : null;
    const normalizedReasons = terminalReason ? [terminalReason] : reasons;
    const normalizedIssues = suppliedIssues.length > 0
      ? suppliedIssues
      : terminalReason
        ? reasonsToIssues([terminalReason], record.status === 'error' ? 'system' : 'visual')
        : [];
    return {
      ...record,
      projectRenderEligibility: record.projectRenderEligibility ?? null,
      reasons: normalizedReasons,
      issues: normalizedIssues,
      lifecycle: {
        ...record.lifecycle,
        dispatchAttemptCount: normalizeDispatchAttempt(
          (record.lifecycle as { dispatchAttemptCount?: unknown }).dispatchAttemptCount,
        ),
        dispatchLeaseToken: cleanText(
          (record.lifecycle as { dispatchLeaseToken?: unknown }).dispatchLeaseToken,
          240,
        ),
        dispatchLeaseExpiresAt: cleanIsoTimestamp(
          (record.lifecycle as { dispatchLeaseExpiresAt?: unknown }).dispatchLeaseExpiresAt,
        ),
        nextDispatchAttemptAt: cleanIsoTimestamp(
          (record.lifecycle as { nextDispatchAttemptAt?: unknown }).nextDispatchAttemptAt,
        ),
        lastDispatchError: cleanText(
          (record.lifecycle as { lastDispatchError?: unknown }).lastDispatchError,
          500,
        ),
        attemptToken: cleanText(
          (record.lifecycle as { attemptToken?: unknown }).attemptToken,
          240,
        ),
        reason: cleanText(record.lifecycle.reason, 500) ?? normalizedReasons[0] ?? null,
      },
    } as ChatEditRenderVerificationRecord<Visual, Audio>;
  }
  const updatedAt = toIso(now);
  const completed = record.status === 'pass' || record.status === 'warn' || record.status === 'fail';
  const failed = record.status === 'error';
  const state: ChatEditRenderVerificationLifecycleState = completed
    ? 'completed'
    : failed
      ? 'failed'
      : record.status === 'running'
        ? 'rendering'
        : record.dispatchMessageId
          ? 'dispatched'
          : 'requested';
  return {
    ...record,
    projectRenderEligibility: record.projectRenderEligibility ?? null,
    issues: sanitizeIssues((record as { issues?: unknown }).issues),
    lifecycle: {
      version: CHAT_EDIT_RENDER_VERIFICATION_LIFECYCLE_VERSION,
      state,
      terminalStatus: record.status === 'pass'
        ? 'pass'
        : record.status === 'warn'
          ? 'quality-warn'
        : record.status === 'fail'
          ? 'quality-fail'
          : failed
            ? 'system-error'
            : null,
      attemptCount: record.status === 'running' || completed || failed ? 1 : 0,
      dispatchAttemptCount: record.dispatchMessageId ? 1 : 0,
      qstashMessageId: record.dispatchMessageId,
      dispatchLeaseToken: null,
      dispatchLeaseExpiresAt: null,
      nextDispatchAttemptAt: null,
      lastDispatchError: null,
      workerRequestId: null,
      attemptToken: null,
      reason: record.reasons[0] ?? null,
      requestedAt: record.requestedAt,
      dispatchedAt: record.dispatchMessageId ? record.requestedAt : null,
      deliveredAt: record.startedAt,
      renderingAt: record.startedAt,
      terminalAt: record.completedAt,
      updatedAt,
    },
  };
}

export function markChatEditRenderVerificationDispatched<Visual, Audio>(
  record: ChatEditRenderVerificationRecord<Visual, Audio>,
  result: { dispatched: boolean; messageId?: string; reason?: string },
  now: Date | string = new Date(),
): ChatEditRenderVerificationRecord<Visual, Audio> {
  const updatedAt = toIso(now);
  const messageId = cleanText(result.messageId, 240);
  if (!result.dispatched) {
    const reason = cleanText(result.reason, 500) ?? 'render_verification_dispatch_failed';
    return {
      ...record,
      status: 'error',
      completedAt: updatedAt,
      reasons: [reason],
      issues: [{
        modality: 'system',
        severity: 'error',
        code: 'render_verification_dispatch_failed',
        message: reason,
      }],
      dispatchMessageId: messageId,
      lifecycle: {
        ...record.lifecycle,
        state: 'failed',
        terminalStatus: 'dispatch-error',
        qstashMessageId: messageId,
        reason,
        terminalAt: updatedAt,
        updatedAt,
      },
    };
  }

  const state = record.lifecycle.state === 'requested'
    ? 'dispatched'
    : record.lifecycle.state;
  return {
    ...record,
    status: 'pending',
    completedAt: null,
    reasons: [],
    issues: [],
    dispatchMessageId: messageId,
    lifecycle: {
      ...record.lifecycle,
      state,
      terminalStatus: null,
      qstashMessageId: messageId,
      dispatchLeaseToken: null,
      dispatchLeaseExpiresAt: null,
      nextDispatchAttemptAt: null,
      lastDispatchError: null,
      reason: null,
      dispatchedAt: record.lifecycle.dispatchedAt ?? updatedAt,
      updatedAt,
    },
  };
}

/**
 * Moves an abandoned or explicitly failed queue dispatch back to a checkpoint-
 * owned pending state. It does not claim a worker attempt or mutate a project.
 */
export function claimChatEditRenderVerificationDispatchRecovery<Visual, Audio>(
  record: ChatEditRenderVerificationRecord<Visual, Audio>,
  input: {
    leaseToken: string;
    now?: Date | string;
    leaseDurationMs?: number;
  },
): ChatEditRenderVerificationRecord<Visual, Audio> {
  const updatedAt = toIso(input.now ?? new Date());
  const leaseToken = cleanText(input.leaseToken, 240);
  if (!leaseToken) throw new Error('A chat render-verification dispatch recovery requires a lease token.');
  const leaseDurationMs = Number.isSafeInteger(input.leaseDurationMs) && input.leaseDurationMs! > 0
    ? Math.min(input.leaseDurationMs!, 10 * 60_000)
    : 2 * 60_000;
  const expiresAt = new Date(new Date(updatedAt).getTime() + leaseDurationMs).toISOString();
  return {
    ...record,
    status: 'pending',
    completedAt: null,
    reasons: [],
    issues: [],
    lifecycle: {
      ...record.lifecycle,
      state: 'requested',
      terminalStatus: null,
      dispatchAttemptCount: Math.min(100, normalizeDispatchAttempt(record.lifecycle.dispatchAttemptCount) + 1),
      dispatchLeaseToken: leaseToken,
      dispatchLeaseExpiresAt: expiresAt,
      nextDispatchAttemptAt: null,
      reason: 'render_verification_dispatch_recovery_claimed',
      terminalAt: null,
      updatedAt,
    },
  };
}

/** Records a retryable queue-transport failure without pretending that proof ran. */
export function deferChatEditRenderVerificationDispatch<Visual, Audio>(
  record: ChatEditRenderVerificationRecord<Visual, Audio>,
  input: {
    reason: string;
    now?: Date | string;
    retryDelayMs?: number;
  },
): ChatEditRenderVerificationRecord<Visual, Audio> {
  const updatedAt = toIso(input.now ?? new Date());
  const reason = cleanText(input.reason, 500) ?? 'render_verification_dispatch_deferred';
  const retryDelayMs = Number.isSafeInteger(input.retryDelayMs) && input.retryDelayMs! > 0
    ? Math.min(input.retryDelayMs!, 60 * 60_000)
    : 5 * 60_000;
  return {
    ...record,
    status: 'pending',
    completedAt: null,
    reasons: [reason],
    issues: [{
      modality: 'system',
      severity: 'warn',
      code: 'render_verification_dispatch_deferred',
      message: reason,
    }],
    lifecycle: {
      ...record.lifecycle,
      state: 'requested',
      terminalStatus: null,
      dispatchLeaseToken: null,
      dispatchLeaseExpiresAt: null,
      nextDispatchAttemptAt: new Date(new Date(updatedAt).getTime() + retryDelayMs).toISOString(),
      lastDispatchError: reason,
      reason,
      terminalAt: null,
      updatedAt,
    },
  };
}

export function markChatEditRenderVerificationDelivered<Visual, Audio>(
  record: ChatEditRenderVerificationRecord<Visual, Audio>,
  input: {
    attemptCount: number;
    workerRequestId: string;
    attemptToken?: string | null;
    now?: Date | string;
  },
): ChatEditRenderVerificationRecord<Visual, Audio> {
  const updatedAt = toIso(input.now ?? new Date());
  const attemptCount = Math.max(record.lifecycle.attemptCount, normalizeAttempt(input.attemptCount));
  if (record.lifecycle.state === 'completed') {
    return {
      ...record,
      lifecycle: {
        ...record.lifecycle,
        attemptCount,
        updatedAt,
      },
    };
  }
  return {
    ...record,
    status: 'pending',
    completedAt: null,
    reasons: [],
    issues: [],
    lifecycle: {
      ...record.lifecycle,
      state: 'delivered',
      terminalStatus: null,
      attemptCount,
      workerRequestId: cleanText(input.workerRequestId, 240),
      attemptToken: cleanText(input.attemptToken, 240),
      reason: null,
      deliveredAt: updatedAt,
      terminalAt: null,
      updatedAt,
    },
  };
}

export function markChatEditRenderVerificationRendering<Visual, Audio>(
  record: ChatEditRenderVerificationRecord<Visual, Audio>,
  now: Date | string = new Date(),
): ChatEditRenderVerificationRecord<Visual, Audio> {
  if (record.lifecycle.state === 'completed') return record;
  const updatedAt = toIso(now);
  return {
    ...record,
    status: 'running',
    startedAt: record.startedAt ?? updatedAt,
    completedAt: null,
    reasons: [],
    issues: [],
    lifecycle: {
      ...record.lifecycle,
      state: 'rendering',
      terminalStatus: null,
      reason: null,
      renderingAt: updatedAt,
      terminalAt: null,
      updatedAt,
    },
  };
}

export function markChatEditRenderVerificationTerminal<Visual, Audio>(
  record: ChatEditRenderVerificationRecord<Visual, Audio>,
  input: {
    status: 'pass' | 'warn' | 'fail' | 'error';
    visual: Visual | null;
    audio: Audio | null;
    reasons: string[];
    issues?: unknown;
    projectRenderEligibility?: ProjectRenderEligibilityAudit | null;
    now?: Date | string;
  },
): ChatEditRenderVerificationRecord<Visual, Audio> {
  const updatedAt = toIso(input.now ?? new Date());
  const suppliedReasons = input.reasons
    .map((reason) => cleanText(reason, 500))
    .filter((reason): reason is string => Boolean(reason));
  const suppliedIssues = sanitizeIssues(input.issues);
  const missingTerminalDiagnostic =
    input.status !== 'pass'
    && suppliedReasons.length === 0
    && suppliedIssues.length === 0;
  const reasons = missingTerminalDiagnostic
    ? ['render_verification_terminal_missing_diagnostic']
    : suppliedReasons;
  const issues = suppliedIssues.length > 0
    ? suppliedIssues
    : missingTerminalDiagnostic
      ? [{
          modality: 'system' as const,
          severity: 'error' as const,
          code: 'render_verification_terminal_missing_diagnostic',
          message: 'Render verification ended without a diagnostic.',
        }]
      : reasonsToIssues(reasons, input.status === 'error' ? 'system' : 'visual');
  const isSystemError = input.status === 'error';
  return {
    ...record,
    status: input.status,
    completedAt: updatedAt,
    visual: input.visual,
    audio: input.audio,
    projectRenderEligibility:
      input.projectRenderEligibility ?? record.projectRenderEligibility,
    reasons,
    issues,
    notificationStatus: 'pending',
    lifecycle: {
      ...record.lifecycle,
      state: isSystemError ? 'failed' : 'completed',
      terminalStatus: input.status === 'pass'
        ? 'pass'
        : input.status === 'warn'
          ? 'quality-warn'
        : isSystemError
          ? 'system-error'
          : 'quality-fail',
      reason: reasons[0] ?? null,
      terminalAt: updatedAt,
      updatedAt,
    },
  };
}

export function markChatEditRenderVerificationDeliveryFailed<Visual, Audio>(
  record: ChatEditRenderVerificationRecord<Visual, Audio>,
  input: {
    reason: string;
    attemptCount?: number;
    qstashMessageId?: string | null;
    now?: Date | string;
  },
): ChatEditRenderVerificationRecord<Visual, Audio> {
  if (record.lifecycle.state === 'completed') return record;
  const updatedAt = toIso(input.now ?? new Date());
  const reason = cleanText(input.reason, 500) ?? 'render_verification_delivery_failed';
  return {
    ...record,
    status: 'error',
    completedAt: updatedAt,
    reasons: [reason],
    issues: [{
      modality: 'system',
      severity: 'error',
      code: 'render_verification_delivery_failed',
      message: reason,
    }],
    notificationStatus: 'pending',
    lifecycle: {
      ...record.lifecycle,
      state: 'failed',
      terminalStatus: 'system-error',
      attemptCount: Math.max(
        record.lifecycle.attemptCount,
        input.attemptCount !== undefined ? normalizeAttempt(input.attemptCount) : 1,
      ),
      qstashMessageId: cleanText(input.qstashMessageId, 240) ?? record.lifecycle.qstashMessageId,
      reason,
      terminalAt: updatedAt,
      updatedAt,
    },
  };
}

function normalizeAttempt(value: number): number {
  return Number.isSafeInteger(value) && value > 0 ? Math.min(value, 100) : 1;
}

function normalizeDispatchAttempt(value: unknown): number {
  return typeof value === 'number' && Number.isSafeInteger(value) && value >= 0
    ? Math.min(value, 100)
    : 0;
}

function cleanText(value: unknown, maxLength: number): string | null {
  if (typeof value !== 'string') return null;
  const text = value.trim();
  return text ? text.slice(0, maxLength) : null;
}

function cleanIsoTimestamp(value: unknown): string | null {
  if (typeof value !== 'string' || Number.isNaN(new Date(value).getTime())) return null;
  return value;
}

function sanitizeIssues(value: unknown): ChatEditRenderVerificationIssue[] {
  if (!Array.isArray(value)) return [];
  return value.map((entry) => {
    const issue = isRecord(entry) ? entry : {};
    const modality = normalizeEnum(issue.modality, ['visual', 'audio', 'system'] as const) ?? 'system';
    const severity = normalizeEnum(issue.severity, ['info', 'warn', 'error', 'critical'] as const) ?? 'error';
    const code = cleanText(issue.code, 120)
      ?? cleanText(issue.reason, 120)
      ?? cleanText(issue.message, 120)
      ?? 'render_verification_issue';
    const message = cleanText(issue.message, 500)
      ?? cleanText(issue.reason, 500)
      ?? code;
    return {
      ...issue,
      modality,
      severity,
      code,
      message,
    };
  }).slice(0, 100);
}

function reasonsToIssues(
  reasons: string[],
  modality: ChatEditRenderVerificationIssue['modality'],
): ChatEditRenderVerificationIssue[] {
  return reasons.slice(0, 20).map((reason) => ({
    modality,
    severity: 'error',
    code: reason.split(':')[0]?.slice(0, 120) || 'render_verification_failed',
    message: reason,
  }));
}

function normalizeEnum<T extends readonly string[]>(value: unknown, allowed: T): T[number] | null {
  return typeof value === 'string' && (allowed as readonly string[]).includes(value) ? value as T[number] : null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function toIso(value: Date | string): string {
  if (value instanceof Date) return value.toISOString();
  const timestamp = Date.parse(value);
  if (!Number.isFinite(timestamp)) throw new Error('Invalid chat render-verification lifecycle timestamp.');
  return new Date(timestamp).toISOString();
}
