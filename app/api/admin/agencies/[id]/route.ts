import { NextRequest, NextResponse } from 'next/server';
import { verifyAdminForApi } from '@/lib/auth/adminAuth';
import connectToDatabase from '@/schemas/ConnectToDatabase';
import ContactSales from '@/schemas/ContactSalesSchema';

/**
 * PATCH /api/admin/agencies/:id
 * Body: { read?: boolean, deleted?: boolean }
 */
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const adminCheck = await verifyAdminForApi();
  if (!adminCheck.isAdmin) {
    return adminCheck.response;
  }

  try {
    await connectToDatabase();
    const { id } = await params;
    const body = await req.json();
    const { read, deleted } = body;

    const updateFields: any = {};
    
    if (typeof read === 'boolean') {
      updateFields.read = read;
      updateFields.readAt = read ? new Date() : null;
    }
    
    if (typeof deleted === 'boolean') {
      updateFields.deleted = deleted;
      updateFields.deletedAt = deleted ? new Date() : null;
    }

    if (Object.keys(updateFields).length === 0) {
      return NextResponse.json({ ok: false, message: 'Invalid payload' }, { status: 400 });
    }

    const updated = await ContactSales.findByIdAndUpdate(
      id,
      { $set: updateFields },
      { new: true, strict: false }
    );

    if (!updated) {
      return NextResponse.json({ ok: false, message: 'Agency not found' }, { status: 404 });
    }

    return NextResponse.json({ ok: true, agency: updated });
  } catch (error) {
    console.error('Error updating agency status:', error);
    return NextResponse.json({ ok: false, message: 'Failed to update status' }, { status: 500 });
  }
}
