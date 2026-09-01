/**
 * POST /api/services/editron/checkpoints/create
 * Create a checkpoint
 */

import { NextRequest, NextResponse } from 'next/server';
import { checkpointService } from '@/lib/editron/services/checkpoint-service';
import { auth } from '@clerk/nextjs/server';
import { z } from 'zod';

export const runtime = 'nodejs';

// Input validation schema
const CreateCheckpointSchema = z.object({
  sessionId: z.string().min(1),
  projectId: z.string().min(1),
  overlays: z.array(z.any()),
  description: z.string().min(1).max(200),
  type: z.enum(['initial', 'user-edit']),
  expectedRevision: z.object({
    schemaVersion: z.literal(1),
    value: z.number().int().nonnegative(),
    compatibilityUpdatedAt: z.string().datetime(),
  }).strict(),
}).strict();

export async function POST(request: NextRequest) {
  try {
    const { userId } = await auth();
    if (!userId) {
      return NextResponse.json(
        { success: false, error: 'Unauthorized' },
        { status: 401 }
      );
    }
    const body = await request.json();

    // Validate input
    const validationResult = CreateCheckpointSchema.safeParse(body);
    if (!validationResult.success) {
      return NextResponse.json(
        { 
          success: false, 
          error: 'Invalid checkpoint data', 
          details: validationResult.error.issues 
        },
        { status: 400 }
      );
    }

    const { sessionId, projectId, overlays, description, type, expectedRevision } = validationResult.data;

    const checkpoint = await checkpointService.createCheckpoint({
      sessionId,
      projectId,
      userId,
      overlays,
      description,
      type,
      capturedProjectRevision: expectedRevision,
    });

    return NextResponse.json({
      success: true,
      created: checkpoint !== null,
      checkpoint,
    });
  } catch (error: any) {
    console.error('Error creating checkpoint:', error);
    return NextResponse.json(
      { success: false, error: error.message || 'Failed to create checkpoint' },
      { status: 500 }
    );
  }
}
