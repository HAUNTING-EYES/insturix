import { NextRequest, NextResponse } from "next/server";
import { getTasksCollection } from "@/lib/editron-mongo";
// EditronTask type might be needed if we store the task locally as well,
// but the current logic only calls the external API.
// import { EditronTask } from "@/lib/types";
import { auth } from "@clerk/nextjs/server"; // Import Clerk auth

// Read the Python API URL from environment variables
const EDITRON_BACKEND_URL = process.env.EDITRON_BACKEND_URL;

export async function POST(
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  req: NextRequest
) {
  return NextResponse.json(
    { message: "Editron submission is coming soon" },
    { status: 404 }
  );
}
