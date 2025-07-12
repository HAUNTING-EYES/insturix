import { NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { getMusitronDb } from '@/lib/musitron-mongo';
import { MusitronTask } from '@/schemas/Musitron';
import { serviceLogger } from '@/lib/services/common/task-service';

export async function GET(req: Request, { params }: { params: { id: string } }) {
  const { userId } = await auth();

  if (!userId) {
    return new NextResponse('Unauthorized', { status: 401 });
  }

  const taskId = params.id;

  if (!taskId) {
    return new NextResponse('Missing task ID', { status: 400 });
  }

  try {
    await getMusitronDb();
    const task = await MusitronTask.findOne({ _id: taskId, userId });

    if (!task) {
      return new NextResponse('Task not found', { status: 404 });
    }

    return NextResponse.json(task);
  } catch (error) {
    serviceLogger.error('Musitron status API error', { 
      error: error instanceof Error ? error.message : String(error) 
    });
    return new NextResponse('Internal Server Error', { status: 500 });
  }
}