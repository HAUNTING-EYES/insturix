import { NextRequest, NextResponse } from 'next/server';
import { verifyAdminForApi } from '@/lib/auth/adminAuth';
import connectToDatabase from '@/schemas/ConnectToDatabase';
import ContactSales from '@/schemas/ContactSalesSchema';

/**
 * PATCH /api/admin/agencies/bulk
 * Body: { ids: string[], action: 'read' | 'unread' | 'delete' }
 */
export async function PATCH(req: NextRequest) {
  const adminCheck = await verifyAdminForApi();
  if (!adminCheck.isAdmin) {
    return adminCheck.response;
  }

  try {
    await connectToDatabase();
    const { ids, action } = await req.json();

    if (!Array.isArray(ids) || ids.length === 0) {
      return NextResponse.json({ ok: false, message: 'No IDs provided' }, { status: 400 });
    }

    if (!['read', 'unread', 'delete', 'restore', 'permanent-delete'].includes(action)) {
      return NextResponse.json({ ok: false, message: 'Invalid action' }, { status: 400 });
    }

    // Handle permanent delete separately
    if (action === 'permanent-delete') {
      const result = await ContactSales.deleteMany({ _id: { $in: ids } });
      return NextResponse.json({
        ok: true,
        deletedCount: result.deletedCount,
        action,
      });
    }

    let updateFields: Record<string, unknown> = {};

    switch (action) {
      case 'read':
        updateFields = { read: true, readAt: new Date() };
        break;
      case 'unread':
        updateFields = { read: false, readAt: null };
        break;
      case 'delete':
        updateFields = { deleted: true, deletedAt: new Date() };
        break;
      case 'restore':
        updateFields = { deleted: false, deletedAt: null };
        break;
    }

    const result = await ContactSales.updateMany(
      { _id: { $in: ids } },
      { $set: updateFields },
      { strict: false }
    );

    return NextResponse.json({
      ok: true,
      modifiedCount: result.modifiedCount,
      action,
    });
  } catch (error) {
    console.error('Error bulk updating agencies:', error);
    return NextResponse.json(
      { ok: false, message: 'Failed to update agencies' },
      { status: 500 }
    );
  }
}
