import { readFileSync } from 'fs';
import { describe, expect, it } from 'vitest';
import {
  mergeThinkForgeScriptDocument,
  parseThinkForgeLoadedDocument,
} from '@/app/dashboard/thinkforge/hooks/useThinkForgeScript';
import {
  detectContentPath,
  resolveThinkForgeDocumentIntent,
  resolveThinkForgeGenerationDocumentIntent,
} from '@/lib/thinkforge/agents/prompt-utils';
import { sanitizeServerScript } from '@/lib/thinkforge/json';

function read(path: string): string {
  return readFileSync(new URL(`../../${path}`, import.meta.url), 'utf8');
}

describe('ThinkForge script hydration contract', () => {
  it('sanitizes document content without discarding server-owned identity or canonical fields', () => {
    const richText = { type: 'doc', content: [{ type: 'paragraph' }] };
    const contentContract = {
      version: 1,
      documentKind: 'post',
      outputKind: 'social_post',
      artifactType: 'social_post',
    };

    expect(sanitizeServerScript({
      sessionId: ' session_a ',
      scriptId: 'post_1',
      title: 'Published post',
      content: 'Exact final copy',
      blocks: [],
      richText,
      version: 5,
      documentType: 'social_post',
      contentContract,
      metadata: { workflow: 'create', source: 'ai' },
    })).toEqual({
      sessionId: 'session_a',
      scriptId: 'post_1',
      title: 'Published post',
      content: 'Exact final copy',
      blocks: [],
      richText,
      version: 5,
      documentType: 'social_post',
      contentContract,
      metadata: { workflow: 'create', source: 'ai' },
    });

    expect(sanitizeServerScript({ title: 'Partial update' })).not.toHaveProperty('blocks');
    expect(sanitizeServerScript({ title: 'Partial update' })).not.toHaveProperty('sessionId');
  });

  it('hydrates every server-owned document field without inventing a document type', () => {
    const identity = { sessionId: 'session_brand_b', scriptId: 'carousel_q3' };
    const richText = { type: 'doc', content: [{ type: 'paragraph' }] };
    const contentContract = {
      version: 1,
      documentKind: 'content',
      outputKind: 'carousel',
      artifactType: 'social_post',
    };

    const hydrated = parseThinkForgeLoadedDocument({
      title: 'Q3 carousel',
      content: 'Visible copy',
      blocks: [{ id: 'block_1', type: 'paragraph', content: [{ type: 'text', text: 'Visible copy' }] }],
      richText,
      version: 9,
      metadata: { workflow: 'create', traceId: 'trace_1' },
      documentType: 'carousel',
      contentContract,
    }, identity);

    expect(hydrated).toMatchObject({
      ...identity,
      title: 'Q3 carousel',
      content: 'Visible copy',
      richText,
      version: 9,
      documentType: 'carousel',
      contentContract,
      metadata: {
        workflow: 'create',
        traceId: 'trace_1',
        ...identity,
      },
    });

    const untyped = parseThinkForgeLoadedDocument({
      title: 'Legacy document',
      content: '',
      blocks: [],
      version: 2,
      metadata: {},
    }, { sessionId: 'session_legacy', scriptId: 'default' });
    expect(untyped.documentType).toBeUndefined();
    expect(untyped.documentType).not.toBe('screenplay');
  });

  it('preserves the document contract across partial UI updates and rejects identity drift', () => {
    const identity = { sessionId: 'session_a', scriptId: 'post_1' };
    const current = parseThinkForgeLoadedDocument({
      title: 'Original',
      content: 'Before',
      blocks: [],
      richText: { type: 'doc', content: [] },
      version: 4,
      documentType: 'social_post',
      contentContract: { version: 1, documentKind: 'content', outputKind: 'single_post', artifactType: 'social_post' },
      metadata: { workflow: 'create' },
    }, identity);

    const updated = mergeThinkForgeScriptDocument(current, {
      title: 'Revised',
      content: 'After',
    }, identity);

    expect(updated).toMatchObject({
      ...identity,
      title: 'Revised',
      content: 'After',
      richText: current.richText,
      documentType: current.documentType,
      contentContract: current.contentContract,
      metadata: current.metadata,
      version: 4,
    });
    expect(() => mergeThinkForgeScriptDocument(current, {
      sessionId: 'session_b',
      scriptId: 'post_1',
      title: 'Wrong owner',
    }, identity)).toThrow(/different document/i);
    expect(() => mergeThinkForgeScriptDocument(current, {
      scriptId: 'post_2',
      title: 'Wrong partial identity',
    }, identity)).toThrow(/different document/i);
    expect(() => mergeThinkForgeScriptDocument(null, { title: 'Client-only draft' }, identity))
      .toThrow(/server-owned identity/i);
  });

  it('rejects a blank success-shaped load instead of materializing an empty document', () => {
    expect(() => parseThinkForgeLoadedDocument({
      title: 'Untitled Script',
      content: '',
      blocks: [],
      documentType: null,
      contentContract: null,
    }, { sessionId: 'session_a', scriptId: 'missing' })).toThrow(/not found/i);
  });

  it('routes by canonical document authority, not prompt keywords', () => {
    expect(detectContentPath('make a post creating fomo in my brand ICP', 'video_script')).toBe('script');
    expect(detectContentPath('Write a LinkedIn post about video production workflows.', 'social_post')).toBe('post');
    expect(detectContentPath('Write an Instagram reel script with camera direction.', 'social_post')).toBe('post');
    expect(resolveThinkForgeDocumentIntent('make an Instagram carousel for this campaign', 'video_script')).toMatchObject({
      contentPath: 'script',
      source: 'legacy_document_type',
    });
  });

  it('uses the selected format for initial drafts and later user requests', () => {
    expect(resolveThinkForgeGenerationDocumentIntent(
      'Create the complete first script draft for this idea.',
      'Instagram post',
      'initial_draft_claim',
    )).toMatchObject({
      contentPath: 'post',
      source: 'legacy_document_type',
    });

    expect(resolveThinkForgeGenerationDocumentIntent(
      'Turn this into an Instagram reel script with camera direction.',
      'Instagram post',
      'user_request',
    )).toMatchObject({
      contentPath: 'script',
      source: 'explicit_user_request',
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
    expect(scriptHook).toContain("richText: data.richText && typeof data.richText === 'object'");
    expect(scriptHook).toContain("metadata: data.metadata && typeof data.metadata === 'object'");
    expect(scriptHook).toContain("documentType: identifiedScript.documentType");
    expect(scriptHook).toContain("contentContract: identifiedScript.contentContract");
    expect(scriptHook).toContain("setLoadError(message)");
    expect(scriptHook).toContain('Server remains the source of truth');
    expect(scriptHook).toContain('mergeThinkForgeScriptDocument(prev, rawNext, activeIdentity)');
    expect(scriptHook).not.toContain('if (!res.ok || cancelled) return');
    expect(scriptHook).toContain('throw new ThinkForgeDocumentConflictError(currentVersion)');
    expect(scriptHook).toContain('pendingSaveRef.current = null');
    expect(scriptHook).not.toContain('{ version: data.currentVersion }');
    expect(scriptHook.indexOf('if (e instanceof ThinkForgeDocumentConflictError)'))
      .toBeLessThan(scriptHook.indexOf('return performSave(scriptToSave, attempt + 1)'));
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
    expect(chatPanel).toContain('Create the complete first draft for the persisted authoring request');
    expect(chatPanel).toContain('resolveSelectedIdeaAuthoringRequest(selectedIdea)');
    expect(chatPanel).toContain('buildThinkForgeAuthoringCompatibilityMetadata(selectedAuthoringRequest)');
    expect(chatPanel).toContain('hasDocumentContent || !selectedAuthoringRequest');
    expect(chatPanel).toContain('!effectiveAuthoringRequest && !hasDocumentContent');
    expect(chatPanel).not.toContain('normalizeThinkForgeDocumentContract(selectedIdea.format)');
    expect(chatPanel).not.toContain('resolveCarouselSlideCount');
    expect(chatPanel).not.toContain('complete first script draft');
    expect(chatPanel).not.toContain('autoStartFired');
    expect(chatPanel).not.toContain("lastUserAction: 'auto_start'");
    expect(sessionRoute).toContain('db.claimInitialDraftIntent(existingSession._id)');
    expect(db).toContain("'projectMeta.initialDraftIntent.status': 'pending'");
    expect(db).toContain("'projectMeta.initialDraftIntent.status': 'claimed'");
    expect(db).toContain('getScript(sessionId: string, scriptId: string)');
    expect(db).toContain('ThinkForge document ID must be a non-empty trimmed string');
    expect(db).toContain("findOne({ sessionId, scriptId: exactScriptId, recordStatus: 'active' })");
    expect(db).not.toContain('getScript(sessionId: string, scriptId?:');
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
