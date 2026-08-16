import { NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { createIngestorAgent } from '@/lib/thinkforge/agents/ingestor-agent';
import { createArchitectAgent } from '@/lib/thinkforge/agents/architect-agent';
import { createStylistAgent } from '@/lib/thinkforge/agents/stylist-agent';
import { createScopeDetectorAgent } from '@/lib/thinkforge/agents/scope-detector-agent';
import {
  quickAssembleContext,
  resolveThinkForgeAuthoringContext,
  type ThinkForgeResolvedAuthoringContext,
} from '@/lib/thinkforge/context';
import * as db from '@/lib/thinkforge/services/db';
import { toThinkForgeErrorResponse } from '@/lib/thinkforge/errors/thinkforge-error';
import { checkCredits } from '@/lib/services/creditsMiddleware';
import { resolveContextBillingOwner } from '@/lib/editron/services/project-ownership';
import { isOrgWalletBillingEnabled } from '@/lib/services/org-wallet-flag';
import { ThinkForgeBrandAuthorityError } from '@/lib/thinkforge/context/brand-authoring-context';
import { LEGACY_BLUEPRINT_RETIREMENT } from '@/lib/thinkforge/blueprints/legacy-blueprint-retirement';
import crypto from 'crypto';
import { z } from 'zod';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

const LEGACY_SPECIALIST_RETIREMENT = Object.freeze({
  error: 'Legacy specialist authoring is retired.',
  code: 'LEGACY_SPECIALIST_RETIRED',
  message: 'Use the canonical post, carousel, or video-script authoring flow. Arbitrary specialist documents are no longer accepted.',
});

const SidecarSchema = z.object({
  action: z.enum(['deconstruct', 'storyboard', 'refine_voice', 'summon_specialist', 'detect_scope', 'discover_blueprint', 'initialize_blueprint']),
  sessionId: z.string().trim().min(1),
  content: z.string().optional(),
  scriptId: z.string().trim().min(1).optional(),
  threadId: z.string().default('default'),
}).passthrough();

function authoringContextErrorResponse(error: ThinkForgeBrandAuthorityError): NextResponse {
  const status = error.code === 'brand_not_found'
    ? 404
    : error.code === 'brand_profile_unavailable'
      ? 409
      : 503;
  return NextResponse.json({
    error: 'Brand context unavailable',
    code: error.code,
    message: error.message,
  }, { status });
}

export async function POST(req: Request) {
  const { userId, orgId, has } = await auth();
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
  const { action, sessionId, content, scriptId } = parsed.data;
  const actionContent = content?.trim() ?? '';
  if (action === 'discover_blueprint' || action === 'initialize_blueprint') {
    return NextResponse.json(LEGACY_BLUEPRINT_RETIREMENT, { status: 410 });
  }
  if (action === 'summon_specialist') {
    return NextResponse.json(LEGACY_SPECIALIST_RETIREMENT, { status: 410 });
  }
  if (action === 'deconstruct' && !actionContent) {
    return NextResponse.json({ error: 'No content to deconstruct' }, { status: 400 });
  }
  if (action === 'storyboard' && !actionContent) {
    return NextResponse.json({ error: 'No content to storyboard' }, { status: 400 });
  }
  if (action === 'detect_scope' && !actionContent) {
    return NextResponse.json({ error: 'No project description to analyze' }, { status: 400 });
  }
  const requiresStoredDocument = action === 'refine_voice' && !actionContent;
  if (requiresStoredDocument && !scriptId) {
    return NextResponse.json({ error: 'Document identity is required' }, { status: 400 });
  }

  let session: NonNullable<Awaited<ReturnType<typeof db.getSession>>>;
  let script: Awaited<ReturnType<typeof db.getScript>> = null;
  try {
    const authorizedSession = await db.getSession(sessionId, userId, orgId);
    if (!authorizedSession) {
      return NextResponse.json({ error: 'Session not found' }, { status: 404 });
    }
    session = authorizedSession;
  } catch (error) {
    console.error('[ThinkForge Sidecar] Session authorization failed:', error);
    return NextResponse.json({ error: 'Failed to authorize session' }, { status: 500 });
  }

  const canonicalSessionId = session._id;
  if (requiresStoredDocument) {
    if (!scriptId) {
      return NextResponse.json({ error: 'Document identity is required' }, { status: 400 });
    }
    try {
      script = await db.getScript(canonicalSessionId, scriptId);
    } catch (error) {
      console.error('[ThinkForge Sidecar] Document load failed:', error);
      return NextResponse.json({ error: 'Failed to load document' }, { status: 500 });
    }
    if (!script) {
      return NextResponse.json({ error: 'Document not found' }, { status: 404 });
    }
  }

  const scriptContent = script?.content || '';
  const draftContent = actionContent || scriptContent;
  if (action === 'refine_voice' && !draftContent.trim()) {
    return NextResponse.json({ error: 'No draft content to analyze' }, { status: 400 });
  }

  let authoringContext: ThinkForgeResolvedAuthoringContext;
  try {
    authoringContext = await resolveThinkForgeAuthoringContext({
      userId,
      orgId: session.orgId ?? null,
      isOrgAdmin: Boolean(orgId && has?.({ role: 'org:admin' })),
      sessionProjectMeta: session.projectMeta,
      projectId: canonicalSessionId,
      sessionId: canonicalSessionId,
      currentPrompt: actionContent,
      currentScript: scriptContent,
      maxFacts: 5,
      interactionWindowDays: 30,
    });
  } catch (error) {
    console.error('[ThinkForge Sidecar] Authoring context resolution failed:', error);
    if (error instanceof ThinkForgeBrandAuthorityError) {
      return authoringContextErrorResponse(error);
    }
    const normalized = toThinkForgeErrorResponse(error);
    return NextResponse.json(normalized.body, { status: normalized.status });
  }

  // P3.1: the active context at WORK-START decides who pays (stamped surfaces).
  const billingWallet = resolveContextBillingOwner(userId, orgId ?? null, isOrgWalletBillingEnabled());

  const creditCheck = await checkCredits(
    userId,
    'thinkforge',
    'document_creation',
    { taskId: canonicalSessionId },
    billingWallet,
  );
  if (!creditCheck.allowed) return creditCheck.errorResponse;
  await creditCheck.deduct();

  try {
    const preferences = await db.getUserPreferences(userId);
    const projectContext = { ...authoringContext.projectMeta, preferences };

    const context = quickAssembleContext(
      'chat',
      projectContext,
      script ? { title: script.title, content: scriptContent } : null,
      [],
      null,
      authoringContext.systemBrief || null
    );

    switch (action) {
      case 'deconstruct': {
        const agent = createIngestorAgent();
        const result = await agent.deconstruct({ context, userPrompt: actionContent });
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
        const agent = createArchitectAgent();
        const result = await agent.storyboard({ context, userPrompt: actionContent });
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

      case 'detect_scope': {
        const agent = createScopeDetectorAgent();
        const result = await agent.detectScope({ context, userPrompt: actionContent });
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
