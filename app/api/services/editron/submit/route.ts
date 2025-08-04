import { NextRequest, NextResponse } from "next/server";
export async function POST(
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  req: NextRequest
) {
  return NextResponse.json(
    { message: "Editron submission is coming soon" },
    { status: 404 }
  );
}
