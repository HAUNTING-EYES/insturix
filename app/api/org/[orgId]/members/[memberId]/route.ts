/**
 * Organization Member Management API Routes
 * 
 * PATCH  /api/org/[orgId]/members/[userId] - Update member role
 * DELETE /api/org/[orgId]/members/[userId] - Remove member
 */

import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { organizationService } from '@/lib/services/organizationService';
import { orgMemberService } from '@/lib/services/orgMemberService';
import { OrgRole } from '@/schemas/OrgMember';

interface RouteParams {
  params: Promise<{ orgId: string; memberId: string }>;
}

/**
 * PATCH /api/org/[orgId]/members/[memberId]
 * Update a member's role (admin+ only)
 */
export async function PATCH(req: NextRequest, { params }: RouteParams) {
  try {
    const { userId: currentUserId } = await auth();
    const { orgId, memberId } = await params;
    
    if (!currentUserId) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      );
    }

    // Verify current user can manage org
    const canManage = await organizationService.canManageOrg(currentUserId, orgId);
    if (!canManage) {
      return NextResponse.json(
        { error: 'Only owners and admins can update member roles' },
        { status: 403 }
      );
    }

    const body = await req.json();
    const { role } = body;

    if (!role || !['admin', 'member'].includes(role)) {
      return NextResponse.json(
        { error: 'Invalid role. Must be "admin" or "member"' },
        { status: 400 }
      );
    }

    // Prevent self-demotion for protection
    if (currentUserId === memberId && role === 'member') {
      const currentRole = await orgMemberService.getUserRole(currentUserId, orgId);
      if (currentRole === 'owner') {
        return NextResponse.json(
          { error: 'Cannot demote owner. Transfer ownership first.' },
          { status: 400 }
        );
      }
    }

    const updated = await orgMemberService.updateMemberRole(orgId, memberId, role as OrgRole);
    if (!updated) {
      return NextResponse.json(
        { error: 'Member not found' },
        { status: 404 }
      );
    }

    return NextResponse.json({
      success: true,
      member: {
        clerkUserId: updated.clerkUserId,
        role: updated.role,
        email: updated.email,
      },
    });
  } catch (error) {
    console.error('Error updating member role:', error);
    const message = error instanceof Error ? error.message : 'Failed to update member';
    return NextResponse.json(
      { error: message },
      { status: 500 }
    );
  }
}

/**
 * DELETE /api/org/[orgId]/members/[memberId]
 * Remove a member from the organization
 * 
 * Note: For Clerk-synced orgs, removal should happen via Clerk client-side.
 * This is for permission checking and internal cleanup scenarios.
 */
export async function DELETE(req: NextRequest, { params }: RouteParams) {
  try {
    const { userId: currentUserId } = await auth();
    const { orgId, memberId } = await params;
    
    if (!currentUserId) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      );
    }

    // Users can remove themselves
    const isSelf = currentUserId === memberId;
    
    if (!isSelf) {
      // Otherwise need admin+ permissions
      const canManage = await organizationService.canManageOrg(currentUserId, orgId);
      if (!canManage) {
        return NextResponse.json(
          { error: 'Only owners and admins can remove members' },
          { status: 403 }
        );
      }
    }

    // Prevent owner from leaving without transfer
    const memberRole = await orgMemberService.getUserRole(memberId, orgId);
    if (memberRole === 'owner') {
      return NextResponse.json(
        { error: 'Owner cannot leave. Transfer ownership first.' },
        { status: 400 }
      );
    }

    const removed = await orgMemberService.removeMember(orgId, memberId);
    if (!removed) {
      return NextResponse.json(
        { error: 'Member not found' },
        { status: 404 }
      );
    }

    return NextResponse.json({
      success: true,
      message: 'Member removed successfully',
    });
  } catch (error) {
    console.error('Error removing member:', error);
    const message = error instanceof Error ? error.message : 'Failed to remove member';
    return NextResponse.json(
      { error: message },
      { status: 500 }
    );
  }
}
