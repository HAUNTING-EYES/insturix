import type { ReactNode } from "react";
import { requireAdmin } from "@/lib/auth/adminAuth";

export const metadata = {
  title: "Admin | Insturix",
  description: "Insturix Administration Panel",
  robots: "noindex, nofollow", // Hide all admin pages from search engines
};

/**
 * Admin Layout
 * 
 * All pages under /admin are protected by this layout.
 * Users must be:
 * 1. Authenticated (logged in via normal signin flow)
 * 2. Admin (email in ADMIN_EMAILS environment variable)
 * 
 * Non-authenticated users are redirected to /signin
 * Non-admin users are silently redirected to /
 */
export default async function AdminLayout({ children }: { children: ReactNode }) {
  // This will redirect if user is not authenticated or not an admin
  await requireAdmin();
  
  return <>{children}</>;
}
