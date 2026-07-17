import { readFileSync } from 'fs';
import { describe, expect, it } from 'vitest';
import { resolveHydratedScriptSnapshot } from '@/app/dashboard/thinkforge/hooks/useThinkForgeScript';
import { resolveThinkForgeSessionOpenAction } from '@/lib/thinkforge/session-open-policy';

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

  it('lets the page owner decide how to reopen an active Library row', () => {
    const library = read('components/dashboard/ThinkForge/LibraryPanel.tsx');
    const page = read('app/dashboard/thinkforge/page.tsx');

    expect(library).not.toContain('if (s.id === activeSessionId) return;');
    expect(library).toContain('onOpenSession?.(s.id);');
    expect(page).toContain('resolveThinkForgeSessionOpenAction({');
    expect(page).toContain('matchesThinkForgeDocumentIdentity(scriptHook.script');
    expect(page).toContain("if (openAction === 'focus_current')");
    expect(page).toContain("const data = await session.hydrate({ sessionId: id, scriptId: 'default' });");
    expect(page).toContain('session.hydratedScriptSnapshot');

    const route = read('app/api/services/thinkforge/session/route.ts');
    const sessionHook = read('app/dashboard/thinkforge/hooks/useThinkForgeSession.ts');
    const scriptHook = read('app/dashboard/thinkforge/hooks/useThinkForgeScript.ts');
    expect(route).toContain('db.getScript(session._id, scriptId)');
    expect(route).toContain('version: script.version');
    expect(sessionHook).toContain('setHydratedScriptSnapshot({');
    expect(sessionHook).toContain('hydrationAbortControllerRef.current?.abort()');
    expect(scriptHook).toContain('consumedHydrationSnapshotsRef.current.has');
  });
});
