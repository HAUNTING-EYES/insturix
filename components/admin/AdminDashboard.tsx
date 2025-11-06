"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { LogOut, BarChart3, Calendar, Zap, Shield, Mail } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@/components/ui/tabs";
import { useAuth } from "@clerk/nextjs";
import { motion } from "framer-motion";
import ICS25Dashboard from "./ICS25Dashboard";
import AnalyticsTab from "./AnalyticsTab";

interface AdminDashboardProps {
  userEmail: string;
}

export default function AdminDashboard({ userEmail }: AdminDashboardProps) {
  const [activeTab, setActiveTab] = useState("ics25");
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
            <h1 className="text-4xl md:text-5xl font-extrabold tracking-tight text-zinc-900 dark:text-zinc-100">
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
              <p className="text-xs text-zinc-500 dark:text-zinc-400">
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
                <p className="text-xs text-zinc-600 dark:text-zinc-400">
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
                <p className="text-xs text-zinc-600 dark:text-zinc-400">
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
                <p className="text-xs text-zinc-600 dark:text-zinc-400">
                  Synced now
                </p>
              </div>
            </div>
          </motion.div>
        </div>
      </motion.div>

      {/* Tabs Navigation */}
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.4 }}
      >
        <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
          <TabsList className="inline-flex items-center gap-2 mb-8 bg-white/50 dark:bg-zinc-900/50 border border-white/20 dark:border-zinc-800/50 p-1 rounded-xl">
            <TabsTrigger
              value="ics25"
              className="flex items-center gap-2 data-[state=active]:bg-gradient-to-r data-[state=active]:from-sky-500 data-[state=active]:to-blue-500 data-[state=active]:text-white rounded-lg px-4 py-2"
            >
              <Calendar className="w-4 h-4" />
              <span>ICS'25</span>
            </TabsTrigger>
            <TabsTrigger
              value="analytics"
              className="flex items-center gap-2 data-[state=active]:bg-gradient-to-r data-[state=active]:from-fuchsia-500 data-[state=active]:to-purple-500 data-[state=active]:text-white rounded-lg px-4 py-2"
            >
              <BarChart3 className="w-4 h-4" />
              <span>Analytics</span>
            </TabsTrigger>
            <TabsTrigger
              value="mailing"
              className="flex items-center gap-2 data-[state=active]:bg-gradient-to-r data-[state=active]:from-emerald-500 data-[state=active]:to-teal-500 data-[state=active]:text-white rounded-lg px-4 py-2"
            >
              <Mail className="w-4 h-4" />
              <span>Mailing</span>
            </TabsTrigger>
          </TabsList>

          {/* ICS'25 Tab */}
          <TabsContent value="ics25" className="space-y-6">
            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.5 }}
            >
              <ICS25Dashboard />
            </motion.div>
          </TabsContent>

          {/* Analytics Tab */}
          <TabsContent value="analytics" className="space-y-6">
            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.5 }}
            >
              <AnalyticsTab />
            </motion.div>
          </TabsContent>

          {/* Mailing Tab */}
          <TabsContent value="mailing" className="space-y-6">
            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.5 }}
            >
              <div className="text-center py-12">
                <p className="text-muted-foreground mb-4">
                  Access the full mailing dashboard
                </p>
                <Button
                  onClick={() => router.push("/admin/mailing")}
                  className="bg-gradient-to-r from-emerald-500 to-teal-500 hover:from-emerald-600 hover:to-teal-600 text-white"
                >
                  <Mail className="mr-2 h-4 w-4" />
                  Open Mailing Dashboard
                </Button>
              </div>
            </motion.div>
          </TabsContent>
        </Tabs>
      </motion.div>
    </div>
  );
}
