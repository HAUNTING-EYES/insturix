import {
  VertexAI,
  HarmCategory,
  HarmBlockThreshold,
  SchemaType,
} from "@google-cloud/vertexai";

console.log("=== 🔧 VERTEX AI SERVICE LOADING ===");

// Check credentials
if (!process.env.GOOGLE_CLOUD_CREDENTIALS) {
  console.error("❌ GOOGLE_CLOUD_CREDENTIALS not set in environment");
}

let vertexAI: VertexAI | null = null;
let credentials: any;

function initVertexAI(): VertexAI {
  if (vertexAI) return vertexAI;
  
  if (!process.env.GOOGLE_CLOUD_CREDENTIALS) {
    throw new Error("GOOGLE_CLOUD_CREDENTIALS environment variable is not set");
  }
  
  // Decode base64 credentials
  console.log("🔧 Decoding credentials...");
  const decoded = Buffer.from(
    process.env.GOOGLE_CLOUD_CREDENTIALS,
    "base64"
  ).toString();

  credentials = JSON.parse(decoded);
  console.log("✅ Credentials parsed");
  console.log("Project ID:", credentials.project_id);
  console.log(
    "Client email:",
    credentials.client_email?.substring(0, 20) + "..."
  );

  // Create VertexAI with credentials passed via googleAuthOptions
  vertexAI = new VertexAI({
    project: credentials.project_id,
    location: "us-central1",
    googleAuthOptions: {
      credentials: credentials, // Pass the service account JSON directly
      scopes: ["https://www.googleapis.com/auth/cloud-platform"],
    },
  });
  console.log("✅ VertexAI client created with googleAuthOptions.credentials");
  
  return vertexAI;
}

const model = "gemini-2.5-flash";

