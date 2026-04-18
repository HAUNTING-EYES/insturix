"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAuth, useUser } from "@clerk/nextjs";
import AdminDashboard from "./AdminDashboard";

/**
 * AdminDashboardClient — client wrapper around the admin dashboard.
 *
 * AUTHORIZATION NOTE (updated 2026-04-19):
 *   Admin authorization is enforced SERVER-SIDE by `requireAdmin()` in
 *   `app/admin/layout.tsx` BEFORE this component ever renders. By the time
 *   this runs on the client, the user is already verified as an admin.
 *
 *   We previously duplicated the email-list check here using
 *   NEXT_PUBLIC_ADMIN_EMAILS, but that (a) leaked the full admin email list
 *   into the browser bundle — anyone could view page source to enumerate
 *   admins — and (b) was redundant with the server guard. Removed during
 *   fired-teammate access audit.
 *
 * This component now only handles:
 *   1. Clerk loading state (spinner until the Clerk SDK resolves)
 *   2. Logout-mid-session edge case (user was an admin, logged out in
 *      another tab, still looking at this page — redirect to login)
 *
 * Do NOT add back any client-side admin email check. Security is the
 * server guard; client checks are always bypassable and they leak the
 * allowlist. If a future feature needs "is current user an admin" on the
 * client, add a `/api/admin/whoami` route that returns a boolean and call
 * that — never put the email list in NEXT_PUBLIC_.
 */
export default function AdminDashboardClient() {
  const { isLoaded, userId } = useAuth();
  const { user } = useUser();
  const router = useRouter();

  useEffect(() => {
    if (!isLoaded) return;
    // Logout-mid-session edge case: Clerk session died after the server
    // guard ran. Redirect out.
    if (!userId) {
      router.push("/admin/login");
    }
  }, [isLoaded, userId, router]);

  // Loading / logged-out state — show the spinner backdrop
  if (!isLoaded || !userId) {
    return (
      <div className="relative min-h-screen overflow-hidden bg-white dark:bg-zinc-950">
        {/* Backdrop */}
        <div className="pointer-events-none absolute inset-0">
          <div className="absolute inset-0 bg-gradient-to-br from-blue-50 via-white to-purple-50 dark:from-zinc-950 dark:via-zinc-950 dark:to-zinc-950" />
          <div className="absolute inset-0">
            <div className="absolute -top-24 -right-24 w-[600px] h-[600px] rounded-full bg-gradient-to-br from-sky-500/15 via-transparent to-fuchsia-500/15 blur-3xl" />
            <div className="absolute -bottom-24 -left-24 w-[600px] h-[600px] rounded-full bg-gradient-to-br from-purple-500/15 via-transparent to-cyan-500/15 blur-3xl" />
          </div>
        </div>

        <div className="relative z-10 min-h-screen flex items-center justify-center">
          <div className="w-8 h-8 animate-spin rounded-full border-4 border-sky-500 border-t-transparent" />
        </div>
      </div>
    );
  }

  // Authorized (verified server-side by app/admin/layout.tsx → requireAdmin)
  return (
    <div className="relative min-h-screen overflow-hidden bg-white dark:bg-zinc-950">
      {/* Backdrop */}
      <div className="pointer-events-none absolute inset-0">
        <div className="absolute inset-0 bg-gradient-to-br from-blue-50 via-white to-purple-50 dark:from-zinc-950 dark:via-zinc-950 dark:to-zinc-950" />
        <div className="absolute inset-0">
          <div className="absolute -top-24 -right-24 w-[600px] h-[600px] rounded-full bg-gradient-to-br from-sky-500/15 via-transparent to-fuchsia-500/15 blur-3xl" />
          <div className="absolute -bottom-24 -left-24 w-[600px] h-[600px] rounded-full bg-gradient-to-br from-purple-500/15 via-transparent to-cyan-500/15 blur-3xl" />
        </div>
      </div>

      <main className="relative z-10">
        <AdminDashboard userEmail={user?.emailAddresses?.[0]?.emailAddress || ""} />
      </main>
    </div>
  );
}
