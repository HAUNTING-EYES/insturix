import { NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { ClickatronTask } from '@/schemas/Clickatron';
import { getClickatronDb } from '@/lib/clickatron-mongo';
import { Types } from 'mongoose';
export async function GET(
  req: Request
) {
    const url = new URL(req.url);
  const id = url.pathname.split('/').pop();
  try {
    await getClickatronDb();
    const { userId } = await auth();

    if (!userId) {
      return NextResponse.json({ error: 'User not authenticated' }, { status: 401 });
    }

    if (!id || typeof id !== 'string' || !id.match(/^[a-f\d]{24}$/i)) {
      return NextResponse.json({ error: 'Invalid Task ID' }, { status: 400 });
    }

    const objectId = new Types.ObjectId(id);
    console.log("🔍 [API DEBUG] Created ObjectId:", objectId);
    
    const task = await ClickatronTask.findOne({ _id: objectId, userId: userId });
    console.log("🔍 [API DEBUG] Task query result:", task ? "Found" : "Not found");

    if (!task) {
      return NextResponse.json({ error: 'Task not found' }, { status: 404 });
    }

    return NextResponse.json({ status: task.status });
  } catch (error) {
    console.error('Error fetching Clickatron task status:', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}