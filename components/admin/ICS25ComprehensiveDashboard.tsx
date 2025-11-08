"use client";

import { useEffect, useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Loader2, Users, DollarSign, Clock, Trophy, Gamepad2, UserCheck, CheckCircle2, XCircle, ExternalLink } from "lucide-react";
import { motion } from "framer-motion";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Progress } from "@/components/ui/progress";
import Link from "next/link";

type TierKey = 'bronze' | 'silver' | 'gold' | 'platinum' | 'creators';

const PASS_PRICES: Record<TierKey, number> = {
  bronze: 0,
  silver: 0,
  gold: 2500,
  platinum: 5000,
  creators: 3000,
};
const GAMEON_PRICE = 500;

interface DashboardData {
  gameOn: {
    totalPlayers: number;
    byGame: {
      valorant: { total: number; paid: number; pending: number };
      bgmi: { total: number; paid: number; pending: number };
    };
    byPaymentStatus: {
      paid: number;
      pending: number;
    };
    cashbackTasks: {
      total: number;
      pending: number;
      approved: number;
    };
  };
  passes: {
    totalAttendees: number;
    byTier: {
      bronze: { total: number; paid: number; pending: number };
      silver: { total: number; paid: number; pending: number };
      gold: { total: number; paid: number; pending: number };
      platinum: { total: number; paid: number; pending: number };
      creators: { total: number; paid: number; pending: number };
    };
    byPaymentStatus: {
      paid: number;
      pending: number;
    };
  };
  creators: {
    total: number;
    pending: number;
    approved: number;
    rejected: number;
  };
  approvals: {
    bronzePromotionsPending: number;
    creatorUpgradesPending: number;
  };
}

