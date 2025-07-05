import { NextResponse, type NextRequest } from "next/server";

export async function GET(
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  request: NextRequest
) {
  return NextResponse.json(
    { message: "Editron service is coming soon" },
    { status: 404 }
  );
}

export async function POST(
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  request: NextRequest
) {
  return NextResponse.json(
    { message: "Editron service is coming soon" },
    { status: 404 }
  );
}
