import { NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import * as db from '@/lib/thinkforge/services/db';
import {
  resolveProjectMetaBrandId,
  matchesThinkForgeSessionBrandBindingPrincipal,
  resolvePersistedThinkForgeProjectMetadata,
  resolveThinkForgeSessionBrandBinding,
  ThinkForgeEditorialAnglePersistenceError,
  type ProjectMeta,
} from '@/lib/thinkforge/state/types';
import { createThinkForgeSessionBrandBinding } from '@/lib/thinkforge/context/brand-authoring-context';
import {
  authorizeBrandScope,
  BrandScopeAuthorizationError,
} from '@/lib/shared/brand-scope';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * Updates project metadata for an existing ThinkForge session.
 */
export async function POST(req: Request) {
  const { userId, orgId, has } = await auth();
  if (!userId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  let sessionId: string | undefined;
  let projectMeta: ProjectMeta | undefined;

  try {
    const body = await req.json();
    sessionId = body?.sessionId ? String(body.sessionId) : undefined;
    projectMeta = body?.projectMeta;
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  if (!sessionId) {
    return NextResponse.json({ error: 'Missing sessionId' }, { status: 400 });
  }

  try {
    const existing = await db.getSession(sessionId, userId, orgId);
    if (!existing) {
      return NextResponse.json({ error: 'Session not found' }, { status: 404 });
    }

    // The browser cannot write a server-issued binding. Preserve the existing
    // binding and require current ACL authorization before any brand mutation.
    const { brandBinding: _clientBrandBinding, ...incomingProjectMeta } = projectMeta || {};
    const existingBinding = resolveThinkForgeSessionBrandBinding(existing.projectMeta);
    if (existingBinding && !matchesThinkForgeSessionBrandBindingPrincipal(existingBinding, orgId)) {
      return NextResponse.json({
        error: 'Session brand binding does not match the active organization.',
        code: 'brand_binding_scope_mismatch',
      }, { status: 409 });
    }
    const currentExistingBinding = existingBinding?.version === 2 ? existingBinding : undefined;
    const existingBrandId = resolveProjectMetaBrandId(existing.projectMeta);
    const requestedBrandId = typeof incomingProjectMeta.brandId === 'string'
      ? incomingProjectMeta.brandId.trim()
      : undefined;
    if (existingBrandId && requestedBrandId && existingBrandId !== requestedBrandId) {
      return NextResponse.json({
        error: 'Brand binding cannot be changed for an existing ThinkForge session.',
        code: 'brand_binding_immutable',
      }, { status: 409 });
    }

    const effectiveBrandId = existingBrandId ?? requestedBrandId;
    let authorizedIncomingProjectMeta: ProjectMeta = incomingProjectMeta;
    if (effectiveBrandId) {
      const authorizedBrand = await authorizeBrandScope({
        userId,
        orgId: orgId ?? null,
        isOrgAdmin: orgId ? has({ role: 'org:admin' }) : false,
        brandId: effectiveBrandId,
      });
      authorizedIncomingProjectMeta = {
        ...incomingProjectMeta,
        brandId: authorizedBrand.brandId,
        brandBinding: currentExistingBinding ?? createThinkForgeSessionBrandBinding({
          brandId: authorizedBrand.brandId,
          orgId: orgId ?? null,
        }),
      };
    }
    const persistedProjectMeta = resolvePersistedThinkForgeProjectMetadata(
      existing.projectMeta,
      authorizedIncomingProjectMeta,
    );

    const session = await db.getOrCreateSession(
      userId,
      existing._id,
      persistedProjectMeta,
      orgId ?? null,
    );

    return NextResponse.json({
      success: true,
      sessionId: session._id,
      projectMeta: session.projectMeta || {},
    });
  } catch (error: any) {
    if (error instanceof ThinkForgeEditorialAnglePersistenceError) {
      return NextResponse.json(
        { error: error.message, code: error.code },
        { status: 422 },
      );
    }
    if (error instanceof BrandScopeAuthorizationError) {
      return NextResponse.json(
        { error: error.message, code: error.code },
        { status: error.code === 'brand_scope_unavailable' ? 503 : 404 },
      );
    }
    console.error('Error updating session project meta:', error);
    return NextResponse.json(
      { error: 'Failed to update session', details: error?.message },
      { status: 500 }
    );
  }
}
