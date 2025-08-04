// GET /api/services/editron/history
import { NextResponse } from "next/server";

// Helper function to get GCS credentials options from env var
export async function GET() {
  return NextResponse.json(
    { message: "Editron history is coming soon" },
    { status: 404 }
  );
}
