import { NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { ClickatronTask } from '@/schemas/Clickatron';
import { getClickatronDb } from '@/lib/clickatron-mongo';

// GET /api/services/clickatron/history - Fetch all tasks for the user
export async function GET() {
  try {
    const { userId } = await auth();
    if (!userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    await getClickatronDb();

    const tasks = await ClickatronTask.find({ clerkUserId: userId }).sort({ updatedAt: -1 });

    const history = tasks.map(task => ({
      sessionId: task._id.toString(),
      title: task.title,
      updatedAt: task.updatedAt,
      // Add any other relevant summary data here
    }));

    return NextResponse.json({ history });
  } catch (error) {
    console.error('Error fetching history:', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}