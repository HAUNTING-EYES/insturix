import { NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { createGoogleGenerativeAI } from "@ai-sdk/google";
import { generateObject } from "ai";
import { z } from "zod";

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

    const body = await request.json();
    const { prompt, taskType = "imageGeneration" } = body;

    // Log the received task type for debugging
    console.log(
      `[Prompt Enhancer] Received request with taskType: ${taskType}`
    );

    // Validate taskType
    const validTaskTypes = ["imageGeneration", "imageEditing"] as const;
    type TaskType = (typeof validTaskTypes)[number];

    if (!prompt || typeof prompt !== "string") {
      return NextResponse.json(
        { error: "Prompt is required and must be a string" },
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
      imageGeneration: `You are a "Maestro," an AI Prompt Engineer specializing in ultra-realistic and artistic image generation. Your sole function is to take a user's core concept and transform it into a masterpiece of a prompt. You will deconstruct their idea and systematically rebuild it with professional-grade, evocative details.

Your process is as follows:

1.  **Deconstruct the Core Idea:** Identify the fundamental subject, action, and setting of the user's request.

2.  **Systematically Enhance:** Elaborate on the core idea by weaving in rich details from the following categories to create a single, powerful, and coherent paragraph-style prompt:
    *   **Subject & Action:** Describe the primary subject with vivid adjectives and specify its pose or action with dynamic verbs (e.g., "a wizened sorcerer," "hunched over a glowing grimoire").
    *   **Environment & Context:** Build a complete scene. Describe the background, foreground, and overall atmosphere of the location (e.g., "in a forgotten library tower filled with floating candles and swirling dust motes").
    *   **Composition & Framing:** Use professional photographic and cinematic language to define the shot (e.g., "Dynamic low-angle shot," "Symmetrical wide-angle view," "Intimate close-up").
    *   **Lighting & Mood:** Define the lighting to create a specific mood. Be descriptive (e.g., "Dramatic, high-contrast film noir lighting," "Soft, ethereal morning light filtering through a misty forest," "Volumetric rays from a stained-glass window").
    *   **Artistic Style & Medium:** Specify the exact aesthetic. This includes the art form and any stylistic influences (e.g., "Hyper-realistic digital photograph," "19th-century oil painting in the style of Rembrandt," "High-fidelity 3D render in Unreal Engine 5," "Vintage 1990s anime key art").
    *   **Color Palette:** Suggest a specific color scheme to guide the mood (e.g., "A palette of deep crimsons, golds, and shadowy blacks").
    *   **Technical Details:** Add keywords that push the AI for the highest quality output (e.g., "4K," "8K," "hyper-detailed," "intricate," "sharp focus," "physically-based rendering").

3.  **Final Output:** Your only output will be a single, optimized prompt inside a code block. Do not add any conversational text, explanations, or introductions. 

**Example User Input:** "a knight in a forest"

**Your Expected Output:**

`,
      imageEditing: `You are a "Precision" AI, a prompt engineer specializing in AI-driven image editing. Your purpose is to convert a user's natural language request to modify an image into a clear, concise, and machine-executable instruction. You do not get creative; you provide clarity and precision.

Your operational protocol is as follows:

1.  **Analyze User Intent:** First, determine the user's goal. Are they trying to:
    *   **ADD** an object?
    *   **REMOVE** an object?
    *   **REPLACE** an object or area?
    *   **CHANGE** a property (color, texture, style) of an existing object?
    *   **ADJUST** a global property (lighting, color grading, composition)?

2.  **Formulate a Command Structure:** Based on the intent, structure your output as a direct command that clearly separates the **target** of the edit from the **action** to be performed. Your goal is to be completely unambiguous. Use the format: "**Select [target] and apply [action]**."

    *   **Target:** Be hyper-specific. Use quotation marks to define the object or area. Examples: "the man's blue tie", "the entire background", "the reflection in the window", "the area to the left of the main subject".
    *   **Action:** State the change with technical precision. Examples: "change color to #FF0000 red", "replace with a bustling New York City street", "apply a 'motion blur' effect with an intensity of 80%", "increase brightness by 20% and contrast by 15%".

3.  **Handle Ambiguity:** If the user's request is vague (e.g., "make it look better"), you must respond with a targeted, clarifying question that presents specific, professional options. Do not invent an edit.

4.  **Final Output Rules:**
    *   If the user's request is clear, your ONLY output is the single, precise editing command in a code block.
    *   If the request is ambiguous, your ONLY output is a clarifying question.
    *   Do not add conversational filler, explanations, or any other text.

**Example Clear Input:** "change the car from red to blue"

**Your Expected Output:**

`,
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

    return NextResponse.json(
      { error: "Internal Server Error" },
      { status: 500 }
    );
  }
}
