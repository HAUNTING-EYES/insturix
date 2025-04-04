import { NextResponse } from "next/server";
import { headers } from "next/headers";

const SUNO_API_KEY = process.env.SUNO_API_KEY;

if (!SUNO_API_KEY) {
  throw new Error("SUNO_API_KEY environment variable is not set");
}
const SUNO_API_URL = process.env.SUNO_URI as string;
const SUNO_GENERATE_URL = `${SUNO_API_URL}/generate`;

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const headersList = await headers();
    const host = headersList.get("host");
    const protocol = process.env.NODE_ENV === "development" ? "http" : "https";
    const callbackUrl = `${protocol}://${host}/api/services/musicotron/callback`;
    const payload = {
      prompt: body.customMode ? body.lyrics : body.songDescription,
      style: body.customMode ? body.style : "",
      title: body.customMode ? body.title : "Generated Song",
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
      return NextResponse.json({
        taskId: data.data.taskId || data.data.task_id,
        message: data.msg || "Music generation started",
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
