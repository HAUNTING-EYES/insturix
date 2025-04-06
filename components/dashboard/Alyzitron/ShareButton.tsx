"use client";

import React, { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Share2, Check } from 'lucide-react';

interface ShareButtonProps {
  analysisId: string;
}

export function ShareButton({ analysisId }: ShareButtonProps) {
  const [copied, setCopied] = useState(false);

  const handleShare = async () => {
    const url = `${window.location.origin}/dashboard/alyzitron/report/${analysisId}`;

    if (navigator.share) {
      try {
        await navigator.share({
          title: 'Video Analysis Report',
          text: 'Check out this video analysis report',
          url,
        });
      } catch (error) {
        if ((error as Error).name !== 'AbortError') {
          // Fall back to clipboard copy
          await copyToClipboard(url);
        }
      }
    } else {
      // If Web Share API is not available, copy to clipboard
      await copyToClipboard(url);
    }
  };

  const copyToClipboard = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (error) {
      console.error('Failed to copy:', error);
    }
  };

  return (
    <Button
      variant="ghost"
      size="sm"
      onClick={handleShare}
      className="text-zinc-400 hover:text-zinc-300"
    >
      {copied ? (
        <>
          <Check className="h-4 w-4 mr-2" />
          Copied!
        </>
      ) : (
        <>
          <Share2 className="h-4 w-4 mr-2" />
          Share Report
        </>
      )}
    </Button>
  );
}