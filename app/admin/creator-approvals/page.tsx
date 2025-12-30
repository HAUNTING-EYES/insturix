import CreatorApprovalsAdmin from "@/components/admin/CreatorApprovalsAdmin";
import Navbar from "@/components/Navbar";

export const metadata = {
  title: "Creator Approvals · Admin | Insturix",
  description: "Manage Creator Pass applications",
  robots: "noindex, nofollow",
};

/**
 * Admin Creator Approvals Page
 * 
 * Protected by AdminLayout - only accessible to authenticated admin users.
 * Admin verification happens at the layout level.
 */
export default async function AdminCreatorApprovalsPage() {
  return (
    <div className="min-h-screen bg-white dark:bg-zinc-950">
      <Navbar />
      <CreatorApprovalsAdmin />
    </div>
  );
}
