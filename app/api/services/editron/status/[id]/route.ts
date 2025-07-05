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
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  req: NextRequest,
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  context: { params: Promise<{ id: string }> }
) {
  return NextResponse.json(
    { message: "Editron status is coming soon" },
    { status: 404 }
  );
}
