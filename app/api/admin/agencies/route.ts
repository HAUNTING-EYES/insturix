import { NextRequest, NextResponse } from 'next/server';
import { verifyAdminForApi } from '@/lib/auth/adminAuth';
import connectToDatabase from '@/schemas/ConnectToDatabase';
import ContactSales from '@/schemas/ContactSalesSchema';

/**
 * GET /api/admin/agencies
 * Returns paginated agency/contact sales form responses
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
    const deletedParam = searchParams.get('deleted');
    
    // Build filter conditions
    const conditions: any[] = [];
    
    // Handle deleted filter (robust: use deleted OR deletedAt)
    if (deletedParam === 'true' || deletedParam === 'only') {
      conditions.push({ $or: [{ deleted: true }, { deletedAt: { $ne: null } }] });
    } else {
      // Show non-deleted items: deleted false/absent AND deletedAt null/absent
      conditions.push({
        $and: [
          { $or: [{ deleted: false }, { deleted: { $exists: false } }, { deleted: null }] },
          { $or: [{ deletedAt: { $exists: false } }, { deletedAt: null }] },
        ],
      });
    }
    
    // Handle read filter
    if (readParam === 'true') conditions.push({ read: true });
    if (readParam === 'false') conditions.push({ read: { $ne: true } });
    
    const filter = conditions.length > 0 ? { $and: conditions } : {};
    const skip = (page - 1) * limit;

    // Fetch agencies sorted by newest first
    const agencies = await ContactSales.find(filter)
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit);

    // Get total count for pagination
    const total = await ContactSales.countDocuments(filter);

    return NextResponse.json({
      ok: true,
      agencies,
      pagination: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit),
      },
    });
  } catch (error) {
    console.error('Error fetching agencies:', error);
    return NextResponse.json(
      { ok: false, message: 'Failed to fetch agency messages' },
      { status: 500 }
    );
  }
}
