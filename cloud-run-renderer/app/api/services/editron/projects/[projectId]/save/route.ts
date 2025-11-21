/**
 * POST /api/services/editron/projects/[projectId]/save
 * Manual save project
 */

import { NextRequest, NextResponse } from 'next/server';
import { projectService } from '@/lib/editron/services/project-service';
import { auth } from '@clerk/nextjs/server';
import { z } from 'zod';

export const runtime = 'nodejs';

// Input validation schema
const SaveProjectSchema = z.object({
  overlays: z.array(z.any()),
  aspectRatio: z.string(),
  playerDimensions: z.object({
    width: z.number().positive(),
    height: z.number().positive()
  }),
  fps: z.number().positive().optional(),
  durationInFrames: z.number().nonnegative().optional()
});

export async function POST(
  request: NextRequest,
  { params }: { params: { projectId: string } }
) {
  try {
    const { userId } = await auth();
    if (!userId) {
      return NextResponse.json(
        { success: false, error: 'Unauthorized' },
        { status: 401 }
      );
    }
    const { projectId } = await params;

    // Validate projectId format
    if (!projectId || projectId.trim() === '') {
      return NextResponse.json(
        { success: false, error: 'Invalid project ID' },
        { status: 400 }
      );
    }

    const body = await request.json();
    
    // Validate input
    const validationResult = SaveProjectSchema.safeParse(body);
    if (!validationResult.success) {
      return NextResponse.json(
        { 
          success: false, 
          error: 'Invalid project data', 
          details: validationResult.error.issues
        },
        { status: 400 }
      );
    }

    const state = validationResult.data as any; // Type assertion for compatibility

    await projectService.saveProject(userId, projectId, state);

    return NextResponse.json({
      success: true,
      savedAt: new Date().toISOString(),
    });
  } catch (error: any) {
    console.error('Error saving project:', error);
    
    // Handle specific errors
    if (error.message === 'Project not found') {
      return NextResponse.json(
        { success: false, error: 'Project not found' },
        { status: 404 }
      );
    }
    
    return NextResponse.json(
      { success: false, error: error.message || 'Failed to save project' },
      { status: 500 }
    );
  }
}