export async function analyzeVideoWithGemini(
  videoUrl: string,
  context: any,
  metadata: any
) {
  console.log("\n=== 🎬 VERTEX AI ANALYSIS START ===");
  console.log("Video URL:", videoUrl);
  console.log("Context:", context);
  console.log("Metadata:", metadata);

  // Initialize VertexAI lazily
  const client = initVertexAI();
  console.log("VertexAI initialized:", !!client);

  try {
    console.log("🔧 Creating generative model with structured output...");
    
    // Define the response schema for structured output
    const responseSchema = {
      type: SchemaType.OBJECT,
      properties: {
        category: { type: SchemaType.STRING, description: "Video category (e.g., Entertainment, Education, Vlog)" },
        overall_score: { type: SchemaType.INTEGER, description: "Overall quality score 1-100" },
        overview: { type: SchemaType.STRING, description: "2-3 sentence summary" },
        remarks: { type: SchemaType.STRING, description: "Brief professional assessment" },
        target_audience: { type: SchemaType.STRING, description: "Who this video appeals to" },
        titles: { type: SchemaType.ARRAY, items: { type: SchemaType.STRING }, description: "3 suggested titles" },
        descriptions: { type: SchemaType.ARRAY, items: { type: SchemaType.STRING }, description: "2 suggested descriptions" },
        strengths: { type: SchemaType.ARRAY, items: { type: SchemaType.STRING }, description: "Video strengths" },
        weaknesses: { type: SchemaType.ARRAY, items: { type: SchemaType.STRING }, description: "Areas for improvement" },
        analysis: {
          type: SchemaType.ARRAY,
          items: {
            type: SchemaType.OBJECT,
            properties: {
              category_name: { type: SchemaType.STRING },
              metrics: {
                type: SchemaType.ARRAY,
                items: {
                  type: SchemaType.OBJECT,
                  properties: {
                    name: { type: SchemaType.STRING },
                    score: { type: SchemaType.INTEGER },
                    description: { type: SchemaType.STRING }
                  },
                  required: ["name", "score", "description"]
                }
              }
            },
            required: ["category_name", "metrics"]
          }
        },
        compliance_risks: {
          type: SchemaType.ARRAY,
          items: {
            type: SchemaType.OBJECT,
            properties: {
              name: { type: SchemaType.STRING },
              score: { type: SchemaType.INTEGER },
              description: { type: SchemaType.STRING }
            },
            required: ["name", "score", "description"]
          }
        }
      },
      required: ["category", "overall_score", "overview", "strengths", "weaknesses", "analysis"]
    };
    
    const generativeModel = client.getGenerativeModel({
      model,
      generationConfig: {
        maxOutputTokens: 8192,
        temperature: 0.4,
        topP: 0.95,
        topK: 40,
        responseMimeType: "application/json",
        responseSchema: responseSchema,
      },
      safetySettings: [
        {
          category: HarmCategory.HARM_CATEGORY_HATE_SPEECH,
          threshold: HarmBlockThreshold.BLOCK_MEDIUM_AND_ABOVE,
        },
        {
          category: HarmCategory.HARM_CATEGORY_DANGEROUS_CONTENT,
          threshold: HarmBlockThreshold.BLOCK_MEDIUM_AND_ABOVE,
        },
        {
          category: HarmCategory.HARM_CATEGORY_SEXUALLY_EXPLICIT,
          threshold: HarmBlockThreshold.BLOCK_MEDIUM_AND_ABOVE,
        },
        {
          category: HarmCategory.HARM_CATEGORY_HARASSMENT,
          threshold: HarmBlockThreshold.BLOCK_MEDIUM_AND_ABOVE,
        },
      ],
      systemInstruction: "You are a professional video analysis AI. Analyze the provided video thoroughly and provide detailed, specific insights based on actual video content.",
    });

    console.log("✅ Generative model created");

    // Create analysis prompt - structure is enforced by responseSchema
    const prompt = `
    Analyze this video thoroughly based on its actual content.
    
    VIDEO METADATA:
    - Duration: ${metadata.videoDuration} seconds
    - Title: ${metadata.originalFilename}
    
    USER CONTEXT:
    - Niche: ${context.niche}
    - Target Audience: ${context.audience}
    - Desired Tone: ${context.tone}
    - Additional Details: ${context.additionalDetails || "None"}
    
    Provide:
    1. An overall quality score (1-100) based on content, production value, and audience fit
    2. A concise overview summarizing what happens in the video
    3. Specific strengths and areas for improvement
    4. Detailed analysis across Content Quality, Technical Quality, and Audience Appeal metrics (each scored 1-100)
    5. Copyright and community guideline risk assessment
    6. 3 suggested optimized titles and 2 descriptions for better discoverability
    
    Be specific and reference actual moments/content from the video. All scores must be integers between 1-100.
    `;

    console.log("📝 Prompt created (length:", prompt.length, "chars)");
    console.log("🔧 Making Vertex AI API call with video...");

    // Prepare request with video file
    const request = {
      contents: [
        {
          role: "user",
          parts: [
            {
              fileData: {
                fileUri: videoUrl,
                mimeType: metadata.mimeType || "video/mp4",
              },
            },
            {
              text: prompt,
            },
          ],
        },
      ],
    };

    console.log("📤 Sending video for analysis:", videoUrl);
    const result = await generativeModel.generateContent(request);
    console.log("✅ Vertex AI API call succeeded");

    const responseText =
      result.response.candidates?.[0]?.content?.parts?.[0]?.text || "{}";
    console.log("Response text length:", responseText.length);
    console.log("Response preview:", responseText.substring(0, 200) + "...");

    // Strip markdown code block wrapper if present (e.g., ```json ... ```)
    let cleanedResponse = responseText;
    if (cleanedResponse.startsWith("```")) {
      cleanedResponse = cleanedResponse.replace(/^```(?:json)?\s*\n?/, "");
      cleanedResponse = cleanedResponse.replace(/\n?```\s*$/, "");
      console.log("📝 Stripped markdown code block wrapper");
    }

    try {
      const parsed = JSON.parse(cleanedResponse);
      console.log("✅ JSON parsed successfully");

      // Ensure all required fields exist
      const finalResult = {
        ...parsed,
        analysisTime: parsed.analysisTime || new Date().toISOString(),
        videoUrl,
        modelUsed: model,
      };

      return finalResult;
    } catch (parseError) {
      console.error("❌ Failed to parse JSON:", parseError);
      console.log("Full response:", cleanedResponse);
      return {
        summary: `Analysis completed but couldn't parse structured response. Raw insights: ${cleanedResponse.substring(0, 1000)}`,
        analysisTime: new Date().toISOString(),
        parseError: true,
        rawResponse: cleanedResponse,
      };
    }
  } catch (error) {
    console.error("❌ Vertex AI analysis failed:", error);
    console.error(
      "Error name:",
      error instanceof Error ? error.name : "Unknown"
    );
    console.error(
      "Error message:",
      error instanceof Error ? error.message : "Unknown"
    );
    console.error(
      "Error stack:",
      error instanceof Error ? error.stack : "No stack"
    );

    // Re-throw the error - no mock fallback
    throw error;
  }
}

