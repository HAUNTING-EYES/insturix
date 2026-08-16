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

const RUNTIME_CONTRACT_FAILURE_PATTERN = /\b(?:runtime_duration_mismatch|spoken_word_count_mismatch|spoken_density_mismatch|narration_mode_missing_speech)\b/i;
const TIMEOUT_FAILURE_PATTERN = /\b(?:timed out|timeout)\b/i;

function readNonEmptyString(value: unknown): string | null {
  return typeof value === 'string' && value.trim().length > 0
    ? value.trim()
    : null;
}

/** Convert server-only generation failures into a stable message the author can act on. */
export function resolveThinkForgeGenerationFailureMessage(error: unknown): string {
  const message = readNonEmptyString(error);

  if (message && RUNTIME_CONTRACT_FAILURE_PATTERN.test(message)) {
    return 'The draft did not meet the requested runtime and production requirements, so it was not saved. Please try again.';
  }

  if (message && TIMEOUT_FAILURE_PATTERN.test(message)) {
    return 'The draft took too long to complete and was not saved. Please try again.';
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
