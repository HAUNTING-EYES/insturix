"use client";

import DashboardShell from "@/components/dashboard/DashboardShell";
import CursorEffect from "@/components/ui/CursorEffect";
import { useUserInitialization } from "./UserInitializationProvider";
import { UiMessage } from "../ui/UiMessage";

const THEME = {
  color: "rgba(255, 255, 255, 0.05)",
  gradient: {
    from: "from-white/40",
    to: "to-white/60",
  },
};

export default function Dashboard() {
  const { user } = useUserInitialization();

  return (
    <>
      <CursorEffect variant="glow" color={THEME.color} size={500} blur={100} />
      <DashboardShell>
        {/* Dashboard Header */}
        <div
          className="mt-8 p-4 rounded-2xl bg-white/[0.02] backdrop-blur-xl border border-white/[0.08]
                        shadow-[0_0_0_1px_rgba(255,255,255,0.02)]
                        hover:shadow-[0_0_0_1px_rgba(255,255,255,0.04)]"
        >
          <h1 className="text-3xl font-semibold tracking-tight text-white/90">
            Insturix Dashboard
          </h1>
          <p className="text-white/60 mt-2 text-lg font-light">
            Manage all your products and services from one place
          </p>
        </div>
        <div className="mt-4">
          {user?.uiMessages?.map((msg) => {
            if (msg.location === "dashboard-overview") {
              return <UiMessage key={msg.id} {...msg} />;
            }
            return null;
          })}
        </div>
      </DashboardShell>
    </>
  );
}
