// GET /api/services/editron/status/[id]
import { NextRequest, NextResponse } from "next/server";
import { getTasksCollection } from "@/lib/editron-mongo";
import { EditronTask } from "@/lib/types";
import { Storage } from "@google-cloud/storage"; // Import GCS Storage
import { auth } from "@clerk/nextjs/server"; // Import Clerk auth

// Helper function to get GCS credentials options from env var
function getGcsCredentialsOptions(): { keyFilename: string } | undefined {
  const keyFilename = process.env.EDITRON_SECRET_KEY_JSON;
  if (!keyFilename) {
    console.warn("[GCS Creds] EDITRON_SECRET_KEY_JSON (path to key file) not set. Falling back to Application Default Credentials.");
    return undefined;
  }
  // Assume the env var contains the path to the key file
  console.log(`[GCS Creds] Using keyFilename from EDITRON_SECRET_KEY_JSON: ${keyFilename}`);
  return { keyFilename };
}

const TIMEOUT_MINUTES = 20;

// Define the context type including params
interface RouteContext {
  params: { id: string };
}

export async function GET(
  req: NextRequest,
  context: RouteContext // Use context object
) {
  try {
    // Use Clerk authentication
    const { userId } = await auth();
    if (!userId) {
      return NextResponse.json(
        { error: "User authentication required" },
        { status: 401 }
      );
    }

    const task_id = context.params.id; // Access id via context.params.id
    if (!task_id) {
      return NextResponse.json(
        { error: "Task ID required" },
        { status: 400 }
      );
    }

    const tasksCol = await getTasksCollection();
    const task = await tasksCol.findOne({ _id: task_id });

    if (!task) {
      return NextResponse.json(
        { error: "Task not found" },
        { status: 404 }
      );
    }

    // Check if the task belongs to the authenticated user
    if (task.user_id !== userId) {
      return NextResponse.json(
        { error: "Forbidden" },
        { status: 403 } // Use 403 Forbidden for authorization errors
      );
    }

    // Timeout logic for QUEUED/PROCESSING
    if (
      (task.status === "QUEUED" || task.status === "PROCESSING")
    ) {
      const now = new Date();
      const updated = task.updated_at ? new Date(task.updated_at) : new Date(task.created_at);
      const created = new Date(task.created_at);
      const refTime =
        updated && updated.getTime() !== created.getTime()
          ? updated
          : created;
      const diffMs = now.getTime() - refTime.getTime();
      if (diffMs > TIMEOUT_MINUTES * 60 * 1000) {
        // Mark as FAILED (timeout) in DB
        await tasksCol.updateOne(
          { _id: task_id },
          {
            $set: {
              status: "FAILED",
              error: {
                code: "TIMEOUT",
                message: "Task timed out after 20 minutes.",
              },
              updated_at: now,
            },
          }
        );
        return NextResponse.json(
          {
            status: "FAILED",
            error: {
              code: "TIMEOUT",
              message: "Task timed out after 20 minutes.",
            },
          },
          { status: 200 }
        );
      }
    }

    let responsePayload: any = {
      status: task.status,
      result: task.result,
      error: task.error,
    };

    // Generate signed URLs if task is completed and has GCS URL(s)
    if (task.status === "COMPLETED" && task.result?.gcsUrl) {
      try {
        // Initialize storage client using specific keyfile if available
        const options = getGcsCredentialsOptions();
        const storage = new Storage(options); // Pass { keyFilename: path } or undefined
        const bucketName = process.env.EDITRON_GCS_BUCKET_NAME;
        if (!bucketName) {
          // Log the error but don't fail the request, just return without signed URLs
          console.error("EDITRON_GCS_BUCKET_NAME environment variable is not set.");
        } else {
          const gcsUrls = Array.isArray(task.result.gcsUrl)
            ? task.result.gcsUrl
            : [task.result.gcsUrl];

          const signedUrls = [];
          const expires = Date.now() + 15 * 60 * 1000; // 15 minutes

          for (const url of gcsUrls) {
             // Basic validation: ensure it's a string and starts with https://storage.googleapis.com/<bucket>/
             const expectedPrefix = `https://storage.googleapis.com/${bucketName}/`;
             if (typeof url !== 'string' || !url.startsWith(expectedPrefix)) {
                console.warn(`[Status] Skipping URL with unexpected format for task ${task._id}: ${url}. Expected prefix: ${expectedPrefix}`);
                continue; // Skip if not a valid HTTPS GCS URL for the configured bucket
             }
             // Extract object name from HTTPS URL
             const objectName = url.substring(expectedPrefix.length);
             if (!objectName) {
                console.warn(`[Status] Could not extract object name from HTTPS URL for task ${task._id}: ${url}`);
                continue; // Skip if object name is empty
             }
             console.log(`[Status] Extracted object name: ${objectName} from URL: ${url}`); // Log extracted name
             const file = storage.bucket(bucketName).file(objectName);

             try {
                 // Generate playback URL
                 const [playableUrl] = await file.getSignedUrl({
                   action: "read",
                   expires,
                 });

                 // Generate download URL
                 // Attempt to extract a filename, default to 'generated_video.mp4'
                 const filename = objectName.split('/').pop() || 'generated_video.mp4';
                 const [downloadUrl] = await file.getSignedUrl({
                   action: "read",
                   expires,
                   responseDisposition: `attachment; filename="${filename}"`,
                 });

                 signedUrls.push({ playableUrl, downloadUrl });
             } catch (signError: any) {
                 console.error(`Error generating signed URL for ${objectName}:`, signError);
                 // Decide how to handle partial failures: skip this URL or fail the whole request?
                 // Here, we skip the URL and continue with others.
             }
          }

          // Modify the response payload only if signed URLs were generated
          if (signedUrls.length > 0) {
              // Create a new result object without gcsUrl and add signedUrls
              const newResult = { ...task.result };
              delete newResult.gcsUrl;
              newResult.signedUrls = signedUrls;
              responsePayload.result = newResult;
          } else if (gcsUrls.length > 0) {
              // If there were input URLs but none resulted in signed URLs (e.g., all invalid/failed)
              // Log this situation. Depending on requirements, you might want to clear the original gcsUrl.
              console.warn(`No signed URLs could be generated for task ${task._id}`);
              // Optionally clear the original gcsUrl from the response:
              // const newResult = { ...task.result };
              // delete newResult.gcsUrl;
              // responsePayload.result = newResult;
          }
        }

      } catch (gcsError: any) {
        console.error(`Error during GCS operations for task ${task._id}:`, gcsError);
        // Log the error but return the original task data.
        // Consider adding specific error info to the response if needed.
      }
    }

    // Return current status/result/error (potentially modified with signed URLs)
    return NextResponse.json(responsePayload, { status: 200 });

  } catch (err: any) {
    return NextResponse.json(
      { error: err.message || "Internal server error" },
      { status: 500 }
    );
  }
}