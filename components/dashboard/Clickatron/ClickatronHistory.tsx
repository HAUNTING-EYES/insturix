"use client";

import React, { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Clock, Image, ArrowRight, Loader2 } from 'lucide-react';
import { useRouter } from 'next/navigation';

const fadeIn = {
  initial: { opacity: 0, y: 20 },
  animate: { opacity: 1, y: 0 },
  transition: { duration: 0.4, ease: "easeOut" as any }
};

const staggerChildren = {
  animate: {
    transition: {
      staggerChildren: 0.1
    }
  }
};

function formatTimeAgo(dateString: string): string {
  const date = new Date(dateString);
  const now = new Date();
  const diff = now.getTime() - date.getTime();
  
  const minutes = Math.floor(diff / (1000 * 60));
  const hours = Math.floor(diff / (1000 * 60 * 60));
  const days = Math.floor(diff / (1000 * 60 * 60 * 24));
  
  if (days > 0) return `${days}d ago`;
  if (hours > 0) return `${hours}h ago`;
  if (minutes > 0) return `${minutes}m ago`;
  return 'Just now';
}

interface HistoryItem {
    sessionId: string;
    title: string;
    updatedAt: string;
}

export function ClickatronHistory() {
  const [history, setHistory] = useState<HistoryItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();

  useEffect(() => {
    const fetchHistory = async () => {
      try {
        const response = await fetch('/api/services/clickatron/history');
        if (!response.ok) {
          throw new Error('Failed to fetch history');
        }
        const data = await response.json();
        setHistory(data.history);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'An unknown error occurred');
      } finally {
        setIsLoading(false);
      }
    };

    fetchHistory();
  }, []);

  if (isLoading) {
    return (
      <motion.div {...fadeIn} className="text-center py-12">
        <Loader2 className="h-8 w-8 mx-auto mb-4 animate-spin text-purple-400" />
        <p className="text-zinc-400">Loading your thumbnail history...</p>
      </motion.div>
    );
  }

  if (error) {
    return (
      <motion.div {...fadeIn} className="text-center py-12">
        <div className="text-zinc-500 mb-4">
          <Image className="h-12 w-12 mx-auto mb-4 opacity-50" />
          <p>Failed to load history. Please try again.</p>
        </div>
      </motion.div>
    );
  }

  if (!history || history.length === 0) {
    return (
      <motion.div {...fadeIn} className="text-center py-12">
        <div className="text-zinc-500 mb-4">
          <Image className="h-12 w-12 mx-auto mb-4 opacity-50" />
          <p>Your clickatron sessions will appear here</p>
        </div>
      </motion.div>
    );
  }

  return (
    <motion.div {...fadeIn} className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-4">
        <h2 className="text-xl font-semibold text-zinc-100 flex items-center gap-2">
          <Clock className="h-5 w-5 text-zinc-400" />
          Past Sessions
        </h2>
        {history && history.length > 0 && (
          <span className="text-xs text-zinc-500">Showing {history.length} session{history.length>1?'s':''}</span>
        )}
      </div>

      <motion.div
        variants={staggerChildren}
        initial="initial"
        animate="animate"
        className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3"
      >
        {history && history.map((item) => (
          <motion.div key={item.sessionId} variants={fadeIn}>
            <Card className="group bg-zinc-900/40 border-zinc-800/60 hover:border-purple-600/50 transition-all duration-200 cursor-pointer" onClick={() => router.push(`/dashboard/clickatron/lab/${item.sessionId}`)}>
              <CardContent className="p-4">
                <div className="aspect-video bg-zinc-800/50 rounded-lg mb-3 overflow-hidden flex items-center justify-center text-xs text-zinc-500">
                  Past Sessions
                </div>

                <div className="space-y-2">
                  <h3 className="font-medium text-zinc-200 text-sm line-clamp-2 group-hover:text-zinc-100 transition-colors">
                    {item.title}
                  </h3>

                  <div className="flex items-center justify-between text-xs">
                    <span className="text-zinc-500">
                      {formatTimeAgo(item.updatedAt)}
                    </span>
                  </div>
                </div>

                <Button
                  variant="ghost"
                  size="sm"
                  className="w-full mt-3 text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800/50"
                  onClick={(e) => {
                    e.stopPropagation();
                    router.push(`/dashboard/clickatron/lab/${item.sessionId}`);
                  }}
                >
                  Open Session
                  <ArrowRight className="h-3 w-3 ml-1" />
                </Button>
              </CardContent>
            </Card>
          </motion.div>
        ))}
      </motion.div>
    </motion.div>
  );
}