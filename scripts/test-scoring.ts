import { analyzeVideoWithGemini } from "../lib/services/vertexAiService.ts";
import dotenv from 'dotenv';

dotenv.config();
dotenv.config({ path: '.env.local' });

async function test() {
    const videoUrl = "https://www.youtube.com/watch?v=LXb3EKWsInQ"; // Costa Rica in 4K
    const context = {
        niche: "Travel",
        audience: "Adventurers",
        tone: "Exciting",
        additionalDetails: "Testing scoring range 1-100 and metric directions."
    };
    const metadata = {
        videoDuration: 310,
        originalFilename: "costa_rica.mp4"
    };

    console.log("Calling analyzeVideoWithGemini...");
    try {
        const result = await analyzeVideoWithGemini(videoUrl, context, metadata);
        console.log("-----------------------------------------");
        console.log("Analysis Results:");
        console.log(JSON.stringify(result, null, 2));
        console.log("-----------------------------------------");
        
        // Basic range check
        if (result.qualityAssessment && result.qualityAssessment.score > 10) {
            console.log("✅ Success: Quality score is > 10 (using 1-100 scale)");
        } else {
            console.log("⚠️ Warning: Quality score is <= 10. Check if LLM still uses 1-10 scale.");
        }

        if (result.analysis) {
             result.analysis.forEach((cat: any) => {
                 cat.metrics.forEach((metric: any) => {
                     console.log(`Metric: ${metric.name}, Score: ${metric.score}`);
                 });
             });
        }

    } catch (error) {
        console.error("Error during analysis:", error);
    }
}

test();
