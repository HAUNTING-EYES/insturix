import { readFileSync } from 'fs';
import { describe, expect, it } from 'vitest';

function read(path: string): string {
  return readFileSync(new URL(`../../${path}`, import.meta.url), 'utf8');
}

describe('ThinkForge script hydration contract', () => {
  it('does not convert completed AI generation into an editor-owned autosave', () => {
    const source = read('components/dashboard/ThinkForge/ScriptEditor.tsx');
    const notifyHydratedScript = source.slice(
      source.indexOf('const notifyHydratedScript'),
      source.indexOf('// Load blocks from API or script.blocks prop'),
    );

    expect(source).not.toContain('Force autosave after generation finishes');
    expect(notifyHydratedScript).toContain("canonicalFormat: 'tiptap'");
    expect(notifyHydratedScript).not.toContain("source: 'editor'");
    expect(source).toContain("if (metadataSource === 'editor' && !isAIGenerated)");
  });

  it('applies remote chat script updates once and without queueing a user save', () => {
    const chatPanel = read('components/dashboard/ThinkForge/ChatPanel.tsx');
    const page = read('app/dashboard/thinkforge/page.tsx');
    const chatHook = read('app/dashboard/thinkforge/hooks/useThinkForgeChat.ts');

    expect(chatPanel).toContain('onRemoteScriptUpdate: handleScriptUpdate');
    expect(chatPanel).not.toContain('onScriptUpdate: handleScriptUpdate');
    expect(page).toContain("const isRemoteAiUpdate = metadata.source === 'ai';");
    expect(page).toContain('scriptHook.setScriptWithoutSave(model);');
    expect(chatHook).toContain('function normalizeRemoteScriptUpdate');
    expect(chatHook).toContain("source: mergedMetadata.source || 'ai'");
    expect(chatHook).not.toContain('optionsRef.current.onRemoteScriptUpdate(data);');
    expect(chatHook).not.toContain('optionsRef.current.onRemoteScriptUpdate(data.script);');
  });
});