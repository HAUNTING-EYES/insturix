export type ThinkForgeSessionOpenAction = 'focus_current' | 'hydrate_target';

export interface ThinkForgeSessionDocumentTarget {
  sessionId: string;
  scriptId: string;
}

export interface ThinkForgeSessionHydrationFailure {
  target: ThinkForgeSessionDocumentTarget;
  message: string;
}

export type ThinkForgeSessionHydrationEvent =
  | { type: 'started'; target: ThinkForgeSessionDocumentTarget }
  | { type: 'failed'; target: ThinkForgeSessionDocumentTarget; message: string }
  | { type: 'succeeded'; target: ThinkForgeSessionDocumentTarget }
  | { type: 'cleared' };

export interface ThinkForgeSessionOpenState {
  targetSessionId: string;
  activeSessionId?: string | null;
  workspaceMode: 'ideation' | 'scripting' | 'planning';
  hasHydratedWorkspace: boolean;
}

export function createThinkForgeSessionDocumentTarget(
  sessionId: string | null | undefined,
  scriptId: string | null | undefined = 'default',
): ThinkForgeSessionDocumentTarget | null {
  const normalizedSessionId = sessionId?.trim();
  if (!normalizedSessionId) return null;

  return {
    sessionId: normalizedSessionId,
    scriptId: scriptId?.trim() || 'default',
  };
}

export function matchesThinkForgeSessionDocumentTarget(
  left: ThinkForgeSessionDocumentTarget,
  right: ThinkForgeSessionDocumentTarget,
): boolean {
  return left.sessionId === right.sessionId && left.scriptId === right.scriptId;
}

export function transitionThinkForgeSessionHydrationFailure(
  current: ThinkForgeSessionHydrationFailure | null,
  event: ThinkForgeSessionHydrationEvent,
): ThinkForgeSessionHydrationFailure | null {
  if (event.type === 'cleared') return null;

  const isCurrentTarget = current
    ? matchesThinkForgeSessionDocumentTarget(current.target, event.target)
    : false;

  if (event.type === 'started') {
    return isCurrentTarget ? current : null;
  }
  if (event.type === 'succeeded') {
    return isCurrentTarget ? null : current;
  }

  return {
    target: event.target,
    message: event.message,
  };
}

export function shouldApplyThinkForgeSessionHydrationResult(input: {
  requestRevision: number;
  activeRequestRevision: number;
  aborted: boolean;
}): boolean {
  return !input.aborted && input.requestRevision === input.activeRequestRevision;
}

export function resolveThinkForgeSessionOpenAction(
  state: ThinkForgeSessionOpenState,
): ThinkForgeSessionOpenAction {
  const targetSessionId = state.targetSessionId.trim();
  if (!targetSessionId) {
    throw new Error('targetSessionId is required to open a ThinkForge session');
  }

  const activeSessionId = state.activeSessionId?.trim();
  const canFocusCurrent = activeSessionId === targetSessionId
    && state.workspaceMode === 'scripting'
    && state.hasHydratedWorkspace;

  return canFocusCurrent ? 'focus_current' : 'hydrate_target';
}
