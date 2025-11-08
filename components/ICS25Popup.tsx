"use client";

import React from 'react';
import { motion } from 'framer-motion';
import { Dialog, DialogContent } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { 
  Calendar, 
  MapPin, 
  Users, 
  Sparkles,
  Trophy, 
  Zap,
  ArrowRight,
  Play,
  Mic,
  Cpu,
  Mic2,
  Award,
  Handshake,
  X,
  Lightbulb,
  Users2,
  Flame,
  Music
} from 'lucide-react';
import { useRouter } from 'next/navigation';

interface ICS25PopupProps {
  isOpen: boolean;
  onClose: () => void;
}

export default function ICS25Popup({ isOpen, onClose }: ICS25PopupProps) {
  const router = useRouter();

  const goToICS25 = () => {
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
          className="relative rounded-2xl shadow-2xl overflow-hidden max-h-[90vh] flex flex-col"
        >
          {/* Premium ICS'25 backdrop with glass-morphism */}
          <div className="absolute inset-0">
            <div className="absolute inset-0 bg-[#0A0A0C]" />
            <div className="absolute inset-0 bg-gradient-to-br from-sky-500/10 via-transparent to-fuchsia-400/10" />
            <div className="absolute -top-20 -right-20 w-[520px] h-[520px] rounded-full bg-sky-500/15 blur-3xl" />
            <div className="absolute -bottom-24 -left-24 w-[520px] h-[520px] rounded-full bg-fuchsia-500/15 blur-3xl" />
            <div className="absolute inset-0 bg-gradient-radial from-white/10 via-transparent to-transparent" />
          </div>

          <div className="relative z-10 p-6 md:p-10 overflow-y-auto max-h-[80vh] border border-white/15 rounded-2xl m-2 md:m-3 bg-white/[0.03] backdrop-blur-2xl shadow-[0_8px_32px_0_rgba(0,0,0,0.37)]">
            {/* Close Button */}
            <button
              onClick={onClose}
              className="absolute top-4 right-4 p-2 rounded-lg hover:bg-white/10 transition-colors duration-200 z-50"
              aria-label="Close popup"
            >
              <X className="w-6 h-6 text-white/70 hover:text-white" />
            </button>

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
                className="inline-flex items-center gap-3 mb-6"
              >
                <div className="inline-flex items-center gap-2 px-4 py-2.5 rounded-full bg-white/[0.08] border border-white/20 text-white backdrop-blur-md shadow-lg">
                  <Calendar className="w-4 h-4 text-white/90" />
                  <span className="font-semibold text-sm">Nov 22, 2025</span>
                </div>
                <div className="inline-flex items-center gap-2 px-4 py-2.5 rounded-full bg-white/[0.08] border border-white/20 text-white backdrop-blur-md shadow-lg">
                  <MapPin className="w-4 h-4 text-white/90" />
                  <span className="font-semibold text-sm">IIIT Delhi</span>
                </div>
              </motion.div>

              {/* Main Title */}
              <motion.h1
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.3, duration: 0.4 }}
                className="text-4xl md:text-5xl font-black mb-3 bg-clip-text text-transparent bg-gradient-to-r from-[#3A9EFF] via-[#7AB8FF] to-[#FF2EE6] drop-shadow-[0_6px_30px_rgba(58,158,255,0.25)]"
              >
                ICS&apos;25
              </motion.h1>

              <motion.h2
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.4, duration: 0.4 }}
                className="text-xl md:text-2xl font-semibold text-white/90 mb-2"
              >
                Insturix Creator&apos;s Summit 2025
              </motion.h2>

              <motion.p
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.5, duration: 0.4 }}
                className="text-lg md:text-xl text-white/70 mb-8 font-light"
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
                  title: "ICS25 Passes",
                  description: "various tiers of passes for attendees and creators"
                },
                {
                  icon: Trophy,
                  title: "Live Competitions",
                  description: "Reel-making battles & speed editing showdowns"
                },
                {
                  icon: Zap,
                  title: "AI Tools Showcase",
                  description: "Editron, Alyzitron, Musitron & ThinkForge live demos"
                }
              ].map((item, index) => (
                <motion.div
                  key={index}
                  initial={{ opacity: 0, y: 20, scale: 0.95 }}
                  animate={{ opacity: 1, y: 0, scale: 1 }}
                  transition={{ delay: 0.7 + (index * 0.1), duration: 0.4 }}
                  className="relative group"
                >
                  <div className="relative p-6 rounded-xl bg-white/[0.04] border border-white/15 hover:border-white/30 transition-all duration-300 hover:shadow-[0_0_30px_rgba(58,158,255,0.25)] backdrop-blur-sm hover:bg-white/[0.06]">
                    <div className="inline-flex p-3 rounded-lg bg-gradient-to-br from-white to-white/90 text-black mb-4 shadow-md">
                      <item.icon className="w-6 h-6" />
                    </div>
                    <h3 className="text-white font-bold text-lg mb-2">{item.title}</h3>
                    <p className="text-white/80 text-sm leading-relaxed">{item.description}</p>
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
              <h3 className="text-white font-bold text-xl mb-5 text-center">What Awaits You</h3>
              <div className="flex flex-wrap justify-center gap-3">
                {[
                  { icon: Play, text: "Reel-Making Battles" },
                  { icon: Sparkles, text: "Speed Editing Showdown" },
                  { icon: Mic, text: "Talent Showdown" },
                  { icon: Cpu, text: "ThinkForge Ideation" },
                  { icon: Mic2, text: "Creator Panels" },
                  { icon: Award, text: "Creator Awards" },
                  { icon: Handshake, text: "Networking Zones" }
                ].map((item, index) => (
                  <motion.div
                    key={index}
                    initial={{ opacity: 0, scale: 0.9 }}
                    animate={{ opacity: 1, scale: 1 }}
                    transition={{ delay: 1.1 + (index * 0.05), duration: 0.3 }}
                    className="inline-flex items-center gap-2 px-4 py-2.5 rounded-full bg-white/[0.08] border border-white/20 backdrop-blur-sm hover:bg-white/[0.12] hover:border-white/30 transition-all duration-200"
                  >
                    <item.icon className="w-4 h-4 text-white/90" />
                    <span className="text-white/90 text-sm font-semibold">{item.text}</span>
                  </motion.div>
                ))}
              </div>
            </motion.div>

            {/* ICS25 Passes Showcase */}
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 1.2, duration: 0.4 }}
              className="mb-8"
            >
              <h3 className="text-white font-bold text-xl mb-5 text-center">Available Passes</h3>
              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
                {/* Bronze Pass */}
                <motion.div
                  initial={{ opacity: 0, scale: 0.9 }}
                  animate={{ opacity: 1, scale: 1 }}
                  transition={{ delay: 1.25, duration: 0.3 }}
                  className="group relative rounded-xl overflow-hidden p-[1px] bg-gradient-to-br from-amber-600/35 via-white/20 to-amber-800/35"
                >
                  <div className="relative h-full rounded-[10px] border border-white/10 bg-white/60 dark:bg-zinc-950/60 backdrop-blur-xl p-3 flex flex-col items-center justify-center min-h-24">
                    <div aria-hidden className="pointer-events-none absolute inset-0 rounded-[10px] [mask-image:radial-gradient(200px_120px_at_0%_0%,rgba(255,255,255,0.15),transparent)]" />
                    <span className="text-sm font-bold text-zinc-900 dark:text-zinc-100 relative z-10">Bronze</span>
                  </div>
                </motion.div>

                {/* Silver Pass */}
                <motion.div
                  initial={{ opacity: 0, scale: 0.9 }}
                  animate={{ opacity: 1, scale: 1 }}
                  transition={{ delay: 1.3, duration: 0.3 }}
                  className="group relative rounded-xl overflow-hidden p-[1px] bg-gradient-to-br from-white/65 via-white/20 to-gray-200/85"
                >
                  <div className="relative h-full rounded-[10px] border border-white/10 bg-white/60 dark:bg-zinc-950/60 backdrop-blur-xl p-3 flex flex-col items-center justify-center min-h-24">
                    <div aria-hidden className="pointer-events-none absolute inset-0 rounded-[10px] [mask-image:radial-gradient(200px_120px_at_0%_0%,rgba(255,255,255,0.15),transparent)]" />
                    <span className="text-sm font-bold text-zinc-900 dark:text-zinc-100 relative z-10">Silver</span>
                  </div>
                </motion.div>

                {/* Gold Pass */}
                <motion.div
                  initial={{ opacity: 0, scale: 0.9 }}
                  animate={{ opacity: 1, scale: 1 }}
                  transition={{ delay: 1.35, duration: 0.3 }}
                  className="group relative rounded-xl overflow-hidden p-[1px] bg-gradient-to-br from-yellow-400/35 via-white/20 to-yellow-600/35"
                >
                  <div className="relative h-full rounded-[10px] border border-white/10 bg-white/60 dark:bg-zinc-950/60 backdrop-blur-xl p-3 flex flex-col items-center justify-center min-h-24">
                    <div aria-hidden className="pointer-events-none absolute inset-0 rounded-[10px] [mask-image:radial-gradient(200px_120px_at_0%_0%,rgba(255,255,255,0.15),transparent)]" />
                    <span className="text-sm font-bold text-zinc-900 dark:text-zinc-100 relative z-10">Gold</span>
                  </div>
                </motion.div>

                {/* Platinum Pass */}
                <motion.div
                  initial={{ opacity: 0, scale: 0.9 }}
                  animate={{ opacity: 1, scale: 1 }}
                  transition={{ delay: 1.4, duration: 0.3 }}
                  className="group relative rounded-xl overflow-hidden p-[1px] bg-gradient-to-br from-zinc-900/50 via-zinc-800/30 to-black/50"
                >
                  <div className="relative h-full rounded-[10px] border border-white/10 bg-white/60 dark:bg-zinc-950/60 backdrop-blur-xl p-3 flex flex-col items-center justify-center min-h-24">
                    {/* Platinum-specific metallic shine */}
                    <div aria-hidden className="pointer-events-none absolute inset-0 rounded-[10px] bg-gradient-to-br from-white/20 via-white/5 to-transparent opacity-60" />
                    <div aria-hidden className="pointer-events-none absolute inset-0 rounded-[10px] [mask-image:radial-gradient(200px_120px_at_0%_0%,rgba(255,255,255,0.25),transparent)]" />
                    <span className="text-sm font-bold text-zinc-900 dark:text-zinc-100 relative z-10">Platinum</span>
                  </div>
                </motion.div>

                {/* Creators Pass */}
                <motion.div
                  initial={{ opacity: 0, scale: 0.9 }}
                  animate={{ opacity: 1, scale: 1 }}
                  transition={{ delay: 1.45, duration: 0.3 }}
                  className="group relative rounded-xl overflow-hidden p-[1px] bg-gradient-to-br from-red-500/35 via-white/20 to-red-700/35"
                >
                  <div className="relative h-full rounded-[10px] border border-white/10 bg-white/60 dark:bg-zinc-950/60 backdrop-blur-xl p-3 flex flex-col items-center justify-center min-h-24">
                    <div aria-hidden className="pointer-events-none absolute inset-0 rounded-[10px] [mask-image:radial-gradient(200px_120px_at_0%_0%,rgba(255,255,255,0.15),transparent)]" />
                    <span className="text-sm font-bold text-zinc-900 dark:text-zinc-100 relative z-10">Creators</span>
                  </div>
                </motion.div>
              </div>
            </motion.div>

            {/* Why Attend Teaser */}
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 1.3, duration: 0.4 }}
              className="text-center mb-8"
            >
              <h3 className="text-white font-bold text-xl mb-5">Why ICS'25?</h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="bg-white/[0.04] border border-white/15 rounded-xl p-5 backdrop-blur-sm hover:bg-white/[0.06] hover:border-white/25 transition-all duration-300 flex flex-col items-center text-center">
                  <div className="flex items-center justify-center gap-2 mb-3">
                    <Lightbulb className="w-5 h-5 text-[#3A9EFF]" />
                    <div className="text-white font-bold text-lg">Innovation Hub</div>
                  </div>
                  <div className="text-white/85 text-sm leading-relaxed">Experience cutting-edge AI tools live – Editron, Alyzitron, Musitron, ThinkForge.</div>
                </div>
                <div className="bg-white/[0.04] border border-white/15 rounded-xl p-5 backdrop-blur-sm hover:bg-white/[0.06] hover:border-white/25 transition-all duration-300 flex flex-col items-center text-center">
                  <div className="flex items-center justify-center gap-2 mb-3">
                    <Users2 className="w-5 h-5 text-[#7AB8FF]" />
                    <div className="text-white font-bold text-lg">Creator Community</div>
                  </div>
                  <div className="text-white/85 text-sm leading-relaxed">Connect with 800+ creators, brands, and fans in structured networking.</div>
                </div>
                <div className="bg-white/[0.04] border border-white/15 rounded-xl p-5 backdrop-blur-sm hover:bg-white/[0.06] hover:border-white/25 transition-all duration-300 flex flex-col items-center text-center">
                  <div className="flex items-center justify-center gap-2 mb-3">
                    <Flame className="w-5 h-5 text-orange-400" />
                    <div className="text-white font-bold text-lg">Epic Competitions</div>
                  </div>
                  <div className="text-white/85 text-sm leading-relaxed">Reel battles, speed edits, live competitions, and creator awards night.</div>
                </div>
                <div className="bg-white/[0.04] border border-white/15 rounded-xl p-5 backdrop-blur-sm hover:bg-white/[0.06] hover:border-white/25 transition-all duration-300 flex flex-col items-center text-center">
                  <div className="flex items-center justify-center gap-2 mb-3">
                    <Music className="w-5 h-5 text-fuchsia-400" />
                    <div className="text-white font-bold text-lg">Unforgettable Vibes</div>
                  </div>
                  <div className="text-white/85 text-sm leading-relaxed">Talks, panels, talent showcase, and exclusive merch.</div>
                </div>
              </div>
            </motion.div>

            {/* Action Buttons */}
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 1.4, duration: 0.4 }}
              className="flex flex-col sm:flex-row gap-4 justify-center"
            >
              <Button
                onClick={goToICS25}
                className="px-8 py-3.5 bg-gradient-to-r from-white to-white/95 text-black hover:from-white/95 hover:to-white/90 font-bold rounded-xl shadow-lg hover:shadow-[0_0_30px_rgba(58,158,255,0.4)] transition-all duration-300 transform hover:scale-[1.03] text-base"
              >
                <span>Go to ICS25</span>
                <ArrowRight className="w-5 h-5 ml-2" />
              </Button>
            </motion.div>
          </div>
        </motion.div>
      </DialogContent>
    </Dialog>
  );
}