import { readFileSync } from 'fs';
import { describe, expect, it } from 'vitest';
import {
  detectContentPath,
  resolveThinkForgeDocumentIntent,
  resolveThinkForgeGenerationDocumentIntent,
} from '@/lib/thinkforge/agents/prompt-utils';

function read(path: string): string {
  return readFileSync(new URL(`../../${path}`, import.meta.url), 'utf8');
}

describe('ThinkForge script hydration contract', () => {
  it('routes explicit post requests by the latest user prompt, not stale session format', () => {
    expect(detectContentPath('make a post creating fomo in my brand ICP', 'video_script')).toBe('post');
    expect(detectContentPath('Write a LinkedIn post about video production workflows.', 'video_script')).toBe('post');
    expect(detectContentPath('Write an Instagram reel script with camera direction.', 'post')).toBe('script');
    expect(resolveThinkForgeDocumentIntent('make an Instagram carousel for this campaign', 'video_script')).toMatchObject({
      contentPath: 'post',
      source: 'user_prompt',
    });
  });

  it('uses the selected format for silent initial drafts without weakening user overrides', () => {
    expect(resolveThinkForgeGenerationDocumentIntent(
      'Create the complete first script draft for this idea.',
      'Instagram post',
      'initial_draft_claim',
    )).toMatchObject({
      contentPath: 'post',
      source: 'document_type',
    });

    expect(resolveThinkForgeGenerationDocumentIntent(
      'Turn this into an Instagram reel script with camera direction.',
      'Instagram post',
      'user_request',
    )).toMatchObject({
      contentPath: 'script',
      source: 'user_prompt',
    });
  });

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
    expect(chatPanel).toContain('getActiveScriptId: () => scriptIdRef.current');
    expect(chatPanel).not.toContain('onScriptUpdate: handleScriptUpdate');
    expect(chatPanel).not.toContain('[ChatPanel.handleSend]');
    expect(page).toContain("const isRemoteAiUpdate = metadata.source === 'ai';");
    expect(page).toContain('scriptHook.setScriptWithoutSave(model);');
    expect(chatHook).toContain('function normalizeRemoteScriptUpdate');
    expect(chatHook).toContain('scriptId: data?.script?.scriptId');
    expect(chatHook).toContain('const completedScriptId = gen.scriptId || data.script?.scriptId');
    expect(chatHook).toContain('activeScriptId: optionsRef.current?.getActiveScriptId?.()');
    expect(chatHook).toContain("if (delivery.type === 'switch_document')");
    expect(chatHook).toContain("delivery.type === 'apply_current_document'");
    expect(chatHook).toContain("source: context.forceSource || 'ai'");
    expect(chatHook).not.toContain('optionsRef.current.onRemoteScriptUpdate(data);');
    expect(chatHook).not.toContain('optionsRef.current.onRemoteScriptUpdate(data.script);');
  });
  it('keeps AI generation ownership metadata durable through status and script block reloads', () => {
    const chatService = read('lib/thinkforge/services/chat-service.ts');
    const statusRoute = read('app/api/services/thinkforge/generation/status/route.ts');
    const blocksRoute = read('app/api/services/thinkforge/script/blocks/route.ts');
    const scriptHook = read('app/dashboard/thinkforge/hooks/useThinkForgeScript.ts');

    expect(chatService).toContain("workflow: 'create'");
    expect(chatService).toContain("source: 'ai'");
    expect(chatService).toContain('scriptId: effectiveScriptId || undefined');
    expect(chatService).toContain('scriptId: effectiveScriptId');
    expect(chatService).toContain('generationId: activeGenerationId');
    expect(statusRoute).toContain('generation.scriptId');
    expect(blocksRoute).toContain('metadata: script.metadata || {}');
    expect(blocksRoute).toContain('metadata: result.script.metadata || {}');
    expect(scriptHook).toContain("metadata: data.metadata && typeof data.metadata === 'object' ? data.metadata : null");
    expect(scriptHook).toContain('Server remains the source of truth');
    expect(scriptHook).toContain('Ignoring remote script update for inactive script');
  });
  it('creates an initial draft only from an explicit session intent and claims it once', () => {
    const page = read('app/dashboard/thinkforge/page.tsx');
    const chatPanel = read('components/dashboard/ThinkForge/ChatPanel.tsx');
    const sessionRoute = read('app/api/services/thinkforge/session/route.ts');
    const db = read('lib/thinkforge/services/db.ts');

    expect(page).toContain('initialDraftRequestedRef.current = true');
    expect(page).toContain("status: 'pending'");
    expect(page).toContain('initialDraftRequestedRef.current = false');
    expect(chatPanel).toContain('isScriptLoading');
    expect(chatPanel).toContain('claimInitialDraft: true');
    expect(chatPanel).toContain("lastUserAction: 'initial_draft_claim'");
    expect(chatPanel).toContain('Create the complete first draft for this idea');
    expect(chatPanel).toContain('resolveSelectedIdeaContentContract(selectedIdea)');
    expect(chatPanel).toContain('normalizeThinkForgeDocumentContract(idea?.format)');
    expect(chatPanel).toContain('resolveCarouselSlideCount(idea?.originalPrompt)');
    expect(chatPanel).toContain('contentContract } : {}');
    expect(chatPanel).not.toContain('complete first script draft');
    expect(chatPanel).not.toContain('autoStartFired');
    expect(chatPanel).not.toContain("lastUserAction: 'auto_start'");
    expect(sessionRoute).toContain('db.claimInitialDraftIntent(sessionId)');
    expect(db).toContain("'projectMeta.initialDraftIntent.status': 'pending'");
    expect(db).toContain("'projectMeta.initialDraftIntent.status': 'claimed'");
  });
  it('resolves Clickatron export preview through the server context route', () => {
    const exportHook = read('components/dashboard/ThinkForge/export/hooks/useExportPipeline.ts');

    expect(exportHook).toContain('const [resolvedClickatronContext');
    expect(exportHook).toContain('const clickatronContextRequestBody = useMemo');
    expect(exportHook).toContain('fetch("/api/services/thinkforge/clickatron-context"');
    expect(exportHook).toContain('body: JSON.stringify(clickatronContextRequestBody)');
    expect(exportHook).toContain('resolvedClickatronContext?.key === clickatronContextRequestKey');
  });
  it('treats Clickatron controls as explicit overrides instead of fake initial selections', () => {
    const dialog = read('components/dashboard/ThinkForge/export/ClickatronHandoffDialog.tsx');
    const panel = read('components/dashboard/ThinkForge/export/ClickatronHandoffPanel.tsx');

    expect(dialog).toContain('useState<ThinkToClickUserVisualChoices>({})');
    expect(dialog).not.toContain('DEFAULT_VISUAL_CHOICES');
    expect(panel).toContain('const resolvedVisualChoices = display?.visualChoices');
    expect(panel).toContain('visualChoices.kind || resolvedVisualChoices?.kind || display?.kind');
    expect(panel).toContain('visualChoices.platform || resolvedVisualChoices?.platform || display?.platform');
    expect(panel).toContain('visualChoices.aspectRatio || resolvedVisualChoices?.aspectRatio || display?.aspectRatio');
  });
});
