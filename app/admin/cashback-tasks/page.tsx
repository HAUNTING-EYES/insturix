import CashbackTasksManager from "@/components/admin/CashbackTasksManager";
import AdminBackButton from "@/components/admin/AdminBackButton";
import Navbar from "@/components/Navbar";

export const metadata = {
  title: "Cashback Tasks · Admin | Insturix",
  description: "Manage GameOn cashback task submissions",
  robots: "noindex, nofollow",
};

/**
 * Admin Cashback Tasks Page
 * 
 * Protected by AdminLayout - only accessible to authenticated admin users.
 * Admin verification happens at the layout level.
 */
export default async function AdminCashbackTasksPage() {
  return (
    <div className="min-h-screen bg-white dark:bg-zinc-950">
      <Navbar />
      <div className="container max-w-7xl mx-auto px-4 py-8">
        <div className="mb-6">
          <AdminBackButton />
        </div>
        <div className="mb-8">
          <h1 className="text-4xl font-extrabold tracking-tight text-zinc-900 dark:text-zinc-100">
            Cashback Tasks Management
          </h1>
          <p className="text-zinc-600 dark:text-zinc-400 mt-3 text-lg">
            Review and approve GameOn cashback task submissions
          </p>
        </div>
        
        <CashbackTasksManager />
      </div>
    </div>
  );
}
