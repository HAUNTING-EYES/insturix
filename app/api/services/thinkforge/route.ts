import { NextResponse, type NextRequest } from "next/server";

export async function GET(
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  request: NextRequest
) {
  try {
    return NextResponse.json(
      { message: "ThinkForge service is running" },
      { status: 200 }
    );
  } catch (error) {
    console.error("Error in ThinkForge service:", error);
    return NextResponse.json(
      { error: "Failed to process request" },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    // Parse the request body
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const body = await request.json();
    
    // TODO: Add your ThinkForge service logic here
    
    return NextResponse.json(
      { success: true, message: "Request processed successfully" },
      { status: 200 }
    );
  } catch (error) {
    console.error("Error in ThinkForge service:", error);
    return NextResponse.json(
      { error: "Failed to process request" },
      { status: 500 }
    );
  }
}
