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

const PRIMARY_MODEL = "gemini-2.5-flash";
const FALLBACK_MODEL = "gemini-2.5-flash";
const MAX_BRAND_CONTEXT_CHARS = 3000;

function cleanPromptText(value: unknown): string {
  if (typeof value !== "string") return "";
  return value.replace(/\r\n/g, "\n").trim();
}

function brandContextForPrompt(context: any): string {
  const brandContextBlock = cleanPromptText(context?.brandContextBlock);
  if (brandContextBlock.length <= MAX_BRAND_CONTEXT_CHARS) return brandContextBlock;
  return `${brandContextBlock.slice(0, MAX_BRAND_CONTEXT_CHARS)}\n[brand context truncated]`;
}

const CONTENT_INTENT_GUIDANCE: Record<string, string> = {
  own_content: "Treat the media as the user's owned content. Use Brand Vault as the quality and fit lens, then give direct improvements the user can make.",
  competitor_content: "Treat the media as competitor or benchmark content. Use Brand Vault as the user's lens: identify transferable tactics, non-transferable risks, and adaptation ideas without copying the competitor.",
  reference_content: "Treat the media as reference or inspiration content. Extract reusable principles and show how they could be adapted to the user's brand context.",
  unknown: "Ownership is uncertain. Separate observed facts from brand-fit recommendations and do not assume whether the media belongs to the user.",
};

function contentIntentFromContext(context: any): string {
  const resolution = context?.intentResolution && typeof context.intentResolution === "object"
    ? context.intentResolution
    : null;
  return cleanPromptText(resolution?.contentIntent)
    || cleanPromptText(context?.contentIntent)
    || "unknown";
}

function contentIntentForPrompt(context: any): string {
  const resolution = context?.intentResolution && typeof context.intentResolution === "object"
    ? context.intentResolution
    : null;
  const contentIntent = contentIntentFromContext(context);
  const source = cleanPromptText(resolution?.source) || cleanPromptText(context?.intentSource) || "unknown";
  const confidence = typeof resolution?.confidence === "number"
    ? `${Math.round(Math.max(0, Math.min(1, resolution.confidence)) * 100)}%`
    : "unknown";
  const rationale = Array.isArray(resolution?.rationale) && resolution.rationale.length
    ? resolution.rationale.join(" ")
    : "No rationale supplied.";

  return [
    "CONTENT INTENT LENS:",
    `- Intent: ${contentIntent}`,
    `- Source: ${source}`,
    `- Confidence: ${confidence}`,
    `- Rationale: ${rationale}`,
    `- Instruction: ${CONTENT_INTENT_GUIDANCE[contentIntent] ?? CONTENT_INTENT_GUIDANCE.unknown}`,
  ].join("\n");
}

/**
 * Best-effort repair of a truncated JSON object (e.g. the model hit the output
 * token limit mid-response). Closes a dangling string and appends the missing
 * closing brackets/braces so the completed prefix can still be parsed.
 *
 * Add-only by design: it never rewrites existing content, so it can only turn an
 * unparseable truncation into a partial parse or leave it unparseable — it can
 * never corrupt already-complete fields. Returns null when no object is present.
 */
function repairTruncatedJson(raw: string): string | null {
  let s = raw.trim();
  if (s.startsWith("```")) {
    s = s.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "");
  }
  const start = s.indexOf("{");
  if (start === -1) return null;
  s = s.slice(start);

  const closers: string[] = [];
  let inStr = false;
  let esc = false;
  for (let i = 0; i < s.length; i++) {
    const ch = s[i];
    if (inStr) {
      if (esc) esc = false;
      else if (ch === "\\") esc = true;
      else if (ch === '"') inStr = false;
      continue;
    }
    if (ch === '"') inStr = true;
    else if (ch === "{") closers.push("}");
    else if (ch === "[") closers.push("]");
    else if (ch === "}" || ch === "]") closers.pop();
  }

  let out = s;
  if (inStr) out += '"'; // close a dangling string value
  out = out.replace(/[\s,:]+$/, ""); // drop a trailing comma/colon (an incomplete pair)
  for (let i = closers.length - 1; i >= 0; i--) out += closers[i];
  return out;
}

