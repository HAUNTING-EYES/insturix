import { NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { ClickatronTask } from '@/schemas/Clickatron';
import { getClickatronDb } from '@/lib/clickatron-mongo';
import { Types } from 'mongoose';
import { StoreDirectionsRequest } from '@/types/clickatron';
import { z } from 'zod';

// Validation schemas for different request types
const GenerateDirectionsRequestSchema = z.object({
  videoIdea: z.string().min(1, 'Video idea is required'),
  selectedPreset: z.object({
    id: z.string(),
    name: z.string(),
    aspectRatio: z.string(),
    dimensions: z.string(),
    promptText: z.string().optional(),
    placeholder: z.string().optional(),
  }).optional(),
  count: z.number().min(1).max(6).default(4),
});

const StoreDirectionsRequestSchema = z.object({
  directions: z.array(z.object({
    id: z.string(),
    title: z.string(),
    description: z.string(),
    prompt: z.string(),
    tags: z.array(z.string()),
    styleHints: z.array(z.string()),
    generatedAt: z.string().datetime(),
  })),
  selectedDirectionId: z.string().optional(),
});

// Mock direction generation function
const generateMockDirections = (videoIdea: string, preset: any, count: number) => {
  const directionTemplates = [
    {
      title: "Warm & Inviting",
      description: "Soft, warm lighting with inviting colors",
      prompt: `Create a warm and inviting thumbnail for "${videoIdea}" with soft lighting and welcoming colors`,
      tags: ["warm", "inviting", "soft", "welcoming"],
      styleHints: ["warm tones", "soft lighting", "comfortable"],
    },
    {
      title: "Bold & Dramatic",
      description: "High contrast with dramatic lighting effects",
      prompt: `Design a bold and dramatic thumbnail for "${videoIdea}" with high contrast and striking visual impact`,
      tags: ["bold", "dramatic", "contrast", "striking"],
      styleHints: ["high contrast", "dramatic lighting", "bold colors"],
    },
    {
      title: "Clean & Minimal",
      description: "Simple, clean design with minimal elements",
      prompt: `Create a clean and minimal thumbnail for "${videoIdea}" with simple composition and essential elements only`,
      tags: ["clean", "minimal", "simple", "essential"],
      styleHints: ["minimal design", "clean layout", "simple elements"],
    },
    {
      title: "Energetic & Dynamic",
      description: "Fast-paced with dynamic movement and energy",
      prompt: `Design an energetic and dynamic thumbnail for "${videoIdea}" with movement and high energy visuals`,
      tags: ["energetic", "dynamic", "movement", "fast-paced"],
      styleHints: ["dynamic composition", "energetic colors", "movement"],
    },
    {
      title: "Professional & Polished",
      description: "Corporate style with professional appearance",
      prompt: `Create a professional and polished thumbnail for "${videoIdea}" with corporate styling and clean presentation`,
      tags: ["professional", "polished", "corporate", "clean"],
      styleHints: ["professional design", "corporate colors", "polished look"],
    },
    {
      title: "Creative & Artistic",
      description: "Artistic expression with creative elements",
      prompt: `Design a creative and artistic thumbnail for "${videoIdea}" with artistic expression and imaginative elements`,
      tags: ["creative", "artistic", "imaginative", "expression"],
      styleHints: ["artistic style", "creative elements", "imaginative"],
    },
  ];

  // Select random directions
  const selectedDirections = [];
  const availableDirections = [...directionTemplates];

  for (let i = 0; i < Math.min(count, availableDirections.length); i++) {
    const randomIndex = Math.floor(Math.random() * availableDirections.length);
    const template = availableDirections.splice(randomIndex, 1)[0];

    selectedDirections.push({
      id: `direction_${Date.now()}_${i}`,
      title: template.title,
      description: template.description,
      prompt: template.prompt,
      tags: template.tags,
      styleHints: template.styleHints,
      generatedAt: new Date().toISOString(),
    });
  }

  return selectedDirections;
};

// POST /api/services/clickatron/session/:id/directions - Store generated creative directions
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

    // Determine request type based on body content
    let directions: any[] = [];
    let selectedDirection: any = undefined;
    let isGenerationRequest = false;

    if (body.videoIdea) {
      // Generation request
      isGenerationRequest = true;
      const validatedData = GenerateDirectionsRequestSchema.parse(body);

      // Mock direction generation with realistic delay
      await new Promise(resolve => setTimeout(resolve, 1000 + Math.random() * 2000));

      // Generate directions
      directions = generateMockDirections(
        validatedData.videoIdea,
        validatedData.selectedPreset,
        validatedData.count
      );
    } else if (body.directions) {
      // Storage request
      const validatedData = StoreDirectionsRequestSchema.parse(body);

      // Convert generatedAt strings to Date objects
      directions = validatedData.directions.map(direction => ({
        ...direction,
        generatedAt: new Date(direction.generatedAt),
      }));

      // Find selected direction if specified
      selectedDirection = validatedData.selectedDirectionId
        ? directions.find(direction => direction.id === validatedData.selectedDirectionId)
        : undefined;
    } else {
      return NextResponse.json(
        { error: 'Invalid request: must provide either videoIdea (for generation) or directions (for storage)' },
        { status: 400 }
      );
    }

    // For generation requests, return the generated directions
    if (isGenerationRequest) {
      return NextResponse.json({
        success: true,
        directions: directions.map(d => ({
          id: d.id,
          title: d.title,
          description: d.description,
          prompt: d.prompt,
          tags: d.tags,
          styleHints: d.styleHints,
          generatedAt: d.generatedAt,
        })),
        metadata: {
          videoIdea: body.videoIdea,
          count: directions.length,
          generatedAt: new Date().toISOString(),
        },
      });
    }

    // For storage requests, save to database
    // Initialize workflow if it doesn't exist
    if (!task.details) {
      task.details = {};
    }
    if (!task.details.workflow) {
      task.details.workflow = {
        videoIdea: task.title || 'Untitled Session',
        stage: 'spark',
        workflowVersion: 1,
      };
    }

    // Store directions and selection
    task.details.workflow.generatedDirections = directions;
    if (selectedDirection) {
      task.details.workflow.selectedDirectionData = selectedDirection;
      task.details.workflow.selectedDirection = selectedDirection.prompt;
      task.details.workflow.stage = 'canvas';
    }

    task.updatedAt = new Date();
    await task.save();

    return NextResponse.json({
      success: true,
      sessionId: id,
      storedDirections: directions.length,
      selectedDirection: selectedDirection?.id,
    });
  } catch (error) {
    console.error('Error storing directions:', error);

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