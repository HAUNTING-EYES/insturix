// GET /api/services/editron/history
import { NextRequest, NextResponse } from "next/server";
import { getTasksCollection } from "@/lib/editron-mongo";
import { EditronTask, EditronTaskResult } from "@/lib/types"; // Import EditronTaskResult
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


export async function GET(req: NextRequest) {
  let userId: string | null = null; // Declare userId outside try block
  try {
    // Use Clerk authentication
    const authResult = await auth();
    userId = authResult.userId; // Assign value inside try block
    if (!userId) {
      return NextResponse.json(
        { error: "User authentication required" },
        { status: 401 }
      );
    }
    console.log(`[History API] Fetching history for userId: ${userId}`); // Log userId

    const tasksCol = await getTasksCollection();
    // Query using the Clerk user ID (assuming field name is 'clerkUserId' or similar)
    // If the field name is different in your EditronTask schema, adjust accordingly.
    const tasksCursor = tasksCol
      .find({ user_id: userId }) // Assuming user_id in MongoDB matches Clerk's userId
      .sort({ created_at: -1 });
    const tasksArray = await tasksCursor.toArray(); // Fetch all tasks first
    console.log(`[History API] Found ${tasksArray.length} tasks in DB for user ${userId}`); // Log initial count

    // Initialize GCS client once if needed
    let storage: Storage | null = null;
    const bucketName = process.env.EDITRON_GCS_BUCKET_NAME;
    const expires = Date.now() + 15 * 60 * 1000; // 15 minutes expiry

    // Process tasks to add signed URLs
    const processedTasks = await Promise.all(
      tasksArray.map(async (taskDoc): Promise<EditronTask> => {
        // Cast the document from MongoDB to EditronTask type
        const task = taskDoc as unknown as EditronTask;

        // Check if task needs signed URLs
        if (task.status === "COMPLETED" && task.result?.gcsUrl && bucketName) {
          try {
            // Initialize storage client if not already done, using specific keyfile if available
            if (!storage) {
               const options = getGcsCredentialsOptions();
               storage = new Storage(options); // Pass { keyFilename: path } or undefined
            }

            const gcsUrls = Array.isArray(task.result.gcsUrl)
              ? task.result.gcsUrl
              : [task.result.gcsUrl];

            const signedUrls = [];

            for (const url of gcsUrls) {
               const expectedPrefix = `https://storage.googleapis.com/${bucketName}/`;
               if (typeof url !== 'string' || !url.startsWith(expectedPrefix)) {
                  console.warn(`[History] Skipping URL with unexpected format for task ${task._id}: ${url}. Expected prefix: ${expectedPrefix}`);
                  continue;
               }
               // Extract object name from HTTPS URL
               const objectName = url.substring(expectedPrefix.length);
                if (!objectName) {
                   console.warn(`[History] Could not extract object name from HTTPS URL for task ${task._id}: ${url}`);
                   continue;
               }
               console.log(`[History] Extracted object name: ${objectName} from URL: ${url}`); // Log extracted name
               const file = storage.bucket(bucketName).file(objectName);

               try {
                   // Generate playback URL
                   const [playableUrl] = await file.getSignedUrl({
                     action: "read",
                     expires,
                   });

                   // Generate download URL
                   const filename = objectName.split('/').pop() || 'generated_video.mp4';
                   const [downloadUrl] = await file.getSignedUrl({
                     action: "read",
                     expires,
                     responseDisposition: `attachment; filename="${filename}"`,
                   });

                   signedUrls.push({ playableUrl, downloadUrl });
               } catch (signError: any) {
                   console.error(`[History] Error generating signed URL for ${objectName} in task ${task._id}:`, signError);
                   // Skip this URL on error
               }
            }

            // If signed URLs were generated, modify the task object
            if (signedUrls.length > 0) {
              // Create a new task object to avoid modifying the original array reference directly
              // Ensure the result object conforms to EditronTaskResult
              const newResult: EditronTaskResult = { ...task.result };
              delete newResult.gcsUrl; // Remove original GCS URL(s)
              newResult.signedUrls = signedUrls; // Add signed URLs

              const newTask: EditronTask = {
                 ...task,
                 result: newResult,
              };
              return newTask; // Return the modified task
            } else if (gcsUrls.length > 0) {
                console.warn(`[History] No signed URLs generated for task ${task._id}, returning original data.`);
                // Optionally remove gcsUrl even if generation failed
                const newResult: EditronTaskResult = { ...task.result };
                delete newResult.gcsUrl;
                const newTask: EditronTask = {
                    ...task,
                    result: newResult,
                };
                return newTask;
            }
          } catch (gcsError: any) {
            console.error(`[History] Error during GCS operations for task ${task._id}:`, gcsError);
            // Return the original task if there's a broader GCS error
          }
        }
        // Return the task unmodified if no processing was needed or if errors occurred
        return task;
      })
    );

     if (!bucketName) {
        console.error("[History] EDITRON_GCS_BUCKET_NAME environment variable is not set. Signed URLs cannot be generated for completed tasks.");
     }
     console.log(`[History API] Returning ${processedTasks.length} processed tasks for user ${userId}`); // Log final count
 
     return NextResponse.json(
       { tasks: processedTasks }, // Return the processed tasks
       { status: 200 }
     );
   } catch (err: any) {
     console.error(`[History API] Error fetching history for user ${userId || 'UNKNOWN'}:`, err); // Log errors
     return NextResponse.json(
      { error: err.message || "Internal server error" },
      { status: 500 }
    );
  }
}