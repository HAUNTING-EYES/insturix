import { NextResponse } from "next/server";

export async function POST(
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  req: Request
) {
  return NextResponse.json(
    { message: "Musitron service is coming soon" },
    { status: 404 }
  );
}