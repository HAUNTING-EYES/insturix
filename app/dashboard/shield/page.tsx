import DashboardShell from "@/components/dashboard/DashboardShell";
import ShieldLandingPage from "@/components/dashboard/shield/ShieldLandingPage";
import { Shield } from "lucide-react";

export default function Dashboard() {
  return (
    <DashboardShell>
      <div className="container mx-auto p-8">
        {/* Page Header */}
        <div className="mb-8">
          <h1 className="text-4xl font-semibold tracking-tight flex items-center gap-3">
            <Shield className="h-8 w-8 text-[#a855f7]" />
            Shield
          </h1>
          <p className="mt-3 text-lg text-zinc-200 font-light">
             Protect your content from lawsuits and copyright claims with our team of lawyers.
          </p>
        </div>
      </div>
      <ShieldLandingPage />
    </DashboardShell>
  );
}
