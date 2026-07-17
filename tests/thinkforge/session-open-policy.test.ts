import { readFileSync } from 'fs';
import { describe, expect, it } from 'vitest';
import { resolveThinkForgeSessionOpenAction } from '@/lib/thinkforge/session-open-policy';

function read(path: string): string {
  return readFileSync(new URL(`../../${path}`, import.meta.url), 'utf8');
}

describe('ThinkForge session open policy', () => {
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
    expect(page).toContain('const data = await session.hydrate({ sessionId: id });');
  });
});
