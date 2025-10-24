import { auth } from "@clerk/nextjs/server";
import { redirect } from "next/navigation";
import Navbar from "@/components/Navbar";
import ICS25AdminDashboard from "@/components/admin/ICS25AdminDashboard";

// Approved admin emails - only these can access the dashboard
// Add your admin emails here or use environment variable
const ADMIN_EMAILS = process.env.ADMIN_EMAILS 
  ? process.env.ADMIN_EMAILS.split(',').map(e => e.trim())
  : [];

export const metadata = {
  title: "Admin Dashboard | Insturix",
  description: "ICS'25 administration dashboard",
};

export default async function AdminDashboardPage() {
  const { userId } = await auth();
  
  if (!userId) {
    redirect("/signin?redirect_url=/admin/dashboard");
  }

  // Get user email from Clerk
  const { clerkClient } = await import("@clerk/nextjs/server");
  const client = await clerkClient();
  const user = await client.users.getUser(userId);
  const userEmail = user.emailAddresses[0]?.emailAddress;

  // Check if user email is in admin list
  if (!userEmail || !ADMIN_EMAILS.includes(userEmail)) {
    redirect("/");
  }

  return (
    <div className="relative min-h-screen overflow-hidden bg-white dark:bg-zinc-950">
      <div className="relative z-20">
        <Navbar />
      </div>

      {/* Backdrop */}
      <div className="pointer-events-none absolute inset-0">
        <div className="absolute inset-0 bg-gradient-to-br from-blue-50 via-white to-purple-50 dark:from-zinc-950 dark:via-zinc-950 dark:to-zinc-950" />
        <div className="absolute inset-0">
          <div className="absolute -top-24 -right-24 w-[600px] h-[600px] rounded-full bg-gradient-to-br from-sky-500/15 via-transparent to-fuchsia-500/15 blur-3xl" />
          <div className="absolute -bottom-24 -left-24 w-[600px] h-[600px] rounded-full bg-gradient-to-br from-purple-500/15 via-transparent to-cyan-500/15 blur-3xl" />
        </div>
      </div>

      <main className="relative z-10 container max-w-7xl mx-auto px-4 py-8">
        <div className="mb-8">
          <h1 className="text-3xl md:text-4xl font-extrabold tracking-tight text-zinc-900 dark:text-zinc-100">
            ICS'25 Admin Dashboard
          </h1>
          <p className="text-zinc-600 dark:text-zinc-400 mt-2">
            Manage attendees, creator applications, and event data
          </p>
        </div>

        <ICS25AdminDashboard />
      </main>
    </div>
  );
}