export default function ICS25ComprehensiveDashboard() {
  const [data, setData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState("overview");

  useEffect(() => {
    fetchDashboardData();
    const interval = setInterval(fetchDashboardData, 30000);
    return () => clearInterval(interval);
  }, []);

  const fetchDashboardData = async () => {
    try {
      const res = await fetch("/api/ics25/admin/dashboard");
      const result = await res.json();
      if (result.ok) {
        setData(result.data);
      }
    } catch (error) {
      console.error("Failed to fetch dashboard data:", error);
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="w-8 h-8 animate-spin text-sky-500" />
      </div>
    );
  }

  if (!data) {
    return (
      <div className="text-center py-20">
        <p className="text-zinc-600 dark:text-zinc-400">Failed to load dashboard data</p>
      </div>
    );
  }

  // Calculate revenue using up-to-date pricing
  const passRevenue = (['bronze','silver','gold','creators'] as TierKey[]).reduce((sum, t) => {
    const paid = (data.passes.byTier as any)[t]?.paid || 0;
    return sum + paid * PASS_PRICES[t];
  }, 0);
  const gameOnRevenue = (data.gameOn.byPaymentStatus?.paid || 0) * GAMEON_PRICE;
  const totalRevenue = passRevenue + gameOnRevenue;
  const totalPendingApprovals = data.approvals.bronzePromotionsPending + data.approvals.creatorUpgradesPending + data.gameOn.cashbackTasks.pending;

  return (
    <div className="space-y-6">
      {/* Tabs */}
      <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
        <TabsList className="grid grid-cols-5 w-full bg-white/50 dark:bg-zinc-900/50 border border-zinc-200 dark:border-zinc-800 p-1 rounded-xl">
          <TabsTrigger value="overview" className="data-[state=active]:bg-gradient-to-r data-[state=active]:from-sky-500 data-[state=active]:to-blue-500 data-[state=active]:text-white">
            Overview
          </TabsTrigger>
          <TabsTrigger value="passes" className="data-[state=active]:bg-gradient-to-r data-[state=active]:from-purple-500 data-[state=active]:to-pink-500 data-[state=active]:text-white">
            Passes
          </TabsTrigger>
          <TabsTrigger value="gameon" className="data-[state=active]:bg-gradient-to-r data-[state=active]:from-orange-500 data-[state=active]:to-red-500 data-[state=active]:text-white">
            GameOn
          </TabsTrigger>
          <TabsTrigger value="creators" className="data-[state=active]:bg-gradient-to-r data-[state=active]:from-green-500 data-[state=active]:to-emerald-500 data-[state=active]:text-white">
            Creators
          </TabsTrigger>
          <TabsTrigger value="approvals" className="data-[state=active]:bg-gradient-to-r data-[state=active]:from-fuchsia-500 data-[state=active]:to-violet-500 data-[state=active]:text-white">
            Approvals
          </TabsTrigger>
        </TabsList>

        {/* Overview Tab */}
        <TabsContent value="overview" className="space-y-6 mt-6">
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4"
          >
            {/* Total Attendees */}
            <Card className="border-0 bg-gradient-to-br from-sky-500/10 to-blue-500/10">
              <CardContent className="p-6">
                <div className="flex items-start justify-between">
                  <div>
                    <p className="text-sm font-medium text-zinc-600 dark:text-zinc-400">Total Attendees</p>
                    <p className="text-4xl font-extrabold mt-2 text-zinc-900 dark:text-zinc-100">
                      {(data.passes?.totalAttendees || 0).toLocaleString()}
                    </p>
                    <p className="text-xs text-zinc-500 mt-2">Pass holders</p>
                  </div>
                  <div className="p-3 rounded-lg bg-sky-500/20">
                    <Users className="w-6 h-6 text-sky-600 dark:text-sky-400" />
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* GameOn Players */}
            <Card className="border-0 bg-gradient-to-br from-orange-500/10 to-red-500/10">
              <CardContent className="p-6">
                <div className="flex items-start justify-between">
                  <div>
                    <p className="text-sm font-medium text-zinc-600 dark:text-zinc-400">GameOn Players</p>
                    <p className="text-4xl font-extrabold mt-2 text-zinc-900 dark:text-zinc-100">
                      {(data.gameOn?.totalPlayers || 0).toLocaleString()}
                    </p>
                    <p className="text-xs text-zinc-500 mt-2">Active gamers</p>
                  </div>
                  <div className="p-3 rounded-lg bg-orange-500/20">
                    <Gamepad2 className="w-6 h-6 text-orange-600 dark:text-orange-400" />
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Revenue */}
            <Card className="border-0 bg-gradient-to-br from-green-500/10 to-emerald-500/10">
              <CardContent className="p-6">
                <div className="flex items-start justify-between">
                  <div>
                    <p className="text-sm font-medium text-zinc-600 dark:text-zinc-400">Revenue (Confirmed)</p>
                    <p className="text-4xl font-extrabold mt-2 text-zinc-900 dark:text-zinc-100">
                      ₹{isNaN(totalRevenue) ? 0 : (totalRevenue / 1000).toFixed(0)}K
                    </p>
                    <p className="text-xs text-zinc-500 mt-2">Paid only</p>
                  </div>
                  <div className="p-3 rounded-lg bg-green-500/20">
                    <DollarSign className="w-6 h-6 text-green-600 dark:text-green-400" />
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Pending Approvals */}
            <Card className="border-0 bg-gradient-to-br from-fuchsia-500/10 to-violet-500/10">
              <CardContent className="p-6">
                <div className="flex items-start justify-between">
                  <div>
                    <p className="text-sm font-medium text-zinc-600 dark:text-zinc-400">Pending Approvals</p>
                    <p className="text-4xl font-extrabold mt-2 text-zinc-900 dark:text-zinc-100">
                      {totalPendingApprovals}
                    </p>
                    <p className="text-xs text-zinc-500 mt-2">Require action</p>
                  </div>
                  <div className="p-3 rounded-lg bg-fuchsia-500/20">
                    <Clock className="w-6 h-6 text-fuchsia-600 dark:text-fuchsia-400" />
                  </div>
                </div>
              </CardContent>
            </Card>
          </motion.div>

          {/* Quick Stats */}
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.1 }}
          >
            <Card>
              <CardHeader>
                <CardTitle>Quick Overview</CardTitle>
                <CardDescription>Key metrics at a glance</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                  <div className="p-4 rounded-lg bg-zinc-50 dark:bg-zinc-900">
                    <p className="text-2xl font-bold text-zinc-900 dark:text-zinc-100">
                      {data.passes.byPaymentStatus.paid}
                    </p>
                    <p className="text-xs text-zinc-600 dark:text-zinc-400 mt-1">Passes Paid</p>
                  </div>
                  <div className="p-4 rounded-lg bg-zinc-50 dark:bg-zinc-900">
                    <p className="text-2xl font-bold text-zinc-900 dark:text-zinc-100">
                      {data.passes.byPaymentStatus.pending}
                    </p>
                    <p className="text-xs text-zinc-600 dark:text-zinc-400 mt-1">Passes Pending</p>
                  </div>
                  <div className="p-4 rounded-lg bg-zinc-50 dark:bg-zinc-900">
                    <p className="text-2xl font-bold text-zinc-900 dark:text-zinc-100">
                      {data.gameOn.byPaymentStatus.paid}
                    </p>
                    <p className="text-xs text-zinc-600 dark:text-zinc-400 mt-1">GameOn Paid</p>
                  </div>
                  <div className="p-4 rounded-lg bg-zinc-50 dark:bg-zinc-900">
                    <p className="text-2xl font-bold text-zinc-900 dark:text-zinc-100">
                      {data.creators.approved}
                    </p>
                    <p className="text-xs text-zinc-600 dark:text-zinc-400 mt-1">Creators Approved</p>
                  </div>
                </div>
              </CardContent>
            </Card>
          </motion.div>
        </TabsContent>

        {/* Passes Tab */}
        <TabsContent value="passes" className="space-y-6 mt-6">
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
          >
            <Card>
              <CardHeader>
                <CardTitle>Pass Distribution by Tier</CardTitle>
                <CardDescription>Breakdown of attendees across all tiers</CardDescription>
              </CardHeader>
              <CardContent className="space-y-6">
                {Object.entries(data.passes.byTier).map(([tier, stats]) => (
                  <div key={tier}>
                    <div className="flex items-center justify-between mb-2">
                      <div className="flex items-center gap-3">
                        <Badge variant="outline" className="capitalize">{tier}</Badge>
                        <span className="text-sm font-medium text-zinc-700 dark:text-zinc-300">
                          {stats.total} total
                        </span>
                      </div>
                      <div className="flex items-center gap-4">
                        <span className="text-xs text-green-600 dark:text-green-400">
                          {stats.paid} paid
                        </span>
                        <span className="text-xs text-orange-600 dark:text-orange-400">
                          {stats.pending} pending
                        </span>
                      </div>
                    </div>
                    <Progress 
                      value={stats.total > 0 ? (stats.paid / stats.total) * 100 : 0} 
                      className="h-2"
                    />
                    <div className="flex justify-between mt-1">
                      <span className="text-xs text-zinc-500">
                        {stats.total > 0 ? ((stats.paid / stats.total) * 100).toFixed(1) : 0}% paid
                      </span>
                      <span className="text-xs font-medium text-zinc-700 dark:text-zinc-300">
                        {(() => {
                          // infer tier key from map iteration key
                          const tierKey = tier as TierKey;
                          const price = PASS_PRICES[tierKey as TierKey] ?? 0;
                          const revenue = (stats.paid || 0) * price;
                          return `₹${isNaN(revenue) ? 0 : revenue.toLocaleString()} revenue`;
                        })()}
                      </span>
                    </div>
                  </div>
                ))}
              </CardContent>
            </Card>
          </motion.div>

          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.1 }}
            className="grid grid-cols-1 md:grid-cols-3 gap-4"
          >
            <Card className="border-0 bg-gradient-to-br from-purple-500/10 to-pink-500/10">
              <CardContent className="p-6">
                <p className="text-sm font-medium text-zinc-600 dark:text-zinc-400">Total Revenue</p>
                <p className="text-3xl font-extrabold mt-2 text-zinc-900 dark:text-zinc-100">
                  ₹{isNaN(passRevenue) ? 0 : passRevenue.toLocaleString()}
                </p>
                <p className="text-xs text-zinc-500 mt-2">From pass sales</p>
              </CardContent>
            </Card>

            <Card className="border-0 bg-gradient-to-br from-green-500/10 to-emerald-500/10">
              <CardContent className="p-6">
                <p className="text-sm font-medium text-zinc-600 dark:text-zinc-400">Payment Rate</p>
                <p className="text-3xl font-extrabold mt-2 text-zinc-900 dark:text-zinc-100">
                  {data.passes.totalAttendees > 0 ? ((data.passes.byPaymentStatus.paid / data.passes.totalAttendees) * 100).toFixed(1) : 0}%
                </p>
                <p className="text-xs text-zinc-500 mt-2">Completion rate</p>
              </CardContent>
            </Card>

            <Card className="border-0 bg-gradient-to-br from-orange-500/10 to-red-500/10">
              <CardContent className="p-6">
                <p className="text-sm font-medium text-zinc-600 dark:text-zinc-400">Pending Payments</p>
                <p className="text-3xl font-extrabold mt-2 text-zinc-900 dark:text-zinc-100">
                  {data.passes.byPaymentStatus.pending}
                </p>
                <p className="text-xs text-zinc-500 mt-2">Awaiting payment</p>
              </CardContent>
            </Card>
          </motion.div>
        </TabsContent>

        {/* GameOn Tab */}
        <TabsContent value="gameon" className="space-y-6 mt-6">
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
          >
            <Card>
              <CardHeader>
                <CardTitle>Game Distribution</CardTitle>
                <CardDescription>Player breakdown across games</CardDescription>
              </CardHeader>
              <CardContent className="space-y-6">
                {Object.entries(data.gameOn.byGame).map(([game, stats]) => (
                  <div key={game}>
                    <div className="flex items-center justify-between mb-2">
                      <div className="flex items-center gap-3">
                        <Badge variant="outline" className="uppercase">{game}</Badge>
                        <span className="text-sm font-medium text-zinc-700 dark:text-zinc-300">
                          {stats.total} players
                        </span>
                      </div>
                      <div className="flex items-center gap-4">
                        <span className="text-xs text-green-600 dark:text-green-400">
                          {stats.paid} paid
                        </span>
                        <span className="text-xs text-orange-600 dark:text-orange-400">
                          {stats.pending} pending
                        </span>
                      </div>
                    </div>
                    <Progress 
                      value={stats.total > 0 ? (stats.paid / stats.total) * 100 : 0} 
                      className="h-2"
                    />
                    <div className="flex justify-between mt-1">
                      <span className="text-xs text-zinc-500">
                        {stats.total > 0 ? ((stats.paid / stats.total) * 100).toFixed(1) : 0}% paid
                      </span>
                      <span className="text-xs font-medium text-zinc-700 dark:text-zinc-300">
                        ₹{isNaN(stats.paid * GAMEON_PRICE) ? 0 : (stats.paid * GAMEON_PRICE).toLocaleString()} revenue
                      </span>
                    </div>
                  </div>
                ))}
              </CardContent>
            </Card>
          </motion.div>

          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.1 }}
            className="grid grid-cols-1 md:grid-cols-2 gap-4"
          >
            <Card>
              <CardHeader>
                <CardTitle>Cashback Tasks</CardTitle>
                <CardDescription>Submission and approval status</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="flex items-center justify-between p-4 rounded-lg bg-zinc-50 dark:bg-zinc-900">
                  <div className="flex items-center gap-3">
                    <CheckCircle2 className="w-5 h-5 text-green-500" />
                    <span className="text-sm font-medium">Approved</span>
                  </div>
                  <span className="text-xl font-bold">{data.gameOn.cashbackTasks.approved}</span>
                </div>
                <div className="flex items-center justify-between p-4 rounded-lg bg-zinc-50 dark:bg-zinc-900">
                  <div className="flex items-center gap-3">
                    <Clock className="w-5 h-5 text-orange-500" />
                    <span className="text-sm font-medium">Pending</span>
                  </div>
                  <span className="text-xl font-bold">{data.gameOn.cashbackTasks.pending}</span>
                </div>
                <div className="flex items-center justify-between p-4 rounded-lg bg-zinc-50 dark:bg-zinc-900">
                  <div className="flex items-center gap-3">
                    <Trophy className="w-5 h-5 text-sky-500" />
                    <span className="text-sm font-medium">Total Submissions</span>
                  </div>
                  <span className="text-xl font-bold">{data.gameOn.cashbackTasks.total}</span>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Revenue Overview</CardTitle>
                <CardDescription>GameOn earnings</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="p-6 rounded-lg bg-gradient-to-br from-green-500/10 to-emerald-500/10">
                  <p className="text-sm font-medium text-zinc-600 dark:text-zinc-400">Total Revenue</p>
                  <p className="text-4xl font-extrabold mt-2 text-zinc-900 dark:text-zinc-100">
                    ₹{isNaN(gameOnRevenue) ? 0 : gameOnRevenue.toLocaleString()}
                  </p>
                  <p className="text-xs text-zinc-500 mt-2">From {data.gameOn?.byPaymentStatus?.paid || 0} paid registrations</p>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div className="p-4 rounded-lg bg-zinc-50 dark:bg-zinc-900">
                    <p className="text-sm text-zinc-600 dark:text-zinc-400">VALORANT</p>
                    <p className="text-xl font-bold mt-1">₹{isNaN(data.gameOn?.byGame?.valorant?.paid * GAMEON_PRICE) ? 0 : (data.gameOn.byGame.valorant.paid * GAMEON_PRICE).toLocaleString()}</p>
                  </div>
                  <div className="p-4 rounded-lg bg-zinc-50 dark:bg-zinc-900">
                    <p className="text-sm text-zinc-600 dark:text-zinc-400">BGMI</p>
                    <p className="text-xl font-bold mt-1">₹{isNaN(data.gameOn?.byGame?.bgmi?.paid * GAMEON_PRICE) ? 0 : (data.gameOn.byGame.bgmi.paid * GAMEON_PRICE).toLocaleString()}</p>
                  </div>
                </div>
              </CardContent>
            </Card>
          </motion.div>
        </TabsContent>

        {/* Creators Tab */}
        <TabsContent value="creators" className="space-y-6 mt-6">
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            className="grid grid-cols-1 md:grid-cols-4 gap-4"
          >
            <Card className="border-0 bg-gradient-to-br from-sky-500/10 to-blue-500/10">
              <CardContent className="p-6">
                <p className="text-sm font-medium text-zinc-600 dark:text-zinc-400">Total Applications</p>
                <p className="text-4xl font-extrabold mt-2 text-zinc-900 dark:text-zinc-100">
                  {data.creators.total}
                </p>
                <p className="text-xs text-zinc-500 mt-2">All time</p>
              </CardContent>
            </Card>

            <Card className="border-0 bg-gradient-to-br from-orange-500/10 to-red-500/10">
              <CardContent className="p-6">
                <p className="text-sm font-medium text-zinc-600 dark:text-zinc-400">Pending Review</p>
                <p className="text-4xl font-extrabold mt-2 text-zinc-900 dark:text-zinc-100">
                  {data.creators.pending}
                </p>
                <p className="text-xs text-zinc-500 mt-2">Awaiting decision</p>
              </CardContent>
            </Card>

            <Card className="border-0 bg-gradient-to-br from-green-500/10 to-emerald-500/10">
              <CardContent className="p-6">
                <p className="text-sm font-medium text-zinc-600 dark:text-zinc-400">Approved</p>
                <p className="text-4xl font-extrabold mt-2 text-zinc-900 dark:text-zinc-100">
                  {data.creators.approved}
                </p>
                <p className="text-xs text-zinc-500 mt-2">Active creators</p>
              </CardContent>
            </Card>

            <Card className="border-0 bg-gradient-to-br from-red-500/10 to-pink-500/10">
              <CardContent className="p-6">
                <p className="text-sm font-medium text-zinc-600 dark:text-zinc-400">Rejected</p>
                <p className="text-4xl font-extrabold mt-2 text-zinc-900 dark:text-zinc-100">
                  {data.creators.rejected}
                </p>
                <p className="text-xs text-zinc-500 mt-2">Not approved</p>
              </CardContent>
            </Card>
          </motion.div>

          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.1 }}
          >
            <Card>
              <CardHeader>
                <CardTitle>Approval Statistics</CardTitle>
                <CardDescription>Creator application outcomes</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-sm font-medium">Approval Rate</span>
                    <span className="text-sm font-bold text-green-600">
                      {data.creators.total > 0 ? ((data.creators.approved / data.creators.total) * 100).toFixed(1) : 0}%
                    </span>
                  </div>
                  <Progress 
                    value={data.creators.total > 0 ? (data.creators.approved / data.creators.total) * 100 : 0} 
                    className="h-2"
                  />
                </div>
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-sm font-medium">Rejection Rate</span>
                    <span className="text-sm font-bold text-red-600">
                      {data.creators.total > 0 ? ((data.creators.rejected / data.creators.total) * 100).toFixed(1) : 0}%
                    </span>
                  </div>
                  <Progress 
                    value={data.creators.total > 0 ? (data.creators.rejected / data.creators.total) * 100 : 0} 
                    className="h-2 [&>div]:bg-red-500"
                  />
                </div>
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-sm font-medium">Pending Review</span>
                    <span className="text-sm font-bold text-orange-600">
                      {data.creators.total > 0 ? ((data.creators.pending / data.creators.total) * 100).toFixed(1) : 0}%
                    </span>
                  </div>
                  <Progress 
                    value={data.creators.total > 0 ? (data.creators.pending / data.creators.total) * 100 : 0} 
                    className="h-2 [&>div]:bg-orange-500"
                  />
                </div>
              </CardContent>
            </Card>
          </motion.div>

          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.2 }}
          >
            <Card>
              <CardContent className="p-6">
                <Link href="/admin/creator-approvals">
                  <Button className="w-full bg-gradient-to-r from-sky-500 to-blue-500 hover:from-sky-600 hover:to-blue-600">
                    <UserCheck className="w-4 h-4 mr-2" />
                    Manage Creator Applications
                    <ExternalLink className="w-4 h-4 ml-2" />
                  </Button>
                </Link>
              </CardContent>
            </Card>
          </motion.div>
        </TabsContent>

        {/* Approvals Tab */}
        <TabsContent value="approvals" className="space-y-6 mt-6">
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
          >
            <Card>
              <CardHeader>
                <CardTitle>Pending Approvals</CardTitle>
                <CardDescription>Items requiring your attention</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="p-6 rounded-lg border-2 border-orange-200 dark:border-orange-900 bg-orange-50 dark:bg-orange-950/20">
                  <div className="flex items-center justify-between mb-4">
                    <div className="flex items-center gap-3">
                      <div className="p-2 rounded-lg bg-orange-500/20">
                        <Trophy className="w-5 h-5 text-orange-600 dark:text-orange-400" />
                      </div>
                      <div>
                        <h3 className="font-semibold text-zinc-900 dark:text-zinc-100">Bronze Pass Promotions</h3>
                        <p className="text-sm text-zinc-600 dark:text-zinc-400">Upgrade requests pending</p>
                      </div>
                    </div>
                    <Badge variant="secondary" className="bg-orange-200 text-orange-900 dark:bg-orange-900 dark:text-orange-100">
                      {data.approvals.bronzePromotionsPending} pending
                    </Badge>
                  </div>
                  <Link href="/admin/bronze-promotions">
                    <Button className="w-full" variant="outline">
                      Review Bronze Promotions
                      <ExternalLink className="w-4 h-4 ml-2" />
                    </Button>
                  </Link>
                </div>

                <div className="p-6 rounded-lg border-2 border-sky-200 dark:border-sky-900 bg-sky-50 dark:bg-sky-950/20">
                  <div className="flex items-center justify-between mb-4">
                    <div className="flex items-center gap-3">
                      <div className="p-2 rounded-lg bg-sky-500/20">
                        <UserCheck className="w-5 h-5 text-sky-600 dark:text-sky-400" />
                      </div>
                      <div>
                        <h3 className="font-semibold text-zinc-900 dark:text-zinc-100">Creator Upgrades</h3>
                        <p className="text-sm text-zinc-600 dark:text-zinc-400">Applications awaiting review</p>
                      </div>
                    </div>
                    <Badge variant="secondary" className="bg-sky-200 text-sky-900 dark:bg-sky-900 dark:text-sky-100">
                      {data.approvals.creatorUpgradesPending} pending
                    </Badge>
                  </div>
                  <Link href="/admin/creator-approvals">
                    <Button className="w-full" variant="outline">
                      Review Creator Applications
                      <ExternalLink className="w-4 h-4 ml-2" />
                    </Button>
                  </Link>
                </div>

                <div className="p-6 rounded-lg border-2 border-green-200 dark:border-green-900 bg-green-50 dark:bg-green-950/20">
                  <div className="flex items-center justify-between mb-4">
                    <div className="flex items-center gap-3">
                      <div className="p-2 rounded-lg bg-green-500/20">
                        <Gamepad2 className="w-5 h-5 text-green-600 dark:text-green-400" />
                      </div>
                      <div>
                        <h3 className="font-semibold text-zinc-900 dark:text-zinc-100">Cashback Tasks</h3>
                        <p className="text-sm text-zinc-600 dark:text-zinc-400">GameOn submissions to verify</p>
                      </div>
                    </div>
                    <Badge variant="secondary" className="bg-green-200 text-green-900 dark:bg-green-900 dark:text-green-100">
                      {data.gameOn.cashbackTasks.pending} pending
                    </Badge>
                  </div>
                  <Button className="w-full" variant="outline" disabled>
                    Coming Soon
                  </Button>
                </div>
              </CardContent>
            </Card>
          </motion.div>

          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.1 }}
          >
            <Card className="border-0 bg-gradient-to-br from-fuchsia-500/10 to-violet-500/10">
              <CardContent className="p-8 text-center">
                <Clock className="w-12 h-12 mx-auto mb-4 text-fuchsia-600 dark:text-fuchsia-400" />
                <h3 className="text-2xl font-bold text-zinc-900 dark:text-zinc-100 mb-2">
                  {totalPendingApprovals} Total Pending
                </h3>
                <p className="text-zinc-600 dark:text-zinc-400">
                  Items requiring immediate attention across all categories
                </p>
              </CardContent>
            </Card>
          </motion.div>
        </TabsContent>
      </Tabs>
    </div>
  );
}
