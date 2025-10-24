import { auth } from "@clerk/nextjs/server";
import { redirect } from "next/navigation";
import { clerkClient } from "@clerk/nextjs/server";
import CreatorApprovalsAdmin from "@/components/admin/CreatorApprovalsAdmin";
import Navbar from "@/components/Navbar";

export const metadata = {
  title: "Creator Approvals · Admin | Insturix",
  description: "Manage Creator Pass applications",
};

export default async function AdminCreatorApprovalsPage() {
  const { userId } = await auth();
  
  if (!userId) {
    redirect("/signin?redirect_url=/admin/creator-approvals");
  }

  // Check if user is admin
  const client = await clerkClient();
  const user = await client.users.getUser(userId);
  const isAdmin = user.publicMetadata?.role === 'admin' || user.privateMetadata?.role === 'admin';
  
  if (!isAdmin) {
    redirect("/");
  }

  return (
    <div className="min-h-screen bg-white dark:bg-zinc-950">
      <Navbar />
      <CreatorApprovalsAdmin />
    </div>
  );
}
