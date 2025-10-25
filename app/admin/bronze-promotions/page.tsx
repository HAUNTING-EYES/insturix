import { auth } from "@clerk/nextjs/server";
import { redirect } from "next/navigation";
import { clerkClient } from "@clerk/nextjs/server";
import BronzePromotionsAdmin from "@/components/admin/BronzePromotionsAdmin";
import Navbar from "@/components/Navbar";

export const metadata = {
  title: "Bronze Promotions · Admin | Insturix",
  description: "Manage Bronze Pass promotion submissions",
};

export default async function AdminBronzePromotionsPage() {
  const { userId } = await auth();
  
  if (!userId) {
    redirect("/signin?redirect_url=/admin/bronze-promotions");
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
      <BronzePromotionsAdmin />
    </div>
  );
}
