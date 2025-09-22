import { NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { ClickatronTask } from '@/schemas/Clickatron';
import { getClickatronDb } from '@/lib/clickatron-mongo';

// GET /api/services/clickatron/history - Fetch all tasks for the user
export async function GET(request: Request) {
  try {
    const { userId } = await auth();
    if (!userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const limit = parseInt(searchParams.get('limit') || '10');
    const offset = parseInt(searchParams.get('offset') || '0');

    await getClickatronDb();

    const tasks = await ClickatronTask.find({ clerkUserId: userId })
      .sort({ updatedAt: -1 })
      .skip(offset)
      .limit(limit);

    const total = await ClickatronTask.countDocuments({ clerkUserId: userId });

    const history = tasks.map(task => ({
      sessionId: task._id.toString(),
      title: task.title || 'Untitled Session',
      updatedAt: task.updatedAt,
      variationsCount: task.details?.canvas?.variations?.length || 0,
    }));

    return NextResponse.json({ history, total });
  } catch (error) {
    console.error('Error fetching history:', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}