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

function readNonEmptyString(value: unknown): string | null {
  return typeof value === 'string' && value.trim().length > 0
    ? value.trim()
    : null;
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
