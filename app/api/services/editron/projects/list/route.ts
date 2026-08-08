/**
 * GET /api/services/editron/projects/list
 * List the projects for the caller's ACTIVE context (P2 org UX).
 *
 * Personal context (or flag off): the user's own projects — behavior unchanged. Org context
 * (OrgSwitcher setActive → auth().orgId) with org-wallet billing enabled: the ORG's projects,
 * membership-checked — switching workspaces switches what you see. DISPLAY scopes on active
 * context; billing still routes on each project's persisted ownership (D9).
 */

import { NextRequest, NextResponse } from 'next/server';
import { projectService } from '@/lib/editron/services/project-service';
import { auth } from '@clerk/nextjs/server';
import { isOrgWalletBillingEnabled } from '@/lib/services/org-wallet-flag';

export const runtime = 'nodejs';

export async function GET(request: NextRequest) {
  try {
    const { userId, orgId } = await auth();

    if (!userId) {
      return NextResponse.json(
        { success: false, error: 'Unauthorized' },
        { status: 401 }
      );
    }

    const { searchParams } = new URL(request.url);
    const page = parseInt(searchParams.get('page') || '1', 10);
    const limit = parseInt(searchParams.get('limit') || '20', 10);
    const sortBy = (searchParams.get('sortBy') || 'updatedAt') as 'createdAt' | 'updatedAt' | 'name';

    if (isOrgWalletBillingEnabled() && orgId) {
      try {
        const result = await projectService.listOrgProjects(userId, orgId, page, limit, sortBy);
        return NextResponse.json({ success: true, scope: 'org', orgId, ...result });
      } catch (err) {
        // Membership record missing (Clerk org exists but never synced to the app DB — the
        // webhook provisioning gap). FAIL LOUD with a typed 403; silently falling back to the
        // personal list here would show personal projects inside an org context — the exact
        // confusion this scoping exists to fix.
        if (err instanceof Error && /not a member/i.test(err.message)) {
          console.error(`[projects/list] active org ${orgId} has no synced membership for ${userId} (ORG_MEMBERSHIP_NOT_SYNCED)`);
          return NextResponse.json(
            { success: false, error: 'Your organization is not synced yet.', code: 'ORG_MEMBERSHIP_NOT_SYNCED', scope: 'org', orgId },
            { status: 403 },
          );
        }
        throw err;
      }
    }

    const result = await projectService.listProjects(userId, page, limit, sortBy);

    return NextResponse.json({
      success: true,
      scope: 'personal',
      ...result,
    });
  } catch (error: any) {
    console.error('Error listing projects:', error);
    return NextResponse.json(
      { success: false, error: error.message || 'Failed to list projects' },
      { status: 500 }
    );
  }
}
