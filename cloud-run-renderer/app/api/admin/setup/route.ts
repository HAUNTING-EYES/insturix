/**
 * GET /api/admin/setup
 * Initialize database indexes
 * 
 * This should only be called once during initial setup
 */

import { NextRequest, NextResponse } from 'next/server';
import { initializeIndexes } from '@/lib/db/mongodb';

export const runtime = 'nodejs';

export async function GET(request: NextRequest) {
  try {
    // TODO: Add admin authentication check here
    // For now, this is open - secure it before production!
    
    await initializeIndexes();

    return NextResponse.json({
      success: true,
      message: 'Database indexes initialized successfully',
    });
  } catch (error: any) {
    console.error('Error initializing database:', error);
    return NextResponse.json(
      { success: false, error: error.message || 'Failed to initialize database' },
      { status: 500 }
    );
  }
}
