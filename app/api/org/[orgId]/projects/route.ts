/**
 * Organization Projects API Routes
 * 
 * GET  /api/org/[orgId]/projects - List organization projects
 * POST /api/org/[orgId]/projects - Create new organization project
 */

import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { orgMemberService } from '@/lib/services/orgMemberService';
import { organizationService } from '@/lib/services/organizationService';
import { projectService } from '@/lib/editron/services/project-service';

interface RouteParams {
  params: Promise<{ orgId: string }>;
}

/**
 * GET /api/org/[orgId]/projects
 * List all projects belonging to an organization
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
    const limit = parseInt(searchParams.get('limit') || '20', 10);
    const sortBy = (searchParams.get('sortBy') || 'updatedAt') as 'createdAt' | 'updatedAt' | 'name';

    const result = await projectService.listOrgProjects(
      userId,
      orgId,
      Math.max(1, page),
      Math.min(100, Math.max(1, limit)),
      sortBy
    );

    return NextResponse.json({
      success: true,
      projects: result.projects,
      total: result.total,
      page: result.page,
      totalPages: result.totalPages,
    });
  } catch (error) {
    console.error('Error fetching org projects:', error);
    return NextResponse.json(
      { error: 'Failed to fetch projects' },
      { status: 500 }
    );
  }
}

/**
 * POST /api/org/[orgId]/projects
 * Create a new project for the organization
 */
export async function POST(req: NextRequest, { params }: RouteParams) {
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

    // Check if org allows member project creation
    const org = await organizationService.getOrganization(orgId);
    if (!org) {
      return NextResponse.json(
        { error: 'Organization not found' },
        { status: 404 }
      );
    }

    const userRole = await orgMemberService.getUserRole(userId, orgId);
    
    // Only owner/admin can create if allowMemberProjects is false
    if (!org.settings.allowMemberProjects && userRole === 'member') {
      return NextResponse.json(
        { error: 'Only admins can create projects in this organization' },
        { status: 403 }
      );
    }

    const body = await req.json();
    const { name } = body;

    if (!name || typeof name !== 'string' || name.trim().length === 0) {
      return NextResponse.json(
        { error: 'Project name is required' },
        { status: 400 }
      );
    }

    const project = await projectService.createOrgProject(userId, orgId, name.trim());

    return NextResponse.json({
      success: true,
      project: {
        projectId: project.projectId,
        name: project.name,
        orgId: project.orgId,
        visibility: project.visibility,
        createdAt: project.createdAt,
      },
    });
  } catch (error) {
    console.error('Error creating org project:', error);
    const message = error instanceof Error ? error.message : 'Failed to create project';
    return NextResponse.json(
      { error: message },
      { status: 500 }
    );
  }
}
