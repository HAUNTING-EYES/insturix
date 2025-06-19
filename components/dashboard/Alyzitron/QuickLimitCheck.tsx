"use client";

import { useState, useEffect } from 'react';
import { useAlyzitronLimits } from '@/lib/frontend/services/alyzitron';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';

interface QuickLimitCheckProps {
  videoType: string;
  onProceed?: () => void;
}

export function QuickLimitCheck({ videoType, onProceed }: QuickLimitCheckProps) {
  const { getUsage, canStart, getTypeName } = useAlyzitronLimits();
  const [checking, setChecking] = useState(true);
  const [canProceed, setCanProceed] = useState(false);
  const [message, setMessage] = useState('');

  useEffect(() => {
    const checkLimits = async () => {
      try {
        setChecking(true);
        const result = await canStart({ type: videoType });
        
        if (result.canStart) {
          setCanProceed(true);
          setMessage(`You can start ${getTypeName({ type: videoType })}. ${result.reason}`);
        } else {
          setCanProceed(false);
          setMessage(`${result.reason}. ${result.usage?.displayText || ''}`);
        }
      } catch (error) {
        setCanProceed(false);
        setMessage('Error checking limits. Please try again.');
        console.error('Limit check error:', error);
      } finally {
        setChecking(false);
      }
    };

    checkLimits();
  }, [videoType, getUsage, canStart, getTypeName]);

  if (checking) {
    return (
      <Card className="p-4">
        <CardContent>
          <p className="text-sm text-muted-foreground">Checking limits...</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-2">
      <Card className={`p-4 ${canProceed ? 'border-green-200 bg-green-50' : 'border-red-200 bg-red-50'}`}>
        <CardContent>
          <p className={`text-sm ${canProceed ? 'text-green-800' : 'text-red-800'}`}>
            {message}
          </p>
        </CardContent>
      </Card>
      
      {onProceed && (
        <Button
          onClick={onProceed}
          disabled={!canProceed}
          className="w-full"
          variant={canProceed ? "default" : "destructive"}
        >
          {canProceed ? `Start ${getTypeName({ type: videoType })}` : 'Limit Exceeded'}
        </Button>
      )}
    </div>
  );
}