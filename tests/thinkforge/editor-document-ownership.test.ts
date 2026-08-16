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

  it('resets document ownership before loading and isolates stale async work', () => {
    const editor = read('components/dashboard/ThinkForge/ScriptEditor.tsx');
    const resetIndex = editor.indexOf('activeDocumentKeyRef.current = activeDocumentKey');
    const loadIndex = editor.indexOf('const loadBlocks = async');

    expect(resetIndex).toBeGreaterThan(-1);
    expect(loadIndex).toBeGreaterThan(resetIndex);
    expect(editor).toContain('loadAbortControllerRef.current?.abort()');
    expect(editor).toContain('enqueueThinkForgeDocumentSave');
    expect(editor).toContain('flushPendingDocumentSaveRef.current?.(previousDocumentKey)');
    expect(editor).toContain('matchesThinkForgeDocumentIdentity(script, activeIdentity)');
    expect(editor).toContain('activeDocumentKeyRef.current !== pending.documentKey');
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
});
