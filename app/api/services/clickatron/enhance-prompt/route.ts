import { NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { createGoogleGenerativeAI } from "@ai-sdk/google";
import { generateObject } from "ai";
import { z } from "zod";
import { promptEnhancementRateLimiter } from '@/lib/utils/promptEnhancementRateLimiter';

// Define the schema for the enhanced prompt response
const EnhancedPromptSchema = z.object({
  enhancedPrompt: z.string().describe("The AI-enhanced version of the prompt"),
});

// POST /api/services/clickatron/enhance-prompt - Enhance a user's prompt using AI
export async function POST(request: Request) {
  try {
    const { userId } = await auth();
    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Check rate limit for prompt enhancement
    const { success, limit, remaining, reset } = await promptEnhancementRateLimiter.limit(userId);
    
    // If rate limit exceeded, return error
    if (!success) {
      return NextResponse.json(
        {
          error: "Rate limit exceeded. Please try again within a minute.",
          limitInfo: {
            limit,
            remaining,
            resetTime: reset
          }
        },
        { status: 429 }
      );
    }

    const body = await request.json();
    const { prompt, taskType = "imageGeneration" } = body;

    // Log the received task type for debugging
    console.log(
      `[Prompt Enhancer] Received request with taskType: ${taskType}`
    );

    // Validate taskType
    const validTaskTypes = ["imageGeneration", "imageEditing"] as const;
    type TaskType = (typeof validTaskTypes)[number];

    // Validate prompt
    if (!prompt || typeof prompt !== "string") {
      return NextResponse.json(
        { error: "Prompt is required and must be a string" },
        { status: 400 }
      );
    }

    // Check prompt length (max 5000 characters)
    if (prompt.length > 5000) {
      return NextResponse.json(
        { error: "Prompt is too long. Maximum 5000 characters allowed." },
        { status: 400 }
      );
    }

    // Check for excessive special characters (more than 50% of the prompt)
    const specialCharCount = (prompt.match(/[^a-zA-Z0-9\s]/g) || []).length;
    if (specialCharCount > prompt.length * 0.5) {
      return NextResponse.json(
        { error: "Prompt contains too many special characters." },
        { status: 400 }
      );
    }

    // Get the Gemini API key from environment variables
    const geminiApiKey = process.env.GEMINI_API_KEY;
    if (!geminiApiKey) {
      console.error(
        "GEMINI_API_KEY is not configured in environment variables"
      );
      return NextResponse.json(
        { error: "AI service is not properly configured" },
        { status: 500 }
      );
    }

    // Create a custom Google Generative AI provider with the API key
    const google = createGoogleGenerativeAI({
      apiKey: geminiApiKey,
    });

    // Use the gemini-2.0-flash model for prompt enhancement
    const model = google("gemini-2.0-flash");

    // Define system prompts for different task types
    const systemPrompts = {
      imageGeneration: `You are a prompt enhancer for AI image generation. Your goal is to improve the user's prompt to be clear, concise, and effective without adding extra details not mentioned by the user. Use simple, straightforward words. Focus on describing the subject, action, setting, emotions, vibes, and atmosphere if relevant to the user's input. Keep the enhanced prompt medium-length; simple, descriptive sentences often work best, like "an old lady standing at a crossing, slightly in motion, aesthetic, grainy image, cars in the background, motion blur for emphasis on motion, slight imperfections for realism."
  
  If the prompt includes tags like @img1 or @img2, these refer to reference images provided by the user. Keep the tags in the prompt and clearly specify that they should be used as references for style, composition, or inspiration without editing or modifying the reference images themselves, unless the user explicitly asks to edit them. For example: "Generate an image in the style of @img1, with the subject from the user's description."
  
  Do not use complex or unnecessary words. Avoid overly long or elaborate descriptions. Output only the enhanced prompt as a single string, without any code blocks, explanations, or additional text.
  
  Example User Input: "a knight in a forest"
  
  Enhanced Output: "A brave knight standing in an ancient misty forest, sunlight filtering through the trees, adventurous vibe, detailed armor, realistic style."`,
      imageEditing: `You are a prompt enhancer for AI image editing. Transform the user's request into a concise, clear description of the final desired result. Be specific about what to edit, using reference images with tags like @img1 or @img2 if provided. Describe the end result directly, without step-by-step instructions, programmatic commands like "select and apply," or ambiguity.
  
  For example, if the user says "swap the tshirt in the image with one from another image," output: "Swap the t-shirt on the person in the main image with the t-shirt from @img2, matching the lighting, pose, and fabric texture realistically for a seamless edit."
  
  If tags are present, integrate them to specify sources or targets clearly, e.g., "Change the background in @img1 to match the cityscape in @img2." Ensure the prompt guides the model to edit the target image appropriately without altering references unless specified.
  
  Keep it concise and focused on the final outcome. If the request is ambiguous, output a single clarifying question. Otherwise, output only the enhanced prompt as a single string, without code blocks or extra text.
  
  Example Clear Input: "change the car from red to blue"
  
  Enhanced Output: "Change the color of the car in the image from red to vibrant blue, keeping all other details the same."`,
    };

    // Select the appropriate system prompt based on task type
    const isValidTaskType = validTaskTypes.includes(taskType as TaskType);

    const selectedTaskType = isValidTaskType ? taskType : "imageGeneration";

    const systemPrompt = systemPrompts[selectedTaskType as TaskType];

    // Generate an enhanced prompt using structured output with system prompt
    const userPrompt = `Enhance the following prompt for ${selectedTaskType === "imageEditing" ? "image editing" : "image generation"}.
      
      Original prompt: ${prompt}`;

    const { object } = await generateObject({
      model,
      schema: EnhancedPromptSchema,
      system: systemPrompt,
      prompt: userPrompt,
    });

    // Log the enhanced prompt for debugging
    console.log(`[Prompt Enhancer] Enhanced prompt: ${object.enhancedPrompt}`);

    return NextResponse.json({
      enhancedPrompt: object.enhancedPrompt,
    });
  } catch (error) {
    console.error("Error enhancing prompt:", error);

    // Handle Zod validation errors
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: "Validation failed", details: error.errors },
        { status: 400 }
      );
    }

    // Handle AI SDK errors
    if (
      error instanceof Error &&
      error.message.includes("operation was aborted")
    ) {
      return NextResponse.json({ error: "Request timeout" }, { status: 408 });
    }

    // Handle rate limit errors specifically
    if (error instanceof Error && error.message.includes("Rate limit")) {
      return NextResponse.json(
        { error: "Rate limit exceeded. Please try again later." },
        { status: 429 }
      );
    }

    return NextResponse.json(
      { error: "Internal Server Error" },
      { status: 500 }
    );
  }
}
