"use client";

import React from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { AlertTriangle, Crown, Zap, Shield, RefreshCw } from 'lucide-react';
import { useRouter } from 'next/navigation';

interface UsageLimitPopupProps {
  isOpen: boolean;
  onClose: () => void;
  limitType: 'total' | 'long_video' | 'general';
  currentUsage?: number;
  maxUsage?: number;
}

const LIMIT_CONTENT = {
  total: {
    title: "Weekly Analysis Limit Exceeded",
    icon: AlertTriangle,
    description: "You've exhausted your weekly video analysis quota. Your creative potential is being throttled.",
    consequence: "No more insights until next week reset"
  },
  long_video: {
    title: "Long Video Limit Reached",
    icon: RefreshCw,
    description: "You've hit your weekly limit for videos over 20 minutes. Extended content analysis is restricted.",
    consequence: "Try shorter videos or upgrade"
  },
  general: {
    title: "Usage Limit Exceeded",
    icon: Shield,
    description: "You've reached a usage limit that's blocking your progress.",
    consequence: "Upgrade to continue your work"
  }
};

export function UsageLimitPopup({ isOpen, onClose, limitType, currentUsage, maxUsage }: UsageLimitPopupProps) {
  const router = useRouter();
  const content = LIMIT_CONTENT[limitType];
  const Icon = content.icon;

  const handleUpgrade = () => {
    onClose();
    router.push('/upgrade');
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-md bg-gradient-to-br from-red-950/90 via-black to-red-950/90 border-red-900/50 text-white backdrop-blur-xl">
        <div className="absolute inset-0 bg-gradient-to-br from-red-600/10 via-transparent to-orange-600/10 pointer-events-none" />
        
        <DialogHeader className="relative z-10">
          <motion.div
            initial={{ scale: 0.8, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            transition={{ duration: 0.3 }}
            className="flex flex-col items-center text-center space-y-4"
          >
            <motion.div
              animate={{ 
                rotate: [0, -5, 5, -5, 0],
                scale: [1, 1.1, 1]
              }}
              transition={{ 
                duration: 2,
                repeat: Infinity,
                repeatDelay: 3
              }}
              className="p-4 rounded-full bg-red-600/20 border border-red-500/30"
            >
              <Icon className="w-12 h-12 text-red-400" />
            </motion.div>

            <DialogTitle className="text-2xl font-bold text-red-100 tracking-tight">
              {content.title}
            </DialogTitle>
          </motion.div>
        </DialogHeader>

        <motion.div
          initial={{ y: 20, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          transition={{ delay: 0.2, duration: 0.4 }}
          className="relative z-10 space-y-6"
        >
          <div className="text-center space-y-3">
            <p className="text-red-200/90 text-sm leading-relaxed">
              {content.description}
            </p>
            
            {currentUsage !== undefined && maxUsage !== undefined && (
              <div className="bg-red-900/30 border border-red-700/50 rounded-lg p-3">
                <div className="text-xs text-red-300 mb-1">Current Usage</div>
                <div className="text-lg font-bold text-red-100">
                  {currentUsage}/{maxUsage}
                </div>
              </div>
            )}

            <div className="bg-black/40 border border-red-800/50 rounded-lg p-3">
              <div className="text-xs text-red-400 font-medium mb-1">CONSEQUENCE</div>
              <div className="text-sm text-red-200">
                {content.consequence}
              </div>
            </div>
          </div>

          <div className="border-t border-red-800/30 pt-4 space-y-4">
            <motion.div
              initial={{ x: -20, opacity: 0 }}
              animate={{ x: 0, opacity: 1 }}
              transition={{ delay: 0.4, duration: 0.4 }}
              className="bg-gradient-to-r from-purple-600/20 to-blue-600/20 border border-purple-500/30 rounded-lg p-4"
            >
              <div className="flex items-center gap-3 mb-2">
                <Crown className="w-5 h-5 text-yellow-400" />
                <span className="font-semibold text-purple-200">Upgrade to Premium</span>
              </div>
              <ul className="text-xs text-purple-200/80 space-y-1">
                <li>• Unlimited video analyses</li>
                <li>• Priority processing queue</li>
                <li>• Extended video support (up to 2 hours)</li>
                <li>• Advanced AI insights</li>
              </ul>
            </motion.div>

            <motion.div
              initial={{ x: 20, opacity: 0 }}
              animate={{ x: 0, opacity: 1 }}
              transition={{ delay: 0.6, duration: 0.4 }}
              className="bg-green-900/20 border border-green-700/50 rounded-lg p-3 text-center"
            >
              <div className="text-xs text-green-400 font-medium mb-1">FREE TRIAL GUARANTEE</div>
              <div className="text-xs text-green-200">
                Cancel within the first week for a <span className="font-semibold">full refund</span> - no questions asked
              </div>
            </motion.div>
          </div>

          <div className="flex gap-3">
            <Button
              variant="outline"
              onClick={onClose}
              className="flex-1 border-red-700/50 bg-red-900/20 text-red-200 hover:bg-red-800/30 hover:text-red-100"
            >
              Maybe Later
            </Button>
            <Button
              onClick={handleUpgrade}
              className="flex-1 bg-gradient-to-r from-purple-600 to-blue-600 hover:from-purple-700 hover:to-blue-700 text-white font-semibold shadow-lg"
            >
              <Crown className="w-4 h-4 mr-2" />
              Upgrade Now
            </Button>
          </div>
        </motion.div>
      </DialogContent>
    </Dialog>
  );
}