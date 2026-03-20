import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { approveScene } from '@/lib/pipeline/storyboard-interactive-service';

/**
 * POST /api/services/pipeline/storyboard/[id]/scene/[sceneIndex]/approve
 * Approve a generated scene image. No credit cost.
 */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string; sceneIndex: string }> },
) {
  try {
    const { userId } = await auth();
    if (!userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { id, sceneIndex } = await params;
    await approveScene(id, parseInt(sceneIndex, 10), userId);

    return NextResponse.json({ success: true });
  } catch (error: any) {
    console.error('[Scene Approve]', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
