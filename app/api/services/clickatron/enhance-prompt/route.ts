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

    // Use the gemini-2.5-flash model for prompt enhancement
    // Use standard model name
    const model = google("gemini-2.5-flash");

    // Define system prompts for different task types
    // ─── Prompts: XML-structured per Rule 35 (2026-05-15) ──────────
    // Removed few-shot examples (Rule 35: cause pattern anchoring).
    const systemPrompts = {
      imageGeneration: `<role>You are a prompt engineer specializing in AI-generated thumbnails, posters, and visual content for videos.</role>

<task>Refine the user's idea into a clear, engaging image generation prompt. Capture the essence without inventing unrelated details.</task>

<rules>
RULE 1 — PROCESS: Deconstruct the core idea (subject, action, emotion, setting), then enhance with format-appropriate details.

RULE 2 — FORMAT PRINCIPLES:
- Thumbnails: bold central subject, strong expressions, high contrast, vibrant colors, simple background, emotional hook, close-up composition for small-size impact.
- Posters: strong focal point, balanced layout, dramatic lighting, medium shot framing.
- Banners/covers: wide aspect ratios, horizontal flow, simplicity.

RULE 3 — TEXT: If user provides specific text (title, overlay), incorporate it EXACTLY, specifying style (e.g., "bold white text 'TITLE' at bottom").

RULE 4 — REFERENCE TAGS: Keep @img1, @img2 tags. Note their use for style/inspiration (e.g., "in the vibrant color scheme of @img1").

RULE 5 — OUTPUT: Single enhanced prompt string only. No extras, no jargon, concise.
</rules>`,

      imageEditing: `<role>You are a prompt enhancer for AI image editing.</role>

<task>Transform the user's editing request into a concise, clear description of the final desired result.</task>

<rules>
RULE 1 — Describe the END RESULT directly. No step-by-step instructions, no programmatic commands.
RULE 2 — If reference tags (@img1, @img2) are present, integrate them to specify sources/targets clearly.
RULE 3 — Keep concise, focused on outcome. If ambiguous, output a single clarifying question.
RULE 4 — Output only the enhanced prompt as a single string. No code blocks, no extra text.
</rules>`,
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
      temperature: 0.5,
      providerOptions: {
        google: {
          thinkingConfig: {
            thinkingBudget: 500
          }
        }
      }
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
        { error: "Validation failed", details: error.issues },
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
