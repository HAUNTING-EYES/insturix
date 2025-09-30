import { NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { ClickatronTask } from '@/schemas/Clickatron';
import { getClickatronDb } from '@/lib/clickatron-mongo';
import { Types } from 'mongoose';
import { z } from 'zod';

const RenameSessionSchema = z.object({
  title: z.string().min(1).max(100),
});

// PATCH /api/services/clickatron/session/:id/rename - Rename a session
export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { userId } = await auth();
    if (!userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { id } = await params;
    if (!Types.ObjectId.isValid(id)) {
      return NextResponse.json({ error: 'Invalid Session ID' }, { status: 400 });
    }

    const body = await request.json();
    const { title } = RenameSessionSchema.parse(body);

    await getClickatronDb();
    const objectId = new Types.ObjectId(id);
    
    const task = await ClickatronTask.findOneAndUpdate(
      { _id: objectId, clerkUserId: userId },
      { title, updatedAt: new Date() },
      { new: true }
    );

    if (!task) {
      return NextResponse.json({ error: 'Session not found' }, { status: 404 });
    }

    return NextResponse.json({ 
      success: true, 
      session: { 
        sessionId: task._id.toString(), 
        title: task.title,
        updatedAt: task.updatedAt 
      } 
    });
  } catch (error) {
    console.error('Error renaming session:', error);
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: 'Validation failed', details: error.errors }, { status: 400 });
    }
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}