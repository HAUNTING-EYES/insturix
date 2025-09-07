import { NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { ClickatronTask } from '@/schemas/Clickatron';
import { getClickatronDb } from '@/lib/clickatron-mongo';
import { Types } from 'mongoose';
import { z } from 'zod';

const ChatMessageRequestSchema = z.object({
  content: z.string().min(1, "Message content is required"),
  referenceImages: z.array(z.string()).optional(),
  variationId: z.string().optional(),
});

// POST /api/services/clickatron/session/:id/chat - Add a chat message
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { userId } = await auth();
    if (!userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { id } = await params;

    if (!id || typeof id !== 'string' || !id.match(/^[a-f\d]{24}$/i)) {
      return NextResponse.json({ error: 'Invalid Session ID' }, { status: 400 });
    }

    await getClickatronDb();
    const objectId = new Types.ObjectId(id);

    // Find the task
    const task = await ClickatronTask.findOne({ _id: objectId, clerkUserId: userId });

    if (!task) {
      return NextResponse.json({ error: 'Session not found' }, { status: 404 });
    }

    const body = await request.json();
    const validatedData = ChatMessageRequestSchema.parse(body);

    // Initialize canvas if it doesn't exist
    if (!task.details?.canvas) {
      task.details.canvas = { variations: [], chatHistory: [] };
    }

    // Initialize chat history if it doesn't exist
    if (!task.details.canvas.chatHistory) {
      task.details.canvas.chatHistory = [];
    }

    // Create new chat message
    const messageId = `msg_${Date.now()}_${Math.random().toString(36).slice(2, 11)}`;
    const newMessage = {
      id: messageId,
      role: 'user' as const,
      content: validatedData.content,
      timestamp: new Date(),
      variationId: validatedData.variationId,
      referenceImages: validatedData.referenceImages || [],
    };

    // Add message to chat history (keep last 100 messages)
    task.details.canvas.chatHistory.unshift(newMessage);
    task.details.canvas.chatHistory = task.details.canvas.chatHistory.slice(0, 100);

    task.updatedAt = new Date();
    task.markModified('details');
    await task.save();

    return NextResponse.json({
      success: true,
      messageId,
      message: newMessage,
    });
  } catch (error) {
    console.error('Error adding chat message:', error);
    
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: 'Validation failed', details: error.errors },
        { status: 400 }
      );
    }

    return NextResponse.json(
      { error: 'Internal Server Error' },
      { status: 500 }
    );
  }
}

// GET /api/services/clickatron/session/:id/chat - Get chat history
export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { userId } = await auth();
    if (!userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { id } = await params;

    if (!id || typeof id !== 'string' || !id.match(/^[a-f\d]{24}$/i)) {
      return NextResponse.json({ error: 'Invalid Session ID' }, { status: 400 });
    }

    await getClickatronDb();
    const objectId = new Types.ObjectId(id);

    // Find the task
    const task = await ClickatronTask.findOne({ _id: objectId, clerkUserId: userId });

    if (!task) {
      return NextResponse.json({ error: 'Session not found' }, { status: 404 });
    }

    const chatHistory = task.details?.canvas?.chatHistory || [];

    return NextResponse.json({
      success: true,
      chatHistory: chatHistory.reverse(), // Return in chronological order
    });
  } catch (error) {
    console.error('Error fetching chat history:', error);
    return NextResponse.json(
      { error: 'Internal Server Error' },
      { status: 500 }
    );
  }
}