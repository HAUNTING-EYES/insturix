import { NextRequest, NextResponse } from 'next/server';
import { verifyAdminForApi } from '@/lib/auth/adminAuth';
import connectToDatabase from '@/schemas/ConnectToDatabase';
import Contact from '@/schemas/ContactSchema';

/**
 * PATCH /api/admin/contacts/bulk
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
      const result = await Contact.deleteMany({ _id: { $in: ids } });
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

    const result = await Contact.updateMany(
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
    console.error('Error bulk updating contacts:', error);
    return NextResponse.json(
      { ok: false, message: 'Failed to update contacts' },
      { status: 500 }
    );
  }
}
