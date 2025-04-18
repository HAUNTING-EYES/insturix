import { NextResponse } from "next/server";
import { headers } from "next/headers";
import { auth } from "@clerk/nextjs/server";
import User from "@/schemas/user";
import ApiUsage from "@/schemas/apiUsage";
import connectToDatabase from "@/schemas/ConnectToDatabase";

const SUNO_API_KEY = process.env.SUNO_API_KEY;

// Define user types to match the enum in the schema
enum UserType {
  Free = "Free",
  Pro = "Pro",
  Premium = "Premium",
  Ultra = "Ultra",
  Exclusive = "Exclusive",
}

// Rate limits by user type
const RATE_LIMITS: Record<UserType, number> = {
  Free: 1,
  Pro: 2,
  Premium: 3,
  Ultra: 4,
  Exclusive: 5,
};

const SERVICE_NAME = "musitron";

if (!SUNO_API_KEY) {
  throw new Error("SUNO_API_KEY environment variable is not set");
}
const SUNO_API_URL = process.env.SUNO_URI as string;
const SUNO_GENERATE_URL = `${SUNO_API_URL}/generate`;

export async function POST(req: Request) {
  try {
    // Get user authentication
    const { userId } = await auth();
    if (!userId) {
      return NextResponse.json(
        { error: "Authentication required" },
        { status: 401 }
      );
    }

    // Connect to database
    await connectToDatabase(process.env.MONGODB_URI as string);

    // Get user from database
    const user = await User.findOne({ clerkUserId: userId });
    if (!user) {
      return NextResponse.json({ error: "User not found" }, { status: 404 });
    }

    // Get user's rate limit based on user type
    const rateLimit =
      RATE_LIMITS[user.userType as UserType] || RATE_LIMITS.Free;

    // Check if monthly usage has reset
    const now = new Date();

    // Get or create usage record
    let usage = await ApiUsage.findOne({
      clerkUserId: userId,
      service: SERVICE_NAME,
    });

    if (!usage) {
      usage = new ApiUsage({
        clerkUserId: userId,
        service: SERVICE_NAME,
        usageCount: 0,
        lastUsed: now,
        resetDate: new Date(now.getFullYear(), now.getMonth() + 1, 1),
      });
    } else if (usage.resetDate < now) {
      // Reset usage count if we're in a new month
      usage.usageCount = 0;
      usage.resetDate = new Date(now.getFullYear(), now.getMonth() + 1, 1);
    }

    // Check if user has exceeded their rate limit
    if (usage.usageCount >= rateLimit) {
      return NextResponse.json(
        {
          error: "Rate limit exceeded",
          limit: rateLimit,
          userType: user.userType,
          usage: usage.usageCount,
          resetDate: usage.resetDate,
          upgrade: user.userType !== "Exclusive" ? true : false,
        },
        { status: 429 }
      );
    }

    const body = await req.json();
    const headersList = await headers();
    const host = headersList.get("host");
    const protocol = process.env.NODE_ENV === "development" ? "http" : "https";
    const callbackUrl = `${protocol}://${host}/api/services/musitron/callback`;
    const payload = {
      prompt: body.customMode ? body.lyrics : body.songDescription,
      style: body.customMode ? body.style : "",
      title: body.title,
      customMode: body.customMode,
      instrumental: body.instrumental,
      model: "V3_5",
      negativeTags: body.style || "",
      callbackUrl: callbackUrl,
    };
    const response = await fetch(SUNO_GENERATE_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${SUNO_API_KEY}`,
        Accept: "application/json",
      },
      body: JSON.stringify(payload),
    });
    const data = await response.json();
    if (data.code === 401) {
      return NextResponse.json(
        { error: "Authentication failed. Please check your API key." },
        { status: 401 }
      );
    }
    if (!response.ok || data.code !== 200) {
      const errorMessage = data.msg || "Failed to generate music";
      return NextResponse.json(
        { error: errorMessage },
        { status: response.status }
      );
    }
    if (data.data?.taskId || data.data?.task_id) {
      // Update usage count and save
      usage.usageCount += 1;
      usage.lastUsed = now;
      await usage.save();

      // Return successful response with task ID
      return NextResponse.json({
        taskId: data.data.taskId || data.data.task_id,
        message: data.msg || "Music generation started",
        remainingRequests: rateLimit - usage.usageCount,
        userType: user.userType,
      });
    }

    return NextResponse.json(
      { error: "No task ID received from API" },
      { status: 500 }
    );
  } catch (error) {
    console.error("Error generating music:", error);
    return NextResponse.json(
      { error: "Failed to generate music" },
      { status: 500 }
    );
  }
}
