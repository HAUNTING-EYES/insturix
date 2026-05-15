"use client";

import { useRouter } from "next/navigation";
import { LogOut, BarChart3, Calendar, Zap } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useAuth } from "@clerk/nextjs";
import { motion } from "framer-motion";

import AnalyticsTab from "./AnalyticsTab";

interface AdminDashboardProps {
  userEmail: string;
}

export default function AdminDashboard({ userEmail }: AdminDashboardProps) {
  const { signOut } = useAuth();
  const router = useRouter();

  const handleLogout = async () => {
    await signOut();
    router.push("/");
  };

  return (
    <div className="container max-w-7xl mx-auto px-4 py-8">
      {/* Header */}
      <motion.div
        initial={{ opacity: 0, y: -20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5 }}
        className="mb-12"
      >
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4 mb-8">
          <div>
            <h1 className="text-[44px] md:text-[44px] font-extrabold tracking-tight text-zinc-900 dark:text-zinc-100">
              Admin Control Center
            </h1>
            <p className="text-zinc-600 dark:text-zinc-400 mt-3 text-lg">
              Manage data, monitor analytics, and control event operations
            </p>
          </div>
          <div className="flex items-center gap-3">
            <div className="text-right hidden sm:block">
              <p className="text-sm font-medium text-zinc-900 dark:text-zinc-100">
                {userEmail}
              </p>
              <p className="text-[11px] text-zinc-500 dark:text-zinc-400">
                Administrator
              </p>
            </div>
            <Button
              onClick={handleLogout}
              variant="outline"
              size="sm"
              className="border-zinc-200 dark:border-zinc-800 hover:bg-red-50 dark:hover:bg-red-950/30"
            >
              <LogOut className="w-4 h-4 mr-2" />
              Logout
            </Button>
          </div>
        </div>

        {/* Admin Info Cards */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.1 }}
            className="p-4 rounded-lg bg-gradient-to-br from-sky-500/10 to-blue-500/10 border border-sky-500/20 dark:border-sky-500/30"
          >
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-sky-500/20">
                <Zap className="w-5 h-5 text-sky-600 dark:text-sky-400" />
              </div>
              <div>
                <p className="text-sm font-medium text-zinc-700 dark:text-zinc-300">
                  Dashboard Status
                </p>
                <p className="text-[11px] text-zinc-600 dark:text-zinc-400">
                  Fully Operational
                </p>
              </div>
            </div>
          </motion.div>

          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.2 }}
            className="p-4 rounded-lg bg-gradient-to-br from-fuchsia-500/10 to-purple-500/10 border border-fuchsia-500/20 dark:border-fuchsia-500/30"
          >
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-fuchsia-500/20">
                <BarChart3 className="w-5 h-5 text-fuchsia-600 dark:text-fuchsia-400" />
              </div>
              <div>
                <p className="text-sm font-medium text-zinc-700 dark:text-zinc-300">
                  Real-Time Data
                </p>
                <p className="text-[11px] text-zinc-600 dark:text-zinc-400">
                  Live updates enabled
                </p>
              </div>
            </div>
          </motion.div>

          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.3 }}
            className="p-4 rounded-lg bg-gradient-to-br from-cyan-500/10 to-teal-500/10 border border-cyan-500/20 dark:border-cyan-500/30"
          >
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-cyan-500/20">
                <div className="w-5 h-5 rounded-full bg-gradient-to-br from-cyan-500 to-teal-500 animate-pulse" />
              </div>
              <div>
                <p className="text-sm font-medium text-zinc-700 dark:text-zinc-300">
                  Data Sync
                </p>
                <p className="text-[11px] text-zinc-600 dark:text-zinc-400">
                  Synced now
                </p>
              </div>
            </div>
          </motion.div>
        </div>
      </motion.div>

      {/* Analytics content */}
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.4 }}
        className="space-y-6"
      >
        <AnalyticsTab />
      </motion.div>
    </div>
  );
}
