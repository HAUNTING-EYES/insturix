import {
  GoogleGenerativeAI,
  HarmCategory,
  HarmBlockThreshold,
  SchemaType,
} from "@google/generative-ai";

let genAI: GoogleGenerativeAI | null = null;

function initGenAI(): GoogleGenerativeAI {
  if (genAI) return genAI;

  if (!process.env.GEMINI_API_KEY) {
    throw new Error("GEMINI_API_KEY environment variable is not set");
  }

  try {
    genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
    return genAI;
  } catch (error) {
    throw error;
  }
}
const PRIMARY_MODEL = "gemini-3.1-flash-lite-preview";
const FALLBACK_MODEL = "gemini-2.5-flash";

export async function analyzeVideoWithGemini(
  videoUrl: string, // This will now usually be the Gemini fileUri, e.g. "https://generativelanguage.googleapis.com/... or "gemini://... " Wait, actually it just takes fileUri so we keep it named videoUrl or just pass the uri as videoUrl.
  context: any,
  metadata: any,
  modelOverride?: string
) {
  const model = modelOverride || PRIMARY_MODEL;
  // Initialize lazily

  const client = initGenAI();
  try {
    // Define the response schema for structured output
    const responseSchema = {
      type: SchemaType.OBJECT,
      properties: {
        category: {
          type: SchemaType.STRING,
          description: "Video category (e.g., Entertainment, Education, Vlog)",
        },
        overall_score: {
          type: SchemaType.INTEGER,
          description: "Overall quality score (1-100). Higher is better.",
        },
        overview: {
          type: SchemaType.STRING,
          description: "2-3 sentence summary",
        },
        remarks: {
          type: SchemaType.STRING,
          description: "Brief professional assessment, specifically considering the chosen location's context and norms",
        },
        target_audience: {
          type: SchemaType.STRING,
          description: "Who this video appeals to",
        },
        titles: {
          type: SchemaType.ARRAY,
          items: { type: SchemaType.STRING },
          description: "3 suggested titles",
        },
        descriptions: {
          type: SchemaType.ARRAY,
          items: { type: SchemaType.STRING },
          description: "2 suggested descriptions",
        },
        strengths: {
          type: SchemaType.ARRAY,
          items: { type: SchemaType.STRING },
          description: "Video strengths",
        },
        weaknesses: {
          type: SchemaType.ARRAY,
          items: { type: SchemaType.STRING },
          description: "Areas for improvement",
        },
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
                    score: {
                      type: SchemaType.INTEGER,
                      description: "Metric score (1-100). For quality metrics, higher is better. For risk/issue metrics, lower is better."
                    },
                    description: { type: SchemaType.STRING },
                  },
                  required: ["name", "score", "description"],
                },
              },
            },
            required: ["category_name", "metrics"],
          },
        },
        compliance_risks: {
          type: SchemaType.ARRAY,
          items: {
            type: SchemaType.OBJECT,
            properties: {
              name: { type: SchemaType.STRING },
              score: {
                type: SchemaType.INTEGER,
                description: "Risk score (1-100). A higher score indicates higher risk. Lower is better for compliance."
              },
              description: { type: SchemaType.STRING },
            },
            required: ["name", "score", "description"],
          },
        },
        full_transcript: {
          type: SchemaType.STRING,
          description: "A word-for-word string containing the entire transcription. Strictly do not summarize the dialogue, provide everything spoken.",
        },
        speaker_segments: {
          type: SchemaType.ARRAY,
          items: {
            type: SchemaType.OBJECT,
            properties: {
              speaker: { type: SchemaType.STRING, description: "Speaker identifier (e.g., Speaker A)" },
              text: { type: SchemaType.STRING, description: "The exact words spoken by the speaker" },
              start_time: { type: SchemaType.STRING, description: "Start time in HH:MM:SS format" }
            },
            required: ["speaker", "text", "start_time"]
          },
          description: "A word-for-word transcript divided by speaker. Strictly do not summarize, provide everything spoken.",
        },
      },
      required: [
        "category",
        "overall_score",
        "overview",
        "strengths",
        "weaknesses",
        "analysis",
        "full_transcript",
        "speaker_segments",
      ],
    };

    // --- Ye block insert karo ---
    let extraParams: any = {};
    if (model.includes("3.1")) {
      extraParams.thinkingConfig = { thinkingLevel: "high" };
    } else if (model.includes("2.5")) {
      extraParams.thinkingConfig = { thinkingBudget: 4000 };
    }
    // ----------------------------
    const generativeModel = client.getGenerativeModel({
      model,
      generationConfig: {
        maxOutputTokens: 8192,
        temperature: 0.4,
        topP: 0.95,
        topK: 40,
        responseMimeType: "application/json",
        responseSchema: responseSchema as any,
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

    // analysis prompt with explicit JSON formatting instructions
    const prompt = `
Analyze this video and provide a structured JSON response based on the video content.

VIDEO METADATA:
- Duration: ${metadata.videoDuration} seconds
- Title: ${metadata.originalFilename}
- Video URL: ${videoUrl}

USER CONTEXT & SAFETY SETTINGS:
- Family-Friendly Handling: ${context.familyFriendly ? "Enabled (Strict)" : "Disabled (Standard Safety)"}
- Platform: ${context.platform}
- Location/Legal Context: ${context.location}
- Additional Details: ${context.additionalDetails || "None"}

GUIDELINES:
${context.familyFriendly
        ? "1. FAMILY FRIENDLY MODE: Ensure the analysis and language are suitable for all age groups. Avoid violence, abusive language, adult themes, hate speech, or offensive humor."
        : "1. CONTENT SAFETY: Avoid illegal or extremely explicit content."
      }

2. PLATFORM AWARENESS (${context.platform}):
   - Adapt tone, depth, and language according to the selected platform.
   - Social Media: Short, engaging, simple language.
   - Documentary: Informative, neutral, factual.
   - Television/News: Formal, unbiased, professional.
   - OTT/YouTube: Platform-appropriate but compliant.

3. LOCATION & LEGAL SENSITIVITY (${context.location}):
   - Analyze the video through the lens of ${context.location === "Global" ? "international" : context.location} laws, cultural norms, and sensitivities.
   - For specific countries (e.g., India, USA, UAE), apply their unique regulatory frameworks (e.g., IT Act 2000 for India, COPPA/Section 230 for USA).
   - Do NOT make statements that violate local regulations or cultural taboos of the selected region.
   - Do NOT criticize, insult, or make negative remarks about high authorities (e.g., PM, President, Government bodies, National institutions) if the location's laws prohibit such speech.
   - Identify risks that are specific to ${context.location} (e.g., certain hand gestures, linguistic nuances, or restricted symbols).

4. CONTENT SAFETY:
   - Do not spread misinformation, hate, discrimination, or illegal advice.
   - Ensure the analysis is respectful, neutral, and responsible.

CRITICAL TIMESTAMP INSTRUCTIONS:
- Include timestamps in STRICT [HH:MM:SS] format naturally WITHIN the description text, NOT as a separate field
- ONLY include timestamps when pointing to a SPECIFIC moment in the video
- ONLY include timestamps for analysis, compliance_risks, strengths and weaknesses.
- Timestamps must be lesser or equal to video length. If video length is 30 minutes then timestamp can't be [01:00:00], [00:32:00] etc.
- If an observation applies generally to the entire video, DO NOT include a timestamp
- Format: Use square brackets like [00:01:23] embedded naturally in the sentence. Don't give timestamp like [HH:MM:SS , HH:MM:SS] or [HH:MM:SS - HH:MM:SS]. Timestamp must be in strict [HH:MM:SS] format.
- Examples:
  ✅ GOOD: "The voiceover at [00:00:15] is clear and engaging"
  ✅ GOOD: "Potential copyright issue visible at [00:01:30] with the background music"
  ✅ GOOD: "The video maintains consistent quality throughout" (no timestamp - general)
  ❌ BAD: Don't add timestamps to every single description
  ❌ BAD: Don't give timestamps like [HH:MM:SS - HH:MM:SS] to specify range.

ANALYSIS REQUIREMENTS:
1. Provide a detailed summary of what happens in the video
2. Identify key moments with timestamps (format: "HH:MM:SS") and descriptions
3. Assess video quality (audio, visuals, pacing, engagement) with overall_score on a scale of 1-100 (Higher is Better). This score MUST reflect compliance with the selected location's (${context.location}) standards.
4. For all analysis metrics and compliance risks, use a scale of 1-100.
   - For Quality/Performance metrics: Higher score = better performance.
   - For Risk/Issue/Compliance metrics: Higher score = higher risk/problem (Lower is Better for the user).
5. Include timestamps [HH:MM:SS] naturally in descriptions ONLY when referring to specific moments
6. Give specific suggestions and remarks for improvement that are strategically aligned with the user's context (${context.platform}, ${context.location}). For example, if location is India, suggest optimizations for Indian viewers or compliance with Indian ad standards.
7. List any content warnings if applicable
8. Provide a word-for-word full transcript and speaker segments. Strictly do not summarize the dialogue, provide EVERYTHING spoken verbatim.

CRITICAL: Return ONLY raw JSON without any markdown formatting, backticks, or explanatory text.

JSON STRUCTURE EXAMPLE:
{
  "full_transcript": "Wait, let's keep going. Yes, I think so...",
  "speaker_segments": [
    {"speaker": "Speaker A", "text": "Wait, let's keep going.", "start_time": "00:00:00"},
    {"speaker": "Speaker B", "text": "Yes, I think so...", "start_time": "00:00:03"}
  ],
  "summary": "Detailed summary here",
  "keyMoments": [
    {"timestamp": "00:00:00", "description": "Video starts with intro"},
    {"timestamp": "00:00:30", "description": "Main content begins"}
  ],
  "qualityAssessment": {
    "score": 85,
    "notes": "Assessment notes here. Note: score is 1-100 where higher is better."
  },
  "recommendations": ["Recommendation 1", "Recommendation 2"],
  "contentWarnings": ["Warning 1", "Warning 2"],
  "analysis": [
    {
      "category_name": "Visuals",
      "metrics": [
        {
          "name": "Map Animation & Clarity",
          "score": 90,
          "description": "Clear satellite imagery with effective highlighting",
        }
      ]
    }
  ],
  "compliance_risks": [
    {
      "name": "Misinformation Risk",
      "score": 10,
      "description": "Content is factual",
    }
  ],
  "analysisTime": "${new Date().toISOString()}"
}

Be specific and reference actual content from the video with precise timestamps.
`;

    // Prepare request parts
    const parts: any[] = [];


    parts.push({
      fileData: {
        mimeType: 'video/mp4',
        fileUri: videoUrl,
      },
    }, {
      text: prompt,
    });


    const request = {
      contents: [
        {
          role: "user",
          parts: parts,
        },
      ],
    };

    const result = await generativeModel.generateContent(request);
    const responseText =
      result.response.candidates?.[0]?.content?.parts?.[0]?.text || "{}";

    console.log("RAW_VERTEX_RESPONSE:", responseText);

    // Clean and parse the JSON response
    try {
      // Clean the response text - remove markdown code blocks
      let cleanResponseText = responseText.trim();

      console.log("cleanResponseText : ", cleanResponseText);
      // Remove ```json and ``` markers if present
      if (cleanResponseText.startsWith("```")) {
        cleanResponseText = cleanResponseText
          .replace(/^```(?:json)?\s*/i, "")
          .replace(/\s*```$/, "");
      }

      const parsed = JSON.parse(cleanResponseText);

      console.log("parsed : ", parsed);
      // Check for explicit error from model
      if (parsed.error === "CANNOT_ACCESS_VIDEO") {
        throw new Error("AI_MODEL_ACCESS_ERROR: The AI model reported it could not access the video URL.");
      }

      // Ensure all required fields exist with defaults
      const finalResult = {
        ...parsed, // Include all original fields from the model (analysis, strengths, titles, etc.)
        full_transcript: parsed.full_transcript || "",
        speaker_segments: parsed.speaker_segments || [],
        summary: parsed.summary || parsed.overview || `Analysis of "${metadata.originalFilename}"`,
        keyMoments: Array.isArray(parsed.keyMoments) ? parsed.keyMoments : [],
        qualityAssessment: parsed.qualityAssessment || {
          score: parsed.overall_score || 7,
          notes: parsed.remarks || "Standard quality video analysis",
        },
        recommendations: Array.isArray(parsed.recommendations)
          ? parsed.recommendations
          : (parsed.weaknesses || []),
        contentWarnings: Array.isArray(parsed.contentWarnings)
          ? parsed.contentWarnings
          : (Array.isArray(parsed.compliance_risks)
            ? parsed.compliance_risks.filter((risk: any) => risk.score > 0)
            : []),
        analysisTime: parsed.analysisTime || new Date().toISOString(),
        videoUrl,
        modelUsed: model,
      };

      // Also filter the top-level compliance_risks if they exist in parsed
      if (Array.isArray(finalResult.compliance_risks)) {
        finalResult.compliance_risks = finalResult.compliance_risks.filter((risk: any) => risk.score > 0);
      }

      console.log(finalResult);
      return finalResult;
    } catch (parseError) {
      // If it was our custom error, rethrow it
      if (parseError instanceof Error && parseError.message.startsWith("AI_MODEL_ACCESS_ERROR")) {
        throw parseError;
      }

      // Try to extract JSON from the response if it's wrapped in text
      try {
        // Look for JSON object pattern in the response
        const jsonMatch = responseText.match(/\{[\s\S]*\}/);
        if (jsonMatch) {
          const extractedJson = jsonMatch[0];
          const parsed = JSON.parse(extractedJson);

          if (parsed.error === "CANNOT_ACCESS_VIDEO") {
            throw new Error("AI_MODEL_ACCESS_ERROR: The AI model reported it could not access the video URL.");
          }

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
        if (extractError instanceof Error && extractError.message.startsWith("AI_MODEL_ACCESS_ERROR")) {
          throw extractError;
        }
      }

      // If all parsing fails, return a structured error response
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
    // --- Fallback to Gemini Pro if Flash fails ---
    if (modelOverride !== FALLBACK_MODEL) {
      console.warn(`[VertexAI] ${modelOverride || PRIMARY_MODEL} failed, falling back to ${FALLBACK_MODEL}...`);
      return analyzeVideoWithGemini(videoUrl, context, metadata, FALLBACK_MODEL);
    }
    throw error;
  }
}
