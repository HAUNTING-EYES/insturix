"use client";

import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Dialog, DialogContent } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { 
  X, 
  Calendar, 
  MapPin, 
  Users, 
  Sparkles,
  Trophy, 
  Zap,
  ArrowRight,
  Star,
  Music,
  Camera,
  Gamepad2,
  Heart
} from 'lucide-react';
import { useRouter } from 'next/navigation';

interface ICS25PopupProps {
  isOpen: boolean;
  onClose: () => void;
}

export default function ICS25Popup({ isOpen, onClose }: ICS25PopupProps) {
  const router = useRouter();

  const handleLearnMore = () => {
    onClose();
    router.push('/ics25');
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-4xl w-full max-h-[90vh] p-0 overflow-hidden border-0 bg-transparent">
        <motion.div
          initial={{ opacity: 0, scale: 0.95, y: 10 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.95, y: 10 }}
          transition={{ duration: 0.3, ease: "easeOut" }}
          className="relative bg-white dark:bg-zinc-900 backdrop-blur-xl rounded-2xl border border-zinc-200 dark:border-zinc-800 shadow-2xl overflow-hidden max-h-[90vh] flex flex-col"
        >
          {/* Subtle mesh gradient background */}
          <div className="absolute inset-0 opacity-50">
            <div className="absolute inset-0 bg-gradient-to-br from-blue-50/30 via-transparent to-purple-50/30 dark:from-blue-950/20 dark:via-transparent dark:to-purple-950/20" />
            <div className="absolute top-0 right-0 w-96 h-96 bg-gradient-to-bl from-cyan-100/20 via-transparent to-transparent dark:from-cyan-900/10 rounded-full blur-3xl" />
            <div className="absolute bottom-0 left-0 w-96 h-96 bg-gradient-to-tr from-purple-100/20 via-transparent to-transparent dark:from-purple-900/10 rounded-full blur-3xl" />
          </div>

          <div className="relative z-10 p-8 md:p-12 overflow-y-auto max-h-[80vh]">
            {/* Header */}
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.1, duration: 0.4 }}
              className="text-center mb-8"
            >
              {/* Date Badge */}
              <motion.div
                initial={{ opacity: 0, scale: 0.9 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={{ delay: 0.2 }}
                className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-zinc-100 dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 mb-6"
              >
                <Calendar className="w-4 h-4 text-zinc-600 dark:text-zinc-400" />
                <span className="text-zinc-700 dark:text-zinc-300 font-medium text-sm">Mid November (TBA)</span>
              </motion.div>

              {/* Main Title */}
              <motion.h1
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.3, duration: 0.4 }}
                className="text-4xl md:text-5xl font-bold mb-4 text-zinc-900 dark:text-zinc-100"
              >
                ICS'25
              </motion.h1>

              <motion.h2
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.4, duration: 0.4 }}
                className="text-xl md:text-2xl font-semibold text-zinc-700 dark:text-zinc-300 mb-2"
              >
                Insturix Creator's Summit 2025
              </motion.h2>

              <motion.p
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.5, duration: 0.4 }}
                className="text-lg text-zinc-600 dark:text-zinc-400 mb-8"
              >
                Where Creators Collide, Collaborate & Create Magic
              </motion.p>
            </motion.div>

            {/* Key Highlights */}
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.6, duration: 0.4 }}
              className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8"
            >
              {[
                {
                  icon: Users,
                  title: "Creator Passes",
                  description: "Exclusive access for 10k+ followers"
                },
                {
                  icon: Trophy,
                  title: "Live Competitions",
                  description: "Reel-making & speed editing challenges"
                },
                {
                  icon: Zap,
                  title: "AI Tools Showcase",
                  description: "Clickatron, Editron & more live demos"
                }
              ].map((item, index) => (
                <motion.div
                  key={index}
                  initial={{ opacity: 0, y: 20, scale: 0.95 }}
                  animate={{ opacity: 1, y: 0, scale: 1 }}
                  transition={{ delay: 0.7 + (index * 0.1), duration: 0.4 }}
                  className="relative group"
                >
                  <div className="relative p-6 rounded-xl bg-zinc-50 dark:bg-zinc-800/50 border border-zinc-200 dark:border-zinc-700/50 hover:border-zinc-300 dark:hover:border-zinc-600 transition-all duration-300 hover:shadow-lg">
                    <div className="inline-flex p-3 rounded-lg bg-zinc-900 dark:bg-zinc-100 mb-4">
                      <item.icon className="w-6 h-6 text-white dark:text-zinc-900" />
                    </div>
                    <h3 className="text-zinc-900 dark:text-zinc-100 font-semibold text-lg mb-2">{item.title}</h3>
                    <p className="text-zinc-600 dark:text-zinc-400 text-sm">{item.description}</p>
                  </div>
                </motion.div>
              ))}
            </motion.div>

            {/* Exciting Features */}
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 1.0, duration: 0.4 }}
              className="mb-8"
            >
              <h3 className="text-zinc-900 dark:text-zinc-100 font-semibold text-xl mb-4 text-center">What Awaits You</h3>
              <div className="flex flex-wrap justify-center gap-3">
                {[
                  { icon: Camera, text: "30min Collab Challenge" },
                  { icon: Music, text: "Live Performances" },
                  { icon: Gamepad2, text: "Gaming/Esports Zone" },
                  { icon: Heart, text: "Fan Meet & Greets" },
                  { icon: Star, text: "Creator Awards Night" }
                ].map((item, index) => (
                  <motion.div
                    key={index}
                    initial={{ opacity: 0, scale: 0.9 }}
                    animate={{ opacity: 1, scale: 1 }}
                    transition={{ delay: 1.1 + (index * 0.05), duration: 0.3 }}
                    className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-zinc-100 dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700"
                  >
                    <item.icon className="w-4 h-4 text-zinc-600 dark:text-zinc-400" />
                    <span className="text-zinc-700 dark:text-zinc-300 text-sm font-medium">{item.text}</span>
                  </motion.div>
                ))}
              </div>
            </motion.div>

            {/* Special Promotion */}
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 1.3, duration: 0.4 }}
              className="text-center bg-gradient-to-r from-blue-50 to-purple-50 dark:from-blue-950/20 dark:to-purple-950/20 rounded-xl p-6 border border-blue-200 dark:border-blue-800/30 mb-8"
            >
              <div className="flex items-center justify-center gap-2 mb-3">
                <Sparkles className="w-5 h-5 text-blue-600 dark:text-blue-400" />
                <span className="text-blue-700 dark:text-blue-300 font-semibold">Special Offer</span>
              </div>
              <p className="text-zinc-800 dark:text-zinc-200 mb-2">
                <span className="font-semibold">Get discounts</span> by creating a promotional reel!
              </p>
              <p className="text-zinc-600 dark:text-zinc-400 text-sm">
                Tag us and use <span className="font-mono bg-zinc-200 dark:bg-zinc-700 px-2 py-1 rounded text-xs">#ICS25</span> <span className="font-mono bg-zinc-200 dark:bg-zinc-700 px-2 py-1 rounded text-xs">#insturix</span>
              </p>
            </motion.div>

            {/* Action Buttons */}
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 1.5, duration: 0.4 }}
              className="flex flex-col sm:flex-row gap-4 justify-center"
            >
              <Button
                onClick={handleLearnMore}
                className="px-8 py-3 bg-zinc-900 dark:bg-zinc-100 hover:bg-zinc-800 dark:hover:bg-zinc-200 text-white dark:text-zinc-900 font-semibold rounded-xl shadow-lg hover:shadow-xl transition-all duration-300 transform hover:scale-105"
              >
                <span>Learn More & Register</span>
                <ArrowRight className="w-5 h-5 ml-2" />
              </Button>
              
              <Button
                variant="outline"
                onClick={onClose}
                className="px-8 py-3 border-zinc-300 dark:border-zinc-600 text-zinc-700 dark:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-800 rounded-xl font-semibold transition-all duration-300"
              >
                Maybe Later
              </Button>
            </motion.div>

            {/* Venue Info */}
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 1.7, duration: 0.4 }}
              className="text-center mt-6"
            >
              <div className="inline-flex items-center gap-2 text-zinc-500 dark:text-zinc-400 text-sm">
                <MapPin className="w-4 h-4" />
                <span>Venue TBD • More details coming soon</span>
              </div>
            </motion.div>
          </div>
        </motion.div>
      </DialogContent>
    </Dialog>
  );
}