import { NextResponse } from "next/server";
import { auth, clerkClient } from "@clerk/nextjs/server";
import { ObjectId } from "mongodb";
import { getMusitronCollections } from "@/lib/services/musitron-mongo";
import { Client } from "@upstash/qstash";
import { checkCredits } from "@/lib/services/creditsMiddleware";
import { z } from "zod";

function createQstashClient(): Client {
  const token = process.env.QSTASH_TOKEN?.trim();
  if (!token) throw new Error("QSTASH_TOKEN environment variable is not set");
  const qstashBaseUrl =
    process.env.NODE_ENV === "development"
      ? "http://127.0.0.1:8080"
      : undefined;
  return new Client({ token, baseUrl: qstashBaseUrl });
}

const MUSITRON_MODELS = [
  "fal-ai/stable-audio/v2.5",
  "sonauto/v2/text-to-music",
  "fal-ai/minimax-music/v2",
  "fal-ai/ace-step/prompt-to-audio",
] as const;

const generateSchema = z
  .object({
    title: z.string().min(1),
    instrumental: z.boolean(),
    style: z.string().min(1),
    lyrics: z.string().optional(),
    duration: z.number().min(5).max(240).default(30),
    model: z.enum(MUSITRON_MODELS),
  })
  .superRefine((data, ctx) => {
    if (!data.instrumental && data.model !== "fal-ai/stable-audio/v2.5") {
      if (!data.lyrics || data.lyrics.trim().length === 0) {
        ctx.addIssue({
          path: ["lyrics"],
          code: z.ZodIssueCode.custom,
          message: "Lyrics are required when instrumental is false",
        });
      }
    }
  });


export async function POST(req: Request) {
  const { userId, orgId } = await auth();
  if (!userId) {
    return new NextResponse("Unauthorized", { status: 401 });
  }

  const body = await req.json();
  const parsed = generateSchema.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.flatten() },
      { status: 400 }
    );
  }
  const {
    title,
    instrumental,
    style,
    lyrics = "",
    duration = 30,
    model,
  } = parsed.data;

  let qstash: Client;
  try {
    qstash = createQstashClient();
  } catch (error) {
    console.error("[Musitron Generate] QStash is unavailable:", error);
    return NextResponse.json(
      {
        success: false,
        error: {
          type: "QUEUE_UNAVAILABLE",
          message: "Music generation is temporarily unavailable",
        },
      },
      { status: 503 },
    );
  }

  // Check credits (dynamic based on model)
  const creditCheck = await checkCredits(userId, "musitron", "music_generation", {
    model,
  });
  if (!creditCheck.allowed) {
    return creditCheck.errorResponse;
  }

  try {
    // Deduct credits before processing
    await creditCheck.deduct();

    // Get creator name for org context display
    let createdByName: string | undefined;
    if (orgId) {
      try {
        const client = await clerkClient();
        const user = await client.users.getUser(userId);
        createdByName = user.firstName 
          ? `${user.firstName}${user.lastName ? ' ' + user.lastName : ''}`
          : user.username || user.emailAddresses[0]?.emailAddress?.split('@')[0] || 'Unknown';
      } catch (e) {
        console.error('[Musitron] Failed to get user name:', e);
      }
    }

    // Create task in MongoDB
    const { musicGenerations } = await getMusitronCollections();
    const taskId = new ObjectId();

    const taskData = {
      _id: taskId,
      clerkUserId: userId,
      orgId: orgId || undefined,  // Store org context (undefined = personal)
      createdByName,  // Store creator name for org display
      title: title.trim(),
      style: style.trim(),
      model: model,
      instrumental_only: instrumental,
      lyrics: instrumental ? "[inst]" : lyrics.trim(),
      duration: duration,
      status: "listed",
      unread: true,
      createdAt: new Date(),
      updatedAt: new Date(),
      taskId: taskId.toString(),
    };

    await musicGenerations.insertOne(taskData);

    // Publish to QStash
    const baseUrl = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";
    const processorUrl = `${baseUrl}/api/services/musitron/processor`;

    console.log("[Musitron Generate] Publishing to QStash:", {
      processorUrl,
      taskId: taskId.toString(),
      userId,
    });

    const qstashResult = await qstash.publishJSON({
      url: processorUrl,
      body: {
        taskId: taskId.toString(),
        userId: userId,
        title: title.trim(),
        style: style.trim(),
        model: model.trim(),
        instrumental: instrumental,
        lyrics: instrumental ? "[inst]" : lyrics.trim(),
        duration: duration,
      },
      retries: 1,
    });

    console.log("[Musitron Generate] QStash publish result:", qstashResult);

    return NextResponse.json({
      success: true,
      taskId: taskId.toString(),
    });
  } catch (error) {
    // Refund credits on failure
    await creditCheck.refund("Music generation task failed to queue");

    return NextResponse.json(
      {
        success: false,
        error: {
          type: "TASK_CREATION_ERROR",
          message: "Failed to queue music generation",
        },
      },
      { status: 500 }
    );
  }
}
