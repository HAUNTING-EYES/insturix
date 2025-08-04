import { NextRequest, NextResponse } from "next/server";

// Helper function to get GCS credentials options from env var
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
