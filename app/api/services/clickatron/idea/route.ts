import { NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { z } from 'zod';

// Request schema for idea generation
const GenerateIdeaRequestSchema = z.object({
  prompt: z.string().min(1, 'Prompt is required').max(500, 'Prompt too long'),
  count: z.number().min(1).max(5).default(3),
  style: z.enum(['professional', 'creative', 'minimal', 'bold']).optional(),
});

// Response schema
const GenerateIdeaResponseSchema = z.object({
  success: z.boolean(),
  ideas: z.array(z.object({
    id: z.string(),
    title: z.string(),
    description: z.string(),
    prompt: z.string(),
    tags: z.array(z.string()),
  })),
});

// Mock idea generation function
const generateMockIdeas = (prompt: string, count: number, style?: string) => {
  const ideaTemplates = [
    {
      title: "Tutorial Thumbnail",
      description: "Educational content with clear visual hierarchy",
      tags: ["tutorial", "educational", "clear"],
    },
    {
      title: "Thumbnail with Text Overlay",
      description: "Bold text overlay on compelling imagery",
      tags: ["text", "bold", "overlay"],
    },
    {
      title: "Before & After",
      description: "Transformation comparison with clear visual contrast",
      tags: ["transformation", "comparison", "contrast"],
    },
    {
      title: "Question-Based",
      description: "Engaging question to drive click-through",
      tags: ["question", "engaging", "curiosity"],
    },
    {
      title: "Listicle Style",
      description: "Numbered list format for easy scanning",
      tags: ["list", "numbered", "scannable"],
    },
    {
      title: "Emotional Appeal",
      description: "Evokes emotion through imagery and color",
      tags: ["emotional", "appeal", "color"],
    },
    {
      title: "Minimal Design",
      description: "Clean, simple design with focus on core message",
      tags: ["minimal", "clean", "simple"],
    },
    {
      title: "Bold Typography",
      description: "Large, readable text with strong visual impact",
      tags: ["typography", "bold", "impact"],
    },
  ];

  // Filter ideas based on style preference
  let filteredIdeas = ideaTemplates;
  if (style === 'professional') {
    filteredIdeas = ideaTemplates.filter(i => 
      i.tags.includes('minimal') || i.tags.includes('clean') || i.tags.includes('professional')
    );
  } else if (style === 'creative') {
    filteredIdeas = ideaTemplates.filter(i => 
      i.tags.includes('bold') || i.tags.includes('emotional') || i.tags.includes('creative')
    );
  } else if (style === 'minimal') {
    filteredIdeas = ideaTemplates.filter(i => 
      i.tags.includes('minimal') || i.tags.includes('clean') || i.tags.includes('simple')
    );
  } else if (style === 'bold') {
    filteredIdeas = ideaTemplates.filter(i => 
      i.tags.includes('bold') || i.tags.includes('typography') || i.tags.includes('impact')
    );
  }

  // Select random ideas
  const selectedIdeas = [];
  const availableIdeas = [...filteredIdeas];
  
  for (let i = 0; i < Math.min(count, availableIdeas.length); i++) {
    const randomIndex = Math.floor(Math.random() * availableIdeas.length);
    const template = availableIdeas.splice(randomIndex, 1)[0];
    
    selectedIdeas.push({
      id: `idea_${Date.now()}_${i}`,
      title: template.title,
      description: template.description,
      prompt: `${prompt} - ${template.description}`,
      tags: template.tags,
    });
  }

  return selectedIdeas;
};

export async function POST(request: Request) {
  try {
    const { userId } = await auth();
    if (!userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    
    // Validate request body
    const validatedData = GenerateIdeaRequestSchema.parse(body);

    // Mock idea generation with realistic delay
    await new Promise(resolve => setTimeout(resolve, 1000 + Math.random() * 2000));

    // Generate ideas
    const ideas = generateMockIdeas(
      validatedData.prompt,
      validatedData.count,
      validatedData.style
    );

    const response = {
      success: true,
      ideas,
      metadata: {
        prompt: validatedData.prompt,
        count: ideas.length,
        style: validatedData.style,
        generatedAt: new Date().toISOString(),
      },
    };

    // Validate response
    const validatedResponse = GenerateIdeaResponseSchema.parse(response);

    return NextResponse.json(validatedResponse);
  } catch (error) {
    console.error('Error generating ideas:', error);
    
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