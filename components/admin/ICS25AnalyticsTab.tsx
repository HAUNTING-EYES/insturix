"use client";

import { useEffect, useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Loader2, Users, CheckCircle2, Clock, TrendingUp, Gamepad2, Trophy } from "lucide-react";
import { motion } from "framer-motion";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

interface ICS25Stats {
  totalRegistrations: number;
  passRegistrations: number;
  gameOnRegistrations: number;
  byGame: {
    valorant: number;
    bgmi: number;
  };
  byStatus: {
    paid: number;
    pending: number;
  };
}

export default function ICS25AnalyticsTab() {
  const [stats, setStats] = useState<ICS25Stats | null>(null);
  const [activeSubTab, setActiveSubTab] = useState("overview");

  useEffect(() => {
    fetchStats();
    const interval = setInterval(fetchStats, 30000);
    return () => clearInterval(interval);
  }, []);

  const fetchStats = async () => {
    try {
      const res = await fetch("/api/ics25/admin/analytics");
      const data = await res.json();
      if (data.ok) {
        setStats(data.stats);
      }
    } catch (error) {
      console.error("Failed to fetch analytics:", error);
    }
  };

  const StatCard = ({
    title,
    value,
    description,
    icon: Icon,
    gradient,
    delay,
  }: {
    title: string;
    value: number | string;
    description: string;
    icon: any;
    gradient: string;
    delay: number;
  }) => (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay }}
    >
      <Card className="border-0 bg-gradient-to-br from-white/50 to-white/30 dark:from-zinc-900/50 dark:to-zinc-900/30 backdrop-blur-md hover:shadow-lg transition-shadow">
        <CardContent className="p-6">
          <div className="flex items-start justify-between">
            <div>
              <p className="text-sm font-medium text-zinc-600 dark:text-zinc-400">
                {title}
              </p>
              <p className="text-3xl md:text-4xl font-extrabold mt-2 text-zinc-900 dark:text-zinc-100">
                {value}
              </p>
              <p className="text-xs text-zinc-500 dark:text-zinc-500 mt-2">
                {description}
              </p>
            </div>
            <div className={`p-3 rounded-lg ${gradient}`}>
              <Icon className="w-6 h-6 text-white" />
            </div>
          </div>
        </CardContent>
      </Card>
    </motion.div>
  );

  return (
    <div className="space-y-6">
      {/* Main Stats Grid */}
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 0.1 }}
        className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4"
      >
        <StatCard
          title="Total Registrations"
          value={stats?.totalRegistrations || 0}
          description="All registered players"
          icon={Users}
          gradient="bg-gradient-to-br from-sky-500 to-blue-600"
          delay={0.1}
        />
        <StatCard
          title="Pass Registrations"
          value={stats?.passRegistrations || 0}
          description="ICS'25 pass holders"
          icon={Trophy}
          gradient="bg-gradient-to-br from-amber-500 to-orange-600"
          delay={0.2}
        />
        <StatCard
          title="GameOn Registrations"
          value={stats?.gameOnRegistrations || 0}
          description="Gaming tournament"
          icon={Gamepad2}
          gradient="bg-gradient-to-br from-purple-500 to-pink-600"
          delay={0.3}
        />
        <StatCard
          title="Paid Registrations"
          value={stats?.byStatus.paid || 0}
          description="Payment completed"
          icon={CheckCircle2}
          gradient="bg-gradient-to-br from-green-500 to-emerald-600"
          delay={0.4}
        />
      </motion.div>

      {/* Detailed Tabs */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.5 }}
      >
        <Tabs value={activeSubTab} onValueChange={setActiveSubTab} className="w-full">
          <TabsList className="grid w-full grid-cols-3 mb-6 bg-white/50 dark:bg-zinc-900/50 border border-white/20 dark:border-zinc-800/50 p-1 rounded-xl">
            <TabsTrigger value="overview" className="flex items-center gap-2">
              <TrendingUp className="w-4 h-4" />
              <span className="hidden sm:inline">Overview</span>
            </TabsTrigger>
            <TabsTrigger value="games" className="flex items-center gap-2">
              <Gamepad2 className="w-4 h-4" />
              <span className="hidden sm:inline">Games</span>
            </TabsTrigger>
            <TabsTrigger value="payments" className="flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4" />
              <span className="hidden sm:inline">Payments</span>
            </TabsTrigger>
          </TabsList>

          {/* Overview */}
          <TabsContent value="overview" className="space-y-4">
            <Card className="border-0 bg-gradient-to-br from-white/50 to-white/30 dark:from-zinc-900/50 dark:to-zinc-900/30 backdrop-blur-md">
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <TrendingUp className="w-5 h-5 text-sky-500" />
                  Registration Overview
                </CardTitle>
                <CardDescription>
                  Summary of all ICS'25 event registrations
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                  <div className="p-4 rounded-lg bg-sky-500/10 border border-sky-500/20">
                    <p className="text-sm text-zinc-600 dark:text-zinc-400">
                      Total Registrations
                    </p>
                    <p className="text-2xl font-bold text-sky-600 dark:text-sky-400 mt-2">
                      {stats?.totalRegistrations || 0}
                    </p>
                  </div>
                  <div className="p-4 rounded-lg bg-green-500/10 border border-green-500/20">
                    <p className="text-sm text-zinc-600 dark:text-zinc-400">
                      Paid ✓
                    </p>
                    <p className="text-2xl font-bold text-green-600 dark:text-green-400 mt-2">
                      {stats?.byStatus.paid || 0}
                    </p>
                  </div>
                  <div className="p-4 rounded-lg bg-amber-500/10 border border-amber-500/20">
                    <p className="text-sm text-zinc-600 dark:text-zinc-400">
                      Pending
                    </p>
                    <p className="text-2xl font-bold text-amber-600 dark:text-amber-400 mt-2">
                      {stats?.byStatus.pending || 0}
                    </p>
                  </div>
                </div>

                <div className="p-4 rounded-lg bg-gradient-to-r from-blue-500/10 to-purple-500/10 border border-blue-500/20">
                  <h4 className="font-semibold text-zinc-900 dark:text-zinc-100 mb-3">
                    Quick Stats
                  </h4>
                  <div className="space-y-2 text-sm">
                    <div className="flex items-center justify-between">
                      <span className="text-zinc-600 dark:text-zinc-400">
                        Conversion Rate
                      </span>
                      <Badge className="bg-sky-500/20 text-sky-700 dark:text-sky-400 border-sky-500/30">
                        {stats?.byStatus.paid && stats?.totalRegistrations
                          ? Math.round((stats.byStatus.paid / stats.totalRegistrations) * 100)
                          : 0}
                        %
                      </Badge>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-zinc-600 dark:text-zinc-400">
                        Average Status
                      </span>
                      <Badge className="bg-amber-500/20 text-amber-700 dark:text-amber-400 border-amber-500/30">
                        {stats?.byStatus.pending && stats?.totalRegistrations
                          ? Math.round((stats.byStatus.pending / stats.totalRegistrations) * 100)
                          : 0}
                        % Pending
                      </Badge>
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          {/* Games Tab - Displays by game breakdown */}
          <TabsContent value="games" className="space-y-4">
            <Card className="border-0 bg-gradient-to-br from-white/50 to-white/30 dark:from-zinc-900/50 dark:to-zinc-900/30 backdrop-blur-md">
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Gamepad2 className="w-5 h-5 text-purple-500" />
                  Game Distribution
                </CardTitle>
                <CardDescription>
                  Breakdown of registrations by game type
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {/* Valorant */}
                  <div className="p-6 rounded-lg bg-gradient-to-br from-red-500/10 to-orange-500/10 border border-red-500/20">
                    <div className="flex items-start justify-between mb-4">
                      <div>
                        <p className="text-sm font-medium text-zinc-600 dark:text-zinc-400">
                          Valorant Teams
                        </p>
                        <p className="text-3xl font-bold text-red-600 dark:text-red-400 mt-2">
                          {stats?.byGame.valorant || 0}
                        </p>
                      </div>
                      <div className="p-2 rounded-lg bg-red-500/20">
                        <Gamepad2 className="w-6 h-6 text-red-600 dark:text-red-400" />
                      </div>
                    </div>
                    <div className="text-xs text-zinc-600 dark:text-zinc-400">
                      <p>5v5 Teams • ₹500 per team</p>
                      <p className="text-red-600 dark:text-red-400 font-semibold mt-2">
                        Prize: ₹10,000 + ₹5,000 + ₹3,000
                      </p>
                    </div>
                  </div>

                  {/* BGMI */}
                  <div className="p-6 rounded-lg bg-gradient-to-br from-blue-500/10 to-cyan-500/10 border border-blue-500/20">
                    <div className="flex items-start justify-between mb-4">
                      <div>
                        <p className="text-sm font-medium text-zinc-600 dark:text-zinc-400">
                          BGMI Teams
                        </p>
                        <p className="text-3xl font-bold text-blue-600 dark:text-blue-400 mt-2">
                          {stats?.byGame.bgmi || 0}
                        </p>
                      </div>
                      <div className="p-2 rounded-lg bg-blue-500/20">
                        <Gamepad2 className="w-6 h-6 text-blue-600 dark:text-blue-400" />
                      </div>
                    </div>
                    <div className="text-xs text-zinc-600 dark:text-zinc-400">
                      <p>4v4 Teams • ₹500 per team</p>
                      <p className="text-blue-600 dark:text-blue-400 font-semibold mt-2">
                        Prize: ₹7,000 + ₹4,000 + ₹2,000
                      </p>
                    </div>
                  </div>
                </div>

                {/* Distribution bars */}
                <div className="p-4 rounded-lg bg-zinc-100 dark:bg-zinc-800/30">
                  <p className="text-sm font-medium text-zinc-700 dark:text-zinc-300 mb-3">
                    Distribution
                  </p>
                  <div className="space-y-2">
                    <div>
                      <div className="flex justify-between text-sm mb-1">
                        <span className="text-zinc-600 dark:text-zinc-400">Valorant</span>
                        <span className="font-semibold">
                          {stats?.byGame.valorant && stats?.gameOnRegistrations
                            ? Math.round(
                                (stats.byGame.valorant /
                                  stats.gameOnRegistrations) *
                                  100
                              )
                            : 0}
                          %
                        </span>
                      </div>
                      <div className="w-full h-2 bg-zinc-300 dark:bg-zinc-700 rounded-full overflow-hidden">
                        <div
                          className="h-full bg-gradient-to-r from-red-500 to-orange-500"
                          style={{
                            width: `${
                              stats?.byGame.valorant && stats?.gameOnRegistrations
                                ? (stats.byGame.valorant /
                                    stats.gameOnRegistrations) *
                                  100
                                : 0
                            }%`,
                          }}
                        />
                      </div>
                    </div>
                    <div>
                      <div className="flex justify-between text-sm mb-1">
                        <span className="text-zinc-600 dark:text-zinc-400">BGMI</span>
                        <span className="font-semibold">
                          {stats?.byGame.bgmi && stats?.gameOnRegistrations
                            ? Math.round(
                                (stats.byGame.bgmi / stats.gameOnRegistrations) *
                                  100
                              )
                            : 0}
                          %
                        </span>
                      </div>
                      <div className="w-full h-2 bg-zinc-300 dark:bg-zinc-700 rounded-full overflow-hidden">
                        <div
                          className="h-full bg-gradient-to-r from-blue-500 to-cyan-500"
                          style={{
                            width: `${
                              stats?.byGame.bgmi && stats?.gameOnRegistrations
                                ? (stats.byGame.bgmi /
                                    stats.gameOnRegistrations) *
                                  100
                                : 0
                            }%`,
                          }}
                        />
                      </div>
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          {/* Payments */}
          <TabsContent value="payments" className="space-y-4">
            <Card className="border-0 bg-gradient-to-br from-white/50 to-white/30 dark:from-zinc-900/50 dark:to-zinc-900/30 backdrop-blur-md">
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <CheckCircle2 className="w-5 h-5 text-green-500" />
                  Payment Status
                </CardTitle>
                <CardDescription>
                  Overview of payment completions
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="p-6 rounded-lg bg-gradient-to-br from-green-500/10 to-emerald-500/10 border border-green-500/20">
                    <div className="flex items-start justify-between mb-4">
                      <div>
                        <p className="text-sm font-medium text-zinc-600 dark:text-zinc-400">
                          Payments Completed
                        </p>
                        <p className="text-3xl font-bold text-green-600 dark:text-green-400 mt-2">
                          {stats?.byStatus.paid || 0}
                        </p>
                      </div>
                      <div className="p-2 rounded-lg bg-green-500/20">
                        <CheckCircle2 className="w-6 h-6 text-green-600 dark:text-green-400" />
                      </div>
                    </div>
                    <p className="text-xs text-zinc-600 dark:text-zinc-400">
                      Revenue: ₹{((stats?.byStatus.paid || 0) * 500).toLocaleString()}
                    </p>
                  </div>

                  <div className="p-6 rounded-lg bg-gradient-to-br from-amber-500/10 to-orange-500/10 border border-amber-500/20">
                    <div className="flex items-start justify-between mb-4">
                      <div>
                        <p className="text-sm font-medium text-zinc-600 dark:text-zinc-400">
                          Pending Payments
                        </p>
                        <p className="text-3xl font-bold text-amber-600 dark:text-amber-400 mt-2">
                          {stats?.byStatus.pending || 0}
                        </p>
                      </div>
                      <div className="p-2 rounded-lg bg-amber-500/20">
                        <Clock className="w-6 h-6 text-amber-600 dark:text-amber-400" />
                      </div>
                    </div>
                    <p className="text-xs text-zinc-600 dark:text-zinc-400">
                      Potential: ₹{((stats?.byStatus.pending || 0) * 500).toLocaleString()}
                    </p>
                  </div>
                </div>

                {/* Payment Progress */}
                <div className="p-4 rounded-lg bg-zinc-100 dark:bg-zinc-800/30">
                  <p className="text-sm font-medium text-zinc-700 dark:text-zinc-300 mb-3">
                    Overall Progress
                  </p>
                  <div className="space-y-1">
                    <div className="flex justify-between text-sm">
                      <span className="text-zinc-600 dark:text-zinc-400">
                        Payment Completion Rate
                      </span>
                      <span className="font-semibold">
                        {stats?.byStatus.paid && stats?.gameOnRegistrations
                          ? Math.round(
                              (stats.byStatus.paid / stats.gameOnRegistrations) *
                                100
                            )
                          : 0}
                        %
                      </span>
                    </div>
                    <div className="w-full h-3 bg-zinc-300 dark:bg-zinc-700 rounded-full overflow-hidden">
                      <div
                        className="h-full bg-gradient-to-r from-green-500 to-emerald-500"
                        style={{
                          width: `${
                            stats?.byStatus.paid && stats?.gameOnRegistrations
                              ? (stats.byStatus.paid /
                                  stats.gameOnRegistrations) *
                                100
                              : 0
                          }%`,
                        }}
                      />
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </motion.div>

      {/* Last Updated */}
      <div className="text-xs text-zinc-500 dark:text-zinc-400 text-center py-4">
        Data updates every 30 seconds • Last updated just now
      </div>
    </div>
  );
}
