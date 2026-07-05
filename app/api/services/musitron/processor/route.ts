import { verifySignatureAppRouter } from "@upstash/qstash/nextjs";
import { NextResponse } from "next/server";
import { getMusitronCollections } from "@/lib/services/musitron-mongo";
import { ObjectId } from "mongodb";
import { CreditsService } from "@/lib/services/creditsService";
import { getCreditCost } from "@/lib/config/creditCosts";
import { Storage } from "@google-cloud/storage";
import { fal } from "@fal-ai/client"; // Note: named import instead of default import
import { recordProviderCostEvent, type ProviderCostEventStatus } from "@/lib/financials/provider-cost-events";

async function recordMusitronProviderCost(input: {
  status: ProviderCostEventStatus;
  userId?: string;
  taskId?: string;
  model?: string;
  durationSec?: number;
  bytesOut?: number;
  functionMs?: number;
  error?: unknown;
}): Promise<void> {
  await recordProviderCostEvent({
    eventId: `pce_musitron_${input.taskId ?? "unknown"}_${input.status}`,
    idempotencyKey: input.taskId ? `musitron:music:${input.taskId}:${input.status}` : undefined,
    status: input.status,
    userId: input.userId,
    taskId: input.taskId,
    service: "musitron",
    action: "music_generation",
    route: "/api/services/musitron/processor",
    provider: "fal-ai",
    model: input.model,
    operation: "music_generation",
    units: {
      mediaSeconds: input.durationSec,
      bytesOut: input.bytesOut,
      requestCount: 1,
      functionMs: input.functionMs,
    },
    metadata: {
      requestedDurationSeconds: input.durationSec,
      errorClass: input.error instanceof Error ? input.error.name : undefined,
    },
  });
}

