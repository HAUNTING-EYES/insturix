"use client";

import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import { useUser } from '@clerk/nextjs';
import { motion, AnimatePresence } from 'framer-motion';
import {
  BarChart2,
  ChevronDown,
  ChevronUp,
  Activity,
  Clock,
  Video,
  Play,
  RefreshCw,
  AlertCircle,
  Info
} from 'lucide-react';
import { SERVICE_LIMIT_DEFINITIONS } from '@/lib/config/serviceLimits';
import { useUserInitialization } from '@/components/dashboard/UserInitializationProvider';
import { useConcurrentTasks } from '@/lib/hooks/useConcurrentTasks';
import { useAnalytics, ServiceUsageInfo } from './AnalyticsProvider';

// Icon mapping for limit types
const iconMap: Record<string, React.ReactNode> = {
  BarChart2: <BarChart2 className="h-4 w-4" />,
  Activity: <Activity className="h-4 w-4" />,
  Video: <Video className="h-4 w-4" />,
  Play: <Play className="h-4 w-4" />,
};

const getLimitDisplayInfo = (limitType: string) => {
  const alyzitronLimits = SERVICE_LIMIT_DEFINITIONS.alyzitron;
  const limitDef = alyzitronLimits[limitType];
  
  if (!limitDef) {
    return {
      name: limitType,
      icon: <Video className="h-4 w-4" />,
      description: 'Service limit'
    };
  }
  
  return {
    name: limitDef.name,
    icon: iconMap[limitDef.icon || 'Video'] || <Video className="h-4 w-4" />,
    description: limitDef.description
  };
};

const formatTimeUntilReset = (timeUntilReset: { days: number; hours: number; minutes: number; totalMs: number } | null | undefined): string => {
  if (!timeUntilReset || timeUntilReset.totalMs <= 0) {
    return "Resets soon";
  }

  const { days, hours, minutes } = timeUntilReset;

  if (days > 0) {
    return `Resets in ${days}d ${hours}h`;
  } else if (hours > 0) {
    return `Resets in ${hours}h ${minutes}m`;
  } else if (minutes > 0) {
    return `Resets in ${minutes}m`;
  } else {
    return "Resets soon";
  }
};

