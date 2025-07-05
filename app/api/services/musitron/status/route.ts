import { NextResponse } from "next/server";

export async function GET() {
  return NextResponse.json(
    { message: "Musitron service is coming soon" },
    { status: 404 }
  );
}
