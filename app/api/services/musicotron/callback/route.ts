import { NextResponse } from 'next/server';

export async function POST(req: Request) {
  try {
    const data = await req.json();
    
    // Store the generated music data (you might want to use a database here)
    // For now, we'll just return it to the client
    return NextResponse.json({
      success: true,
      data: data
    });
  } catch (error) {
    console.error('Error in callback:', error);
    return NextResponse.json(
      { error: 'Failed to process callback' },
      { status: 500 }
    );
  }
} 