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
    variationsCount: number;
}

export function ClickatronHistory() {
  const [history, setHistory] = useState<HistoryItem[]>([]);
  const [currentPage, setCurrentPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [total, setTotal] = useState(0);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();
  const pageSize = 10;



  const fetchHistory = async (page: number) => {
    try {
      setIsLoading(true);
      const offset = (page - 1) * pageSize;
      const response = await fetch(`/api/services/clickatron/history?limit=${pageSize}&offset=${offset}`);
      if (!response.ok) {
        throw new Error('Failed to fetch history');
      }
      const data = await response.json();
      setHistory(data.history);
      setTotal(data.total);
      setTotalPages(Math.ceil(data.total / pageSize));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An unknown error occurred');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchHistory(currentPage);
  }, [currentPage]);

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
          <span className="text-xs text-zinc-500">Showing {history.length} of {total} sessions</span>
        )}
      </div>

      <motion.div
        variants={staggerChildren}
        initial="initial"
        animate="animate"
        className="grid gap-4 grid-cols-1"
      >
        {history.map((item) => (
          <motion.div key={item.sessionId} variants={fadeIn}>
            <Card className="group bg-zinc-900/40 border-zinc-800/60 hover:border-purple-600/50 hover:bg-zinc-900/60 transition-all duration-300 cursor-pointer h-full flex flex-col relative overflow-hidden" onClick={() => router.push(`/dashboard/clickatron/lab/${item.sessionId}`)}>
              <div className="absolute inset-0 bg-gradient-to-br from-purple-900/10 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300"></div>
              <CardContent className="p-4 flex flex-col flex-1 justify-between relative z-10">
                <div className="space-y-2">
                  <h3 className="font-semibold text-zinc-100 text-sm line-clamp-2 group-hover:text-white transition-colors">
                    {item.title}
                  </h3>
                  <div className="flex items-center justify-between text-xs text-zinc-400">
                    <div className="flex items-center gap-1.5">
                      <div className="p-0.5 bg-purple-900/20 rounded-full">
                        <Image className="h-3 w-3 text-purple-400" />
                      </div>
                      <span>{item.variationsCount} variations</span>
                    </div>
                    <div className="flex items-center gap-1.5">
                      <div className="p-0.5 bg-zinc-700/50 rounded-full">
                        <Clock className="h-3 w-3 text-zinc-500" />
                      </div>
                      <span>{formatTimeAgo(item.updatedAt)}</span>
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
          </motion.div>
        ))}
      </motion.div>

      {totalPages > 1 && (
        <div className="flex items-center justify-center space-x-2 mt-8">
          <Button
            variant="outline"
            size="sm"
            onClick={() => setCurrentPage(prev => Math.max(prev - 1, 1))}
            disabled={currentPage === 1}
            className="h-8 w-8 p-0"
          >
            <ArrowRight className="h-4 w-4 rotate-180" />
          </Button>
          {Array.from({ length: totalPages }, (_, i) => i + 1).map(page => (
            <Button
              key={page}
              variant={currentPage === page ? "default" : "outline"}
              size="sm"
              onClick={() => setCurrentPage(page)}
              className="h-8 w-8"
            >
              {page}
            </Button>
          ))}
          <Button
            variant="outline"
            size="sm"
            onClick={() => setCurrentPage(prev => Math.min(prev + 1, totalPages))}
            disabled={currentPage === totalPages}
            className="h-8 w-8 p-0"
          >
            <ArrowRight className="h-4 w-4" />
          </Button>
        </div>
      )}
    </motion.div>
  );
}