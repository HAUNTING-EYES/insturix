import { NextResponse } from 'next/server';
import { auth, clerkClient } from '@clerk/nextjs/server';
import * as db from '@/lib/thinkforge/services/db';
import { projectService } from '@/lib/editron/services/project-service';
import {
  authorizeBrandScope,
  BrandScopeAuthorizationError,
} from '@/lib/shared/brand-scope';
import {
  createThinkForgeSessionBrandBinding,
} from '@/lib/thinkforge/context/brand-authoring-context';
import {
  matchesThinkForgeSessionBrandBindingPrincipal,
  resolveThinkForgeSessionBrandBinding,
  type ProjectMeta,
} from '@/lib/thinkforge/state/types';
import {
  addProjectToLinkBySessionId,
  createProjectLink,
  findLinkBySessionId,
} from '@/lib/shared/project-links';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * Unified session endpoint
 * Handles get or create session with full state loading
 */
export async function POST(req: Request) {
  const requestStartedAt = performance.now();
  const { userId, orgId, has } = await auth();
  if (!userId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  let sessionId: string | undefined;
  let scriptId: string | undefined;
  let projectMeta: ProjectMeta | undefined;
  let claimInitialDraft = false;

  try {
    const body = await req.json();
    if (body?.sessionId !== undefined) {
      if (typeof body.sessionId !== 'string' || !body.sessionId.trim() || body.sessionId.trim() !== body.sessionId) {
        return NextResponse.json({ error: 'Invalid sessionId' }, { status: 400 });
      }
      sessionId = body.sessionId;
    }
    if (body?.scriptId !== undefined) {
      if (typeof body.scriptId !== 'string' || !body.scriptId.trim() || body.scriptId.trim() !== body.scriptId) {
        return NextResponse.json({ error: 'Invalid scriptId' }, { status: 400 });
      }
      scriptId = body.scriptId;
    }
    projectMeta = body?.projectMeta;
    claimInitialDraft = body?.claimInitialDraft === true;
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  // Bindings are server-issued session authority, never browser state. The
  // browser sends a requested brandId; this route authorizes and stamps it.
  if (projectMeta) {
    const { brandBinding: _clientBrandBinding, ...clientProjectMeta } = projectMeta;
    projectMeta = clientProjectMeta;
  }

  try {
    if (claimInitialDraft) {
      if (!sessionId) {
        return NextResponse.json({ error: 'Missing sessionId' }, { status: 400 });
      }

      const existingSession = await db.getSession(sessionId, userId, orgId);
      if (!existingSession) {
        return NextResponse.json({ error: 'Session not found' }, { status: 404 });
      }

      const initialDraftClaimed = await db.claimInitialDraftIntent(existingSession._id);
      return NextResponse.json({
        sessionId: existingSession._id,
        initialDraftClaimed,
      });
    }

    const existingSession = sessionId
      ? await db.getSession(sessionId, userId, orgId)
      : null;
    if (sessionId && !existingSession) {
      return NextResponse.json({ error: 'Session not found' }, { status: 404 });
    }
    if (sessionId && !scriptId) {
      return NextResponse.json({ error: 'Missing scriptId' }, { status: 400 });
    }

    const requestedBrandId = typeof projectMeta?.brandId === 'string'
      ? projectMeta.brandId.trim()
      : '';
    const existingBinding = resolveThinkForgeSessionBrandBinding(existingSession?.projectMeta);
    if (existingBinding && !matchesThinkForgeSessionBrandBindingPrincipal(existingBinding, orgId)) {
      return NextResponse.json({
        error: 'Session brand binding does not match the active organization.',
        code: 'brand_binding_scope_mismatch',
      }, { status: 409 });
    }
    const currentExistingBinding = existingBinding?.version === 2 ? existingBinding : undefined;
    const existingBrandId = existingBinding?.brandId
      ?? (typeof existingSession?.projectMeta?.brandId === 'string'
        ? existingSession.projectMeta.brandId.trim()
        : '');
    const effectiveBrandId = requestedBrandId || existingBrandId;
    if (effectiveBrandId) {

      if (requestedBrandId && existingBrandId && existingBrandId !== requestedBrandId) {
        return NextResponse.json({
          error: 'Brand binding cannot be changed for an existing ThinkForge session.',
          code: 'brand_binding_immutable',
        }, { status: 409 });
      }

      const authorizedBrand = await authorizeBrandScope({
        userId,
        orgId: orgId ?? null,
        isOrgAdmin: orgId ? has({ role: 'org:admin' }) : false,
        brandId: effectiveBrandId,
      });
      projectMeta = {
        ...projectMeta,
        brandId: authorizedBrand.brandId,
        brandBinding: currentExistingBinding ?? createThinkForgeSessionBrandBinding({
          brandId: authorizedBrand.brandId,
          orgId: orgId ?? null,
        }),
      };
    }

    // Get creator name for org context display (only for new sessions)
    let createdByName: string | undefined;
    if (orgId && !sessionId) {
      try {
        const client = await clerkClient();
        const user = await client.users.getUser(userId);
        createdByName = user.firstName 
          ? `${user.firstName}${user.lastName ? ' ' + user.lastName : ''}`
          : user.username || user.emailAddresses[0]?.emailAddress?.split('@')[0] || 'Unknown';
      } catch (e) {
        console.error('[ThinkForge] Failed to get user name:', e);
      }
    }

    // Create/get session with org context
    const session = await db.getOrCreateSession(userId, sessionId, projectMeta, orgId, createdByName);

    // If this is a NEW session (no sessionId provided in request), create a lightweight
    // Editron project at "script" stage so it appears on the Production Floor dashboard.
    // Fail-open: project creation failure must never block session functionality.
    if (!sessionId) {
      try {
        const projectMetaRecord = projectMeta as Record<string, unknown> | undefined;
        const title = typeof projectMetaRecord?.title === 'string' ? projectMetaRecord.title.trim() : '';
        const topic = typeof projectMetaRecord?.topic === 'string' ? projectMetaRecord.topic.trim() : '';
        const scriptTitle = title || topic || 'Untitled Script';
        const project = await projectService.createScriptStageProject(
          userId,
          session._id,
          scriptTitle,
          { brandId: (projectMeta as any)?.brandId, orgId: orgId || undefined },
        );
        if (project) {
          // Create early project link tying session → project
          const existingLink = await findLinkBySessionId(userId, session._id);
          if (!existingLink) {
            await createProjectLink(userId, {
              sessionId: session._id,
              projectId: project.projectId,
              brandId: (projectMeta as any)?.brandId,
            });
          } else if (!existingLink.projectIds?.includes(project.projectId)) {
            await addProjectToLinkBySessionId(userId, session._id, project.projectId);
          }
          console.log(`[ThinkForge] Script-stage project ${project.projectId} created for session ${session._id}`);
        }
      } catch (linkErr: any) {
        console.error(`[ThinkForge] Script-stage project creation failed (non-blocking): ${linkErr.message}`);
      }
    }

    // These reads share only the authorized canonical identity, so running them
    // together keeps hydration atomic without paying their latency serially.
    const stateReadStartedAt = performance.now();
    const effectiveScriptId = scriptId ?? 'default';
    const [script, chat, preferences] = await Promise.all([
      db.getScript(session._id, effectiveScriptId),
      db.getChatHistory(session._id, 50, 'default'),
      db.getUserPreferences(userId),
    ]);
    const stateReadMs = performance.now() - stateReadStartedAt;
    const totalMs = performance.now() - requestStartedAt;

    return NextResponse.json({
      sessionId: session._id,
      userId: session.userId,
      orgId: session.orgId,
      createdByName: session.createdByName,
      projectMeta: session.projectMeta || {},
      preferences,
      script: script ? {
        sessionId: script.sessionId,
        scriptId: script.scriptId || effectiveScriptId,
        title: script.title,
        content: script.content,
        blocks: script.blocks || [],
        richText: script.richText,
        metadata: script.metadata || {},
        ...(script.scriptSidecarRead ? { scriptSidecarRead: script.scriptSidecarRead } : {}),
        version: script.version,
        documentType: script.documentType,
        contentContract: script.contentContract,
      } : null,
      activeGeneration: session.activeGeneration || null,
      chat
    }, {
      headers: {
        'Server-Timing': `tf-session-state;dur=${stateReadMs.toFixed(1)}, tf-session-total;dur=${totalMs.toFixed(1)}`,
      },
    });
  } catch (error: any) {
    if (error instanceof BrandScopeAuthorizationError) {
      return NextResponse.json({
        error: error.message,
        code: error.code,
      }, { status: error.code === 'brand_scope_unavailable' ? 503 : 404 });
    }
    console.error('Error in session endpoint:', error);
    
    return NextResponse.json(
      { error: 'Session operation failed', details: error?.message },
      { status: 500 }
    );
  }
}
