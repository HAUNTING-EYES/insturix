import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { getStoryboard } from '@/lib/pipeline/storyboard-db';

/**
 * GET /api/services/pipeline/storyboard/[id]
 * Fetch a storyboard by ID.
 */
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { userId } = await auth();
    if (!userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { id } = await params;
    const storyboard = await getStoryboard(id, userId);

    if (!storyboard) {
      return NextResponse.json({ error: 'Storyboard not found' }, { status: 404 });
    }

    return NextResponse.json({ success: true, storyboard });
  } catch (error: any) {
    console.error('[Storyboard GET]', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
