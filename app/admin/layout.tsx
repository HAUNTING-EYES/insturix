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
    <div className="min-h-screen bg-white dark:bg-zinc-950">
      <div className="grid grid-cols-12">
        {/* Sidebar */}
        <aside className="col-span-12 md:col-span-3 lg:col-span-2 border-r border-zinc-200 dark:border-zinc-800 bg-zinc-50/50 dark:bg-zinc-900/30">
          <div className="h-16 flex items-center px-4 border-b border-zinc-200 dark:border-zinc-800">
            <span className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">Insturix Admin</span>
          </div>
          <nav className="p-3 space-y-1">
            <NavItem href="/admin/dashboard" icon={<LayoutDashboard className="w-4 h-4" />}>Dashboard</NavItem>
            <NavItem href="/admin/dashboard/analytics" icon={<BarChart3 className="w-4 h-4" />}>Analytics</NavItem>
            <NavItem href="/admin/mailing" icon={<Mail className="w-4 h-4" />}>Mailing</NavItem>
          </nav>
        </aside>

        {/* Content */}
        <main className="col-span-12 md:col-span-9 lg:col-span-10 min-h-screen">
          {children}
        </main>
      </div>
    </div>
  );
}

function NavItem({ href, icon, children }: { href: string; icon: React.ReactNode; children: React.ReactNode }) {
  // We can't use usePathname in a server layout; keep simple link styles
  return (
    <Link
      href={href}
      className={cn(
        "flex items-center gap-2 px-3 py-2 rounded-md text-sm text-zinc-700 dark:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-800"
      )}
    >
      {icon}
      <span>{children}</span>
    </Link>
  );
}
