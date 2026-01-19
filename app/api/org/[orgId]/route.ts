/**
 * Organization Detail API Routes
 * 
 * GET    /api/org/[orgId] - Get organization details
 * PATCH  /api/org/[orgId] - Update organization settings
 * DELETE /api/org/[orgId] - Delete organization (owner only, via Clerk)
 */

import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { organizationService } from '@/lib/services/organizationService';
import { orgMemberService } from '@/lib/services/orgMemberService';

interface RouteParams {
  params: Promise<{ orgId: string }>;
}

/**
 * GET /api/org/[orgId]
 * Get organization details
 */
export async function GET(req: NextRequest, { params }: RouteParams) {
  try {
    const { userId } = await auth();
    const { orgId } = await params;
    
    if (!userId) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      );
    }

    // Verify user is a member
    const isMember = await orgMemberService.isMember(userId, orgId);
    if (!isMember) {
      return NextResponse.json(
        { error: 'Not a member of this organization' },
        { status: 403 }
      );
    }

    const organization = await organizationService.getOrganization(orgId);
    if (!organization) {
      return NextResponse.json(
        { error: 'Organization not found' },
        { status: 404 }
      );
    }

    // Get user's role for permission context
    const userRole = await orgMemberService.getUserRole(userId, orgId);

    return NextResponse.json({
      success: true,
      organization: {
        clerkOrgId: organization.clerkOrgId,
        name: organization.name,
        slug: organization.slug,
        imageUrl: organization.imageUrl,
        memberCount: organization.memberCount,
        settings: organization.settings,
        createdAt: organization.createdAt,
      },
      userRole,
    });
  } catch (error) {
    console.error('Error fetching organization:', error);
    return NextResponse.json(
      { error: 'Failed to fetch organization' },
      { status: 500 }
    );
  }
}

/**
 * PATCH /api/org/[orgId]
 * Update organization settings (owner/admin only)
 */
export async function PATCH(req: NextRequest, { params }: RouteParams) {
  try {
    const { userId } = await auth();
    const { orgId } = await params;
    
    if (!userId) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      );
    }

    // Verify user can manage org
    const canManage = await organizationService.canManageOrg(userId, orgId);
    if (!canManage) {
      return NextResponse.json(
        { error: 'Only owners and admins can update organization settings' },
        { status: 403 }
      );
    }

    const body = await req.json();
    const { allowMemberProjects, defaultRole } = body;

    const settings: Record<string, unknown> = {};
    if (typeof allowMemberProjects === 'boolean') {
      settings.allowMemberProjects = allowMemberProjects;
    }
    if (defaultRole === 'admin' || defaultRole === 'member') {
      settings.defaultRole = defaultRole;
    }

    if (Object.keys(settings).length === 0) {
      return NextResponse.json(
        { error: 'No valid settings to update' },
        { status: 400 }
      );
    }

    const updated = await organizationService.updateSettings(orgId, settings);
    if (!updated) {
      return NextResponse.json(
        { error: 'Failed to update organization' },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      organization: {
        clerkOrgId: updated.clerkOrgId,
        name: updated.name,
        settings: updated.settings,
      },
    });
  } catch (error) {
    console.error('Error updating organization:', error);
    return NextResponse.json(
      { error: 'Failed to update organization' },
      { status: 500 }
    );
  }
}

/**
 * DELETE /api/org/[orgId]
 * 
 * Note: Organization deletion should happen via Clerk client-side
 * (clerk.organization.delete()). The cleanup happens via webhook.
 * This endpoint is for validation/permission checks.
 */
export async function DELETE(req: NextRequest, { params }: RouteParams) {
  try {
    const { userId } = await auth();
    const { orgId } = await params;
    
    if (!userId) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      );
    }

    // Only owner can delete
    const isOwner = await organizationService.isOwner(userId, orgId);
    if (!isOwner) {
      return NextResponse.json(
        { error: 'Only the organization owner can delete it' },
        { status: 403 }
      );
    }

    // Return confirmation for client to proceed with Clerk deletion
    return NextResponse.json({
      success: true,
      message: 'Proceed with Clerk organization deletion',
      canDelete: true,
    });
  } catch (error) {
    console.error('Error in org deletion check:', error);
    return NextResponse.json(
      { error: 'Deletion check failed' },
      { status: 500 }
    );
  }
}
