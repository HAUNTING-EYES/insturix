import { NextResponse } from "next/server";

export async function POST(
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  req: Request
) {
  return NextResponse.json(
    { message: "ThinkForge service is coming soon" },
    { status: 404 }
  );
}

export async function GET() {
  return NextResponse.json(
    { message: "ThinkForge service is coming soon" },
    { status: 404 }
  );
}
