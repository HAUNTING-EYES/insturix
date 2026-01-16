import { NextRequest, NextResponse } from 'next/server';
import { verifyAdminForApi } from '@/lib/auth/adminAuth';
import connectToDatabase from '@/schemas/ConnectToDatabase';
import Contact from '@/schemas/ContactSchema';

/**
 * GET /api/admin/contacts
 * Returns paginated contact us form responses
 */
export async function GET(req: NextRequest) {
  // Verify admin access
  const adminCheck = await verifyAdminForApi();
  if (!adminCheck.isAdmin) {
    return adminCheck.response;
  }

  try {
    await connectToDatabase();

    // Get pagination parameters
    const { searchParams } = new URL(req.url);
    const page = parseInt(searchParams.get('page') || '1');
    const limit = parseInt(searchParams.get('limit') || '10');
    const readParam = searchParams.get('read');
    const filter: any = {};
    if (readParam === 'true') filter.read = true;
    if (readParam === 'false') filter.read = false;
    const skip = (page - 1) * limit;

    // Fetch contacts sorted by newest first
    const contacts = await Contact.find(filter)
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit);

    // Get total count for pagination
    const total = await Contact.countDocuments(filter);

    return NextResponse.json({
      ok: true,
      contacts,
      pagination: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit),
      },
    });
  } catch (error) {
    console.error('Error fetching contacts:', error);
    return NextResponse.json(
      { ok: false, message: 'Failed to fetch contact messages' },
      { status: 500 }
    );
  }
}
