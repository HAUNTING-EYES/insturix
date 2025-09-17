import { NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { createGoogleGenerativeAI } from '@ai-sdk/google';
import { generateObject } from 'ai';
import { z } from 'zod';

// Define the schema for the enhanced prompt response
const EnhancedPromptSchema = z.object({
  enhancedPrompt: z.string().describe('The AI-enhanced version of the prompt'),
});

// POST /api/services/clickatron/enhance-prompt - Enhance a user's prompt using AI
export async function POST(request: Request) {
  try {
    const { userId } = await auth();
    if (!userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    const { prompt } = body;

    if (!prompt || typeof prompt !== 'string') {
      return NextResponse.json({ error: 'Prompt is required and must be a string' }, { status: 400 });
    }

    // Get the Gemini API key from environment variables
    const geminiApiKey = process.env.GEMINI_API_KEY;
    if (!geminiApiKey) {
      console.error('GEMINI_API_KEY is not configured in environment variables');
      return NextResponse.json({ error: 'AI service is not properly configured' }, { status: 500 });
    }

    // Create a custom Google Generative AI provider with the API key
    const google = createGoogleGenerativeAI({
      apiKey: geminiApiKey,
    });

    // Use the gemini-2.0-flash model for prompt enhancement
    const model = google('gemini-2.0-flash');

    // Generate an enhanced prompt using structured output
    const { object } = await generateObject({
      model,
      schema: EnhancedPromptSchema,
      prompt: `Enhance the following image generation prompt to make it more detailed and effective for AI image generation. 
               Keep the core concept but add descriptive details about style, lighting, composition, and quality.
               
               Original prompt: ${prompt}`,
    });

    return NextResponse.json({
      enhancedPrompt: object.enhancedPrompt,
    });

  } catch (error) {
    console.error('Error enhancing prompt:', error);
    
    // Handle Zod validation errors
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: 'Validation failed', details: error.errors },
        { status: 400 }
      );
    }

    // Handle AI SDK errors
    if (error instanceof Error && error.message.includes('operation was aborted')) {
      return NextResponse.json(
        { error: 'Request timeout' },
        { status: 408 }
      );
    }

    return NextResponse.json(
      { error: 'Internal Server Error' },
      { status: 500 }
    );
  }
}