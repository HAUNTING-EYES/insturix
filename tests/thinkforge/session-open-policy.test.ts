import { readFileSync } from 'fs';
import { describe, expect, it } from 'vitest';
import { resolveHydratedScriptSnapshot } from '@/app/dashboard/thinkforge/hooks/useThinkForgeScript';
import {
  createThinkForgeSessionDocumentTarget,
  resolveThinkForgeSessionOpenAction,
  shouldApplyThinkForgeSessionHydrationResult,
  transitionThinkForgeSessionHydrationFailure,
} from '@/lib/thinkforge/session-open-policy';

function read(path: string): string {
  return readFileSync(new URL(`../../${path}`, import.meta.url), 'utf8');
}

describe('ThinkForge session open policy', () => {
  it('accepts only the exact revisioned server snapshot for the active document', () => {
    const script = {
      sessionId: 'session_a',
      scriptId: 'default',
      title: 'Authorized draft',
      blocks: [],
      version: 4,
    };
    const snapshot = {
      sessionId: 'session_a',
      scriptId: 'default',
      revision: 7,
      script,
    };

    expect(resolveHydratedScriptSnapshot(snapshot, {
      sessionId: 'session_a',
      scriptId: 'default',
    })).toEqual({ key: 'session_a:default:7', script });
    expect(resolveHydratedScriptSnapshot(snapshot, {
      sessionId: 'session_b',
      scriptId: 'default',
    })).toBeUndefined();
    expect(resolveHydratedScriptSnapshot({ ...snapshot, script: { ...script, scriptId: 'draft_2' } }, {
      sessionId: 'session_a',
      scriptId: 'default',
    })).toBeUndefined();
    expect(resolveHydratedScriptSnapshot({ ...snapshot, revision: 8, script: null }, {
      sessionId: 'session_a',
      scriptId: 'default',
    })).toEqual({ key: 'session_a:default:8', script: null });
  });

  it('focuses a current session only when its workspace is fully hydrated', () => {
    expect(resolveThinkForgeSessionOpenAction({
      targetSessionId: 'session_a',
      activeSessionId: 'session_a',
      workspaceMode: 'scripting',
      hasHydratedWorkspace: true,
    })).toBe('focus_current');
  });

  it('rehydrates a cached current session when its document is missing', () => {
    expect(resolveThinkForgeSessionOpenAction({
      targetSessionId: 'session_a',
      activeSessionId: 'session_a',
      workspaceMode: 'scripting',
      hasHydratedWorkspace: false,
    })).toBe('hydrate_target');
  });

  it('retains a failed hydration visibly until the user retries or changes session', () => {
    const target = createThinkForgeSessionDocumentTarget('session_a', 'default');
    const otherTarget = createThinkForgeSessionDocumentTarget('session_b', 'default');
    expect(target).not.toBeNull();
    expect(otherTarget).not.toBeNull();

    const failure = transitionThinkForgeSessionHydrationFailure(null, {
      type: 'failed',
      target: target!,
      message: 'Could not load the selected document.',
    });
    expect(transitionThinkForgeSessionHydrationFailure(failure, {
      type: 'started',
      target: target!,
    })).toEqual(failure);
    expect(transitionThinkForgeSessionHydrationFailure(failure, {
      type: 'started',
      target: otherTarget!,
    })).toBeNull();

    const page = read('app/dashboard/thinkforge/page.tsx');
    expect(page).toContain('data-testid="thinkforge-session-hydration-error"');
    expect(page).toContain('role="alert"');
    expect(page).toContain('session.hydrationFailure.message');
    expect(page).toContain('handleOpenSession(session.hydrationFailure!.target.sessionId)');
  });

  it('clears the retained failure only after the exact retry succeeds', () => {
    const target = createThinkForgeSessionDocumentTarget('session_a', 'default')!;
    const failure = transitionThinkForgeSessionHydrationFailure(null, {
      type: 'failed',
      target,
      message: 'Could not load the selected document.',
    });
    const retrying = transitionThinkForgeSessionHydrationFailure(failure, {
      type: 'started',
      target,
    });

    expect(retrying).toEqual(failure);
    expect(transitionThinkForgeSessionHydrationFailure(retrying, {
      type: 'succeeded',
      target,
    })).toBeNull();
  });

  it('ignores aborted and stale hydration responses', () => {
    expect(shouldApplyThinkForgeSessionHydrationResult({
      requestRevision: 4,
      activeRequestRevision: 4,
      aborted: false,
    })).toBe(true);
    expect(shouldApplyThinkForgeSessionHydrationResult({
      requestRevision: 3,
      activeRequestRevision: 4,
      aborted: false,
    })).toBe(false);
    expect(shouldApplyThinkForgeSessionHydrationResult({
      requestRevision: 4,
      activeRequestRevision: 4,
      aborted: true,
    })).toBe(false);

    const sessionHook = read('app/dashboard/thinkforge/hooks/useThinkForgeSession.ts');
    const page = read('app/dashboard/thinkforge/page.tsx');
    expect(sessionHook).toContain('if (!isCurrentRequest()) return null;');
    expect(sessionHook).toContain('Hydration response identity does not match the requested document');
    expect(page).toContain('const isCurrentSessionOpen = () => sessionOpenRevisionRef.current === openRevision;');
    expect(page).toContain('if (!isCurrentSessionOpen()) return;');
    expect(page).toContain('if (!data || !isCurrentSessionOpen()) return;');
  });

  it('rehydrates when the target differs or the workspace is not scripting', () => {
    expect(resolveThinkForgeSessionOpenAction({
      targetSessionId: 'session_b',
      activeSessionId: 'session_a',
      workspaceMode: 'scripting',
      hasHydratedWorkspace: true,
    })).toBe('hydrate_target');

    expect(resolveThinkForgeSessionOpenAction({
      targetSessionId: 'session_a',
      activeSessionId: 'session_a',
      workspaceMode: 'ideation',
      hasHydratedWorkspace: true,
    })).toBe('hydrate_target');
  });

  it('rejects an empty target session id', () => {
    expect(() => resolveThinkForgeSessionOpenAction({
      targetSessionId: '   ',
      activeSessionId: null,
      workspaceMode: 'ideation',
      hasHydratedWorkspace: false,
    })).toThrow(/targetSessionId is required/i);
  });

  it('clears session-scoped tabs and never fabricates a client document identity', () => {
    const panel = read('components/dashboard/ThinkForge/ScriptPanel.tsx');

    expect(panel).toContain('tabsSessionIdRef.current = sessionId || null;');
    expect(panel).toContain('setTabs([]);');
    expect(panel).toContain('setTabOrder([]);');
    expect(panel).toContain('if (tabsSessionIdRef.current !== requestedSessionId) return;');
    expect(panel).toContain("throw new Error(`Document list failed (${res.status})${detail}`)");
    expect(panel).toContain("documentType: typeof s.documentType === 'string' ? s.documentType : ''");
    expect(panel).not.toContain("documentType: s.documentType || 'screenplay'");
    expect(panel).not.toContain('script_${Date.now()}');
    expect(panel).not.toContain('onNewTab={async');
    expect(panel).not.toContain('onNewScript={async');
  });

  it('lets the page owner decide how to reopen an active Library row', () => {
    const library = read('components/dashboard/ThinkForge/LibraryPanel.tsx');
    const page = read('app/dashboard/thinkforge/page.tsx');

    expect(library).not.toContain('if (s.id === activeSessionId) return;');
    expect(library).toContain('onOpenSession?.(s.id);');
    expect(page).toContain('resolveThinkForgeSessionOpenAction({');
    expect(page).toContain('matchesThinkForgeDocumentIdentity(scriptHook.script');
    expect(page).toContain("if (openAction === 'focus_current')");
    expect(page).toContain('const data = await session.hydrate({');
    expect(page).toContain('allowCachedFallback: false');
    expect(page).toContain('session.hydratedScriptSnapshot');

    const route = read('app/api/services/thinkforge/session/route.ts');
    const sessionHook = read('app/dashboard/thinkforge/hooks/useThinkForgeSession.ts');
    const scriptHook = read('app/dashboard/thinkforge/hooks/useThinkForgeScript.ts');
    expect(route).toContain('db.getScript(session._id, effectiveScriptId)');
    expect(route).toContain("const effectiveScriptId = scriptId ?? 'default'");
    expect(route).toContain('version: script.version');
    expect(sessionHook).toContain('setHydratedScriptSnapshot({');
    expect(sessionHook).toContain('hydrationAbortControllerRef.current?.abort()');
    expect(sessionHook).toContain("allowCachedFallback: false");
    expect(sessionHook).toContain('setRestoredSessionId(data.sessionId);');
    expect(page).toContain('session.restoredSessionId');
    expect(page).toContain('buildIdeaFromSessionMeta(restoredSessionId, session.projectMeta || {})');
    expect(scriptHook).toContain('consumedHydrationSnapshotsRef.current.has');
  });
});
