// API route for validating YouTube video links for Editron
import { NextRequest, NextResponse } from "next/server";

// --- API Route Handler ---

export async function POST(
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  req: NextRequest
) {
  return NextResponse.json(
    { message: "Editron video validation is coming soon" },
    { status: 404 }
  );
}