const AlyzitronAnalyticsOverview: React.FC = () => {
  const {
    stats,
    loading,
    error,
    userInitLoading,
    userInitError,
    isInitialized,
    fetchStats,
  } = useAnalytics();
  const [isExpanded, setIsExpanded] = useState(false);

  if (userInitError) {
    return (
      <TooltipProvider>
        <Card className="bg-black/40 border-zinc-800 backdrop-blur-xl">
          <CardHeader>
            <CardTitle className="text-lg font-medium text-zinc-100 flex items-center gap-2">
              <BarChart2 className="h-5 w-5" color="#3b81f5" />
              Analytics Overview
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex items-center gap-2 text-red-400 text-sm">
              <AlertCircle className="h-4 w-4" />
              User initialization failed: {userInitError}
            </div>
          </CardContent>
        </Card>
      </TooltipProvider>
    );
  }

  if (userInitLoading || !isInitialized) {
    return (
      <TooltipProvider>
        <Card className="bg-black/40 border-zinc-800 backdrop-blur-xl">
          <CardHeader>
            <CardTitle className="text-lg font-medium text-zinc-100 flex items-center gap-2">
              <BarChart2 className="h-5 w-5" color="#3b81f5" />
              Analytics Overview
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex items-center justify-center py-8">
              <RefreshCw className="h-6 w-6 animate-spin text-zinc-400" />
              <span className="ml-2 text-zinc-400">Initializing account...</span>
            </div>
          </CardContent>
        </Card>
      </TooltipProvider>
    );
  }

  if (loading) {
    return (
      <TooltipProvider>
        <Card className="bg-black/40 border-zinc-800 backdrop-blur-xl">
          <CardHeader>
            <CardTitle className="text-lg font-medium text-zinc-100 flex items-center gap-2">
              <BarChart2 className="h-5 w-5" color="#3b81f5" />
              Analytics Overview
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex items-center justify-center py-8">
              <RefreshCw className="h-6 w-6 animate-spin text-zinc-400" />
            </div>
          </CardContent>
        </Card>
      </TooltipProvider>
    );
  }

  if (error) {
    return (
      <TooltipProvider>
        <Card className="bg-black/40 border-zinc-800 backdrop-blur-xl">
          <CardHeader>
            <CardTitle className="text-lg font-medium text-zinc-100 flex items-center gap-2">
              <BarChart2 className="h-5 w-5" color="#3b81f5" />
              Analytics Overview
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex items-center gap-2 text-red-400 text-sm">
              <AlertCircle className="h-4 w-4" />
              {error}
            </div>
            <Button
              onClick={fetchStats}
              variant="outline"
              size="sm"
              className="mt-4 border-zinc-700 text-zinc-300"
            >
              <RefreshCw className="h-4 w-4 mr-2" />
              Retry
            </Button>
          </CardContent>
        </Card>
      </TooltipProvider>
    );
  }

  if (!stats) return null;

  const serviceLimitsArray = Object.entries(stats.serviceLimits);
  const visibleLimits = isExpanded ? serviceLimitsArray : serviceLimitsArray.slice(0, 2);

  return (
    <TooltipProvider>
      <Card className="bg-black/40 border-zinc-800 backdrop-blur-xl">
        <CardHeader className="pb-4">
          <CardTitle className="text-base sm:text-lg font-medium text-zinc-100 flex items-center gap-2">
            <BarChart2 className="h-4 w-4 sm:h-5 sm:w-5" color="#3b81f5" />
            Analytics Overview
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4 sm:space-y-6">
          {/* Stats Grid - responsive layout */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-1 gap-4">
            {/* Monthly Usage */}
            <motion.div
              className="p-3 sm:p-4 bg-black/20 rounded-lg"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.3 }}
            >
              <div className="flex items-center gap-2 sm:gap-3 text-xs sm:text-sm font-medium text-zinc-400 mb-1">
                <BarChart2 className="h-3 w-3 sm:h-4 sm:w-4" color="#3b81f5" />
                Monthly Analyses
              </div>
              <div className="text-2xl sm:text-3xl font-semibold text-zinc-100">
                {stats.monthlyAnalyses}
              </div>
              <div className="text-xs sm:text-sm text-zinc-500 mt-1">
                This month
              </div>
            </motion.div>

            {/* Active Queue */}
            <motion.div
              className="p-3 sm:p-4 bg-black/20 rounded-lg"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.3, delay: 0.1 }}
            >
              <div className="flex items-center gap-2 sm:gap-3 text-xs sm:text-sm font-medium text-zinc-400 mb-1">
                <Activity className="h-3 w-3 sm:h-4 sm:w-4" color="#3b81f5" />
                Processing Queue
              </div>
              <div className="text-2xl sm:text-3xl font-semibold text-zinc-100">
                {stats.activeAnalyses}
              </div>
              <div className="text-xs sm:text-sm text-zinc-500 mt-1">
                Currently active
              </div>
            </motion.div>
          </div>

          {/* Service Limits */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <h4 className="text-xs sm:text-sm font-medium text-zinc-300">Service Limits</h4>
              {serviceLimitsArray.length > 2 && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setIsExpanded(!isExpanded)}
                  className="h-auto p-1 text-zinc-400 hover:text-zinc-200"
                >
                  {isExpanded ? (
                    <ChevronUp className="h-3 w-3 sm:h-4 sm:w-4" />
                  ) : (
                    <ChevronDown className="h-3 w-3 sm:h-4 sm:w-4" />
                  )}
                </Button>
              )}
            </div>

            <AnimatePresence>
              {visibleLimits.map(([limitType, usage], index) => {
                const displayInfo = getLimitDisplayInfo(limitType);
                if (!usage) return null;

                const usagePercentage = (usage.isUnlimited || usage.maxUsage === -1) ? 0 : (usage.currentUsage / usage.maxUsage) * 100;
                const isNearLimit = usagePercentage >= 80;

                return (
                  <motion.div
                    key={limitType}
                    initial={{ opacity: 0, height: 0 }}
                    animate={{ opacity: 1, height: 'auto' }}
                    exit={{ opacity: 0, height: 0 }}
                    transition={{ duration: 0.2, delay: index * 0.05 }}
                    className="p-2 sm:p-3 bg-black/10 rounded-lg border border-zinc-800/50"
                  >
                    <div className="flex items-center justify-between mb-2">
                      <div className="flex items-center gap-1 sm:gap-2 min-w-0 flex-1 mr-2">
                        {displayInfo.icon}
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <div className="flex items-center gap-1 cursor-help min-w-0">
                              <span className="text-xs sm:text-sm font-medium text-zinc-300 truncate">
                                {displayInfo.name}
                              </span>
                              <Info className="h-2 w-2 sm:h-3 sm:w-3 text-zinc-500 flex-shrink-0" />
                            </div>
                          </TooltipTrigger>
                          <TooltipContent side="top" className="max-w-xs">
                            <p className="text-xs sm:text-sm">{displayInfo.description}</p>
                          </TooltipContent>
                        </Tooltip>
                      </div>
                      {(usage.isUnlimited || usage.maxUsage === -1) ? (
                        <Badge variant="secondary" className="text-xs flex-shrink-0">
                          Unlimited
                        </Badge>
                      ) : (
                        <span className={`text-xs sm:text-sm font-medium whitespace-nowrap flex-shrink-0 ${
                          isNearLimit ? 'text-orange-400' : 'text-zinc-400'
                        }`}>
                          {usage.currentUsage} / {usage.maxUsage}
                        </span>
                      )}
                    </div>
                    
                    {!(usage.isUnlimited || usage.maxUsage === -1) && (
                      <div className="space-y-1">
                        <div className="h-2 bg-zinc-800 rounded-full overflow-hidden">
                          <div
                            className={`h-full transition-all duration-300 ${
                              isNearLimit ? 'bg-orange-500' : 'bg-blue-500'
                            }`}
                            style={{ width: `${Math.min(usagePercentage, 100)}%` }}
                          />
                        </div>
                        <div className="flex justify-between text-xs text-zinc-500">
                          <span className="flex items-center gap-1">
                            <Clock className="h-2 w-2 sm:h-3 sm:w-3" />
                            <span className="capitalize">{usage.resetPeriod}</span>
                          </span>
                          <span className="text-right">
                            {usage.remaining > 0 ? (
                              `${usage.remaining} left`
                            ) : (
                              <span className="text-red-400">Limit reached</span>
                            )}
                          </span>
                        </div>
                        {usage.timeUntilReset &&
                         usage.resetPeriod !== 'none' &&
                         usage.currentUsage > 0 && (
                          <div className="text-xs text-zinc-600 text-center mt-1">
                            {formatTimeUntilReset(usage.timeUntilReset)}
                          </div>
                        )}
                      </div>
                    )}
                  </motion.div>
                );
              })}
            </AnimatePresence>

            {serviceLimitsArray.length > 2 && !isExpanded && (
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                className="text-center"
              >
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setIsExpanded(true)}
                  className="text-zinc-500 hover:text-zinc-300 text-xs"
                >
                  +{serviceLimitsArray.length - 2} more limits
                </Button>
              </motion.div>
            )}
          </div>
        </CardContent>
      </Card>
    </TooltipProvider>
  );
};

export { AlyzitronAnalyticsOverview };
export default AlyzitronAnalyticsOverview;