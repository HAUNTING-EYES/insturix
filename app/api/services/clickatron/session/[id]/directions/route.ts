import { NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { ClickatronTask } from '@/schemas/Clickatron';
import { getClickatronDb } from '@/lib/clickatron-mongo';
import { Types } from 'mongoose';
import { z } from 'zod';

// Request schema for creative directions
const GenerateDirectionsRequestSchema = z.object({
  videoIdea: z.string().min(1, 'Video idea is required'),
  selectedPreset: z.object({
    id: z.string(),
    name: z.string(),
    aspectRatio: z.string(),
    dimensions: z.string(),
    promptText: z.string(),
  }).optional(),
  style: z.enum(['professional', 'creative', 'minimal', 'bold']).optional(),
  count: z.number().min(1).max(5).default(3),
});

// Response schema
const GenerateDirectionsResponseSchema = z.object({
  success: z.boolean(),
  directions: z.array(z.object({
    id: z.string(),
    title: z.string(),
    description: z.string(),
    prompt: z.string(),
    tags: z.array(z.string()),
    styleHints: z.array(z.string()),
  })),
  metadata: z.object({
    videoIdea: z.string(),
    preset: z.object({
      id: z.string(),
      name: z.string(),
      aspectRatio: z.string(),
      dimensions: z.string(),
      promptText: z.string(),
    }).optional(),
    style: z.string().optional(),
  }),
});

// Mock creative directions generation function
const generateMockDirections = (videoIdea: string, count: number, style?: string) => {
  const directionTemplates = [
    {
      title: "Direct Approach",
      description: "Clear and straightforward presentation of the main topic",
      tags: ["direct", "clear", "straightforward"],
      styleHints: ["minimal text", "high contrast", "central focus"],
    },
    {
      title: "Problem/Solution",
      description: "Highlight the problem and present your solution",
      tags: ["problem", "solution", "benefit"],
      styleHints: ["before/after", "comparison", "transformation"],
    },
    {
      title: "Curiosity Gap",
      description: "Create intrigue by hinting at valuable information",
      tags: ["curiosity", "intrigue", "mystery"],
      styleHints: ["question format", "teaser text", "partial reveal"],
    },
    {
      title: "Emotional Connection",
      description: "Evoke emotion to create viewer engagement",
      tags: ["emotional", "engagement", "connection"],
      styleHints: ["warm colors", "expressive imagery", "relatable scenes"],
    },
    {
      title: "Authority/Expertise",
      description: "Position yourself as knowledgeable and trustworthy",
      tags: ["authority", "expertise", "trust"],
      styleHints: ["professional look", "confident imagery", "clean design"],
    },
    {
      title: "Urgency/Exclusivity",
      description: "Create FOMO with time-sensitive or exclusive content",
      tags: ["urgency", "exclusive", "limited"],
      styleHints: ["bold text", "time indicators", "exclusive badges"],
    },
    {
      title: "Storytelling",
      description: "Frame content as a narrative journey",
      tags: ["story", "journey", "narrative"],
      styleHints: ["sequence imagery", "progress indicators", "story elements"],
    },
    {
      title: "Contrast/Juxtaposition",
      description: "Use visual or conceptual contrast for impact",
      tags: ["contrast", "juxtaposition", "impact"],
      styleHints: ["color contrast", "size difference", "opposing elements"],
    },
  ];

  // Filter directions based on style preference
  let filteredDirections = directionTemplates;
  if (style === 'professional') {
    filteredDirections = directionTemplates.filter(d => 
      d.tags.includes('authority') || d.tags.includes('trust') || d.tags.includes('expertise')
    );
  } else if (style === 'creative') {
    filteredDirections = directionTemplates.filter(d => 
      d.tags.includes('emotional') || d.tags.includes('story') || d.tags.includes('curiosity')
    );
  } else if (style === 'minimal') {
    filteredDirections = directionTemplates.filter(d => 
      d.tags.includes('direct') || d.tags.includes('clear') || d.tags.includes('straightforward')
    );
  } else if (style === 'bold') {
    filteredDirections = directionTemplates.filter(d => 
      d.tags.includes('urgency') || d.tags.includes('contrast') || d.tags.includes('impact')
    );
  }

  // Select random directions
  const selectedDirections = [];
  const availableDirections = [...filteredDirections];
  
  for (let i = 0; i < Math.min(count, availableDirections.length); i++) {
    const randomIndex = Math.floor(Math.random() * availableDirections.length);
    const template = availableDirections.splice(randomIndex, 1)[0];
    
    selectedDirections.push({
      id: `dir_${Date.now()}_${i}`,
      title: template.title,
      description: template.description,
      prompt: `${videoIdea} - ${template.description}`,
      tags: template.tags,
      styleHints: template.styleHints,
    });
  }

  return selectedDirections;
};

export async function POST(
  request: Request,
  { params }: { params: { id: string } }
) {
  try {
    const { userId } = await auth();
    if (!userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { id } = params;
    
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
    
    // Validate request body
    const validatedData = GenerateDirectionsRequestSchema.parse({
      ...body,
      sessionId: id,
    });

    // Mock creative directions generation with realistic delay
    await new Promise(resolve => setTimeout(resolve, 1500 + Math.random() * 2500));

    // Generate directions
    const directions = generateMockDirections(
      validatedData.videoIdea,
      validatedData.count,
      validatedData.style
    );

    const response = {
      success: true,
      directions,
      metadata: {
        videoIdea: validatedData.videoIdea,
        preset: validatedData.selectedPreset,
        style: validatedData.style,
        generatedAt: new Date().toISOString(),
      },
    };

    // Validate response
    const validatedResponse = GenerateDirectionsResponseSchema.parse(response);

    return NextResponse.json(validatedResponse);
  } catch (error) {
    console.error('Error generating creative directions:', error);
    
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