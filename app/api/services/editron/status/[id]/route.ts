import { NextRequest, NextResponse } from "next/server";
import { getTasksCollection } from "@/lib/editron-mongo";
import { Storage } from "@google-cloud/storage";
import { auth } from "@clerk/nextjs/server";

// Helper function to get GCS credentials options from env var
function getGcsCredentialsOptions(): { keyFilename: string } | undefined {
  const keyFilename = process.env.EDITRON_SECRET_KEY_JSON;
  if (!keyFilename) {
    console.warn(
      "[GCS Creds] EDITRON_SECRET_KEY_JSON (path to key file) not set. Falling back to Application Default Credentials."
    );
    return undefined;
  }
  console.log(
    `[GCS Creds] Using keyFilename from EDITRON_SECRET_KEY_JSON: ${keyFilename}`
  );
  return { keyFilename };
}

const TIMEOUT_MINUTES = 20;

// NextJS 15 App Router Route Handler
export async function GET(
  req: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const { userId } = await auth();
    if (!userId) {
      return NextResponse.json(
        { error: "User authentication required" },
        { status: 401 }
      );
    }

    const { id } = await context.params;
    if (!id) {
      return NextResponse.json({ error: "Task ID required" }, { status: 400 });
    }

    const tasksCol = await getTasksCollection();
    const task = await tasksCol.findOne({ _id: id });

    if (!task) {
      return NextResponse.json({ error: "Task not found" }, { status: 404 });
    }

    if (task.user_id !== userId) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    // Timeout logic for QUEUED/PROCESSING
    if (task.status === "QUEUED" || task.status === "PROCESSING") {
      const now = new Date();
      const updated = task.updated_at
        ? new Date(task.updated_at)
        : new Date(task.created_at);
      const created = new Date(task.created_at);
      const refTime =
        updated && updated.getTime() !== created.getTime() ? updated : created;
      const diffMs = now.getTime() - refTime.getTime();
      if (diffMs > TIMEOUT_MINUTES * 60 * 1000) {
        await tasksCol.updateOne(
          { _id: id },
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

    // Define the structure of task result
    interface TaskResult {
      gcsUrl?: string | string[];
      signedUrls?: Array<{ playableUrl: string; downloadUrl: string }>;
      [key: string]: unknown;
    }

    interface ResponsePayload {
      status: string;
      result?: TaskResult;
      error?: {
        code: string;
        message: string;
      };
    }

    const responsePayload: ResponsePayload = {
      status: task.status,
      result: task.result,
      error:
        task.error && task.error.code && task.error.message
          ? { code: task.error.code, message: task.error.message }
          : undefined,
    };

    // Generate signed URLs if task is completed and has GCS URL(s)
    if (task.status === "COMPLETED" && task.result?.gcsUrl) {
      try {
        const options = getGcsCredentialsOptions();
        const storage = new Storage(options);
        const bucketName = process.env.EDITRON_GCS_BUCKET_NAME;
        if (!bucketName) {
          console.error(
            "EDITRON_GCS_BUCKET_NAME environment variable is not set."
          );
        } else {
          const gcsUrls = Array.isArray(task.result.gcsUrl)
            ? task.result.gcsUrl
            : [task.result.gcsUrl];

          const signedUrls = [];
          const expires = Date.now() + 15 * 60 * 1000; // 15 minutes

          for (const url of gcsUrls) {
            const expectedPrefix = `https://storage.googleapis.com/${bucketName}/`;
            if (typeof url !== "string" || !url.startsWith(expectedPrefix)) {
              console.warn(
                `[Status] Skipping URL with unexpected format for task ${task._id}: ${url}. Expected prefix: ${expectedPrefix}`
              );
              continue;
            }

            const objectName = url.substring(expectedPrefix.length);
            if (!objectName) {
              console.warn(
                `[Status] Could not extract object name from HTTPS URL for task ${task._id}: ${url}`
              );
              continue;
            }

            console.log(
              `[Status] Extracted object name: ${objectName} from URL: ${url}`
            );
            const file = storage.bucket(bucketName).file(objectName);

            try {
              const [playableUrl] = await file.getSignedUrl({
                action: "read",
                expires,
              });

              const filename =
                objectName.split("/").pop() || "generated_video.mp4";
              const [downloadUrl] = await file.getSignedUrl({
                action: "read",
                expires,
                responseDisposition: `attachment; filename="${filename}"`,
              });

              signedUrls.push({ playableUrl, downloadUrl });
            } catch (signError) {
              console.error(
                `Error generating signed URL for ${objectName}:`,
                signError
              );
            }
          }

          if (signedUrls.length > 0) {
            const newResult = { ...task.result };
            delete newResult.gcsUrl;
            newResult.signedUrls = signedUrls;
            responsePayload.result = newResult;
          } else if (gcsUrls.length > 0) {
            console.warn(
              `No signed URLs could be generated for task ${task._id}`
            );
          }
        }
      } catch (gcsError) {
        console.error(
          `Error during GCS operations for task ${task._id}:`,
          gcsError
        );
      }
    }

    return NextResponse.json(responsePayload, { status: 200 });
  } catch (err) {
    const errorMessage =
      err instanceof Error ? err.message : "Internal server error";
    return NextResponse.json({ error: errorMessage }, { status: 500 });
  }
}
