import { NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { ClickatronTask } from '@/schemas/Clickatron';
import { getClickatronDb } from '@/lib/clickatron-mongo';
import { CreateSessionRequestSchema } from '@/types/clickatron';
import { z } from 'zod';

// A simple mock idea generator
const generateMockIdeas = (videoIdea: string) => {
  return [
    { id: 'idea_1', title: `Exploring ${videoIdea}`, description: 'A deep dive into the world of your topic.', prompt: `An epic cinematic shot of ${videoIdea}` },
    { id: 'idea_2', title: `The Ultimate Guide to ${videoIdea}`, description: 'Everything you need to know, all in one place.', prompt: `A clean, professional graphic for a guide about ${videoIdea}` },
    { id: 'idea_3', title: `${videoIdea}: A New Perspective`, description: 'A fresh take on a classic subject.', prompt: `An abstract, artistic representation of ${videoIdea}` },
    { id: 'idea_4', title: `The Surprising Secrets of ${videoIdea}`, description: 'Uncovering the hidden truths.', prompt: `A mysterious, intriguing image related to ${videoIdea}` },
  ];
};

// POST /api/services/clickatron/session - Create new session and generate ideas
export async function POST(request: Request) {
  try {
    const { userId } = await auth();
    if (!userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    
    // Validate request body
    const validatedData = CreateSessionRequestSchema.parse(body);

    await getClickatronDb();

    const ideas = generateMockIdeas(validatedData.videoIdea);

    // Create new ClickatronTask document
    const newTask = new ClickatronTask({
      clerkUserId: userId,
      title: validatedData.videoIdea,
      details: {
        videoIdea: validatedData.videoIdea,
        aspectRatio: validatedData.aspectRatio,
        ideas: ideas,
      },
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    await newTask.save();

    return NextResponse.json({
      success: true,
      sessionId: newTask._id.toString(),
      ideas: ideas,
    });
  } catch (error) {
    console.error('Error creating session:', error);
    
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