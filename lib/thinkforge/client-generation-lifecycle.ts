export type ThinkForgeGenerationPollingInput = {
  hasSession: boolean;
  hasThread: boolean;
  hasLiveStream: boolean;
  generationId?: string | null;
};

export type ThinkForgeCompletedGenerationDelivery =
  | { type: 'apply_current_document' }
  | { type: 'switch_document'; scriptId: string }
  | { type: 'missing_document' };

export type ThinkForgeCompletedDocumentReconciliationInput = {
  doneReceived: boolean;
  hasDocumentEvent: boolean;
  scriptId?: string | null;
};

export type ThinkForgeStreamRecoveryInput = {
  ownsLiveStream: boolean;
  errorName?: string | null;
};

export type ThinkForgeStreamPollingHandoffInput = {
  streamReadFailed: boolean;
  doneReceived: boolean;
  hasDocumentEvent: boolean;
};

const RUNTIME_CONTRACT_FAILURE_PATTERN = /\b(?:runtime_duration_mismatch|spoken_word_count_mismatch|spoken_density_mismatch|narration_mode_missing_speech)\b/i;
const EVIDENCE_REQUIREMENT_FAILURE_PATTERN = /\bSCRIPT_REQUIRES_ADDITIONAL_EVIDENCE\b/i;
const TIMEOUT_FAILURE_PATTERN = /\b(?:timed out|timeout)\b/i;
const TEMPORARY_PROVIDER_FAILURE_PATTERN = /\b(?:high demand|temporarily unavailable|temporarily busy|overload(?:ed)?|capacity|rate limit|too many requests|service unavailable)\b/i;

function readNonEmptyString(value: unknown): string | null {
  return typeof value === 'string' && value.trim().length > 0
    ? value.trim()
    : null;
}

/** Convert server-only generation failures into a stable message the author can act on. */
export function resolveThinkForgeGenerationFailureMessage(error: unknown): string {
  const message = readNonEmptyString(error);

  if (message && EVIDENCE_REQUIREMENT_FAILURE_PATTERN.test(message)) {
    return 'This long factual script needs more approved source material before it can be written. Add a detailed record, upload, or source link, or change the request to a creative treatment.';
  }

  if (message && RUNTIME_CONTRACT_FAILURE_PATTERN.test(message)) {
    return 'The draft did not meet the requested runtime and production requirements, so it was not saved. Please try again.';
  }

  if (message && TIMEOUT_FAILURE_PATTERN.test(message)) {
    return 'The draft took too long to complete and was not saved. Please try again.';
  }

  if (message && TEMPORARY_PROVIDER_FAILURE_PATTERN.test(message)) {
    return 'The writing service is temporarily busy. No draft was saved. Please try again in a moment.';
  }

  return 'The draft could not be completed and was not saved. Please try again.';
}

export function shouldProbeThinkForgeGeneration(
  input: Pick<ThinkForgeGenerationPollingInput, 'hasSession' | 'hasThread' | 'hasLiveStream'>,
): boolean {
  return input.hasSession && input.hasThread && !input.hasLiveStream;
}

export function shouldScheduleThinkForgeGenerationPolling(
  input: ThinkForgeGenerationPollingInput,
): boolean {
  return shouldProbeThinkForgeGeneration(input)
    && readNonEmptyString(input.generationId) !== null;
}

export function resolveCompletedGenerationDelivery(input: {
  activeScriptId?: string | null;
  completedScriptId?: string | null;
  hasScriptPayload: boolean;
}): ThinkForgeCompletedGenerationDelivery {
  const activeScriptId = readNonEmptyString(input.activeScriptId) || 'default';
  const completedScriptId = readNonEmptyString(input.completedScriptId);

  if (completedScriptId && completedScriptId !== activeScriptId) {
    return { type: 'switch_document', scriptId: completedScriptId };
  }

  return input.hasScriptPayload
    ? { type: 'apply_current_document' }
    : { type: 'missing_document' };
}

/** A transport failure is recoverable; an explicit AbortError is a user cancellation. */
export function shouldRecoverThinkForgeGenerationStream(
  input: ThinkForgeStreamRecoveryInput,
): boolean {
  return input.ownsLiveStream && input.errorName !== 'AbortError';
}

/** Poll durable state unless replay restored both completion and its document payload. */
export function shouldHandoffThinkForgeStreamToPolling(
  input: ThinkForgeStreamPollingHandoffInput,
): boolean {
  return input.streamReadFailed
    && (!input.doneReceived || !input.hasDocumentEvent);
}

/**
 * A streamed document update is an optimistic delivery signal. Once the server
 * declares the generation complete, re-read its durable document exactly once.
 */
export function shouldReconcileThinkForgeCompletedDocument(
  input: ThinkForgeCompletedDocumentReconciliationInput,
): boolean {
  return input.doneReceived
    && input.hasDocumentEvent
    && readNonEmptyString(input.scriptId) !== null;
}
