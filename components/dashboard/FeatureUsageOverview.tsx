"use client";

import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { useRouter } from 'next/navigation';
import { motion } from 'framer-motion';
import {
  Loader2,
  RefreshCw,
  Infinity,
  TrendingDown,
  Clock,
  Video,
  Scissors,
  Shield,
  Share2,
  MessageSquare,
  Music,
  ImageIcon
} from 'lucide-react';
import { getAllServiceLimitMappings } from '@/lib/config/serviceLimits';

interface ServiceUsageInfo {
  hasAccess: boolean;
  maxUsage: number;
  currentUsage: number;
  remaining: number;
  resetPeriod: "weekly" | "monthly" | "daily" | "none";
  lastReset?: Date;
  isUnlimited: boolean;
}

type ServiceUsageData = Record<string, Record<string, ServiceUsageInfo>>;

const serviceDisplayData: Record<string, {
  name: string;
  icon: React.ReactNode;
  color: string;
  path: string;
}> = {
  alyzitron: {
    name: 'Alyzitron',
    icon: <Video className="w-4 h-4" />,
    color: 'from-blue-500/10 to-blue-600/10 border-blue-200/20', // #3b82f6
    path: '/dashboard/alyzitron',
  },
  editron: {
    name: 'Editron',
    icon: <Scissors className="w-4 h-4" />,
    color: 'from-teal-500/10 to-teal-600/10 border-teal-200/20', // #14b8a6
    path: '/dashboard/editron',
  },
  shield: {
    name: 'Shield',
    icon: <Shield className="w-4 h-4" />,
    color: 'from-purple-500/10 to-purple-600/10 border-purple-200/20', // #a855f7
    path: '/dashboard/shield',
  },
  thinkforge: {
    name: 'ThinkForge',
    icon: <MessageSquare className="w-4 h-4" />,
    color: 'from-red-500/10 to-red-600/10 border-red-200/20', // #ef4444
    path: '/dashboard/thinkforge',
  },
  musitron: {
    name: 'Musitron',
    icon: <Music className="w-4 h-4" />,
    color: 'from-yellow-500/10 to-yellow-600/10 border-yellow-200/20', // #eab308
    path: '/dashboard/musitron',
  },
  clickatron: {
    name: 'Clickatron',
    icon: <ImageIcon className="w-4 h-4" />,
    color: 'from-violet-500/10 to-violet-600/10 border-violet-200/20',
    path: '/dashboard/clickatron',
  },
};

// Get limit display names from centralized configuration
const limitTypeDisplayNames = getAllServiceLimitMappings();

const getUsageColor = (current: number, max: number, isUnlimited: boolean): string => {
  if (isUnlimited || max === -1) return 'text-slate-600 dark:text-slate-300';
  if (max === 0) return 'text-slate-400';
  
  const percentage = (current / max) * 100;
  if (percentage >= 90) return 'text-slate-700 dark:text-slate-400';
  if (percentage >= 70) return 'text-slate-600 dark:text-slate-400';
  return 'text-slate-600 dark:text-slate-300';
};

const getProgressColor = (current: number, max: number, isUnlimited: boolean): string => {
  if (isUnlimited || max === -1) return 'bg-gradient-to-r from-blue-500 to-indigo-500';
  if (max === 0) return 'bg-slate-300 dark:bg-slate-600';
  
  const percentage = (current / max) * 100;
  if (percentage >= 90) return 'bg-gradient-to-r from-rose-500 to-red-500';
  if (percentage >= 70) return 'bg-gradient-to-r from-amber-500 to-orange-500';
  return 'bg-gradient-to-r from-emerald-500 to-green-500';
};

const formatResetPeriod = (period: string): string => {
  switch (period) {
    case 'daily':
      return 'Daily';
    case 'weekly':
      return 'Weekly';
    case 'monthly':
      return 'Monthly';
    case 'none':
      return 'No reset';
    default:
      return period.charAt(0).toUpperCase() + period.slice(1);
  }
};

