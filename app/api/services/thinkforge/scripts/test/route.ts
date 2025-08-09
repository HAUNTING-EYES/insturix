import { auth } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";

export async function GET() {
  try {
    const session = await auth();
    if (!session?.userId) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      );
    }

    // Test the backend worker connection (no limits)
    const backendUrl = process.env.THINKFORGE_BACKEND_URL || 'http://localhost:8080';
    
    try {
      const response = await fetch(`${backendUrl}/health`, {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
        },
      });

      const backendStatus = response.ok ? 'connected' : 'disconnected';
      const backendData = response.ok ? await response.json() : null;

      return NextResponse.json({
        success: true,
        frontend: 'working',
        backend: backendStatus,
        backendUrl,
        backendHealth: backendData,
        userId: session.userId,
        timestamp: new Date().toISOString(),
        note: 'Backend now acts as pure worker - no limit enforcement'
      });

    } catch (error) {
      return NextResponse.json({
        success: false,
        frontend: 'working',
        backend: 'error',
        backendUrl,
        error: error instanceof Error ? error.message : String(error),
        userId: session.userId,
        timestamp: new Date().toISOString(),
        note: 'Backend worker connection failed'
      });
    }

  } catch (error) {
    return NextResponse.json(
      { 
        success: false,
        error: error instanceof Error ? error.message : String(error),
        timestamp: new Date().toISOString()
      },
      { status: 500 }
    );
  }
} 