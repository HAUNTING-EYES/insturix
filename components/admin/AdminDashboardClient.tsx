"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useAuth, useUser } from "@clerk/nextjs";
import AdminDashboard from "./AdminDashboard";

const ADMIN_EMAILS = process.env.NEXT_PUBLIC_ADMIN_EMAILS
  ? process.env.NEXT_PUBLIC_ADMIN_EMAILS.split(",").map((e) => e.trim())
  : [];

export default function AdminDashboardClient() {
  const { isLoaded, userId } = useAuth();
  const { user } = useUser();
  const router = useRouter();
  const [authState, setAuthState] = useState<"loading" | "authorized" | "unauthorized">("loading");

  useEffect(() => {
    // Only run after Clerk has loaded
    if (!isLoaded) {
      return;
    }

    // Not logged in - redirect
    if (!userId) {
      setAuthState("unauthorized");
      router.push("/admin/login");
      return;
    }

    // Check email authorization
    const userEmail = user?.emailAddresses?.[0]?.emailAddress;
    if (!userEmail || !ADMIN_EMAILS.includes(userEmail)) {
      setAuthState("unauthorized");
      router.push("/admin/login");
      return;
    }

    // Authorized
    setAuthState("authorized");
  }, [isLoaded, userId, user, router]);

  // Show loading screen while checking auth or while unauthorized
  if (authState !== "authorized") {
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

  // User is authorized - render dashboard
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