export const FeatureUsageOverview: React.FC<{ initialData: ServiceUsageData; isLoadingInitial?: boolean }> = ({ initialData, isLoadingInitial }) => {
  const router = useRouter();
  const [serviceUsage, setServiceUsage] = useState<ServiceUsageData>(initialData);
  const [loading, setLoading] = useState(isLoadingInitial || false);
  const [error, setError] = useState<string | null>(null);

  // The data fetching is now handled by FeatureUsageOverviewClient
  // This component should only display the data it receives via props or internal state updates from the client component.

  const fetchServiceUsage = async () => {
    try {
      setLoading(true);
      setError(null);
      
      const response = await fetch('/api/user/feature-usage'); // This is a fallback/refresh mechanism
      const result = await response.json();

      if (!response.ok) {
        throw new Error(result.error || 'Failed to fetch service usage');
      }

      setServiceUsage(result.data || {});
    } catch (err) {
      console.error('Error fetching service usage:', err);
      setError(err instanceof Error ? err.message : 'Unknown error');
    } finally {
      setLoading(false);
    }
  };


  useEffect(() => {
    setServiceUsage(initialData);
    setLoading(isLoadingInitial || false);
  }, [initialData, isLoadingInitial]);

  if (loading) {
    return (
      <Card className="w-full border-slate-200/60 dark:border-slate-800/60">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-slate-800 dark:text-slate-200">
            <Loader2 className="h-5 w-5 animate-spin" />
            Loading Service Usage...
          </CardTitle>
        </CardHeader>
      </Card>
    );
  }

  if (error) {
    return (
      <Card className="w-full border-rose-200/60 dark:border-rose-800/60">
        <CardHeader>
          <CardTitle className="text-rose-700 dark:text-rose-300 flex items-center gap-2">
            <TrendingDown className="h-5 w-5" />
            Error Loading Usage Data
          </CardTitle>
          <CardDescription className="text-rose-600 dark:text-rose-400">{error}</CardDescription>
        </CardHeader>
        <CardContent>
          <Button onClick={fetchServiceUsage} variant="outline" size="sm">
            <RefreshCw className="h-4 w-4 mr-2" />
            Retry
          </Button>
        </CardContent>
      </Card>
    );
  }

  const services = Object.entries(serviceUsage);

  if (services.length === 0) {
    return (
      <Card className="w-full border-slate-200/60 dark:border-slate-800/60">
        <CardHeader>
          <CardTitle className="text-slate-800 dark:text-slate-200">Service Usage</CardTitle>
          <CardDescription>No usage data available</CardDescription>
        </CardHeader>
        <CardContent>
          <Button onClick={fetchServiceUsage} variant="outline" size="sm">
            <RefreshCw className="h-4 w-4 mr-2" />
            Try Again
          </Button>
        </CardContent>
      </Card>
    );
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5, ease: "easeOut" }}
    >
      <Card className="w-full border-slate-200/60 dark:border-slate-800/60 shadow-sm">
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-6">
          <motion.div
            initial={{ opacity: 0, x: -20 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ duration: 0.5, delay: 0.1, ease: "easeOut" }}
          >
            <CardTitle className="text-xl font-semibold text-slate-800 dark:text-slate-200">
              Service Usage Overview
            </CardTitle>
            <CardDescription className="text-slate-600 dark:text-slate-400">
              Track your usage across all Insturix services
            </CardDescription>
          </motion.div>
          <motion.div
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ duration: 0.5, delay: 0.2, ease: "easeOut" }}
          >
            <Button
              onClick={fetchServiceUsage}
              variant="outline"
              size="sm"
              className="border-slate-200/60 hover:border-slate-300/60 dark:border-slate-700/60"
            >
              <RefreshCw className="h-4 w-4 mr-2" />
              Refresh
            </Button>
          </motion.div>
        </CardHeader>
        <CardContent>
          <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
            {services.map(([serviceName, limits], index) => {
              const serviceInfo = serviceDisplayData[serviceName];
              if (!serviceInfo) return null;

              return (
                <motion.div
                  key={serviceName}
                  initial={{ opacity: 0, y: 30 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{
                    duration: 0.5,
                    delay: 0.3 + (index * 0.1),
                    ease: "easeOut"
                  }}
                  onClick={() => router.push(serviceInfo.path)}
                  className={`p-5 rounded-xl border bg-gradient-to-br ${serviceInfo.color} hover:shadow-lg transition-all duration-200 cursor-pointer`}
                >
                {/* Service Header */}
                <div className="flex items-center gap-3 mb-4">
                  <div className="p-2 rounded-lg bg-white/60 dark:bg-slate-800/60">
                    {serviceInfo.icon}
                  </div>
                  <h3 className="font-semibold text-slate-800 dark:text-slate-200">
                    {serviceInfo.name}
                  </h3>
                </div>

                {/* Limits */}
                <div className="space-y-3">
                  {Object.entries(limits).map(([limitType, usage]) => {
                    const displayName = limitTypeDisplayNames[limitType] || limitType;
                    const progressValue = (usage.isUnlimited || usage.maxUsage === -1) ? 100 :
                      usage.maxUsage > 0 ? (usage.currentUsage / usage.maxUsage) * 100 : 0;

                    return (
                      <div key={limitType} className="space-y-2">
                        <div className="flex justify-between items-center">
                          <span className="text-sm font-medium text-slate-700 dark:text-slate-300">
                            {displayName}
                          </span>
                          <div className="flex items-center gap-2">
                            {(usage.isUnlimited || usage.maxUsage === -1) ? (
                              <>
                                <Infinity className="h-3 w-3 text-blue-500" />
                                <Badge variant="secondary" className="text-xs px-2 py-0">
                                  Unlimited
                                </Badge>
                              </>
                            ) : (
                              <span className={`text-sm font-medium ${getUsageColor(usage.currentUsage, usage.maxUsage, usage.isUnlimited || usage.maxUsage === -1)}`}>
                                {usage.currentUsage} / {usage.maxUsage}
                              </span>
                            )}
                          </div>
                        </div>

                        {/* Progress Bar */}
                        <div className="space-y-1">
                          <div className="h-2 w-full bg-slate-200/60 dark:bg-slate-700/60 rounded-full overflow-hidden">
                            <div
                              className={`h-full transition-all duration-500 ease-out ${getProgressColor(usage.currentUsage, usage.maxUsage, usage.isUnlimited)}`}
                              style={{ width: `${progressValue}%` }}
                            />
                          </div>
                          
                          {!(usage.isUnlimited || usage.maxUsage === -1) && (
                            <div className="flex justify-between items-center text-xs text-slate-500 dark:text-slate-400">
                              <span className="flex items-center gap-1">
                                <Clock className="h-3 w-3" />
                                {formatResetPeriod(usage.resetPeriod)}
                              </span>
                              <span>
                                {usage.remaining > 0 ? (
                                  <span className="text-slate-600 dark:text-slate-400 font-medium">
                                    {usage.remaining} left
                                  </span>
                                ) : (
                                  <span className="text-slate-500 dark:text-slate-500 font-medium">
                                    Limit reached
                                  </span>
                                )}
                              </span>
                            </div>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
                </motion.div>
              );
            })}
          </div>
        </CardContent>
      </Card>
    </motion.div>
  );
};