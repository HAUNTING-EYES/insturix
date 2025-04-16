import { NextResponse } from 'next/server';

export async function GET() {
  try {
    // The CLERK_SECRET_KEY is safe to use here as this code only runs on the server
    const response = await fetch('https://api.clerk.com/v1/waitlist_entries', {
      headers: {
        'Authorization': `Bearer ${process.env.CLERK_SECRET_KEY}`,
        'Content-Type': 'application/json'
      }
    });

    if (!response.ok) {
      throw new Error('Failed to fetch waitlist data');
    }

    const data = await response.json();
    
    // Return the data to the client
    return NextResponse.json({ total_count: data.total_count || 20 });
  } catch (error) {
    console.error('Error fetching waitlist count:', error);
    return NextResponse.json({ total_count: 20 }, { status: 500 });
  }
}