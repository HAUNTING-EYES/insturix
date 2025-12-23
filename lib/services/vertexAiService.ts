import {
  VertexAI,
  HarmCategory,
  HarmBlockThreshold,
} from "@google-cloud/vertexai";

console.log("=== 🔧 VERTEX AI SERVICE LOADING ===");

// Check credentials
if (!process.env.GOOGLE_CLOUD_CREDENTIALS) {
  console.error("❌ GOOGLE_CLOUD_CREDENTIALS not set in environment");
  console.log(
    'Current env vars with "GOOGLE":',
    Object.keys(process.env).filter((k) => k.includes("GOOGLE"))
  );
} else {
  console.log("✅ GOOGLE_CLOUD_CREDENTIALS is set");
  console.log(
    "Credentials length:",
    process.env.GOOGLE_CLOUD_CREDENTIALS.length
  );
}

let vertexAI: VertexAI | null = null;

try {
  if (process.env.GOOGLE_CLOUD_CREDENTIALS) {
    // Decode base64 credentials
    console.log("🔧 Decoding credentials...");
    const decoded = Buffer.from(
      process.env.GOOGLE_CLOUD_CREDENTIALS,
      "base64"
    ).toString();
    console.log("Decoded length:", decoded.length);

    const credentials = JSON.parse(decoded);
    console.log("✅ Credentials parsed");
    console.log("Project ID:", credentials.project_id);
    console.log(
      "Client email:",
      credentials.client_email?.substring(0, 20) + "..."
    );

    // Initialize VertexAI with googleAuthOptions
    vertexAI = new VertexAI({
      project: credentials.project_id,
      location: "us-central1",
      googleAuthOptions: {
        credentials,
        scopes: ["https://www.googleapis.com/auth/cloud-platform"],
      },
    });
    console.log("✅ VertexAI client created");
  } else {
    console.log("⚠️ Using mock VertexAI (no credentials)");
  }
} catch (error) {
  console.error("❌ Failed to initialize VertexAI:", error);
  console.error(
    "Error stack:",
    error instanceof Error ? error.stack : "No stack"
  );
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
  console.log("VertexAI initialized:", !!vertexAI);

  // If no VertexAI client, return mock data
  if (!vertexAI) {
    console.log("⚠️ No VertexAI client, returning mock data");
    return getMockAnalysis(context, metadata);
  }

  try {
    console.log("🔧 Creating generative model...");
    const generativeModel = vertexAI.getGenerativeModel({
      model,
      generationConfig: {
        maxOutputTokens: 8192,
        temperature: 0.4,
        topP: 0.95,
        topK: 40,
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
    });

    console.log("✅ Generative model created");

    // Create analysis prompt with explicit JSON formatting instructions
    const prompt = `
Analyze this video and provide a structured JSON response based on the video content.

VIDEO METADATA:
- Duration: ${metadata.videoDuration} seconds
- Title: ${metadata.originalFilename}
- Video URL: ${videoUrl}

USER CONTEXT:
- Niche: ${context.niche}
- Audience: ${context.audience}
- Tone: ${context.tone}
- Additional Details: ${context.additionalDetails || "None"}

ANALYSIS REQUIREMENTS:
1. Provide a detailed summary of what happens in the video
2. Identify key moments with timestamps (format: "MM:SS") and descriptions
3. Assess video quality (audio, visuals, pacing, engagement) with score 1-10
4. Give specific recommendations for improvement based on the user's context
5. List any content warnings if applicable

CRITICAL: Return ONLY raw JSON without any markdown formatting, backticks, or explanatory text.

JSON STRUCTURE:
{
  "summary": "Detailed summary here",
  "keyMoments": [
    {"timestamp": "00:00", "description": "Description here"},
    {"timestamp": "00:30", "description": "Description here"}
  ],
  "qualityAssessment": {
    "score": 8.5,
    "notes": "Assessment notes here"
  },
  "recommendations": ["Recommendation 1", "Recommendation 2"],
  "contentWarnings": ["Warning 1", "Warning 2"],
  "analysisTime": "${new Date().toISOString()}"
}

Be specific and reference actual content from the video.
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

    // Clean and parse the JSON response
    try {
      // Clean the response text - remove markdown code blocks
      let cleanResponseText = responseText.trim();

      // Remove ```json and ``` markers if present
      if (cleanResponseText.startsWith("```")) {
        cleanResponseText = cleanResponseText
          .replace(/^```(?:json)?\s*/i, "")
          .replace(/\s*```$/, "");
      }

      console.log(
        "Cleaned response preview:",
        cleanResponseText.substring(0, 200) + "..."
      );

      const parsed = JSON.parse(cleanResponseText);
      console.log("✅ JSON parsed successfully");

      // Ensure all required fields exist with defaults
      const finalResult = {
        summary: parsed.summary || `Analysis of "${metadata.originalFilename}"`,
        keyMoments: Array.isArray(parsed.keyMoments) ? parsed.keyMoments : [],
        qualityAssessment: parsed.qualityAssessment || {
          score: 7,
          notes: "Standard quality video analysis",
        },
        recommendations: Array.isArray(parsed.recommendations)
          ? parsed.recommendations
          : [],
        contentWarnings: Array.isArray(parsed.contentWarnings)
          ? parsed.contentWarnings
          : [],
        analysisTime: parsed.analysisTime || new Date().toISOString(),
        videoUrl,
        modelUsed: model,
      };

      console.log("Analysis result structure:", {
        hasSummary: !!finalResult.summary,
        keyMomentsCount: finalResult.keyMoments.length,
        hasQualityAssessment: !!finalResult.qualityAssessment,
        recommendationsCount: finalResult.recommendations.length,
        contentWarningsCount: finalResult.contentWarnings.length,
      });

      return finalResult;
    } catch (parseError) {
      console.error("❌ Failed to parse JSON:", parseError instanceof Error ? parseError.message : String(parseError));

      // Try to extract JSON from the response if it's wrapped in text
      try {
        // Look for JSON object pattern in the response
        const jsonMatch = responseText.match(/\{[\s\S]*\}/);
        if (jsonMatch) {
          const extractedJson = jsonMatch[0];
          console.log("Attempting to extract JSON...");
          const parsed = JSON.parse(extractedJson);
          console.log("✅ Extracted and parsed JSON from response");

          return {
            summary:
              parsed.summary ||
              `Extracted analysis of "${metadata.originalFilename}"`,
            keyMoments: Array.isArray(parsed.keyMoments)
              ? parsed.keyMoments
              : [],
            qualityAssessment: parsed.qualityAssessment || {
              score: 7,
              notes: "Extracted quality assessment",
            },
            recommendations: Array.isArray(parsed.recommendations)
              ? parsed.recommendations
              : [],
            contentWarnings: Array.isArray(parsed.contentWarnings)
              ? parsed.contentWarnings
              : [],
            analysisTime: parsed.analysisTime || new Date().toISOString(),
            videoUrl,
            modelUsed: model,
            extractedFromText: true,
          };
        }
      } catch (extractError) {
        console.error(
          "Couldn't extract JSON:",
          extractError instanceof Error ? extractError.message : String(extractError)
        );
      }

      // If all parsing fails, return a structured error response
      console.log("Returning error response with raw text");
      return {
        summary: `Analysis completed but JSON parsing failed. Video analysis: ${responseText.substring(0, 800)}...`,
        keyMoments: [],
        qualityAssessment: {
          score: 0,
          notes: "JSON parsing error occurred",
        },
        recommendations: ["Fix JSON response formatting"],
        contentWarnings: [],
        analysisTime: new Date().toISOString(),
        parseError: true,
        rawResponse: responseText.substring(0, 2000),
        videoUrl,
        modelUsed: model,
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

    // Check for specific error types
    if (error instanceof Error) {
      if (
        error.message.includes("Unable to authenticate") ||
        error.message.includes("Could not load the default credentials")
      ) {
        console.error(
          "🔐 AUTHENTICATION ERROR: Check your GOOGLE_CLOUD_CREDENTIALS"
        );
        console.error(
          "1. Ensure GOOGLE_CLOUD_CREDENTIALS is set in .env.local"
        );
        console.error("2. Ensure it's a base64 encoded service account JSON");
        console.error("3. The service account needs Vertex AI API access");
      } else if (error.message.includes("fileUri")) {
        console.error(
          "📹 VIDEO ACCESS ERROR: YouTube URL might not be accessible"
        );
        console.error(
          "Consider downloading the video first or using a direct file URL"
        );
      }
    }

    // Return mock data as fallback
    console.log("🔄 Falling back to mock analysis");
    return getMockAnalysis(context, metadata);
  }
}

function getMockAnalysis(context: any, metadata: any) {
  console.log("🎭 Generating mock analysis");
  return {
    summary: `Mock analysis for "${metadata?.originalFilename || "video"}" targeting ${context.audience} in ${context.niche} niche`,
    keyMoments: [
      { timestamp: "00:30", description: "Introduction to topic" },
      { timestamp: "01:45", description: "Key demonstration or example" },
      { timestamp: "03:20", description: "Conclusion and summary" },
    ],
    qualityAssessment: {
      score: 8,
      notes: "Good production quality with clear audio and visuals",
    },
    recommendations: [
      "Add chapter markers for key sections",
      "Include more visual examples",
      "Improve lighting in outdoor shots",
    ],
    contentWarnings: [],
    analysisTime: new Date().toISOString(),
    modelUsed: model,
    mock: true,
  };
}
