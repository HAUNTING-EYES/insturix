import { useState, useEffect } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { AlertCircle, CheckCircle, Clock, Zap } from 'lucide-react';
import { Badge } from '@/components/ui/badge';

interface QuickLimitCheckProps {
  taskType: 'chat' | 'ideas' | 'scripts' | 'general';
  sessionId?: string;
  onProceed?: () => void;
  showDetails?: boolean;
}

export function QuickLimitCheck({ taskType, sessionId, onProceed, showDetails = false }: QuickLimitCheckProps) {
  const [checking, setChecking] = useState(true);
  const [limitStatus, setLimitStatus] = useState<any>(null);

  useEffect(() => {
    const checkLimits = async () => {
      try {
        setChecking(true);
        
        // Use the new backend-integrated limits checking
        const response = await fetch('/api/services/thinkforge/limits/check', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            userId: '', // Will be filled by the API from auth
            sessionId: sessionId || 'default_session',
            type: taskType
          })
        });

        if (response.ok) {
          const result = await response.json();
          setLimitStatus(result);
        } else {
          setLimitStatus({
            success: false,
            hasAccess: false,
            error: { message: 'Failed to check limits' }
          });
        }
      } catch (error) {
        console.error('Limit check error:', error);
        setLimitStatus({
          success: false,
          hasAccess: false,
          error: { message: 'Error checking limits' }
        });
      } finally {
        setChecking(false);
      }
    };

    checkLimits();
  }, [taskType, sessionId]);

  const getTaskTypeName = (type: string) => {
    switch (type) {
      case 'chat': return 'Chat';
      case 'ideas': return 'Ideas Generation';
      case 'scripts': return 'Script Generation';
      default: return 'AI Task';
    }
  };

  const getStatusIcon = () => {
    if (checking) return <Clock className="h-4 w-4 animate-spin" />;
    if (limitStatus?.hasAccess) return <CheckCircle className="h-4 w-4 text-green-600" />;
    return <AlertCircle className="h-4 w-4 text-red-600" />;
  };

  const getStatusMessage = () => {
    if (checking) return 'Checking limits...';
    if (!limitStatus) return 'Unable to check limits';
    
    if (limitStatus.hasAccess) {
      return `Ready to start ${getTaskTypeName(taskType)}`;
    } else {
      // Check if we have a detailed error message from the backend
      if (limitStatus.error?.limitInfo?.blockingReason === 'rate_limit_exceeded') {
        const action = taskType;
        const actionMessages: Record<string, string> = {
          'chat': 'Chat reply limit reached for this session.',
          'ideas': 'Idea reshuffle limit reached for this session.',
          'scripts': 'Script regeneration limit reached for this session.',
          'suggestions': 'AI script fix limit reached for this session.'
        };
        
        const specificMessage = actionMessages[action] || 'Session rate limit reached.';
        const rateLimits = limitStatus.error.limitInfo.rateLimits;
        const usageInfo = rateLimits ? `Used ${rateLimits.current_usage || 0} of ${rateLimits.limit || 0}.` : '';
        
        return `${specificMessage} ${usageInfo}`;
      } else if (limitStatus.error?.limitInfo?.blockingReason === 'service_limit_exceeded') {
        return 'Monthly AI conversation limit reached.';
      } else if (limitStatus.error?.limitInfo?.blockingReason === 'concurrent_limit_exceeded') {
        return 'Too many concurrent tasks running.';
      }
      
      return limitStatus.error?.message || 'Limit exceeded';
    }
  };

  const renderLimitDetails = () => {
    if (!showDetails || !limitStatus?.limitInfo) return null;

    const { serviceLimits, rateLimits, concurrentLimits, blockingReason } = limitStatus.limitInfo;

    return (
      <div className="mt-3 space-y-2 text-xs">
        <div className="font-medium text-gray-700">Limit Details:</div>
        
        {serviceLimits && (
          <div className="flex justify-between">
            <span>Monthly AI Conversations:</span>
            <Badge variant={serviceLimits.remaining > 0 ? "default" : "destructive"} className="text-xs">
              {serviceLimits.current_usage || 0}/{serviceLimits.limit || 0}
            </Badge>
          </div>
        )}
        
        {rateLimits && (
          <div className="flex justify-between">
            <span>Session {getTaskTypeName(taskType)}:</span>
            <Badge variant={rateLimits.remaining > 0 ? "default" : "destructive"} className="text-xs">
              {rateLimits.current_usage || 0}/{rateLimits.limit || 0}
            </Badge>
          </div>
        )}
        
        {concurrentLimits && (
          <div className="flex justify-between">
            <span>Concurrent Tasks:</span>
            <Badge variant={concurrentLimits.remaining > 0 ? "default" : "destructive"} className="text-xs">
              {concurrentLimits.current_usage || 0}/{concurrentLimits.limit || 0}
            </Badge>
          </div>
        )}

        {blockingReason && (
          <div className="text-red-600 font-medium">
            Blocked by: {blockingReason.replace('_', ' ')}
          </div>
        )}
      </div>
    );
  };

  const renderRecommendations = () => {
    if (!limitStatus?.limitInfo?.recommendations?.length) return null;

    return (
      <div className="mt-3 space-y-1">
        <div className="font-medium text-gray-700 text-xs">Recommendations:</div>
        {limitStatus.limitInfo.recommendations.map((rec: any, index: number) => (
          <div key={index} className="text-xs text-gray-600 flex items-center gap-1">
            <Zap className="h-3 w-3" />
            {rec.message}
          </div>
        ))}
      </div>
    );
  };

  return (
    <div className="space-y-2">
      <Card className={`p-4 ${
        checking 
          ? 'border-yellow-200 bg-yellow-50' 
          : limitStatus?.hasAccess 
            ? 'border-green-200 bg-green-50' 
            : 'border-red-200 bg-red-50'
      }`}>
        <CardContent>
          <div className="flex items-center gap-2">
            {getStatusIcon()}
            <p className={`text-sm ${
              checking 
                ? 'text-yellow-800' 
                : limitStatus?.hasAccess 
                  ? 'text-green-800' 
                  : 'text-red-800'
            }`}>
              {getStatusMessage()}
            </p>
          </div>
          
          {renderLimitDetails()}
          {renderRecommendations()}
        </CardContent>
      </Card>
      
      {onProceed && (
        <Button
          onClick={onProceed}
          disabled={checking || !limitStatus?.hasAccess}
          className="w-full"
          variant={limitStatus?.hasAccess ? "default" : "destructive"}
        >
          {checking 
            ? 'Checking...' 
            : limitStatus?.hasAccess 
              ? `Start ${getTaskTypeName(taskType)}` 
              : 'Limit Exceeded'}
        </Button>
      )}
    </div>
  );
} 