export async function analyzeVideoWithGemini(
  videoUrl: string, // This will now usually be the Gemini fileUri, e.g. "https://generativelanguage.googleapis.com/... or "gemini://... " Wait, actually it just takes fileUri so we keep it named videoUrl or just pass the uri as videoUrl.
  context: any,
  metadata: any,
  modelOverride?: string,
  audioUri?: string
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
          description: "Detailed 2-3 sentence summary of what happens in the media.",
        },
        remarks: {
          type: SchemaType.STRING,
          description: "Brief professional assessment considering platform, location, brand lens, and content intent.",
        },
        target_audience: {
          type: SchemaType.STRING,
          description: "Who this media appeals to.",
        },
        titles: {
          type: SchemaType.ARRAY,
          items: { type: SchemaType.STRING },
          description: "3 suggested titles.",
        },
        descriptions: {
          type: SchemaType.ARRAY,
          items: { type: SchemaType.STRING },
          description: "2 suggested descriptions.",
        },
        strengths: {
          type: SchemaType.ARRAY,
          items: { type: SchemaType.STRING },
          description: "Observed media strengths.",
        },
        weaknesses: {
          type: SchemaType.ARRAY,
          items: { type: SchemaType.STRING },
          description: "Areas for improvement or adaptation.",
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
                      description: "Metric score (1-100). For quality metrics, higher is better. For risk/issue metrics, lower is better.",
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
                description: "Risk score (1-100). A higher score indicates higher risk. Lower is better for compliance.",
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
              start_time: { type: SchemaType.STRING, description: "Start time in HH:MM:SS format" },
            },
            required: ["speaker", "text", "start_time"],
          },
          description: "A word-for-word transcript divided by speaker. Strictly do not summarize, provide everything spoken.",
        },
        content_intent: {
          type: SchemaType.STRING,
          description: "Resolved analysis intent: own_content, competitor_content, reference_content, or unknown.",
        },
        brand_fit_summary: {
          type: SchemaType.STRING,
          description: "How the media fits or can be adapted to the supplied Brand Vault context. Keep observed facts separate from brand-fit judgment.",
        },
        applicable_takeaways: {
          type: SchemaType.ARRAY,
          items: { type: SchemaType.STRING },
          description: "Concrete actions the user can apply. For competitor/reference media, focus on adaptable tactics, not copying.",
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
    let extraParams: any = {};
    if (model.includes("3.1")) {
      extraParams.thinkingConfig = { thinkingLevel: "high" };
    } else if (model.includes("2.5")) {
      extraParams.thinkingConfig = { thinkingBudget: 4000 };
    }
    const generativeModel = client.getGenerativeModel({
      model,
      generationConfig: {
        // gemini-2.5-flash supports up to 65536 output tokens. 8192 was far too
        // small for long videos: a 20+ min analysis (transcript + speaker
        // segments + per-scene fields) overran the budget, so the JSON was
        // truncated mid-object and failed to parse -> analysis failed + refunded.
        maxOutputTokens: 65536,
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
      ...extraParams,
    });

    const brandContextBlock = brandContextForPrompt(context);
    const contentIntentBlock = contentIntentForPrompt(context);

    // analysis prompt with explicit JSON formatting instructions
    const prompt = `<role>You are a professional video content analyst specializing in compliance, quality assessment, and transcription.</role>

<task>Analyze the provided media and return the structured JSON fields defined in the response schema: quality, compliance, transcript, brand-fit judgment, and actionable takeaways.</task>

<rules>
${context.familyFriendly
        ? "- FAMILY FRIENDLY MODE: Ensure the analysis and language are suitable for all age groups. Avoid violence, abusive language, adult themes, hate speech, or offensive humor."
        : "- CONTENT SAFETY: Avoid illegal or extremely explicit content."
      }

PLATFORM AWARENESS (${context.platform}):
- Adapt tone, depth, and language according to the selected platform.
- Social Media: Short, engaging, simple language.
- Documentary: Informative, neutral, factual.
- Television/News: Formal, unbiased, professional.
- OTT/YouTube: Platform-appropriate but compliant.

LOCATION AND LEGAL SENSITIVITY (${context.location}):
- Analyze through the lens of ${context.location === "Global" ? "international" : context.location} laws, cultural norms, and sensitivities.
- For specific countries (e.g., India, USA, UAE), apply their unique regulatory frameworks (e.g., IT Act 2000 for India, COPPA/Section 230 for USA).
- Do NOT make statements that violate local regulations or cultural taboos of the selected region.
- Do NOT criticize, insult, or make negative remarks about high authorities (e.g., PM, President, Government bodies, National institutions) if the location's laws prohibit such speech.
- Identify risks that are specific to ${context.location} (e.g., certain hand gestures, linguistic nuances, or restricted symbols).

CONTENT SAFETY:
- Do not spread misinformation, hate, discrimination, or illegal advice.
- Ensure the analysis is respectful, neutral, and responsible.
${brandContextBlock ? `
BRAND ALIGNMENT:
- Use the supplied brand context as the comparison lens for tone, visual identity, pacing fit, proof style, audience fit, and recommendations.
- Separate observed media facts from brand-fit judgments. If the media conflicts with the brand, report the conflict; do not rewrite the observation to match the brand.
- Do not invent missing brand facts, product claims, or audience claims beyond the supplied brand context.
` : ""}

${contentIntentBlock}

PERSON / FACE RECOGNITION:
- If the video contains a WELL-KNOWN PUBLIC FIGURE (e.g., widely recognized celebrity, politician, influencer), you MAY mention their name ONLY if you are highly confident.
- If confidence is LOW, DO NOT guess or hallucinate names. Instead describe generically (e.g., "a male presenter", "a female host", "a public speaker").
- DO NOT perform web search or assume identity from context alone.
- DO NOT identify private individuals.
- If a known public figure is confidently identified: slightly adjust overall_score based on their relevance, credibility, or audience appeal; optimize suggested titles to include their name naturally; mention their presence in overview and strengths.
- If no known figure is confidently identified: proceed normally without guessing.

TIMESTAMP RULES:
- Include timestamps in STRICT [HH:MM:SS] format naturally WITHIN the description text, NOT as a separate field.
- ONLY include timestamps when pointing to a SPECIFIC moment in the video.
- ONLY include timestamps for analysis, compliance_risks, strengths and weaknesses.
- Timestamps must be lesser or equal to video length. If video length is 30 minutes then timestamp can't be [01:00:00], [00:32:00] etc.
- If an observation applies generally to the entire video, DO NOT include a timestamp.
- Format: Use square brackets like [00:01:23] embedded naturally in the sentence. Do not give timestamp ranges like [HH:MM:SS - HH:MM:SS]. Each timestamp must be a single strict [HH:MM:SS] value.

ANALYSIS REQUIREMENTS:
1. Provide a detailed summary of what happens in the video.
2. Identify key moments inside analysis, strengths, weaknesses, or compliance_risks descriptions using [HH:MM:SS] timestamps; do not create a separate keyMoments field.
3. Assess video quality (audio, visuals, pacing, engagement) with overall_score on a scale of 1-100 (Higher is Better).
4. For all analysis metrics and compliance risks, use a scale of 1-100.
   - Quality/Performance metrics: Higher score = better performance.
   - Risk/Issue/Compliance metrics: Higher score = higher risk/problem (Lower is Better for the user).
5. Include timestamps [HH:MM:SS] naturally in descriptions ONLY when referring to specific moments.
6. Put specific suggestions in weaknesses and applicable_takeaways, strategically aligned with the user's context (${context.platform}, ${context.location}) and the content intent lens.
7. Put any content warnings in compliance_risks; do not create a separate contentWarnings field.
8. Provide a word-for-word full transcript and speaker segments. Strictly do not summarize the dialogue, provide EVERYTHING spoken verbatim.
${audioUri ? `
SCORING LOGIC:
- The overall_score MUST be calculated using weighted evaluation:
  Visual Quality 25%, Audio Quality 20%, Content Value & Clarity 20%, Engagement & Retention 15%, Editing & Pacing 10%, Platform Optimization 5%, Compliance & Safety 5%.
- Adjustments:
  - If a WELL-KNOWN PUBLIC FIGURE is confidently identified: increase engagement score slightly (max +5 overall impact).
  - If compliance risks are high: reduce overall_score proportionally.
  - If video violates location (${context.location}) norms: apply penalty (5-20 points depending on severity).
- DO NOT assign random scores. Every score MUST reflect actual observed quality from the video.

DUAL-FILE AUDIO INSTRUCTION:
A video file and its separate audio track are both provided. Analyze them together. Generate the transcript from the provided audio track while using the video for visual context and speaker identification.
` : ''}
</rules>

<output_format>
Return ONLY raw JSON without any markdown formatting, backticks, or explanatory text.

JSON STRUCTURE:
{
  "category": "Video category or media category",
  "overall_score": 85,
  "overview": "Detailed summary of what happens in the media.",
  "remarks": "Professional assessment grounded in the selected platform, location, brand context, and content intent.",
  "target_audience": "Who this media appeals to",
  "titles": ["Suggested title 1", "Suggested title 2", "Suggested title 3"],
  "descriptions": ["Suggested description 1", "Suggested description 2"],
  "strengths": ["Observed strength with optional [HH:MM:SS] timestamp"],
  "weaknesses": ["Improvement opportunity with optional [HH:MM:SS] timestamp"],
  "analysis": [
    {
      "category_name": "Visuals",
      "metrics": [
        {
          "name": "Framing and clarity",
          "score": 90,
          "description": "Evidence-backed metric description with timestamp only when tied to a specific moment."
        }
      ]
    }
  ],
  "compliance_risks": [
    {
      "name": "Misinformation Risk",
      "score": 10,
      "description": "Risk assessment. Higher score means higher risk."
    }
  ],
  "full_transcript": "Wait, let's keep going. Yes, I think so...",
  "speaker_segments": [
    {"speaker": "Speaker A", "text": "Wait, let's keep going.", "start_time": "00:00:00"}
  ],
  "content_intent": "${contentIntentFromContext(context)}",
  "brand_fit_summary": "How this media fits or can be adapted to the supplied brand lens.",
  "applicable_takeaways": ["Concrete action the user can apply from this analysis"]
}
</output_format>

<input_data>
VIDEO METADATA:
- Duration: ${metadata.videoDuration} seconds
- Title: ${metadata.originalFilename}
- Video URL: ${videoUrl}

USER CONTEXT:
- Family-Friendly Handling: ${context.familyFriendly ? "Enabled (Strict)" : "Disabled (Standard Safety)"}
- Platform: ${context.platform}
- Location/Legal Context: ${context.location}
- Content Intent: ${contentIntentFromContext(context)}
- Additional Details: ${context.additionalDetails || "None"}
${brandContextBlock ? `
BRAND CONTEXT:
${brandContextBlock}
` : ""}
</input_data>

Be specific and reference actual content from the video with precise timestamps.
`;

    const parts: any[] = [];

    if (videoUrl) {
      parts.push({
        fileData: {
          mimeType: "video/mp4",
          fileUri: videoUrl,
        },
      });
    }

    if (audioUri && audioUri.trim() !== "") {
      parts.push({
        fileData: {
          mimeType: "audio/mpeg",
          fileUri: audioUri,
        },
      });
    }

    parts.push({ text: prompt });


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

      const parsed = JSON.parse(cleanResponseText);

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
        content_intent: parsed.content_intent || contentIntentFromContext(context),
        brand_fit_summary: parsed.brand_fit_summary || "",
        applicable_takeaways: Array.isArray(parsed.applicable_takeaways) ? parsed.applicable_takeaways : [],
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
            content_intent: parsed.content_intent || contentIntentFromContext(context),
            brand_fit_summary: parsed.brand_fit_summary || "",
            applicable_takeaways: Array.isArray(parsed.applicable_takeaways) ? parsed.applicable_takeaways : [],
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

      // Last resort: repair a truncated JSON object (model hit the token limit
      // mid-response) and salvage the completed prefix. Partial results are far
      // better than failing the whole analysis and refunding the user.
      try {
        const repaired = repairTruncatedJson(responseText);
        if (repaired) {
          const parsed = JSON.parse(repaired);
          if (parsed.error === "CANNOT_ACCESS_VIDEO") {
            throw new Error("AI_MODEL_ACCESS_ERROR: The AI model reported it could not access the video URL.");
          }
          console.warn(`[vertexAi] Recovered partial analysis from truncated JSON (${responseText.length} chars) — consider raising maxOutputTokens or shortening the analysis.`);
          return {
            ...parsed,
            full_transcript: parsed.full_transcript || "",
            speaker_segments: Array.isArray(parsed.speaker_segments) ? parsed.speaker_segments : [],
            summary: parsed.summary || parsed.overview || `Partial analysis of "${metadata.originalFilename}"`,
            keyMoments: Array.isArray(parsed.keyMoments) ? parsed.keyMoments : [],
            qualityAssessment: parsed.qualityAssessment || { score: 7, notes: "Partial analysis (recovered from a truncated response)" },
            recommendations: Array.isArray(parsed.recommendations) ? parsed.recommendations : [],
            contentWarnings: Array.isArray(parsed.contentWarnings) ? parsed.contentWarnings : [],
            content_intent: parsed.content_intent || contentIntentFromContext(context),
            brand_fit_summary: parsed.brand_fit_summary || "",
            applicable_takeaways: Array.isArray(parsed.applicable_takeaways) ? parsed.applicable_takeaways : [],
            analysisTime: parsed.analysisTime || new Date().toISOString(),
            videoUrl,
            modelUsed: model,
            extractedFromText: true,
            truncated: true,
          };
        }
      } catch (repairError) {
        if (repairError instanceof Error && repairError.message.startsWith("AI_MODEL_ACCESS_ERROR")) {
          throw repairError;
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
        content_intent: contentIntentFromContext(context),
        brand_fit_summary: "",
        applicable_takeaways: [],
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
      return analyzeVideoWithGemini(videoUrl, context, metadata, FALLBACK_MODEL, audioUri);
    }
    throw error;
  }
}
