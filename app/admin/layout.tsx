import type { ReactNode } from "react";
import { requireAdmin } from "@/lib/auth/adminAuth";
import Link from "next/link";
import { Mail, BarChart3, LayoutDashboard, Award, Gift, UserCheck, DollarSign } from "lucide-react";
import { cn } from "@/lib/utils";

export const metadata = {
  title: "Admin | Insturix",
  description: "Insturix Administration Panel",
  robots: "noindex, nofollow",
};

export default async function AdminLayout({ children }: { children: ReactNode }) {
  await requireAdmin();

  return (
    <div className="min-h-screen bg-surface-canvas">
      <div className="flex">
        {/* Sidebar - Fixed */}
        <aside
          className="hidden md:flex md:w-56 lg:w-64 flex-col fixed inset-y-0 left-0 z-40"
          style={{
            backgroundColor: "var(--bg-raised)",
            borderRight: "1px solid var(--border-subtle)",
          }}
        >
          <div
            className="h-14 flex items-center px-5"
            style={{
              borderBottom: "1px solid var(--border-subtle)",
            }}
          >
            <span
              className="text-sm font-bold tracking-tight"
              style={{ color: "var(--text-primary)" }}
            >
              Insturix Admin
            </span>
          </div>
          <nav className="flex-1 p-3 space-y-1 overflow-y-auto">
            <NavItem href="/admin/dashboard" icon={<LayoutDashboard className="w-4 h-4" />}>Dashboard</NavItem>
            <NavItem href="/admin/dashboard/analytics" icon={<BarChart3 className="w-4 h-4" />}>Analytics</NavItem>
            <NavItem href="/admin/financials" icon={<DollarSign className="w-4 h-4" />}>Financials</NavItem>
            <NavItem href="/admin/mailing" icon={<Mail className="w-4 h-4" />}>Mailing</NavItem>
            <NavItem href="/admin/bronze-promotions" icon={<Award className="w-4 h-4" />}>Bronze Promotions</NavItem>
            <NavItem href="/admin/cashback-tasks" icon={<Gift className="w-4 h-4" />}>Cashback Tasks</NavItem>
            <NavItem href="/admin/creator-approvals" icon={<UserCheck className="w-4 h-4" />}>Creator Approvals</NavItem>
          </nav>
          <div
            className="p-3"
            style={{ borderTop: "1px solid var(--border-subtle)" }}
          >
            <p
              className="text-[10px] text-center"
              style={{ color: "var(--text-dim)" }}
            >
              Admin Panel v1.0
            </p>
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
        "flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors"
      )}
      style={{ color: "var(--text-secondary)" }}
    >
      {icon}
      <span>{children}</span>
    </Link>
  );
}
