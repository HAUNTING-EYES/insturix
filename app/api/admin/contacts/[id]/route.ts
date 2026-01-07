import { NextRequest, NextResponse } from 'next/server';
import { verifyAdminForApi } from '@/lib/auth/adminAuth';
import connectToDatabase from '@/schemas/ConnectToDatabase';
import Contact from '@/schemas/ContactSchema';

/**
 * PATCH /api/admin/contacts/:id
 * Body: { read: boolean }
 */
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const adminCheck = await verifyAdminForApi();
  if (!adminCheck.isAdmin) {
    return adminCheck.response;
  }

  try {
    await connectToDatabase();
    const { id } = await params;
    const { read } = await req.json();

    if (typeof read !== 'boolean') {
      return NextResponse.json({ ok: false, message: 'Invalid payload' }, { status: 400 });
    }

    const updated = await Contact.findByIdAndUpdate(
      id,
      { $set: { read, readAt: read ? new Date() : null } },
      { new: true }
    );

    if (!updated) {
      return NextResponse.json({ ok: false, message: 'Contact not found' }, { status: 404 });
    }

    return NextResponse.json({ ok: true, contact: updated });
  } catch (error) {
    console.error('Error updating contact status:', error);
    return NextResponse.json({ ok: false, message: 'Failed to update status' }, { status: 500 });
  }
}
