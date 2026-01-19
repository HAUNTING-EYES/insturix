/**
 * Organization Members API Routes
 * 
 * GET /api/org/[orgId]/members - List organization members
 */

import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { orgMemberService } from '@/lib/services/orgMemberService';
import { OrgRole } from '@/schemas/OrgMember';

interface RouteParams {
  params: Promise<{ orgId: string }>;
}

/**
 * GET /api/org/[orgId]/members
 * List all members of an organization
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

    // Parse query params
    const { searchParams } = new URL(req.url);
    const page = parseInt(searchParams.get('page') || '1', 10);
    const limit = parseInt(searchParams.get('limit') || '50', 10);
    const role = searchParams.get('role') as OrgRole | null;

    const options: { page: number; limit: number; role?: OrgRole } = {
      page: Math.max(1, page),
      limit: Math.min(100, Math.max(1, limit)),
    };
    
    if (role && ['owner', 'admin', 'member'].includes(role)) {
      options.role = role;
    }

    const result = await orgMemberService.getMembers(orgId, options);

    return NextResponse.json({
      success: true,
      members: result.members,
      total: result.total,
      page: options.page,
      totalPages: Math.ceil(result.total / options.limit),
    });
  } catch (error) {
    console.error('Error fetching members:', error);
    return NextResponse.json(
      { error: 'Failed to fetch members' },
      { status: 500 }
    );
  }
}
