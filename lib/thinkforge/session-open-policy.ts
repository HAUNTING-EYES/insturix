export type ThinkForgeSessionOpenAction = 'focus_current' | 'hydrate_target';

export interface ThinkForgeSessionOpenState {
  targetSessionId: string;
  activeSessionId?: string | null;
  workspaceMode: 'ideation' | 'scripting' | 'planning';
  hasHydratedWorkspace: boolean;
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
