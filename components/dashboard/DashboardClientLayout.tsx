"use client";

import { AnimatePresence, motion } from "framer-motion";
import { usePathname } from "next/navigation";
import DashboardSidebar from "@/components/dashboard/DashboardSidebar";
import { useAuth } from "@clerk/nextjs";
import NotSignedIn from "@/components/NotSignedup";
import { TaskNotificationManager } from "@/components/dashboard/rtdb/TaskNotificationManager";
import { RtdbProvider } from "@/providers/RtdbProvider";
import { UserInitializationProvider } from "@/components/dashboard/UserInitializationProvider";
import { User } from "@/types/userTypes";

export default function DashboardClientLayout({
  children,
  initialUserData,
}: {
  children: React.ReactNode;
  initialUserData: User | null;
}) {
  const pathname = usePathname();
  const { isSignedIn } = useAuth();

  const isReportRoute = pathname.startsWith('/dashboard/alyzitron/report/');

  if (!isSignedIn && !isReportRoute) {
    return <NotSignedIn />;
  }

  return (
    <UserInitializationProvider initialData={initialUserData}>
      <RtdbProvider>
        <DashboardSidebar />
        <main className="min-h-screen bg-zinc-950/95 lg:pl-[64px] pt-16 lg:pt-0">
          <AnimatePresence mode="wait">
            <motion.div
              key={pathname}
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.2, ease: "easeInOut" }}
              className="min-h-screen"
            >
              {children}
            </motion.div>
          </AnimatePresence>
        </main>
        <TaskNotificationManager />
      </RtdbProvider>
    </UserInitializationProvider>
  );
}