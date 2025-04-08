"use client";

import DashboardShell from "@/components/dashboard/DashboardShell";
import DashboardCard from "@/components/dashboard/DashboardCard";
import { FolderKanban, Gauge, Users } from "lucide-react";

const features = [
  {
    title: "Projects",
    description: "View and manage your active projects and workflows",
    icon: <FolderKanban className="w-5 h-5" />,
  },
  {
    title: "Resources",
    description: "Monitor system resources and performance",
    icon: <Gauge className="w-5 h-5" />,
  },
  {
    title: "Team",
    description: "Manage team members, roles and permissions",
    icon: <Users className="w-5 h-5" />,
  },
];

export default function EditronDashboard() {
  return (
    <DashboardShell>
      {/* Dashboard Header */}
      <div
        className="mb-8 p-6 rounded-2xl bg-white/[0.02] backdrop-blur-xl border border-white/[0.08]
                        shadow-[0_0_0_1px_rgba(255,255,255,0.04)]
                        hover:shadow-[0_0_0_1px_rgba(255,255,255,0.08)]"
      >
        <h1 className="text-3xl font-bold tracking-tight text-white/90">
          Shield Dashboard
        </h1>
        <p className="text-white/60 mt-2 text-lg font-light">
          Manage your Shield workspace and projects
        </p>
      </div>{" "}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {features.map((feature) => (
          <DashboardCard
            key={feature.title}
            title={feature.title}
            description={feature.description}
            icon={feature.icon}
          />
        ))}
      </div>
    </DashboardShell>
  );
}
