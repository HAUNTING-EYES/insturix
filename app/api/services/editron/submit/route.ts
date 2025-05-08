import { NextRequest, NextResponse } from "next/server";
import { getTasksCollection } from "@/lib/editron-mongo";
// EditronTask type might be needed if we store the task locally as well,
// but the current logic only calls the external API.
// import { EditronTask } from "@/lib/types";
import { auth } from "@clerk/nextjs/server"; // Import Clerk auth

// Read the Python API URL from environment variables
const EDITRON_BACKEND_URL = process.env.EDITRON_BACKEND_URL;

export async function POST(req: NextRequest) {
  // Check if the environment variable is set
  if (!EDITRON_BACKEND_URL) {
    console.error("EDITRON_BACKEND_URL environment variable is not set.");
    return NextResponse.json(
      { error: "Server configuration error" },
      { status: 500 }
    );
  }

  try {
    // Use Clerk authentication
    const { userId } = await auth();
    if (!userId) {
      return NextResponse.json(
        { error: "User authentication required" },
        { status: 401 }
      );
    }

    const body = await req.json();
    const youtube_url = body.youtube_url;

    // Validate input
    if (!youtube_url || typeof youtube_url !== "string") {
      return NextResponse.json(
        { error: "youtube_url (string) is required in the request body" },
        { status: 400 }
      );
    }

    // --- Rate Limiting (Using Clerk userId) ---
    const tasksCol = await getTasksCollection();
    // Query using the Clerk user ID (assuming field name is 'user_id' matching Clerk userId)
    const lastTask = await tasksCol
      .find({ user_id: userId })
      .sort({ created_at: -1 })
      .limit(1)
      .next();

    if (lastTask) {
      const lastCreated = new Date(lastTask.created_at);
      const now = new Date();
      const diffMs = now.getTime() - lastCreated.getTime();
      const twentyFourHoursMs = 24 * 60 * 60 * 1000;

      if (diffMs < twentyFourHoursMs) {
        const nextAllowed = new Date(lastCreated.getTime() + twentyFourHoursMs);
        return NextResponse.json(
          {
            error:
              "Rate limit exceeded. Only 1 task submission per 24 hours is allowed.",
            next_allowed_at: nextAllowed.toISOString(),
          },
          { status: 429 } // Too Many Requests
        );
      }
    }
    // --- End Rate Limiting ---

    // --- Call External Python API ---
    const targetUrl = `${EDITRON_BACKEND_URL}/api/v1/autoshorts/`;
    console.log(`Submitting task for user ${userId} to ${targetUrl}`); // Use Clerk userId for logging

    let pythonResponse;
    try {
      pythonResponse = await fetch(targetUrl, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          // Add any other required headers, like an API key if needed
          // 'Authorization': `Bearer ${process.env.PYTHON_API_KEY}`
        },
        // Send Clerk userId as user_id to Python backend
        body: JSON.stringify({ youtube_url, user_id: userId }),
      });
    } catch (networkError: Error | unknown) {
      console.error("Network error calling Python API:", networkError);
      return NextResponse.json(
        { error: "Failed to connect to the processing service" },
        { status: 503 } // Service Unavailable
      );
    }

    // --- Handle Python API Response ---
    const responseStatus = pythonResponse.status;
    let responseData;
    try {
      // Try to parse JSON, but handle cases where the body might be empty or not JSON
      const text = await pythonResponse.text();
      if (text) {
        responseData = JSON.parse(text);
      }
    } catch (parseError) {
      console.error(
        `Failed to parse JSON response from Python API (Status: ${responseStatus}):`,
        parseError
      );
      // Don't necessarily fail here, maybe the status code is enough
    }

    if (responseStatus === 201) {
      // Task accepted by Python API
      const task_id = responseData?.task_id;
      if (!task_id) {
        console.error("Python API returned 201 but no task_id");
        return NextResponse.json(
          { error: "Processing service returned an invalid response" },
          { status: 500 }
        );
      }
      // Optionally: Store the task_id and initial status in MongoDB here if needed
      console.log(`Task submitted successfully. Task ID: ${task_id}`);
      return NextResponse.json({ task_id }, { status: 201 });
    } else if (responseStatus >= 400 && responseStatus < 500) {
      // Client error from Python API (e.g., bad URL, validation error)
      const errorMessage =
        responseData?.detail || "Invalid request to processing service";
      console.error(
        `Python API returned client error (${responseStatus}): ${errorMessage}`
      );
      return NextResponse.json(
        { error: errorMessage },
        { status: responseStatus } // Forward the client error status
      );
    } else {
      // Server error from Python API or unexpected status
      const errorMessage = responseData?.detail || "Processing service failed";
      console.error(
        `Python API returned server error (${responseStatus}): ${errorMessage}`
      );
      return NextResponse.json(
        { error: "The processing service encountered an error" },
        { status: 502 } // Bad Gateway
      );
    }
  } catch (error: Error | unknown) {
    // Catch-all for unexpected errors in this route handler
    console.error("Unexpected error in Editron submit route:", error);
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "An internal server error occurred",
      },
      { status: 500 }
    );
  }
}
