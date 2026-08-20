import { readFileSync } from 'fs';
import { describe, expect, it } from 'vitest';
import {
  createThinkForgeDocumentKey,
  matchesThinkForgeDocumentIdentity,
  stampThinkForgeDocumentIdentity,
} from '@/lib/thinkforge/client-document-identity';

function read(path: string): string {
  return readFileSync(new URL(`../../${path}`, import.meta.url), 'utf8');
}

describe('ThinkForge editor document ownership', () => {
  it('stamps and matches immutable session and document identity', () => {
    const identity = { sessionId: 'session_new', scriptId: 'post_new' };
    const stamped = stampThinkForgeDocumentIdentity({
      title: 'New post',
      metadata: { workflow: 'create' },
    }, identity);

    expect(stamped).toMatchObject({
      sessionId: 'session_new',
      scriptId: 'post_new',
      metadata: {
        sessionId: 'session_new',
        scriptId: 'post_new',
        workflow: 'create',
      },
    });
    expect(matchesThinkForgeDocumentIdentity(stamped, identity)).toBe(true);
    expect(matchesThinkForgeDocumentIdentity(stamped, {
      sessionId: 'session_old',
      scriptId: 'post_new',
    })).toBe(false);
    expect(createThinkForgeDocumentKey(identity)).toBe('session_new:post_new');
  });

  it('lets the parent own initial loading and isolates stale async work', () => {
    const page = read('app/dashboard/thinkforge/page.tsx');
    const editor = read('components/dashboard/ThinkForge/ScriptEditor.tsx');
    const panel = read('components/dashboard/ThinkForge/ScriptPanel.tsx');
    const storyboarding = read('components/dashboard/ThinkForge/StoryboardingMode.tsx');
    const resetIndex = editor.indexOf('activeDocumentKeyRef.current = activeDocumentKey');
    const hydrateIndex = editor.indexOf('const decision = resolveThinkForgeInitialHydration');
    const blocksRouteConsumers = editor.match(/\/api\/services\/thinkforge\/script\/blocks\?/g) || [];

    expect(resetIndex).toBeGreaterThan(-1);
    expect(hydrateIndex).toBeGreaterThan(resetIndex);
    expect(editor).not.toContain('const loadBlocks = async');
    expect(editor).not.toContain('loadAbortControllerRef');
    expect(editor).not.toContain('notifyHydratedScript');
    expect(blocksRouteConsumers).toHaveLength(2);
    expect(storyboarding).toContain('isScriptLoading={isScriptLoading}');
    expect(panel).toContain('isDocumentLoading={isScriptLoading}');
    expect(editor).toContain('isLoading: isDocumentLoading');
    expect(editor).toContain('enqueueThinkForgeDocumentSave');
    expect(editor).toContain('flushPendingDocumentSaveRef.current?.(previousDocumentKey)');
    expect(editor).toContain('matchesThinkForgeDocumentIdentity(script, activeIdentity)');
    expect(editor).toContain('activeDocumentKeyRef.current !== pending.documentKey');
    expect(page).not.toContain('scriptHook.autosave(');
  });

  it('rejects stale remote updates and recovers the server-created document id', () => {
    const scriptHook = read('app/dashboard/thinkforge/hooks/useThinkForgeScript.ts');
    const chatHook = read('app/dashboard/thinkforge/hooks/useThinkForgeChat.ts');

    expect(scriptHook).toContain("assertCompatibleDocumentIdentity(update, expected, 'Document update')");
    expect(scriptHook).toContain('matchesThinkForgeDocumentIdentity(scriptToSave, activeIdentity)');
    expect(scriptHook).toContain('parseThinkForgeLoadedDocument(data, activeIdentity)');
    expect(scriptHook).toContain('sessionIdRef.current !== targetSessionId');
    expect(chatHook).toContain('let resolvedScriptId = options?.scriptId');
    expect(chatHook).toContain('resolvedScriptId = data.scriptId');
    expect(chatHook).toContain('const recoveryScriptId = resolvedScriptId || options?.scriptId');
  });

  it('resets document-bound controls and retains visible hydration failures', () => {
    const page = read('app/dashboard/thinkforge/page.tsx');
    const scriptHook = read('app/dashboard/thinkforge/hooks/useThinkForgeScript.ts');
    const storyboarding = read('components/dashboard/ThinkForge/StoryboardingMode.tsx');
    const panel = read('components/dashboard/ThinkForge/ScriptPanel.tsx');
    const editor = read('components/dashboard/ThinkForge/ScriptEditor.tsx');

    expect(storyboarding).toContain('}, [sessionId, exportScriptId]);');
    expect(storyboarding).toContain('setShowExportDialog(false)');
    expect(storyboarding).toContain('setShowClickatronDialog(false)');
    expect(storyboarding).toContain('setShowShootKit(false)');
    expect(storyboarding).toContain('setEditingSelection(null)');
    expect(storyboarding).toContain("setScriptPanelMode('script')");
    expect(storyboarding).toContain('tokenStreamCallbackRef.current = null');
    expect(storyboarding).toContain('selectionGetterRef.current = null');
    expect(scriptHook).toContain('const retryLoad = useCallback(() => {');
    expect(scriptHook).toContain('setLoadAttempt((attempt) => attempt + 1)');
    expect(scriptHook).toContain('hydratedScriptSnapshot, loadAttempt, resetPendingSaves');
    expect(page).toContain('scriptLoadError={scriptHook.loadError}');
    expect(page).toContain('onRetryScriptLoad={scriptHook.retryLoad}');
    expect(storyboarding).toContain('scriptLoadError={scriptLoadError}');
    expect(storyboarding).toContain('onRetryScriptLoad={onRetryScriptLoad}');
    expect(panel).toContain('{scriptLoadError}');
    expect(panel).toContain('aria-label="Retry loading document"');
    expect(editor).toContain('documentHydrationError');
    expect(editor).toContain('role="alert"');
  });
});
