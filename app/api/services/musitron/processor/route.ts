import { verifySignatureAppRouter } from "@upstash/qstash/nextjs";
import { NextResponse } from "next/server";
import { getMusitronCollections } from "@/lib/services/musitron-mongo";
import { ObjectId } from "mongodb";
import { processRefund } from "@/lib/services/tasks/simple-refund";
import { Storage } from "@google-cloud/storage";
import { fal } from "@fal-ai/client"; // Note: named import instead of default import

async function handler(request: Request) {
  console.log("[Musitron Processor] Handler called!");

  let userId: string | undefined;
  let taskId: string | undefined;

  try {
    const body = await request.json();
    console.log("[Musitron Processor] Received body:", body);
    ({ taskId, userId } = body);
    const model: string | undefined = body.model;

    if (!taskId || !userId) {
      return NextResponse.json(
        { error: "Missing taskId or userId" },
        { status: 400 }
      );
    }
    if (!model) {
      return NextResponse.json(
        { error: "Missing model in request" },
        { status: 400 }
      );
    }
    const { musicGenerations } = await getMusitronCollections();

    // Validate ObjectId format
    if (!ObjectId.isValid(taskId)) {
      return NextResponse.json(
        { error: "Invalid taskId format" },
        { status: 400 }
      );
    }

    // 1. Fetch the task
    const task = await musicGenerations.findOne({
      _id: ObjectId.createFromHexString(taskId),
      clerkUserId: userId,
    });

    if (!task) {
      return NextResponse.json({ error: "Task not found" }, { status: 404 });
    }

    // Prevent re-processing if already completed/failed
    if (task.status === "completed" || task.status === "failed") {
      return NextResponse.json({
        success: true,
        message: "Task already processed",
      });
    }

    // 2. Update status to processing (MongoDB)
    await musicGenerations.updateOne(
      { _id: task._id },
      {
        $set: {
          status: "processing",
          processingStartTime: new Date(),
          updatedAt: new Date(),
        },
      }
    );

    // 3. Generate music with Fal AI
    try {
      // ⬇️ ADD THIS CONFIGURATION LINE ⬇️
      fal.config({
        credentials: process.env.FAL_AI_API_KEY,
      });
      console.log(
        "[Musitron Processor] Starting Fal AI generation with model:",
        model
      );

      // ⬆️ CONFIGURATION ADDED ⬆️

      console.log(
        "[Musitron Processor] Starting Fal AI generation with params:",
        {
          prompt: `${task.style}. ${task.title}`,
          lyrics: task.lyrics || "[inst]",
          duration: Math.min(Math.max(task.duration, 5), 240),
          instrumental: task.instrumental_only,
        }
      );

      // Use prompt-to-audio endpoint which takes a text prompt
      const falResult = await fal.subscribe(model, {
        input: {
          prompt: `${task.style}. ${task.title}`,
          instrumental: task.instrumental_only,
          duration: Math.min(Math.max(task.duration, 5), 240),
          number_of_steps: 27,
          scheduler: "euler",
          guidance_type: "apg",
          guidance_scale: 15,
        },
      });
      console.log(
        "[Musitron Processor] Fal AI SDK response received:",
        falResult
      );

      // Get audio URL from Fal AI response
      const audioUrl = falResult.data?.audio?.url;

      if (!audioUrl) {
        throw new Error(
          "No audio URL in Fal AI response. Response: " +
            JSON.stringify(falResult)
        );
      }

      // 4. Upload to GCS
      console.log(
        "[Musitron Processor] Starting GCS upload. Audio URL:",
        audioUrl
      );

      // Download audio from Fal AI with timeout on the entire operation
      const downloadWithTimeout = async (
        url: string,
        timeoutMs: number
      ): Promise<Buffer> => {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

        try {
          const response = await fetch(url, { signal: controller.signal });
          if (!response.ok) {
            throw new Error(`Failed to download audio: ${response.status}`);
          }
          console.log(
            "[Musitron Processor] Audio response received, buffering..."
          );

          // Use Promise.race to add timeout to arrayBuffer reading
          const bufferPromise = response.arrayBuffer();
          const timeoutPromise = new Promise<never>((_, reject) => {
            setTimeout(
              () =>
                reject(
                  new Error("Audio buffer read timed out after 90 seconds")
                ),
              90000
            );
          });

          const arrayBuffer = await Promise.race([
            bufferPromise,
            timeoutPromise,
          ]);
          return Buffer.from(arrayBuffer);
        } finally {
          clearTimeout(timeoutId);
        }
      };

      const audioBuffer = await downloadWithTimeout(audioUrl, 120000); // 2 minute total timeout
      console.log(
        "[Musitron Processor] Audio buffer size:",
        audioBuffer.length
      );

      // Initialize Google Cloud Storage
      if (!process.env.GOOGLE_CLOUD_CREDENTIALS) {
        throw new Error(
          "GOOGLE_CLOUD_CREDENTIALS environment variable is not set"
        );
      }

      const credentials = JSON.parse(
        Buffer.from(process.env.GOOGLE_CLOUD_CREDENTIALS, "base64").toString()
      );
      console.log(
        "[Musitron Processor] GCS credentials loaded for project:",
        credentials.project_id
      );

      const storage = new Storage({
        projectId: credentials.project_id,
        credentials,
      });

      const bucketName =
        process.env.GCS_BUCKET_NAME_MUSITRON ||
        process.env.GCS_BUCKET_NAME ||
        "insturix-musitron";
      const bucket = storage.bucket(bucketName);
      console.log("[Musitron Processor] Using bucket:", bucketName);

      // Create file path
      const filePath = `${userId}/music/${taskId}.wav`;
      const file = bucket.file(filePath);
      console.log("[Musitron Processor] Uploading to path:", filePath);

      // Upload to GCS
      await file.save(audioBuffer, {
        metadata: {
          contentType: "audio/wav",
          metadata: {
            userId,
            taskId,
            title: task.title,
            style: task.style,
            duration: task.duration,
            generatedAt: new Date().toISOString(),
          },
        },
      });
      console.log("[Musitron Processor] File uploaded to GCS");

      // Make file publicly accessible
      console.log("[Musitron Processor] Generating signed URL...");
      const [signedUrl] = await file.getSignedUrl({
        version: "v4",
        action: "read",
        expires: Date.now() + 7 * 24 * 60 * 60 * 1000, // 7 days
      });
      console.log(
        "[Musitron Processor] Signed URL generated:",
        signedUrl.substring(0, 100) + "..."
      );

      // 5. Update task as completed
      await musicGenerations.updateOne(
        { _id: task._id },
        {
          $set: {
            status: "completed",
            gcs_url: signedUrl,
            gcsPath: filePath,
            falAiResult: falResult,
            completedAt: new Date(),
            updatedAt: new Date(),
            unread: false,
          },
        }
      );

      return NextResponse.json({
        success: true,
        taskId,
        status: "completed",
        audioUrl: signedUrl,
      });
    } catch (generationError) {
      // 6. Handle generation failure with refund
      console.error(
        "[Musitron Processor] Generation error caught:",
        generationError
      );

      const errorMessage =
        generationError instanceof Error
          ? generationError.message
          : "Music generation failed";

      // Update status to failed (MongoDB)
      await musicGenerations.updateOne(
        { _id: task._id },
        {
          $set: {
            status: "failed",
            error: {
              message: errorMessage,
              timestamp: new Date(),
            },
            updatedAt: new Date(),
          },
        }
      );

      // Refund credits
      try {
        await processRefund("musitron", "music_generation", userId, 1);
      } catch (refundError) {}

      return NextResponse.json(
        {
          success: false,
          error: "Music generation failed, credits refunded",
          taskId,
        },
        { status: 500 }
      );
    }
  } catch (error) {
    // Try to refund on catastrophic error
    try {
      if (userId) {
        await processRefund("musitron", "music_generation", userId, 1);
      }
    } catch (refundError) {}

    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}

// Add error handling for signature verification
// Only enable signature verification if QStash keys are available
const protectedHandler = process.env.QSTASH_CURRENT_SIGNING_KEY
  ? verifySignatureAppRouter(handler)
  : handler;

export const POST = async (req: Request) => {
  console.log("[Musitron Processor] POST route hit!");
  console.log(
    "[Musitron Processor] QSTASH_CURRENT_SIGNING_KEY:",
    process.env.QSTASH_CURRENT_SIGNING_KEY ? "set" : "not set"
  );
  try {
    return await protectedHandler(req);
  } catch (error) {
    console.error("Musitron processor signature verification failed:", error);

    // Try to extract taskId and userId from request for error reporting
    let taskId: string | undefined;
    let userId: string | undefined;
    try {
      const body = await req.json();
      taskId = body.taskId;
      userId = body.userId;
    } catch (bodyError) {
      console.error(
        "Musitron processor: Failed to parse request body for error reporting:",
        bodyError
      );
    }

    // If we have userId, try to refund
    if (userId) {
      try {
        await processRefund("musitron", "music_generation", userId, 1);
        console.log("Refund processed successfully for user:", userId);
      } catch (refundError) {
        console.error(
          "Failed to process refund for user:",
          userId,
          refundError
        );
      }
    }

    return NextResponse.json(
      { error: "Signature verification failed" },
      { status: 401 }
    );
  }
};

export const runtime = "nodejs";
export const maxDuration = 300; // 5 minutes - needed for Fal AI generation + audio download + GCS upload
