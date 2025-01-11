"use client";

import { useAuth } from "@clerk/nextjs";
import NotSignedIn from "@/components/NotSignedup";
import ChatDashboard from "@/components/dashboard/ChatDashboard";

export default function Dashboard() {
  const { isSignedIn } = useAuth();

  if (!isSignedIn) {
    return (
      <>
        <NotSignedIn />
      </>
    );
  }
  return (
    <>
      <main className="flex h-screen bg-gray-100 dark:bg-gray-900 overflow-hidden">
        <ChatDashboard />
      </main>
    </>
  );
}
