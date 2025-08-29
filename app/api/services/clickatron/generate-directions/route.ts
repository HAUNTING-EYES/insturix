import { NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { z } from 'zod';

// Request schema for direction generation
const GenerateDirectionsRequestSchema = z.object({
  videoIdea: z.string().min(1, 'Video idea is required'),
  count: z.number().min(1).max(6).default(4),
});

// Mock direction generation function (synchronous)
const generateMockDirections = (videoIdea: string, count: number) => {
  const directionTemplates = [
    {
      title: "Warm & Inviting",
      description: "Soft, warm lighting with inviting colors",
      prompt: `Create a warm and inviting thumbnail for "${videoIdea}" with soft lighting and welcoming colors`,
    },
    {
      title: "Bold & Dramatic",
      description: "High contrast with dramatic lighting effects",
      prompt: `Design a bold and dramatic thumbnail for "${videoIdea}" with high contrast and striking visual impact`,
    },
    {
      title: "Clean & Minimal",
      description: "Simple, clean design with minimal elements",
      prompt: `Create a clean and minimal thumbnail for "${videoIdea}" with simple composition and essential elements only`,
    },
    {
      title: "Energetic & Dynamic",
      description: "Fast-paced with dynamic movement and energy",
      prompt: `Design an energetic and dynamic thumbnail for "${videoIdea}" with movement and high energy visuals`,
    },
  ];

  const selectedDirections = [];

  // Generate 'count' directions, reusing templates if necessary
  for (let i = 0; i < count; i++) {
    // Use modulo to cycle through templates if count exceeds available templates
    const templateIndex = i % directionTemplates.length;
    const template = directionTemplates[templateIndex];

    selectedDirections.push({
      id: `direction_${Date.now()}_${i}`,
      title: template.title,
      description: template.description,
      prompt: template.prompt,
      icon: '🎯', // Keep the icon for the frontend
    });
  }

  return selectedDirections;
};

export async function POST(request: Request) {
  const start = Date.now();
  try {
    const originHeader = (request.headers.get('x-origin') || request.headers.get('X-Origin') || 'unknown');
    if (process.env.NODE_ENV === 'development') {
      console.log(`[API] generate-directions RECEIVED origin=${originHeader} time=${new Date().toISOString()}`);
    }

    const { userId } = await auth();
    if (!userId) {
      if (process.env.NODE_ENV === 'development') {
        console.log(`[API] generate-directions AUTH FAILED duration=${Date.now()-start}ms`);
      }
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    const validatedData = GenerateDirectionsRequestSchema.parse(body);

    // Simulate a short processing delay
    await new Promise(resolve => setTimeout(resolve, 500));

    const directions = generateMockDirections(
      validatedData.videoIdea,
      validatedData.count
    );

    if (process.env.NODE_ENV === 'development') {
      console.log(`[API] generate-directions DONE status=200 duration=${Date.now()-start}ms`);
    }
    return NextResponse.json({ success: true, directions });
  } catch (error) {
    console.error('Error generating directions:', error);
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: 'Validation failed', details: error.errors },
        { status: 400 }
      );
    }
  console.error(`[API] generate-directions ERROR duration=${Date.now()-start}ms`, error);
    return NextResponse.json(
      { error: 'Internal Server Error' },
      { status: 500 }
    );
  }
}