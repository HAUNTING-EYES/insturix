import { NextResponse } from 'next/server';
import { withAdmin } from '@/lib/api/middleware/withAdmin';
import Plan from '@/schemas/plans';
import connectToDatabase from '@/schemas/ConnectToDatabase';

async function handler(req: Request) {
  const { searchParams } = new URL(req.url);
  const id = searchParams.get('id');

  if (!id) {
    return NextResponse.json({ message: 'Plan ID is required' }, { status: 400 });
  }

  if (req.method !== 'GET') {
    return NextResponse.json({ message: 'Method not allowed' }, { status: 405 });
  }

  try {
    await connectToDatabase();
    const plan = await Plan.findById(id);

    if (!plan) {
      return NextResponse.json({ message: 'Plan not found' }, { status: 404 });
    }

    return NextResponse.json(plan);
  } catch (error: any) {
    console.error('Failed to fetch plan:', error);
    return NextResponse.json({ message: 'Failed to fetch plan', error: error.message }, { status: 500 });
  }
}

export const GET = withAdmin(handler);