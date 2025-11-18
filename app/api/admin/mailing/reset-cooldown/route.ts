import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { verifyAdminForApi } from '@/lib/auth/adminAuth';
import mongoose from 'mongoose';
import { EmailCooldown } from '@/schemas/EmailCooldown';

const MONGODB_URI = process.env.MONGODB_URI!;
const PROD_DB_NAME = 'insturix_prod'; // Production database for user data

// Cached connection for insturix_prod database
let cachedConnection: typeof mongoose | null = null;

async function connectToProdDatabase() {
  if (cachedConnection) {
    return cachedConnection;
  }

  const opts = {
    bufferCommands: false,
    dbName: PROD_DB_NAME,
  };

  cachedConnection = await mongoose.connect(MONGODB_URI, opts);
  return cachedConnection;
}

/**
 * POST /api/admin/mailing/reset-cooldown
 * Reset the cooldown timer for a specific email type
 */
export async function POST(req: NextRequest) {
  // Verify admin access
  const adminCheck = await verifyAdminForApi();
  if (!adminCheck.isAdmin) {
    return adminCheck.response;
  }

  try {
    const { userId } = await auth();
    if (!userId) {
      return NextResponse.json(
        { ok: false, message: 'Unauthorized' },
        { status: 401 }
      );
    }

    const body = await req.json();
    const { emailType } = body;

    if (!emailType) {
      return NextResponse.json(
        { ok: false, message: 'emailType is required' },
        { status: 400 }
      );
    }

    // Validate emailType
    const validTypes = ['promotional', 'ticket-confirmation', 'custom-mailing'];
    if (!validTypes.includes(emailType)) {
      return NextResponse.json(
        { ok: false, message: 'Invalid emailType. Must be one of: ' + validTypes.join(', ') },
        { status: 400 }
      );
    }

    await connectToProdDatabase();

    // Reset the cooldown
    const resetResult = await (EmailCooldown as any).resetCooldown(emailType);

    if (resetResult.success) {
      console.log(`🔄 Cooldown reset for ${emailType} by admin ${userId}: ${resetResult.message}`);
      return NextResponse.json({
        ok: true,
        message: resetResult.message,
      });
    } else {
      return NextResponse.json(
        { ok: false, message: resetResult.message },
        { status: 500 }
      );
    }
  } catch (error: any) {
    console.error('POST /api/admin/mailing/reset-cooldown error:', error);
    return NextResponse.json(
      { ok: false, message: error?.message || 'Failed to reset cooldown' },
      { status: 500 }
    );
  }
}