async function handler(request: Request) {
  console.log("[Musitron Processor] Handler called!");

  let userId: string | undefined;
  let taskId: string | undefined;
  let model: string | undefined;

  try {
    const body = await request.json();
    console.log("[Musitron Processor] Received body:", {
      taskId: body?.taskId,
      userId: body?.userId,
      model: body?.model,
    });
    ({ taskId, userId } = body);
    model = body.model;

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
    const providerCostStartMs = Date.now();
    let requestedDurationSec: number | undefined;
    try {
      // ⬇️ ADD THIS CONFIGURATION LINE ⬇️
      fal.config({
        credentials: process.env.FAL_AI_API_KEY,
      });
      console.log(
        "[Musitron Processor] Starting Fal AI generation with model:",
        model
      );
      console.log(
        "[Musitron Processor] API Key present:",
        !!process.env.FAL_AI_API_KEY
      );

      // ⬆️ CONFIGURATION ADDED ⬆️

      // Build input based on model requirements
      let falInput: Record<string, any> = {};

      if (model.includes("ace-step")) {
        falInput = {
          prompt: `${task.style}. ${task.title}. ${!task.instrumental_only ? task.lyrics : ""}`,
          instrumental: task.instrumental_only,
          duration: Math.min(Math.max(task.duration || 60, 5), 240),
          number_of_steps: 27,
          scheduler: "euler",
          guidance_type: "apg",
          guidance_scale: 15,
        };
      } else if (model.includes("minimax-music")) {
        falInput = {
          prompt: `${task.style}. ${task.title}`,
          lyrics_prompt: task.instrumental_only ? "[instrumental]" : (task.lyrics || "[instrumental]"),
          audio_setting: { format: "mp3" },
        };
      } else if (model.includes("sonauto")) {
        falInput = {
          prompt: task.title,
          lyrics_prompt: task.instrumental_only ? "[instrumental]" : (task.lyrics || "[instrumental]"),
          prompt_strength: 2,
          balance_strength: 0.7,
          num_songs: 1,
          output_format: "mp3",
          bpm: "auto",
        };
      } else {
        falInput = {
          prompt: `${task.style}. ${task.title}. ${!task.instrumental_only ? task.lyrics : ""}`,
          instrumental: task.instrumental_only,
          seconds_total: Math.min(Math.max(task.duration, 5), 240),
          number_of_steps: 27,
          scheduler: "euler",
          guidance_type: "apg",
          guidance_scale: 15,
        };
      }

      requestedDurationSec =
        typeof falInput.duration === "number"
          ? falInput.duration
          : typeof falInput.seconds_total === "number"
            ? falInput.seconds_total
            : typeof task.duration === "number"
              ? task.duration
              : undefined;

      console.log("[Musitron Processor] Final Fal AI input summary:", {
        model,
        duration: requestedDurationSec,
        instrumental: falInput.instrumental ?? task.instrumental_only,
        hasLyricsPrompt: Boolean(falInput.lyrics_prompt),
      });

      const falResult = await fal.subscribe(model, {
        input: falInput,
      });
      console.log("[Musitron Processor] Fal AI SDK response received");

      // Get audio URL from Fal AI response
      // Some models return a single object, others (like Sonauto) return an array
      const audioUrl = falResult.data?.audio?.url || falResult.data?.audio?.[0]?.url;

      if (!audioUrl) {
        throw new Error("No audio URL in Fal AI response");
      }

      // 4. Upload to GCS
      console.log("[Musitron Processor] Starting GCS upload for generated audio");

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
      console.log("[Musitron Processor] Signed URL generated");

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

      await recordMusitronProviderCost({
        status: "success",
        userId,
        taskId,
        model,
        durationSec: requestedDurationSec,
        bytesOut: audioBuffer.length,
        functionMs: Date.now() - providerCostStartMs,
      });
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

      // Determine correct refund amount based on model
      const refundAmount = getCreditCost("musitron", "music_generation", { 
        model: task.model || model 
      });


      const errorMessage = (() => {
        if (generationError instanceof Error) {
          const msg = generationError.message;
          // Check for 404 (model not found/deprecated)
          if (msg.includes("Not Found") || (generationError as any).status === 404) {
            return `Model unavailable: The selected AI model may be deprecated or temporarily offline. Please try a different model.`;
          }
          if (msg.includes("ECONNREFUSED") || msg.includes("fetch failed")) {
            return "Network error: Failed to connect to generation service. Please try again later.";
          }
          if (msg.includes("timeout") || msg.includes("timed out")) {
            return "Task timed out during generation or download. The file might be too large.";
          }
          if (msg.includes("FAL_AI_API_KEY")) {
            return "Configuration error: Missing API Key.";
          }
          if (msg.includes("GCS") || msg.includes("bucket")) {
            return "Storage error: Failed to upload generated music.";
          }
          // Do not leak raw errors to the user
          return "Music generation failed due to an unexpected server error.";
        }
        return "Music generation failed due to an unexpected error.";
      })();

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

      await recordMusitronProviderCost({
        status: "failed",
        userId,
        taskId,
        model,
        durationSec: requestedDurationSec,
        functionMs: Date.now() - providerCostStartMs,
        error: generationError,
      });
      // Refund the same model-aware Musitron generation cost that was charged.
      try {
        await CreditsService.refundCredits(userId, refundAmount, "Music generation failed", {
          service: "musitron",
          action: "music_generation",
        });
      } catch (refundError) {
        console.error("[Musitron Processor] Refund failed:", refundError);
      }

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
        await CreditsService.refundCredits(userId, getCreditCost("musitron", "music_generation", { model }), "Internal server error during music generation", {
          service: "musitron",
          action: "music_generation",
        });
      }
    } catch (refundError) {
      console.error('[Musitron] Failed to refund credits after catastrophic error:', refundError);
    }

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
    let model: string | undefined;
    try {
      const body = await req.json();
      taskId = body.taskId;
      userId = body.userId;
      model = body.model;
    } catch (bodyError) {
      console.error(
        "Musitron processor: Failed to parse request body for error reporting:",
        bodyError
      );
    }

    // If we have userId, try to refund
    if (userId) {
      try {
        await CreditsService.refundCredits(userId, getCreditCost("musitron", "music_generation", { model }), "Signature verification failed", {
          service: "musitron",
          action: "music_generation",
        });
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
