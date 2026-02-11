import type { ReactNode } from "react";
import { requireAdmin } from "@/lib/auth/adminAuth";
import Link from "next/link";
import { Mail, BarChart3, LayoutDashboard } from "lucide-react";
import { cn } from "@/lib/utils";

export const metadata = {
  title: "Admin | Insturix",
  description: "Insturix Administration Panel",
  robots: "noindex, nofollow",
};

export default async function AdminLayout({ children }: { children: ReactNode }) {
  await requireAdmin();

  return (
    <div className="min-h-screen bg-zinc-50 dark:bg-zinc-950">
      <div className="flex">
        {/* Sidebar - Fixed */}
        <aside className="hidden md:flex md:w-56 lg:w-64 flex-col fixed inset-y-0 left-0 z-40 border-r border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900">
          <div className="h-14 flex items-center px-5 border-b border-zinc-200 dark:border-zinc-800 bg-linear-to-r from-sky-500/5 to-fuchsia-500/5">
            <span className="text-sm font-bold tracking-tight text-zinc-900 dark:text-zinc-100">Insturix Admin</span>
          </div>
          <nav className="flex-1 p-3 space-y-1 overflow-y-auto">
            <NavItem href="/admin/dashboard" icon={<LayoutDashboard className="w-4 h-4" />}>Dashboard</NavItem>
            <NavItem href="/admin/dashboard/analytics" icon={<BarChart3 className="w-4 h-4" />}>Analytics</NavItem>
            <NavItem href="/admin/mailing" icon={<Mail className="w-4 h-4" />}>Mailing</NavItem>
          </nav>
          <div className="p-3 border-t border-zinc-200 dark:border-zinc-800">
            <p className="text-[10px] text-zinc-400 dark:text-zinc-600 text-center">Admin Panel v1.0</p>
          </div>
        </aside>

        {/* Content - With left margin to account for fixed sidebar */}
        <main className="flex-1 md:ml-56 lg:ml-64 min-h-screen">
          {children}
        </main>
      </div>
    </div>
  );
}

function NavItem({ href, icon, children }: { href: string; icon: React.ReactNode; children: React.ReactNode }) {
  return (
    <Link
      href={href}
      className={cn(
        "flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium text-zinc-600 dark:text-zinc-400 hover:bg-zinc-100 dark:hover:bg-zinc-800 hover:text-zinc-900 dark:hover:text-zinc-100 transition-colors"
      )}
    >
      {icon}
      <span>{children}</span>
    </Link>
  );
}
