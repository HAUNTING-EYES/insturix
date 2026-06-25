import { NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { createIngestorAgent } from '@/lib/thinkforge/agents/ingestor-agent';
import { createArchitectAgent } from '@/lib/thinkforge/agents/architect-agent';
import { createStylistAgent } from '@/lib/thinkforge/agents/stylist-agent';
import { createSupervisorAgent, type NullAgentDefinition } from '@/lib/thinkforge/agents/supervisor-agent';
import { createNullAgent } from '@/lib/thinkforge/agents/null-agent';
import { createScopeDetectorAgent } from '@/lib/thinkforge/agents/scope-detector-agent';
import { createDiscoveryAgent, type DiscoveryAgentInput } from '@/lib/thinkforge/agents/discovery-agent';
import { quickAssembleContext, fetchContextSources, formatSystemBrief } from '@/lib/thinkforge/context';
import * as db from '@/lib/thinkforge/services/db';
import { applyCommand } from '@/lib/thinkforge/services/command-service';
import { appendEvent } from '@/lib/thinkforge/services/event-log';
import { toThinkForgeErrorResponse } from '@/lib/thinkforge/errors/thinkforge-error';
import { checkCredits } from '@/lib/services/creditsMiddleware';
import { parseMarkdownToBlocks } from '@/lib/thinkforge/normalization/markdown-parser';
import { validateThinkForgeBlocks } from '@/lib/thinkforge/schemas/thinkforge-block';
import { thinkForgeBlocksToTiptapJSON } from '@/lib/thinkforge/mappers/thinkforge-to-tiptap';
import crypto from 'crypto';
import { z } from 'zod';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

const SidecarSchema = z.object({
  action: z.enum(['deconstruct', 'storyboard', 'refine_voice', 'summon_specialist', 'detect_scope', 'discover_blueprint', 'initialize_blueprint']),
  sessionId: z.string().min(1),
  content: z.string().optional(),
  scriptId: z.string().optional(),
  specialistRequest: z.string().optional(),
  threadId: z.string().default('default'),
  artifacts: z.array(z.object({
    type: z.string(),
    label: z.string(),
    description: z.string().optional(),
    priority: z.string().optional(),
  }).passthrough()).optional(),
}).passthrough();

export async function POST(req: Request) {
  const { userId } = await auth();
  if (!userId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  let raw: unknown;
  try {
    raw = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const parsed = SidecarSchema.safeParse(raw);
  if (!parsed.success) {
    return NextResponse.json({ error: 'Invalid request body', details: parsed.error.issues }, { status: 400 });
  }
  const { action, sessionId, content, scriptId, specialistRequest, threadId, artifacts: blueprintArtifacts } = parsed.data;

  const creditCheck = await checkCredits(userId, 'thinkforge', 'document_creation', { taskId: sessionId });
  if (!creditCheck.allowed) return creditCheck.errorResponse;
  await creditCheck.deduct();

  const session = await db.getSession(sessionId, userId);
  if (!session) {
    return NextResponse.json({ error: 'Session not found' }, { status: 404 });
  }

  try {
    const script = await db.getScript(sessionId, scriptId || undefined);
    const scriptContent = script?.content || '';

    const [preferences, retrievedCtx] = await Promise.all([
      db.getUserPreferences(userId),
      fetchContextSources({
        userId,
        projectId: sessionId,
        sessionId,
        brandId: typeof session.projectMeta?.brandId === 'string'
          ? session.projectMeta.brandId
          : undefined,
        orgId: session.orgId ?? null,
        currentPrompt: content || '',
        currentScript: scriptContent,
        maxFacts: 5,
        interactionWindowDays: 30,
      }).catch(() => null),
    ]);

    const systemBrief = retrievedCtx ? formatSystemBrief(retrievedCtx) : null;
    const projectContext = { ...(session.projectMeta || {}), preferences };

    const context = quickAssembleContext(
      'chat',
      projectContext,
      script ? { title: script.title, content: scriptContent } : null,
      [],
      null,
      systemBrief
    );

    switch (action) {
      case 'deconstruct': {
        if (!content?.trim()) {
          return NextResponse.json({ error: 'No content to deconstruct' }, { status: 400 });
        }
        const agent = createIngestorAgent();
        const result = await agent.deconstruct({ context, userPrompt: content });
        return NextResponse.json({
          type: 'asset',
          card: {
            id: crypto.randomUUID(),
            type: 'asset' as const,
            title: result.title,
            body: result.summary,
            data: {
              atomicFacts: result.atomicFacts,
              viralHooks: result.viralHooks,
              visualAssets: result.visualAssets,
              tags: result.tags,
            },
            actions: [
              { id: 'insert_facts', label: 'Insert Facts into DataBank', variant: 'primary' },
              { id: 'copy_hooks', label: 'Copy Hooks', variant: 'secondary' },
            ],
            timestamp: Date.now(),
          },
        });
      }

      case 'storyboard': {
        if (!content?.trim()) {
          return NextResponse.json({ error: 'No content to storyboard' }, { status: 400 });
        }
        const agent = createArchitectAgent();
        const result = await agent.storyboard({ context, userPrompt: content });
        return NextResponse.json({
          type: 'asset',
          card: {
            id: crypto.randomUUID(),
            type: 'asset' as const,
            title: result.title,
            body: `${result.shots.length} shots | Total: ${result.totalDuration}`,
            data: {
              shots: result.shots,
              bRollSuggestions: result.bRollSuggestions,
              musicDirection: result.musicDirection,
              productionNotes: result.productionNotes,
              totalDuration: result.totalDuration,
            },
            actions: [
              { id: 'create_shot_list_doc', label: 'Create Shot List Tab', variant: 'primary' },
              { id: 'copy_shots', label: 'Copy to Clipboard', variant: 'secondary' },
            ],
            timestamp: Date.now(),
          },
        });
      }

      case 'refine_voice': {
        const draftContent = content || scriptContent;
        if (!draftContent?.trim()) {
          return NextResponse.json({ error: 'No draft content to analyze' }, { status: 400 });
        }
        const agent = createStylistAgent();
        const result = await agent.checkVoice({ context, userPrompt: draftContent });
        return NextResponse.json({
          type: 'suggestion',
          card: {
            id: crypto.randomUUID(),
            type: 'suggestion' as const,
            title: `Voice Check: ${result.overallScore}/100`,
            body: result.voiceSummary,
            data: {
              overallScore: result.overallScore,
              flags: result.flags,
              patternInterrupts: result.patternInterrupts,
              toneAnalysis: result.toneAnalysis,
            },
            actions: result.flags.length > 0
              ? [{ id: 'apply_fixes', label: 'Apply Suggested Fixes', variant: 'primary' }]
              : [],
            timestamp: Date.now(),
          },
        });
      }

      case 'summon_specialist': {
        if (!specialistRequest?.trim()) {
          return NextResponse.json({ error: 'Missing specialist request' }, { status: 400 });
        }

        const supervisor = createSupervisorAgent();
        const definition = await supervisor.synthesizeAgent({
          context,
          userPrompt: specialistRequest,
        });

        const nullAgent = createNullAgent(definition);
        const { stream } = await nullAgent.execute({ context, userPrompt: specialistRequest });

        let markdown = '';
        for await (const chunk of stream) {
          markdown += chunk;
        }

        const parsedBlocks = parseMarkdownToBlocks(markdown);
        const blocks = validateThinkForgeBlocks(parsedBlocks);
        const richText = thinkForgeBlocksToTiptapJSON(blocks);

        const newScriptId = crypto.randomUUID();
        await applyCommand({
          type: 'ReplaceDocument',
          sessionId,
          baseVersion: 0,
          source: 'ai',
          payload: {
            scriptId: newScriptId,
            title: definition.title,
            content: markdown,
            blocks,
            richText,
            documentType: definition.documentType,
          },
        }, userId);

        return NextResponse.json({
          type: 'specialist_result',
          card: {
            id: crypto.randomUUID(),
            type: 'specialist_result' as const,
            title: `${definition.persona}: ${definition.title}`,
            body: `Document created by ${definition.persona}. Open the new tab to view.`,
            data: {
              scriptId: newScriptId,
              documentType: definition.documentType,
              persona: definition.persona,
            },
            actions: [
              { id: 'open_tab', label: 'Open Document Tab', variant: 'primary', payload: { scriptId: newScriptId } },
            ],
            timestamp: Date.now(),
          },
        });
      }

      case 'detect_scope': {
        if (!content?.trim()) {
          return NextResponse.json({ error: 'No project description to analyze' }, { status: 400 });
        }
        const agent = createScopeDetectorAgent();
        const result = await agent.detectScope({ context, userPrompt: content });
        return NextResponse.json({
          type: 'context',
          card: {
            id: crypto.randomUUID(),
            type: 'context' as const,
            title: `Project Scope: ${result.complexity.replace('_', ' ').toUpperCase()}`,
            body: result.summary,
            data: {
              complexity: result.complexity,
              domain: result.domain,
              estimatedDuration: result.estimatedDuration,
              recommendedArtifacts: result.recommendedArtifacts,
            },
            timestamp: Date.now(),
          },
          scope: result,
        });
      }

      case 'discover_blueprint': {
        if (!content?.trim()) {
          return NextResponse.json({ error: 'No project description' }, { status: 400 });
        }

        const scopeAgent = createScopeDetectorAgent();
        const scope = await scopeAgent.detectScope({ context, userPrompt: content });

        const discoveryAgent = createDiscoveryAgent();
        const proposal = await discoveryAgent.proposeBlueprint({
          context,
          userPrompt: content,
          scope,
        } as DiscoveryAgentInput);

        return NextResponse.json({
          type: 'decision',
          card: {
            id: crypto.randomUUID(),
            type: 'decision' as const,
            title: 'Blueprint Proposal',
            body: proposal.greeting,
            data: {
              artifacts: proposal.artifacts,
              followUpQuestion: proposal.followUpQuestion,
              scope,
            },
            actions: [
              { id: 'initialize_blueprint', label: 'Initialize Blueprint', variant: 'primary' },
              { id: 'customize_blueprint', label: 'Customize', variant: 'secondary' },
            ],
            dismissible: true,
            timestamp: Date.now(),
          },
        });
      }

      case 'initialize_blueprint': {
        return NextResponse.json({
          error: 'Blueprint initialization has moved to the chat stream. Use the /api/services/thinkforge/chat endpoint with blueprintArtifacts.',
          code: 'DEPRECATED_ENDPOINT',
        }, { status: 410 });
      }

      default:
        return NextResponse.json({ error: `Unknown action: ${action}` }, { status: 400 });
    }
  } catch (error: any) {
    console.error('[ThinkForge Sidecar] Error:', error);
    await creditCheck.refund(error?.message || 'Sidecar action failed');
    const normalized = toThinkForgeErrorResponse(error);
    return NextResponse.json(normalized.body, { status: normalized.status });
  }
}
