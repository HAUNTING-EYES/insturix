import { NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { ClickatronTask } from '@/schemas/Clickatron';
import { getClickatronDb } from '@/lib/clickatron-mongo';
import { NextApiRequest } from 'next';

export async function GET(
  req: NextApiRequest,
  { params }: { params: { id: string } }
) {
  try {
    await getClickatronDb();
    const { userId } = await auth();
    const { id } = params;

    if (!userId) {
      return NextResponse.json({ error: 'User not authenticated' }, { status: 401 });
    }

    if (!id) {
      return NextResponse.json({ error: 'Task ID is required' }, { status: 400 });
    }

    const task = await ClickatronTask.findOne({ _id: id, userId });

    if (!task) {
      return NextResponse.json({ error: 'Task not found' }, { status: 404 });
    }

    return NextResponse.json({ status: task.status });
  } catch (error) {
    console.error('Error fetching Clickatron task status:', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}