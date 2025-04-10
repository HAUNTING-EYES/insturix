import { NextResponse } from "next/server";

// Simple mock API to avoid errors
export async function GET() {
  // Mock data response
  const mockData = {
    success: true,
    message: "This is a mock API response",
    data: [
      { id: 1, name: "Example Item 1" },
      { id: 2, name: "Example Item 2" },
      { id: 3, name: "Example Item 3" }
    ]
  };

  return NextResponse.json(mockData);
}

export async function POST(req: Request) {
  try {
    // Parse incoming data (if any)
    const body = await req.json().catch(() => ({}));
    
    // Return mock success response
    return NextResponse.json({ 
      success: true, 
      message: "Data received successfully",
      receivedData: body
    });
  } catch (error) {
    console.error("Error processing webhook:", error);
    return NextResponse.json({ 
      success: false, 
      message: "Error processing request" 
    }, { status: 500 });
  }
}