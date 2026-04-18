/**
 * GET /api/admin/whoami
 *
 * Returns `{ isAdmin: boolean }` for the currently-authenticated user.
 *
 * Purpose: lets CLIENT components (e.g. Navbar, dashboards) decide whether
 * to show admin-specific UI affordances (admin link, admin badge, etc.)
 * WITHOUT leaking the full admin email list to the browser bundle via a
 * NEXT_PUBLIC_ env var.
 *
 * Security:
 *   - Only reveals "yes / no" for the CURRENT authenticated user.
 *   - Never returns the admin allowlist.
 *   - Never reveals whether another email/user is an admin.
 *   - Unauthenticated callers always get `{ isAdmin: false }` — no enumeration.
 *
 * Added 2026-04-19 as part of the fired-teammate access audit. Replaces
 * client-side reads of NEXT_PUBLIC_ADMIN_EMAILS that previously existed in
 * Navbar.tsx and AdminDashboardClient.tsx.
 */

import { NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { isAdmin } from '@/lib/auth/adminAuth';

export const runtime = 'nodejs';

export async function GET() {
  const { userId } = await auth();
  if (!userId) {
    return NextResponse.json({ isAdmin: false }, { status: 200 });
  }
  const admin = await isAdmin(userId);
  return NextResponse.json({ isAdmin: admin });
}
