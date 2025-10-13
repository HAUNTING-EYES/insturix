"use client";

import { useState, useEffect } from 'react';
import { useClickatronLimits, FrontendLimitInfo } from '@/lib/frontend/services/clickatron-limits';
import { Progress } from '@/components/ui/progress';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { ImageIcon } from 'lucide-react';

// Helper function to format reset time
const formatResetTime = (usage: FrontendLimitInfo) => {
  // If unlimited, no reset information needed
  if (usage.isUnlimited) {
    return null;
  }
  
  // If no reset period, no reset information needed
  if (usage.resetPeriod === 'none') {
    return null;
  }
  
  // If we have time until reset information
  if (usage.timeUntilReset) {
    const { days, hours, minutes, totalMs } = usage.timeUntilReset;
    
    // If within 24 hours, show exact time
    if (totalMs <= 24 * 60 * 60 * 1000) {
      const parts = [];
      if (hours > 0) parts.push(`${hours}hr`);
      if (minutes > 0) parts.push(`${minutes}min`);
      return `Resets in ${parts.join(' ')}`;
    }
    
    // Otherwise, show reset date
    const resetDate = new Date();
    resetDate.setTime(resetDate.getTime() + totalMs);
    return `Resets on ${resetDate.toLocaleDateString()}`;
  }
  
  // Fallback to period-based reset information
  return `Resets ${usage.resetPeriod === 'weekly' ? 'weekly' : usage.resetPeriod === 'monthly' ? 'monthly' : 'daily'}`;
};

interface LimitDisplayProps {
  showAll?: boolean;
  compact?: boolean;
}

export function LimitDisplay({ showAll = false, compact = false }: LimitDisplayProps) {
  const { getUsage, getAllUsage, getTypeName } = useClickatronLimits();
  const [usage, setUsage] = useState<FrontendLimitInfo | null>(null);
  const [allUsage, setAllUsage] = useState<{ variation?: FrontendLimitInfo }>({});
  const [loading, setLoading] = useState(true);

  const fetchUsage = async () => {
    try {
      setLoading(true);
      
      if (showAll) {
        const all = await getAllUsage();
        setAllUsage(all);
      } else {
        const current = await getUsage({ type: 'variation' });
        setUsage(current);
      }
    } catch (error) {
      console.error('Error fetching usage:', error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchUsage();
  }, [showAll, getUsage, getAllUsage]);

  useEffect(() => {
    const handleUsageUpdate = () => {
      fetchUsage();
    };

    window.addEventListener('clickatron-usage-updated', handleUsageUpdate);

    return () => {
      window.removeEventListener('clickatron-usage-updated', handleUsageUpdate);
    };
  }, [showAll, getUsage, getAllUsage]);

  if (loading) {
    return <div className="animate-pulse w-30 h-4 bg-gray-100/20 rounded" />;
  }

  if (showAll) {
    return (
      <div className="space-y-4">
        {Object.entries(allUsage).map(([limitType, info]) =>
          info ? (
            <Card key={limitType} className="p-4">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium flex items-center gap-2">
                  <ImageIcon className="h-4 w-4 text-purple-400" />
                  {getTypeName({ limitType })}
                </CardTitle>
              </CardHeader>
              <CardContent className="pt-0">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-sm text-muted-foreground">{info.displayText}</span>
                  <Badge variant={info.hasAccess ? "default" : "destructive"}>
                    {info.isUnlimited ? "Unlimited" : `${info.remaining} left`}
                  </Badge>
                </div>
                {!info.isUnlimited && (
                  <Progress value={info.progressPercentage} className="h-2" />
                )}
                <p className="text-xs text-muted-foreground mt-2">
                  {formatResetTime(info) || `Resets ${info.resetPeriod === 'weekly' ? 'weekly' : info.resetPeriod === 'monthly' ? 'monthly' : 'daily'}`}.
                </p>
              </CardContent>
            </Card>
          ) : null
        )}
      </div>
    );
  }

  if (!usage) {
    return <div className="text-sm text-muted-foreground">Usage info unavailable</div>;
  }

  const canGenerate = usage?.hasAccess || false;
  const typeName = getTypeName({ type: 'variation' });

  if (compact) {
    const resetText = formatResetTime(usage);
    return (
      <div className="text-xs text-zinc-400">
        {usage.isUnlimited ? (
          <span className="text-zinc-200 font-medium">Unlimited variations</span>
        ) : (
          <>
            <span className="text-zinc-200 font-medium">
              {usage.remaining} / {usage.maxUsage} variations
            </span>{" "}
            remaining{resetText ? `. ${resetText}` : ''}.
          </>
        )}
      </div>
    );
  }

  return (
    <Card className="p-4">
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-medium flex items-center gap-2">
          <ImageIcon className="h-4 w-4 text-purple-400" />
          {typeName}
        </CardTitle>
      </CardHeader>
      <CardContent className="pt-0">
        <div className="flex items-center justify-between mb-2">
          <span className="text-sm text-muted-foreground">{usage.displayText}</span>
          <Badge variant={canGenerate ? "default" : "destructive"}>
            {usage.isUnlimited ? "Unlimited" : `${usage.remaining} left`}
          </Badge>
        </div>
        {!usage.isUnlimited && (
          <Progress value={usage.progressPercentage} className="h-2" />
        )}
        {!canGenerate && (
          <p className="text-xs text-red-600 mt-2">
            Generation limit reached. {formatResetTime(usage) || `Resets ${usage.resetPeriod === 'weekly' ? 'weekly' : usage.resetPeriod === 'monthly' ? 'monthly' : 'daily'}`}.
          </p>
        )}
        {canGenerate && (
          <p className="text-xs text-muted-foreground mt-2">
            {formatResetTime(usage) || `Resets ${usage.resetPeriod === 'weekly' ? 'weekly' : usage.resetPeriod === 'monthly' ? 'monthly' : 'daily'}`}.
          </p>
        )}
      </CardContent>
    </Card>
  );
}