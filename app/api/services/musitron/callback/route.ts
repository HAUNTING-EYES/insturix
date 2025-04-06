import { NextResponse } from "next/server";

export async function POST(req: Request) {
  try {
    const data = await req.json();
    console.log(data);
    return NextResponse.json({
      success: true,
      data: data,
    });
  } catch (error) {
    console.error("Error in callback:", error);
    return NextResponse.json(
      { error: "Failed to process callback" },
      { status: 500 }
    );
  }
}
