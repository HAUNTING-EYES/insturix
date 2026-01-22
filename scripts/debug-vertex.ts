
import { VertexAI, HarmCategory, HarmBlockThreshold } from "@google-cloud/vertexai";
import dotenv from 'dotenv';

dotenv.config();
dotenv.config({ path: '.env.local' });

async function main() {
    console.log("Starting Vertex AI Debug Script (Prompt-based)...");

    if (!process.env.GOOGLE_CLOUD_CREDENTIALS) {
        console.error("GOOGLE_CLOUD_CREDENTIALS not found in environment.");
        return;
    }

    try {
        const decoded = Buffer.from(process.env.GOOGLE_CLOUD_CREDENTIALS, "base64").toString();
        const credentials = JSON.parse(decoded);

        console.log(`Using Project ID: ${credentials.project_id}`);

        const vertexAI = new VertexAI({
            project: credentials.project_id,
            location: "us-central1",
            googleAuthOptions: {
                credentials,
                scopes: ["https://www.googleapis.com/auth/cloud-platform"],
            },
        });

        const modelName = "gemini-2.5-flash";
        const generativeModel = vertexAI.getGenerativeModel({
            model: modelName,
            safetySettings: [
                { category: HarmCategory.HARM_CATEGORY_HATE_SPEECH, threshold: HarmBlockThreshold.BLOCK_MEDIUM_AND_ABOVE },
                { category: HarmCategory.HARM_CATEGORY_DANGEROUS_CONTENT, threshold: HarmBlockThreshold.BLOCK_MEDIUM_AND_ABOVE },
                { category: HarmCategory.HARM_CATEGORY_SEXUALLY_EXPLICIT, threshold: HarmBlockThreshold.BLOCK_MEDIUM_AND_ABOVE },
                { category: HarmCategory.HARM_CATEGORY_HARASSMENT, threshold: HarmBlockThreshold.BLOCK_MEDIUM_AND_ABOVE },
            ],
        });

        const videoUrl = "https://www.youtube.com/watch?v=LXb3EKWsInQ"; // "COSTA RICA IN 4K 60fps"

        const prompt = `
    Analyze this video and return a JSON summary.
    Video URL: ${videoUrl}

    IMPORTANT: If you cannot access, watch, or analyze the video from the provided URL (e.g., because it is a YouTube link you cannot process directly), you MUST return the following JSON exactly:
    {
      "error": "CANNOT_ACCESS_VIDEO",
      "message": "The AI model could not access the video content from the provided URL."
    }
    `;

        console.log(`Attempting to generate content with URL in prompt: ${videoUrl}`);

        const request = {
            contents: [
                {
                    role: "user",
                    parts: [
                        {
                            text: prompt,
                        },
                    ],
                },
            ],
        };

        const result = await generativeModel.generateContent(request);
        console.log("Response received:");
        console.log(JSON.stringify(result, null, 2));

    } catch (error: any) {
        console.error("Error occurred during Vertex AI call:");
        console.error(error);
    }
}

main();
