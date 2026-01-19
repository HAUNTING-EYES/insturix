/**
 * Organization API Routes
 * 
 * GET  /api/org - List user's organizations
 * POST /api/org - Create new organization (via Clerk client-side)
 */

import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { organizationService } from '@/lib/services/organizationService';

/**
 * GET /api/org
 * List all organizations the current user belongs to
 */
export async function GET() {
  try {
    const { userId } = await auth();
    
    if (!userId) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      );
    }

    const organizations = await organizationService.getUserOrganizations(userId);

    return NextResponse.json({
      success: true,
      organizations,
    });
  } catch (error) {
    console.error('Error fetching organizations:', error);
    return NextResponse.json(
      { error: 'Failed to fetch organizations' },
      { status: 500 }
    );
  }
}

/**
 * POST /api/org
 * 
 * Note: Organization creation happens client-side via Clerk's 
 * CreateOrganization component or clerk.createOrganization().
 * This endpoint is reserved for any server-side org creation needs.
 * The actual org document is created via webhook when Clerk fires
 * the organization.created event.
 */
export async function POST(req: NextRequest) {
  try {
    const { userId } = await auth();
    
    if (!userId) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      );
    }

    // Org creation should happen via Clerk client-side
    // This endpoint can be used for any pre-creation validation
    const body = await req.json();
    const { name } = body;

    if (!name || typeof name !== 'string' || name.trim().length === 0) {
      return NextResponse.json(
        { error: 'Organization name is required' },
        { status: 400 }
      );
    }

    // Return information for client to proceed with Clerk creation
    return NextResponse.json({
      success: true,
      message: 'Proceed with Clerk organization creation',
      validated: true,
    });
  } catch (error) {
    console.error('Error in org creation validation:', error);
    return NextResponse.json(
      { error: 'Validation failed' },
      { status: 500 }
    );
  }
}
