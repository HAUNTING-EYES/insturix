"use client";

import React from 'react';
import { motion } from 'framer-motion';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Clock, Image, ArrowRight, Loader2 } from 'lucide-react';
import { useUserHistory } from '@/hooks/useUserHistory';
import { useClickatronSessions } from '@/hooks/useClickatronSessions';
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

function formatTimeAgo(timestamp: number): string {
  const now = Date.now();
  const diff = now - timestamp;
  
  const minutes = Math.floor(diff / (1000 * 60));
  const hours = Math.floor(diff / (1000 * 60 * 60));
  const days = Math.floor(diff / (1000 * 60 * 60 * 24));
  
  if (days > 0) return `${days}d ago`;
  if (hours > 0) return `${hours}h ago`;
  if (minutes > 0) return `${minutes}m ago`;
  return 'Just now';
}

export function Clickatron2History() {
  const { data: history, isLoading, error } = useUserHistory();
  const { data: localSessions, loading: localLoading } = useClickatronSessions();
  const router = useRouter();

  if (isLoading || localLoading) {
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

  if ((!history || history.length === 0) && (!localSessions || localSessions.length === 0)) {
    return (
      <motion.div {...fadeIn} className="text-center py-12">
        <div className="text-zinc-500 mb-4">
          <Image className="h-12 w-12 mx-auto mb-4 opacity-50" />
          <p>Your thumbnail history will appear here</p>
        </div>
      </motion.div>
    );
  }

  return (
    <motion.div {...fadeIn} className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-4">
        <h2 className="text-xl font-semibold text-zinc-100 flex items-center gap-2">
          <Clock className="h-5 w-5 text-zinc-400" />
          Recent Thumbnails
        </h2>
        {localSessions && localSessions.length > 0 && (
          <span className="text-xs text-zinc-500">Showing {localSessions.length} local session{localSessions.length>1?'s':''}</span>
        )}
      </div>

      <motion.div 
        variants={staggerChildren}
        initial="initial"
        animate="animate"
        className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3"
      >
        {localSessions && localSessions.map(sess => (
          <motion.div key={sess.id} variants={fadeIn}>
            <Card className="group bg-zinc-900/40 border-zinc-800/60 hover:border-purple-600/50 transition-all duration-200 cursor-pointer" onClick={() => router.push(`/dashboard/clickatron2/lab/${sess.taskId}`)}>
              <CardContent className="p-4">
                <div className="aspect-video bg-zinc-800/50 rounded-lg mb-3 overflow-hidden flex items-center justify-center text-xs text-zinc-500">
                  {sess.selectedDirection ? 'Canvas Ready' : 'Ideation'}
                </div>
                <div className="space-y-2">
                  <h3 className="font-medium text-zinc-200 text-sm line-clamp-2 group-hover:text-zinc-100 transition-colors">
                    {sess.videoIdea}
                  </h3>
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-purple-400 bg-purple-500/10 px-2 py-1 rounded">
                      {sess.presetName || 'Preset'}
                    </span>
                    <span className="text-zinc-500">
                      {formatTimeAgo(sess.timestamp)}
                    </span>
                  </div>
                </div>
                <Button variant="ghost" size="sm" className="w-full mt-3 text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800/50">
                  Open
                  <ArrowRight className="h-3 w-3 ml-1" />
                </Button>
              </CardContent>
            </Card>
          </motion.div>
        ))}
  {history && history.map((item) => (
          <motion.div key={item.id} variants={fadeIn}>
            <Card className="group bg-zinc-900/40 border-zinc-800/60 hover:border-zinc-700/80 transition-all duration-200 cursor-pointer">
              <CardContent className="p-4">
                <div className="aspect-video bg-zinc-800/50 rounded-lg mb-3 overflow-hidden">
                  {item.thumbnail ? (
                    <img 
                      src={item.thumbnail} 
                      alt={item.name}
                      className="w-full h-full object-cover"
                    />
                  ) : (
                    <div className="w-full h-full bg-gradient-to-br from-purple-500/20 to-blue-500/20 flex items-center justify-center">
                      <Image className="h-8 w-8 text-zinc-500" />
                    </div>
                  )}
                </div>
                
                <div className="space-y-2">
                  <h3 className="font-medium text-zinc-200 text-sm line-clamp-2 group-hover:text-zinc-100 transition-colors">
                    {item.name}
                  </h3>
                  
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-purple-400 bg-purple-500/10 px-2 py-1 rounded">
                      {item.preset}
                    </span>
                    <span className="text-zinc-500">
                      {formatTimeAgo(item.timestamp)}
                    </span>
                  </div>
                </div>

                <Button 
                  variant="ghost" 
                  size="sm" 
                  className="w-full mt-3 text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800/50"
                >
                  View Details
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