"use client";

import { useState, useEffect } from 'react';
import { useAlyzitronLimits, FrontendLimitInfo } from '@/lib/frontend/services/alyzitron';
import { Progress } from '@/components/ui/progress';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

interface LimitDisplayProps {
  videoType?: string;
  showAll?: boolean;
}

export function LimitDisplay({ videoType = 'long', showAll = false }: LimitDisplayProps) {
  const { getUsage, getAllUsage, getTypeName } = useAlyzitronLimits();
  const [usage, setUsage] = useState<FrontendLimitInfo | null>(null);
  const [allUsage, setAllUsage] = useState<{ total?: FrontendLimitInfo, longVideo?: FrontendLimitInfo }>({});
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchUsage = async () => {
      try {
        setLoading(true);
        
        if (showAll) {
          const all = await getAllUsage();
          setAllUsage(all);
        } else {
          const current = await getUsage({ type: videoType });
          setUsage(current);
        }
      } catch (error) {
        console.error('Error fetching usage:', error);
      } finally {
        setLoading(false);
      }
    };

    fetchUsage();
  }, [videoType, showAll, getUsage, getAllUsage]);

  if (loading) {
    return <div className="animate-pulse h-20 bg-gray-200 rounded-md" />;
  }

  if (showAll) {
    return (
      <div className="space-y-4">
        {Object.entries(allUsage).map(([limitType, info]) =>
          info ? (
            <Card key={limitType} className="p-4">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium">
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

  const canStartAnalysis = usage?.hasAccess || false;
  const typeName = getTypeName({ type: videoType });

  return (
    <Card className="p-4">
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-medium">{typeName}</CardTitle>
      </CardHeader>
      <CardContent className="pt-0">
        <div className="flex items-center justify-between mb-2">
          <span className="text-sm text-muted-foreground">{usage.displayText}</span>
          <Badge variant={canStartAnalysis ? "default" : "destructive"}>
            {usage.isUnlimited ? "Unlimited" : `${usage.remaining} left`}
          </Badge>
        </div>
        {!usage.isUnlimited && (
          <Progress value={usage.progressPercentage} className="h-2" />
        )}
        {!canStartAnalysis && (
          <p className="text-xs text-red-600 mt-2">
            Analysis limit reached. Resets {usage.resetPeriod === 'weekly' ? 'weekly' : usage.resetPeriod === 'monthly' ? 'monthly' : 'daily'}.
          </p>
        )}
      </CardContent>
    </Card>
  );
}