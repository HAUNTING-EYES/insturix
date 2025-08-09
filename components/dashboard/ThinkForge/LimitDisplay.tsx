import { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import { Badge } from '@/components/ui/badge';

interface LimitDisplayProps {
  taskType?: 'chat' | 'ideas' | 'scripts' | 'general' | 'concurrent';
  showAll?: boolean;
}

interface LimitInfo {
  used: number;
  limit: number;
  remaining: number;
  reset_date?: string;
  reset_period?: string;
}

export function LimitDisplay({ taskType = 'general', showAll = false }: LimitDisplayProps) {
  const [usage, setUsage] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchUsage = async () => {
      try {
        setLoading(true);
        
        // Fetch comprehensive usage data from the new backend-integrated API
        const response = await fetch('/api/services/thinkforge/usage');
        if (response.ok) {
          const usageData = await response.json();
          setUsage(usageData);
        } else {
          console.error('Failed to fetch usage data');
        }
      } catch (error) {
        console.error('Error fetching usage:', error);
      } finally {
        setLoading(false);
      }
    };

    fetchUsage();
  }, [taskType, showAll]);

  if (loading) {
    return <div className="animate-pulse h-20 bg-gray-200 rounded-md" />;
  }

  if (!usage) {
    return <div className="text-red-500">Failed to load usage data</div>;
  }

  const renderLimitCard = (limitInfo: LimitInfo, title: string, subtitle?: string) => {
    if (!limitInfo) return null;

    const progressPercentage = limitInfo.limit === -1 ? 0 : (limitInfo.used / limitInfo.limit) * 100;
    const isUnlimited = limitInfo.limit === -1;
    const isExceeded = limitInfo.used >= limitInfo.limit && !isUnlimited;

    return (
      <Card key={title} className="p-4">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-medium flex items-center justify-between">
            <div>
              <div>{title}</div>
              {subtitle && <div className="text-xs text-gray-500 font-normal">{subtitle}</div>}
            </div>
            {isUnlimited ? (
              <Badge variant="secondary">Unlimited</Badge>
            ) : (
              <Badge variant={isExceeded ? "destructive" : "default"}>
                {limitInfo.used}/{limitInfo.limit}
              </Badge>
            )}
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          <div className="text-xs text-muted-foreground">
            {isUnlimited 
              ? `Used: ${limitInfo.used}` 
              : `${limitInfo.remaining} remaining`
            }
          </div>
          {!isUnlimited && (
            <Progress 
              value={Math.min(progressPercentage, 100)} 
              className={`h-2 ${isExceeded ? 'bg-red-200' : ''}`}
            />
          )}
          {limitInfo.reset_period && limitInfo.reset_period !== 'none' && (
            <div className="text-xs text-muted-foreground">
              Resets: {limitInfo.reset_period}ly
            </div>
          )}
        </CardContent>
      </Card>
    );
  };

  if (showAll && usage.planLimits) {
    return (
      <div className="space-y-4">
        <div className="flex justify-between items-center">
          <h2 className="text-lg font-semibold text-gray-900">ThinkForge Usage Overview</h2>
          <Badge variant="outline" className="text-sm">
            {usage.plan || 'Free'} Plan
          </Badge>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {usage.planLimits.sessions && renderLimitCard(
            usage.planLimits.sessions, 
            'Sessions', 
            'Weekly sessions'
          )}
          {usage.planLimits.ideaReshuffles && renderLimitCard(
            usage.planLimits.ideaReshuffles, 
            'Idea Reshuffles', 
            'Per session'
          )}
          {usage.planLimits.chatReplies && renderLimitCard(
            usage.planLimits.chatReplies, 
            'Chat Replies', 
            'Per session'
          )}
          {usage.planLimits.scriptRegens && renderLimitCard(
            usage.planLimits.scriptRegens, 
            'Script Regens', 
            'Per session'
          )}
          {usage.planLimits.aiFixes && renderLimitCard(
            usage.planLimits.aiFixes, 
            'AI Fixes', 
            'Per session'
          )}
          {usage.planLimits.maxConcurrentTasks && renderLimitCard(
            usage.planLimits.maxConcurrentTasks, 
            'Concurrent Tasks', 
            'Maximum simultaneous'
          )}
        </div>
      </div>
    );
  }

  // Show specific limit based on taskType
  const getSpecificLimit = () => {
    if (!usage.planLimits) return null;
    
    switch (taskType) {
      case 'chat':
        return { limit: usage.planLimits.chatReplies, title: 'Chat Replies', subtitle: 'Per session' };
      case 'ideas':
        return { limit: usage.planLimits.ideaReshuffles, title: 'Idea Reshuffles', subtitle: 'Per session' };
      case 'scripts':
        return { limit: usage.planLimits.scriptRegens, title: 'Script Regenerations', subtitle: 'Per session' };
      case 'concurrent':
        return { limit: usage.planLimits.maxConcurrentTasks, title: 'Concurrent Tasks', subtitle: 'Maximum simultaneous' };
      case 'general':
        return { limit: usage.planLimits.sessions, title: 'Sessions', subtitle: 'Weekly limit' };
      default:
        return { limit: usage.planLimits.sessions, title: 'Sessions', subtitle: 'Weekly limit' };
    }
  };

  const specificLimit = getSpecificLimit();
  if (!specificLimit || !specificLimit.limit) {
    return (
      <Card className="p-4">
        <CardContent>
          <p className="text-sm text-muted-foreground">No usage data available for {taskType}</p>
        </CardContent>
      </Card>
    );
  }

  return renderLimitCard(specificLimit.limit, specificLimit.title, specificLimit.subtitle);
} 